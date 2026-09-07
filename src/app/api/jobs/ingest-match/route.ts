import { NextResponse } from "next/server";
import { mapApiFootballStats, scoreEstadisticas, type Position } from "fantasy-rules";
import { jobsAuthorized, requireUser } from "@/lib/auth";
import { footballFetch, type FootballResponse } from "@/lib/api-football";
import { db } from "@/lib/firebase-admin";
import { LEAGUE_ID, footballBudget, getLeague, isAdmin, settingsOf } from "@/lib/league";

type PlayerStat = {
  team: { id: number };
  players: {
    player: { id: number; name: string };
    statistics: {
      games: { minutes: number | null; position: string | null; rating: string | null };
      goals: { total: number | null; assists: number | null; conceded: number | null; saves: number | null };
      shots: { total: number | null; on: number | null };
      fouls: { drawn: number | null; committed: number | null };
      tackles: { total: number | null; interceptions: number | null };
      dribbles: { success: number | null };
      passes: { total: number | null; key: number | null };
      cards: { yellow: number | null; red: number | null };
      penalty: { scored: number | null; missed: number | null; saved: number | null };
    }[];
  }[];
};

function mapPosition(raw: string | null): Position {
  const value = (raw || "").toLowerCase();
  if (value.includes("goal")) return "GK";
  if (value.includes("defen") || value.includes("back")) return "DF";
  if (value.includes("mid")) return "MF";
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
    const league = await getLeague();
    const settings = settingsOf(league);
    const fixturesSnap = await db().collection("fixtures").get();
    const finished = fixturesSnap.docs
      .map((d) => ({ id: d.id, ...(d.data() as { status?: string; round?: string }) }))
      .filter((f) => ["FT", "AET", "PEN"].includes(String(f.status)));
    const scoredSnap = await db().collection("leagues").doc(LEAGUE_ID).collection("playerScores").get();
    const already = new Set(scoredSnap.docs.map((d) => d.data().fixtureId));
    const pending = finished.filter((f) => !already.has(f.id)).slice(0, 8);
    const budget = await footballBudget();
    let ingested = 0;
    const pointsByPlayer: Record<string, { points: number; fixtureId: string }> = {};

    for (const fixture of pending) {
      const payload = await footballFetch<FootballResponse<PlayerStat[]>>(
        "fixtures/players",
        { fixture: fixture.id },
        budget,
      );
      for (const teamBlock of payload.response) {
        for (const row of teamBlock.players) {
          const raw = row.statistics[0];
          if (!raw) continue;
          const position = mapPosition(raw.games?.position ?? null);
          const stats = mapApiFootballStats(position, raw);
          const scored = scoreEstadisticas(stats);
          const id = `${fixture.id}_${row.player.id}`;
          await db()
            .collection("leagues")
            .doc(LEAGUE_ID)
            .collection("playerScores")
            .doc(id)
            .set({
              id,
              fixtureId: String(fixture.id),
              playerId: String(row.player.id),
              round: fixture.round,
              stats,
              points: scored.points,
              breakdown: scored.breakdown,
              scoringSystem: "stats",
            });
          pointsByPlayer[String(row.player.id)] = { points: scored.points, fixtureId: String(fixture.id) };
        }
      }
      ingested += 1;
    }

    if (ingested === 0) {
      return NextResponse.json({ ok: true, ingested: 0, pending: 0 });
    }
    const members = await db().collection("leagues").doc(LEAGUE_ID).collection("members").get();
    const lineupSnaps = await db().collection("leagues").doc(LEAGUE_ID).collection("lineups").get();
    const lineups = Object.fromEntries(lineupSnaps.docs.map((d) => [d.id, d.data()]));
    const roundScores: { uid: string; points: number }[] = [];
    for (const member of members.docs) {
      const lineup = lineups[member.id];
      const slots = (lineup?.slots ?? []) as { playerId: string | null }[];
      const points = slots.reduce((sum, slot) => {
        if (!slot.playerId) return sum;
        return sum + (pointsByPlayer[slot.playerId]?.points ?? 0);
      }, 0);
      roundScores.push({ uid: member.id, points });
    }
    roundScores.sort((a, b) => a.points - b.points);
    const mvpUid = [...roundScores].sort((a, b) => b.points - a.points)[0]?.uid;
    for (let i = 0; i < roundScores.length; i += 1) {
      const row = roundScores[i];
      const bonus = row.points * settings.bonusPerPoint + (row.uid === mvpUid ? settings.bonusMvp : 0);
      await db()
        .collection("leagues")
        .doc(LEAGUE_ID)
        .collection("members")
        .doc(row.uid)
        .update({
          points: (members.docs.find((d) => d.id === row.uid)?.data().points ?? 0) + row.points,
          balance: (members.docs.find((d) => d.id === row.uid)?.data().balance ?? 0) + bonus,
        });
      await db()
        .collection("leagues")
        .doc(LEAGUE_ID)
        .collection("matchdayScores")
        .doc(`${Date.now()}_${row.uid}`)
        .set({ uid: row.uid, points: row.points, bonus, at: Date.now() });
    }

    return NextResponse.json({ ok: true, ingested, pending: pending.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : "ERROR";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
