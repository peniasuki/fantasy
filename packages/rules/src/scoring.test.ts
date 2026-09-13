import { describe, expect, it } from "vitest";
import { scoreEstadisticas } from "./scoring";
import { DEFAULT_SETTINGS } from "./types";
import {
  canClausePlayer,
  canListPlayer,
  clauseReleasePrice,
  instantSellPrice,
  maxBidAmount,
  minPurchasePrice,
  nextMarketClose,
  sellLockedUntil,
  settleListing,
} from "./market";

describe("nextMarketClose", () => {
  it("returns next Madrid midnight", () => {
    // Sunday 13 Sep 2026 12:00 CEST
    const now = new Date("2026-09-13T10:00:00.000Z");
    const close = nextMarketClose(now);
    expect(close.toISOString()).toBe("2026-09-13T22:00:00.000Z"); // 00:00 CEST = 22:00 UTC
  });

  it("rolls to the following midnight after 00:00", () => {
    const now = new Date("2026-09-13T22:00:00.000Z"); // exactly midnight CEST
    const close = nextMarketClose(now);
    expect(close.toISOString()).toBe("2026-09-14T22:00:00.000Z");
  });
});

describe("clauseReleasePrice", () => {
  it("is 150% of VM", () => {
    expect(clauseReleasePrice(10_000_000, DEFAULT_SETTINGS)).toBe(15_000_000);
  });
});

describe("clause sell lock + max clauses", () => {
  const baseOwn = {
    playerId: "p1",
    ownerId: "u1",
    buyPrice: 15_000_000,
    boughtAt: Date.parse("2026-09-01T12:00:00.000Z"),
  };

  it("blocks selling a clause acquisition for 7 days", () => {
    const ownership = { ...baseOwn, acquiredVia: "clause" as const };
    const day3 = baseOwn.boughtAt + 3 * 24 * 60 * 60 * 1000;
    const check = canListPlayer({
      ownerId: "u1",
      ownership,
      now: day3,
      listingsByOwner: 0,
      salesStartedToday: 0,
      settings: DEFAULT_SETTINGS,
    });
    expect(check.ok).toBe(false);
    expect(check.reason).toMatch(/clausulazo/i);
    expect(sellLockedUntil(ownership, DEFAULT_SETTINGS)).toBe(
      baseOwn.boughtAt + 7 * 24 * 60 * 60 * 1000,
    );
  });

  it("allows selling a clause acquisition after 7 days", () => {
    const ownership = { ...baseOwn, acquiredVia: "clause" as const };
    const day8 = baseOwn.boughtAt + 8 * 24 * 60 * 60 * 1000;
    const check = canListPlayer({
      ownerId: "u1",
      ownership,
      now: day8,
      listingsByOwner: 0,
      salesStartedToday: 0,
      settings: DEFAULT_SETTINGS,
    });
    expect(check.ok).toBe(true);
  });

  it("does not lock normal (non-clause) buys when sellLockDays is 0", () => {
    const ownership = { ...baseOwn, acquiredVia: "bid" as const };
    const check = canListPlayer({
      ownerId: "u1",
      ownership,
      now: baseOwn.boughtAt + 60_000,
      listingsByOwner: 0,
      salesStartedToday: 0,
      settings: DEFAULT_SETTINGS,
    });
    expect(check.ok).toBe(true);
  });

  it("allows at most 3 clausulazos per player", () => {
    expect(canClausePlayer({ clauseCount: 2, settings: DEFAULT_SETTINGS }).ok).toBe(true);
    expect(canClausePlayer({ clauseCount: 2, settings: DEFAULT_SETTINGS }).remaining).toBe(1);
    const blocked = canClausePlayer({ clauseCount: 3, settings: DEFAULT_SETTINGS });
    expect(blocked.ok).toBe(false);
    expect(blocked.remaining).toBe(0);
  });
});

