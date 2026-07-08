import { z } from "zod";
import { requireVendor } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase/server";
import type { PlantConfig } from "@/lib/engine/plant";

const PROGRAM_COLUMNS =
  "id,name,stamps_required,reward_text,type,config,active";

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

// Every program the signed-in vendor owns, oldest first. RLS (programs_own)
// scopes the select to auth.uid(), so no vendor_id filter is needed here.
export async function listPrograms(): Promise<Program[]> {
  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("programs")
    .select(PROGRAM_COLUMNS)
    .order("created_at", { ascending: true });
  if (error) throw new Error(`listPrograms: ${error.message}`);
  return data ?? [];
}

// One of the vendor's programs by id, or null if it does not exist or is not
// theirs — RLS (programs_own) hides other vendors' rows, so an unowned id
// resolves to null rather than leaking.
export async function getProgramById(id: string): Promise<Program | null> {
  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("programs")
    .select(PROGRAM_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`getProgramById: ${error.message}`);
  return data;
}

// Pure: pick the current program — the requested id when the vendor owns it,
// else the first program, else null (no programs yet).
export function currentProgram(
  programs: Program[],
  requestedId?: string,
): Program | null {
  if (requestedId) {
    const match = programs.find((p) => p.id === requestedId);
    if (match) return match;
  }
  return programs[0] ?? null;
}

// Pure: free vendors get one program; Pro vendors are unlimited.
export function canCreateProgram(count: number, pro: boolean): boolean {
  return pro || count < 1;
}

// Whether the signed-in vendor is on the Pro tier (present in vendor_pro).
export async function isPro(): Promise<boolean> {
  const { user } = await requireVendor();
  const supabase = await createServerClient();
  const { data } = await supabase
    .from("vendor_pro")
    .select("vendor_id")
    .eq("vendor_id", user.id)
    .maybeSingle();
  return !!data;
}

// Transitional single-program shim (= first program). Retained only for callers
// that still assume one program (e.g. /dashboard/customers); prefer the
// list/current pair for anything program-scoped.
export async function getProgram(): Promise<Program | null> {
  const programs = await listPrograms();
  return programs[0] ?? null;
}
