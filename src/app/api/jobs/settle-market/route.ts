import { NextResponse } from "next/server";
import type { QueryDocumentSnapshot, WriteBatch } from "firebase-admin/firestore";
import { requireJobOrAdmin } from "@/lib/auth";
import { db } from "@/lib/firebase-admin";
import { LEAGUE_ID, getLeague, settingsOf } from "@/lib/league";
import { settleListing } from "fantasy-rules";

const BATCH_LIMIT = 400;
const SETTLE_LOCK_MS = 3 * 60 * 1000;

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
    const lockRef = leagueRef.collection("locks").doc("settle-market");
    const now = Date.now();

    // Evita settles concurrentes (doble cobro).
    const gotLock = await db().runTransaction(async (tx) => {
      const snap = await tx.get(lockRef);
      const until = Number(snap.data()?.until ?? 0);
      if (until > now) return false;
      tx.set(lockRef, { until: now + SETTLE_LOCK_MS, at: now }, { merge: true });
      return true;
    });
    if (!gotLock) {
      return NextResponse.json({ error: "Settle ya en curso. Reintenta en un momento." }, { status: 409 });
    }

    try {
      const [listingsSnap, bidsSnap, membersSnap, playersSnap] = await Promise.all([
        leagueRef.collection("listings").get(),
        leagueRef.collection("bids").get(),
        leagueRef.collection("members").get(),
        db().collection("players").get(),
      ]);
      const balances = Object.fromEntries(membersSnap.docs.map((d) => [d.id, d.data().balance as number]));
      const players = Object.fromEntries(playersSnap.docs.map((d) => [d.id, d.data()]));
      let settled = 0;
      let skippedOwned = 0;
      let skippedNoFunds = 0;

      for (const listingDoc of listingsSnap.docs) {
        const listing = listingDoc.data();
        const player = players[listing.playerId];
        const vm = player?.currentPrice ?? player?.vm ?? listing.askPrice ?? 0;
        const bids = bidsSnap.docs.map((d) => d.data()).filter((b) => b.listingId === listing.id);
        const result = settleListing({
          listing: listing as never,
          bids: bids as never,
          vm,
          referencePrice: listing.referencePrice ?? listing.askPrice ?? vm,
          balances,
          settings,
          now,
        });
        if (result.reason === "no_sale") continue;

        let applied = false;
        await db().runTransaction(async (tx) => {
          const listingRef = leagueRef.collection("listings").doc(listing.id);
          const ownRef = leagueRef.collection("ownership").doc(listing.playerId);
          const listingLive = await tx.get(listingRef);
          if (!listingLive.exists) return;

          if (result.winnerId && result.winnerId !== "machine") {
            const existingOwn = await tx.get(ownRef);
            // Idempotencia: si ya tiene dueño, no volver a cobrar.
            if (existingOwn.exists) {
              tx.delete(listingRef);
              skippedOwned += 1;
              applied = true;
              return;
            }
            const winnerRef = leagueRef.collection("members").doc(result.winnerId);
            const winner = await tx.get(winnerRef);
            const winnerData = winner.data();
            if (!winnerData || winnerData.balance < result.price) {
              skippedNoFunds += 1;
              return;
            }
            // Descuenta el IMPORTE DE LA PUJA (result.price), no el VM.
            tx.update(winnerRef, { balance: winnerData.balance - result.price });
            balances[result.winnerId] = winnerData.balance - result.price;
            if (result.previousOwnerId !== "machine") {
              const sellerRef = leagueRef.collection("members").doc(result.previousOwnerId);
              const seller = await tx.get(sellerRef);
              const sellerBal = Number(seller.data()?.balance ?? 0) + result.price;
              tx.update(sellerRef, { balance: sellerBal });
              balances[result.previousOwnerId] = sellerBal;
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
            applied = true;
          } else if (result.reason === "machine_buy" && result.previousOwnerId !== "machine") {
            const sellerRef = leagueRef.collection("members").doc(result.previousOwnerId);
            const seller = await tx.get(sellerRef);
            const sellerBal = Number(seller.data()?.balance ?? 0) + result.price;
            tx.update(sellerRef, { balance: sellerBal });
            balances[result.previousOwnerId] = sellerBal;
            tx.delete(ownRef);
            applied = true;
          } else {
            return;
          }
          tx.delete(listingRef);
        });

        if (!applied) continue;

        if (
          result.reason === "machine_buy" &&
          result.previousOwnerId !== "machine" &&
          typeof result.previousOwnerId === "string"
        ) {
          const lineupRef = leagueRef.collection("lineups").doc(result.previousOwnerId);
          const lineupSnap = await lineupRef.get();
          if (lineupSnap.exists) {
            const slots = (lineupSnap.data()?.slots ?? []) as {
              slot: number;
              position: string;
              playerId: string | null;
            }[];
            let changed = false;
            const next = slots.map((s) => {
              if (s.playerId === listing.playerId) {
                changed = true;
                return { ...s, playerId: null };
              }
              return s;
            });
            if (changed) await lineupRef.set({ slots: next, updatedAt: now }, { merge: true });
          }
          const offers = await leagueRef
            .collection("offers")
            .where("playerId", "==", listing.playerId)
            .where("status", "==", "pending")
            .get();
          await Promise.all(offers.docs.map((d) => d.ref.set({ status: "cancelled", closedAt: now }, { merge: true })));
        }

        const staleBids = bidsSnap.docs.filter((d) => d.data().listingId === listing.id);
        await Promise.all(staleBids.map((d) => d.ref.delete()));
        settled += 1;
      }

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
          const askPrice = players[playerId]?.currentPrice ?? players[playerId]?.vm ?? 0;
          if (existing) {
            const data = existing.data();
            if (data.kind === "free_agent") {
              if (data.askPrice !== askPrice) {
                writes.push((batch) => batch.set(existing.ref, { askPrice }, { merge: true }));
                refreshed += 1;
              }
              continue;
            }
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
              expiresAt: now + 3650 * 24 * 60 * 60 * 1000,
              kind: "free_agent",
            }),
          );
          created += 1;
        }

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
          skippedOwned,
          skippedNoFunds,
          freeAgentsCreated: created,
          freeAgentsRefreshed: refreshed,
          freeAgentsTotal: freePool.length,
        }),
      );

      await commitInChunks(writes);

      return NextResponse.json({
        ok: true,
        settled,
        skippedOwned,
        skippedNoFunds,
        freeAgentsCreated: created,
        freeAgentsRefreshed: refreshed,
        freeAgentsListed: freePool.length,
        playersInCatalog: playersSnap.size,
      });
    } finally {
      await lockRef.set({ until: 0, releasedAt: Date.now() }, { merge: true });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "ERROR";
    const status = message === "UNAUTHENTICATED" ? 401 : message.startsWith("Forbidden") ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
