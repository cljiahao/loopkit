import { describe, it, expect } from "vitest";
import { luckyStrategy } from "@/lib/engine/lucky";

const cfg = {
  win_probability: 0.2,
  pity_ceiling: 8,
  cooldown_visits: 1,
  reward_text: "free topping",
};
const now = new Date("2026-07-07T00:00:00Z");
const visit = (roll: number) => ({ kind: "visit" as const, payload: { roll } });

describe("luckyStrategy", () => {
  it("wins when roll is under the probability and cooldown satisfied", () => {
    const r = luckyStrategy.apply(
      visit(0.05),
      { visits_since_win: 3, total_wins: 0 },
      cfg,
      now,
    );
    expect(r.rewardUnlocked).toBe(true);
    expect(r.state).toEqual({ visits_since_win: 0, total_wins: 1 });
  });
  it("loses when roll is above the probability", () => {
    const r = luckyStrategy.apply(
      visit(0.9),
      { visits_since_win: 3, total_wins: 0 },
      cfg,
      now,
    );
    expect(r.rewardUnlocked).toBe(false);
    expect(r.state).toEqual({ visits_since_win: 4, total_wins: 0 });
  });
  it("cannot win two in a row (cooldown)", () => {
    const r = luckyStrategy.apply(
      visit(0.0),
      { visits_since_win: 0, total_wins: 1 },
      cfg,
      now,
    );
    expect(r.rewardUnlocked).toBe(false);
    expect(r.state.visits_since_win).toBe(1);
  });
  it("guarantees a win at the pity ceiling regardless of roll", () => {
    const r = luckyStrategy.apply(
      visit(0.99),
      { visits_since_win: 7, total_wins: 0 },
      cfg,
      now,
    );
    expect(r.rewardUnlocked).toBe(true);
    expect(r.state.visits_since_win).toBe(0);
  });
  it("progress exposes visitsSinceWin/pityCeiling as a lucky view", () => {
    const p = luckyStrategy.progress(
      { visits_since_win: 3, total_wins: 0 },
      cfg,
      now,
    );
    expect(p.view).toEqual({
      kind: "lucky",
      visitsSinceWin: 3,
      pityCeiling: 8,
    });
  });
});
