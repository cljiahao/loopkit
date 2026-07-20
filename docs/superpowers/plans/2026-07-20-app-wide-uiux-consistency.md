# App-wide UI-UX Consistency Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the `ElevatedCard`/`Section` visual language (built in PR #14) to every remaining loopkit page, rebuild `/earn`'s under-built form onto shadcn components, and fix one real mobile-breakpoint issue in the activity filters — a mechanical, presentation-only pass with no behavior or copy changes.

**Architecture:** Every task replaces an ad-hoc `rounded-2xl border bg-card ... shadow-sm` (or a plainer pre-`ElevatedCard` variant) wrapper with the `ElevatedCard` component, or — for the one raw-HTML form (`/earn`) — rebuilds onto the same shadcn `Input`/`Button`/`Label` trio already used by `/c`'s `CheckForm`. No data-fetching, routing, or copy changes anywhere.

**Tech Stack:** Next.js 16 App Router, TypeScript strict, Tailwind v4, shadcn/ui, Vitest + Testing Library (`@vitest-environment jsdom`), `pnpm`.

## Global Constraints

- TypeScript strict — no `any`, no `@ts-ignore` (per `AGENTS.md`).
- `pnpm check` (prettier --check + eslint + tsc --noEmit) must pass after every task.
- `pnpm test` (full Vitest suite) must stay green after every task — this repo's Stop hook runs it automatically and blocks on failure.
- No copy, routing, data-fetching, or grid-breakpoint changes except the one explicitly called out in Task 5 (`activity-filters.tsx` mobile width fix).
- `git status` shows a clean tree on branch `app-wide-uiux-consistency` (already created, spec already committed there) before starting Task 1.
- Reuse `ElevatedCard`/`Section` from `src/components/elevated-card.tsx` / `src/components/section.tsx` — do not create new card primitives.
- `cn()` (`src/lib/utils.ts`) uses `tailwind-merge`, so passing a conflicting class (e.g. a custom `border-primary/40`) via `ElevatedCard`'s `className` prop correctly overrides the base class — no need to avoid that pattern.

---

## File Structure

- `src/components/elevated-card.tsx` — **modify**: widen the `as` prop union so list items (`<li>`) can use it.
- `src/app/dashboard/stats/page.tsx` — **modify**: `Tile`, two empty-state blocks, two chart-wrapper blocks → `ElevatedCard`.
- `src/app/dashboard/customers/page.tsx` — **modify**: two empty-state blocks and two `<li>` row patterns → `ElevatedCard`.
- `src/app/dashboard/activity/activity-table.tsx` — **modify**: empty-state block → `ElevatedCard`.
- `src/app/dashboard/activity/activity-filters.tsx` — **modify**: form wrapper → inline `ElevatedCard`-equivalent classes; mobile-width fix on the three filter fields.
- `src/app/dashboard/plan/page.tsx` — **modify**: repeat-visit stat box, Pro-active text box, Pro upsell card → `ElevatedCard`.
- `src/app/dashboard/settings/page.tsx` — no wrapper of its own; see `qkit-earn-settings.tsx` below.
- `src/app/dashboard/qkit-earn-settings.tsx` — **modify**: card wrapper + raw `<button>` → `ElevatedCard` + shadcn `Button`.
- `src/app/admin/stat.tsx` — **modify**: `Stat` tile → `ElevatedCard`.
- `src/app/admin/page.tsx` — **modify**: recent-activity wrapper → `ElevatedCard`.
- `src/app/admin/programs/page.tsx` — **modify**: table wrapper → `ElevatedCard`.
- `src/app/admin/vendors/page.tsx` — **modify**: pending-requests wrapper + table wrapper → `ElevatedCard`.
- `src/features/auth/components/login-form.tsx` — **modify**: two card wrappers (sent-state, main form) → `ElevatedCard`.
- `src/features/auth/components/reset-password-form.tsx` — **modify**: card wrapper → `ElevatedCard`.
- `src/app/earn/earn-form.tsx` — **modify**: full rebuild onto shadcn `Input`/`Button`/`Label` + `ElevatedCard`.
- `src/app/earn/earn-form.dom.test.tsx` — **create**: first test coverage for this component.

**Not touched** (checked during design, confirmed out of scope): `src/app/dashboard/counter/page.tsx` and `src/app/dashboard/serve-customer.tsx` (no ad-hoc card wrapper exists at the page level — `ServeCustomer`'s internal `gold`/`muted` status boxes are a distinct, deliberate semantic component, same category as `ProgramCard`'s stretched-link container, which the July 19 spec already ruled out); `src/app/c/page.tsx` (already well-built); admin's `overflow-x-auto`/`min-w-[...]` table-scroll behavior and the dashed-border empty-state paragraphs in `admin/programs` and `admin/vendors` (both are already-correct, deliberately distinct patterns, not the ad-hoc card pattern this plan targets); `plan/page.tsx`'s feature-comparison table wrapper (`overflow-hidden rounded-2xl border`, no `bg-card`/shadow — same "plain container, not a card" category).

---

### Task 1: Widen `ElevatedCard`'s `as` prop to support list items

**Files:**

- Modify: `src/components/elevated-card.tsx`

**Interfaces:**

