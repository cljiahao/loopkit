import { z } from "zod";
import type { PlantConfig } from "@/lib/engine/plant";
import type { ChanceConfig } from "@/lib/engine/chance";

// Pure program-config builders and their supporting types — deliberately
// kept free of any server-only import (no @/lib/supabase/server, no
// @/lib/auth). src/lib/program.ts re-exports everything here for its
// existing (server-side) consumers, but src/app/setup/preview-state.ts
// imports directly from this file: it's reachable from the client bundle
// (SetupForm -> preview-state.ts), and pulling in program.ts's server-only
// imports there breaks the Next.js build with "next/headers ... Pages
// Router" — next/headers can't be bundled for the client regardless of
// whether the client code actually calls the server-only exports.

export type ProgramType = "stamp" | "lucky" | "plant" | "wheel" | "scratch";

export const segmentInputSchema = z.object({
  label: z.string().trim().min(1).max(40),
  weight: z.coerce.number().int().min(1).max(100),
  is_reward: z.boolean(),
});
export type SegmentInput = z.infer<typeof segmentInputSchema>;

const PLANT_STAGE_NAMES = ["Seed", "Sprout", "Leafing", "Budding", "Bloom"];
const CUP_STAGE_NAMES = ["Empty", "Sip", "Quarter Full", "Nearly Full", "Full"];

// Derive a Plant/Cup program's config from the single vendor-facing knob
// (visits to bloom/fill): five stages at even quarters up to the top
// threshold, a floor at the second stage so a wilted card never dies, and
// fixed grace/decay — identical math for both variants. `variant` only
// selects which stage-name table gets baked into `stages[].name`; the
// thresholds themselves never differ between "plant" and "cup".
export function buildPlantConfig(
  visitsToBloom: number,
  rewardText: string,
  variant: "plant" | "cup" = "plant",
): PlantConfig {
  const b = visitsToBloom;
  const names = variant === "cup" ? CUP_STAGE_NAMES : PLANT_STAGE_NAMES;
  const thresholds = [
    0,
    Math.round(b * 0.25),
    Math.round(b * 0.5),
    Math.round(b * 0.75),
    b,
  ];
  const stages = names.map((name, i) => ({ name, threshold: thresholds[i] }));
  return {
    stages,
    growth_per_visit: 1,
    grace_days: 5,
    decay_rate: 0.5,
    floor_growth: stages[1].threshold,
    reward_text: rewardText,
    variant,
  };
}

// Derive a Wheel/Scratch program's config from the vendor-facing segment editor
// and optional pity ceiling. Each segment gets a fresh id (the engine tracks
// the landed segment by id); a reward segment carries the program's single
// reward text, a non-reward segment carries none.
export function buildChanceConfig(
  variant: "wheel" | "scratch",
  segments: SegmentInput[],
  pityCeiling: number | undefined,
  rewardText: string,
): ChanceConfig {
  return {
    variant,
    segments: segments.map((s) => ({
      id: crypto.randomUUID(),
      label: s.label,
      weight: s.weight,
      reward_text: s.is_reward ? rewardText : undefined,
    })),
    pity_ceiling: pityCeiling,
    cooldown_visits: 0,
    reward_text: rewardText,
  };
}

// Each segment's actual win share, and the pool's overall win chance — the
// same weight/totalWeight math pickSegment (src/lib/engine/chance.ts)
// already uses internally to pick a winner, surfaced here for display in
// the Basics segment editor so a raw odds-weight number isn't the only
// thing a vendor sees.
export function segmentWinPercent(segments: SegmentInput[]): number[] {
  const total = segments.reduce((sum, s) => sum + s.weight, 0);
  if (total === 0) return segments.map(() => 0);
  return segments.map((s) => Math.round((s.weight / total) * 100));
}

export function overallWinPercent(segments: SegmentInput[]): number {
  const total = segments.reduce((sum, s) => sum + s.weight, 0);
  if (total === 0) return 0;
  const rewardWeight = segments
    .filter((s) => s.is_reward)
    .reduce((sum, s) => sum + s.weight, 0);
  return Math.round((rewardWeight / total) * 100);
}
