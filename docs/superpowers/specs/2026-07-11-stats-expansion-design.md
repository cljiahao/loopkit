# Stats expansion — trend deltas + visit cadence

Date: 2026-07-11

## Problem

`/dashboard/stats` (`src/app/dashboard/stats/page.tsx`) shows four
point-in-time tiles (enrolled, active/lapsed, redemption rate,
repeat-visit rate) plus a 30-day daily-visits bar strip. Every number is a
snapshot — there's no way to tell if a program is trending up or down, and
there's no measure of how _often_ a repeat customer actually comes back
(only whether they've visited twice ever, via `repeatVisitRate`).

qkit's stats page (`src/app/dashboard/stats/`) solves the trend problem
with a `pctChange` delta pill next to each KPI and a `windowSeries`
bucketed time-series feeding a `recharts` area chart. That pattern is
worth porting. Its _metrics_, however, don't transfer — qkit has no
persistent customer identity (guest checkout only), so it has nothing
resembling `repeatVisitRate`/`active`/`lapsed`; loopkit is already ahead
there. This spec ports qkit's **trend/delta pattern** onto loopkit's
**existing** metrics, and adds one genuinely new metric neither codebase
has: visit cadence (how many days apart a repeat customer's visits are).

## What does NOT change

- `stamp_events` schema (`card_id, kind, created_at`,
  `supabase/migrations/0001_loopkit_core.sql:25-31`) — every addition
  below is computed from data already being fetched.
- `enrolled`, `newThisWeek`, `redemptionRate`, `repeatVisitRate`,
  `visitsByDay`, `active`/`lapsed` — kept as-is. "Retention" the user
  named is already covered by `active`/`lapsed` (30-day-activity
  segmentation) and `repeatVisitRate`; this spec doesn't rename or
  duplicate them, it adds trend context (are `active`/`visits30d` growing
  or shrinking vs. the prior period) on top.
- The 30-day daily-visits bar strip (`stats/page.tsx:68-79`) — a
  hand-rolled `div`-height bar chart. loopkit has no charting library
  dependency today (qkit's trend/area chart uses `recharts`, not present
  in `loopkit/package.json`). Pulling in `recharts` for one more bar strip
  isn't justified — this spec keeps the existing div-bar idiom and only
  adds a delta pill next to the KPI tiles, not a new chart component.
- No Pro-tier gating exists anywhere on the current stats page (every
  tile renders unconditionally for `stats.enrolled > 0`, no `isPro()`
  check in `stats/page.tsx`). This spec follows that precedent — every
  addition below is ungated. Whether stats _should_ start gating advanced
  metrics behind Pro is a business-model call, out of scope here (see
  Open questions).

## What changes

### A. `src/lib/stats.ts` — prior-period counts + delta helper

Port qkit's `pctChange` verbatim (`qkit/src/lib/stats.ts:97-100`):

```typescript
// Percent change of current vs prior. null when prior is 0 — growth from
// nothing is undefined; the UI shows "—", never Infinity/NaN.
export function pctChange(current: number, prior: number): number | null {
  if (prior === 0) return null;
  return ((current - prior) / prior) * 100;
}
```

`computeCardStats` gains a second cutoff window (31–60 days ago) so it can
report the _prior_ period's counts alongside today's `visits30d`/
`rewards30d`/`active`, using the same event arrays it already receives —
no new query, no new fetch:

```typescript
const cutoff60d = nowMs - 60 * MS_PER_DAY;

const priorVisits30d = activityEvents.filter((e) => {
  const t = Date.parse(e.created_at);
  return t >= cutoff60d && t < cutoff30d;
}).length;

const priorRewards30d = rewardEvents.filter((e) => {
  const t = Date.parse(e.created_at);
  return t >= cutoff60d && t < cutoff30d;
}).length;

const priorActiveCardIds = new Set<string>();
for (const e of activityEvents) {
  const t = Date.parse(e.created_at);
  if (t >= cutoff60d && t < cutoff30d) priorActiveCardIds.add(e.card_id);
}
```

`ProgramStats` gains three delta fields, computed from the above via
`pctChange` (not stored as raw prior counts — callers only need the
percentage):

```typescript
export type ProgramStats = {
  // ...existing fields...
  visitsDelta: number | null; // pctChange(visits30d, priorVisits30d)
  rewardsDelta: number | null; // pctChange(rewards30d, priorRewards30d)
  activeDelta: number | null; // pctChange(active, priorActiveCardIds.size)
  avgDaysBetweenVisits: number | null; // Section B
};
```

### B. `src/lib/stats.ts` — visit cadence (new metric)

"How often does the customers visit because of this card" → average gap,
in days, between a repeat customer's consecutive activity events. Pooled
across all qualifying cards (not per-card-then-averaged) — a customer with
5 visits contributes 4 gaps, one with 2 contributes 1, so the number
reflects actual visiting rhythm rather than treating every repeat customer
equally regardless of how many repeat visits they've made:

```typescript
// Average days between a repeat customer's consecutive visits, pooled
// across every card with 2+ activity events. null when no card in the
// program has repeated yet — the UI shows "—", not a misleading 0
// (mirrors qkit's rates/waits null convention, stats.ts:15-18).
export function avgDaysBetweenVisits(
  activityEvents: StatsEvent[],
): number | null {
  const byCard = new Map<string, number[]>();
  for (const e of activityEvents) {
    const t = Date.parse(e.created_at);
    if (!Number.isFinite(t)) continue;
    const arr = byCard.get(e.card_id) ?? [];
    arr.push(t);
    byCard.set(e.card_id, arr);
  }

  const gapsDays: number[] = [];
  for (const timestamps of byCard.values()) {
    if (timestamps.length < 2) continue;
    timestamps.sort((a, b) => a - b);
    for (let i = 1; i < timestamps.length; i++) {
      gapsDays.push((timestamps[i] - timestamps[i - 1]) / MS_PER_DAY);
    }
  }
  if (gapsDays.length === 0) return null;
  return gapsDays.reduce((sum, g) => sum + g, 0) / gapsDays.length;
}
```

Called once in `getProgramStats` on the full `activityEvents` array (not
just the 30-day window — cadence needs the full history to have enough
repeat pairs to be meaningful for a low-volume vendor).

### C. `src/app/dashboard/stats/page.tsx` — UI

`Tile` gains an optional `delta` prop, rendered as a small pill (pattern
lifted from qkit's `Delta` in `kpi-row.tsx:12-30`, re-implemented locally
since loopkit has no shared stats-UI module yet — this is the only
consumer, so a one-off inline component, not a new shared file):

```tsx
function Delta({ pct }: { pct: number | null }) {
  if (pct === null) return null;
  const up = pct >= 0;
  const Icon = up ? ArrowUp : ArrowDown;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[0.65rem] font-semibold tabular-nums",
        up
          ? "bg-emerald-500/12 text-emerald-700 dark:text-emerald-400"
          : "bg-destructive/12 text-destructive",
      )}
      title="vs. the prior 30 days"
    >
      <Icon className="size-3" />
      {Math.abs(Math.round(pct))}%
    </span>
  );
}
```

`Tile` passes `delta` next to its label (`justify-between` row, mirroring
qkit's `StatTile` header layout). Wired onto the three tiles with a
natural comparison — `Active / lapsed` gets `stats.activeDelta`,
redemption rate stays delta-less (rate, not a period count — no prior-rate
baseline computed), and a new fifth tile is added:

```
Tile("Enrolled customers", ...)               — no delta (cumulative, not windowed)
Tile("Active / lapsed (30d)", ..., delta: stats.activeDelta)
Tile("Redemption rate", ...)                  — no delta
Tile("Repeat-visit rate", ...)                — no delta (all-time, no windowed baseline)
Tile("Avg days between visits", stats.avgDaysBetweenVisits === null
       ? "—" : `${stats.avgDaysBetweenVisits.toFixed(1)}d`)  — no delta
```

`visits30d`/`rewards30d` aren't currently their own tiles (folded into
`visitsTotal`/`rewardsTotal` display elsewhere or not shown at all — the
page only surfaces `enrolled`/`active`/`lapsed`/rates today); `visitsDelta`
and `rewardsDelta` are computed and exposed on `ProgramStats` for a future
tile but **not wired into the UI in this spec** unless Clarence wants a
"Visits (30d)" / "Rewards redeemed (30d)" tile added alongside — flagged
below since the current page doesn't have a natural slot for raw 30-day
counts without restructuring the grid from `sm:grid-cols-2` to 3 columns.

## Testing

- `test/lib/stats.test.ts` (extend existing) — `pctChange`: zero-prior →
  `null`, positive/negative change, zero current with nonzero prior →
  `-100`. `avgDaysBetweenVisits`: empty input → `null`, single-event card
  → excluded (no gap), two events 3 days apart → `3`, pooled average
  across multiple repeat cards matches hand-computed expectation, events
  with unparseable `created_at` skipped rather than throwing (mirrors
  `computeStats`' existing `Number.isFinite` guards elsewhere in this
  codebase's stats-style modules).
- `test/lib/stats.test.ts` — `computeCardStats`: prior-window counts
  correctly exclude events older than 60d and newer than 30d (off-by-one
  boundary check at exactly `cutoff30d`/`cutoff60d`), `visitsDelta`/
  `rewardsDelta`/`activeDelta` derive correctly via `pctChange` from those
  counts.

## Out of scope

- No new charting library (`recharts` or otherwise) — the existing
  div-bar `visitsByDay` strip is kept as-is; this spec only adds delta
  pills to existing tiles plus one new text tile.
- No Pro-tier gating of any new or existing stat — matches current
  precedent (nothing on this page is gated today). If gating is wanted,
  that's a plan-page/entitlement decision (sub-project F), not a stats
  decision.
- No cross-program comparison, no cohort curves, no busy-hour heatmap
  (qkit's `dayHour` grid depends on hourly order volume patterns that
  don't map cleanly onto a low-frequency loyalty-visit cadence — a cafe
  getting 3 stamps a day doesn't have a meaningful "busiest hour").
- No historized/materialized stats snapshots — `getProgramStats` stays a
  fully-derived `cache()`-wrapped read of `cards`/`stamp_events`, same as
  today; the prior-period window is just a second filter pass over
  data already fetched, not a new table or cron job.

## Open questions for Clarence

1. Should `visitsDelta`/`rewardsDelta` (computed but unused in this
   spec's UI) get their own tiles now, or wait until raw 30-day counts
   have a UI slot? Leaning toward adding them now as two more tiles
   (6 total, `sm:grid-cols-3`) rather than shipping unused fields — flag
   if you'd rather keep the page terser.
2. `avgDaysBetweenVisits` pools gaps across ALL cards with 2+ visits,
   unweighted by recency (a customer who visited twice a year ago counts
   the same as one visiting twice this week). An alternative is
   restricting the pool to gaps that fall at least partly within the last
   90 days. No strong reason to prefer one over the other without knowing
   whether you want "historical rhythm" or "current rhythm" — picked the
   simpler (unrestricted) version as the default; say if you want the
   90-day restriction instead.
