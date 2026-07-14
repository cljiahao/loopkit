import { describe, it, expect } from "vitest";
import { aggregateCustomers } from "@/lib/customers";

describe("aggregateCustomers", () => {
  it("merges a customer's cards across programs into one row", () => {
    const customers = [
      {
        phone: "+6591234567",
        name: "Jane",
        last_seen_at: "2026-07-10T00:00:00Z",
      },
    ];
    const cards = [
      {
        phone: "+6591234567",
        program_id: "p1",
        stamp_count: 3,
        reward_count: 1,
      },
      {
        phone: "+6591234567",
        program_id: "p2",
        stamp_count: 5,
        reward_count: 0,
      },
    ];
    const programNameById = { p1: "Coffee Stamps", p2: "Lucky Tap" };

    const result = aggregateCustomers(customers, cards, programNameById);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      phone: "+6591234567",
      name: "Jane",
      programNames: ["Coffee Stamps", "Lucky Tap"],
      totalStamps: 8,
      totalRewards: 1,
      lastSeenAt: "2026-07-10T00:00:00Z",
    });
  });

  it("handles a customer with no matching cards (defensive — sync should prevent this in practice)", () => {
    const customers = [
      {
        phone: "+6598765432",
        name: null,
        last_seen_at: "2026-07-01T00:00:00Z",
      },
    ];
    const result = aggregateCustomers(customers, [], {});
    expect(result[0]).toEqual({
      phone: "+6598765432",
      name: null,
      programNames: [],
      totalStamps: 0,
      totalRewards: 0,
      lastSeenAt: "2026-07-01T00:00:00Z",
    });
  });

  it("sorts by lastSeenAt descending", () => {
    const customers = [
      { phone: "+65111", name: null, last_seen_at: "2026-07-01T00:00:00Z" },
      { phone: "+65222", name: null, last_seen_at: "2026-07-10T00:00:00Z" },
    ];
    const result = aggregateCustomers(customers, [], {});
    expect(result.map((r) => r.phone)).toEqual(["+65222", "+65111"]);
  });

  it("does not duplicate a program name when a customer has 2 cards in the same program (should not happen, but defensive)", () => {
    const customers = [
      { phone: "+65333", name: null, last_seen_at: "2026-07-01T00:00:00Z" },
    ];
    const cards = [
      { phone: "+65333", program_id: "p1", stamp_count: 1, reward_count: 0 },
      { phone: "+65333", program_id: "p1", stamp_count: 1, reward_count: 0 },
    ];
    const result = aggregateCustomers(customers, cards, {
      p1: "Coffee Stamps",
    });
    expect(result[0].programNames).toEqual(["Coffee Stamps"]);
    expect(result[0].totalStamps).toBe(2);
  });
});
