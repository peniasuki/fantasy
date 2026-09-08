import { FORMATIONS, type FormationId, type Position } from "./types";

export type LineupSlot = {
  slot: number;
  position: Position;
  playerId: string | null;
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
 * Huecos vacíos (playerId null) están permitidos: cuentan 0 puntos en la jornada.
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

export function lineupLockedAt(firstKickoffMs: number, nowMs: number): boolean {
  return nowMs >= firstKickoffMs;
}
