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
  bonusPerPoint: number;
  bonusIdealXi: number;
  bonusMvp: number;
  scoringSystem: ScoringSystem;
  /** Si true, todos los jugadores sin dueño permanecen como agentes libres. */
  keepAllUnownedListed: boolean;
};

export const DEFAULT_SETTINGS: LeagueSettings = {
  initialBalance: 40_000_000,
  maxSquadSize: 22,
  freeAgentsPerCycle: 15,
  freeAgentDays: 2,
  maxListingsPerManager: 3,
  sellLockDays: 2,
  listingDays: 2,
  machineOfferJitter: 0.05,
  maxBidTeamValueShare: 0.25,
  maxPurchaseOfVm: 1.5,
  bonusPerPoint: 20_000,
  bonusIdealXi: 50_000,
  bonusMvp: 60_000,
  scoringSystem: "stats",
  keepAllUnownedListed: true,
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
  kind: "free_agent" | "sale";
};

export type Ownership = {
  playerId: string;
  ownerId: string;
  buyPrice: number;
  boughtAt: number;
};
