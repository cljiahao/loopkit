import { describe, it, expect } from "vitest";
import { plantStrategy, type PlantConfig } from "@/lib/engine/plant";

const cfg: PlantConfig = {
  stages: [
    { name: "Seed", threshold: 0 },
    { name: "Sprout", threshold: 2 },
    { name: "Leafing", threshold: 4 },
    { name: "Budding", threshold: 6 },
    { name: "Bloom", threshold: 8 },
  ],
  growth_per_visit: 1,
  grace_days: 5,
  decay_rate: 0.5,
  floor_growth: 2,
  reward_text: "free kopi",
};
const at = (s: string) => new Date(s);
const day0 = at("2026-07-01T00:00:00Z");

describe("plantStrategy", () => {
  it("starts as a seed", () => {
    expect(plantStrategy.defaults(cfg)).toEqual({
      growth: 0,
      last_visit_at: null,
      blooms: 0,
    });
  });
  it("grows one step per visit and stamps last_visit_at", () => {
    const r = plantStrategy.apply(
      { kind: "visit" },
      { growth: 3, last_visit_at: day0.toISOString(), blooms: 0 },
      cfg,
      day0,
    );
    expect(r.state.growth).toBe(4);
    expect(r.state.last_visit_at).toBe(day0.toISOString());
  });
  it("does not wilt within the grace period", () => {
    const p = plantStrategy.progress(
      { growth: 6, last_visit_at: day0.toISOString(), blooms: 0 },
      cfg,
      at("2026-07-05T00:00:00Z"),
    );
    expect(p.view).toMatchObject({ kind: "plant", wilting: false });
    expect(p.stage).toBe("Budding");
  });
  it("wilts after grace but never below the floor", () => {
    const p = plantStrategy.progress(
      { growth: 6, last_visit_at: day0.toISOString(), blooms: 0 },
      cfg,
      at("2026-07-30T00:00:00Z"),
    );
    expect(p.view).toMatchObject({ kind: "plant", wilting: true });
    expect(p.stage).toBe("Sprout");
  });
  it("blooms when a visit reaches the top threshold", () => {
    const r = plantStrategy.apply(
      { kind: "visit" },
      { growth: 7, last_visit_at: day0.toISOString(), blooms: 0 },
      cfg,
      day0,
    );
    expect(r.rewardUnlocked).toBe(true);
    expect(plantStrategy.progress(r.state, cfg, day0).rewardReady).toBe(true);
  });
  it("redeem resets to a seed and counts the bloom", () => {
    const s = plantStrategy.redeem(
      { growth: 8, last_visit_at: day0.toISOString(), blooms: 1 },
      cfg,
    );
    expect(s.growth).toBe(0);
    expect(s.blooms).toBe(2);
  });
});
