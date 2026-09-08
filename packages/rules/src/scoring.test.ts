import { describe, expect, it } from "vitest";
import { scoreEstadisticas } from "./scoring";
import { DEFAULT_SETTINGS } from "./types";
import { instantSellPrice, maxBidAmount, minPurchasePrice, settleListing } from "./market";

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

  it("does not settle to_market before expiry", () => {
    const result = settleListing({
      listing: {
        id: "m2",
        playerId: "p4",
        sellerId: "u1",
        askPrice: 10_000_000,
        listedAt: 0,
        expiresAt: 100,
        kind: "to_market",
      },
      bids: [],
      vm: 10_000_000,
      balances: {},
      settings: DEFAULT_SETTINGS,
      now: 50,
    });
    expect(result.reason).toBe("no_sale");
  });
});

describe("instant sell", () => {
  it("pays 60% of last purchase", () => {
    expect(instantSellPrice(10_000_000, DEFAULT_SETTINGS)).toBe(6_000_000);
  });
});
