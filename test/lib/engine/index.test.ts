import { describe, it, expect } from "vitest";
import { getProgress } from "@/lib/engine";

const now = new Date("2026-07-07T00:00:00Z");

describe("getProgress", () => {
  it("computes stamp progress from the config blob", () => {
    const program = {
      type: "stamp",
      config: { stamps_required: 8, reward_text: "free kopi" },
      stamps_required: 8,
      reward_text: "free kopi",
    };
    const card = { state: { stamp_count: 3 }, stamp_count: 3, reward_count: 0 };
    const p = getProgress(program, card, now);
    expect(p.view).toEqual({ kind: "dots", filled: 3, total: 8 });
    expect(p.rewardReady).toBe(false);
  });
  it("falls back to legacy columns when config is empty", () => {
    const program = {
      type: "stamp",
      config: {},
      stamps_required: 5,
      reward_text: "free tea",
    };
    const card = { state: {}, stamp_count: 5, reward_count: 0 };
    const p = getProgress(program, card, now);
    expect(p.view).toEqual({ kind: "dots", filled: 5, total: 5 });
    expect(p.rewardReady).toBe(true);
  });
});
