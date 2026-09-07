import { NextResponse } from "next/server";
import { requireJobOrAdmin } from "@/lib/auth";
import { footballFetch, type FootballResponse } from "@/lib/api-football";
import { db } from "@/lib/firebase-admin";
import { footballBudget } from "@/lib/league";

type Fixture = {
  fixture: {
    id: number;
    timestamp: number;
    status: { short: string };
  };
  league: { round: string };
  teams: { home: { id: number; name: string; logo: string }; away: { id: number; name: string; logo: string } };
  goals: { home: number | null; away: number | null };
};

export async function POST(request: Request) {
  try {
    await requireJobOrAdmin(request);
    const leagueId = Number(process.env.LALIGA_ID || 140);
    const season = Number(process.env.SEASON || 2024);
    const data = await footballFetch<FootballResponse<Fixture[]>>(
      "fixtures",
      { league: leagueId, season },
      await footballBudget(),
    );
    const batch = db().batch();
    for (const row of data.response) {
      const ref = db().collection("fixtures").doc(String(row.fixture.id));
      batch.set(ref, {
        id: String(row.fixture.id),
        timestamp: row.fixture.timestamp,
        status: row.fixture.status.short,
        round: row.league.round,
        home: row.teams.home,
        away: row.teams.away,
        goals: row.goals,
      });
    }
    await batch.commit();
    return NextResponse.json({ ok: true, fixtures: data.response.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : "ERROR";
    const status = message === "UNAUTHENTICATED" ? 401 : message.startsWith("Forbidden") ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
