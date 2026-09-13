import { NextResponse } from "next/server";
import {
  canClausePlayer,
  canListPlayer,
  clauseReleasePrice,
  formatMoney,
  instantSellPrice,
  lastPurchasePrice,
  madridDateYmd,
  maxBidAmount,
  maxPurchasePrice,
  minPurchasePrice,
  nextMarketClose,
  purchasePriceBounds,
  type Bid,
  type CompetitorOffer,
  type Ownership,
} from "fantasy-rules";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/firebase-admin";
import { LEAGUE_ID, getLeague, requireMember, settingsOf } from "@/lib/league";

function playerVm(player: { currentPrice?: number; vm?: number } | undefined): number {
  return player?.currentPrice ?? player?.vm ?? 0;
}

async function countSalesStartedToday(uid: string): Promise<number> {
  const today = madridDateYmd();
  const snap = await db()
    .collection("leagues")
    .doc(LEAGUE_ID)
    .collection("saleEvents")
    .where("uid", "==", uid)
    .where("day", "==", today)
    .get();
  return snap.size;
}

async function recordSaleEvent(uid: string, kind: string, playerId: string) {
  const today = madridDateYmd();
  const id = `${today}_${uid}_${kind}_${playerId}_${Date.now()}`;
  await db()
    .collection("leagues")
    .doc(LEAGUE_ID)
    .collection("saleEvents")
    .doc(id)
    .set({ id, uid, day: today, kind, playerId, at: Date.now() });
}

async function clearPlayerFromLineup(uid: string, playerId: string) {
  const ref = db().collection("leagues").doc(LEAGUE_ID).collection("lineups").doc(uid);
  const snap = await ref.get();
  if (!snap.exists) return;
  const data = snap.data()!;
  const slots = (data.slots ?? []) as { slot: number; position: string; playerId: string | null }[];
  let changed = false;
  const next = slots.map((s) => {
    if (s.playerId === playerId) {
      changed = true;
      return { ...s, playerId: null };
    }
    return s;
  });
  if (changed) await ref.set({ slots: next, updatedAt: Date.now() }, { merge: true });
}

async function cancelPendingOffersForPlayer(playerId: string) {
  const snap = await db()
    .collection("leagues")
    .doc(LEAGUE_ID)
    .collection("offers")
    .where("playerId", "==", playerId)
    .where("status", "==", "pending")
    .get();
  const now = Date.now();
  await Promise.all(snap.docs.map((d) => d.ref.set({ status: "cancelled", closedAt: now }, { merge: true })));
}

