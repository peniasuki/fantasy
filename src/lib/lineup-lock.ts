import {
  getMasterCalendar,
  isPastLockAt,
  nextUnscoredMatchday,
  type CalendarMatchday,
} from "@/lib/calendar";
import { db } from "@/lib/firebase-admin";
import { LEAGUE_ID } from "@/lib/league";

/**
 * Jornadas con cierre automático por calendario (lockAt).
 * El resto solo se cierran con Admin → Cerrar alineaciones.
 */
export const SCHEDULED_LINEUP_LOCK_MATCHDAYS = new Set<number>([5]);

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
      autoLock,
    };
  }
  // Admin abrió explícitamente esta jornada: no reaplica el horario automático.
  if (manual?.locked === false) {
    return {
      locked: false,
      lockAt: autoLock ? upcoming.lockAt : null,
      matchday: upcoming.number,
      source: "none",
      autoLock,
    };
  }

  if (autoLock) {
    const locked = isPastLockAt(upcoming.lockAt, now);
    return {
      locked,
      lockAt: upcoming.lockAt,
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
