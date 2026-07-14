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
      bloomed: false,
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
  it("keeps growing past the bloom threshold instead of capping", () => {
    const r = plantStrategy.apply(
      { kind: "visit" },
      {
        growth: 8,
        last_visit_at: day0.toISOString(),
        blooms: 0,
        bloomed: true,
      },
      cfg,
      day0,
    );
    expect(r.state.growth).toBe(9);
    expect(r.rewardUnlocked).toBe(false);
  });
  it("banks the bloom so it survives idle decay", () => {
    const { state } = plantStrategy.apply(
      { kind: "visit" },
      { growth: 7, last_visit_at: day0.toISOString(), blooms: 0 },
      cfg,
      day0,
    );
    expect(state.bloomed).toBe(true);
    const later = plantStrategy.progress(
      state,
      cfg,
      at("2026-07-30T00:00:00Z"),
    );
    expect(later.view).toMatchObject({ kind: "plant", wilting: true });
    expect(later.rewardReady).toBe(true);
  });
  it("keeps rewardReady false for a pre-bloomed card via the growth fallback", () => {
    const p = plantStrategy.progress(
      { growth: 3, last_visit_at: day0.toISOString(), blooms: 0 },
      cfg,
      day0,
    );
    expect(p.rewardReady).toBe(false);
  });
  it("redeem carries over exactly zero when growth equals the threshold", () => {
    const s = plantStrategy.redeem(
      {
        growth: 8,
        last_visit_at: day0.toISOString(),
        blooms: 1,
        bloomed: true,
      },
      cfg,
    );
    expect(s.growth).toBe(0);
    expect(s.blooms).toBe(2);
    expect(s.bloomed).toBe(false);
    expect(plantStrategy.progress(s, cfg, day0).rewardReady).toBe(false);
  });
  it("redeem carries over the excess when growth exceeds the threshold", () => {
    const s = plantStrategy.redeem(
      {
        growth: 11,
        last_visit_at: day0.toISOString(),
        blooms: 1,
        bloomed: true,
      },
      cfg,
    );
    expect(s.growth).toBe(3);
    expect(s.blooms).toBe(2);
    expect(s.bloomed).toBe(false);
  });
  it("stays reward-ready after redeem when the carried-over growth still meets the threshold", () => {
    const s = plantStrategy.redeem(
      {
        growth: 16,
        last_visit_at: day0.toISOString(),
        blooms: 1,
        bloomed: true,
      },
      cfg,
    );
    expect(s.growth).toBe(8);
    expect(s.bloomed).toBe(true);
    expect(plantStrategy.progress(s, cfg, day0).rewardReady).toBe(true);
  });
});
