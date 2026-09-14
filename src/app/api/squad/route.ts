import { NextResponse } from "next/server";
import {
  canPatchLockedLineup,
  emptyLineup,
  isValidLineup,
  sanitizeLineupSlots,
  sellLockedUntil,
  type FormationId,
  type LineupSlot,
  type Ownership,
} from "fantasy-rules";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/firebase-admin";
import { LEAGUE_ID, getLeague, requireMember, settingsOf } from "@/lib/league";
import { getLineupLockState } from "@/lib/lineup-lock";

export async function GET() {
  try {
    const user = await requireUser();
    await requireMember(user.uid);
    const league = await getLeague();
    const settings = settingsOf(league);
    const now = Date.now();
    const [ownedSnap, playersSnap, lineupSnap, lock] = await Promise.all([
      db().collection("leagues").doc(LEAGUE_ID).collection("ownership").where("ownerId", "==", user.uid).get(),
      db().collection("players").get(),
      db().collection("leagues").doc(LEAGUE_ID).collection("lineups").doc(user.uid).get(),
      getLineupLockState(),
    ]);
    const players = Object.fromEntries(
      playersSnap.docs.map((d) => {
        const data = d.data();
        return [d.id, { ...data, vm: data.currentPrice ?? data.vm ?? 0 }];
      }),
    );
    const membersSnap = await db().collection("leagues").doc(LEAGUE_ID).collection("members").get();
    const rivals = membersSnap.docs
      .filter((d) => d.id !== user.uid)
      .map((d) => ({ uid: d.id, displayName: d.data().displayName ?? d.id }));
    const squad = ownedSnap.docs.map((d) => {
      const own = d.data();
      const ownership = {
        playerId: String(own.playerId),
        ownerId: String(own.ownerId),
        buyPrice: Number(own.buyPrice ?? 0),
        boughtAt: Number(own.boughtAt ?? 0),
        acquiredVia: own.acquiredVia,
      } as Ownership;
      const lockedUntil = sellLockedUntil(ownership, settings);
      return {
        playerId: ownership.playerId,
        buyPrice: ownership.buyPrice,
        boughtAt: ownership.boughtAt,
        acquiredVia: ownership.acquiredVia ?? null,
        sellLockedUntil: lockedUntil,
        sellLocked: lockedUntil != null && now < lockedUntil,
        player: players[ownership.playerId],
      };
    });
    const rawLineup = lineupSnap.data() ?? { formation: "4-3-3", slots: emptyLineup("4-3-3") };
    const slots = ((rawLineup.slots ?? []) as LineupSlot[]).map((s) => ({
      slot: s.slot,
      position: s.position,
      playerId: s.playerId ?? null,
      clauseFillable: Boolean(s.clauseFillable) && !s.playerId,
    }));
    return NextResponse.json({
      squad,
      rivals,
      lineup: { formation: rawLineup.formation ?? "4-3-3", slots },
      locked: lock.locked,
      lockAt: lock.lockAt,
      lockMatchday: lock.matchday,
      lockSource: lock.source,
      autoLock: lock.autoLock,
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
      slots: LineupSlot[];
    };
    const lock = await getLineupLockState();
    const lineupRef = db().collection("leagues").doc(LEAGUE_ID).collection("lineups").doc(user.uid);
    const currentSnap = await lineupRef.get();
    const current = currentSnap.data() ?? { formation: "4-3-3", slots: emptyLineup("4-3-3") };
    const previousSlots = (current.slots ?? []) as LineupSlot[];
    const previousFormation = (current.formation ?? "4-3-3") as FormationId;

    if (lock.locked) {
      const patch = canPatchLockedLineup({
        previousFormation,
        previousSlots,
        nextFormation: body.formation,
        nextSlots: body.slots,
      });
      if (!patch.ok) {
        return NextResponse.json({ error: patch.reason }, { status: 400 });
      }
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
    const slots = sanitizeLineupSlots(body.slots);
    await lineupRef.set({
      uid: user.uid,
      formation: body.formation,
      slots,
      updatedAt: Date.now(),
    });
    return NextResponse.json({
      ok: true,
      lockedPatch: lock.locked,
      message: lock.locked ? "Suplente alineado en hueco de clausulazo." : undefined,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "ERROR";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
