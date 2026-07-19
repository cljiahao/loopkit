# `/setup` Create/Manage Split Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split `/setup`'s cluttered "management list + active form" page into two distinct views — a clean create/upsell default and a separate `?manage=1` management view — per `docs/superpowers/specs/2026-07-19-setup-create-manage-split-design.md`, fixing a real precedence bug along the way (Pro vendors' `canCreate` being unconditionally true made the `schedule` query param unreachable).

**Architecture:** Extract the "which single view wins" decision into a new pure module (`src/app/setup/setup-view.ts`), mirroring this codebase's existing `dashboard-view.ts` precedent, so the precedence logic gets fast unit coverage without rendering the whole async server component. `page.tsx` then uses that module's `view` result only to decide which JSX block renders (fixing the precedence bug); the existing title/subtitle text ternaries keep using the original boolean variables (for correct TypeScript narrowing) with one new `managing` case inserted at the right slot.

**Tech Stack:** Next.js 16 App Router (async Server Component) · TypeScript strict · Tailwind v4 · Vitest · pnpm.

## Global Constraints

- TypeScript strict — no `any`, no `@ts-ignore`.
- `SetupForm`, `ScheduleRetirementForm`, `activateProgramAction` — no prop or behavior changes.
- Every per-row link's `href` in the management list (Edit/Change type/Prep replacement/Activate/Schedule retirement/Manage) stays byte-identical to today — same targets, same gating conditions.
- `src/app/dashboard/new-program-tile.tsx` needs **no changes** — it links bare `/setup`, which must keep resolving to the create form (or upsell) exactly as it does today.
- The precedence fix (explicit query-param intents — migrate/edit/prep/schedule/manage — always win over the ambient `canCreate` default) is in scope for this task, not a separate one, since it's the same ternary being rewritten.
- Run `pnpm check && pnpm test` after every task; commit after every task.
- Work happens in a git worktree on a feature branch — `main` hard-blocks direct commits via the lefthook + PreToolUse hooks.

---

## Task 1: `setup-view.ts` — the view-precedence pure function

**Files:**

- Create: `src/app/setup/setup-view.ts`
- Create: `src/app/setup/setup-view.test.ts`

**Interfaces:**

- Produces: `type SetupView = "migrate" | "edit" | "prep" | "schedule" | "manage" | "create" | "upsell"` and `function resolveSetupView(input: { migrating: boolean; isEdit: boolean; prepping: boolean; scheduling: boolean; managing: boolean; canCreate: boolean }): SetupView` — consumed by Task 2 (`page.tsx`).

- [ ] **Step 1: Write the failing tests**

```typescript
// src/app/setup/setup-view.test.ts
import { describe, it, expect } from "vitest";
import { resolveSetupView } from "./setup-view";

const base = {
  migrating: false,
  isEdit: false,
  prepping: false,
  scheduling: false,
  managing: false,
  canCreate: false,
};

describe("resolveSetupView", () => {
  it("returns 'migrate' when migrating, regardless of everything else", () => {
    expect(
      resolveSetupView({ ...base, migrating: true, canCreate: true }),
    ).toBe("migrate");
  });

  it("returns 'edit' when isEdit, regardless of canCreate", () => {
    expect(resolveSetupView({ ...base, isEdit: true, canCreate: true })).toBe(
      "edit",
    );
  });

  it("returns 'prep' when prepping, regardless of canCreate", () => {
    expect(resolveSetupView({ ...base, prepping: true, canCreate: true })).toBe(
      "prep",
    );
  });

  it("returns 'schedule' when scheduling, regardless of canCreate — regression guard for the Pro-vendor bug where canCreate (always true for Pro) made schedule unreachable", () => {
    expect(
      resolveSetupView({ ...base, scheduling: true, canCreate: true }),
    ).toBe("schedule");
  });

  it("returns 'manage' when managing and nothing else is set", () => {
    expect(resolveSetupView({ ...base, managing: true })).toBe("manage");
  });

  it("returns 'create' when nothing is set and canCreate is true", () => {
    expect(resolveSetupView({ ...base, canCreate: true })).toBe("create");
  });

  it("returns 'upsell' when nothing is set and canCreate is false", () => {
    expect(resolveSetupView({ ...base })).toBe("upsell");
  });

  it("prioritizes migrate over edit when both are somehow set", () => {
    expect(resolveSetupView({ ...base, migrating: true, isEdit: true })).toBe(
      "migrate",
    );
  });

  it("prioritizes prep over schedule when both are somehow set", () => {
    expect(
      resolveSetupView({ ...base, prepping: true, scheduling: true }),
    ).toBe("prep");
  });
});
```

