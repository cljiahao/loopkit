import {
  buildChanceConfig,
  buildPlantConfig,
  type ProgramType,
} from "@/lib/program-config";
import { getProgress, type CardLike, type ProgramLike } from "@/lib/engine";
import type { Progress } from "@/lib/engine/types";

export type PreviewInput = {
  type: ProgramType;
  name: string;
  rewardText: string;
  stampsRequired: number;
  visitsToBloom: number;
  winPercent: number;
  pityCeiling: number | undefined;
  segments: { label: string; weight: number; is_reward: boolean }[];
  headStart: boolean;
  headStartPercent: number;
  variant: "dots" | "flame";
};

// Mirrors enroll_card's seed math (supabase/migrations/0014_loopkit_head_start.sql)
// exactly, so the preview never shows a head start that the real card wouldn't.
function headStartStampSeed(stampsRequired: number, percent: number): number {
  const seed = Math.max(1, Math.round((stampsRequired * percent) / 100));
  return Math.min(seed, stampsRequired - 1);
}

function headStartPlantGrowth(visitsToBloom: number, percent: number): number {
  const seed = Math.max(1, Math.round((visitsToBloom * percent) / 100));
  const floored = Math.max(seed, Math.round(visitsToBloom * 0.25));
  return Math.min(floored, visitsToBloom - 1);
}

const FRESH_CARD: CardLike = { state: {}, stamp_count: 0, reward_count: 0 };

// Assembles a synthetic program (config only, no card/state) from the form's
// current field values — the same type-appropriate config shape
// buildProgramFields (src/lib/program.ts) builds at save time. Shared by
// buildPreviewProgress (the static snapshot) and usePreviewAnimation (the
// ticking loop, src/app/setup/preview-animation.ts) so both build their
// program identically, with no duplicated per-type logic.
export function buildPreviewProgram(
  input: Omit<PreviewInput, "headStart">,
): ProgramLike {
  if (input.type === "stamp") {
    return {
      type: "stamp",
      stamps_required: input.stampsRequired,
      reward_text: input.rewardText,
      config: {
        stamps_required: input.stampsRequired,
        reward_text: input.rewardText,
        variant: input.variant,
      },
    };
  }

  if (input.type === "plant") {
    return {
      type: "plant",
      stamps_required: input.visitsToBloom,
      reward_text: input.rewardText,
      config: buildPlantConfig(input.visitsToBloom, input.rewardText),
    };
  }

  if (input.type === "lucky") {
    const pityCeiling = input.pityCeiling ?? 8;
    return {
      type: "lucky",
      stamps_required: pityCeiling,
      reward_text: input.rewardText,
      config: {
        win_probability: input.winPercent / 100,
        pity_ceiling: pityCeiling,
        cooldown_visits: 0,
        reward_text: input.rewardText,
      },
    };
  }

  // wheel / scratch — "streak" is unreachable here (no PreviewInput caller
  // ever sets type to "streak"; the type picker's Flame Club tile maps to
  // type "stamp" + variant "flame" instead), but ProgramType still includes
  // it until Task 6 shrinks the shared union, so a narrowing cast is needed.
  const chanceType = input.type as "wheel" | "scratch";
  return {
    type: chanceType,
    stamps_required: input.pityCeiling ?? 10,
    reward_text: input.rewardText,
    config: buildChanceConfig(
      chanceType,
      input.segments,
      input.pityCeiling,
      input.rewardText,
    ),
  };
}

// Assembles the head-start-aware initial CardLike for the form's current
// field values — the position a fresh preview starts at, and what an
// animation loop resets back to. `now` is threaded in explicitly (rather
// than each call site making its own `new Date()`) so a caller can share
// one instant between the seed timestamp and a subsequent getProgress()
// call — buildPreviewProgress below relies on this to match its
// pre-refactor behavior exactly. Lucky/wheel/scratch never offer head
// start, always the zero/unplayed state, matching the toggle's own
// conditional rendering in SetupForm (only shown for stamp/plant/streak).
export function buildInitialCard(
  input: Pick<
    PreviewInput,
    | "type"
    | "stampsRequired"
    | "visitsToBloom"
    | "headStart"
    | "headStartPercent"
  >,
  now: Date,
): CardLike {
  if (!input.headStart) return FRESH_CARD;

  if (input.type === "stamp") {
    return {
      state: {},
      stamp_count: headStartStampSeed(
        input.stampsRequired,
        input.headStartPercent,
      ),
      reward_count: 0,
    };
  }

  if (input.type === "plant") {
    return {
      state: {
        growth: headStartPlantGrowth(
          input.visitsToBloom,
          input.headStartPercent,
        ),
        last_visit_at: now.toISOString(),
        blooms: 0,
        bloomed: false,
      },
      stamp_count: 0,
      reward_count: 0,
    };
  }

  return FRESH_CARD;
}

// Assembles a synthetic program+card from the form's current field values and
// calls the real getProgress() — the same function src/app/c's customer page
// uses — so the preview can never drift from what a real card renders.
export function buildPreviewProgress(input: PreviewInput): Progress {
  const now = new Date();
  const program = buildPreviewProgram(input);
  const card = buildInitialCard(input, now);
  return getProgress(program, card, now);
}
