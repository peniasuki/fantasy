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
 * Deja la clasificación de managers a 0 para arrancar en J5.
 * Revierte bonus de saldo de matchdayScores previos a managerScoringFromMatchday
 * y borra esos registros. No toca puntos Casa/Fuera/Total del catálogo.
 */
export async function POST(request: Request) {
  try {
    await requireJobOrAdmin(request);
    const league = await getLeague();
    if (!league) {
      return NextResponse.json({ error: "No hay liga." }, { status: 404 });
    }
    const settings = settingsOf(league);
    const from = settings.managerScoringFromMatchday ?? DEFAULT_SETTINGS.managerScoringFromMatchday;
    const leagueRef = db().collection("leagues").doc(LEAGUE_ID);
    const [membersSnap, scoresSnap] = await Promise.all([
      leagueRef.collection("members").get(),
      leagueRef.collection("matchdayScores").get(),
    ]);

    const bonusByUid: Record<string, number> = {};
    const writes: Array<(batch: WriteBatch) => void> = [];
    let deletedScores = 0;

    for (const doc of scoresSnap.docs) {
      const row = doc.data() as { matchday?: number; uid?: string; bonus?: number };
      const md = Number(row.matchday);
      if (!Number.isFinite(md) || md >= from) continue;
      const uid = String(row.uid || "");
      if (uid) bonusByUid[uid] = (bonusByUid[uid] ?? 0) + Number(row.bonus ?? 0);
      writes.push((batch) => batch.delete(doc.ref));
      deletedScores += 1;
    }

    let membersReset = 0;
    for (const doc of membersSnap.docs) {
      const data = doc.data();
      const bonus = bonusByUid[doc.id] ?? 0;
      writes.push((batch) =>
        batch.set(
          doc.ref,
          {
            points: 0,
            balance: Number(data.balance ?? 0) - bonus,
          },
          { merge: true },
        ),
      );
      membersReset += 1;
    }

    // Persistir el umbral en settings de la liga por si no estaba.
    writes.push((batch) =>
      batch.set(
        leagueRef,
        {
          settings: {
            ...settings,
            managerScoringFromMatchday: from,
          },
        },
        { merge: true },
      ),
    );

    await commitInChunks(writes);

    return NextResponse.json({
      ok: true,
      managerScoringFromMatchday: from,
      membersReset,
      deletedMatchdayScores: deletedScores,
      message: `Clasificación a 0. Los managers suman desde la jornada ${from}.`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "ERROR";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
