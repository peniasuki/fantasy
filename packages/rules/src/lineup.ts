import { FORMATIONS, type FormationId, type LeagueSettings, type Position } from "./types";

export type LineupSlot = {
  slot: number;
  position: Position;
  playerId: string | null;
  /**
   * Hueco dejado por clausulazo: con alineación cerrada solo estos se pueden cubrir.
   * Se limpia al guardar un suplente (o al reabrir la jornada).
   */
  clauseFillable?: boolean;
};

export function slotsForFormation(formation: FormationId): Position[] {
  const shape = FORMATIONS[formation];
  return [
    ...Array.from({ length: shape.GK }, () => "GK" as const),
    ...Array.from({ length: shape.DF }, () => "DF" as const),
    ...Array.from({ length: shape.MF }, () => "MF" as const),
    ...Array.from({ length: shape.FW }, () => "FW" as const),
  ];
}

export function emptyLineup(formation: FormationId): LineupSlot[] {
  return slotsForFormation(formation).map((position, slot) => ({
    slot,
    position,
    playerId: null,
  }));
}

/**
 * Valida formación y jugadores.
 * Huecos vacíos (playerId null) están permitidos: restan puntos al puntuar la jornada.
 * Opcionalmente rechaza jugadores no alineables (lesionados / sancionados).
 */
export function isValidLineup(
  formation: FormationId,
  slots: LineupSlot[],
  playerPositions: Record<string, Position>,
  playerAlignable?: Record<string, boolean>,
): { ok: boolean; reason?: string } {
  const expected = slotsForFormation(formation);
  if (slots.length !== 11 || expected.length !== 11) {
    return { ok: false, reason: "La alineación debe tener 11 plazas." };
  }
  const used = new Set<string>();
  for (let i = 0; i < 11; i += 1) {
    const slot = slots[i];
    if (slot.position !== expected[i]) {
      return { ok: false, reason: "La formación no coincide con las plazas." };
    }
    if (!slot.playerId) continue;
    const pos = playerPositions[slot.playerId];
    if (pos !== slot.position) {
      return { ok: false, reason: "Un jugador no encaja en su demarcación." };
    }
    if (playerAlignable && playerAlignable[slot.playerId] === false) {
      return { ok: false, reason: "Hay un jugador lesionado o sancionado." };
    }
    if (used.has(slot.playerId)) {
      return { ok: false, reason: "Jugador repetido." };
    }
    used.add(slot.playerId);
  }
  return { ok: true };
}

/**
 * Con alineación cerrada solo se permite cubrir huecos marcados por clausulazo
 * (null → jugador). Formación y titulares ya ocupados no pueden cambiar.
 */
export function canPatchLockedLineup(params: {
  previousFormation: FormationId;
  previousSlots: LineupSlot[];
  nextFormation: FormationId;
  nextSlots: LineupSlot[];
}): { ok: boolean; reason?: string } {
  if (params.previousFormation !== params.nextFormation) {
    return { ok: false, reason: "Con la alineación cerrada no puedes cambiar la formación." };
  }
  if (params.previousSlots.length !== 11 || params.nextSlots.length !== 11) {
    return { ok: false, reason: "La alineación debe tener 11 plazas." };
  }
  let filledClauseHole = false;
  for (let i = 0; i < 11; i += 1) {
    const prev = params.previousSlots[i];
    const next = params.nextSlots[i];
    if (prev.position !== next.position || prev.slot !== next.slot) {
      return { ok: false, reason: "No puedes alterar la estructura del once cerrado." };
    }
    if (prev.playerId) {
      if (next.playerId !== prev.playerId) {
        return {
          ok: false,
          reason: "Con la alineación cerrada no puedes cambiar ni quitar titulares.",
        };
      }
      continue;
    }
    // Hueco vacío
    if (!next.playerId) continue;
    if (!prev.clauseFillable) {
      return {
        ok: false,
        reason: "Solo puedes cubrir huecos dejados por un clausulazo.",
      };
    }
    filledClauseHole = true;
  }
  if (!filledClauseHole) {
    return {
      ok: false,
      reason: "No hay cambios permitidos: solo puedes cubrir un hueco de clausulazo.",
    };
  }
  return { ok: true };
}

/** Quita clauseFillable de huecos ya cubiertos al guardar. */
export function sanitizeLineupSlots(slots: LineupSlot[]): LineupSlot[] {
  return slots.map((s) => {
    if (s.playerId) {
      const { clauseFillable: _drop, ...rest } = s;
      return { ...rest, playerId: s.playerId };
    }
    return s.clauseFillable ? { ...s, clauseFillable: true } : { ...s, playerId: null };
  });
}

export function lineupLockedAt(firstKickoffMs: number, nowMs: number): boolean {
  return nowMs >= firstKickoffMs;
}

export type ManagerLineupScore = {
  points: number;
  filledPoints: number;
  emptySlots: number;
  emptyPenalty: number;
};

/**
 * Puntos del once de un manager: suma de jugadores alineados + penalización por huecos.
 * Si faltan plazas respecto a 11, se cuentan como vacías.
 */
export function scoreManagerLineup(params: {
  slots: { playerId?: string | null }[] | null | undefined;
  pointsByPlayer: Record<string, number>;
  settings: Pick<LeagueSettings, "emptySlotPenalty">;
  expectedSlots?: number;
}): ManagerLineupScore {
  const expected = params.expectedSlots ?? 11;
  const slots = params.slots ?? [];
  const penaltyPerEmpty = params.settings.emptySlotPenalty ?? -4;

  let filledPoints = 0;
  let filledSlots = 0;
  for (const slot of slots) {
    if (!slot.playerId) continue;
    filledSlots += 1;
    filledPoints += params.pointsByPlayer[slot.playerId] ?? 0;
  }

  const emptySlots = Math.max(0, expected - filledSlots);
  const emptyPenalty = emptySlots * penaltyPerEmpty;
  return {
    filledPoints,
    emptySlots,
    emptyPenalty,
    points: filledPoints + emptyPenalty,
  };
}
