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

  it("accepts a stamp program with a custom head_start_percent", () => {
    const result = saveProgramSchema.safeParse({
      type: "stamp",
      name: "Coffee card",
      stamps_required: "10",
      reward_text: "Free kopi",
      head_start: "true",
      head_start_percent: "30",
    });
    expect(result.success).toBe(true);
  });

  it("accepts a stamp program with head_start_percent absent (toggle off)", () => {
    const result = saveProgramSchema.safeParse({
      type: "stamp",
      name: "Coffee card",
      stamps_required: "10",
      reward_text: "Free kopi",
      head_start: "false",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a stamp program with head_start_percent below the 5% minimum", () => {
    const result = saveProgramSchema.safeParse({
      type: "stamp",
      name: "Coffee card",
      stamps_required: "10",
      reward_text: "Free kopi",
      head_start: "true",
      head_start_percent: "4",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a stamp program with head_start_percent above the 50% maximum", () => {
    const result = saveProgramSchema.safeParse({
      type: "stamp",
      name: "Coffee card",
      stamps_required: "10",
      reward_text: "Free kopi",
      head_start: "true",
      head_start_percent: "51",
    });
    expect(result.success).toBe(false);
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

  it("accepts a plant program with a custom head_start_percent", () => {
    const result = saveProgramSchema.safeParse({
      type: "plant",
      name: "Grow-a-kopi",
      reward_text: "Free kopi",
      visits_to_bloom: "6",
      head_start: "true",
      head_start_percent: "35",
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

  it("accepts a stamp program with variant flame", () => {
    const result = saveProgramSchema.safeParse({
      type: "stamp",
      name: "Weekly regular",
      stamps_required: "8",
      reward_text: "Free item",
      head_start: "false",
      variant: "flame",
    });
    expect(result.success).toBe(true);
  });

  it("accepts a stamp program with variant absent (defaults to dots at buildProgramFields)", () => {
    const result = saveProgramSchema.safeParse({
      type: "stamp",
      name: "Coffee card",
      stamps_required: "10",
      reward_text: "Free kopi",
      head_start: "false",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a stamp program with an invalid variant value", () => {
    const result = saveProgramSchema.safeParse({
      type: "stamp",
      name: "Coffee card",
      stamps_required: "10",
      reward_text: "Free kopi",
      head_start: "false",
      variant: "sparkles",
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
