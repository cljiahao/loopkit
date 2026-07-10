# Vendor stats page, plan-page ROI revamp, cross-page program badges Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give vendors visibility into how their loyalty program is
performing — a new per-program stats page, a plan page that leads with the
vendor's own numbers instead of a bare feature table, and an at-a-glance
active-customer count in the nav's program switcher for multi-program
vendors.

**Architecture:** One new shared module, `src/lib/stats.ts`, computes
`ProgramStats` from `cards` + `stamp_events` reads (RLS-scoped to the
signed-in vendor, same pattern as `activity/page.tsx`). Aggregation logic is
split into pure, directly-testable functions (`classifyActivity`,
`bucketVisitsByDay`, `computeCardStats`); only `getProgramStats` touches
Supabase. Three consumers build on it: a new `/dashboard/stats` page, a
revamped `/dashboard/plan` page, and `dashboard-nav.tsx`'s program switcher.

**Tech Stack:** Next.js 16 App Router (async `searchParams`), Supabase
`@supabase/ssr` (RLS-scoped reads, no new tables), Vitest, Tailwind v4
(CSS-only trend bars — no charting library).

## Global Constraints

- No revenue/dollar metrics anywhere — loopkit has no payment data. All
  stats derive from `cards`/`stamp_events` counts only.
- No new dependency — no chart library. The 30-day trend is a CSS bar strip.
- No migration, no schema change — everything reads existing columns.
- Event classification: activity = `kind === 'stamp' || kind === 'visit'`;
  reward = `kind === 'redeem'` or a `visit` event with `payload.won ===
  true` (reuse `isWonVisit` from `src/lib/metrics.ts`, exported, not
  reimplemented). `regen` events count toward neither.
- All dates bucket to Asia/Singapore calendar days (`sgtDateKey`, new
  helper in `src/lib/format.ts`), matching every other timestamp in this
  codebase (`formatSgtDate`/`formatSgtDateTime`).
- This codebase has zero existing tests for page/layout/nav components
  (checked: no file under `test/` matches any `/dashboard/*` page,
  `dashboard-nav`, or `layout`). Tasks 2-4 follow that precedent —
  verification is `pnpm check` (typecheck + lint + format) plus the
  existing full suite staying green, not new component tests. Task 1's
  pure aggregation functions get full unit coverage since they're the one
  piece of new logic in this plan.

---

### Task 1: Shared stats module

**Files:**
- Modify: `src/lib/format.ts` — add `sgtDateKey`
- Modify: `src/lib/metrics.ts` — export `isWonVisit` (currently private)
- Create: `src/lib/stats.ts`
- Create: `test/lib/stats.test.ts`

**Interfaces:**
- Produces: `ProgramStats` type, `getProgramStats(programId: string):
  Promise<ProgramStats>`, and the pure helpers `classifyActivity`,
  `bucketVisitsByDay`, `computeCardStats` — all exported from
  `src/lib/stats.ts` for Tasks 2-4 to import.
- Consumes: `isWonVisit` from `src/lib/metrics.ts`, `MS_PER_DAY` from
  `src/lib/utils.ts`, `sgtDateKey` from `src/lib/format.ts`,
  `createServerClient` from `src/lib/supabase/server.ts`.

- [ ] **Step 1: Add `sgtDateKey` to `src/lib/format.ts`**

Append after `formatSgtDate`:

```typescript
/** e.g. "2026-07-10" — SGT calendar-day key for grouping/bucketing. */
export function sgtDateKey(iso: string): string {
  return new Date(iso).toLocaleDateString("en-CA", { timeZone: SGT });
}
```

- [ ] **Step 2: Export `isWonVisit` from `src/lib/metrics.ts`**

Change:
```typescript
function isWonVisit(event: { kind: string; payload?: unknown }): boolean {
```
to:
```typescript
export function isWonVisit(event: { kind: string; payload?: unknown }): boolean {
```

- [ ] **Step 3: Write the failing tests for the pure helpers**

