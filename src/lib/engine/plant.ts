import type { Strategy } from "@/lib/engine/types";
import { countThresholdCrossings } from "@/lib/engine/threshold";

export type PlantStage = { name: string; threshold: number };
export type PlantConfig = {
  stages: PlantStage[];
  growth_per_visit: number;
  grace_days: number;
  decay_rate: number;
  floor_growth: number;
  reward_text: string;
  variant?: "plant" | "cup";
};
export type PlantState = {
  growth: number;
  last_visit_at: string | null;
  blooms: number;
  bloomed?: boolean;
};

const MS_PER_DAY = 86_400_000;

function decayedGrowth(
  state: PlantState,
  config: PlantConfig,
  now: Date,
): number {
  if (state.last_visit_at === null) return state.growth;
  const idleDays = Math.max(
    0,
    (now.getTime() - new Date(state.last_visit_at).getTime()) / MS_PER_DAY,
  );
  const decayDays = Math.max(0, idleDays - config.grace_days);
  const floor = Math.min(state.growth, config.floor_growth);
  return Math.max(floor, state.growth - config.decay_rate * decayDays);
}

function stageIndexFor(growth: number, stages: PlantStage[]): number {
  let idx = 0;
  for (let i = 0; i < stages.length; i++) {
    if (growth >= stages[i].threshold) idx = i;
  }
  return idx;
}

export function bloomThreshold(config: PlantConfig): number {
  return config.stages[config.stages.length - 1].threshold;
}

export const plantStrategy: Strategy<PlantConfig, PlantState> = {
  defaults() {
    return { growth: 0, last_visit_at: null, blooms: 0, bloomed: false };
  },
  progress(state, config, now) {
    const g = decayedGrowth(state, config, now);
    const idx = stageIndexFor(g, config.stages);
    const wilting = g < state.growth;
    return {
      stage: config.stages[idx].name,
      label: wilting ? "Wilting — visit to revive it" : config.stages[idx].name,
      view: {
        kind: "plant",
        stage: idx,
        stageName: config.stages[idx].name,
        totalStages: config.stages.length,
        wilting,
        variant: config.variant ?? "plant",
      },
      rewardReady: state.bloomed ?? g >= bloomThreshold(config),
    };
  },
  apply(event, state, config, now) {
    if (event.kind !== "visit") return { state, rewardUnlocked: false };
    const settled = decayedGrowth(state, config, now);
    const bloom = bloomThreshold(config);
    const growth = settled + config.growth_per_visit;
    const bloomed = state.bloomed === true || growth >= bloom;
    const rewardsUnlockedCount = countThresholdCrossings(
      settled,
      growth,
      bloom,
    );
    return {
      state: {
        growth,
        last_visit_at: now.toISOString(),
        blooms: state.blooms,
        bloomed,
      },
      rewardUnlocked: rewardsUnlockedCount > 0,
      rewardsUnlockedCount,
    };
  },
  redeem(state, config) {
    const carried = Math.max(0, state.growth - bloomThreshold(config));
    return {
      growth: carried,
      last_visit_at: state.last_visit_at,
      blooms: state.blooms + 1,
      bloomed: carried >= bloomThreshold(config),
    };
  },
};
