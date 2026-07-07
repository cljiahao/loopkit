import { describe, it, expect } from "vitest";
import { saveProgramSchema } from "@/lib/program";

describe("saveProgramSchema", () => {
  it("accepts a valid stamp program", () => {
    const result = saveProgramSchema.safeParse({
      type: "stamp",
      name: "Coffee card",
      stamps_required: "10",
      reward_text: "Free kopi",
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

  it("rejects an unknown program type", () => {
    const result = saveProgramSchema.safeParse({
      type: "plant",
      name: "Sprout",
      reward_text: "Free plant",
    });
    expect(result.success).toBe(false);
  });
});