Create `test/lib/stats.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import {
  classifyActivity,
  bucketVisitsByDay,
  computeCardStats,
} from "@/lib/stats";

const DAY = 24 * 60 * 60 * 1000;
const now = Date.UTC(2026, 6, 10, 4, 0, 0); // 2026-07-10 12:00 SGT
const iso = (daysAgo: number) => new Date(now - daysAgo * DAY).toISOString();

describe("classifyActivity", () => {
  it("splits stamp/visit into activity and redeem/won-visit into rewards", () => {
    const events = [
      { card_id: "c1", kind: "stamp", created_at: iso(1) },
      { card_id: "c1", kind: "visit", created_at: iso(2), payload: { won: false } },
      { card_id: "c1", kind: "visit", created_at: iso(3), payload: { won: true } },
      { card_id: "c1", kind: "redeem", created_at: iso(1) },
      { card_id: "c1", kind: "regen", created_at: iso(1) },
    ];

    const { activityEvents, rewardEvents } = classifyActivity(events);

    expect(activityEvents).toHaveLength(3); // stamp + 2 visits
    expect(rewardEvents).toHaveLength(2); // won visit + redeem
    expect(activityEvents.some((e) => e.kind === "regen")).toBe(false);
    expect(rewardEvents.some((e) => e.kind === "regen")).toBe(false);
  });
});

describe("bucketVisitsByDay", () => {
  it("returns exactly 30 zero-filled entries, most recent last", () => {
    const buckets = bucketVisitsByDay([], now);

    expect(buckets).toHaveLength(30);
    expect(buckets.every((b) => b.count === 0)).toBe(true);
    expect(buckets[29].date).toBe("2026-07-10");
    expect(buckets[0].date).toBe("2026-06-11");
  });

  it("counts activity events into their SGT calendar-day bucket", () => {
    const buckets = bucketVisitsByDay(
      [{ created_at: iso(0) }, { created_at: iso(0) }, { created_at: iso(5) }],
      now,
    );

    const today = buckets.find((b) => b.date === "2026-07-10");
    const fiveDaysAgo = buckets.find((b) => b.date === "2026-07-05");
    expect(today?.count).toBe(2);
    expect(fiveDaysAgo?.count).toBe(1);
  });
});

describe("computeCardStats", () => {
  it("returns all-zero rates for a program with no cards (no division by zero)", () => {
    const stats = computeCardStats([], [], [], now);

    expect(stats.enrolled).toBe(0);
    expect(stats.redemptionRate).toBe(0);
    expect(stats.repeatVisitRate).toBe(0);
    expect(stats.avgVisitsPerCustomer).toBe(0);
    expect(stats.active).toBe(0);
    expect(stats.lapsed).toBe(0);
  });

  it("classifies an enrolled card with no activity as lapsed, not active", () => {
    const cards = [{ id: "c1", created_at: iso(10) }];
    const stats = computeCardStats(cards, [], [], now);

    expect(stats.enrolled).toBe(1);
    expect(stats.active).toBe(0);
    expect(stats.lapsed).toBe(1);
  });

  it("counts a card with >=2 activity events toward repeatVisitRate and marks it active", () => {
    const cards = [
      { id: "c1", created_at: iso(20) },
      { id: "c2", created_at: iso(20) },
    ];
    const activityEvents = [
      { card_id: "c1", kind: "stamp", created_at: iso(1) },
      { card_id: "c1", kind: "stamp", created_at: iso(2) },
      { card_id: "c2", kind: "stamp", created_at: iso(1) },
    ];
    const stats = computeCardStats(cards, activityEvents, [], now);

    expect(stats.repeatVisitRate).toBe(0.5); // c1 repeats, c2 doesn't
    expect(stats.active).toBe(2); // both had activity within 30d
    expect(stats.visitsTotal).toBe(3);
    expect(stats.avgVisitsPerCustomer).toBe(1.5);
  });

  it("computes redemptionRate from reward events over enrolled count", () => {
    const cards = [
      { id: "c1", created_at: iso(20) },
      { id: "c2", created_at: iso(20) },
    ];
    const rewardEvents = [{ card_id: "c1", kind: "redeem", created_at: iso(1) }];
    const stats = computeCardStats(cards, [], rewardEvents, now);

    expect(stats.redemptionRate).toBe(0.5);
    expect(stats.rewardsTotal).toBe(1);
  });

  it("only counts activity/rewards within the last 7/30 days toward the windowed fields", () => {
    const cards = [{ id: "c1", created_at: iso(40) }];
    const activityEvents = [
      { card_id: "c1", kind: "stamp", created_at: iso(5) },
      { card_id: "c1", kind: "stamp", created_at: iso(35) },
    ];
    const rewardEvents = [{ card_id: "c1", kind: "redeem", created_at: iso(35) }];
    const stats = computeCardStats(cards, activityEvents, rewardEvents, now);

    expect(stats.visitsTotal).toBe(2);
    expect(stats.visits30d).toBe(1); // only the iso(5) stamp
    expect(stats.rewardsTotal).toBe(1);
    expect(stats.rewards30d).toBe(0); // the redeem is 35d ago
    expect(stats.newThisWeek).toBe(0); // card enrolled 40d ago
  });
});
```

