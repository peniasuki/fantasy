import { NextResponse } from "next/server";
import type { WriteBatch } from "firebase-admin/firestore";
import { DEFAULT_SETTINGS } from "fantasy-rules";
import { requireJobOrAdmin } from "@/lib/auth";
import { db } from "@/lib/firebase-admin";
import { LEAGUE_ID, getLeague, settingsOf } from "@/lib/league";

const BATCH_LIMIT = 400;

async function commitInChunks(writes: Array<(batch: WriteBatch) => void>) {
  for (let i = 0; i < writes.length; i += BATCH_LIMIT) {
    const batch = db().batch();
    for (const write of writes.slice(i, i + BATCH_LIMIT)) write(batch);
    await batch.commit();
  }
}

/**
 * Recalcula saldo = presupuesto inicial − Σ buyPrice de plantilla + primas de jornada.
 * Asume que las compras se pagaron al precio guardado en ownership.buyPrice (importe de puja).
 * No reconstruye historial de ventas ya liquidadas fuera de ownership; si hubo ventas,
 * el saldo puede necesitar ajuste manual.
 */
export async function POST(request: Request) {
  try {
    await requireJobOrAdmin(request);
    const league = await getLeague();
    if (!league) return NextResponse.json({ error: "No hay liga." }, { status: 404 });
    const settings = settingsOf(league);
    const initial = settings.initialBalance ?? DEFAULT_SETTINGS.initialBalance;
    const leagueRef = db().collection("leagues").doc(LEAGUE_ID);

    const [membersSnap, ownedSnap, scoresSnap] = await Promise.all([
      leagueRef.collection("members").get(),
      leagueRef.collection("ownership").get(),
      leagueRef.collection("matchdayScores").get(),
    ]);

    const spendByUid: Record<string, number> = {};
    const playersByUid: Record<string, number> = {};
    for (const doc of ownedSnap.docs) {
      const row = doc.data();
      const uid = String(row.ownerId ?? "");
      if (!uid) continue;
      spendByUid[uid] = (spendByUid[uid] ?? 0) + Number(row.buyPrice ?? 0);
      playersByUid[uid] = (playersByUid[uid] ?? 0) + 1;
    }

    const bonusByUid: Record<string, number> = {};
    for (const doc of scoresSnap.docs) {
      const row = doc.data();
      const uid = String(row.uid ?? "");
      if (!uid) continue;
      bonusByUid[uid] = (bonusByUid[uid] ?? 0) + Number(row.bonus ?? 0);
    }

    const now = Date.now();
    const writes: Array<(batch: WriteBatch) => void> = [];
    const updates: Array<{
      uid: string;
      displayName: string;
      previousBalance: number;
      nextBalance: number;
      spend: number;
      bonus: number;
      players: number;
    }> = [];

    for (const doc of membersSnap.docs) {
      const data = doc.data();
      const spend = spendByUid[doc.id] ?? 0;
      const bonus = bonusByUid[doc.id] ?? 0;
      const nextBalance = initial - spend + bonus;
      const previousBalance = Number(data.balance ?? 0);
      updates.push({
        uid: doc.id,
        displayName: String(data.displayName ?? doc.id),
        previousBalance,
        nextBalance,
        spend,
        bonus,
        players: playersByUid[doc.id] ?? 0,
      });
      writes.push((batch) => batch.set(doc.ref, { balance: nextBalance }, { merge: true }));
    }

    writes.push((batch) =>
      batch.set(leagueRef.collection("activity").doc(`reconcile_balances_${now}`), {
        type: "reconcile_balances",
        at: now,
        initialBalance: initial,
        members: updates.length,
        updates,
      }),
    );

    await commitInChunks(writes);

    return NextResponse.json({
      ok: true,
      initialBalance: initial,
      membersUpdated: updates.length,
      updates,
      message: "Saldos recalculados: inicial − Σ pujas (buyPrice) + primas.",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "ERROR";
    const status = message === "UNAUTHENTICATED" ? 401 : message.startsWith("Forbidden") ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
