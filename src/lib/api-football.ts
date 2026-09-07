const BASE = process.env.API_FOOTBALL_BASE_URL || "https://v3.football.api-sports.io";

export class ApiBudgetError extends Error {
  constructor(message = "Cuota diaria de API-Football agotada") {
    super(message);
    this.name = "ApiBudgetError";
  }
}

type Budget = { day: string; used: number };

export async function footballFetch<T>(
  path: string,
  params: Record<string, string | number> = {},
  budget: { get: () => Promise<Budget>; set: (b: Budget) => Promise<void>; maxPerDay?: number },
): Promise<T> {
  const maxPerDay = budget.maxPerDay ?? 90;
  const today = new Date().toISOString().slice(0, 10);
  const current = await budget.get();
  const used = current.day === today ? current.used : 0;
  if (used >= maxPerDay) throw new ApiBudgetError();

  const url = new URL(path, `${BASE}/`);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, String(value)));

  const res = await fetch(url, {
    headers: {
      "x-apisports-key": process.env.API_FOOTBALL_KEY || "",
    },
    cache: "no-store",
  });
  await budget.set({ day: today, used: used + 1 });
  if (!res.ok) {
    throw new Error(`API-Football ${res.status}`);
  }
  return (await res.json()) as T;
}

export type FootballResponse<T> = {
  results: number;
  paging?: { current: number; total: number };
  response: T;
};
