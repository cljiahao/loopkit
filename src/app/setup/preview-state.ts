import {
  buildChanceConfig,
  buildPlantConfig,
  buildStreakConfig,
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
  periodDays: number;
  targetStreak: number;
  segments: { label: string; weight: number; is_reward: boolean }[];
  headStart: boolean;
};

// Mirrors enroll_card's seed math (supabase/migrations/0014_loopkit_head_start.sql)
// exactly, so the preview never shows a head start that the real card wouldn't.
function headStartStampSeed(stampsRequired: number): number {
  const seed = Math.max(1, Math.round(stampsRequired * 0.2));
  return Math.min(seed, stampsRequired - 1);
}

function headStartPlantGrowth(visitsToBloom: number): number {
  const seed = Math.max(1, Math.round(visitsToBloom * 0.2));
  const floored = Math.max(seed, Math.round(visitsToBloom * 0.25));
  return Math.min(floored, visitsToBloom - 1);
}

const FRESH_CARD: CardLike = { state: {}, stamp_count: 0, reward_count: 0 };

// Assembles a synthetic program+card from the form's current field values and
// calls the real getProgress() — the same function src/app/c's customer page
// uses — so the preview can never drift from what a real card renders.
export function buildPreviewProgress(input: PreviewInput): Progress {
  const now = new Date();

  if (input.type === "stamp") {
    const program: ProgramLike = {
      type: "stamp",
      stamps_required: input.stampsRequired,
      reward_text: input.rewardText,
      config: {
        stamps_required: input.stampsRequired,
        reward_text: input.rewardText,
      },
    };
    const card: CardLike = input.headStart
      ? {
          state: {},
          stamp_count: headStartStampSeed(input.stampsRequired),
          reward_count: 0,
        }
      : FRESH_CARD;
    return getProgress(program, card, now);
  }

  if (input.type === "plant") {
    const config = buildPlantConfig(input.visitsToBloom, input.rewardText);
    const program: ProgramLike = {
      type: "plant",
      stamps_required: input.visitsToBloom,
      reward_text: input.rewardText,
      config,
    };
    const card: CardLike = input.headStart
      ? {
          state: {
            growth: headStartPlantGrowth(input.visitsToBloom),
            last_visit_at: now.toISOString(),
            blooms: 0,
            bloomed: false,
          },
          stamp_count: 0,
          reward_count: 0,
        }
      : FRESH_CARD;
    return getProgress(program, card, now);
  }

  if (input.type === "streak") {
    const config = buildStreakConfig(
      input.periodDays,
      input.targetStreak,
      input.rewardText,
    );
    const program: ProgramLike = {
      type: "streak",
      stamps_required: input.targetStreak,
      reward_text: input.rewardText,
      config,
    };
    const card: CardLike = input.headStart
      ? {
          state: {
            current_streak: 1,
            window_start: now.toISOString(),
            reward_banked: false,
          },
          stamp_count: 0,
          reward_count: 0,
        }
      : FRESH_CARD;
    return getProgress(program, card, now);
  }

  if (input.type === "lucky") {
    const pityCeiling = input.pityCeiling ?? 8;
    const program: ProgramLike = {
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
    return getProgress(program, FRESH_CARD, now);
  }

  // wheel / scratch — never offer head start, always the zero/unplayed state.
  const config = buildChanceConfig(
    input.type,
    input.segments,
    input.pityCeiling,
    input.rewardText,
  );
  const program: ProgramLike = {
    type: input.type,
    stamps_required: input.pityCeiling ?? 10,
    reward_text: input.rewardText,
    config,
  };
  return getProgress(program, FRESH_CARD, now);
}
