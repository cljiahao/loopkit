import { describe, it, expect } from "vitest";
import { applyVisit } from "@/lib/engine";

const now = new Date("2026-07-07T00:00:00Z");

describe("applyVisit", () => {
  it("routes a lucky program to the lucky strategy", () => {
    const program = {
      type: "lucky",
      config: {
        win_probability: 0.2,
        pity_ceiling: 8,
        cooldown_visits: 1,
        reward_text: "free topping",
      },
      stamps_required: 0,
      reward_text: "free topping",
    };
    const card = {
      state: { visits_since_win: 7, total_wins: 0 },
      stamp_count: 0,
      reward_count: 0,
    };
    const r = applyVisit(
      program,
      card,
      { kind: "visit", payload: { roll: 0.99 } },
      now,
    );
    expect(r.rewardUnlocked).toBe(true);
    expect(r.state).toEqual({ visits_since_win: 0, total_wins: 1 });
  });
  it("routes a stamp program to the stamp strategy", () => {
    const program = {
      type: "stamp",
      config: { stamps_required: 5, reward_text: "x" },
      stamps_required: 5,
      reward_text: "x",
    };
    const card = { state: { stamp_count: 4 }, stamp_count: 4, reward_count: 0 };
    const r = applyVisit(program, card, { kind: "visit" }, now);
    expect(r.rewardUnlocked).toBe(true);
    expect((r.state as { stamp_count: number }).stamp_count).toBe(5);
  });
});