- [ ] **Step 2: Run the tests, confirm they fail**

Run: `pnpm exec vitest run src/app/setup/setup-view.test.ts`
Expected: FAIL — `Cannot find module './setup-view'` (the file doesn't exist yet).

- [ ] **Step 3: Write `src/app/setup/setup-view.ts`**

```typescript
// src/app/setup/setup-view.ts
// Pure precedence logic for /setup's view routing. Extracted so this gets
// fast, unmocked test coverage without rendering the whole async server
// component (Supabase/auth/merqo dependencies) — same pattern as
// src/app/dashboard/dashboard-view.ts's shouldShowQr.

export type SetupView =
  "migrate" | "edit" | "prep" | "schedule" | "manage" | "create" | "upsell";

// Which single view /setup renders, given every explicit query-param
// intent and the ambient canCreate permission. Explicit intents (an actual
// query param was set — migrate/edit/prep/schedule/manage) always win over
// the ambient default (canCreate deciding between "create" and "upsell").
// This fixes a real bug: canCreate is unconditionally true for Pro vendors
// (unlimited programs), so a previous combined
// `isEdit || migrating || canCreate` check made the `schedule` query
// param unreachable for any Pro vendor — canCreate always won first.
export function resolveSetupView({
  migrating,
  isEdit,
  prepping,
  scheduling,
  managing,
  canCreate,
}: {
  migrating: boolean;
  isEdit: boolean;
  prepping: boolean;
  scheduling: boolean;
  managing: boolean;
  canCreate: boolean;
}): SetupView {
  if (migrating) return "migrate";
  if (isEdit) return "edit";
  if (prepping) return "prep";
  if (scheduling) return "schedule";
  if (managing) return "manage";
  return canCreate ? "create" : "upsell";
}
```

- [ ] **Step 4: Run the tests, confirm all 9 pass**

Run: `pnpm exec vitest run src/app/setup/setup-view.test.ts`
Expected: 9 passed (0 failed)

- [ ] **Step 5: Full gate + commit**

Run: `pnpm check && pnpm test`
Expected: PASS

```bash
git add src/app/setup/setup-view.ts src/app/setup/setup-view.test.ts
git commit -m "feat(setup): add resolveSetupView, fixing the Pro-vendor schedule-unreachable bug"
```

---

## Task 2: `page.tsx` — split the views, wire up the new links

**Files:**

- Modify: `src/app/setup/page.tsx` (full file, 316 lines today)

**Interfaces:**

- Consumes: `SetupView`, `resolveSetupView` from `./setup-view` (Task 1).
- Produces: nothing new consumed elsewhere — `SetupPage`'s default export shape is unchanged (still a route page component). `src/app/dashboard/new-program-tile.tsx` (the only external link into this page besides the page's own internal links) needs no changes.

- [ ] **Step 1: Rewrite `src/app/setup/page.tsx`**

