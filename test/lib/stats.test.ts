import { describe, it, expect } from "vitest";
import {
  classifyActivity,
  bucketVisitsByDay,
  computeCardStats,
  pctChange,
} from "@/lib/stats";

const DAY = 24 * 60 * 60 * 1000;
const now = Date.UTC(2026, 6, 10, 4, 0, 0); // 2026-07-10 12:00 SGT
const iso = (daysAgo: number) => new Date(now - daysAgo * DAY).toISOString();

describe("classifyActivity", () => {
  it("splits stamp/visit into activity and redeem/won-visit into rewards", () => {
    const events = [
      { card_id: "c1", kind: "stamp", created_at: iso(1) },
      {
        card_id: "c1",
        kind: "visit",
        created_at: iso(2),
        payload: { won: false },
      },
      {
        card_id: "c1",
        kind: "visit",
        created_at: iso(3),
        payload: { won: true },
      },
      { card_id: "c1", kind: "redeem", created_at: iso(1) },
      { card_id: "c1", kind: "regen", created_at: iso(1) },
    ];

    const { activityEvents, rewardEvents } = classifyActivity(events);

    expect(activityEvents).toHaveLength(3); // stamp + 2 visits
    expect(rewardEvents).toHaveLength(2); // won visit + redeem
    expect(activityEvents.some((e) => e.kind === "regen")).toBe(false);
    expect(rewardEvents.some((e) => e.kind === "regen")).toBe(false);
  });
});

describe("bucketVisitsByDay", () => {
  it("returns exactly 30 zero-filled entries, most recent last", () => {
    const buckets = bucketVisitsByDay([], now);

    expect(buckets).toHaveLength(30);
    expect(buckets.every((b) => b.count === 0)).toBe(true);
    expect(buckets[29].date).toBe("2026-07-10");
    expect(buckets[0].date).toBe("2026-06-11");
  });

  it("counts activity events into their SGT calendar-day bucket", () => {
    const buckets = bucketVisitsByDay(
      [{ created_at: iso(0) }, { created_at: iso(0) }, { created_at: iso(5) }],
      now,
    );

    const today = buckets.find((b) => b.date === "2026-07-10");
    const fiveDaysAgo = buckets.find((b) => b.date === "2026-07-05");
    expect(today?.count).toBe(2);
    expect(fiveDaysAgo?.count).toBe(1);
  });
});

