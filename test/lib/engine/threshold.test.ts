import { describe, it, expect } from "vitest";
import { countThresholdCrossings } from "@/lib/engine/threshold";

describe("countThresholdCrossings", () => {
  it("returns 0 when no new multiple of `required` is crossed", () => {
    expect(countThresholdCrossings(1, 2, 10)).toBe(0);
  });

  it("returns 1 when incrementing by 1 lands exactly on a multiple", () => {
    expect(countThresholdCrossings(9, 10, 10)).toBe(1);
  });

  it("returns 1 when a jump lands strictly past one multiple", () => {
    expect(countThresholdCrossings(8, 13, 10)).toBe(1);
  });

  it("returns 2 when a large jump (e.g. points_per_visit) crosses two multiples in one call", () => {
    expect(countThresholdCrossings(8, 28, 10)).toBe(2);
  });

  it("returns 0 for the first-ever value that hasn't reached the threshold yet", () => {
    expect(countThresholdCrossings(0, 5, 10)).toBe(0);
  });

  it("returns 1 for the first-ever value landing exactly on the threshold", () => {
    expect(countThresholdCrossings(0, 10, 10)).toBe(1);
  });
});
