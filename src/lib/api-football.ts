const BASE = process.env.API_FOOTBALL_BASE_URL || "https://v3.football.api-sports.io";

export class ApiBudgetError extends Error {
  constructor(message = "Cuota diaria de API-Football agotada") {
    super(message);
    this.name = "ApiBudgetError";
  }
}

export class ApiFootballError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApiFootballError";
  }
}

type Budget = { day: string; used: number };

function formatApiErrors(errors: unknown): string | null {
  if (!errors) return null;
  if (Array.isArray(errors)) {
    if (!errors.length) return null;
    return errors.map(String).join("; ");
  }
  if (typeof errors === "object") {
    const entries = Object.entries(errors as Record<string, unknown>);
    if (!entries.length) return null;
    return entries.map(([k, v]) => `${k}: ${String(v)}`).join("; ");
  }
  return String(errors);
}

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
  const data = (await res.json()) as T & { errors?: unknown };
  const apiError = formatApiErrors(data.errors);
  if (apiError) {
    throw new ApiFootballError(apiError);
  }
  return data as T;
}

export type FootballResponse<T> = {
  results: number;
  paging?: { current: number; total: number };
  response: T;
  errors?: unknown;
};