describe("computeCardStats", () => {
  it("returns all-zero rates for a program with no cards (no division by zero)", () => {
    const stats = computeCardStats([], [], [], now);

    expect(stats.enrolled).toBe(0);
    expect(stats.redemptionRate).toBe(0);
    expect(stats.repeatVisitRate).toBe(0);
    expect(stats.avgVisitsPerCustomer).toBe(0);
    expect(stats.active).toBe(0);
    expect(stats.lapsed).toBe(0);
  });

  it("classifies an enrolled card with no activity as lapsed, not active", () => {
    const cards = [{ id: "c1", created_at: iso(10) }];
    const stats = computeCardStats(cards, [], [], now);

    expect(stats.enrolled).toBe(1);
    expect(stats.active).toBe(0);
    expect(stats.lapsed).toBe(1);
  });

  it("counts a card with >=2 activity events toward repeatVisitRate and marks it active", () => {
    const cards = [
      { id: "c1", created_at: iso(20) },
      { id: "c2", created_at: iso(20) },
    ];
    const activityEvents = [
      { card_id: "c1", kind: "stamp", created_at: iso(1) },
      { card_id: "c1", kind: "stamp", created_at: iso(2) },
      { card_id: "c2", kind: "stamp", created_at: iso(1) },
    ];
    const stats = computeCardStats(cards, activityEvents, [], now);

    expect(stats.repeatVisitRate).toBe(0.5); // c1 repeats, c2 doesn't
    expect(stats.active).toBe(2); // both had activity within 30d
    expect(stats.visitsTotal).toBe(3);
    expect(stats.avgVisitsPerCustomer).toBe(1.5);
  });

  it("computes redemptionRate from reward events over enrolled count", () => {
    const cards = [
      { id: "c1", created_at: iso(20) },
      { id: "c2", created_at: iso(20) },
    ];
    const rewardEvents = [
      { card_id: "c1", kind: "redeem", created_at: iso(1) },
    ];
    const stats = computeCardStats(cards, [], rewardEvents, now);

    expect(stats.redemptionRate).toBe(0.5);
    expect(stats.rewardsTotal).toBe(1);
  });

  it("only counts activity/rewards within the last 7/30 days toward the windowed fields", () => {
    const cards = [{ id: "c1", created_at: iso(40) }];
    const activityEvents = [
      { card_id: "c1", kind: "stamp", created_at: iso(5) },
      { card_id: "c1", kind: "stamp", created_at: iso(35) },
    ];
    const rewardEvents = [
      { card_id: "c1", kind: "redeem", created_at: iso(35) },
    ];
    const stats = computeCardStats(cards, activityEvents, rewardEvents, now);

    expect(stats.visitsTotal).toBe(2);
    expect(stats.visits30d).toBe(1); // only the iso(5) stamp
    expect(stats.rewardsTotal).toBe(1);
    expect(stats.rewards30d).toBe(0); // the redeem is 35d ago
    expect(stats.newThisWeek).toBe(0); // card enrolled 40d ago
  });

  it("computes prior-period deltas from the 31-60 day window", () => {
    const cards = [{ id: "c1", created_at: iso(70) }];
    const activityEvents = [
      { card_id: "c1", kind: "stamp", created_at: iso(5) }, // current 30d
      { card_id: "c1", kind: "stamp", created_at: iso(5) }, // current 30d
      { card_id: "c1", kind: "stamp", created_at: iso(45) }, // prior 31-60d
    ];
    const rewardEvents = [
      { card_id: "c1", kind: "redeem", created_at: iso(5) }, // current 30d
      { card_id: "c1", kind: "redeem", created_at: iso(45) }, // prior 31-60d
      { card_id: "c1", kind: "redeem", created_at: iso(45) }, // prior 31-60d
    ];
    const stats = computeCardStats(cards, activityEvents, rewardEvents, now);

    expect(stats.visits30d).toBe(2);
    expect(stats.visitsDelta).toBe(100); // 2 vs prior 1 -> +100%
    expect(stats.rewards30d).toBe(1);
    expect(stats.rewardsDelta).toBe(-50); // 1 vs prior 2 -> -50%
  });

  it("handles events exactly at the 30d/60d boundaries via the half-open interval", () => {
    const cards = [{ id: "c1", created_at: iso(70) }];
    // iso(30) === cutoff30d exactly; iso(60) === cutoff60d exactly.
    const activityEvents = [
      { card_id: "c1", kind: "stamp", created_at: iso(30) },
      { card_id: "c1", kind: "stamp", created_at: iso(60) },
    ];
    const stats = computeCardStats(cards, activityEvents, [], now);

    // iso(30) is >= cutoff30d, so it lands in the current 30d window (the
    // existing current-window filter is an inclusive `>=` on cutoff30d).
    expect(stats.visits30d).toBe(1);
    // iso(60) falls in the half-open prior interval [cutoff60d, cutoff30d)
    // since t === cutoff60d satisfies `>=`. iso(30) does NOT land in the
    // prior window (t === cutoff30d fails the strict `< cutoff30d` check),
    // so each event lands in exactly one window: no double-counting, no gap.
    expect(stats.visitsDelta).toBe(0); // current 1 vs prior 1 -> 0% change
  });

  it("returns null activeDelta/visitsDelta/rewardsDelta when nothing happened in the prior window", () => {
    const cards = [{ id: "c1", created_at: iso(10) }];
    const activityEvents = [
      { card_id: "c1", kind: "stamp", created_at: iso(1) },
    ];
    const stats = computeCardStats(cards, activityEvents, [], now);

    expect(stats.visitsDelta).toBeNull(); // prior is 0
    expect(stats.rewardsDelta).toBeNull();
    expect(stats.activeDelta).toBeNull();
  });
});

describe("pctChange", () => {
  it("returns null when prior is 0 (undefined growth from nothing)", () => {
    expect(pctChange(5, 0)).toBeNull();
    expect(pctChange(0, 0)).toBeNull();
  });

  it("computes positive percent change", () => {
    expect(pctChange(15, 10)).toBe(50);
  });

  it("computes negative percent change", () => {
    expect(pctChange(5, 10)).toBe(-50);
  });

  it("returns -100 when current drops to zero from a nonzero prior", () => {
    expect(pctChange(0, 10)).toBe(-100);
  });
});
