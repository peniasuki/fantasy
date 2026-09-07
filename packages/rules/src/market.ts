import type { Bid, LeagueSettings, Listing, Ownership } from "./types";

export function maxBidAmount(
  balance: number,
  teamValue: number,
  settings: LeagueSettings,
): number {
  return Math.floor(balance + teamValue * settings.maxBidTeamValueShare);
}

export function maxPurchasePrice(vm: number, settings: LeagueSettings): number {
  return Math.floor(vm * settings.maxPurchaseOfVm);
}

export function machineOffer(vm: number, settings: LeagueSettings, random = Math.random): number {
  const jitter = (random() * 2 - 1) * settings.machineOfferJitter;
  return Math.max(1, Math.round(vm * (1 + jitter)));
}

export function canListPlayer(params: {
  ownerId: string;
  ownership: Ownership;
  now: number;
  listingsByOwner: number;
  settings: LeagueSettings;
}): { ok: boolean; reason?: string } {
  if (params.ownership.ownerId !== params.ownerId) {
    return { ok: false, reason: "No es tuyo." };
  }
  const lockMs = params.settings.sellLockDays * 24 * 60 * 60 * 1000;
  if (params.now - params.ownership.boughtAt < lockMs) {
    return { ok: false, reason: "Aún no puedes venderlo (bloqueo de 2 días)." };
  }
  if (params.listingsByOwner >= params.settings.maxListingsPerManager) {
    return { ok: false, reason: "Máximo 3 jugadores en venta." };
  }
  return { ok: true };
}

export type Settlement = {
  playerId: string;
  listingId: string;
  winnerId: string | "machine" | null;
  price: number;
  previousOwnerId: string | "machine";
  reason: "highest_bid" | "clause" | "machine_buy" | "expired" | "no_sale";
};

export function settleListing(params: {
  listing: Listing;
  bids: Bid[];
  vm: number;
  balances: Record<string, number>;
  settings: LeagueSettings;
  now: number;
  random?: () => number;
}): Settlement {
  const { listing, settings, now } = params;
  const bids = [...params.bids].sort((a, b) => {
    if (b.amount !== a.amount) return b.amount - a.amount;
    return a.createdAt - b.createdAt;
  });

  const cap = maxPurchasePrice(params.vm, settings);
  const eligible = bids.filter((bid) => {
    const maxBid = maxBidAmount(params.balances[bid.bidderId] ?? 0, 0, settings);
    const afford = (params.balances[bid.bidderId] ?? 0) >= bid.amount;
    return afford && bid.amount <= cap && bid.amount <= maxBid;
  });

  if (listing.kind === "sale") {
    const clause = eligible.find((bid) => bid.amount >= listing.askPrice);
    if (clause) {
      return {
        playerId: listing.playerId,
        listingId: listing.id,
        winnerId: clause.bidderId,
        price: listing.askPrice,
        previousOwnerId: listing.sellerId,
        reason: "clause",
      };
    }
  }

  if (eligible[0]) {
    return {
      playerId: listing.playerId,
      listingId: listing.id,
      winnerId: eligible[0].bidderId,
      price: eligible[0].amount,
      previousOwnerId: listing.sellerId,
      reason: "highest_bid",
    };
  }

  if (listing.kind === "sale" && now >= listing.expiresAt) {
    const offer = machineOffer(params.vm, settings, params.random);
    return {
      playerId: listing.playerId,
      listingId: listing.id,
      winnerId: "machine",
      price: offer,
      previousOwnerId: listing.sellerId,
      reason: "machine_buy",
    };
  }

  if (listing.kind === "free_agent" && now >= listing.expiresAt) {
    return {
      playerId: listing.playerId,
      listingId: listing.id,
      winnerId: null,
      price: 0,
      previousOwnerId: "machine",
      reason: "expired",
    };
  }

  return {
    playerId: listing.playerId,
    listingId: listing.id,
    winnerId: null,
    price: 0,
    previousOwnerId: listing.sellerId,
    reason: "no_sale",
  };
}

export function pickFreeAgents(playerIds: string[], count: number, random = Math.random): string[] {
  const copy = [...playerIds];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, count);
}

export function nextMarketClose(now: Date, hour = 7): Date {
  const close = new Date(now);
  close.setHours(hour, 0, 0, 0);
  if (now.getTime() >= close.getTime()) {
    close.setDate(close.getDate() + 1);
  }
  return close;
}

export function formatMoney(amount: number): string {
  if (amount >= 1_000_000) {
    const n = amount / 1_000_000;
    return `${n.toLocaleString("es-ES", { maximumFractionDigits: n >= 10 ? 1 : 2 })}M €`;
  }
  return `${amount.toLocaleString("es-ES")} €`;
}

export function baseMarketValue(params: {
  position: "GK" | "DF" | "MF" | "FW";
  minutes: number;
  goals: number;
  assists: number;
  rating: number | null;
}): number {
  const posBase = { GK: 3_000_000, DF: 4_000_000, MF: 5_000_000, FW: 6_000_000 }[params.position];
  const minutesBonus = Math.min(4_000_000, (params.minutes / 90) * 80_000);
  const scoringBonus = params.goals * 800_000 + params.assists * 400_000;
  const ratingBonus = params.rating ? (params.rating - 6.5) * 1_200_000 : 0;
  return Math.max(200_000, Math.round((posBase + minutesBonus + scoringBonus + ratingBonus) / 10_000) * 10_000);
}
