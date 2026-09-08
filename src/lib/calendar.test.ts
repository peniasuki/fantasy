import { describe, expect, it } from "vitest";
import {
  getMasterCalendar,
  isoDateYmd,
  matchdayDueForAvailabilitySync,
} from "./calendar";

describe("master calendar", () => {
  it("incluye 38 jornadas con lockAt el día anterior a las 23:00", () => {
    const cal = getMasterCalendar();
    expect(cal.matchdays).toHaveLength(38);
    const j1 = cal.matchdays[0];
    expect(j1.startsOn).toBe("2026-08-16");
    expect(isoDateYmd(j1.lockAt)).toBe("2026-08-15");
    expect(j1.lockAt).toContain("T23:00:00");
  });

  it("detecta la jornada a sincronizar el día de lockAt", () => {
    // 15 ago 2026 23:05 Madrid = 21:05 UTC (CEST)
    const now = new Date("2026-08-15T21:05:00.000Z");
    const md = matchdayDueForAvailabilitySync(getMasterCalendar(), now);
    expect(md?.number).toBe(1);
  });
});
