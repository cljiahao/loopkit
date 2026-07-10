import { describe, it, expect } from "vitest";
import { TEMPLATES } from "@/lib/templates";
import { saveProgramSchema } from "@/lib/program";

describe("TEMPLATES", () => {
  it("has at least one template per engine type", () => {
    const types = new Set(TEMPLATES.map((t) => t.type));
    expect(types).toEqual(
      new Set(["stamp", "lucky", "plant", "wheel", "scratch", "streak"]),
    );
  });

  it("has unique keys", () => {
    const keys = TEMPLATES.map((t) => t.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("every template's defaults satisfy its type's saveProgramSchema branch", () => {
    for (const template of TEMPLATES) {
      const payload: Record<string, unknown> = {
        type: template.type,
        name: template.defaults.name,
        reward_text: template.defaults.reward_text,
        head_start: "false",
      };
      if (template.type === "stamp") {
        payload.stamps_required = template.defaults.stamps_required;
      }
      if (template.type === "plant") {
        payload.visits_to_bloom = template.defaults.visits_to_bloom;
      }
      if (template.type === "lucky") {
        payload.win_percent = template.defaults.win_percent;
        payload.pity_ceiling = template.defaults.pity_ceiling;
      }
      if (template.type === "streak") {
        payload.period_days = template.defaults.period_days;
        payload.target_streak = template.defaults.target_streak;
      }
      if (template.type === "wheel" || template.type === "scratch") {
        payload.segments = [
          { label: "Try again", weight: 5, is_reward: false },
          { label: "Free item", weight: 1, is_reward: true },
        ];
      }

      const result = saveProgramSchema.safeParse(payload);
      expect(
        result.success,
        `template "${template.key}" failed: ${JSON.stringify(!result.success && result.error.issues)}`,
      ).toBe(true);
    }
  });
});
