import type { Strategy } from "@/lib/engine/types";

export type StampConfig = {
  stamps_required: number;
  reward_text: string;
  variant?: "dots" | "flame" | "points";
  points_per_visit?: number;
};
export type StampState = { stamp_count: number; reward_count: number };

const FLAME_STAGE_NAMES = ["Spark", "Inner Flame", "Full Blaze"] as const;

function flameStageFor(filled: number, total: number): number {
  if (filled >= total) return 2;
  if (filled >= Math.round(total * 0.5)) return 1;
  return 0;
}

export const stampStrategy: Strategy<StampConfig, StampState> = {
  defaults() {
    return { stamp_count: 0, reward_count: 0 };
  },
  progress(state, config) {
    const filled = Math.min(state.stamp_count, config.stamps_required);
    const total = config.stamps_required;
    const rewardReady = state.stamp_count >= total;
    if (config.variant === "flame") {
      const stage = flameStageFor(filled, total);
      const stageName = FLAME_STAGE_NAMES[stage];
      return {
        stage: rewardReady ? "ready" : "collecting",
        label: `${stageName} — ${filled}/${total}`,
        view: {
          kind: "flame",
          filled,
          total,
          stage,
          stageName,
          totalStages: 3,
        },
        rewardReady,
      };
    }
    const isPoints = config.variant === "points";
    const unitLabel = isPoints ? "points" : "stamps";
    return {
      stage: rewardReady ? "ready" : "collecting",
      label: `${filled}/${total} ${unitLabel}`,
      view: {
        kind: "dots",
        filled,
        total,
        variant: isPoints ? "points" : "dots",
      },
      rewardReady,
    };
  },
  apply(event, state, config) {
    if (event.kind !== "visit") return { state, rewardUnlocked: false };
    const inc = config.points_per_visit ?? 1;
    const next = Math.min(state.stamp_count + inc, config.stamps_required);
    return {
      state: { ...state, stamp_count: next },
      rewardUnlocked:
        state.stamp_count < config.stamps_required &&
        next >= config.stamps_required,
    };
  },
  redeem(state) {
    return { stamp_count: 0, reward_count: state.reward_count + 1 };
  },
};
