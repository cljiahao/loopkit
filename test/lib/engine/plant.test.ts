import { describe, it, expect } from "vitest";
import { plantStrategy, type PlantConfig } from "@/lib/engine/plant";
import { buildPlantConfig } from "@/lib/program-config";

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
  it("reports rewardsUnlockedCount of 1 when a visit crosses exactly one bloom threshold", () => {
    const r = plantStrategy.apply(
      { kind: "visit" },
      { growth: 7, last_visit_at: day0.toISOString(), blooms: 0 },
      cfg,
      day0,
    );
    expect(r.rewardsUnlockedCount).toBe(1);
  });
  it("reports rewardsUnlockedCount of 0 when growth stays within one already-bloomed cycle", () => {
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
    expect(r.rewardsUnlockedCount).toBe(0);
  });
  it("reports rewardsUnlockedCount of 2 when growth_per_visit is large enough to cross two bloom thresholds at once", () => {
    const bigCfg: PlantConfig = { ...cfg, growth_per_visit: 20 };
    const r = plantStrategy.apply(
      { kind: "visit" },
      { growth: 0, last_visit_at: day0.toISOString(), blooms: 0 },
      bigCfg,
      day0,
    );
    expect(r.rewardsUnlockedCount).toBe(2);
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

describe("plantStrategy cup variant", () => {
  it("cup variant names stages Empty/Sip/Quarter Full/Nearly Full/Full at the same thresholds as plant", () => {
    const plantCfg = buildPlantConfig(8, "free kopi", "plant");
    const cupCfg = buildPlantConfig(8, "free kopi", "cup");
    expect(plantCfg.stages.map((s) => s.threshold)).toEqual(
      cupCfg.stages.map((s) => s.threshold),
    );
    expect(cupCfg.stages.map((s) => s.name)).toEqual([
      "Empty",
      "Sip",
      "Quarter Full",
      "Nearly Full",
      "Full",
    ]);
    expect(plantCfg.stages.map((s) => s.name)).toEqual([
      "Seed",
      "Sprout",
      "Leafing",
      "Budding",
      "Bloom",
    ]);
  });

  it("defaults to plant variant when omitted", () => {
    const cfg = buildPlantConfig(8, "free kopi");
    expect(cfg.variant).toBe("plant");
    expect(cfg.stages[0].name).toBe("Seed");
  });

  it("progress() reports the cup variant in its view", () => {
    const cupCfg = buildPlantConfig(8, "free kopi", "cup");
    const p = plantStrategy.progress(
      { growth: 4, last_visit_at: null, blooms: 0 },
      cupCfg,
      new Date("2026-07-07T00:00:00Z"),
    );
    expect(p.view).toMatchObject({ kind: "plant", variant: "cup" });
    expect(p.stage).toBe("Quarter Full");
  });

  it("progress() defaults to plant variant when config.variant is absent", () => {
    const p = plantStrategy.progress(
      { growth: 4, last_visit_at: null, blooms: 0 },
      cfg,
      new Date("2026-07-07T00:00:00Z"),
    );
    expect(p.view).toMatchObject({ kind: "plant", variant: "plant" });
  });

  it("cup variant wilts and floors exactly like plant", () => {
    const cupCfg = buildPlantConfig(8, "free kopi", "cup");
    const p = plantStrategy.progress(
      { growth: 6, last_visit_at: "2026-07-01T00:00:00Z", blooms: 0 },
      cupCfg,
      new Date("2026-07-30T00:00:00Z"),
    );
    expect(p.view).toMatchObject({
      kind: "plant",
      variant: "cup",
      wilting: true,
    });
    expect(p.stage).toBe("Sip");
  });
});
