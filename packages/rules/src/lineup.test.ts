import { describe, expect, it } from "vitest";
import { emptyLineup, isValidLineup } from "./lineup";

describe("isValidLineup", () => {
  it("permite huecos vacíos (0 puntos)", () => {
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
