import {
  getMasterCalendar,
  isPastLockAt,
  nextUnscoredMatchday,
  type CalendarMatchday,
} from "@/lib/calendar";
import { db } from "@/lib/firebase-admin";
import { LEAGUE_ID } from "@/lib/league";

export type LineupLockState = {
  locked: boolean;
  lockAt: string | null;
  matchday: number | null;
  /** schedule = hora del calendario; admin = cierre manual; none = abierta */
  source: "schedule" | "admin" | "season_done" | "none";
};

/**
 * Estado de bloqueo del once para la próxima jornada no puntuada.
 * Prioridad: cierre manual admin > hora lockAt del calendario.
 */
export async function getLineupLockState(now = new Date()): Promise<LineupLockState> {
  const scoredSnap = await db()
    .collection("leagues")
    .doc(LEAGUE_ID)
    .collection("scoredJornadas")
    .get();
  const scored = scoredSnap.docs.map((d) => Number(d.id)).filter(Number.isFinite);
  const upcoming = nextUnscoredMatchday(scored, getMasterCalendar());
  if (!upcoming) {
    return { locked: true, lockAt: null, matchday: null, source: "season_done" };
  }

  const manualSnap = await db()
    .collection("leagues")
    .doc(LEAGUE_ID)
    .collection("lineupLocks")
    .doc(String(upcoming.number))
    .get();
  const manual = manualSnap.data();
  if (manual?.locked === true) {
    return {
      locked: true,
      lockAt: typeof manual.lockAt === "string" ? manual.lockAt : upcoming.lockAt,
      matchday: upcoming.number,
      source: "admin",
    };
  }

  const locked = isPastLockAt(upcoming.lockAt, now);
  return {
    locked,
    lockAt: upcoming.lockAt,
    matchday: upcoming.number,
    source: locked ? "schedule" : "none",
  };
}

export async function getNextUnscoredMatchday(): Promise<CalendarMatchday | null> {
  const scoredSnap = await db()
    .collection("leagues")
    .doc(LEAGUE_ID)
    .collection("scoredJornadas")
    .get();
  const scored = scoredSnap.docs.map((d) => Number(d.id)).filter(Number.isFinite);
  return nextUnscoredMatchday(scored, getMasterCalendar());
}
