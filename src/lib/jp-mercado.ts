import { catalogIdFromBiwenger, mapJpPosition } from "@/lib/players";

export type JpMercadoPriceRow = {
  playerId: string;
  biwengerId: string;
  catalogId: string;
  name: string;
  /** Valor de mercado JP (campo price / Valor en UI). */
  price: number;
  position: string | null;
  team: string;
};

const JP_MERCADO_URL = "https://www.jornadaperfecta.com/mercado/";

export function foldPlayerName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

export function namesMatch(stored: string, jpName: string): boolean {
  const a = foldPlayerName(stored);
  const b = foldPlayerName(jpName);
  if (!a || !b) return false;
  return a === b;
}

/**
 * Extrae el array `marketCaching` embebido en el HTML de JP /mercado/.
 */
export function parseJpMercadoHtml(html: string): JpMercadoPriceRow[] {
  const marker = html.indexOf("marketCaching");
  if (marker < 0) throw new Error("JP mercado: no se encontró marketCaching.");
  const start = html.indexOf("[", marker);
  if (start < 0) throw new Error("JP mercado: marketCaching sin array.");

  let depth = 0;
  let end = -1;
  for (let i = start; i < html.length; i += 1) {
    const c = html[i];
    if (c === "[") depth += 1;
    else if (c === "]") {
      depth -= 1;
      if (depth === 0) {
        end = i + 1;
        break;
      }
    }
  }
  if (end < 0) throw new Error("JP mercado: marketCaching incompleto.");

  let raw: unknown;
  try {
    raw = JSON.parse(html.slice(start, end));
  } catch (error) {
    throw new Error(
      `JP mercado: JSON inválido (${error instanceof Error ? error.message : "parse"}).`,
    );
  }
  if (!Array.isArray(raw)) throw new Error("JP mercado: marketCaching no es un array.");

  const rows: JpMercadoPriceRow[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const biwengerId = String(row.remote_player ?? "").trim();
    if (!biwengerId) continue;
    const positionRaw = String(row.position ?? "");
    // Entrenadores y posiciones desconocidas: no forman parte del catálogo de jugadores.
    if (!mapJpPosition(positionRaw)) continue;
    const price = Number(row.price ?? row.price_eur ?? row.Valor ?? row.valor ?? 0);
    if (!Number.isFinite(price) || price < 0) continue;
    rows.push({
      playerId: String(row.playerId ?? ""),
      biwengerId,
      catalogId: catalogIdFromBiwenger(biwengerId),
      name: String(row.name ?? "").trim(),
      price: Math.round(price),
      position: mapJpPosition(positionRaw),
      team: String(row.team ?? ""),
    });
  }
  return rows;
}

export async function fetchJpMercado(fetchImpl: typeof fetch = fetch): Promise<{
  sourceUrl: string;
  rows: JpMercadoPriceRow[];
  fetchedAt: number;
}> {
  const headers = {
    "User-Agent":
      "Mozilla/5.0 (compatible; FantasyBros/1.0; +https://fantasy-bros.online)",
    Accept: "text/html,application/xhtml+xml",
    "Accept-Language": "es-ES,es;q=0.9",
  };
  const res = await fetchImpl(JP_MERCADO_URL, { headers });
  if (!res.ok) throw new Error(`JP mercado HTTP ${res.status}`);
  const html = await res.text();
  return {
    sourceUrl: JP_MERCADO_URL,
    rows: parseJpMercadoHtml(html),
    fetchedAt: Date.now(),
  };
}
