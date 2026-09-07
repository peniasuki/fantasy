import type { Position } from "fantasy-rules";

/** Documento de catálogo en Firestore `players/{id}`. */
export type CatalogPlayer = {
  id: string;
  name: string;
  position: Position;
  teamId: string;
  teamName: string;
  photo: string;

  /** Valor de mercado actual (compatible con UI/mercado existentes). */
  vm: number;
  /** Precio de mercado actual (mismo que vm; fuente Jornada Perfecta / Biwenger). */
  currentPrice: number;
  priceUpdatedAt: number;
  priceSource: "jornadaperfecta" | "api-football" | "manual" | "transfer";
  minPrice: number | null;
  maxPrice: number | null;

  /** Último traspaso entre managers (null si nunca o solo de máquina). */
  lastTransferPrice: number | null;
  lastTransferAt: number | null;
  lastTransferFrom: string | null;
  lastTransferTo: string | null;

  jpPlayerId: string;
  biwengerId: string;
  jpTeamId: string;
  biwengerTeamId: string;
  jpSlug: string;

  availabilityStatus: string | null;
  injured: boolean;
  doubt: boolean;

  season: number;
  catalogSource: "jornadaperfecta";
  active: boolean;
  updatedAt: number;
};

export type JpMarketRow = {
  playerId: string;
  remote_player: string;
  name: string;
  position: string;
  team: string;
  teamId: string;
  remote_team: string;
  price: number;
  price_eur?: number;
  max_price?: number;
  min_price?: number;
  status?: string;
  injured?: string;
  doubt?: string;
  url?: string;
};

const POS_MAP: Record<string, Position> = {
  portero: "GK",
  defensa: "DF",
  mediocentro: "MF",
  delantero: "FW",
};

export function mapJpPosition(raw: string): Position | null {
  return POS_MAP[raw.trim().toLowerCase()] ?? null;
}

export function catalogIdFromBiwenger(biwengerId: string | number): string {
  return `bw_${biwengerId}`;
}

export function playerFromJpRow(row: JpMarketRow, season: number, now = Date.now()): CatalogPlayer | null {
  const position = mapJpPosition(row.position);
  if (!position) return null; // entrenador u otros
  const biwengerId = String(row.remote_player);
  const id = catalogIdFromBiwenger(biwengerId);
  const price = Number(row.price ?? row.price_eur ?? 0);
  return {
    id,
    name: row.name,
    position,
    teamId: `jp_${row.teamId}`,
    teamName: row.team,
    photo: `https://cdn.biwenger.com/i/p/${biwengerId}.png`,
    vm: price,
    currentPrice: price,
    priceUpdatedAt: now,
    priceSource: "jornadaperfecta",
    minPrice: row.min_price != null ? Number(row.min_price) : null,
    maxPrice: row.max_price != null ? Number(row.max_price) : null,
    lastTransferPrice: null,
    lastTransferAt: null,
    lastTransferFrom: null,
    lastTransferTo: null,
    jpPlayerId: String(row.playerId),
    biwengerId,
    jpTeamId: String(row.teamId),
    biwengerTeamId: String(row.remote_team),
    jpSlug: String(row.url || ""),
    availabilityStatus: row.status ?? null,
    injured: String(row.injured || "0") === "1",
    doubt: String(row.doubt || "0") === "1",
    season,
    catalogSource: "jornadaperfecta",
    active: true,
    updatedAt: now,
  };
}
