import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "./types";
import { emptyLineup, isValidLineup, scoreManagerLineup } from "./lineup";

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
