import { describe, it, expect } from "vitest";
import {
  programInputSchema,
  saveProgramSchema,
  canPrepProgram,
  getEntitlement,
} from "@/lib/program";

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

describe("canPrepProgram", () => {
  it("allows a free vendor to prep a second live-in-play program", () => {
    expect(canPrepProgram(getEntitlement(false), 1)).toBe(true);
  });
  it("blocks a free vendor already at 2 live-in-play programs", () => {
    expect(canPrepProgram(getEntitlement(false), 2)).toBe(false);
  });
  it("never blocks a Pro vendor regardless of count", () => {
    expect(canPrepProgram(getEntitlement(true), 50)).toBe(true);
  });
});

describe("saveProgramSchema reward_expiry_days", () => {
  it("accepts a stamp program with reward_expiry_days set", () => {
    const result = saveProgramSchema.safeParse({
      type: "stamp",
      name: "Coffee",
      stamps_required: "10",
      reward_text: "Free kopi",
      head_start: "false",
      reward_expiry_days: "30",
    });
    expect(result.success).toBe(true);
    if (result.success && result.data.type === "stamp") {
      expect(result.data.reward_expiry_days).toBe(30);
    }
  });

  it("defaults to undefined (never expires) when left blank", () => {
    const result = saveProgramSchema.safeParse({
      type: "stamp",
      name: "Coffee",
      stamps_required: "10",
      reward_text: "Free kopi",
      head_start: "false",
      reward_expiry_days: "",
    });
    expect(result.success).toBe(true);
    if (result.success && result.data.type === "stamp") {
      expect(result.data.reward_expiry_days).toBeUndefined();
    }
  });

  it("rejects a value outside 1..3650", () => {
    const result = saveProgramSchema.safeParse({
      type: "stamp",
      name: "Coffee",
      stamps_required: "10",
      reward_text: "Free kopi",
      head_start: "false",
      reward_expiry_days: "3651",
    });
    expect(result.success).toBe(false);
  });

  it("accepts a plant program with reward_expiry_days set", () => {
    const result = saveProgramSchema.safeParse({
      type: "plant",
      name: "Sprout",
      reward_text: "Free plant",
      visits_to_bloom: "8",
      head_start: "false",
      reward_expiry_days: "14",
    });
    expect(result.success).toBe(true);
    if (result.success && result.data.type === "plant") {
      expect(result.data.reward_expiry_days).toBe(14);
    }
  });

  it("lucky programs don't accept reward_expiry_days (not in that variant's schema)", () => {
    const result = saveProgramSchema.safeParse({
      type: "lucky",
      name: "Lucky Tap",
      reward_text: "Free item",
      win_percent: "20",
      pity_ceiling: "10",
      reward_expiry_days: "30",
    });
    expect(result.success).toBe(true);
    if (result.success && result.data.type === "lucky") {
      expect("reward_expiry_days" in result.data).toBe(false);
    }
  });
});
