import { describe, it, expect } from "vitest";
import { segmentWinPercent, overallWinPercent } from "@/lib/program-config";

describe("segmentWinPercent", () => {
  it("computes each segment's share of the total weight, rounded", () => {
    const segments = [
      { label: "Try again", weight: 5, is_reward: false },
      { label: "Free item", weight: 1, is_reward: true },
    ];
    expect(segmentWinPercent(segments)).toEqual([83, 17]);
  });

  it("returns 0 for every segment when total weight is 0", () => {
    expect(
      segmentWinPercent([{ label: "x", weight: 0, is_reward: false }]),
    ).toEqual([0]);
  });
});

describe("overallWinPercent", () => {
  it("sums only the reward segments' weight share", () => {
    const segments = [
      { label: "Try again", weight: 6, is_reward: false },
      { label: "10% off", weight: 3, is_reward: true },
      { label: "Free drink", weight: 1, is_reward: true },
    ];
    expect(overallWinPercent(segments)).toBe(40);
  });

  it("returns 0 when no segment is a reward", () => {
    const segments = [
      { label: "Try again", weight: 5, is_reward: false },
      { label: "Also try again", weight: 5, is_reward: false },
    ];
    expect(overallWinPercent(segments)).toBe(0);
  });

  it("returns 0 when total weight is 0", () => {
    expect(
      overallWinPercent([{ label: "x", weight: 0, is_reward: false }]),
    ).toBe(0);
  });
});
