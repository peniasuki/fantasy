import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "./types";
import {
  canPatchLockedLineup,
  emptyLineup,
  isValidLineup,
  sanitizeLineupSlots,
  scoreManagerLineup,
} from "./lineup";

describe("isValidLineup", () => {
  it("permite huecos vacíos (penalizan al puntuar)", () => {
    const slots = emptyLineup("4-3-3");
    expect(isValidLineup("4-3-3", slots, {})).toEqual({ ok: true });
  });

  it("rechaza lesionados o sancionados", () => {
    const slots = emptyLineup("4-3-3");
    slots[0] = { slot: 0, position: "GK", playerId: "bw_1" };
    const check = isValidLineup("4-3-3", slots, { bw_1: "GK" }, { bw_1: false });
    expect(check.ok).toBe(false);
    expect(check.reason).toMatch(/lesionado|sancionado/i);
  });

  it("acepta jugador alineable", () => {
    const slots = emptyLineup("4-3-3");
    slots[0] = { slot: 0, position: "GK", playerId: "bw_1" };
    expect(isValidLineup("4-3-3", slots, { bw_1: "GK" }, { bw_1: true })).toEqual({ ok: true });
  });
});

describe("canPatchLockedLineup", () => {
  it("permite cubrir solo un hueco de clausulazo", () => {
    const previous = emptyLineup("4-3-3");
    previous[0] = { slot: 0, position: "GK", playerId: "gk1" };
    previous[1] = { slot: 1, position: "DF", playerId: null, clauseFillable: true };
    const next = previous.map((s) => ({ ...s }));
    next[1] = { slot: 1, position: "DF", playerId: "df2", clauseFillable: true };
    expect(
      canPatchLockedLineup({
        previousFormation: "4-3-3",
        previousSlots: previous,
        nextFormation: "4-3-3",
        nextSlots: next,
      }).ok,
    ).toBe(true);
  });

  it("rechaza cambiar un titular o la formación", () => {
    const previous = emptyLineup("4-3-3");
    previous[0] = { slot: 0, position: "GK", playerId: "gk1" };
    const swapped = previous.map((s) => ({ ...s }));
    swapped[0] = { slot: 0, position: "GK", playerId: "gk2" };
    expect(
      canPatchLockedLineup({
        previousFormation: "4-3-3",
        previousSlots: previous,
        nextFormation: "4-3-3",
        nextSlots: swapped,
      }).ok,
    ).toBe(false);
    expect(
      canPatchLockedLineup({
        previousFormation: "4-3-3",
        previousSlots: previous,
        nextFormation: "4-4-2",
        nextSlots: emptyLineup("4-4-2"),
      }).ok,
    ).toBe(false);
  });

  it("rechaza cubrir un hueco que no es de clausulazo", () => {
    const previous = emptyLineup("4-3-3");
    const next = previous.map((s) => ({ ...s }));
    next[0] = { slot: 0, position: "GK", playerId: "gk1" };
    const check = canPatchLockedLineup({
      previousFormation: "4-3-3",
      previousSlots: previous,
      nextFormation: "4-3-3",
      nextSlots: next,
    });
    expect(check.ok).toBe(false);
    expect(check.reason).toMatch(/clausulazo/i);
  });

  it("sanitizeLineupSlots quita clauseFillable al cubrir", () => {
    const slots = sanitizeLineupSlots([
      { slot: 0, position: "GK", playerId: "gk1", clauseFillable: true },
      { slot: 1, position: "DF", playerId: null, clauseFillable: true },
    ]);
    expect(slots[0].clauseFillable).toBeUndefined();
    expect(slots[1].clauseFillable).toBe(true);
  });
});

describe("scoreManagerLineup", () => {
  it("resta 4 puntos por cada hueco vacío", () => {
    const slots = emptyLineup("4-3-3");
    slots[0] = { slot: 0, position: "GK", playerId: "gk1" };
    slots[1] = { slot: 1, position: "DF", playerId: "df1" };
    const result = scoreManagerLineup({
      slots,
      pointsByPlayer: { gk1: 6, df1: 3 },
      settings: DEFAULT_SETTINGS,
    });
    expect(result.filledPoints).toBe(9);
    expect(result.emptySlots).toBe(9);
    expect(result.emptyPenalty).toBe(-36);
    expect(result.points).toBe(-27);
  });

  it("penaliza once vacío completo (-44)", () => {
    const result = scoreManagerLineup({
      slots: [],
      pointsByPlayer: {},
      settings: DEFAULT_SETTINGS,
    });
    expect(result.emptySlots).toBe(11);
    expect(result.points).toBe(-44);
  });

  it("sin huecos solo suma puntos de jugadores", () => {
    const slots = emptyLineup("4-3-3").map((s, i) => ({
      ...s,
      playerId: `p${i}`,
    }));
    const pointsByPlayer = Object.fromEntries(slots.map((s) => [s.playerId!, 2]));
    const result = scoreManagerLineup({
      slots,
      pointsByPlayer,
      settings: DEFAULT_SETTINGS,
    });
    expect(result.emptySlots).toBe(0);
    expect(result.points).toBe(22);
  });
});
