import type { Strategy } from "@/lib/engine/types";

export type LuckyConfig = {
  win_probability: number;
  pity_ceiling: number;
  cooldown_visits: number;
  reward_text: string;
};
export type LuckyState = { visits_since_win: number; total_wins: number };

export const luckyStrategy: Strategy<LuckyConfig, LuckyState> = {
  defaults() {
    return { visits_since_win: 0, total_wins: 0 };
  },
  progress(state, config) {
    return {
      stage: "play",
      label: `Tap to play — win by visit ${config.pity_ceiling}`,
      view: {
        kind: "lucky",
        visitsSinceWin: state.visits_since_win,
        pityCeiling: config.pity_ceiling,
      },
      rewardReady: false,
    };
  },
  apply(event, state, config) {
    if (event.kind !== "visit") return { state, rewardUnlocked: false };
    const roll =
      typeof event.payload?.roll === "number" ? event.payload.roll : 1;
    const eligible = state.visits_since_win >= config.cooldown_visits;
    const pity = state.visits_since_win + 1 >= config.pity_ceiling;
    const won = eligible && (pity || roll < config.win_probability);
    if (won) {
      return {
        state: { visits_since_win: 0, total_wins: state.total_wins + 1 },
        rewardUnlocked: true,
      };
    }
    return {
      state: { ...state, visits_since_win: state.visits_since_win + 1 },
      rewardUnlocked: false,
    };
  },
  redeem(state) {
    return state;
  },
};
