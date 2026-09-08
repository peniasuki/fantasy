import calendarJson from "@/data/laliga-calendar-2026-2027.json";

export type CalendarMatch = {
  laligaMatchId: number;
  home: { name: string; slug: string };
  away: { name: string; slug: string };
};

export type CalendarMatchday = {
  number: number;
  name: string;
  officialDate: string;
  startsOn: string;
  lockAt: string;
  matches: CalendarMatch[];
};

export type MasterCalendar = {
  season: string;
  competition: string;
  laligaSeasonId: number;
  laligaCompetitionId: number;
  sourceUrl: string;
  sourceJson: string;
  fetchedAt: string;
  timezone: string;
  rules: {
    availabilitySyncAt: string;
    nonAlignable: string[];
    emptyLineupSlotPoints: number;
  };
  matchdays: CalendarMatchday[];
};

const MADRID = "Europe/Madrid";

export function getMasterCalendar(): MasterCalendar {
  return calendarJson as MasterCalendar;
}

/** Fecha civil YYYY-MM-DD en Europe/Madrid. */
export function madridDateYmd(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: MADRID,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** Parte fecha de un ISO con offset (p.ej. lockAt). */
export function isoDateYmd(iso: string): string {
  return iso.slice(0, 10);
}

/**
 * Jornada cuyo sync de disponibilidad toca hoy a las 23:00 Madrid:
 * el día anterior al startsOn (coincide con la fecha de lockAt).
 */
export function matchdayDueForAvailabilitySync(
  calendar: MasterCalendar = getMasterCalendar(),
  now = new Date(),
): CalendarMatchday | null {
  const today = madridDateYmd(now);
  return calendar.matchdays.find((md) => isoDateYmd(md.lockAt) === today) ?? null;
}

export function matchdayByNumber(
  number: number,
  calendar: MasterCalendar = getMasterCalendar(),
): CalendarMatchday | null {
  return calendar.matchdays.find((md) => md.number === number) ?? null;
}

/**
 * Jornada “actual” por fecha Madrid:
 * la última con startsOn <= hoy; si la temporada no ha empezado, la 1.
 */
export function currentMatchdayByDate(
  calendar: MasterCalendar = getMasterCalendar(),
  now = new Date(),
): CalendarMatchday {
  const today = madridDateYmd(now);
  let current = calendar.matchdays[0];
  for (const md of calendar.matchdays) {
    if (md.startsOn <= today) current = md;
    else break;
  }
  return current;
}

/**
 * Próxima jornada a disputar / puntuar: la de menor número aún no puntuada.
 * Si todas están puntuadas, null.
 */
export function nextUnscoredMatchday(
  scoredNumbers: Iterable<number>,
  calendar: MasterCalendar = getMasterCalendar(),
): CalendarMatchday | null {
  const scored = new Set(scoredNumbers);
  return calendar.matchdays.find((md) => !scored.has(md.number)) ?? null;
}

export function isPastLockAt(lockAtIso: string, now = new Date()): boolean {
  const lockMs = Date.parse(lockAtIso);
  if (!Number.isFinite(lockMs)) return false;
  return now.getTime() >= lockMs;
}
