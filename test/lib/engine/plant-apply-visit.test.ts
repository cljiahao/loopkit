import { describe, it, expect } from "vitest";
import { applyVisit, getProgress } from "@/lib/engine";

const program = {
  type: "plant",
  config: {
    stages: [
      { name: "Seed", threshold: 0 },
      { name: "Sprout", threshold: 2 },
      { name: "Bloom", threshold: 4 },
    ],
    growth_per_visit: 1,
    grace_days: 5,
    decay_rate: 0.5,
    floor_growth: 2,
    reward_text: "x",
  },
  stamps_required: 4,
  reward_text: "x",
};
const now = new Date("2026-07-01T00:00:00Z");

describe("plant via engine", () => {
  it("routes plant visits + progress through the plant strategy", () => {
    const card = {
      state: { growth: 3, last_visit_at: now.toISOString(), blooms: 0 },
      stamp_count: 0,
      reward_count: 0,
    };
    const r = applyVisit(program, card, { kind: "visit" }, now);
    expect(r.rewardUnlocked).toBe(true);
    const p = getProgress(program, { ...card, state: r.state }, now);
    expect(p.view.kind).toBe("plant");
  });
});
