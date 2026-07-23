export type EngineEvent = {
  kind: "visit" | "redeem";
  payload?: Record<string, unknown>;
};

export type ProgressView =
  | {
      kind: "dots";
      filled: number;
      total: number;
      variant?: "dots" | "points";
    }
  | {
      kind: "flame";
      filled: number;
      total: number;
      stage: number;
      stageName: string;
      totalStages: number;
    }
  | {
      kind: "plant";
      stage: number;
      stageName: string;
      totalStages: number;
      wilting: boolean;
      variant: "plant" | "cup";
    }
  | {
      kind: "chance";
      variant: "wheel" | "scratch";
      segments: { id: string; label: string; reward: boolean }[];
      landedId: string | null;
    }
  | {
      kind: "lucky";
      visitsSinceWin: number;
      pityCeiling: number;
    };

export type Progress = {
  stage: string;
  label: string;
  view: ProgressView;
  rewardReady: boolean;
};

export interface Strategy<C, S> {
  defaults(config: C): S;
  progress(state: S, config: C, now: Date): Progress;
  apply(
    event: EngineEvent,
    state: S,
    config: C,
    now: Date,
  ): { state: S; rewardUnlocked: boolean; rewardsUnlockedCount?: number };
  redeem(state: S, config: C): S;
}
