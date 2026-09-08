import { catalogIdFromBiwenger } from "@/lib/players";

export type JpPuntosVenue = "home" | "away";

export type JpPuntosPlayer = {
  biwengerId: string;
  playerId: string;
  name: string;
  position: string;
  points: number;
  venue: JpPuntosVenue;
};

export type JpPuntosMatch = {
  index: number;
  home: string;
  away: string;
  homeGoals: number | null;
  awayGoals: number | null;
  kickoff: string | null;
  homePlayers: JpPuntosPlayer[];
  awayPlayers: JpPuntosPlayer[];
};

export type JpPuntosJornada = {
  matchday: number;
  scoringSystem: 16;
  scoringLabel: "media-as-y-sofascore-16";
  sourceUrl: string;
  matches: JpPuntosMatch[];
};

/** Clase del bloque jugador: "puntos-jugador" o "puntos-jugador ideal", nunca -nombre/-puntuacion. */
const PLAYER_BLOCK_RE =
  /class="puntos-jugador(?:\s+[^"]*)?"[^>]*>([\s\S]*?)(?=class="puntos-jugador(?:\s+[^"]*)?"|$)/gi;

function decodeHtml(text: string): string {
  return text
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function parsePlayers(colHtml: string, venue: JpPuntosVenue): JpPuntosPlayer[] {
  const out: JpPuntosPlayer[] = [];
  for (const match of colHtml.matchAll(PLAYER_BLOCK_RE)) {
    const chunk = match[1];
    const bw = chunk.match(/cdn\.biwenger\.com\/i\/p\/(\d+)\.png/i);
    if (!bw) continue;
    const name = chunk.match(/puntos-jugador-nombre[\s\S]*?<a[^>]*>\s*([^<]+)/i);
    const pos = chunk.match(/jugador-posicion[^>]*>\s*([^<]+)/i);
    const pts = chunk.match(/puntos-jugador-puntuacion[^>]*>\s*([^<]+)/i);
    const rawPts = pts?.[1]?.trim() ?? "0";
    const points = Number.parseInt(rawPts, 10);
    const biwengerId = bw[1];
    out.push({
      biwengerId,
      playerId: catalogIdFromBiwenger(biwengerId),
      name: decodeHtml(name?.[1] ?? ""),
      position: decodeHtml(pos?.[1] ?? ""),
      points: Number.isFinite(points) ? points : 0,
      venue,
    });
  }
  return out;
}

/** Parsea HTML de JP puntos (local izquierda / visitante derecha). */
export function parseJpPuntosHtml(html: string, matchday: number): JpPuntosJornada {
  const parts = html.split('class="puntos-partido"').slice(1);
  const matches: JpPuntosMatch[] = [];

  parts.forEach((block, index) => {
    const home =
      block.match(
        /itemprop=['"]homeTeam['"][\s\S]*?itemprop=['"]name['"]\s+content=['"]([^'"]+)/i,
      )?.[1] ?? "?";
    const away =
      block.match(
        /itemprop=['"]awayTeam['"][\s\S]*?itemprop=['"]name['"]\s+content=['"]([^'"]+)/i,
      )?.[1] ?? "?";
    const scores = [...block.matchAll(/class="puntos-resultado-marcador"[^>]*>([^<]*)/gi)].map((m) =>
      m[1].trim(),
    );
    const homeGoals = scores[0] !== undefined && /^-?\d+$/.test(scores[0]) ? Number(scores[0]) : null;
    const awayGoals = scores[1] !== undefined && /^-?\d+$/.test(scores[1]) ? Number(scores[1]) : null;
    const kickoff = block.match(/itemprop="startDate"\s+content="([^"]+)"/i)?.[1] ?? null;

    const cols = block.split(/class="col-6-12 mobile-col-6-12"/i);
    const homePlayers = cols[1] ? parsePlayers(cols[1], "home") : [];
    const awayPlayers = cols[2] ? parsePlayers(cols[2], "away") : [];

    matches.push({
      index,
      home: decodeHtml(home),
      away: decodeHtml(away),
      homeGoals,
      awayGoals,
      kickoff,
      homePlayers,
      awayPlayers,
    });
  });

  return {
    matchday,
    scoringSystem: 16,
    scoringLabel: "media-as-y-sofascore-16",
    sourceUrl: `https://www.jornadaperfecta.com/puntos/?puntuacion=16&idJornada=${matchday}`,
    matches,
  };
}

export async function fetchJpPuntosJornada(
  matchday: number,
  fetchImpl: typeof fetch = fetch,
): Promise<JpPuntosJornada> {
  const url = `https://www.jornadaperfecta.com/puntos/?puntuacion=16&idJornada=${matchday}`;
  const res = await fetchImpl(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (compatible; FantasyBros/1.0; +https://fantasy-bros.online)",
      Accept: "text/html,application/xhtml+xml",
      "Accept-Language": "es-ES,es;q=0.9",
    },
  });
  if (!res.ok) throw new Error(`JP puntos jornada ${matchday}: HTTP ${res.status}`);
  const html = await res.text();
  const parsed = parseJpPuntosHtml(html, matchday);
  if (parsed.matches.length === 0) {
    throw new Error(`JP puntos jornada ${matchday}: sin partidos en la página`);
  }
  return parsed;
}
