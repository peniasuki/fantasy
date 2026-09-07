import { FieldValue } from "firebase-admin/firestore";
import { NextResponse } from "next/server";
import { baseMarketValue, type Position } from "fantasy-rules";
import { jobsAuthorized, requireUser } from "@/lib/auth";
import { footballFetch, type FootballResponse } from "@/lib/api-football";
import { db } from "@/lib/firebase-admin";
import { footballBudget, isAdmin } from "@/lib/league";

type Team = { team: { id: number; name: string; logo: string } };
type PlayerRow = {
  player: { id: number; name: string; photo: string };
  statistics: {
    games: { position: string | null; rating: string | null };
    goals: { total: number | null; assists: number | null };
    team: { id: number };
  }[];
};

function mapPosition(raw: string | null): Position {
  const value = (raw || "").toLowerCase();
  if (value.includes("goal")) return "GK";
  if (value.includes("defen") || value.includes("back")) return "DF";
  if (value.includes("mid") || value.includes("wing")) return "MF";
  return "FW";
}

export async function POST(request: Request) {
  try {
    const okJob = jobsAuthorized(request);
    if (!okJob) {
      const user = await requireUser();
      if (!(await isAdmin(user.uid))) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }
    const url = new URL(request.url);
    const resumeAfter = url.searchParams.get("after") || "";
    const maxTeams = Number(url.searchParams.get("maxTeams") || 6);
    const leagueId = Number(process.env.LALIGA_ID || 140);
    const season = Number(process.env.SEASON || 2026);
    const budget = await footballBudget();
    const teams = await footballFetch<FootballResponse<Team[]>>(
      "teams",
      { league: leagueId, season },
      budget,
    );
    let imported = 0;
    let lastTeam = "";
    const selected = teams.response.filter((row) => !resumeAfter || String(row.team.id) > resumeAfter).slice(0, maxTeams);
    for (const row of selected) {
      await db().collection("teams").doc(String(row.team.id)).set({
        id: row.team.id,
        name: row.team.name,
        logo: row.team.logo,
      });
      let page = 1;
      let pages = 1;
      while (page <= pages) {
        const players = await footballFetch<FootballResponse<PlayerRow[]>>(
          "players",
          { team: row.team.id, season, page },
          budget,
        );
        pages = players.paging?.total ?? 1;
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
                updatedAt: Date.now(),
              },
              { merge: true },
            );
          imported += 1;
        }
        page += 1;
      }
      lastTeam = String(row.team.id);
    }
    await db().collection("system").doc("catalog").set({
      imported,
      at: FieldValue.serverTimestamp(),
      season,
    });
    return NextResponse.json({
      ok: true,
      imported,
      teams: selected.length,
      lastTeam,
      remaining: teams.response.length - teams.response.findIndex((t) => String(t.team.id) === lastTeam) - 1,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "ERROR";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