describe("scoreEstadisticas", () => {
  it("gives 0 without minutes", () => {
    const r = scoreEstadisticas({
      minutes: 0,
      position: "FW",
      goals: 1,
      penaltyGoals: 0,
      ownGoals: 0,
      assists: 0,
      shotsOnTarget: 0,
      shotsOff: 0,
      foulsDrawn: 0,
      foulsCommitted: 0,
      interceptions: 0,
      crosses: 0,
      dribbles: 0,
      tackles: 0,
      yellowCards: 0,
      redCard: false,
      secondYellow: false,
      penaltyMissed: 0,
      penaltySaved: 0,
      saves: 0,
      goalsConceded: 0,
      rating: null,
    });
    expect(r.points).toBe(0);
  });

  it("scores an open-play goal as 4", () => {
    const r = scoreEstadisticas({
      minutes: 90,
      position: "FW",
      goals: 1,
      penaltyGoals: 0,
      ownGoals: 0,
      assists: 0,
      shotsOnTarget: 1,
      shotsOff: 0,
      foulsDrawn: 0,
      foulsCommitted: 0,
      interceptions: 0,
      crosses: 0,
      dribbles: 0,
      tackles: 0,
      yellowCards: 0,
      redCard: false,
      secondYellow: false,
      penaltyMissed: 0,
      penaltySaved: 0,
      saves: 0,
      goalsConceded: 0,
      rating: 7,
    });
    expect(r.points).toBe(4);
  });
});

describe("market", () => {
  it("caps bid at balance plus a quarter of team value", () => {
    expect(maxBidAmount(10_000_000, 40_000_000, DEFAULT_SETTINGS)).toBe(20_000_000);
  });

  it("sets a 75% market-value floor", () => {
    expect(minPurchasePrice(10_000_000, DEFAULT_SETTINGS)).toBe(7_500_000);
  });

  it("awards the highest bid", () => {
    const result = settleListing({
      listing: {
        id: "l1",
        playerId: "p1",
        sellerId: "machine",
        askPrice: 5_000_000,
        listedAt: 0,
        expiresAt: 10,
        kind: "free_agent",
      },
      bids: [
        { id: "b1", listingId: "l1", playerId: "p1", bidderId: "a", amount: 6_000_000, createdAt: 1 },
        { id: "b2", listingId: "l1", playerId: "p1", bidderId: "b", amount: 8_000_000, createdAt: 2 },
      ],
      vm: 7_000_000,
      balances: { a: 40_000_000, b: 40_000_000 },
      settings: DEFAULT_SETTINGS,
      now: 5,
    });
    expect(result.winnerId).toBe("b");
    expect(result.price).toBe(8_000_000);
  });

  it("rejects bids below the market-value floor at settlement", () => {
    const result = settleListing({
      listing: {
        id: "l2",
        playerId: "p2",
        sellerId: "machine",
        askPrice: 10_000_000,
        listedAt: 0,
        expiresAt: 10,
        kind: "free_agent",
      },
      bids: [{ id: "b1", listingId: "l2", playerId: "p2", bidderId: "a", amount: 5_000_000, createdAt: 1 }],
      vm: 10_000_000,
      balances: { a: 40_000_000 },
      settings: DEFAULT_SETTINGS,
      now: 5,
    });
    expect(result.reason).toBe("no_sale");
    expect(result.winnerId).toBeNull();
  });

  it("machine-buys to_market at close using last purchase (75–100%)", () => {
    const result = settleListing({
      listing: {
        id: "m1",
        playerId: "p3",
        sellerId: "u1",
        askPrice: 10_000_000,
        referencePrice: 10_000_000,
        listedAt: 0,
        expiresAt: 10,
        kind: "to_market",
      },
      bids: [],
      vm: 20_000_000,
      referencePrice: 10_000_000,
      balances: {},
      settings: DEFAULT_SETTINGS,
      now: 20,
      random: () => 0, // -> 75%
    });
    expect(result.reason).toBe("machine_buy");
    expect(result.winnerId).toBe("machine");
    expect(result.price).toBe(7_500_000);
  });

  it("on equal bids awards the earliest createdAt", () => {
    const result = settleListing({
      listing: {
        id: "l3",
        playerId: "p5",
        sellerId: "machine",
        askPrice: 8_000_000,
        listedAt: 0,
        expiresAt: 10,
        kind: "free_agent",
      },
      bids: [
        { id: "b-late", listingId: "l3", playerId: "p5", bidderId: "late", amount: 8_000_000, createdAt: 200 },
        { id: "b-early", listingId: "l3", playerId: "p5", bidderId: "early", amount: 8_000_000, createdAt: 50 },
      ],
      vm: 8_000_000,
      balances: { early: 40_000_000, late: 40_000_000 },
      settings: DEFAULT_SETTINGS,
      now: 5,
    });
    expect(result.winnerId).toBe("early");
    expect(result.price).toBe(8_000_000);
    expect(result.reason).toBe("highest_bid");
  });
});

describe("instant sell", () => {
  it("pays 60% of last purchase", () => {
    expect(instantSellPrice(10_000_000, DEFAULT_SETTINGS)).toBe(6_000_000);
  });
});
