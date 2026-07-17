# engine

## Purpose

Vitest unit tests for `src/lib/engine/` — the pure per-program-type reward
strategies and their dispatch layer.

## Contents

- `apply-visit.test.ts` — `applyVisit` dispatch: routes lucky/plant/stamp programs to the matching strategy's `apply`
- `chance.test.ts` — `pickSegment`/`makeChanceStrategy`: weighted segment selection and the pity/`forceReward` pool
- `index.test.ts` — `getProgress` dispatch: computes stamp/plant/chance progress views from a program's `config`/`state` blob
- `lucky.test.ts` — `luckyStrategy`: probability roll, cooldown, and pity-ceiling guaranteed win
- `plant-apply-visit.test.ts` — `applyVisit`/`getProgress` for `type: "plant"` programs end to end through the dispatch layer
- `plant.test.ts` — `plantStrategy`: stage thresholds, growth, decay-after-grace-period, and redeem carryover
- `stamp.test.ts` — `stampStrategy`: stamp counting, `dots`/`flame`/`points` view variants, `points_per_visit` increment

## Parent

[lib](../README.md)