- [ ] **Step 4: Run the tests to verify they fail**

Run: `pnpm vitest run test/lib/stats.test.ts`
Expected: FAIL — `@/lib/stats` has no exported member `classifyActivity` (module doesn't exist yet).

- [ ] **Step 5: Implement `src/lib/stats.ts`**

```typescript
import { createServerClient } from "@/lib/supabase/server";
import { sgtDateKey } from "@/lib/format";
import { isWonVisit } from "@/lib/metrics";
import { MS_PER_DAY } from "@/lib/utils";

export type ProgramStats = {
  enrolled: number;
  newThisWeek: number;
  visitsTotal: number;
  visits30d: number;
  visitsByDay: { date: string; count: number }[];
  rewardsTotal: number;
  rewards30d: number;
  redemptionRate: number;
  repeatVisitRate: number;
  active: number;
  lapsed: number;
  avgVisitsPerCustomer: number;
};

type StatsEvent = {
  card_id: string;
  kind: string;
  created_at: string;
  payload?: unknown;
};
type StatsCard = { id: string; created_at: string };

// Splits raw stamp_events into the two buckets every stat in this module is
// built from. `regen` (card regeneration) events land in neither — they are
// not a customer action.
export function classifyActivity(events: StatsEvent[]): {
  activityEvents: StatsEvent[];
  rewardEvents: StatsEvent[];
} {
  const activityEvents = events.filter(
    (e) => e.kind === "stamp" || e.kind === "visit",
  );
  const rewardEvents = events.filter(
    (e) => e.kind === "redeem" || isWonVisit(e),
  );
  return { activityEvents, rewardEvents };
}

// Always 30 entries (oldest first, today last), zero-filled for days with no
// activity — callers can render a fixed-width bar strip with no gap logic.
export function bucketVisitsByDay(
  activityEvents: { created_at: string }[],
  nowMs: number,
): { date: string; count: number }[] {
  const countByDay = new Map<string, number>();
  for (const e of activityEvents) {
    const key = sgtDateKey(e.created_at);
    countByDay.set(key, (countByDay.get(key) ?? 0) + 1);
  }

  const days: { date: string; count: number }[] = [];
  for (let i = 29; i >= 0; i--) {
    const key = sgtDateKey(new Date(nowMs - i * MS_PER_DAY).toISOString());
    days.push({ date: key, count: countByDay.get(key) ?? 0 });
  }
  return days;
}

// Pure card-level aggregation. `activityEvents`/`rewardEvents` are the
// already-classified arrays from `classifyActivity` — this function does no
// kind filtering itself.
export function computeCardStats(
  cards: StatsCard[],
  activityEvents: StatsEvent[],
  rewardEvents: StatsEvent[],
  nowMs: number,
): Omit<ProgramStats, "visitsByDay"> {
  const enrolled = cards.length;
  const cutoff7d = nowMs - 7 * MS_PER_DAY;
  const cutoff30d = nowMs - 30 * MS_PER_DAY;

  const newThisWeek = cards.filter(
    (c) => Date.parse(c.created_at) >= cutoff7d,
  ).length;

  const visitsTotal = activityEvents.length;
  const visits30d = activityEvents.filter(
    (e) => Date.parse(e.created_at) >= cutoff30d,
  ).length;

  const rewardsTotal = rewardEvents.length;
  const rewards30d = rewardEvents.filter(
    (e) => Date.parse(e.created_at) >= cutoff30d,
  ).length;

  const activityCountByCard = new Map<string, number>();
  const activeCardIds = new Set<string>();
  for (const e of activityEvents) {
    activityCountByCard.set(
      e.card_id,
      (activityCountByCard.get(e.card_id) ?? 0) + 1,
    );
    if (Date.parse(e.created_at) >= cutoff30d) activeCardIds.add(e.card_id);
  }
  const repeatCards = [...activityCountByCard.values()].filter(
    (n) => n >= 2,
  ).length;

  return {
    enrolled,
    newThisWeek,
    visitsTotal,
    visits30d,
    rewardsTotal,
    rewards30d,
    redemptionRate: enrolled === 0 ? 0 : rewardsTotal / enrolled,
    repeatVisitRate: enrolled === 0 ? 0 : repeatCards / enrolled,
    active: activeCardIds.size,
    lapsed: enrolled - activeCardIds.size,
    avgVisitsPerCustomer: enrolled === 0 ? 0 : visitsTotal / enrolled,
  };
}

// Impure shell: fetch this program's cards + stamp_events (RLS scopes both
// to the signed-in vendor, same as activity/page.tsx), then delegate to the
// pure helpers above.
export async function getProgramStats(programId: string): Promise<ProgramStats> {
  const supabase = await createServerClient();
  const nowMs = Date.now();

  const { data: cards, error: cardsError } = await supabase
    .from("cards")
    .select("id,created_at")
    .eq("program_id", programId);
  if (cardsError) throw new Error(`getProgramStats: ${cardsError.message}`);

  const cardIds = (cards ?? []).map((c) => c.id);

  let events: StatsEvent[] = [];
  if (cardIds.length > 0) {
    const { data, error } = await supabase
      .from("stamp_events")
      .select("card_id,kind,payload,created_at")
      .in("card_id", cardIds);
    if (error) throw new Error(`getProgramStats: ${error.message}`);
    events = data ?? [];
  }

  const { activityEvents, rewardEvents } = classifyActivity(events);
  const cardStats = computeCardStats(
    cards ?? [],
    activityEvents,
    rewardEvents,
    nowMs,
  );
  const visitsByDay = bucketVisitsByDay(activityEvents, nowMs);

  return { ...cardStats, visitsByDay };
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `pnpm vitest run test/lib/stats.test.ts`
Expected: PASS, all 8 tests.

- [ ] **Step 7: Run the full suite and typecheck**

Run: `pnpm check && pnpm test`
Expected: PASS — confirms `isWonVisit`'s export didn't break `test/lib/metrics.test.ts` (it doesn't import it, but the change is worth a full-suite confirmation).

- [ ] **Step 8: Commit**

```bash
git add src/lib/format.ts src/lib/metrics.ts src/lib/stats.ts test/lib/stats.test.ts
git commit -m "feat: add shared program-stats module (visit/reward/repeat metrics)"
```

---

### Task 2: Stats page

**Files:**
- Create: `src/app/dashboard/stats/page.tsx`
- Modify: `src/app/dashboard/dashboard-nav.tsx:21-27` (add to `LINKS`)

**Interfaces:**
- Consumes: `getProgramStats(programId: string): Promise<ProgramStats>` from
  Task 1's `src/lib/stats.ts`; `listPrograms()`/`currentProgram()` from
  `src/lib/program.ts` (existing, same pattern as
  `src/app/dashboard/activity/page.tsx`).

- [ ] **Step 1: Add the Stats link to the nav**

In `src/app/dashboard/dashboard-nav.tsx`, change:
```typescript
const LINKS = [
  { href: "/dashboard", label: "Counter" },
  { href: "/dashboard/customers", label: "Customers" },
  { href: "/dashboard/activity", label: "Activity" },
  { href: "/dashboard/grow", label: "Grow" },
  { href: "/dashboard/plan", label: "Plan" },
];
```
to:
```typescript
const LINKS = [
  { href: "/dashboard", label: "Counter" },
  { href: "/dashboard/customers", label: "Customers" },
  { href: "/dashboard/activity", label: "Activity" },
  { href: "/dashboard/stats", label: "Stats" },
  { href: "/dashboard/grow", label: "Grow" },
  { href: "/dashboard/plan", label: "Plan" },
];
```

- [ ] **Step 2: Create the stats page**

Create `src/app/dashboard/stats/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { requireVendor } from "@/lib/auth";
import { listPrograms, currentProgram } from "@/lib/program";
import { getProgramStats } from "@/lib/stats";

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border bg-card p-5 shadow-sm">
      <p className="text-2xl font-bold tracking-tight">{value}</p>
      <p className="mt-1 text-xs font-medium text-muted-foreground">
        {label}
      </p>
    </div>
  );
}