- Consumes: nothing new.
- Produces: `ElevatedCard`'s `as` prop now accepts `"div" | "section" | "li"`. Every later task that renders a `<li>` card (Task 3) depends on this.

- [ ] **Step 1: Widen the `as` union**

Edit `src/components/elevated-card.tsx`:

```tsx
import { cn } from "@/lib/utils";

// The polished-card look shared across profile/dashboard/setup: rounded
// corners, a soft two-layer lifted shadow, no scallop/paper theme (that's
// qkit's Ticket component, deliberately not adopted here — see
// docs/superpowers/specs/2026-07-19-dashboard-setup-profile-uiux-design.md).
export function ElevatedCard({
  as: As = "div",
  className,
  children,
  ...props
}: {
  as?: "div" | "section" | "li";
  className?: string;
  children: React.ReactNode;
} & React.HTMLAttributes<HTMLElement>) {
  return (
    <As
      className={cn(
        "rounded-[20px] border bg-card shadow-[0_1px_0_0_var(--color-border),0_12px_28px_-20px_rgba(0,0,0,0.35)]",
        className,
      )}
      {...props}
    >
      {children}
    </As>
  );
}
```

(Only the `as` prop's type changed — `"li"` added.)

- [ ] **Step 2: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: no errors (this is a pure type-widening change, nothing consumes `"li"` yet).

- [ ] **Step 3: Commit**

```bash
git add src/components/elevated-card.tsx
git commit -m "feat(ui): allow ElevatedCard to render as a list item"
```

---

### Task 2: Reskin `/dashboard/stats`

**Files:**

- Modify: `src/app/dashboard/stats/page.tsx`

**Interfaces:**

- Consumes: `ElevatedCard` from `@/components/elevated-card` (`as` defaults to `"div"`, not used here).
- Produces: nothing new for later tasks.

- [ ] **Step 1: Add the import**

In `src/app/dashboard/stats/page.tsx`, add near the top:

```tsx
import { ElevatedCard } from "@/components/elevated-card";
```

- [ ] **Step 2: Reskin the `Tile` component**

Replace:

```tsx
function Tile({
  label,
  value,
  delta,
}: {
  label: string;
  value: string;
  delta?: number | null;
}) {
  return (
    <div className="rounded-2xl border bg-card p-5 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <p className="text-2xl font-bold tracking-tight">{value}</p>
        {delta !== undefined && <Delta pct={delta} />}
      </div>
      <p className="mt-1 text-xs font-medium text-muted-foreground">{label}</p>
    </div>
  );
}
```

with:

```tsx
function Tile({
  label,
  value,
  delta,
}: {
  label: string;
  value: string;
  delta?: number | null;
}) {
  return (
    <ElevatedCard className="p-5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-2xl font-bold tracking-tight">{value}</p>
        {delta !== undefined && <Delta pct={delta} />}
      </div>
      <p className="mt-1 text-xs font-medium text-muted-foreground">{label}</p>
    </ElevatedCard>
  );
}
```

- [ ] **Step 3: Reskin both "no customers yet" empty states**

There are two identical occurrences (the no-`p` branch and the `p` branch). Replace each:

```tsx
<div className="rounded-2xl border bg-card p-6 shadow-sm">
  <p className="text-sm text-muted-foreground">
    No customers yet — share your QR from the Counter page to start enrolling.
  </p>
</div>
```

with:

```tsx
<ElevatedCard className="p-6">
  <p className="text-sm text-muted-foreground">
    No customers yet — share your QR from the Counter page to start enrolling.
  </p>
</ElevatedCard>
```

- [ ] **Step 4: Reskin both "Last 30 days" chart wrappers**

There are two identical occurrences. Replace each:

```tsx
<div className="rounded-2xl border bg-card p-6 shadow-sm">
  <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
    Last 30 days
  </h2>
  <div className="mt-4 flex h-24 items-end gap-[3px]">
```

with:

```tsx
<ElevatedCard className="p-6">
  <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
    Last 30 days
  </h2>
  <div className="mt-4 flex h-24 items-end gap-[3px]">
```

(closing tag becomes `</ElevatedCard>` in both places, matching the opening tag)

- [ ] **Step 5: Typecheck and run the full suite**

Run: `pnpm exec tsc --noEmit`
Expected: no errors.

Run: `pnpm test --run`
Expected: all pass (this page has no dedicated test file today, so this just confirms nothing else broke).

- [ ] **Step 6: Commit**

```bash
git add src/app/dashboard/stats/page.tsx
git commit -m "style(dashboard): reskin stats page onto ElevatedCard"
```

---

### Task 3: Reskin `/dashboard/customers`

**Files:**

- Modify: `src/app/dashboard/customers/page.tsx`
- Test: `src/app/dashboard/customers/customers-page.dom.test.tsx` (existing — verifies this task, not modified)

**Interfaces:**

- Consumes: `ElevatedCard` (now with `as="li"` from Task 1).
- Produces: nothing new for later tasks.

- [ ] **Step 1: Add the import**

```tsx
import { ElevatedCard } from "@/components/elevated-card";
```

- [ ] **Step 2: Reskin `VendorCustomerList`'s empty state and list rows**

Replace:

```tsx
  if (customers.length === 0) {
    return (
      <div className="rounded-2xl border bg-card p-6 shadow-sm">
        <p className="text-sm text-muted-foreground">No customers yet.</p>
      </div>
    );
  }

  return (
    <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {customers.map((customer) => (
        <li
          key={customer.phone}
          className="flex flex-col gap-2 rounded-xl border bg-card p-3 text-sm shadow-sm"
        >
```

with:

```tsx
  if (customers.length === 0) {
    return (
      <ElevatedCard className="p-6">
        <p className="text-sm text-muted-foreground">No customers yet.</p>
      </ElevatedCard>
    );
  }

  return (
    <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {customers.map((customer) => (
        <ElevatedCard
          as="li"
          key={customer.phone}
          className="flex flex-col gap-2 p-3 text-sm"
        >
```

(the matching closing `</li>` for this block becomes `</ElevatedCard>`)

- [ ] **Step 3: Reskin the per-program empty state and card list rows**

Replace (appears twice — once in the no-`p` branch, once in the `p` branch — for the empty state):

```tsx
<div className="rounded-2xl border bg-card p-6 shadow-sm">
  <p className="text-sm text-muted-foreground">No customers yet.</p>
</div>
```

with:

```tsx
<ElevatedCard className="p-6">
  <p className="text-sm text-muted-foreground">No customers yet.</p>
</ElevatedCard>
```

Replace the cards list:

```tsx
<ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
  {cards.map((card) => (
    <li
      key={card.id}
      className="flex items-center justify-between gap-3 rounded-xl border bg-card p-3 text-sm shadow-sm"
    >
```

with:

```tsx
<ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
  {cards.map((card) => (
    <ElevatedCard
      as="li"
      key={card.id}
      className="flex items-center justify-between gap-3 p-3 text-sm"
    >
```

(matching closing `</li>` becomes `</ElevatedCard>`)

- [ ] **Step 4: Run the existing test and the full suite**

Run: `pnpm test --run src/app/dashboard/customers/customers-page.dom.test.tsx`
Expected: 3 passed (asserts on text content/roles only — unaffected by the tag/class swap).

Run: `pnpm exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/app/dashboard/customers/page.tsx
git commit -m "style(dashboard): reskin customers page onto ElevatedCard"
```

---

### Task 4: Reskin `activity-table.tsx`'s empty state

**Files:**

- Modify: `src/app/dashboard/activity/activity-table.tsx`
- Test: `src/app/dashboard/activity/activity-page.dom.test.tsx` (existing — verifies this task, not modified)

**Interfaces:**

- Consumes: `ElevatedCard`.
- Produces: nothing new for later tasks.

- [ ] **Step 1: Add the import and reskin the empty state**

Add near the top:

```tsx
import { ElevatedCard } from "@/components/elevated-card";
```

Replace:

```tsx
if (activity.length === 0) {
  return (
    <div className="rounded-2xl border bg-card p-6 shadow-sm">
      <p className="text-sm text-muted-foreground">
        No activity matches these filters.
      </p>
    </div>
  );
}
```

with:

```tsx
if (activity.length === 0) {
  return (
    <ElevatedCard className="p-6">
      <p className="text-sm text-muted-foreground">
        No activity matches these filters.
      </p>
    </ElevatedCard>
  );
}
```

(The `<Table>` wrapper below this — `<div className="overflow-hidden rounded-2xl border">` — has no `bg-card`/shadow and is left unchanged; it's a plain table container, not the ad-hoc card pattern.)

- [ ] **Step 2: Run the existing test**

Run: `pnpm test --run src/app/dashboard/activity/activity-page.dom.test.tsx`
Expected: 3 passed.

- [ ] **Step 3: Commit**

```bash
git add src/app/dashboard/activity/activity-table.tsx
git commit -m "style(dashboard): reskin activity empty state onto ElevatedCard"
```

---

### Task 5: Reskin `activity-filters.tsx` and fix its mobile stacking

**Files:**

- Modify: `src/app/dashboard/activity/activity-filters.tsx`
- Test: `src/app/dashboard/activity/activity-page.dom.test.tsx` (existing — verifies this task doesn't break the page render; it does not test `ActivityFilters` directly)

**Interfaces:**

- Consumes: nothing new (this file keeps its own `<form>` element — see rationale below).
- Produces: nothing new for later tasks.

`ElevatedCard`'s `as` prop only supports `"div" | "section" | "li"` (Task 1) — not `"form"`, because a real `<form>` needs `action`/`method` attributes that `React.HTMLAttributes<HTMLElement>` doesn't type. Rather than widening the primitive's typing for one page, this task applies the identical Tailwind classes `ElevatedCard` uses directly to the `<form>` element, with a comment explaining why.

- [ ] **Step 1: Reskin the form wrapper**

Replace:

```tsx
    <form
      action={basePath}
      method="get"
      className="flex flex-wrap items-end gap-3 rounded-2xl border bg-card p-4"
    >
```

with:

```tsx
    // Matches ElevatedCard's classes directly — a <form> needs action/method,
    // which ElevatedCard's as="div"|"section"|"li" prop type doesn't support.
    <form
      action={basePath}
      method="get"
      className="flex flex-wrap items-end gap-3 rounded-[20px] border bg-card p-4 shadow-[0_1px_0_0_var(--color-border),0_12px_28px_-20px_rgba(0,0,0,0.35)]"
    >
```

- [ ] **Step 2: Fix mobile stacking on the three filter fields and the submit button**

Replace:

```tsx
      <div className="space-y-1.5">
        <Label
          htmlFor="activity-type"
          className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
        >
          Type
        </Label>
        <Select name="type" defaultValue={type ?? TYPE_ALL}>
          <SelectTrigger id="activity-type" className="h-9 w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TYPE_ALL}>All</SelectItem>
            <SelectItem value="stamps">Stamps</SelectItem>
            <SelectItem value="rewards">Rewards</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label
          htmlFor="activity-from"
          className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
        >
          From
        </Label>
        <Input
          id="activity-from"
          type="date"
          name="from"
          defaultValue={from ?? ""}
          className="h-9 w-40"
        />
      </div>
      <div className="space-y-1.5">
        <Label
          htmlFor="activity-to"
          className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
        >
          To
        </Label>
        <Input
          id="activity-to"
          type="date"
          name="to"
          defaultValue={to ?? ""}
          className="h-9 w-40"
        />
      </div>
      <Button type="submit" variant="outline" className="h-9 rounded-lg">
        Apply filters
      </Button>
```

with:

```tsx
      <div className="w-full space-y-1.5 sm:w-auto">
        <Label
          htmlFor="activity-type"
          className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
        >
          Type
        </Label>
        <Select name="type" defaultValue={type ?? TYPE_ALL}>
          <SelectTrigger id="activity-type" className="h-9 w-full sm:w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TYPE_ALL}>All</SelectItem>
            <SelectItem value="stamps">Stamps</SelectItem>
            <SelectItem value="rewards">Rewards</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="w-full space-y-1.5 sm:w-auto">
        <Label
          htmlFor="activity-from"
          className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
        >
          From
        </Label>
        <Input
          id="activity-from"
          type="date"
          name="from"
          defaultValue={from ?? ""}
          className="h-9 w-full sm:w-40"
        />
      </div>
      <div className="w-full space-y-1.5 sm:w-auto">
        <Label
          htmlFor="activity-to"
          className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
        >
          To
        </Label>
        <Input
          id="activity-to"
          type="date"
          name="to"
          defaultValue={to ?? ""}
          className="h-9 w-full sm:w-40"
        />
      </div>
      <Button
        type="submit"
        variant="outline"
        className="h-9 w-full rounded-lg sm:w-auto"
      >
        Apply filters
      </Button>
```

This makes each field (and the button) span the full row width below the `sm` breakpoint, so `flex-wrap` stacks them cleanly one per line instead of wrapping mid-row at odd widths; at `sm` and above it reverts to today's compact inline row.

- [ ] **Step 3: Run the existing activity test and typecheck**

Run: `pnpm test --run src/app/dashboard/activity/activity-page.dom.test.tsx`
Expected: 3 passed.

Run: `pnpm exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/dashboard/activity/activity-filters.tsx
git commit -m "fix(dashboard): stack activity filters full-width on mobile, reskin wrapper"
```

---

### Task 6: Reskin `/dashboard/plan`

**Files:**

- Modify: `src/app/dashboard/plan/page.tsx`

**Interfaces:**

- Consumes: `ElevatedCard`.
- Produces: nothing new for later tasks.

- [ ] **Step 1: Add the import**

```tsx
import { ElevatedCard } from "@/components/elevated-card";
```

- [ ] **Step 2: Reskin the repeat-visit stat box**

Replace:

```tsx
      {stats && stats.enrolled > 0 && program && (
        <div className="rounded-xl border bg-card px-5 py-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            How your program is doing
          </p>
```

with:

```tsx
      {stats && stats.enrolled > 0 && program && (
        <ElevatedCard className="px-5 py-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            How your program is doing
          </p>
```

(matching closing `</div>` becomes `</ElevatedCard>`)

- [ ] **Step 3: Reskin the Pro-active and Pro-upsell blocks**

Replace:

```tsx
{
  pro ? (
    <p className="rounded-xl border bg-card px-5 py-4 text-sm text-muted-foreground">
      You&apos;re on Pro — unlimited loyalty programs are unlocked. Thanks for
      supporting loopkit.
    </p>
  ) : (
    <div className="rounded-2xl border border-primary/40 bg-card p-5">
      <div className="flex items-center gap-2">
        <Sparkles className="size-4 text-primary" />
        <h2 className="font-display text-xl font-semibold">Pro</h2>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">
        Run more than one loyalty program at a time. Message us and we&apos;ll
        set you up — no card needed yet.
      </p>
      <div className="mt-4">
        <UpgradeCta />
      </div>
    </div>
  );
}
```

with:

```tsx
{
  pro ? (
    <ElevatedCard
      as="section"
      className="px-5 py-4 text-sm text-muted-foreground"
    >
      You&apos;re on Pro — unlimited loyalty programs are unlocked. Thanks for
      supporting loopkit.
    </ElevatedCard>
  ) : (
    <ElevatedCard className="border-primary/40 p-5">
      <div className="flex items-center gap-2">
        <Sparkles className="size-4 text-primary" />
        <h2 className="font-display text-xl font-semibold">Pro</h2>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">
        Run more than one loyalty program at a time. Message us and we&apos;ll
        set you up — no card needed yet.
      </p>
      <div className="mt-4">
        <UpgradeCta />
      </div>
    </ElevatedCard>
  );
}
```

(The Pro-active block was a `<p>`; `ElevatedCard` renders a `div`/`section`, not a `p`, so it's switched to `as="section"` — text content and styling are unchanged, only the wrapping tag. `border-primary/40` overriding `ElevatedCard`'s default border color works via `cn()`'s `tailwind-merge`, per Global Constraints.)

The feature-comparison table below (`<div className="overflow-hidden rounded-2xl border">`) is left unchanged — no `bg-card`/shadow, a plain table container like `activity-table.tsx`'s.

- [ ] **Step 4: Typecheck and run the full suite**

Run: `pnpm exec tsc --noEmit`
Expected: no errors.

Run: `pnpm test --run`
Expected: all pass (no dedicated test file for this page today).

- [ ] **Step 5: Commit**

```bash
git add src/app/dashboard/plan/page.tsx
git commit -m "style(dashboard): reskin plan page onto ElevatedCard"
```

---

### Task 7: Reskin `/dashboard/settings` (`qkit-earn-settings.tsx`)

**Files:**

- Modify: `src/app/dashboard/qkit-earn-settings.tsx`

**Interfaces:**

- Consumes: `ElevatedCard`, shadcn `Button` (`@/components/ui/button`).
- Produces: nothing new for later tasks.

`settings/page.tsx` itself has no card wrapper — its only content is this component, which currently uses a plainer `rounded-lg border p-4` pattern (predates even the pre-#14 `rounded-2xl` convention) and a raw unstyled `<button>` for Save — the same class of touch-target/token gap as `/earn`'s form (Task 14), fixed here for the same reason: it's the one interactive control on this page and it's a phone-hostile hit target today.

- [ ] **Step 1: Add imports**

Replace:

```tsx
"use client";

import { useTransition } from "react";
import { saveQkitEarnConfigAction } from "./actions";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
```

with:

```tsx
"use client";

import { useTransition } from "react";
import { saveQkitEarnConfigAction } from "./actions";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { ElevatedCard } from "@/components/elevated-card";
```

- [ ] **Step 2: Reskin the non-Pro upsell block**

Replace:

```tsx
if (!isPro) {
  return (
    <div className="rounded-lg border p-4 text-sm text-muted-foreground">
      Upgrade to Pro to award a stamp automatically when a customer completes a
      qkit order.
    </div>
  );
}
```

with:

```tsx
if (!isPro) {
  return (
    <ElevatedCard className="p-4 text-sm text-muted-foreground">
      Upgrade to Pro to award a stamp automatically when a customer completes a
      qkit order.
    </ElevatedCard>
  );
}
```

- [ ] **Step 3: Reskin the form wrapper and the Save button**

Replace:

```tsx
return (
  <form
    className="space-y-3 rounded-lg border p-4"
    action={(fd) => {
      startTransition(() => {
        void saveQkitEarnConfigAction(fd);
      });
    }}
  >
    <div className="flex items-center gap-2">
      <Switch
        id="qkit-earn-enabled"
        name="enabled"
        defaultChecked={current?.enabled ?? false}
        aria-label="Earn from qkit orders"
      />
      <Label htmlFor="qkit-earn-enabled" className="text-sm">
        Earn from qkit orders
      </Label>
    </div>
    <Select name="program_id" defaultValue={current?.programId || undefined}>
      <SelectTrigger className="w-full">
        <SelectValue placeholder="Choose a program" />
      </SelectTrigger>
      <SelectContent>
        {programs.map((p) => (
          <SelectItem key={p.id} value={p.id}>
            {p.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
    <button type="submit" disabled={pending} className="text-sm font-medium">
      Save
    </button>
  </form>
);
```

with:

```tsx
return (
  // Matches ElevatedCard's classes directly — a <form> needs the action
  // prop, which ElevatedCard's as="div"|"section"|"li" prop type doesn't
  // support (same rationale as activity-filters.tsx).
  <form
    className="space-y-3 rounded-[20px] border bg-card p-4 shadow-[0_1px_0_0_var(--color-border),0_12px_28px_-20px_rgba(0,0,0,0.35)]"
    action={(fd) => {
      startTransition(() => {
        void saveQkitEarnConfigAction(fd);
      });
    }}
  >
    <div className="flex items-center gap-2">
      <Switch
        id="qkit-earn-enabled"
        name="enabled"
        defaultChecked={current?.enabled ?? false}
        aria-label="Earn from qkit orders"
      />
      <Label htmlFor="qkit-earn-enabled" className="text-sm">
        Earn from qkit orders
      </Label>
    </div>
    <Select name="program_id" defaultValue={current?.programId || undefined}>
      <SelectTrigger className="w-full">
        <SelectValue placeholder="Choose a program" />
      </SelectTrigger>
      <SelectContent>
        {programs.map((p) => (
          <SelectItem key={p.id} value={p.id}>
            {p.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
    <Button
      type="submit"
      disabled={pending}
      className="h-10 w-full rounded-xl text-sm font-semibold"
    >
      Save
    </Button>
  </form>
);
```

- [ ] **Step 4: Typecheck and run the full suite**

Run: `pnpm exec tsc --noEmit`
Expected: no errors.

Run: `pnpm test --run`
Expected: all pass (no dedicated test file for this component today).

- [ ] **Step 5: Commit**

```bash
git add src/app/dashboard/qkit-earn-settings.tsx
git commit -m "fix(dashboard): reskin qkit earn settings, fix Save button touch target"
```

---

### Task 8: Reskin admin `Stat` tile

**Files:**

- Modify: `src/app/admin/stat.tsx`

**Interfaces:**

- Consumes: `ElevatedCard`.
- Produces: `Stat`'s rendered markup changes from a plain `div` to `ElevatedCard`'s `div`; Tasks 9 (which renders `<Stat>`) are unaffected since `Stat`'s props/exports don't change.

- [ ] **Step 1: Reskin**

Replace:

```tsx
import { cn } from "@/lib/utils";

/** A back-office figure tile: a small uppercase label over a big value. */
export function Stat({
  label,
  value,
  className,
}: {
  label: string;
  value: string | number;
  className?: string;
}) {
  return (
    <div className={cn("rounded-2xl border bg-card p-4 shadow-sm", className)}>
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-2xl font-bold tabular-nums">{value}</p>
    </div>
  );
}
```

with:

```tsx
import { cn } from "@/lib/utils";
import { ElevatedCard } from "@/components/elevated-card";

/** A back-office figure tile: a small uppercase label over a big value. */
export function Stat({
  label,
  value,
  className,
}: {
  label: string;
  value: string | number;
  className?: string;
}) {
  return (
    <ElevatedCard className={cn("p-4", className)}>
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-2xl font-bold tabular-nums">{value}</p>
    </ElevatedCard>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/admin/stat.tsx
git commit -m "style(admin): reskin Stat tile onto ElevatedCard"
```

---

### Task 9: Reskin `/admin` (overview)

**Files:**

- Modify: `src/app/admin/page.tsx`

**Interfaces:**

- Consumes: `ElevatedCard`, `Stat` (unchanged usage — Task 8 didn't change `Stat`'s props).
- Produces: nothing new for later tasks.

- [ ] **Step 1: Add the import and reskin the recent-activity wrapper**

Add near the top:

```tsx
import { ElevatedCard } from "@/components/elevated-card";
```

Replace:

```tsx
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Recent activity across all shops
        </h2>
        <div className="rounded-2xl border bg-card p-6 shadow-sm">
          <ul className="space-y-2.5">
```

with:

```tsx
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Recent activity across all shops
        </h2>
        <ElevatedCard className="p-6">
          <ul className="space-y-2.5">
```

(matching closing `</div>` before `</section>` becomes `</ElevatedCard>`)

- [ ] **Step 2: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/admin/page.tsx
git commit -m "style(admin): reskin overview page onto ElevatedCard"
```

---

### Task 10: Reskin `/admin/programs`

**Files:**

- Modify: `src/app/admin/programs/page.tsx`

**Interfaces:**

- Consumes: `ElevatedCard`.
- Produces: nothing new for later tasks.

- [ ] **Step 1: Add the import and reskin the table wrapper**

Add near the top:

```tsx
import { ElevatedCard } from "@/components/elevated-card";
```

Replace:

```tsx
        <div className="overflow-x-auto rounded-2xl border bg-card shadow-sm">
          <table className="w-full min-w-[720px] text-sm">
```

with:

```tsx
        <ElevatedCard className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
```

(matching closing `</div>` after `</table>` becomes `</ElevatedCard>`)

The dashed-border empty state (`No programs yet.`) is left unchanged — deliberately distinct from the filled-card pattern.

- [ ] **Step 2: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/admin/programs/page.tsx
git commit -m "style(admin): reskin programs table wrapper onto ElevatedCard"
```

---

### Task 11: Reskin `/admin/vendors`

**Files:**

- Modify: `src/app/admin/vendors/page.tsx`

**Interfaces:**

- Consumes: `ElevatedCard`.
- Produces: nothing new for later tasks.

- [ ] **Step 1: Add the import**

```tsx
import { ElevatedCard } from "@/components/elevated-card";
```

- [ ] **Step 2: Reskin the pending-requests wrapper**

Replace:

```tsx
          <div className="divide-y overflow-hidden rounded-2xl border bg-card shadow-sm">
            {pendingRequests.map((r) => (
```

with:

```tsx
          <ElevatedCard className="divide-y overflow-hidden">
            {pendingRequests.map((r) => (
```

(matching closing `</div>` before `</section>` becomes `</ElevatedCard>`)

- [ ] **Step 3: Reskin the vendors table wrapper**

Replace:

```tsx
        <div className="overflow-x-auto rounded-2xl border bg-card shadow-sm">
          <table className="w-full min-w-[640px] text-sm">
```

with:

```tsx
        <ElevatedCard className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
```

(matching closing `</div>` after `</table>` becomes `</ElevatedCard>`)

The dashed-border empty state (`No vendors yet.`) is left unchanged.

- [ ] **Step 4: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/app/admin/vendors/page.tsx
git commit -m "style(admin): reskin vendors page onto ElevatedCard"
```

---

### Task 12: Reskin `login-form.tsx`

**Files:**

- Modify: `src/features/auth/components/login-form.tsx`
- Test: `src/features/auth/components/login-form.dom.test.tsx` (existing — verifies this task, not modified)

**Interfaces:**

- Consumes: `ElevatedCard`.
- Produces: nothing new for later tasks.

- [ ] **Step 1: Add the import**

```tsx
import { ElevatedCard } from "@/components/elevated-card";
```

- [ ] **Step 2: Reskin the sent-state card**

Replace:

```tsx
        <div className="rounded-2xl border bg-card px-7 py-10 shadow-sm">
          <Wordmark className="text-2xl" />
```

with:

```tsx
        <ElevatedCard className="px-7 py-10">
          <Wordmark className="text-2xl" />
```

(matching closing `</div>` becomes `</ElevatedCard>`)

- [ ] **Step 3: Reskin the main form card**

Replace:

```tsx
        <div className="rounded-2xl border bg-card shadow-sm">
          <div className="px-7 pt-9 pb-8">
```

with:

```tsx
        <ElevatedCard>
          <div className="px-7 pt-9 pb-8">
```

(matching closing `</div>` — the outermost one, after the `<p>` footer — becomes `</ElevatedCard>`)

- [ ] **Step 4: Run the existing test suite for this file**

Run: `pnpm test --run src/features/auth/components/login-form.dom.test.tsx`
Expected: 15 passed (all assertions are role/text-based, unaffected by the wrapper swap).

- [ ] **Step 5: Commit**

```bash
git add src/features/auth/components/login-form.tsx
git commit -m "style(auth): reskin login form onto ElevatedCard"
```

---

### Task 13: Reskin `reset-password-form.tsx`

**Files:**

- Modify: `src/features/auth/components/reset-password-form.tsx`
- Test: `src/features/auth/components/reset-password-form.dom.test.tsx` (existing — verifies this task, not modified)

**Interfaces:**

- Consumes: `ElevatedCard`.
- Produces: nothing new for later tasks.

- [ ] **Step 1: Add the import and reskin the card**

Add near the top:

```tsx
import { ElevatedCard } from "@/components/elevated-card";
```

Replace:

```tsx
        <div className="rounded-2xl border bg-card px-7 py-9 shadow-sm">
          <h1 className="text-3xl font-bold tracking-tight">
```

with:

```tsx
        <ElevatedCard className="px-7 py-9">
          <h1 className="text-3xl font-bold tracking-tight">
```

(matching closing `</div>` becomes `</ElevatedCard>`)

- [ ] **Step 2: Run the existing test**

Run: `pnpm test --run src/features/auth/components/reset-password-form.dom.test.tsx`
Expected: 4 passed.

- [ ] **Step 3: Commit**

```bash
git add src/features/auth/components/reset-password-form.tsx
git commit -m "style(auth): reskin reset-password form onto ElevatedCard"
```

---

### Task 14: Rebuild `/earn`'s form onto shadcn components

**Files:**

- Modify: `src/app/earn/earn-form.tsx`
- Create: `src/app/earn/earn-form.dom.test.tsx`

**Interfaces:**

- Consumes: `ElevatedCard`, shadcn `Button`/`Input`/`Label`, `claimEarnAction`/`EarnState` from `./actions` (unchanged — this task is presentation-only, no action/validation change).
- Produces: nothing new for later tasks — this is the last task.

This is the one real functional gap in the sweep: unlike every other form in the app (`CheckForm`, `LoginForm`, `ResetPasswordForm`), `earn-form.tsx` hand-rolls raw `<input>`/`<button>` with no `h-11` touch-target sizing, no focus ring, and `text-red-600` instead of the `text-destructive` token. This task rebuilds it to match `CheckForm`'s established pattern (`src/features/card-check/components/check-form.tsx`) exactly, and adds this component's first test file, mirroring `check-form.dom.test.tsx`'s structure.

- [ ] **Step 1: Write the failing test**

Create `src/app/earn/earn-form.dom.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { claimEarnActionMock } = vi.hoisted(() => ({
  claimEarnActionMock: vi.fn(),
}));

vi.mock("./actions", () => ({
  claimEarnAction: claimEarnActionMock,
}));

import { EarnForm } from "./earn-form";

describe("EarnForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the phone/name inputs and submit button with the order id in a hidden field", () => {
    const { container } = render(<EarnForm orderId="o1" />);
    expect(screen.getByLabelText("Your phone number")).toBeInTheDocument();
    expect(screen.getByLabelText("Name (optional)")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Claim stamp" }),
    ).toBeInTheDocument();
    const hidden = container.querySelector('input[name="order"]');
    expect(hidden).toHaveValue("o1");
  });

  it("shows the vendor name when provided", () => {
    render(<EarnForm orderId="o1" vendorName="Kaya Toast Co." />);
    expect(
      screen.getByText("Earn a stamp with Kaya Toast Co.?"),
    ).toBeInTheDocument();
  });

  it("falls back to 'this shop' when no vendor name is given", () => {
    render(<EarnForm orderId="o1" />);
    expect(
      screen.getByText("Earn a stamp with this shop?"),
    ).toBeInTheDocument();
  });

  it("submits phone/name/order, then renders the stamp count on success", async () => {
    claimEarnActionMock.mockResolvedValue({
      status: "success",
      stampCount: 4,
      stampsRequired: 10,
      rewardText: "Free kopi",
    });
    const user = userEvent.setup();
    render(<EarnForm orderId="o1" />);
    await user.type(screen.getByLabelText("Your phone number"), "91234567");
    await user.click(screen.getByRole("button", { name: "Claim stamp" }));

    expect(await screen.findByText("4/10 stamps")).toBeInTheDocument();
    expect(screen.getByText("Free kopi")).toBeInTheDocument();
    expect(claimEarnActionMock).toHaveBeenCalledWith(
      { status: "idle" },
      expect.any(FormData),
    );
  });

  it("shows a role=alert message when the action returns an error", async () => {
    claimEarnActionMock.mockResolvedValue({
      status: "error",
      message: "Enter a valid Singapore phone number.",
    });
    const user = userEvent.setup();
    render(<EarnForm orderId="o1" />);
    await user.type(screen.getByLabelText("Your phone number"), "123");
    await user.click(screen.getByRole("button", { name: "Claim stamp" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Enter a valid Singapore phone number.",
    );
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test --run src/app/earn/earn-form.dom.test.tsx`
Expected: FAIL — `getByLabelText("Your phone number")` finds nothing, since the current component has no `Label`, only a bare `placeholder`.

- [ ] **Step 3: Rebuild the component**

Replace the full contents of `src/app/earn/earn-form.tsx`:

```tsx
"use client";

import { useActionState } from "react";
import { claimEarnAction, type EarnState } from "./actions";
import { ElevatedCard } from "@/components/elevated-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: EarnState = { status: "idle" };

export function EarnForm({
  orderId,
  vendorName,
}: {
  orderId: string;
  vendorName?: string;
}) {
  const [state, formAction, pending] = useActionState(
    claimEarnAction,
    initialState,
  );

  if (state.status === "success") {
    return (
      <ElevatedCard className="p-6 text-center">
        <p className="text-lg font-semibold">
          {state.stampCount}/{state.stampsRequired} stamps
        </p>
        {state.rewardText && (
          <p className="mt-1 text-sm text-muted-foreground">
            {state.rewardText}
          </p>
        )}
      </ElevatedCard>
    );
  }

  return (
    <ElevatedCard className="p-6">
      <form action={formAction} className="space-y-4">
        <input type="hidden" name="order" value={orderId} />
        <p className="text-sm">
          Earn a stamp with {vendorName ?? "this shop"}?
        </p>
        <div className="space-y-2">
          <Label
            htmlFor="earn-phone"
            className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
          >
            Your phone number
          </Label>
          <Input
            id="earn-phone"
            name="phone"
            type="tel"
            required
            placeholder="9123 4567"
            className="h-11 rounded-xl"
          />
        </div>
        <div className="space-y-2">
          <Label
            htmlFor="earn-name"
            className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
          >
            Name (optional)
          </Label>
          <Input
            id="earn-name"
            name="name"
            placeholder="Your name"
            className="h-11 rounded-xl"
          />
        </div>
        {state.status === "error" && (
          <p role="alert" className="text-sm text-destructive">
            {state.message}
          </p>
        )}
        <Button
          type="submit"
          disabled={pending}
          className="h-11 w-full rounded-xl text-base font-semibold"
        >
          {pending ? "Claiming…" : "Claim stamp"}
        </Button>
      </form>
    </ElevatedCard>
  );
}
```

`src/app/earn/page.tsx` needs no change — it already wraps `<EarnForm>` in `<main className="mx-auto max-w-sm p-6">`, and `EarnForm` now supplies its own `ElevatedCard`, matching `/c`'s card-in-centered-column layout.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test --run src/app/earn/earn-form.dom.test.tsx`
Expected: 5 passed.

- [ ] **Step 5: Typecheck and run the full suite**

Run: `pnpm exec tsc --noEmit`
Expected: no errors.

Run: `pnpm test --run`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/app/earn/earn-form.tsx src/app/earn/earn-form.dom.test.tsx
git commit -m "fix(earn): rebuild form onto shadcn components, add test coverage"
```

---

## Final Verification

- [ ] **Run the full quality gate**

Run: `pnpm check && pnpm test --run`
Expected: prettier/eslint/tsc clean, full suite green.

- [ ] **Manual check on a preview deploy** (per this repo's established pattern — no local Supabase credentials in this environment, so visual confirmation happens on the Vercel preview, same caveat noted in PR #16): open each touched page at a phone width (~375px) and a tablet width (~768px) — dashboard `stats`/`customers`/`plan`/`settings`/`activity`, admin `overview`/`programs`/`vendors`, `login`, `reset-password`, and `/earn?order=<a-real-order-id>` — confirm cards render with the lifted-shadow look consistently and the activity filters stack cleanly on the narrow width.
