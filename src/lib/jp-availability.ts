export type JpAvailabilityKind = "injured" | "doubt" | "observation" | "suspended";

export type JpAvailabilityEntry = {
  biwengerId: string;
  playerId: string;
  slug: string;
  name: string;
  kind: JpAvailabilityKind;
  reason: string;
  source: "lesionados" | "sancionados";
};

const ICON_KIND: Record<string, JpAvailabilityKind> = {
  "lesion.png": "injured",
  "duda.png": "doubt",
  "disponible.jpg": "observation",
  "tarjeta.png": "suspended",
};

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

/**
 * Parsea las páginas HTML de JP lesionados / sancionados.
 * Identifica jugadores por id Biwenger en la foto CDN.
 */
export function parseJpAvailabilityHtml(
  html: string,
  source: "lesionados" | "sancionados",
): JpAvailabilityEntry[] {
  const entries: JpAvailabilityEntry[] = [];
  const blocks = html.split('class="lesionados-jugador"').slice(1);

  for (const block of blocks) {
    if (block.includes("lesionados-jugador-sanos")) continue;

    const iconMatch = block.match(/\/assets\/images\/iconos\/([^"'>\s]+)/i);
    const kind = iconMatch ? ICON_KIND[iconMatch[1]] : undefined;
    if (!kind) continue;
    if (source === "lesionados" && kind === "suspended") continue;
    if (source === "sancionados" && kind !== "suspended") continue;

    const photo = block.match(/cdn\.biwenger\.com\/i\/p\/(\d+)\.png/i);
    if (!photo) continue;
    const biwengerId = photo[1];

    const link = block.match(/jornadaperfecta\.com\/jugador\/([^"'>\s]+)/i);
    const slug = link?.[1] ?? "";
    const nameMatch = block.match(
      /lesionados-jugador-nombre[\s\S]*?<a[^>]*>\s*([^<]+)\s*<\/a>/i,
    );
    const reasonMatch = block.match(/lesionados-jugador-motivo[^>]*>\s*([^<]*)/i);

    entries.push({
      biwengerId,
      playerId: `bw_${biwengerId}`,
      slug,
      name: decodeHtml(nameMatch?.[1] ?? ""),
      kind,
      reason: decodeHtml(reasonMatch?.[1] ?? ""),
      source,
    });
  }

  return entries;
}

export async function fetchJpAvailabilityPages(fetchImpl: typeof fetch = fetch): Promise<{
  injuredDoubt: JpAvailabilityEntry[];
  suspended: JpAvailabilityEntry[];
}> {
  const headers = {
    "User-Agent":
      "Mozilla/5.0 (compatible; FantasyBros/1.0; +https://fantasy-bros.online)",
    Accept: "text/html,application/xhtml+xml",
    "Accept-Language": "es-ES,es;q=0.9",
  };
  const [lesRes, sanRes] = await Promise.all([
    fetchImpl("https://www.jornadaperfecta.com/lesionados/", { headers }),
    fetchImpl("https://www.jornadaperfecta.com/sancionados/", { headers }),
  ]);
  if (!lesRes.ok) throw new Error(`JP lesionados HTTP ${lesRes.status}`);
  if (!sanRes.ok) throw new Error(`JP sancionados HTTP ${sanRes.status}`);
  const [lesHtml, sanHtml] = await Promise.all([lesRes.text(), sanRes.text()]);
  return {
    injuredDoubt: parseJpAvailabilityHtml(lesHtml, "lesionados"),
    suspended: parseJpAvailabilityHtml(sanHtml, "sancionados"),
  };
}

export function isPlayerAlignable(flags: {
  injured?: boolean;
  suspended?: boolean;
}): boolean {
  return !flags.injured && !flags.suspended;
}
