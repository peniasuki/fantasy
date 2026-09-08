import { NextResponse } from "next/server";
import { emptyLineup, isValidLineup, type FormationId } from "fantasy-rules";
import { requireUser } from "@/lib/auth";
import {
  getMasterCalendar,
  isPastLockAt,
  nextUnscoredMatchday,
} from "@/lib/calendar";
import { db } from "@/lib/firebase-admin";
import { LEAGUE_ID, getLeague, requireMember, settingsOf } from "@/lib/league";

async function lineupLockState() {
  const scoredSnap = await db()
    .collection("leagues")
    .doc(LEAGUE_ID)
    .collection("scoredJornadas")
    .get();
  const scored = scoredSnap.docs.map((d) => Number(d.id)).filter(Number.isFinite);
  const upcoming = nextUnscoredMatchday(scored, getMasterCalendar());
  if (!upcoming) {
    return { locked: true, lockAt: null as string | null, matchday: null as number | null };
  }
  const locked = isPastLockAt(upcoming.lockAt);
  return { locked, lockAt: upcoming.lockAt, matchday: upcoming.number };
}

export async function GET() {
  try {
    const user = await requireUser();
    await requireMember(user.uid);
    const [ownedSnap, playersSnap, lineupSnap, lock] = await Promise.all([
      db().collection("leagues").doc(LEAGUE_ID).collection("ownership").where("ownerId", "==", user.uid).get(),
      db().collection("players").get(),
      db().collection("leagues").doc(LEAGUE_ID).collection("lineups").doc(user.uid).get(),
      lineupLockState(),
    ]);
    const players = Object.fromEntries(playersSnap.docs.map((d) => [d.id, d.data()]));
    const squad = ownedSnap.docs.map((d) => {
      const own = d.data();
      return { ...own, player: players[own.playerId] };
    });
    return NextResponse.json({
      squad,
      lineup: lineupSnap.data() ?? { formation: "4-3-3", slots: emptyLineup("4-3-3") },
      locked: lock.locked,
      lockAt: lock.lockAt,
      lockMatchday: lock.matchday,
      firstKickoff: null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "ERROR";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const user = await requireUser();
    await requireMember(user.uid);
    const league = await getLeague();
    const settings = settingsOf(league);
    const body = (await request.json()) as {
      formation: FormationId;
      slots: { slot: number; position: "GK" | "DF" | "MF" | "FW"; playerId: string | null }[];
    };
    const lock = await lineupLockState();
    if (lock.locked) {
      return NextResponse.json(
        {
          error: lock.matchday
            ? `Alineación bloqueada para la jornada ${lock.matchday}.`
            : "Alineación bloqueada.",
        },
        { status: 400 },
      );
    }
    const owned = await db()
      .collection("leagues")
      .doc(LEAGUE_ID)
      .collection("ownership")
      .where("ownerId", "==", user.uid)
      .get();
    const ownedIds = new Set(owned.docs.map((d) => d.data().playerId));
    if (ownedIds.size > settings.maxSquadSize) {
      return NextResponse.json({ error: "Plantilla demasiado grande." }, { status: 400 });
    }
    const playerSnaps = await Promise.all(
      [...ownedIds].map((id) => db().collection("players").doc(id).get()),
    );
    const positions = Object.fromEntries(
      playerSnaps.filter((s) => s.exists).map((s) => [s.id, s.data()!.position]),
    );
    const alignable = Object.fromEntries(
      playerSnaps.filter((s) => s.exists).map((s) => {
        const p = s.data()!;
        const ok = p.alignable !== false && !p.injured && !p.suspended;
        return [s.id, ok];
      }),
    );
    for (const slot of body.slots) {
      if (slot.playerId && !ownedIds.has(slot.playerId)) {
        return NextResponse.json({ error: "Solo puedes alinear jugadores de tu plantilla." }, { status: 400 });
      }
    }
    const check = isValidLineup(body.formation, body.slots, positions, alignable);
    if (!check.ok) {
      return NextResponse.json({ error: check.reason }, { status: 400 });
    }
    await db().collection("leagues").doc(LEAGUE_ID).collection("lineups").doc(user.uid).set({
      uid: user.uid,
      formation: body.formation,
      slots: body.slots,
      updatedAt: Date.now(),
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "ERROR";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
