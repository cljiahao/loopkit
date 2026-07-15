import { describe, it, expect } from "vitest";
import { buildProgramFields, type SaveProgramInput } from "@/lib/program";

describe("buildProgramFields", () => {
  it("builds a stamp program's fields", () => {
    const result = buildProgramFields({
      type: "stamp",
      name: "Coffee card",
      stamps_required: 10,
      reward_text: "Free kopi",
      head_start: true,
      expiry_days: undefined,
    } as SaveProgramInput);

    expect(result).toEqual({
      type: "stamp",
      stampsRequired: 10,
      headStart: true,
      headStartPercent: 20,
      config: {
        stamps_required: 10,
        reward_text: "Free kopi",
        variant: "dots",
      },
    });
  });

  it("defaults headStartPercent to 20 when absent from a stamp program", () => {
    const result = buildProgramFields({
      type: "stamp",
      name: "Coffee card",
      stamps_required: 10,
      reward_text: "Free kopi",
      head_start: false,
      head_start_percent: undefined,
      expiry_days: undefined,
    } as SaveProgramInput);

    expect(result.headStartPercent).toBe(20);
  });

  it("passes through a custom headStartPercent for a stamp program", () => {
    const result = buildProgramFields({
      type: "stamp",
      name: "Coffee card",
      stamps_required: 10,
      reward_text: "Free kopi",
      head_start: true,
      head_start_percent: 35,
      expiry_days: undefined,
    } as SaveProgramInput);

    expect(result.headStartPercent).toBe(35);
  });

  it("defaults headStartPercent to 20 for types that never use it", () => {
    const result = buildProgramFields({
      type: "lucky",
      name: "Lucky tap",
      reward_text: "Free item",
      win_percent: 20,
      pity_ceiling: 8,
      expiry_days: undefined,
    } as SaveProgramInput);

    expect(result.headStartPercent).toBe(20);
  });

  it("builds a lucky program's fields, converting win_percent to a probability", () => {
    const result = buildProgramFields({
      type: "lucky",
      name: "Lucky tap",
      reward_text: "Free item",
      win_percent: 20,
      pity_ceiling: 8,
      expiry_days: undefined,
    } as SaveProgramInput);

    expect(result.type).toBe("lucky");
    expect(result.stampsRequired).toBe(8);
    expect(result.headStart).toBe(false);
    expect(result.config).toMatchObject({
      win_probability: 0.2,
      pity_ceiling: 8,
      cooldown_visits: 0,
    });
  });

  it("builds a plant program's fields via buildPlantConfig", () => {
    const result = buildProgramFields({
      type: "plant",
      name: "Grow-a-kopi",
      reward_text: "Free kopi",
      visits_to_bloom: 6,
      head_start: false,
      expiry_days: undefined,
    } as SaveProgramInput);

    expect(result.type).toBe("plant");
    expect(result.stampsRequired).toBe(6);
    expect(result.config).toMatchObject({ reward_text: "Free kopi" });
  });

  it("builds a stamp program's config with variant flame", () => {
    const result = buildProgramFields({
      type: "stamp",
      name: "Weekly regular",
      stamps_required: 8,
      reward_text: "Free item",
      head_start: false,
      variant: "flame",
      expiry_days: undefined,
    } as SaveProgramInput);

    expect(result.config).toMatchObject({
      stamps_required: 8,
      reward_text: "Free item",
      variant: "flame",
    });
  });

  it("defaults a stamp program's config variant to dots when absent", () => {
    const result = buildProgramFields({
      type: "stamp",
      name: "Coffee card",
      stamps_required: 10,
      reward_text: "Free kopi",
      head_start: true,
      expiry_days: undefined,
    } as SaveProgramInput);

    expect(result.config).toMatchObject({ variant: "dots" });
  });

  it("builds a wheel/scratch program's fields via buildChanceConfig, defaulting the pity ceiling", () => {
    const result = buildProgramFields({
      type: "wheel",
      name: "Spin to win",
      reward_text: "Free item",
      segments: [
        { label: "Try again", weight: 5, is_reward: false },
        { label: "Free item", weight: 1, is_reward: true },
      ],
      pity_ceiling: undefined,
      expiry_days: undefined,
    } as SaveProgramInput);

    expect(result.type).toBe("wheel");
    expect(result.stampsRequired).toBe(10);
    expect(result.headStart).toBe(false);
  });
});
