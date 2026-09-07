import { NextResponse } from "next/server";
import type { QueryDocumentSnapshot, WriteBatch } from "firebase-admin/firestore";
import { requireJobOrAdmin } from "@/lib/auth";
import { db } from "@/lib/firebase-admin";
import { LEAGUE_ID, getLeague, settingsOf } from "@/lib/league";
import { settleListing } from "fantasy-rules";

const BATCH_LIMIT = 400;

async function commitInChunks(writes: Array<(batch: WriteBatch) => void>) {
  for (let i = 0; i < writes.length; i += BATCH_LIMIT) {
    const batch = db().batch();
    for (const write of writes.slice(i, i + BATCH_LIMIT)) write(batch);
    await batch.commit();
  }
}

export async function POST(request: Request) {
  try {
    await requireJobOrAdmin(request);
    const league = await getLeague();
    if (!league) return NextResponse.json({ error: "No hay liga." }, { status: 400 });
    const settings = settingsOf(league);
    const leagueRef = db().collection("leagues").doc(LEAGUE_ID);
    const [listingsSnap, bidsSnap, membersSnap, ownedSnap, playersSnap] = await Promise.all([
      leagueRef.collection("listings").get(),
      leagueRef.collection("bids").get(),
      leagueRef.collection("members").get(),
      leagueRef.collection("ownership").get(),
      db().collection("players").get(),
    ]);
    const balances = Object.fromEntries(membersSnap.docs.map((d) => [d.id, d.data().balance as number]));
    const players = Object.fromEntries(playersSnap.docs.map((d) => [d.id, d.data()]));
    const now = Date.now();
    let settled = 0;

    for (const listingDoc of listingsSnap.docs) {
      const listing = listingDoc.data();
      const bids = bidsSnap.docs.map((d) => d.data()).filter((b) => b.listingId === listing.id);
      const result = settleListing({
        listing: listing as never,
        bids: bids as never,
        vm: players[listing.playerId]?.vm ?? listing.askPrice ?? 0,
        balances,
        settings,
        now,
      });
      if (result.reason === "no_sale") continue;

      await db().runTransaction(async (tx) => {
        const listingRef = leagueRef.collection("listings").doc(listing.id);
        const ownRef = leagueRef.collection("ownership").doc(listing.playerId);
        if (result.winnerId && result.winnerId !== "machine") {
          const winnerRef = leagueRef.collection("members").doc(result.winnerId);
          const winner = await tx.get(winnerRef);
          const winnerData = winner.data();
          if (!winnerData || winnerData.balance < result.price) return;
          tx.update(winnerRef, { balance: winnerData.balance - result.price });
          if (result.previousOwnerId !== "machine") {
            const sellerRef = leagueRef.collection("members").doc(result.previousOwnerId);
            const seller = await tx.get(sellerRef);
            tx.update(sellerRef, { balance: (seller.data()?.balance ?? 0) + result.price });
          }
          tx.set(ownRef, {
            playerId: listing.playerId,
            ownerId: result.winnerId,
            buyPrice: result.price,
            boughtAt: now,
          });
          if (result.previousOwnerId !== "machine") {
            const playerRef = db().collection("players").doc(listing.playerId);
            tx.set(
              playerRef,
              {
                lastTransferPrice: result.price,
                lastTransferAt: now,
                lastTransferFrom: result.previousOwnerId,
                lastTransferTo: result.winnerId,
                updatedAt: now,
              },
              { merge: true },
            );
          }
        } else if (result.reason === "machine_buy" && result.previousOwnerId !== "machine") {
          const sellerRef = leagueRef.collection("members").doc(result.previousOwnerId);
          const seller = await tx.get(sellerRef);
          tx.update(sellerRef, { balance: (seller.data()?.balance ?? 0) + result.price });
          tx.delete(ownRef);
        }
        tx.delete(listingRef);
      });
      const staleBids = bidsSnap.docs.filter((d) => d.data().listingId === listing.id);
      await Promise.all(staleBids.map((d) => d.ref.delete()));
      settled += 1;
    }

    // Tras liquidar: todos los no fichados deben estar listados como agentes libres.
    const [ownedAfter, listingsAfter] = await Promise.all([
      leagueRef.collection("ownership").get(),
      leagueRef.collection("listings").get(),
    ]);
    const ownedIds = new Set(ownedAfter.docs.map((d) => d.data().playerId as string));
    const listedByPlayer = new Map<string, QueryDocumentSnapshot>();
    for (const doc of listingsAfter.docs) {
      listedByPlayer.set(doc.data().playerId as string, doc);
    }

    const keepAll = settings.keepAllUnownedListed !== false;
    const freePool = playersSnap.docs.map((d) => d.id).filter((id) => !ownedIds.has(id));

    const writes: Array<(batch: WriteBatch) => void> = [];
    let created = 0;
    let refreshed = 0;

    if (keepAll) {
      for (const playerId of freePool) {
        const existing = listedByPlayer.get(playerId);
        const askPrice = players[playerId]?.vm ?? 0;
        if (existing) {
          const data = existing.data();
          if (data.kind === "free_agent") {
            // Mantener listado; refrescar VM/ask si cambió.
            if (data.askPrice !== askPrice) {
              writes.push((batch) => batch.set(existing.ref, { askPrice }, { merge: true }));
              refreshed += 1;
            }
            continue;
          }
          // Si está en venta de manager, no tocar.
          continue;
        }
        const id = `fa_${playerId}`;
        writes.push((batch) =>
          batch.set(leagueRef.collection("listings").doc(id), {
            id,
            playerId,
            sellerId: "machine",
            askPrice,
            listedAt: now,
            expiresAt: now + 3650 * 24 * 60 * 60 * 1000, // no operativo; no caducan
            kind: "free_agent",
          }),
        );
        created += 1;
      }

      // Quitar agentes libres de jugadores que ya tienen dueño (por si quedó basura).
      for (const doc of listingsAfter.docs) {
        const data = doc.data();
        if (data.kind === "free_agent" && ownedIds.has(data.playerId as string)) {
          writes.push((batch) => batch.delete(doc.ref));
        }
      }
    }

    writes.push((batch) =>
      batch.set(leagueRef.collection("activity").doc(`market_${now}`), {
        type: "market_settled",
        at: now,
        settled,
        freeAgentsCreated: created,
        freeAgentsRefreshed: refreshed,
        freeAgentsTotal: freePool.length,
      }),
    );

    await commitInChunks(writes);

    return NextResponse.json({
      ok: true,
      settled,
      freeAgentsCreated: created,
      freeAgentsRefreshed: refreshed,
      freeAgentsListed: freePool.length,
      playersInCatalog: playersSnap.size,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "ERROR";
    const status = message === "UNAUTHENTICATED" ? 401 : message.startsWith("Forbidden") ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
