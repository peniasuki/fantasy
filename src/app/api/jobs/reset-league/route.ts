import { NextResponse } from "next/server";
import type { WriteBatch } from "firebase-admin/firestore";
import { DEFAULT_SETTINGS, emptyLineup, formatMoney } from "fantasy-rules";
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
 * Restablece la liga al estado inicial de mercado:
 * - Todos los jugadores fichados vuelven libres a su VM actual.
 * - Managers a presupuesto inicial (40M) y 0 puntos.
 * - Limpia ownership, pujas, ofertas, listados de venta y alineaciones.
 * Conserva catálogo de jugadores (VM/puntos JP) y calendario.
 */
export async function POST(request: Request) {
  try {
    await requireJobOrAdmin(request);
    const league = await getLeague();
    if (!league) return NextResponse.json({ error: "No hay liga." }, { status: 404 });

    const settings = settingsOf(league);
    const initialBalance = settings.initialBalance ?? DEFAULT_SETTINGS.initialBalance;
    const leagueRef = db().collection("leagues").doc(LEAGUE_ID);
    const now = Date.now();

    const [
      membersSnap,
      ownershipSnap,
      listingsSnap,
      bidsSnap,
      offersSnap,
      lineupsSnap,
      saleEventsSnap,
      matchdayScoresSnap,
      playersSnap,
    ] = await Promise.all([
      leagueRef.collection("members").get(),
      leagueRef.collection("ownership").get(),
      leagueRef.collection("listings").get(),
      leagueRef.collection("bids").get(),
      leagueRef.collection("offers").get(),
      leagueRef.collection("lineups").get(),
      leagueRef.collection("saleEvents").get(),
      leagueRef.collection("matchdayScores").get(),
      db().collection("players").get(),
    ]);

    const writes: Array<(batch: WriteBatch) => void> = [];

    for (const doc of ownershipSnap.docs) {
      writes.push((batch) => batch.delete(doc.ref));
    }
    for (const doc of listingsSnap.docs) {
      writes.push((batch) => batch.delete(doc.ref));
    }
    for (const doc of bidsSnap.docs) {
      writes.push((batch) => batch.delete(doc.ref));
    }
    for (const doc of offersSnap.docs) {
      writes.push((batch) => batch.delete(doc.ref));
    }
    for (const doc of saleEventsSnap.docs) {
      writes.push((batch) => batch.delete(doc.ref));
    }
    for (const doc of matchdayScoresSnap.docs) {
      writes.push((batch) => batch.delete(doc.ref));
    }

    for (const doc of membersSnap.docs) {
      writes.push((batch) =>
        batch.set(
          doc.ref,
          {
            balance: initialBalance,
            points: 0,
          },
          { merge: true },
        ),
      );
    }

    for (const doc of lineupsSnap.docs) {
      writes.push((batch) =>
        batch.set(
          doc.ref,
          {
            uid: doc.id,
            formation: "4-3-3",
            slots: emptyLineup("4-3-3"),
            updatedAt: now,
          },
          { merge: true },
        ),
      );
    }

    let listed = 0;
    for (const doc of playersSnap.docs) {
      const data = doc.data();
      if (data.active === false) continue;
      const playerId = doc.id;
      const askPrice = Number(data.currentPrice ?? data.vm ?? 0);
      const listingId = `fa_${playerId}`;
      writes.push((batch) =>
        batch.set(leagueRef.collection("listings").doc(listingId), {
          id: listingId,
          playerId,
          sellerId: "machine",
          askPrice,
          listedAt: now,
          expiresAt: now + 3650 * 24 * 60 * 60 * 1000,
          kind: "free_agent",
        }),
      );
      // Limpia historial de traspasos entre managers (arranque limpio).
      writes.push((batch) =>
        batch.set(
          doc.ref,
          {
            lastTransferPrice: null,
            lastTransferAt: null,
            lastTransferFrom: null,
            lastTransferTo: null,
            updatedAt: now,
          },
          { merge: true },
        ),
      );
      listed += 1;
    }

    writes.push((batch) =>
      batch.set(leagueRef.collection("activity").doc(`reset_league_${now}`), {
        type: "league_reset",
        at: now,
        initialBalance,
        membersReset: membersSnap.size,
        ownershipCleared: ownershipSnap.size,
        freeAgentsListed: listed,
      }),
    );

    await commitInChunks(writes);

    return NextResponse.json({
      ok: true,
      initialBalance,
      initialBalanceLabel: formatMoney(initialBalance),
      membersReset: membersSnap.size,
      ownershipCleared: ownershipSnap.size,
      listingsCleared: listingsSnap.size,
      bidsCleared: bidsSnap.size,
      offersCleared: offersSnap.size,
      freeAgentsListed: listed,
      message: `Liga restablecida: managers a ${formatMoney(initialBalance)}, ${listed} jugadores libres a VM.`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "ERROR";
    const status = message === "UNAUTHENTICATED" ? 401 : message.startsWith("Forbidden") ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
