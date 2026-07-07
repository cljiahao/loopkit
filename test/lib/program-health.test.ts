import { describe, it, expect } from "vitest";
import { programHealth } from "@/lib/program-health";

const DAY = 24 * 60 * 60 * 1000;

describe("programHealth", () => {
  const now = Date.UTC(2026, 6, 7);
  const iso = (daysAgo: number) => new Date(now - daysAgo * DAY).toISOString();

  it("is 'new' for a fresh program with few customers", () => {
    expect(
      programHealth(
        { customer_count: 1, last_activity_at: null, created_at: iso(2) },
        now,
      ),
    ).toBe("new");
  });

  it("prefers 'new' over 'quiet' even with no activity", () => {
    // A just-created program hasn't had time to be active — it must not be
    // flagged as dark on day one.
    expect(
      programHealth(
        { customer_count: 0, last_activity_at: null, created_at: iso(0) },
        now,
      ),
    ).toBe("new");
  });

  it("is 'active' when recently stamped", () => {
    expect(
      programHealth(
        { customer_count: 20, last_activity_at: iso(1), created_at: iso(60) },
        now,
      ),
    ).toBe("active");
  });

  it("is 'quiet' when no activity for ~14 days", () => {
    expect(
      programHealth(
        { customer_count: 20, last_activity_at: iso(20), created_at: iso(60) },
        now,
      ),
    ).toBe("quiet");
  });

  it("is 'quiet' for an established program that never had activity", () => {
    expect(
      programHealth(
        { customer_count: 10, last_activity_at: null, created_at: iso(60) },
        now,
      ),
    ).toBe("quiet");
  });

  it("leaves 'new' once the customer ceiling is passed", () => {
    // Plenty of customers even in the first week reads as a real active shop.
    expect(
      programHealth(
        { customer_count: 8, last_activity_at: iso(1), created_at: iso(3) },
        now,
      ),
    ).toBe("active");
  });
});
