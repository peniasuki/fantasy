export type Position = "GK" | "DF" | "MF" | "FW";

export type ScoringSystem = "stats";

export const FORMATIONS = {
  "4-4-2": { GK: 1, DF: 4, MF: 4, FW: 2 },
  "4-3-3": { GK: 1, DF: 4, MF: 3, FW: 3 },
  "3-5-2": { GK: 1, DF: 3, MF: 5, FW: 2 },
  "3-4-3": { GK: 1, DF: 3, MF: 4, FW: 3 },
  "4-5-1": { GK: 1, DF: 4, MF: 5, FW: 1 },
  "5-3-2": { GK: 1, DF: 5, MF: 3, FW: 2 },
  "5-4-1": { GK: 1, DF: 5, MF: 4, FW: 1 },
} as const;

export type FormationId = keyof typeof FORMATIONS;

export type LeagueSettings = {
  initialBalance: number;
  maxSquadSize: number;
  /** @deprecated Ya no limita el mercado: se listan todos los no fichados. */
  freeAgentsPerCycle: number;
  freeAgentDays: number;
  maxListingsPerManager: number;
  sellLockDays: number;
  listingDays: number;
  machineOfferJitter: number;
  maxBidTeamValueShare: number;
  maxPurchaseOfVm: number;
  /** Suelo de puja: fracción del VM (p. ej. 0.75 = 75%). */
  minPurchaseOfVm: number;
  /** Oferta máquina al cierre: mínimo del último fichaje. */
  marketBuyMinOfLastTransfer: number;
  /** Oferta máquina al cierre: máximo del último fichaje. */
  marketBuyMaxOfLastTransfer: number;
  /** Venta inmediata: fracción del último fichaje. */
  instantSellOfLastTransfer: number;
  /** Máximo de operaciones de venta iniciadas por manager y día (Madrid). */
  maxSalesPerDay: number;
  /** Caducidad de ofertas a otro manager (días). */
  competitorOfferDays: number;
  bonusPerPoint: number;
  bonusIdealXi: number;
  bonusMvp: number;
  scoringSystem: ScoringSystem;
  /** Si true, todos los jugadores sin dueño permanecen como agentes libres. */
  keepAllUnownedListed: boolean;
  /**
   * Primera jornada que suma puntos a la clasificación de managers.
   * Jornadas anteriores solo actualizan puntos de jugadores (catálogo).
   */
  managerScoringFromMatchday: number;
};

export const DEFAULT_SETTINGS: LeagueSettings = {
  initialBalance: 40_000_000,
  maxSquadSize: 22,
  freeAgentsPerCycle: 15,
  freeAgentDays: 2,
  maxListingsPerManager: 3,
  sellLockDays: 0,
  listingDays: 1,
  machineOfferJitter: 0.05,
  maxBidTeamValueShare: 0.25,
  maxPurchaseOfVm: 1.5,
  minPurchaseOfVm: 0.75,
  marketBuyMinOfLastTransfer: 0.75,
  marketBuyMaxOfLastTransfer: 1,
  instantSellOfLastTransfer: 0.6,
  maxSalesPerDay: 3,
  competitorOfferDays: 7,
  bonusPerPoint: 20_000,
  bonusIdealXi: 50_000,
  bonusMvp: 60_000,
  scoringSystem: "stats",
  keepAllUnownedListed: true,
  managerScoringFromMatchday: 5,
};

export type PlayerMatchStats = {
  minutes: number;
  position: Position;
  goals: number;
  penaltyGoals: number;
  ownGoals: number;
  assists: number;
  shotsOnTarget: number;
  shotsOff: number;
  foulsDrawn: number;
  foulsCommitted: number;
  interceptions: number;
  crosses: number;
  dribbles: number;
  tackles: number;
  yellowCards: number;
  redCard: boolean;
  secondYellow: boolean;
  penaltyMissed: number;
  penaltySaved: number;
  saves: number;
  goalsConceded: number;
  rating: number | null;
};

export type Bid = {
  id: string;
  listingId: string;
  playerId: string;
  bidderId: string;
  amount: number;
  createdAt: number;
};

export type Listing = {
  id: string;
  playerId: string;
  sellerId: string | "machine";
  askPrice: number;
  listedAt: number;
  expiresAt: number;
  /** free_agent: pujas. to_market: solo recompra máquina al cierre. sale: legado. */
  kind: "free_agent" | "sale" | "to_market";
  /** Precio de referencia (último fichaje) al listar to_market. */
  referencePrice?: number;
};

export type Ownership = {
  playerId: string;
  ownerId: string;
  buyPrice: number;
  boughtAt: number;
};

export type CompetitorOffer = {
  id: string;
  playerId: string;
  fromId: string;
  toId: string;
  price: number;
  createdAt: number;
  expiresAt: number;
  status: "pending" | "accepted" | "rejected" | "expired" | "cancelled";
};
