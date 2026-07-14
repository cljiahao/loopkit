import { describe, expect, it } from "vitest";
import { PROGRAM_TYPE_BADGE, describeProgram } from "./program-display";

describe("PROGRAM_TYPE_BADGE", () => {
  it("has an entry for every program type", () => {
    for (const type of [
      "stamp",
      "lucky",
      "plant",
      "wheel",
      "scratch",
      "streak",
    ]) {
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

  it("describes a streak program", () => {
    expect(
      describeProgram({
        type: "streak",
        stamps_required: 5,
        reward_text: "a free meal",
        config: {},
      }),
    ).toBe("Check in 5 times in a row to unlock a free meal");
  });
});
