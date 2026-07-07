import { z } from "zod";
import { createServerClient } from "@/lib/supabase/server";
import type { PlantConfig } from "@/lib/engine/plant";

export type Program = {
  id: string;
  name: string;
  stamps_required: number;
  reward_text: string;
  type: string;
  config: unknown;
  active: boolean;
};

export const programInputSchema = z.object({
  name: z.string().trim().min(1).max(60),
  stamps_required: z.coerce.number().int().min(2).max(20),
  reward_text: z.string().trim().min(1).max(80),
});

// Type-aware program input for the /setup type picker. A discriminated union on
// `type`: the stamp variant keeps the legacy fields; the lucky variant takes a
// win-chance percentage (turned into a [0,1) probability) and a pity ceiling.
export const saveProgramSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("stamp"),
    name: z.string().trim().min(1).max(60),
    stamps_required: z.coerce.number().int().min(2).max(20),
    reward_text: z.string().trim().min(1).max(80),
  }),
  z.object({
    type: z.literal("lucky"),
    name: z.string().trim().min(1).max(60),
    reward_text: z.string().trim().min(1).max(80),
    win_percent: z.coerce.number().int().min(2).max(100),
    pity_ceiling: z.coerce.number().int().min(2).max(20),
  }),
  z.object({
    type: z.literal("plant"),
    name: z.string().trim().min(1).max(60),
    reward_text: z.string().trim().min(1).max(80),
    visits_to_bloom: z.coerce.number().int().min(2).max(20),
  }),
]);

export type SaveProgramInput = z.infer<typeof saveProgramSchema>;

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

// The signed-in vendor's program, or null if they haven't set one up yet.
// RLS (programs_own) scopes the select to auth.uid(), so no vendor_id filter
// is needed here — and a vendor has at most one program (unique vendor_id).
export async function getProgram(): Promise<Program | null> {
  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("programs")
    .select("id,name,stamps_required,reward_text,type,config,active")
    .maybeSingle();
  if (error) throw new Error(`getProgram: ${error.message}`);
  return data;
}
