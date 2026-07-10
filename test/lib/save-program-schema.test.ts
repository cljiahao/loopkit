import { describe, it, expect } from "vitest";
import { saveProgramSchema } from "@/lib/program";

describe("saveProgramSchema", () => {
  it("accepts a valid stamp program", () => {
    const result = saveProgramSchema.safeParse({
      type: "stamp",
      name: "Coffee card",
      stamps_required: "10",
      reward_text: "Free kopi",
      head_start: "false",
    });
    expect(result.success).toBe(true);
  });

  it("accepts a valid lucky program", () => {
    const result = saveProgramSchema.safeParse({
      type: "lucky",
      name: "Lucky topping",
      reward_text: "Free topping",
      win_percent: "20",
      pity_ceiling: "8",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a lucky program with an out-of-range win chance", () => {
    const result = saveProgramSchema.safeParse({
      type: "lucky",
      name: "Lucky topping",
      reward_text: "Free topping",
      win_percent: "1",
      pity_ceiling: "8",
    });
    expect(result.success).toBe(false);
  });

  it("accepts a valid plant program", () => {
    const result = saveProgramSchema.safeParse({
      type: "plant",
      name: "Grow-a-kopi",
      reward_text: "Free kopi",
      visits_to_bloom: "6",
      head_start: "false",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a plant program below the four-visit minimum (stages must stay distinct)", () => {
    const result = saveProgramSchema.safeParse({
      type: "plant",
      name: "Grow-a-kopi",
      reward_text: "Free kopi",
      visits_to_bloom: "3",
      head_start: "false",
    });
    expect(result.success).toBe(false);
  });

  it("accepts a plant program at the four-visit minimum", () => {
    const result = saveProgramSchema.safeParse({
      type: "plant",
      name: "Grow-a-kopi",
      reward_text: "Free kopi",
      visits_to_bloom: "4",
      head_start: "false",
    });
    expect(result.success).toBe(true);
  });

  it("accepts a valid streak program", () => {
    const result = saveProgramSchema.safeParse({
      type: "streak",
      name: "Weekly regular",
      reward_text: "Free kopi",
      period_days: "7",
      target_streak: "4",
      head_start: "false",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a streak program with a target below the two-streak minimum", () => {
    const result = saveProgramSchema.safeParse({
      type: "streak",
      name: "Weekly regular",
      reward_text: "Free kopi",
      period_days: "7",
      target_streak: "1",
      head_start: "false",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an unknown program type", () => {
    const result = saveProgramSchema.safeParse({
      type: "mystery",
      name: "Sprout",
      reward_text: "Free plant",
    });
    expect(result.success).toBe(false);
  });
});
