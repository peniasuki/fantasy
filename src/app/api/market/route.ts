import { NextResponse } from "next/server";
import {
  canListPlayer,
  formatMoney,
  maxBidAmount,
  maxPurchasePrice,
  minPurchasePrice,
  nextMarketClose,
  purchasePriceBounds,
  type Bid,
} from "fantasy-rules";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/firebase-admin";
import { LEAGUE_ID, getLeague, requireMember, settingsOf } from "@/lib/league";

function playerVm(player: { currentPrice?: number; vm?: number } | undefined): number {
  return player?.currentPrice ?? player?.vm ?? 0;
}

export async function GET() {
  try {
    const user = await requireUser();
    const member = await requireMember(user.uid);
    const league = await getLeague();
    const settings = settingsOf(league);
    const [listingsSnap, bidsSnap, playersSnap, ownedSnap] = await Promise.all([
      db().collection("leagues").doc(LEAGUE_ID).collection("listings").get(),
      db().collection("leagues").doc(LEAGUE_ID).collection("bids").where("bidderId", "==", user.uid).get(),
      db().collection("players").get(),
      db().collection("leagues").doc(LEAGUE_ID).collection("ownership").get(),
    ]);
    const players = Object.fromEntries(
      playersSnap.docs
        .filter((d) => d.data().active !== false)
        .map((d) => {
          const data = d.data();
          return [
            d.id,
            {
              ...data,
              vm: data.currentPrice ?? data.vm ?? 0,
            },
          ];
        }),
    );
    const ownership = Object.fromEntries(ownedSnap.docs.map((d) => [d.data().playerId, d.data()]));
    const teamValue = ownedSnap.docs
      .filter((d) => d.data().ownerId === user.uid)
      .reduce((sum, d) => sum + (players[d.data().playerId]?.vm ?? 0), 0);
    const walletMax = maxBidAmount(member.balance, teamValue, settings);
    const listings = listingsSnap.docs
      .map((d) => {
        const listing = d.data();
        const player = players[listing.playerId];
        if (!player) return null;
        const vm = playerVm(player);
        const bounds = purchasePriceBounds(vm, settings);
        return {
          ...listing,
          player,
          myBid: bidsSnap.docs.find((b) => b.data().listingId === d.id)?.data() ?? null,
          minBid: bounds.min,
          maxBid: Math.min(bounds.max, walletMax, member.balance),
        };
      })
      .filter((row): row is NonNullable<typeof row> => Boolean(row));
    return NextResponse.json({
      listings,
      myBids: bidsSnap.docs.map((d) => d.data()),
      closeAt: nextMarketClose(new Date()).getTime(),
      balance: member.balance,
      teamValue,
      maxBid: walletMax,
      minPurchaseOfVm: settings.minPurchaseOfVm ?? 0.75,
      maxPurchaseOfVm: settings.maxPurchaseOfVm,
      formatHint: formatMoney(member.balance),
      ownership,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "ERROR";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const member = await requireMember(user.uid);
    const league = await getLeague();
    const settings = settingsOf(league);
    const body = (await request.json()) as {
      action: "bid" | "list" | "unlist";
      listingId?: string;
      playerId?: string;
      amount?: number;
      askPrice?: number;
    };

    if (body.action === "bid") {
      if (!body.listingId || !body.amount) {
        return NextResponse.json({ error: "Puja incompleta." }, { status: 400 });
      }
      const listingSnap = await db()
        .collection("leagues")
        .doc(LEAGUE_ID)
        .collection("listings")
        .doc(body.listingId)
        .get();
      if (!listingSnap.exists) return NextResponse.json({ error: "Listado inexistente." }, { status: 404 });
      const listing = listingSnap.data()!;
      const player = (await db().collection("players").doc(listing.playerId).get()).data();
      const vm = playerVm(player);
      const owned = await db()
        .collection("leagues")
        .doc(LEAGUE_ID)
        .collection("ownership")
        .where("ownerId", "==", user.uid)
        .get();
      const ownedPlayers = await Promise.all(
        owned.docs.map((d) => db().collection("players").doc(d.data().playerId).get()),
      );
      const realTeamValue = ownedPlayers.reduce((sum, s) => sum + playerVm(s.data()), 0);
      const capBid = maxBidAmount(member.balance, realTeamValue, settings);
      const floorBuy = minPurchasePrice(vm, settings);
      const capBuy = maxPurchasePrice(vm, settings);
      if (body.amount < floorBuy) {
        return NextResponse.json(
          {
            error: `Puja mínima ${floorBuy.toLocaleString("es-ES")} € (${Math.round((settings.minPurchaseOfVm ?? 0.75) * 100)}% del VM).`,
          },
          { status: 400 },
        );
      }
      if (body.amount > capBid) {
        return NextResponse.json({ error: `Puja máxima ${capBid.toLocaleString("es-ES")} €.` }, { status: 400 });
      }
      if (body.amount > capBuy) {
        return NextResponse.json(
          {
            error: `La puja supera el ${Math.round(settings.maxPurchaseOfVm * 100)}% del valor de mercado.`,
          },
          { status: 400 },
        );
      }
      if (body.amount > member.balance) {
        return NextResponse.json({ error: "No tienes saldo." }, { status: 400 });
      }
      if (listing.sellerId === user.uid) {
        return NextResponse.json({ error: "No puedes pujar por tu jugador." }, { status: 400 });
      }
      const bidId = `${body.listingId}_${user.uid}`;
      const bid: Bid = {
        id: bidId,
        listingId: body.listingId,
        playerId: listing.playerId,
        bidderId: user.uid,
        amount: Math.round(body.amount),
        createdAt: Date.now(),
      };
      await db().collection("leagues").doc(LEAGUE_ID).collection("bids").doc(bidId).set(bid);
      return NextResponse.json({ ok: true });
    }

    if (body.action === "list") {
      if (!body.playerId) return NextResponse.json({ error: "Falta jugador." }, { status: 400 });
      const ownSnap = await db()
        .collection("leagues")
        .doc(LEAGUE_ID)
        .collection("ownership")
        .doc(body.playerId)
        .get();
      if (!ownSnap.exists) return NextResponse.json({ error: "No es tuyo." }, { status: 400 });
      const listings = await db()
        .collection("leagues")
        .doc(LEAGUE_ID)
        .collection("listings")
        .where("sellerId", "==", user.uid)
        .get();
      const check = canListPlayer({
        ownerId: user.uid,
        ownership: ownSnap.data() as never,
        now: Date.now(),
        listingsByOwner: listings.size,
        settings,
      });
      if (!check.ok) return NextResponse.json({ error: check.reason }, { status: 400 });
      const player = (await db().collection("players").doc(body.playerId).get()).data();
      const ask = body.askPrice ?? playerVm(player);
      const id = `sale_${body.playerId}`;
      await db()
        .collection("leagues")
        .doc(LEAGUE_ID)
        .collection("listings")
        .doc(id)
        .set({
          id,
          playerId: body.playerId,
          sellerId: user.uid,
          askPrice: ask,
          listedAt: Date.now(),
          expiresAt: Date.now() + settings.listingDays * 24 * 60 * 60 * 1000,
          kind: "sale",
        });
      return NextResponse.json({ ok: true });
    }

    if (body.action === "unlist" && body.listingId) {
      const listing = await db()
        .collection("leagues")
        .doc(LEAGUE_ID)
        .collection("listings")
        .doc(body.listingId)
        .get();
      if (listing.data()?.sellerId !== user.uid) {
        return NextResponse.json({ error: "No puedes retirar este listado." }, { status: 403 });
      }
      await listing.ref.delete();
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Acción no válida." }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "ERROR";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
