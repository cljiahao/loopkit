import { describe, it, expect } from "vitest";
import { stampStrategy } from "@/lib/engine/stamp";

const cfg = { stamps_required: 5, reward_text: "free kopi" };
const now = new Date("2026-07-07T00:00:00Z");

describe("stampStrategy", () => {
  it("defaults to an empty card", () => {
    expect(stampStrategy.defaults(cfg)).toEqual({
      stamp_count: 0,
      reward_count: 0,
    });
  });
  it("adds a stamp and caps at the requirement", () => {
    let s = { stamp_count: 4, reward_count: 0 };
    s = stampStrategy.apply({ kind: "visit" }, s, cfg, now).state;
    expect(s.stamp_count).toBe(5);
    const capped = stampStrategy.apply({ kind: "visit" }, s, cfg, now);
    expect(capped.state.stamp_count).toBe(5);
  });
  it("reports rewardReady only at the requirement", () => {
    expect(
      stampStrategy.progress({ stamp_count: 4, reward_count: 0 }, cfg, now)
        .rewardReady,
    ).toBe(false);
    expect(
      stampStrategy.progress({ stamp_count: 5, reward_count: 0 }, cfg, now)
        .rewardReady,
    ).toBe(true);
  });
  it("unlocks the reward on the stamp that reaches the requirement", () => {
    const r = stampStrategy.apply(
      { kind: "visit" },
      { stamp_count: 4, reward_count: 0 },
      cfg,
      now,
    );
    expect(r.rewardUnlocked).toBe(true);
  });
  it("redeem resets stamps and increments reward_count", () => {
    expect(
      stampStrategy.redeem({ stamp_count: 5, reward_count: 1 }, cfg),
    ).toEqual({ stamp_count: 0, reward_count: 2 });
  });
  it("progress renders a dot view", () => {
    expect(
      stampStrategy.progress({ stamp_count: 3, reward_count: 0 }, cfg, now)
        .view,
    ).toEqual({ kind: "dots", filled: 3, total: 5, variant: "dots" });
  });
});

describe("stampStrategy flame variant", () => {
  const flameCfg = {
    stamps_required: 8,
    reward_text: "free kopi",
    variant: "flame" as const,
  };

  it("stage 0 (Spark) below the 50% threshold", () => {
    const p = stampStrategy.progress(
      { stamp_count: 2, reward_count: 0 },
      flameCfg,
      now,
    );
    expect(p.view).toEqual({
      kind: "flame",
      filled: 2,
      total: 8,
      stage: 0,
      stageName: "Spark",
      totalStages: 3,
    });
  });

  it("stage 1 (Inner Flame) at exactly the 50% threshold", () => {
    const p = stampStrategy.progress(
      { stamp_count: 4, reward_count: 0 },
      flameCfg,
      now,
    );
    expect(p.view).toEqual({
      kind: "flame",
      filled: 4,
      total: 8,
      stage: 1,
      stageName: "Inner Flame",
      totalStages: 3,
    });
  });

  it("stage 2 (Full Blaze) at 100%", () => {
    const p = stampStrategy.progress(
      { stamp_count: 8, reward_count: 0 },
      flameCfg,
      now,
    );
    expect(p.view).toEqual({
      kind: "flame",
      filled: 8,
      total: 8,
      stage: 2,
      stageName: "Full Blaze",
      totalStages: 3,
    });
  });

  it("rounds the 50% threshold sensibly for an odd stamps_required", () => {
    const oddCfg = { ...flameCfg, stamps_required: 7 };
    // round(7 * 0.5) = 4
    const below = stampStrategy.progress(
      { stamp_count: 3, reward_count: 0 },
      oddCfg,
      now,
    );
    expect(below.view).toMatchObject({ stage: 0 });
    const at = stampStrategy.progress(
      { stamp_count: 4, reward_count: 0 },
      oddCfg,
      now,
    );
    expect(at.view).toMatchObject({ stage: 1 });
  });

  it("dots variant (default, no variant field) is unaffected", () => {
    const p = stampStrategy.progress(
      { stamp_count: 3, reward_count: 0 },
      cfg,
      now,
    );
    expect(p.view).toEqual({
      kind: "dots",
      filled: 3,
      total: 5,
      variant: "dots",
    });
  });
});

describe("stampStrategy points variant", () => {
  const pointsCfg = {
    stamps_required: 100,
    reward_text: "free kopi",
    variant: "points" as const,
    points_per_visit: 10,
  };

  it("apply() increments by points_per_visit instead of 1", () => {
    const r = stampStrategy.apply(
      { kind: "visit" },
      { stamp_count: 40, reward_count: 0 },
      pointsCfg,
      now,
    );
    expect(r.state.stamp_count).toBe(50);
  });

  it("apply() caps at stamps_required even when points_per_visit overshoots", () => {
    const r = stampStrategy.apply(
      { kind: "visit" },
      { stamp_count: 95, reward_count: 0 },
      pointsCfg,
      now,
    );
    expect(r.state.stamp_count).toBe(100);
    expect(r.rewardUnlocked).toBe(true);
  });

  it("apply() defaults to +1 when points_per_visit is absent, even with variant points", () => {
    const cfgNoAmount = {
      stamps_required: 100,
      reward_text: "free kopi",
      variant: "points" as const,
    };
    const r = stampStrategy.apply(
      { kind: "visit" },
      { stamp_count: 40, reward_count: 0 },
      cfgNoAmount,
      now,
    );
    expect(r.state.stamp_count).toBe(41);
  });

  it("progress() tags the dots view with variant: points and uses a points-worded label", () => {
    const p = stampStrategy.progress(
      { stamp_count: 40, reward_count: 0 },
      pointsCfg,
      now,
    );
    expect(p.view).toEqual({
      kind: "dots",
      filled: 40,
      total: 100,
      variant: "points",
    });
    expect(p.label).toBe("40/100 points");
  });

  it("redeem() is unaffected by points_per_visit — still resets to 0 and increments reward_count", () => {
    expect(
      stampStrategy.redeem({ stamp_count: 100, reward_count: 1 }, pointsCfg),
    ).toEqual({ stamp_count: 0, reward_count: 2 });
  });
});
