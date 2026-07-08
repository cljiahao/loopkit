import { z } from "zod";
import { requireVendor } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase/server";
import type { PlantConfig } from "@/lib/engine/plant";
import type { ChanceConfig } from "@/lib/engine/chance";
import type { StreakConfig } from "@/lib/engine/streak";

const PROGRAM_COLUMNS =
  "id,name,stamps_required,reward_text,type,config,active,expiry_days";

export type Program = {
  id: string;
  name: string;
  stamps_required: number;
  reward_text: string;
  type: string;
  config: unknown;
  active: boolean;
  expiry_days?: number | null;
};

export const programInputSchema = z.object({
  name: z.string().trim().min(1).max(60),
  stamps_required: z.coerce.number().int().min(2).max(20),
  reward_text: z.string().trim().min(1).max(80),
});

const segmentInputSchema = z.object({
  label: z.string().trim().min(1).max(40),
  weight: z.coerce.number().int().min(1).max(100),
  is_reward: z.boolean(),
});

function parseSegments(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function emptyToUndefined(value: unknown): unknown {
  return value === "" || value == null ? undefined : value;
}

const expiryDaysSchema = z.preprocess(
  emptyToUndefined,
  z.coerce.number().int().min(1).max(3650).optional(),
);

// Type-aware program input for the /setup type picker. A discriminated union on
// `type`: the stamp variant keeps the legacy fields; the lucky variant takes a
// win-chance percentage (turned into a [0,1) probability) and a pity ceiling;
// the wheel/scratch variants share a weighted-segment editor (JSON-encoded in
// a hidden field) plus an optional pity ceiling. Every variant also carries an
// optional expiry_days — type-agnostic, so it's applied uniformly rather than
// baked into any one variant.
export const saveProgramSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("stamp"),
    name: z.string().trim().min(1).max(60),
    stamps_required: z.coerce.number().int().min(2).max(20),
    reward_text: z.string().trim().min(1).max(80),
    expiry_days: expiryDaysSchema,
  }),
  z.object({
    type: z.literal("lucky"),
    name: z.string().trim().min(1).max(60),
    reward_text: z.string().trim().min(1).max(80),
    win_percent: z.coerce.number().int().min(2).max(100),
    pity_ceiling: z.coerce.number().int().min(2).max(20),
    expiry_days: expiryDaysSchema,
  }),
  z.object({
    type: z.literal("plant"),
    name: z.string().trim().min(1).max(60),
    reward_text: z.string().trim().min(1).max(80),
    visits_to_bloom: z.coerce.number().int().min(4).max(20),
    expiry_days: expiryDaysSchema,
  }),
  z.object({
    type: z.literal("wheel"),
    name: z.string().trim().min(1).max(60),
    reward_text: z.string().trim().min(1).max(80),
    segments: z.preprocess(
      parseSegments,
      z.array(segmentInputSchema).min(2).max(6),
    ),
    pity_ceiling: z.preprocess(
      emptyToUndefined,
      z.coerce.number().int().min(2).max(20).optional(),
    ),
    expiry_days: expiryDaysSchema,
  }),
  z.object({
    type: z.literal("scratch"),
    name: z.string().trim().min(1).max(60),
    reward_text: z.string().trim().min(1).max(80),
    segments: z.preprocess(
      parseSegments,
      z.array(segmentInputSchema).min(2).max(6),
    ),
    pity_ceiling: z.preprocess(
      emptyToUndefined,
      z.coerce.number().int().min(2).max(20).optional(),
    ),
    expiry_days: expiryDaysSchema,
  }),
  z.object({
    type: z.literal("streak"),
    name: z.string().trim().min(1).max(60),
    reward_text: z.string().trim().min(1).max(80),
    period_days: z.coerce.number().int().min(1).max(30),
    target_streak: z.coerce.number().int().min(2).max(20),
    expiry_days: expiryDaysSchema,
  }),
]);

export type SaveProgramInput = z.infer<typeof saveProgramSchema>;
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
