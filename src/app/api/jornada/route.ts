import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { currentMatchdayByDate, getMasterCalendar } from "@/lib/calendar";
import { db } from "@/lib/firebase-admin";
import { LEAGUE_ID, requireMember } from "@/lib/league";

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    await requireMember(user.uid);
    const url = new URL(request.url);
    const calendar = getMasterCalendar();
    const defaultMd = currentMatchdayByDate(calendar);
    const requested = Number(url.searchParams.get("matchday") || defaultMd.number);
    const matchdayMeta = calendar.matchdays.find((m) => m.number === requested) ?? defaultMd;
    const matchday = matchdayMeta.number;

    const leagueRef = db().collection("leagues").doc(LEAGUE_ID);
    const [jpSnap, scoredSnap, ownershipSnap, membersSnap, matchdayScoresSnap] = await Promise.all([
      leagueRef.collection("jpMatchdays").doc(String(matchday)).get(),
      leagueRef.collection("scoredJornadas").get(),
      leagueRef.collection("ownership").get(),
      leagueRef.collection("members").get(),
      leagueRef.collection("matchdayScores").where("matchday", "==", matchday).get(),
    ]);

    const ownership = Object.fromEntries(
      ownershipSnap.docs.map((d) => {
        const data = d.data();
        return [String(data.playerId), String(data.ownerId)];
      }),
    );
    const members = Object.fromEntries(
      membersSnap.docs.map((d) => [
        d.id,
        {
          uid: d.id,
          displayName: d.data().displayName ?? d.id,
        },
      ]),
    );

    const scoredNumbers = scoredSnap.docs.map((d) => Number(d.id)).filter(Number.isFinite);
    const scored = scoredNumbers.includes(matchday);
    const jpData = jpSnap.data();

    // Si aún no hay puntos JP, partidos desde calendario maestro (sin goles ni jugadores).
    const matches =
      jpData?.matches ??
      matchdayMeta.matches.map((m, index) => ({
        index,
        home: m.home.name,
        away: m.away.name,
        homeGoals: null,
        awayGoals: null,
        kickoff: null,
        players: [],
      }));

    return NextResponse.json({
      matchday,
      matchdayMeta: {
        number: matchdayMeta.number,
        name: matchdayMeta.name,
        startsOn: matchdayMeta.startsOn,
        lockAt: matchdayMeta.lockAt,
      },
      currentMatchday: defaultMd.number,
      scored,
      scoredMatchdays: scoredNumbers.sort((a, b) => a - b),
      matchdays: calendar.matchdays.map((m) => ({
        number: m.number,
        name: m.name,
        startsOn: m.startsOn,
        scored: scoredNumbers.includes(m.number),
      })),
      matches,
      ownership,
      members,
      managerScores: matchdayScoresSnap.docs.map((d) => d.data()),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "ERROR";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
