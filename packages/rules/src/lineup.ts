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

export function isValidLineup(
  formation: FormationId,
  slots: LineupSlot[],
  playerPositions: Record<string, Position>,
): { ok: boolean; reason?: string } {
  const expected = slotsForFormation(formation);
  if (slots.length !== 11 || expected.length !== 11) {
    return { ok: false, reason: "La alineación debe tener 11 plazas." };
  }
  const used = new Set<string>();
  for (let i = 0; i < 11; i += 1) {
    const slot = slots[i];
    if (!slot.playerId) return { ok: false, reason: "Hay un hueco vacío." };
    if (slot.position !== expected[i]) {
      return { ok: false, reason: "La formación no coincide con las plazas." };
    }
    const pos = playerPositions[slot.playerId];
    if (pos !== slot.position) {
      return { ok: false, reason: "Un jugador no encaja en su demarcación." };
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
