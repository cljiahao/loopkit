import { describe, expect, it } from "vitest";
import {
  PROGRAM_TYPE_BADGE,
  describeProgram,
  programDetails,
} from "./program-display";

describe("PROGRAM_TYPE_BADGE", () => {
  it("has an entry for every program type", () => {
    for (const type of ["stamp", "lucky", "plant", "wheel", "scratch"]) {
      expect(PROGRAM_TYPE_BADGE[type]).toBeDefined();
    }
  });
});

describe("describeProgram", () => {
  it("describes a stamp program", () => {
    expect(
      describeProgram({
        type: "stamp",
        stamps_required: 8,
        reward_text: "a free coffee",
        config: {},
      }),
    ).toBe("Buy 8, get 1 a free coffee");
  });

  it("describes a lucky program using config.win_probability", () => {
    expect(
      describeProgram({
        type: "lucky",
        stamps_required: 10,
        reward_text: "a free drink",
        config: { win_probability: 0.2 },
      }),
    ).toBe("Every visit has a 20% chance to win a free drink");
  });

  it("describes a plant program", () => {
    expect(
      describeProgram({
        type: "plant",
        stamps_required: 12,
        reward_text: "a free bouquet",
        config: {},
      }),
    ).toBe("Water it 12 times to bloom a free bouquet");
  });

  it("describes a wheel program", () => {
    expect(
      describeProgram({
        type: "wheel",
        stamps_required: 10,
        reward_text: "a free dessert",
        config: {},
      }),
    ).toBe("Spin the wheel for a chance to win a free dessert");
  });

  it("describes a scratch program", () => {
    expect(
      describeProgram({
        type: "scratch",
        stamps_required: 10,
        reward_text: "a free side",
        config: {},
      }),
    ).toBe("Scratch for a chance to win a free side");
  });
});

describe("programDetails", () => {
  it("shows 'Never expires' when expiry_days is null", () => {
    expect(programDetails({ expiry_days: null, head_start: false })).toEqual([
      "Never expires",
    ]);
  });

  it("shows the reset window when expiry_days is set", () => {
    expect(programDetails({ expiry_days: 30, head_start: false })).toEqual([
      "Resets after 30 days",
    ]);
  });

  it("adds a head-start note when head_start is true", () => {
    expect(programDetails({ expiry_days: null, head_start: true })).toEqual([
      "Never expires",
      "New customers get a head start",
    ]);
  });

  it("combines a reset window and head-start note", () => {
    expect(programDetails({ expiry_days: 14, head_start: true })).toEqual([
      "Resets after 14 days",
      "New customers get a head start",
    ]);
  });
});
