import { NextResponse } from "next/server";
import { pickFreeAgents } from "fantasy-rules";
import { requireJobOrAdmin } from "@/lib/auth";
import { db } from "@/lib/firebase-admin";
import { LEAGUE_ID, getLeague, settingsOf } from "@/lib/league";
import { settleListing } from "fantasy-rules";

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
    const ownedIds = new Set(ownedSnap.docs.map((d) => d.data().playerId as string));
    const now = Date.now();

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
    }

    const remainingListings = await leagueRef.collection("listings").get();
    const listedIds = new Set(remainingListings.docs.map((d) => d.data().playerId));
    const freePool = playersSnap.docs
      .map((d) => d.id)
      .filter((id) => !ownedIds.has(id) && !listedIds.has(id));
    const needed = Math.max(0, settings.freeAgentsPerCycle - remainingListings.docs.filter((d) => d.data().kind === "free_agent").length);
    const picked = pickFreeAgents(freePool, needed);
    const batch = db().batch();
    for (const playerId of picked) {
      const id = `fa_${playerId}_${now}`;
      batch.set(leagueRef.collection("listings").doc(id), {
        id,
        playerId,
        sellerId: "machine",
        askPrice: players[playerId]?.vm ?? 0,
        listedAt: now,
        expiresAt: now + settings.freeAgentDays * 24 * 60 * 60 * 1000,
        kind: "free_agent",
      });
    }
    batch.set(leagueRef.collection("activity").doc(`market_${now}`), {
      type: "market_settled",
      at: now,
    });
    await batch.commit();
    return NextResponse.json({ ok: true, newFreeAgents: picked.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : "ERROR";
    const status = message === "UNAUTHENTICATED" ? 401 : message.startsWith("Forbidden") ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