export async function GET() {
  try {
    const user = await requireUser();
    const member = await requireMember(user.uid);
    const league = await getLeague();
    const settings = settingsOf(league);
    const leagueRef = db().collection("leagues").doc(LEAGUE_ID);
    const [listingsSnap, bidsSnap, playersSnap, ownedSnap, offersInSnap, offersOutSnap, membersSnap, clauseActsSnap] =
      await Promise.all([
        leagueRef.collection("listings").get(),
        leagueRef.collection("bids").where("bidderId", "==", user.uid).get(),
        db().collection("players").get(),
        leagueRef.collection("ownership").get(),
        leagueRef.collection("offers").where("toId", "==", user.uid).where("status", "==", "pending").get(),
        leagueRef.collection("offers").where("fromId", "==", user.uid).where("status", "==", "pending").get(),
        leagueRef.collection("members").get(),
        leagueRef.collection("activity").where("type", "==", "clause").get(),
      ]);
    const clauseCountByPlayer = new Map<string, number>();
    for (const d of clauseActsSnap.docs) {
      const pid = String(d.data().playerId ?? "");
      if (!pid) continue;
      clauseCountByPlayer.set(pid, (clauseCountByPlayer.get(pid) ?? 0) + 1);
    }
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
              pointsHome: Number(data.pointsHome ?? 0),
              pointsAway: Number(data.pointsAway ?? 0),
              pointsTotal: Number(data.pointsTotal ?? 0),
              clauseCount: Number(data.clauseCount ?? 0),
            },
          ];
        }),
    );
    const members = Object.fromEntries(
      membersSnap.docs.map((d) => [
        d.id,
        {
          uid: d.id,
          displayName: d.data().displayName ?? d.id,
          teamName: d.data().teamName ?? null,
        },
      ]),
    );
    const ownership = Object.fromEntries(ownedSnap.docs.map((d) => [d.data().playerId, d.data()]));
    const teamValue = ownedSnap.docs
      .filter((d) => d.data().ownerId === user.uid)
      .reduce((sum, d) => sum + (players[d.data().playerId]?.vm ?? 0), 0);
    const walletMax = maxBidAmount(member.balance, teamValue, settings);
    const now = Date.now();

    const mapOffer = (d: { data: () => Record<string, unknown> }) => {
      const o = d.data();
      const playerId = String(o.playerId ?? "");
      const fromId = String(o.fromId ?? "");
      const toId = String(o.toId ?? "");
      return {
        ...o,
        player: players[playerId] ?? null,
        fromName: members[fromId]?.displayName ?? fromId,
        toName: members[toId]?.displayName ?? toId,
        expired: Number(o.expiresAt) < now,
      };
    };

    const listedPlayerIds = new Set<string>();
    const listings = listingsSnap.docs
      .map((d) => {
        const listing = d.data();
        const player = players[listing.playerId];
        if (!player) return null;
        listedPlayerIds.add(String(listing.playerId));
        const vm = playerVm(player);
        const bounds = purchasePriceBounds(vm, settings);
        const bidable = listing.kind === "free_agent" || listing.kind === "sale";
        const ownerId =
          listing.kind === "free_agent"
            ? null
            : listing.sellerId && listing.sellerId !== "machine"
              ? String(listing.sellerId)
              : ownership[listing.playerId]?.ownerId
                ? String(ownership[listing.playerId].ownerId)
                : null;
        const clauseCount = Math.max(
          Number(player.clauseCount ?? 0),
          clauseCountByPlayer.get(String(listing.playerId)) ?? 0,
        );
        const clauseGate = canClausePlayer({ clauseCount, settings });
        return {
          ...listing,
          id: d.id,
          playerId: String(listing.playerId),
          player,
          myBid: bidsSnap.docs.find((b) => b.data().listingId === d.id)?.data() ?? null,
          minBid: bounds.min,
          maxBid: Math.min(bounds.max, walletMax),
          bidable,
          ownershipStatus: listing.kind === "free_agent" ? "free" : "owned",
          ownerId,
          ownerName: ownerId ? members[ownerId]?.displayName ?? ownerId : null,
          clausePrice: ownerId ? clauseReleasePrice(vm, settings) : null,
          clauseCount,
          clausesRemaining: clauseGate.remaining,
          clauseAvailable: Boolean(ownerId) && clauseGate.ok,
        };
      })
      .filter((row): row is NonNullable<typeof row> => Boolean(row));

    // Jugadores fichados que no están listados (para filtro libre/fichado).
    for (const doc of ownedSnap.docs) {
      const own = doc.data();
      const playerId = String(own.playerId);
      if (listedPlayerIds.has(playerId)) continue;
      const player = players[playerId];
      if (!player) continue;
      const ownerId = String(own.ownerId);
      const vm = playerVm(player);
      const clauseCount = Math.max(
        Number(player.clauseCount ?? 0),
        clauseCountByPlayer.get(playerId) ?? 0,
      );
      const clauseGate = canClausePlayer({ clauseCount, settings });
      listings.push({
        id: `owned_${playerId}`,
        playerId,
        sellerId: ownerId,
        askPrice: vm,
        listedAt: Number(own.boughtAt ?? 0),
        expiresAt: now,
        kind: "owned",
        player,
        myBid: null,
        minBid: 0,
        maxBid: 0,
        bidable: false,
        ownershipStatus: "owned",
        ownerId,
        ownerName: members[ownerId]?.displayName ?? ownerId,
        clausePrice: clauseReleasePrice(vm, settings),
        clauseCount,
        clausesRemaining: clauseGate.remaining,
        clauseAvailable: clauseGate.ok,
      } as (typeof listings)[number]);
    }

    return NextResponse.json({
      listings,
      incomingOffers: offersInSnap.docs.map(mapOffer),
      outgoingOffers: offersOutSnap.docs.map(mapOffer),
      members: Object.values(members).filter((m) => m.uid !== user.uid),
      myBids: bidsSnap.docs.map((d) => d.data()),
      closeAt: nextMarketClose(new Date()).getTime(),
      balance: member.balance,
      teamValue,
      maxBid: walletMax,
      minPurchaseOfVm: settings.minPurchaseOfVm ?? 0.75,
      maxPurchaseOfVm: settings.maxPurchaseOfVm,
      salesStartedToday: await countSalesStartedToday(user.uid),
      maxSalesPerDay: settings.maxSalesPerDay ?? 3,
      maxClausesPerPlayer: settings.maxClausesPerPlayer ?? 3,
      clauseSellLockDays: settings.clauseSellLockDays ?? 7,
      formatHint: formatMoney(member.balance),
      ownership,
      uid: user.uid,
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
    const leagueRef = db().collection("leagues").doc(LEAGUE_ID);
    const body = (await request.json()) as {
      action:
        | "bid"
        | "list"
        | "list_to_market"
        | "instant_sell"
        | "offer"
        | "accept_offer"
        | "reject_offer"
        | "cancel_offer"
        | "unlist"
        | "clause";
      listingId?: string;
      playerId?: string;
      amount?: number;
      askPrice?: number;
      toId?: string;
      offerId?: string;
    };

    if (body.action === "bid") {
      if (!body.listingId || !body.amount) {
        return NextResponse.json({ error: "Puja incompleta." }, { status: 400 });
      }
      const listingSnap = await leagueRef.collection("listings").doc(body.listingId).get();
      if (!listingSnap.exists) return NextResponse.json({ error: "Listado inexistente." }, { status: 404 });
      const listing = listingSnap.data()!;
      if (listing.kind === "to_market") {
        return NextResponse.json(
          { error: "Este jugador está en venta al mercado; no se puede pujar." },
          { status: 400 },
        );
      }
      const player = (await db().collection("players").doc(listing.playerId).get()).data();
      const vm = playerVm(player);
      const owned = await leagueRef.collection("ownership").where("ownerId", "==", user.uid).get();
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
      if (listing.sellerId === user.uid) {
        return NextResponse.json({ error: "No puedes pujar por tu jugador." }, { status: 400 });
      }
      const bidId = `${body.listingId}_${user.uid}`;
      const amount = Math.round(body.amount);
      const existingBid = await leagueRef.collection("bids").doc(bidId).get();
      const prev = existingBid.data();
      // Misma cantidad → conservar marca de tiempo (desempate por antigüedad).
      // Cantidad distinta → nueva marca (quien llega primero a ese importe).
      const createdAt =
        prev && Number(prev.amount) === amount && Number(prev.createdAt) > 0
          ? Number(prev.createdAt)
          : Date.now();
      const bid: Bid = {
        id: bidId,
        listingId: body.listingId,
        playerId: listing.playerId,
        bidderId: user.uid,
        amount,
        createdAt,
      };
      await leagueRef.collection("bids").doc(bidId).set(bid);
      return NextResponse.json({ ok: true });
    }

    if (body.action === "list_to_market" || body.action === "list") {
      if (!body.playerId) return NextResponse.json({ error: "Falta jugador." }, { status: 400 });
      const ownSnap = await leagueRef.collection("ownership").doc(body.playerId).get();
      if (!ownSnap.exists || ownSnap.data()?.ownerId !== user.uid) {
        return NextResponse.json({ error: "No es tuyo." }, { status: 400 });
      }
      const ownership = ownSnap.data()!;
      const listings = await leagueRef
        .collection("listings")
        .where("sellerId", "==", user.uid)
        .get();
      // Solo cuentan ventas activas (to_market / sale), no otros tipos.
      const activeSales = listings.docs.filter((d) => {
        const kind = String(d.data().kind ?? "");
        return kind === "to_market" || kind === "sale";
      }).length;
      const salesStartedToday = await countSalesStartedToday(user.uid);
      const check = canListPlayer({
        ownerId: user.uid,
        ownership: ownership as never,
        now: Date.now(),
        listingsByOwner: activeSales,
        salesStartedToday,
        settings,
      });
      if (!check.ok) return NextResponse.json({ error: check.reason }, { status: 400 });
      // Ya en oferta mercado
      const existingMkt = await leagueRef.collection("listings").doc(`mkt_${body.playerId}`).get();
      if (existingMkt.exists) {
        return NextResponse.json({ error: "Este jugador ya está en Oferta Mercado." }, { status: 400 });
      }
      const player = (await db().collection("players").doc(body.playerId).get()).data();
      const refPrice = lastPurchasePrice({
        buyPrice: ownership.buyPrice,
        lastTransferPrice: player?.lastTransferPrice,
        vm: playerVm(player),
      });
      if (refPrice <= 0) {
        return NextResponse.json({ error: "No hay precio de fichaje de referencia." }, { status: 400 });
      }
      const closeAt = nextMarketClose(new Date()).getTime();
      const id = `mkt_${body.playerId}`;
      await leagueRef.collection("listings").doc(id).set({
        id,
        playerId: body.playerId,
        sellerId: user.uid,
        askPrice: refPrice,
        referencePrice: refPrice,
        listedAt: Date.now(),
        expiresAt: closeAt,
        kind: "to_market",
      });
      await cancelPendingOffersForPlayer(body.playerId);
      await recordSaleEvent(user.uid, "to_market", body.playerId);
      return NextResponse.json({
        ok: true,
        kind: "to_market",
        referencePrice: refPrice,
        expiresAt: closeAt,
        message: "En venta al mercado. Se recompra al cierre (75–100% del último fichaje).",
      });
    }

    if (body.action === "instant_sell") {
      if (!body.playerId) return NextResponse.json({ error: "Falta jugador." }, { status: 400 });
      const ownSnap = await leagueRef.collection("ownership").doc(body.playerId).get();
      if (!ownSnap.exists || ownSnap.data()?.ownerId !== user.uid) {
        return NextResponse.json({ error: "No es tuyo." }, { status: 400 });
      }
      const ownership = ownSnap.data()!;
      const salesStartedToday = await countSalesStartedToday(user.uid);
      const check = canListPlayer({
        ownerId: user.uid,
        ownership: ownership as never,
        now: Date.now(),
        listingsByOwner: 0,
        salesStartedToday,
        settings,
      });
      if (!check.ok) return NextResponse.json({ error: check.reason }, { status: 400 });
      const player = (await db().collection("players").doc(body.playerId).get()).data();
      const refPrice = lastPurchasePrice({
        buyPrice: ownership.buyPrice,
        lastTransferPrice: player?.lastTransferPrice,
        vm: playerVm(player),
      });
      const price = instantSellPrice(refPrice, settings);
      const now = Date.now();
      const memberRef = leagueRef.collection("members").doc(user.uid);
      await db().runTransaction(async (tx) => {
        const m = await tx.get(memberRef);
        tx.update(memberRef, { balance: Number(m.data()?.balance ?? 0) + price });
        tx.delete(ownSnap.ref);
        // Quitar listados del jugador
        // (transaction no lista queries; borrado best-effort después)
      });
      const listingDocs = await leagueRef.collection("listings").where("playerId", "==", body.playerId).get();
      await Promise.all(listingDocs.docs.map((d) => d.ref.delete()));
      // Liberar como agente libre a VM; no tocar lastTransferPrice
      const faId = `fa_${body.playerId}`;
      await leagueRef.collection("listings").doc(faId).set({
        id: faId,
        playerId: body.playerId,
        sellerId: "machine",
        askPrice: playerVm(player),
        listedAt: now,
        expiresAt: now + 3650 * 24 * 60 * 60 * 1000,
        kind: "free_agent",
      });
      await clearPlayerFromLineup(user.uid, body.playerId);
      await cancelPendingOffersForPlayer(body.playerId);
      await recordSaleEvent(user.uid, "instant", body.playerId);
      return NextResponse.json({
        ok: true,
        price,
        message: `Venta inmediata: +${formatMoney(price)} (60% del último fichaje).`,
      });
    }

    if (body.action === "offer") {
      if (!body.playerId || !body.toId || !body.amount) {
        return NextResponse.json({ error: "Oferta incompleta." }, { status: 400 });
      }
      if (body.toId === user.uid) {
        return NextResponse.json({ error: "No puedes ofrecerte el jugador a ti mismo." }, { status: 400 });
      }
      const toMember = await leagueRef.collection("members").doc(body.toId).get();
      if (!toMember.exists) return NextResponse.json({ error: "Manager destino no existe." }, { status: 404 });
      const ownSnap = await leagueRef.collection("ownership").doc(body.playerId).get();
      if (!ownSnap.exists || ownSnap.data()?.ownerId !== user.uid) {
        return NextResponse.json({ error: "No es tuyo." }, { status: 400 });
      }
      const salesStartedToday = await countSalesStartedToday(user.uid);
      const check = canListPlayer({
        ownerId: user.uid,
        ownership: ownSnap.data() as never,
        now: Date.now(),
        listingsByOwner: 0,
        salesStartedToday,
        settings,
      });
      if (!check.ok) return NextResponse.json({ error: check.reason }, { status: 400 });
      if (body.amount <= 0) return NextResponse.json({ error: "Precio inválido." }, { status: 400 });
      // No permitir si ya está en venta al mercado
      const mkt = await leagueRef.collection("listings").doc(`mkt_${body.playerId}`).get();
      if (mkt.exists) {
        return NextResponse.json({ error: "Retira primero la venta al mercado." }, { status: 400 });
      }
      const now = Date.now();
      const days = settings.competitorOfferDays ?? 7;
      const id = `off_${body.playerId}_${user.uid}_${body.toId}_${now}`;
      const offer: CompetitorOffer = {
        id,
        playerId: body.playerId,
        fromId: user.uid,
        toId: body.toId,
        price: Math.round(body.amount),
        createdAt: now,
        expiresAt: now + days * 24 * 60 * 60 * 1000,
        status: "pending",
      };
      await leagueRef.collection("offers").doc(id).set(offer);
      await recordSaleEvent(user.uid, "offer", body.playerId);
      return NextResponse.json({ ok: true, offerId: id, expiresAt: offer.expiresAt });
    }

    if (body.action === "accept_offer") {
      if (!body.offerId) return NextResponse.json({ error: "Falta oferta." }, { status: 400 });
      const offerRef = leagueRef.collection("offers").doc(body.offerId);
      const offerSnap = await offerRef.get();
      if (!offerSnap.exists) return NextResponse.json({ error: "Oferta inexistente." }, { status: 404 });
      const offer = offerSnap.data() as CompetitorOffer;
      if (offer.toId !== user.uid) return NextResponse.json({ error: "No es tu oferta." }, { status: 403 });
      if (offer.status !== "pending") return NextResponse.json({ error: "Oferta no pendiente." }, { status: 400 });
      if (Date.now() > offer.expiresAt) {
        await offerRef.set({ status: "expired" }, { merge: true });
        return NextResponse.json({ error: "La oferta ha caducado." }, { status: 400 });
      }
      if (member.balance < offer.price) {
        return NextResponse.json({ error: "No tienes saldo suficiente." }, { status: 400 });
      }
      const ownRef = leagueRef.collection("ownership").doc(offer.playerId);
      const ownSnap = await ownRef.get();
      if (!ownSnap.exists || ownSnap.data()?.ownerId !== offer.fromId) {
        await offerRef.set({ status: "cancelled" }, { merge: true });
        return NextResponse.json({ error: "El jugador ya no pertenece al vendedor." }, { status: 400 });
      }
      const buyerOwned = await leagueRef.collection("ownership").where("ownerId", "==", user.uid).get();
      if (buyerOwned.size >= settings.maxSquadSize) {
        return NextResponse.json({ error: "Plantilla llena." }, { status: 400 });
      }
      const now = Date.now();
      await db().runTransaction(async (tx) => {
        const buyerRef = leagueRef.collection("members").doc(user.uid);
        const sellerRef = leagueRef.collection("members").doc(offer.fromId);
        const buyer = await tx.get(buyerRef);
        const seller = await tx.get(sellerRef);
        if ((buyer.data()?.balance ?? 0) < offer.price) throw new Error("SIN_SALDO");
        tx.update(buyerRef, { balance: Number(buyer.data()?.balance ?? 0) - offer.price });
        tx.update(sellerRef, { balance: Number(seller.data()?.balance ?? 0) + offer.price });
        tx.set(ownRef, {
          playerId: offer.playerId,
          ownerId: user.uid,
          buyPrice: offer.price,
          boughtAt: now,
          acquiredVia: "offer",
        });
        tx.set(
          db().collection("players").doc(offer.playerId),
          {
            lastTransferPrice: offer.price,
            lastTransferAt: now,
            lastTransferFrom: offer.fromId,
            lastTransferTo: user.uid,
            updatedAt: now,
          },
          { merge: true },
        );
        tx.set(offerRef, { status: "accepted", acceptedAt: now }, { merge: true });
      });
      await clearPlayerFromLineup(offer.fromId, offer.playerId);
      const listingDocs = await leagueRef.collection("listings").where("playerId", "==", offer.playerId).get();
      await Promise.all(listingDocs.docs.map((d) => d.ref.delete()));
      await cancelPendingOffersForPlayer(offer.playerId);
      return NextResponse.json({ ok: true });
    }

    if (body.action === "reject_offer" || body.action === "cancel_offer") {
      if (!body.offerId) return NextResponse.json({ error: "Falta oferta." }, { status: 400 });
      const offerRef = leagueRef.collection("offers").doc(body.offerId);
      const offerSnap = await offerRef.get();
      if (!offerSnap.exists) return NextResponse.json({ error: "Oferta inexistente." }, { status: 404 });
      const offer = offerSnap.data() as CompetitorOffer;
      if (body.action === "reject_offer" && offer.toId !== user.uid) {
        return NextResponse.json({ error: "No es tu oferta." }, { status: 403 });
      }
      if (body.action === "cancel_offer" && offer.fromId !== user.uid) {
        return NextResponse.json({ error: "No es tu oferta." }, { status: 403 });
      }
      if (offer.status !== "pending") return NextResponse.json({ error: "Oferta no pendiente." }, { status: 400 });
      await offerRef.set(
        { status: body.action === "reject_offer" ? "rejected" : "cancelled", closedAt: Date.now() },
        { merge: true },
      );
      return NextResponse.json({ ok: true });
    }

    if (body.action === "clause") {
      if (!body.playerId) return NextResponse.json({ error: "Falta jugador." }, { status: 400 });
      const playerId = String(body.playerId);
      const ownRef = leagueRef.collection("ownership").doc(playerId);
      const ownSnap = await ownRef.get();
      if (!ownSnap.exists) {
        return NextResponse.json({ error: "Ese jugador no está fichado." }, { status: 400 });
      }
      const sellerId = String(ownSnap.data()?.ownerId ?? "");
      if (!sellerId || sellerId === user.uid) {
        return NextResponse.json({ error: "No puedes pagar la cláusula de tu propio jugador." }, { status: 400 });
      }
      const playerRef = db().collection("players").doc(playerId);
      const player = (await playerRef.get()).data();
      if (!player || player.active === false) {
        return NextResponse.json({ error: "Jugador no disponible." }, { status: 404 });
      }
      const pastClauses = await leagueRef.collection("activity").where("type", "==", "clause").get();
      const fromActivity = pastClauses.docs.filter((d) => String(d.data().playerId) === playerId).length;
      const clauseCount = Math.max(Number(player.clauseCount ?? 0), fromActivity);
      const clauseGate = canClausePlayer({ clauseCount, settings });
      if (!clauseGate.ok) {
        return NextResponse.json({ error: clauseGate.reason }, { status: 400 });
      }
      const vm = playerVm(player);
      const price = clauseReleasePrice(vm, settings);
      if (price <= 0) {
        return NextResponse.json({ error: "Cláusula inválida." }, { status: 400 });
      }
      const buyerOwned = await leagueRef.collection("ownership").where("ownerId", "==", user.uid).get();
      if (buyerOwned.size >= settings.maxSquadSize) {
        return NextResponse.json({ error: "Plantilla llena." }, { status: 400 });
      }
      if (member.balance < price) {
        return NextResponse.json(
          { error: `Necesitas ${formatMoney(price)} en saldo (150% del VM).` },
          { status: 400 },
        );
      }

      const now = Date.now();
      const lockDays = settings.clauseSellLockDays ?? 7;
      await db().runTransaction(async (tx) => {
        const buyerRef = leagueRef.collection("members").doc(user.uid);
        const sellerRef = leagueRef.collection("members").doc(sellerId);
        const liveOwn = await tx.get(ownRef);
        const livePlayer = await tx.get(playerRef);
        const buyer = await tx.get(buyerRef);
        const seller = await tx.get(sellerRef);
        if (!liveOwn.exists || String(liveOwn.data()?.ownerId) !== sellerId) {
          throw new Error("CLAUSE_GONE");
        }
        const liveCount = Math.max(Number(livePlayer.data()?.clauseCount ?? 0), clauseCount);
        const liveGate = canClausePlayer({ clauseCount: liveCount, settings });
        if (!liveGate.ok) throw new Error("CLAUSE_MAX");
        const bal = Number(buyer.data()?.balance ?? 0);
        if (bal < price) throw new Error("SIN_SALDO");
        tx.update(buyerRef, { balance: bal - price });
        tx.update(sellerRef, { balance: Number(seller.data()?.balance ?? 0) + price });
        const ownership: Ownership = {
          playerId,
          ownerId: user.uid,
          buyPrice: price,
          boughtAt: now,
          acquiredVia: "clause",
        };
        tx.set(ownRef, ownership);
        tx.set(
          playerRef,
          {
            lastTransferPrice: price,
            lastTransferAt: now,
            lastTransferFrom: sellerId,
            lastTransferTo: user.uid,
            lastTransferVia: "clause",
            clauseCount: liveCount + 1,
            updatedAt: now,
          },
          { merge: true },
        );
      });

      await clearPlayerFromLineup(sellerId, playerId);
      const listingDocs = await leagueRef.collection("listings").where("playerId", "==", playerId).get();
      await Promise.all(listingDocs.docs.map((d) => d.ref.delete()));
      await cancelPendingOffersForPlayer(playerId);
      await leagueRef.collection("activity").doc(`clause_${playerId}_${now}`).set({
        type: "clause",
        at: now,
        playerId,
        fromId: sellerId,
        toId: user.uid,
        price,
        vm,
        clauseCountAfter: clauseCount + 1,
        sellLockDays: lockDays,
      });

      return NextResponse.json({
        ok: true,
        price,
        playerId,
        clauseCount: clauseCount + 1,
        clausesRemaining: Math.max(0, (settings.maxClausesPerPlayer ?? 3) - (clauseCount + 1)),
        sellLockDays: lockDays,
        message: `Clausulazo pagado: ${formatMoney(price)} (150% del VM). Protección de venta: ${lockDays} días.`,
      });
    }

    if (body.action === "unlist" && body.listingId) {
      const listing = await leagueRef.collection("listings").doc(body.listingId).get();
      if (listing.data()?.sellerId !== user.uid) {
        return NextResponse.json({ error: "No puedes retirar este listado." }, { status: 403 });
      }
      await listing.ref.delete();
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Acción no válida." }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "ERROR";
    if (message === "SIN_SALDO") {
      return NextResponse.json({ error: "No tienes saldo suficiente." }, { status: 400 });
    }
    if (message === "CLAUSE_GONE") {
      return NextResponse.json({ error: "El jugador ya no pertenece a ese manager." }, { status: 400 });
    }
    if (message === "CLAUSE_MAX") {
      return NextResponse.json(
        { error: "Este jugador ya ha alcanzado el máximo de clausulazos." },
        { status: 400 },
      );
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