```typescript
import Link from "next/link";
import { requireVendor } from "@/features/auth";
import {
  listPrograms,
  currentProgram,
  isPro,
  canCreateProgram,
  canPrepProgram,
  getEntitlement,
  applyDueCutovers,
} from "@/lib/program";
import { SetupForm } from "@/app/setup/setup-form";
import { ScheduleRetirementForm } from "@/app/setup/schedule-retirement-form";
import { activateProgramAction } from "@/app/setup/actions";
import { resolveSetupView } from "@/app/setup/setup-view";
import { Wordmark } from "@/components/landing/wordmark";
import { ProLock } from "@/components/pro-lock";
import { BackButton } from "@/components/back-button";
import { cn } from "@/lib/utils";
import { createServerClient } from "@/lib/supabase/server";
import {
  getOrCreateVendorProfile,
  type VendorProfile,
} from "@/lib/merqo-vendor-profile";
import { getVendorProfile } from "@/lib/vendor";

const typeLabel: Record<string, string> = {
  stamp: "Stamp card",
  lucky: "Lucky Tap",
  plant: "Sprout",
  wheel: "Spin the Wheel",
  scratch: "Scratch Card",
};

export default async function SetupPage({
  searchParams,
}: {
  searchParams: Promise<{
    edit?: string;
    migrate?: string;
    prep?: string;
    schedule?: string;
    manage?: string;
  }>;
}) {
  const { user } = await requireVendor();
  await applyDueCutovers();
  const supabase = await createServerClient();
  // Prefer the vendor's existing loopkit.vendors name (set via
  // /dashboard/profile) as the seed for the shared merqo.vendor_profile row
  // — falling back to email only if they've never set one — so a vendor who
  // already has a real stall name doesn't get overwritten with their raw
  // email on first /setup visit after this table's introduction.
  const localProfile = await getVendorProfile();
  // The merqo.vendor_profile row is a one-time seed, not a live mirror —
  // nothing re-syncs stall_name after the first /setup visit, so
  // loopkit.vendors (localProfile, edited at /dashboard/profile) stays the
  // live source of truth for display; vendorProfile is only a fallback (and
  // the seed input above). It's also cross-schema and can fail independently
  // of the rest of this page — degrade to null rather than hard-failing the
  // whole vendor console on a merqo hiccup.
  let vendorProfile: VendorProfile | null = null;
  try {
    vendorProfile = await getOrCreateVendorProfile(
      supabase,
      user.id,
      localProfile.name ?? user.email ?? null,
    );
  } catch (err) {
    console.error(
      "setup: shared vendor profile read/create failed",
      err instanceof Error ? err.message : err,
    );
  }
  const { edit, migrate, schedule, prep, manage } = await searchParams;
  const programs = await listPrograms();
  const editing = edit ? currentProgram(programs, edit) : null;
  const isEdit = editing !== null;
  // Deliberately not currentProgram()'s fallback-to-first-program
  // semantics: an invalid/unowned migrate id must resolve to nothing, not
  // silently let a vendor migrate the wrong program.
  const migrating = migrate
    ? (programs.find((p) => p.id === migrate) ?? null)
    : null;
  const prepping = prep ? (programs.find((p) => p.id === prep) ?? null) : null;
  const scheduling = schedule
    ? (programs.find((p) => p.id === schedule) ?? null)
    : null;
  const managing = manage === "1";
  const pro = await isPro();
  const canCreate = canCreateProgram(
    getEntitlement(pro),
    programs.filter((p) => p.active).length,
  );
  const canPrep = canPrepProgram(
    getEntitlement(pro),
    programs.filter((p) => p.replaced_by === null).length,
  );
  const activePrograms = programs.filter((p) => p.active);
  const firstRun = programs.length === 0;

  const view = resolveSetupView({
    migrating: migrating !== null,
    isEdit,
    prepping: prepping !== null,
    scheduling: scheduling !== null,
    managing,
    canCreate,
  });

  // Thin inline server action: a plain <form action> can only pass the
  // form's formData through a single-argument function, but
  // activateProgramAction (Task 3) shares the two-argument
  // (prevState, formData) shape used by every other action in this file so
  // it plugs into useActionState identically to its siblings. This shim
  // bridges the two, matching the existing signOut-in-a-Server-Component
  // pattern (src/app/admin/layout.tsx).
  async function activate(formData: FormData) {
    "use server";
    await activateProgramAction({}, formData);
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center p-5 md:max-w-4xl">
      <div className="w-full">
        <div className="mb-4">
          <BackButton href="/dashboard" label="Back to dashboard" />
        </div>
        <div className="mb-8 text-center">
          <Wordmark className="text-3xl" />
          <p className="mt-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {localProfile.name ?? vendorProfile?.stall_name}
          </p>
          <h1 className="mt-3 font-display text-2xl font-bold tracking-tight">
            {migrating
              ? `Change ${migrating.name}'s type`
              : prepping
                ? `Set up ${prepping.name}'s replacement`
                : scheduling
                  ? `Schedule ${scheduling.name}'s retirement`
                  : isEdit
                    ? "Edit your card"
                    : managing
                      ? "Your loyalty programs"
                      : firstRun
                        ? "Set up your loyalty card"
                        : "Create a program"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {migrating
              ? "Your current card stops collecting new stamps. Customers who already have it keep it and can still redeem what they've earned — they just won't see it as something to keep working toward. Everyone gets moved onto the new card automatically next time they check their rewards."
              : prepping
                ? "Set up the card that replaces it. It stays hidden from customers until you activate it."
                : scheduling
                  ? "Pick the date it retires and which card takes over."
                  : isEdit
                    ? "Update your loyalty card details."
                    : managing
                      ? "Manage your loyalty programs."
                      : firstRun
                        ? "Set up your loyalty card in a minute."
                        : "Pick a card type and set how customers earn their reward."}
          </p>
        </div>

        {(view === "create" || view === "upsell") && programs.length > 0 ? (
          <div className="mb-6 text-center">
            <Link
              href="/setup?manage=1"
              className="text-sm font-medium text-primary hover:underline"
            >
              Manage your programs
            </Link>
          </div>
        ) : null}

        {view === "manage" ? (
          <div className="rounded-2xl border bg-card shadow-sm">
            <div className="px-7 py-6">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                  Your programs
                </h2>
                <Link
                  href="/setup"
                  className="text-sm font-medium text-primary hover:underline"
                >
                  + New program
                </Link>
              </div>
              <ul className="mt-4 divide-y">
                {programs.map((program) => (
                  <li
                    key={program.id}
                    className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="truncate font-medium">{program.name}</p>
                        <span
                          className={cn(
                            "shrink-0 rounded-full px-1.5 py-0.5 text-[0.6rem] font-semibold uppercase tracking-wider ring-1 ring-inset",
                            program.active
                              ? "bg-emerald-500/15 text-emerald-700 ring-emerald-500/30 dark:bg-emerald-400/15 dark:text-emerald-400 dark:ring-emerald-400/30"
                              : "bg-secondary text-muted-foreground ring-border",
                          )}
                        >
                          {program.active ? "Active" : "Inactive"}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {typeLabel[program.type] ?? program.type}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 text-sm font-medium">
                      <Link
                        href={`/setup?edit=${program.id}`}
                        className="text-muted-foreground hover:text-foreground"
                      >
                        Edit
                      </Link>
                      {program.active && (
                        <Link
                          href={`/setup?migrate=${program.id}`}
                          className="text-muted-foreground hover:text-foreground"
                        >
                          Change type
                        </Link>
                      )}
                      {program.active && !pro && canPrep && (
                        <Link
                          href={`/setup?prep=${program.id}`}
                          className="text-muted-foreground hover:text-foreground"
                        >
                          Prep replacement
                        </Link>
                      )}
                      {!program.active && program.replaced_by === null && (
                        <form action={activate}>
                          <input type="hidden" name="id" value={program.id} />
                          <button
                            type="submit"
                            className="text-muted-foreground hover:text-foreground"
                          >
                            Activate
                          </button>
                        </form>
                      )}
                      {program.active && pro && activePrograms.length > 1 && (
                        <Link
                          href={`/setup?schedule=${program.id}`}
                          className="text-muted-foreground hover:text-foreground"
                        >
                          Schedule retirement
                        </Link>
                      )}
                      <Link
                        href={`/dashboard?p=${program.id}`}
                        className="text-primary hover:underline"
                      >
                        Manage
                      </Link>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ) : view === "migrate" || view === "edit" || view === "create" ? (
          <div className="rounded-2xl border bg-card shadow-sm">
            <div className="px-7 pt-9 pb-8">
              <h2 className="text-3xl font-bold tracking-tight">
                {migrating
                  ? "Pick a new card type"
                  : isEdit
                    ? "Edit your card"
                    : "Create a program"}
              </h2>
              <p className="mt-1.5 text-sm text-muted-foreground">
                {migrating
                  ? "Set up the card that replaces it."
                  : isEdit
                    ? "Change how customers earn their reward."
                    : "Pick a card type and set how customers earn their reward."}
              </p>

              <SetupForm
                program={migrating ? null : editing}
                isEdit={isEdit}
                replacingId={migrating ? migrating.id : null}
                replacingType={migrating ? migrating.type : null}
              />
            </div>
          </div>
        ) : view === "prep" ? (
          <div className="rounded-2xl border bg-card shadow-sm">
            <div className="px-7 pt-9 pb-8">
              <h2 className="text-3xl font-bold tracking-tight">
                Set up the replacement
              </h2>
              <p className="mt-1.5 text-sm text-muted-foreground">
                Pick a card type and set how customers earn their reward. It
                stays hidden until you activate it.
              </p>
              <SetupForm
                program={null}
                isEdit={false}
                replacingId={null}
                replacingType={null}
                prepping
              />
            </div>
          </div>
        ) : view === "schedule" ? (
          <div className="rounded-2xl border bg-card shadow-sm">
            <div className="px-7 pt-9 pb-8">
              <h2 className="text-3xl font-bold tracking-tight">
                Schedule retirement
              </h2>
              <p className="mt-1.5 text-sm text-muted-foreground">
                {scheduling!.name} keeps running until the date you pick, then
                it hands over automatically.
              </p>
              <ScheduleRetirementForm
                program={scheduling!}
                successors={activePrograms.filter(
                  (p) => p.id !== scheduling!.id,
                )}
              />
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border bg-card shadow-sm">
            <div className="px-7 py-8">
              <h2 className="text-xl font-bold tracking-tight">
                Free plan: 1 program
              </h2>
              <p className="mt-1.5 text-sm text-muted-foreground">
                You&apos;re on the free plan, which includes one loyalty
                program.
              </p>
              <ProLock label="Upgrade to Pro" className="mt-4" />
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
```

Note the `scheduling!` non-null assertions in the `view === "schedule"` branch: TypeScript can't narrow `scheduling` from `view === "schedule"` alone (they're separate variables), but `view === "schedule"` is only reachable when `resolveSetupView` was called with `scheduling: true`, which this file only ever sets from `scheduling !== null` — so `scheduling` is guaranteed non-null whenever this branch runs. This mirrors the plan's Task 1 module boundary: the pure function only sees booleans, so the object narrowing has to happen back here.

- [ ] **Step 2: Typecheck and lint**

Run: `pnpm exec tsc --noEmit && pnpm exec eslint src/app/setup/page.tsx`
Expected: PASS, no errors

- [ ] **Step 3: Full gate + commit**

Run: `pnpm check && pnpm test`
Expected: PASS

```bash
git add src/app/setup/page.tsx
git commit -m "feat(setup): split the create and manage views behind resolveSetupView"
```

---

## Task 3: Manual verification + README fallout

**Files:**

- Modify: `src/app/setup/README.md` (per-folder README convention — `page.tsx`'s description and the new `setup-view.ts`/`setup-view.test.ts` files need entries; verify against the CI `readme-freshness` gate)

**Interfaces:** none — this task only verifies and documents; no code changes expected unless verification surfaces a bug.

- [ ] **Step 1: Read `src/app/setup/README.md` and update it**

Add bullets for the two new files (`setup-view.ts`, `setup-view.test.ts`) and update `page.tsx`'s existing bullet to describe the new `manage=1` view split and the `resolveSetupView` precedence fix, matching this repo's per-file one-line-description convention (see other bullets in the same file for style).

- [ ] **Step 2: Re-run `pnpm check` to confirm formatting**

Run: `pnpm check`
Expected: PASS

- [ ] **Step 3: Start the dev server**

Run: `pnpm dev`
Expected: server up at http://localhost:3000

- [ ] **Step 4: Manually verify in the browser**

With a vendor account that has at least one existing program:

- Visit `/setup` directly (or click the dashboard's "New program" tile) — confirm **only** the create form shows, no "Your programs" list.
- Click the new "Manage your programs" link — confirm it navigates to `/setup?manage=1` and shows **only** the list (no create form, no upsell card).
- From the manage view, click "+ New program" — confirm it goes back to the clean create form at bare `/setup`.
- From the manage view, click "Edit" on a program — confirm it shows **only** the edit form (no list).
- If the test vendor is Pro with 2+ active programs, click "Schedule retirement" on one — confirm it now actually shows the schedule form (this is the bug fix — previously this silently showed the create form instead).
- If the test vendor is free-tier at their 1-active-program cap, visit bare `/setup` — confirm the upsell card shows, **and** confirm the new "Manage your programs" link is still visible above it (this is the case Step 1's fix in Task 2 specifically added — the link must show for `view === "upsell"` too, not just `view === "create"`).

- [ ] **Step 5: Stop the dev server, run the full suite one final time**

Run: `pnpm check && pnpm test`
Expected: PASS

- [ ] **Step 6: Commit README fallout**

```bash
git add src/app/setup/README.md
git commit -m "docs(setup): document the create/manage split and resolveSetupView"
```
