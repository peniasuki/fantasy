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

export function minPurchasePrice(vm: number, settings: LeagueSettings): number {
  const ratio = settings.minPurchaseOfVm ?? 0.75;
  return Math.max(0, Math.ceil(vm * ratio));
}

/** Rango válido de puja por un jugador (además del tope de saldo del manager). */
export function purchasePriceBounds(vm: number, settings: LeagueSettings): { min: number; max: number } {
  const min = minPurchasePrice(vm, settings);
  const max = maxPurchasePrice(vm, settings);
  return { min, max: Math.max(min, max) };
}

/** Precio de último fichaje del dueño actual (fallback VM). */
export function lastPurchasePrice(params: {
  buyPrice?: number | null;
  lastTransferPrice?: number | null;
  vm?: number | null;
}): number {
  const buy = Number(params.buyPrice ?? 0);
  if (buy > 0) return buy;
  const last = Number(params.lastTransferPrice ?? 0);
  if (last > 0) return last;
  return Math.max(0, Number(params.vm ?? 0));
}

/** Oferta máquina al cierre: aleatoria entre 75% y 100% del último fichaje. */
export function machineBuyOffer(
  lastPurchase: number,
  settings: LeagueSettings,
  random = Math.random,
): number {
  const minR = settings.marketBuyMinOfLastTransfer ?? 0.75;
  const maxR = settings.marketBuyMaxOfLastTransfer ?? 1;
  const lo = Math.min(minR, maxR);
  const hi = Math.max(minR, maxR);
  const ratio = lo + random() * (hi - lo);
  return Math.max(1, Math.round(lastPurchase * ratio));
}

export function instantSellPrice(lastPurchase: number, settings: LeagueSettings): number {
  const ratio = settings.instantSellOfLastTransfer ?? 0.6;
  return Math.max(1, Math.round(lastPurchase * ratio));
}

/** @deprecated Prefer machineBuyOffer con último fichaje. */
export function machineOffer(vm: number, settings: LeagueSettings, random = Math.random): number {
  const jitter = (random() * 2 - 1) * settings.machineOfferJitter;
  return Math.max(1, Math.round(vm * (1 + jitter)));
}

export function canListPlayer(params: {
  ownerId: string;
  ownership: Ownership;
  now: number;
  listingsByOwner: number;
  salesStartedToday: number;
  settings: LeagueSettings;
}): { ok: boolean; reason?: string } {
  if (params.ownership.ownerId !== params.ownerId) {
    return { ok: false, reason: "No es tuyo." };
  }
  const lockDays = params.settings.sellLockDays ?? 0;
  if (lockDays > 0) {
    const lockMs = lockDays * 24 * 60 * 60 * 1000;
    if (params.now - params.ownership.boughtAt < lockMs) {
      return { ok: false, reason: `Aún no puedes venderlo (bloqueo de ${lockDays} días).` };
    }
  }
  const maxSales = params.settings.maxSalesPerDay ?? 3;
  if (params.salesStartedToday >= maxSales) {
    return { ok: false, reason: `Máximo ${maxSales} ventas por día.` };
  }
  if (params.listingsByOwner >= params.settings.maxListingsPerManager) {
    return { ok: false, reason: "Máximo de jugadores ya en venta." };
  }
  return { ok: true };
}

export type Settlement = {
  playerId: string;
  listingId: string;
  winnerId: string | "machine" | null;
  price: number;
  previousOwnerId: string | "machine";
  reason: "highest_bid" | "clause" | "machine_buy" | "no_sale";
};

export function settleListing(params: {
  listing: Listing;
  bids: Bid[];
  vm: number;
  /** Precio de referencia para recompra máquina (último fichaje). */
  referencePrice?: number;
  balances: Record<string, number>;
  settings: LeagueSettings;
  now: number;
  random?: () => number;
}): Settlement {
  const { listing, settings, now } = params;
  const random = params.random ?? Math.random;

  // Venta al mercado: nadie puja; al cierre la máquina recompra.
  if (listing.kind === "to_market") {
    if (now < listing.expiresAt) {
      return {
        playerId: listing.playerId,
        listingId: listing.id,
        winnerId: null,
        price: 0,
        previousOwnerId: listing.sellerId,
        reason: "no_sale",
      };
    }
    const ref = params.referencePrice ?? listing.referencePrice ?? params.vm;
    const offer = machineBuyOffer(ref, settings, random);
    return {
      playerId: listing.playerId,
      listingId: listing.id,
      winnerId: "machine",
      price: offer,
      previousOwnerId: listing.sellerId,
      reason: "machine_buy",
    };
  }

  const bids = [...params.bids].sort((a, b) => {
    // Mayor importe gana; a igualdad, la puja más temprana (createdAt).
    if (b.amount !== a.amount) return b.amount - a.amount;
    return a.createdAt - b.createdAt;
  });

  const cap = maxPurchasePrice(params.vm, settings);
  const floor = minPurchasePrice(params.vm, settings);
  const eligible = bids.filter((bid) => {
    // Al cierre hace falta efectivo: el apalancamiento (25% plantilla) solo vale para pujar;
    // si no hay saldo suficiente en el settle, la puja no gana.
    const balance = params.balances[bid.bidderId] ?? 0;
    return balance >= bid.amount && bid.amount >= floor && bid.amount <= cap;
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
    const ref = params.referencePrice ?? listing.referencePrice ?? params.vm;
    const offer = machineBuyOffer(ref, settings, random);
    return {
      playerId: listing.playerId,
      listingId: listing.id,
      winnerId: "machine",
      price: offer,
      previousOwnerId: listing.sellerId,
      reason: "machine_buy",
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

/** Inicio del día civil Europe/Madrid en epoch ms (aprox. vía partes). */
export function madridDayStartMs(now = new Date()): number {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Madrid",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const y = Number(parts.find((p) => p.type === "year")?.value);
  const m = Number(parts.find((p) => p.type === "month")?.value);
  const d = Number(parts.find((p) => p.type === "day")?.value);
  // 00:00 Madrid ≈ usar Date UTC noon trick: construct as Madrid midnight via offset guess
  // Sufficient for "sales today" counting: compare Madrid YMD strings instead when possible.
  return Date.UTC(y, m - 1, d, 0, 0, 0) - 2 * 60 * 60 * 1000; // CEST bias; OK for daily counters
}

export function madridDateYmd(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Madrid",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
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
