import { describe, it, expect } from "vitest";
import { buildPlantConfig } from "@/lib/program";

describe("buildPlantConfig", () => {
  it("derives five named stages up to the bloom threshold", () => {
    const cfg = buildPlantConfig(8, "free kopi");
    expect(cfg.stages).toEqual([
      { name: "Seed", threshold: 0 },
      { name: "Sprout", threshold: 2 },
      { name: "Leafing", threshold: 4 },
      { name: "Budding", threshold: 6 },
      { name: "Bloom", threshold: 8 },
    ]);
  });
  it("floors growth at the Sprout stage and sets fixed knobs", () => {
    const cfg = buildPlantConfig(8, "free kopi");
    expect(cfg.floor_growth).toBe(2);
    expect(cfg.growth_per_visit).toBe(1);
    expect(cfg.grace_days).toBe(5);
    expect(cfg.decay_rate).toBe(0.5);
    expect(cfg.reward_text).toBe("free kopi");
  });
  it("rounds quarter thresholds for odd bloom counts", () => {
    const cfg = buildPlantConfig(6, "x");
    expect(cfg.stages.map((s) => s.threshold)).toEqual([0, 2, 3, 5, 6]);
    expect(cfg.floor_growth).toBe(2);
  });
});
