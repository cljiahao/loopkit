import type { EngineEvent, Progress } from "@/lib/engine/types";
import {
  stampStrategy,
  type StampConfig,
  type StampState,
} from "@/lib/engine/stamp";
import {
  luckyStrategy,
  type LuckyConfig,
  type LuckyState,
} from "@/lib/engine/lucky";
import {
  plantStrategy,
  type PlantConfig,
  type PlantState,
} from "@/lib/engine/plant";

export type ProgramLike = {
  type: string;
  config: unknown;
  stamps_required: number;
  reward_text: string;
};
export type CardLike = {
  state: unknown;
  stamp_count: number;
  reward_count: number;
};

function hasKeys(o: unknown): o is Record<string, unknown> {
  return typeof o === "object" && o !== null && Object.keys(o).length > 0;
}

export function resolveStampConfig(program: ProgramLike): StampConfig {
  if (hasKeys(program.config)) return program.config as StampConfig;
  return {
    stamps_required: program.stamps_required,
    reward_text: program.reward_text,
  };
}

function resolveStampState(card: CardLike): StampState {
  if (hasKeys(card.state)) {
    const s = card.state as Partial<StampState>;
    return {
      stamp_count: s.stamp_count ?? card.stamp_count,
      reward_count: s.reward_count ?? card.reward_count,
    };
  }
  return { stamp_count: card.stamp_count, reward_count: card.reward_count };
}

function resolveLuckyConfig(program: ProgramLike): LuckyConfig {
  return program.config as LuckyConfig;
}

function resolveLuckyState(card: CardLike): LuckyState {
  if (hasKeys(card.state)) return card.state as LuckyState;
  return { visits_since_win: 0, total_wins: 0 };
}

function resolvePlantConfig(program: ProgramLike): PlantConfig {
  return program.config as PlantConfig;
}

function resolvePlantState(card: CardLike): PlantState {
  if (hasKeys(card.state)) return card.state as PlantState;
  return plantStrategy.defaults({} as PlantConfig);
}

export function applyVisit(
  program: ProgramLike,
  card: CardLike,
  event: EngineEvent,
  now: Date,
): { state: unknown; rewardUnlocked: boolean } {
  switch (program.type) {
    case "lucky":
      return luckyStrategy.apply(
        event,
        resolveLuckyState(card),
        resolveLuckyConfig(program),
        now,
      );
    case "plant":
      return plantStrategy.apply(
        event,
        resolvePlantState(card),
        resolvePlantConfig(program),
        now,
      );
    case "stamp":
    default:
      return stampStrategy.apply(
        event,
        resolveStampState(card),
        resolveStampConfig(program),
        now,
      );
  }
}

export function getProgress(
  program: ProgramLike,
  card: CardLike,
  now: Date,
): Progress {
  switch (program.type) {
    case "lucky":
      return luckyStrategy.progress(
        resolveLuckyState(card),
        resolveLuckyConfig(program),
        now,
      );
    case "plant":
      return plantStrategy.progress(
        resolvePlantState(card),
        resolvePlantConfig(program),
        now,
      );
    case "stamp":
    default:
      return stampStrategy.progress(
        resolveStampState(card),
        resolveStampConfig(program),
        now,
      );
  }
}
