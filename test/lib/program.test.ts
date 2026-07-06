import { describe, it, expect } from "vitest";
import { programInputSchema } from "@/lib/program";

describe("programInputSchema", () => {
  it("accepts a valid program", () => {
    const result = programInputSchema.safeParse({
      name: "Coffee card",
      stamps_required: 10,
      reward_text: "Free kopi",
    });
    expect(result.success).toBe(true);
  });

  it("rejects stamps_required below 2", () => {
    const result = programInputSchema.safeParse({
      name: "Coffee card",
      stamps_required: 1,
      reward_text: "Free kopi",
    });
    expect(result.success).toBe(false);
  });

  it("rejects stamps_required above 20", () => {
    const result = programInputSchema.safeParse({
      name: "Coffee card",
      stamps_required: 21,
      reward_text: "Free kopi",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an empty name", () => {
    const result = programInputSchema.safeParse({
      name: "",
      stamps_required: 10,
      reward_text: "Free kopi",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an empty reward_text", () => {
    const result = programInputSchema.safeParse({
      name: "Coffee card",
      stamps_required: 10,
      reward_text: "",
    });
    expect(result.success).toBe(false);
  });
});
