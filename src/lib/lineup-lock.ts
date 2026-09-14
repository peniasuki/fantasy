import {
  getMasterCalendar,
  isPastLockAt,
  nextUnscoredMatchday,
  type CalendarMatchday,
} from "@/lib/calendar";
import { db } from "@/lib/firebase-admin";
import { LEAGUE_ID } from "@/lib/league";

/**
 * Jornadas con cierre automático por calendario (lockAt del JSON).
 * El resto solo se cierran con Admin → Cerrar alineaciones o con un
 * cierre programado en SCHEDULED_ADMIN_LOCKS.
 */
export const SCHEDULED_LINEUP_LOCK_MATCHDAYS = new Set<number>([5]);

/**
 * Cierres programados fuera del calendario (ISO con offset Madrid).
 * La UI muestra la hora; Cloud Scheduler (o isPastLockAt) aplica el bloqueo.
 */
export const SCHEDULED_ADMIN_LOCKS: Readonly<Record<number, string>> = {
  /** Jornada 6 — 15 sep 2026, 19:00 Madrid */
  6: "2026-09-15T19:00:00+02:00",
};

export type LineupLockState = {
  locked: boolean;
  lockAt: string | null;
  matchday: number | null;
  /** schedule = hora del calendario; admin = cierre manual; none = abierta */
  source: "schedule" | "admin" | "season_done" | "none";
  /** true si esta jornada cierra sola por calendario */
  autoLock: boolean;
};

/**
 * Estado de bloqueo del once para la próxima jornada no puntuada.
 * Prioridad: cierre manual admin > horario automático (solo jornadas en SCHEDULED_…).
 * Al puntuar una jornada, las alineaciones vuelven a abrirse para la siguiente.
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
    return { locked: true, lockAt: null, matchday: null, source: "season_done", autoLock: false };
  }

  const autoLock = SCHEDULED_LINEUP_LOCK_MATCHDAYS.has(upcoming.number);
  const adminScheduleAt = SCHEDULED_ADMIN_LOCKS[upcoming.number] ?? null;
  const scheduledLockAt = adminScheduleAt ?? (autoLock ? upcoming.lockAt : null);

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
      lockAt:
        typeof manual.lockAt === "string"
          ? manual.lockAt
          : scheduledLockAt ?? upcoming.lockAt,
      matchday: upcoming.number,
      source: "admin",
      autoLock: Boolean(scheduledLockAt),
    };
  }
  // Admin / score-jornada abrió explícitamente: no fuerza el horario, pero sí lo muestra.
  if (manual?.locked === false) {
    return {
      locked: false,
      lockAt: scheduledLockAt,
      matchday: upcoming.number,
      source: "none",
      autoLock: Boolean(scheduledLockAt),
    };
  }

  if (scheduledLockAt) {
    const locked = isPastLockAt(scheduledLockAt, now);
    return {
      locked,
      lockAt: scheduledLockAt,
      matchday: upcoming.number,
      source: locked ? "schedule" : "none",
      autoLock: true,
    };
  }

  return {
    locked: false,
    lockAt: null,
    matchday: upcoming.number,
    source: "none",
    autoLock: false,
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
