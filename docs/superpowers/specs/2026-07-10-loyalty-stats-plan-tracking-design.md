# Vendor stats page, plan-page ROI revamp, cross-page program badges

Date: 2026-07-10

## Problem

Sub-projects B2-B4 of the loyalty-strategy brainstorm (B1, endowed progress +
post-redemption fix, already shipped). loopkit has no vendor-facing analytics
at all — the plan page is a static feature table with no evidence a vendor's
loyalty program is working, and a vendor running multiple programs (Pro tier)
has no way to see program health without switching into each one via the nav
dropdown.

This spec covers three related pieces built on one shared data source:

- **B2** — a new `/dashboard/stats` page per program.
- **B3** — a revamp of `/dashboard/plan` to surface the vendor's own numbers
  as the case for upgrading, instead of a bare feature table.
- **B4** — small at-a-glance signal in the nav's program switcher dropdown so
  a multi-program vendor doesn't have to switch in to check status.

## Constraints

- loopkit has **no revenue/payment data anywhere** — no order amounts, no
  spend tracking. All metrics must derive from `cards` and `stamp_events`
  (enrollment + visit + redemption counts), not dollar figures.
- No new dependency for charting — `package.json` has no chart library and
  none is being added. Any trend visualization is CSS-only (bar heights via
  Tailwind).
- No migration — everything derives from existing `programs`/`cards`/
  `stamp_events` columns.

## A. Shared stats module — `src/lib/stats.ts` (new)

One exported async function, scoped to a single program (RLS already limits
`cards`/`stamp_events` reads to the signed-in vendor's own rows, same pattern
as `src/app/dashboard/activity/page.tsx`):

```typescript
export type ProgramStats = {
  enrolled: number;
  newThisWeek: number;
  visitsTotal: number;
  visits30d: number;
  visitsByDay: { date: string; count: number }[]; // last 30 days, oldest first
  rewardsTotal: number;
  rewards30d: number;
  redemptionRate: number; // rewardsTotal / enrolled, 0 if enrolled === 0
  repeatVisitRate: number; // % of cards with >=2 activity events, 0 if enrolled === 0
  active: number; // cards with >=1 activity event in last 30 days
  lapsed: number; // enrolled - active
  avgVisitsPerCustomer: number; // visitsTotal / enrolled, 0 if enrolled === 0
};

export async function getProgramStats(programId: string): Promise<ProgramStats>;
```

**Event classification** (mirrors `isWonVisit`/activity filter already in
`src/lib/metrics.ts` — reuse, don't reimplement):
- Activity/visit event: `kind === 'stamp' || kind === 'visit'`.
- Reward event: `kind === 'redeem'` or a `visit` event whose
  `payload.won === true` (lucky-tap wins).
- `regen` events are excluded from all counts (card regeneration is not a
  customer action).

**Pure helpers** (exported separately from the DB read, for direct unit
testing without mocking Supabase):

```typescript
export function classifyActivity(events: { kind: string; payload?: unknown }[]): {
  activityEvents: typeof events;
  rewardEvents: typeof events;
};

export function bucketVisitsByDay(
  activityEvents: { created_at: string }[],
  nowMs: number,
): { date: string; count: number }[]; // always 30 entries, zero-filled

export function computeCardStats(
  cards: { id: string; created_at: string }[],
  activityEvents: { card_id: string; created_at: string }[],
  rewardEvents: { card_id: string }[],
  nowMs: number,
): Omit<ProgramStats, "visitsByDay">;
```

`getProgramStats` is the thin impure shell: fetch cards + stamp_events for
the program (same two-query shape as `activity/page.tsx`), call the pure
helpers, assemble the result.

## B. Stats page — `src/app/dashboard/stats/page.tsx` (new)

- Route added to `LINKS` in `src/app/dashboard/dashboard-nav.tsx`, positioned
  between `Activity` and `Grow`.
- Same `?p=` program-scoping as Counter/Grow/Activity/Plan
  (`listPrograms()` + `currentProgram()`, redirect to `/setup` if none).
- Layout: `max-w-4xl` (matches the nav and customers/activity, per the
  earlier width-polish pass).
- Top: 2x2 (mobile: 1-col) stat-tile grid — Enrolled, Active/Lapsed split,
  Redemption rate, Repeat-visit rate. Each tile: big number + short label,
  no jargon (e.g. "Redemption rate" not "conversion").
- Below: "Last 30 days" section — CSS bar strip from `visitsByDay` (30 bars,
  height proportional to max count in the range; 0-count days render a
  minimum-height sliver, not an invisible bar).
- Empty state: `enrolled === 0` renders a single "No customers yet — share
  your QR from the Grow tab" card instead of zero-value tiles.

## C. Plan page revamp — `src/app/dashboard/plan/page.tsx` (modify)

Existing Free/Pro feature table and upgrade CTA are unchanged. New section
inserted above the feature table:

- Only rendered when the vendor's **current program** (first program by
  `listPrograms()` order, same one Counter/Grow default to) has
  `enrolled > 0`. Zero customers → section omitted entirely (nothing true to
  say yet).
- Calls `getProgramStats` for that program.
- Renders 1-2 sentences using the vendor's real numbers, e.g.:
  > "**{repeatVisitRate}%** of your customers have come back for a second
  > visit, and you've handed out **{rewardsTotal}** rewards so far."
- No comparison to other vendors, no invented benchmarks — only the
  vendor's own numbers, framed as the value already being delivered by
  loopkit, as the lead-in to the existing "run more than one program"
  upgrade pitch.

## D. Switcher badges — `dashboard-nav.tsx` + `layout.tsx` (modify)

- `layout.tsx` already fetches `programs` via `listPrograms()` for the nav.
  Add a `Promise.all` over `programs.map(p => getProgramStats(p.id))`
  (parallel, not sequential — N programs is small, Pro-gated) and pass an
  `activeByProgramId: Record<string, number>` map into `DashboardNav`.
- `dashboard-nav.tsx`'s switcher dropdown (`programs.length > 1` branch,
  both desktop `DropdownMenuContent` and the mobile inline list) renders the
  program name plus a trailing muted count: `{activeByProgramId[prog.id]}
  active`. No color-coding, no "needs attention" heuristic — just the
  number; the vendor reads it themselves.
- This only fires the extra query when `programs.length > 1` (single-program
  vendors, the common case, pay no extra cost) — compute the map only in
  that branch.

## Testing

- `test/lib/stats.test.ts` (new, follows `test/lib/metrics.test.ts`
  conventions) — `classifyActivity`, `bucketVisitsByDay`, `computeCardStats`
  against fixture event arrays: zero-cards edge case (no division by zero),
  a card with only enrollment and no activity (lapsed, not active), a card
  with 2+ activity events (repeat), a lucky-tap won-visit counted as a
  reward, a `redeem` event counted as a reward, a `regen` event excluded
  from every count.
- `test/lib/metrics.test.ts` — unaffected. `isWonVisit` in `src/lib/metrics.ts`
  is not exported today; export it and import it into `stats.ts` rather than
  reimplementing the same payload-shape check.
- No new e2e coverage — this repo has no existing per-page unit/component
  tests (checked: none exist for any `/dashboard/*` page today), so stats/
  plan page rendering follows that same precedent; correctness is carried by
  the pure helper tests plus manual verification.

## Out of scope

- No revenue/spend metrics (no data source exists).
- No cross-program aggregate totals (each program's stats stay
  program-scoped; a vendor with 2 programs sees two separate stat sets, not
  a combined number).
- No historical range picker (fixed 30-day window only).
- No changes to the actual Free/Pro gate or billing logic — the plan page
  revamp is presentation only.
