import { FieldValue } from "firebase-admin/firestore";
import { NextResponse } from "next/server";
import { baseMarketValue, type Position } from "fantasy-rules";
import { requireJobOrAdmin } from "@/lib/auth";
import { footballFetch, type FootballResponse } from "@/lib/api-football";
import { db } from "@/lib/firebase-admin";
import { footballBudget } from "@/lib/league";

type Team = { team: { id: number; name: string; logo: string } };
type PlayerRow = {
  player: { id: number; name: string; photo: string };
  statistics: {
    games: { position: string | null; rating: string | null };
    goals: { total: number | null; assists: number | null };
    team: { id: number };
  }[];
};

/** Plan Free de API-Football: page máximo 3 (~60 jugadores/equipo). */
const FREE_MAX_PAGE = Number(process.env.API_FOOTBALL_MAX_PAGE || 3);

function mapPosition(raw: string | null): Position {
  const value = (raw || "").toLowerCase();
  if (value.includes("goal")) return "GK";
  if (value.includes("defen") || value.includes("back")) return "DF";
  if (value.includes("mid") || value.includes("wing")) return "MF";
  return "FW";
}

function errorStatus(error: unknown): number {
  if (error && typeof error === "object" && "status" in error && typeof (error as { status: unknown }).status === "number") {
    return (error as { status: number }).status;
  }
  const message = error instanceof Error ? error.message : "";
  if (message === "UNAUTHENTICATED") return 401;
  if (message.startsWith("Forbidden")) return 403;
  return 500;
}

export async function POST(request: Request) {
  try {
    await requireJobOrAdmin(request);
    const url = new URL(request.url);
    const maxTeams = Number(url.searchParams.get("maxTeams") || 5);
    const leagueId = Number(process.env.LALIGA_ID || 140);
    const season = Number(process.env.SEASON || 2024);
    const budget = await footballBudget();

    const progressRef = db().collection("system").doc("catalog");
    const progressSnap = await progressRef.get();
    const savedAfter = String(progressSnap.data()?.lastTeam || "");
    const resumeAfter = url.searchParams.get("after") ?? savedAfter;

    const teams = await footballFetch<FootballResponse<Team[]>>(
      "teams",
      { league: leagueId, season },
      budget,
    );
    if (!teams.response?.length) {
      return NextResponse.json(
        {
          error: `API-Football no devolvió equipos (liga ${leagueId}, temporada ${season}). El plan Free solo cubre hasta 2024.`,
          season,
          leagueId,
        },
        { status: 502 },
      );
    }

    const ordered = [...teams.response].sort((a, b) => a.team.id - b.team.id);
    const selected = ordered
      .filter((row) => !resumeAfter || String(row.team.id) > resumeAfter)
      .slice(0, maxTeams);

    if (!selected.length) {
      return NextResponse.json({
        ok: true,
        imported: 0,
        teams: 0,
        lastTeam: resumeAfter,
        season,
        remaining: 0,
        message: "Catálogo completo para esta temporada (no quedan equipos).",
      });
    }

    let imported = 0;
    let lastTeam = resumeAfter;
    const truncatedTeams: string[] = [];
    const teamNames: string[] = [];

    for (const row of selected) {
      await db().collection("teams").doc(String(row.team.id)).set({
        id: row.team.id,
        name: row.team.name,
        logo: row.team.logo,
        season,
      });
      let page = 1;
      let pages = 1;
      let capped = false;
      while (page <= pages && page <= FREE_MAX_PAGE) {
        const players = await footballFetch<FootballResponse<PlayerRow[]>>(
          "players",
          { team: row.team.id, season, page },
          budget,
        );
        pages = players.paging?.total ?? 1;
        if (pages > FREE_MAX_PAGE) capped = true;
        for (const item of players.response) {
          const stats = item.statistics[0];
          const position = mapPosition(stats?.games?.position ?? null);
          const vm = baseMarketValue({
            position,
            minutes: 0,
            goals: stats?.goals?.total ?? 0,
            assists: stats?.goals?.assists ?? 0,
            rating: stats?.games?.rating ? Number(stats.games.rating) : null,
          });
          await db()
            .collection("players")
            .doc(String(item.player.id))
            .set(
              {
                id: String(item.player.id),
                name: item.player.name,
                photo: item.player.photo,
                teamId: String(row.team.id),
                teamName: row.team.name,
                position,
                vm,
                season,
                updatedAt: Date.now(),
              },
              { merge: true },
            );
          imported += 1;
        }
        page += 1;
      }
      if (capped) truncatedTeams.push(row.team.name);
      lastTeam = String(row.team.id);
      teamNames.push(row.team.name);
    }

    const remaining = Math.max(
      0,
      ordered.length - ordered.findIndex((t) => String(t.team.id) === lastTeam) - 1,
    );

    await progressRef.set(
      {
        imported,
        at: FieldValue.serverTimestamp(),
        season,
        lastTeam,
        remaining,
        truncatedTeams,
      },
      { merge: true },
    );

    return NextResponse.json({
      ok: true,
      imported,
      teams: selected.length,
      teamNames,
      lastTeam,
      season,
      remaining,
      maxPage: FREE_MAX_PAGE,
      truncatedTeams,
      hint:
        remaining > 0
          ? `Sigue pulsando Importar: quedan ${remaining} equipos (reanuda tras ${lastTeam}).`
          : "Todos los equipos procesados.",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "ERROR";
    return NextResponse.json({ error: message }, { status: errorStatus(error) });
  }
}