export default async function StatsPage({
  searchParams,
}: {
  searchParams: Promise<{ p?: string }>;
}) {
  await requireVendor();

  const programs = await listPrograms();
  const { p } = await searchParams;
  const program = currentProgram(programs, p);
  if (!program) redirect("/setup");

  const stats = await getProgramStats(program.id);
  const maxDay = Math.max(1, ...stats.visitsByDay.map((d) => d.count));

  return (
    <main className="mx-auto max-w-4xl space-y-8 p-5 py-10">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Stats</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          How {program.name} is performing.
        </p>
      </div>

      {stats.enrolled === 0 ? (
        <div className="rounded-2xl border bg-card p-6 shadow-sm">
          <p className="text-sm text-muted-foreground">
            No customers yet — share your QR from the Grow tab to start
            enrolling.
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Tile label="Enrolled customers" value={String(stats.enrolled)} />
            <Tile
              label="Active / lapsed (30d)"
              value={`${stats.active} / ${stats.lapsed}`}
            />
            <Tile
              label="Redemption rate"
              value={`${Math.round(stats.redemptionRate * 100)}%`}
            />
            <Tile
              label="Repeat-visit rate"
              value={`${Math.round(stats.repeatVisitRate * 100)}%`}
            />
          </div>

          <div className="rounded-2xl border bg-card p-6 shadow-sm">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Last 30 days
            </h2>
            <div className="mt-4 flex h-24 items-end gap-[3px]">
              {stats.visitsByDay.map((d) => (
                <div
                  key={d.date}
                  title={`${d.date}: ${d.count}`}
                  className="flex-1 rounded-t bg-primary/70"
                  style={{
                    height: `${Math.max(4, (d.count / maxDay) * 100)}%`,
                  }}
                />
              ))}
            </div>
          </div>
        </>
      )}
    </main>
  );
}
```

- [ ] **Step 3: Run typecheck/lint/format and the full test suite**

Run: `pnpm check && pnpm test`
Expected: PASS. No new tests are expected here — this repo has no
page-component test precedent (see Global Constraints); the underlying
`getProgramStats`/pure-helper logic this page composes is already covered
by Task 1.

- [ ] **Step 4: Commit**

```bash
git add src/app/dashboard/stats/page.tsx src/app/dashboard/dashboard-nav.tsx
git commit -m "feat: add per-program stats page"
```

---

### Task 3: Plan page ROI revamp

**Files:**
- Modify: `src/app/dashboard/plan/page.tsx` (full file — see below for the
  complete new version)

**Interfaces:**
- Consumes: `getProgramStats` (Task 1), `listPrograms`/`currentProgram`
  from `src/lib/program.ts` (existing).

- [ ] **Step 1: Replace `src/app/dashboard/plan/page.tsx`**

Current file (77 lines) imports `isPro` only and has no program-scoped
data. Replace the whole file with:

```tsx
import { Check, Sparkles } from "lucide-react";
import { requireVendor } from "@/lib/auth";
import { isPro, listPrograms, currentProgram } from "@/lib/program";
import { getProgramStats } from "@/lib/stats";
import { UpgradeCta } from "@/app/dashboard/plan/upgrade-cta";
import { Badge } from "@/components/ui/badge";

