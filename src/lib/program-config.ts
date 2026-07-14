import { z } from "zod";
import type { PlantConfig } from "@/lib/engine/plant";
import type { ChanceConfig } from "@/lib/engine/chance";
import type { StreakConfig } from "@/lib/engine/streak";

// Pure program-config builders and their supporting types — deliberately
// kept free of any server-only import (no @/lib/supabase/server, no
// @/lib/auth). src/lib/program.ts re-exports everything here for its
// existing (server-side) consumers, but src/app/setup/preview-state.ts
// imports directly from this file: it's reachable from the client bundle
// (SetupForm -> preview-state.ts), and pulling in program.ts's server-only
// imports there breaks the Next.js build with "next/headers ... Pages
// Router" — next/headers can't be bundled for the client regardless of
// whether the client code actually calls the server-only exports.

export type ProgramType =
  "stamp" | "lucky" | "plant" | "wheel" | "scratch" | "streak";

export const segmentInputSchema = z.object({
  label: z.string().trim().min(1).max(40),
  weight: z.coerce.number().int().min(1).max(100),
  is_reward: z.boolean(),
});
export type SegmentInput = z.infer<typeof segmentInputSchema>;

// Derive a Sprout plant's config from the single vendor-facing knob (visits to
// bloom): five named stages at even quarters up to the bloom threshold, a floor
// at the Sprout stage so a wilted plant never dies, and fixed grace/decay.
export function buildPlantConfig(
  visitsToBloom: number,
  rewardText: string,
): PlantConfig {
  const b = visitsToBloom;
  const stages = [
    { name: "Seed", threshold: 0 },
    { name: "Sprout", threshold: Math.round(b * 0.25) },
    { name: "Leafing", threshold: Math.round(b * 0.5) },
    { name: "Budding", threshold: Math.round(b * 0.75) },
    { name: "Bloom", threshold: b },
  ];
  return {
    stages,
    growth_per_visit: 1,
    grace_days: 5,
    decay_rate: 0.5,
    floor_growth: stages[1].threshold,
    reward_text: rewardText,
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

// Derive a Streak Club program's config from the two vendor-facing knobs: how
// often a visit is due (period, in days) and how many consecutive periods earn
// the reward. The engine (src/lib/engine/streak.ts) reads this directly.
export function buildStreakConfig(
  periodDays: number,
  targetStreak: number,
  rewardText: string,
): StreakConfig {
  return {
    period_days: periodDays,
    target_streak: targetStreak,
    reward_text: rewardText,
  };
}
