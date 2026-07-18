import { z } from "zod";
import { requireVendor } from "@/features/auth";
import { createServerClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/types";
import {
  buildChanceConfig,
  buildPlantConfig,
  segmentInputSchema,
  type ProgramType,
  type SegmentInput,
} from "@/lib/program-config";

export type { ProgramType, SegmentInput };
export { buildChanceConfig, buildPlantConfig };

const PROGRAM_COLUMNS =
  "id,name,stamps_required,reward_text,type,config,active,expiry_days,reward_expiry_days,head_start,head_start_percent,replaced_by,carry_over_stamps";

export type Program = {
  id: string;
  name: string;
  stamps_required: number;
  reward_text: string;
  type: string;
  config: unknown;
  active: boolean;
  expiry_days?: number | null;
  reward_expiry_days?: number | null;
  head_start: boolean;
  head_start_percent: number;
  replaced_by: string | null;
  carry_over_stamps: boolean;
};

export const programInputSchema = z.object({
  name: z.string().trim().min(1).max(60),
  stamps_required: z.coerce.number().int().min(2).max(20),
  reward_text: z.string().trim().min(1).max(80),
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

const rewardExpiryDaysSchema = z.preprocess(
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
export const saveProgramSchema = z
  .discriminatedUnion("type", [
    z.object({
      type: z.literal("stamp"),
      name: z.string().trim().min(1).max(60),
      stamps_required: z.coerce.number().int().min(2).max(100000),
      reward_text: z.string().trim().min(1).max(80),
      head_start: z.enum(["true", "false"]).transform((v) => v === "true"),
      head_start_percent: z.preprocess(
        emptyToUndefined,
        z.coerce.number().int().min(5).max(50).optional(),
      ),
      variant: z.preprocess(
        emptyToUndefined,
        z.enum(["dots", "flame", "points"]).optional(),
      ),
      points_per_visit: z.preprocess(
        emptyToUndefined,
        z.coerce.number().int().min(1).max(1000).optional(),
      ),
      expiry_days: expiryDaysSchema,
      reward_expiry_days: rewardExpiryDaysSchema,
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
      head_start: z.enum(["true", "false"]).transform((v) => v === "true"),
      head_start_percent: z.preprocess(
        emptyToUndefined,
        z.coerce.number().int().min(5).max(50).optional(),
      ),
      variant: z.preprocess(
        emptyToUndefined,
        z.enum(["plant", "cup"]).optional(),
      ),
      expiry_days: expiryDaysSchema,
      reward_expiry_days: rewardExpiryDaysSchema,
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
  ])
  .superRefine((data, ctx) => {
    if (
      data.type === "stamp" &&
      data.variant !== "points" &&
      data.stamps_required > 20
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["stamps_required"],
        message:
          "Stamps required must be between 2 and 20 for this card style.",
      });
    }
  });

export type SaveProgramInput = z.infer<typeof saveProgramSchema>;

// A card's stamps_required column is NOT NULL and 2..20; lucky/wheel/scratch
// programs reuse the pity ceiling (defaulting to 10 when left unset) and
// plant programs reuse visits-to-bloom to satisfy it. The type-specific
// knobs live in the config blob the TypeScript strategy reads.
//
// Shared by saveProgramAction (create/edit) and changeTypeAction (Section C
// of the templates-and-migration design) — the type-to-{type,
// stampsRequired, config, headStart} mapping is identical in both; this is
// the one place it's implemented.
export function buildProgramFields(data: SaveProgramInput): {
  type: string;
  stampsRequired: number;
  config: Json;
  headStart: boolean;
  headStartPercent: number;
} {
  if (data.type === "stamp") {
    return {
      type: "stamp",
      stampsRequired: data.stamps_required,
      headStart: data.head_start,
      headStartPercent: data.head_start_percent ?? 20,
      config: {
        stamps_required: data.stamps_required,
        reward_text: data.reward_text,
        variant: data.variant ?? "dots",
        points_per_visit: data.points_per_visit ?? 1,
      },
    };
  }
  if (data.type === "lucky") {
    return {
      type: "lucky",
      stampsRequired: data.pity_ceiling,
      headStart: false,
      headStartPercent: 20,
      config: {
        win_probability: data.win_percent / 100,
        pity_ceiling: data.pity_ceiling,
        cooldown_visits: 0,
        reward_text: data.reward_text,
      },
    };
  }
  if (data.type === "plant") {
    return {
      type: "plant",
      stampsRequired: data.visits_to_bloom,
      headStart: data.head_start,
      headStartPercent: data.head_start_percent ?? 20,
      config: buildPlantConfig(
        data.visits_to_bloom,
        data.reward_text,
        data.variant ?? "plant",
      ) as Json,
    };
  }
  return {
    type: data.type,
    stampsRequired: data.pity_ceiling ?? 10,
    headStart: false,
    headStartPercent: 20,
    config: buildChanceConfig(
      data.type,
      data.segments,
      data.pity_ceiling,
      data.reward_text,
    ) as Json,
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

export type Tier = "free" | "pro";

export interface Entitlement {
  tier: Tier;
  // null = unlimited
  maxActivePrograms: number | null;
  // null = unlimited; caps how many "live-in-play" (replaced_by is null)
  // programs a vendor may have at once — the free-tier prep-a-replacement
  // cap. Pro is unlimited here too (it never needs the prep flow, but
  // isn't blocked from it either).
  maxLiveInPlayPrograms: number | null;
}

const FREE: Entitlement = {
  tier: "free",
  maxActivePrograms: 1,
  maxLiveInPlayPrograms: 2,
};
const PRO: Entitlement = {
  tier: "pro",
  maxActivePrograms: null,
  maxLiveInPlayPrograms: null,
};

// Resolves a vendor's raw plan state (isPro's DB read) to what they can
// actually do. Starts at one axis because program count is the only
// thing Pro gates today — add fields here, not new ad-hoc isPro()
// branches, when a second gate is actually needed.
export function getEntitlement(pro: boolean): Entitlement {
  return pro ? PRO : FREE;
}

// Pure: whether the vendor can create another active program under
// their entitlement.
export function canCreateProgram(
  ent: Entitlement,
  activeCount: number,
): boolean {
  return ent.maxActivePrograms === null || activeCount < ent.maxActivePrograms;
}

// Pure: whether the vendor can prep another live-in-play (replaced_by is
// null) program under their entitlement — the free-tier "create a second,
// inactive, to switch to later" cap.
export function canPrepProgram(
  ent: Entitlement,
  liveInPlayCount: number,
): boolean {
  return (
    ent.maxLiveInPlayPrograms === null ||
    liveInPlayCount < ent.maxLiveInPlayPrograms
  );
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

// Lazy cutover check for Pro's scheduled retirement (schedule_retirement
// RPC, migration 0023): deactivates any of the signed-in vendor's active
// programs whose scheduled_deactivate_at has passed. RLS (programs_own)
// already scopes this update to the vendor's own rows. No cron — this
// runs at the top of every /dashboard and /setup page load (Task 4) so a
// due cutover takes effect the next time either page is viewed, matching
// isCardExpired's existing lazy-check precedent (src/lib/expiry.ts).
export async function applyDueCutovers(): Promise<void> {
  const supabase = await createServerClient();
  await supabase
    .from("programs")
    .update({ active: false })
    .lte("scheduled_deactivate_at", new Date().toISOString())
    .eq("active", true);
}

// Transitional single-program shim (= first program). Retained only for callers
// that still assume one program (e.g. /dashboard/customers); prefer the
// list/current pair for anything program-scoped.
export async function getProgram(): Promise<Program | null> {
  const programs = await listPrograms();
  return programs[0] ?? null;
}