function Cell({ on }: { on: boolean }) {
  return (
    <span className="flex justify-center">
      {on ? (
        <Check className="size-4 text-primary" />
      ) : (
        <span className="text-muted-foreground/40">—</span>
      )}
    </span>
  );
}

export default async function PlanPage() {
  await requireVendor();
  const [pro, programs] = await Promise.all([isPro(), listPrograms()]);
  const program = currentProgram(programs);
  const stats = program ? await getProgramStats(program.id) : null;

  return (
    <main className="mx-auto max-w-2xl space-y-7 p-5 py-10">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Billing
          </p>
          <h1 className="font-display text-3xl font-bold tracking-tight">
            Plan
          </h1>
        </div>
        <span className="inline-flex items-center gap-1.5">
          {pro && <Sparkles className="size-3.5 text-primary" />}
          <Badge variant={pro ? "gold" : "secondary"}>
            {pro ? "Pro" : "Free"}
          </Badge>
        </span>
      </div>

      {stats && stats.enrolled > 0 && program && (
        <p className="rounded-xl border bg-card px-5 py-4 text-sm">
          <strong className="font-semibold">
            {Math.round(stats.repeatVisitRate * 100)}%
          </strong>{" "}
          of your customers have come back for a second visit, and
          you&apos;ve handed out{" "}
          <strong className="font-semibold">{stats.rewardsTotal}</strong>{" "}
          reward{stats.rewardsTotal === 1 ? "" : "s"} so far with{" "}
          {program.name}.
        </p>
      )}

      {pro ? (
        <p className="rounded-xl border bg-card px-5 py-4 text-sm text-muted-foreground">
          You&apos;re on Pro — unlimited loyalty programs are unlocked. Thanks
          for supporting loopkit.
        </p>
      ) : (
        <div className="rounded-2xl border border-primary/40 bg-card p-5">
          <div className="flex items-center gap-2">
            <Sparkles className="size-4 text-primary" />
            <h2 className="font-display text-xl font-semibold">Pro</h2>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            Run more than one loyalty program at a time. Message us and
            we&apos;ll set you up — no card needed yet.
          </p>
          <div className="mt-4">
            <UpgradeCta />
          </div>
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border">
        <div className="grid grid-cols-[1fr_auto_auto] gap-x-5 px-5 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <span>Feature</span>
          <span className="text-center">Free</span>
          <span className="text-center">Pro</span>
        </div>
        <div className="grid grid-cols-[1fr_auto_auto] items-center gap-x-5 border-t px-5 py-3 text-sm">
          <span>Loyalty programs</span>
          <span className="text-center text-muted-foreground">1</span>
          <Cell on={true} />
        </div>
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Run typecheck/lint/format and the full test suite**

Run: `pnpm check && pnpm test`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/app/dashboard/plan/page.tsx
git commit -m "feat: lead plan page with the vendor's own stats"
```

---

### Task 4: Switcher active-customer badges

**Files:**
- Modify: `src/app/dashboard/layout.tsx` (full file — see below)
- Modify: `src/app/dashboard/dashboard-nav.tsx` (switcher rendering — desktop
  dropdown around line 118-124, mobile inline list around line 206-218, plus
  the component's prop signature at line 75-85)

**Interfaces:**
- Consumes: `getProgramStats` (Task 1).
- Produces: `DashboardNav` gains a required prop
  `activeByProgramId: Record<string, number>`.

- [ ] **Step 1: Replace `src/app/dashboard/layout.tsx`**

```tsx
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { requireVendor } from "@/lib/auth";
import { isAdmin } from "@/lib/admin";
import { isPro, listPrograms } from "@/lib/program";
import { getProgramStats } from "@/lib/stats";
import { createServerClient } from "@/lib/supabase/server";
import { DashboardNav } from "@/app/dashboard/dashboard-nav";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user } = await requireVendor();

  // Admins have no program and don't use the vendor dashboard — send them home.
  if (await isAdmin(user.id)) redirect("/admin");

  const [pro, programs] = await Promise.all([isPro(), listPrograms()]);

  // Only fetch per-program stats when there's a switcher to show them in —
  // the common single-program case pays no extra query.
  const activeByProgramId: Record<string, number> = {};
  if (programs.length > 1) {
    const stats = await Promise.all(
      programs.map((prog) => getProgramStats(prog.id)),
    );
    programs.forEach((prog, i) => {
      activeByProgramId[prog.id] = stats[i].active;
    });
  }

  // Inline server action so the header's Sign out `<form>` can post directly —
  // no client bundle, no exposed endpoint beyond this closure.
  async function signOut() {
    "use server";
    const supabase = await createServerClient();
    await supabase.auth.signOut();
    redirect("/login");
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-20 border-b bg-background/85 px-5 py-3 backdrop-blur-md">
        <Suspense fallback={null}>
          <DashboardNav
            signOut={signOut}
            email={user.email ?? ""}
            tier={pro ? "pro" : "free"}
            programs={programs}
            activeByProgramId={activeByProgramId}
          />
        </Suspense>
      </header>
      <div className="flex-1">{children}</div>
    </div>
  );
}
```

- [ ] **Step 2: Add the prop to `DashboardNav`'s signature**

In `src/app/dashboard/dashboard-nav.tsx`, change:
```typescript
export function DashboardNav({
  signOut,
  email,
  tier,
  programs,
}: {
  signOut: () => Promise<void>;
  email: string;
  tier: Tier;
  programs: Program[];
}) {
```
to:
```typescript
export function DashboardNav({
  signOut,
  email,
  tier,
  programs,
  activeByProgramId,
}: {
  signOut: () => Promise<void>;
  email: string;
  tier: Tier;
  programs: Program[];
  activeByProgramId: Record<string, number>;
}) {
```

- [ ] **Step 3: Render the badge in the desktop switcher dropdown**

Change:
```tsx
            <DropdownMenuContent align="start" className="w-56 rounded-xl">
              {programs.map((prog) => (
                <DropdownMenuItem key={prog.id} asChild>
                  <Link href={`/dashboard?p=${prog.id}`}>{prog.name}</Link>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
```
to:
```tsx
            <DropdownMenuContent align="start" className="w-56 rounded-xl">
              {programs.map((prog) => (
                <DropdownMenuItem key={prog.id} asChild>
                  <Link
                    href={`/dashboard?p=${prog.id}`}
                    className="flex items-center justify-between gap-2"
                  >
                    <span className="truncate">{prog.name}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {activeByProgramId[prog.id] ?? 0} active
                    </span>
                  </Link>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
```

- [ ] **Step 4: Render the badge in the mobile inline switcher list**

Change:
```tsx
              {programs.map((prog) => (
                <Link
                  key={prog.id}
                  href={`/dashboard?p=${prog.id}`}
                  onClick={() => setMobileOpen(false)}
                  className={cn(
                    "rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-secondary",
                    prog.id === currentProgram?.id && "text-primary",
                  )}
                >
                  {prog.name}
                </Link>
              ))}
```
to:
```tsx
              {programs.map((prog) => (
                <Link
                  key={prog.id}
                  href={`/dashboard?p=${prog.id}`}
                  onClick={() => setMobileOpen(false)}
                  className={cn(
                    "flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-secondary",
                    prog.id === currentProgram?.id && "text-primary",
                  )}
                >
                  <span className="truncate">{prog.name}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {activeByProgramId[prog.id] ?? 0} active
                  </span>
                </Link>
              ))}
```

- [ ] **Step 5: Run typecheck/lint/format and the full test suite**

Run: `pnpm check && pnpm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/app/dashboard/layout.tsx src/app/dashboard/dashboard-nav.tsx
git commit -m "feat: show active-customer count in the multi-program switcher"
```
