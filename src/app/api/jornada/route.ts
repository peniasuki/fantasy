import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/firebase-admin";
import { LEAGUE_ID, requireMember } from "@/lib/league";

export async function GET() {
  try {
    const user = await requireUser();
    await requireMember(user.uid);
    const [fixturesSnap, scoresSnap, membersSnap] = await Promise.all([
      db().collection("fixtures").orderBy("timestamp", "asc").get(),
      db().collection("leagues").doc(LEAGUE_ID).collection("matchdayScores").get(),
      db().collection("leagues").doc(LEAGUE_ID).collection("members").get(),
    ]);
    return NextResponse.json({
      fixtures: fixturesSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
      scores: scoresSnap.docs.map((d) => d.data()),
      members: membersSnap.docs.map((d) => d.data()),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "ERROR";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
