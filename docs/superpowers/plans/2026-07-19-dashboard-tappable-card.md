# Dashboard Tappable Program Card Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the whole dashboard `ProgramCard` tappable to open its counter page, replacing the separate "Open Counter" button and its confusing wording, per `docs/superpowers/specs/2026-07-19-dashboard-tappable-card-design.md`.

**Architecture:** Single self-contained component change. `ProgramCard` (`src/app/dashboard/program-card.tsx`) gets a "stretched link" — a transparent `absolute inset-0` `<Link>` covering the whole card — instead of a `<Button>` row, plus a decorative chevron. The existing pencil-edit `<Link>` gets `relative z-10` so it stays independently clickable without nesting `<a>` inside `<a>`. No props, no call-site, no other-file changes — `ProgramCard` is only rendered from `src/app/dashboard/page.tsx` and needs no changes there.

**Tech Stack:** Next.js 16 App Router · TypeScript strict · Tailwind v4 · `lucide-react` icons · Vitest + `@testing-library/react`.

## Global Constraints

- TypeScript strict — no `any`, no `@ts-ignore`.
- Nesting an `<a>` inside another `<a>` is invalid HTML — the stretched-link `<Link>` and the pencil-edit `<Link>` must be siblings (or otherwise non-nested), never one wrapping the other.
- The stretched link needs an `aria-label` (`Open counter for ${program.name}`) since its own visible content is empty — matching this file's existing per-program `aria-label` convention (the pencil link already does `Edit ${program.name}`).
- Out of scope: the Counter page itself (`src/app/dashboard/counter/page.tsx`), `serve-customer.tsx`, and the `/setup` create-vs-manage split / program-type consolidation (separate specs).
- Run `pnpm check && pnpm test` after the task; commit after the task.
- Work happens in a git worktree on a feature branch — `main` hard-blocks direct commits via the lefthook + PreToolUse hooks.

---

## Task 1: Stretched-link `ProgramCard` + chevron affordance

**Files:**

- Modify: `src/app/dashboard/program-card.tsx` (full file, 45 lines today)
- Modify: `src/app/dashboard/program-card.dom.test.tsx` (replace 1 test, add 1 test, keep 4 unchanged)

**Interfaces:**

- Consumes: nothing new — same `{ program: Program }` prop as today.
- Produces: nothing new consumed elsewhere — `ProgramCard`'s exported signature is unchanged, only its internal rendering. No other file imports change; `src/app/dashboard/page.tsx` (the only caller) needs no edits.

- [ ] **Step 1: Write the changed and new tests**

Read `src/app/dashboard/program-card.dom.test.tsx` first (5 existing tests). Replace the `"links Open Counter to /dashboard/counter?p=<id>"` test and add one new test, so the file's `describe("ProgramCard", ...)` block ends up with these 6 tests total:

```typescript
// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import type { Program } from "@/lib/program";
import { ProgramCard } from "./program-card";

const program: Program = {
  id: "p1",
  name: "Coffee Stamps",
  stamps_required: 8,
  reward_text: "a free coffee",
  type: "stamp",
  config: {},
  active: true,
  expiry_days: null,
  head_start: false,
  head_start_percent: 20,
  replaced_by: null,
  carry_over_stamps: false,
};

describe("ProgramCard", () => {
  it("renders the program name, type badge, and description", () => {
    render(<ProgramCard program={program} />);
    expect(screen.getByText("Coffee Stamps")).toBeInTheDocument();
    expect(screen.getByText("Stamp")).toBeInTheDocument();
    expect(screen.getByText(/buy 8, get 1 a free coffee/i)).toBeInTheDocument();
  });

  it("renders the expiry and head-start detail lines", () => {
    const withDetails: Program = {
      ...program,
      expiry_days: 30,
      head_start: true,
    };
    render(<ProgramCard program={withDetails} />);
    expect(screen.getByText("Resets after 30 days")).toBeInTheDocument();
    expect(
      screen.getByText("New customers get a head start"),
    ).toBeInTheDocument();
  });

  it("shows 'Never expires' when there is no expiry", () => {
    render(<ProgramCard program={program} />);
    expect(screen.getByText("Never expires")).toBeInTheDocument();
  });

  it("links Edit to /setup?edit=<id>", () => {
    render(<ProgramCard program={program} />);
    expect(
      screen.getByRole("link", { name: /edit coffee stamps/i }),
    ).toHaveAttribute("href", "/setup?edit=p1");
  });

  it("links the whole card to /dashboard/counter?p=<id>", () => {
    render(<ProgramCard program={program} />);
    expect(
      screen.getByRole("link", { name: /open counter for coffee stamps/i }),
    ).toHaveAttribute("href", "/dashboard/counter?p=p1");
  });

  it("renders exactly 2 links, neither nested inside the other", () => {
    const { container } = render(<ProgramCard program={program} />);
    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(2);
    for (const link of links) {
      expect(link.parentElement?.closest("a")).toBeNull();
    }
    // Sanity: both links are direct descendants of the card root, not of
    // each other — the root itself is the outermost element rendered.
    const root = container.firstElementChild;
    expect(links.every((l) => root?.contains(l))).toBe(true);
  });

  it("does not render Customers, Activity, or Stats links", () => {
    render(<ProgramCard program={program} />);
    expect(
      screen.queryByRole("link", { name: "Customers" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Activity" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Stats" }),
    ).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the tests, confirm the changed/new ones fail**

Run: `pnpm exec vitest run src/app/dashboard/program-card.dom.test.tsx`
Expected: 4 pass (name/badge/description, expiry/head-start, "Never expires", Edit link), 2 fail — no link with accessible name matching `/open counter for coffee stamps/i` exists yet (today's button says just "Open Counter", not "Open counter for Coffee Stamps"), and today's card only has 2 links already so the "exactly 2, non-nested" test may actually pass by coincidence — if it does, that's fine, it becomes a regression guard for the next step rather than a currently-failing assertion; the fix in Step 3 changes what those 2 links are, not how many.

- [ ] **Step 3: Rewrite `src/app/dashboard/program-card.tsx`**

```typescript
"use client";

import Link from "next/link";
import { ChevronRight, Pencil } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  PROGRAM_TYPE_BADGE,
  describeProgram,
  programDetails,
} from "./program-display";
import type { Program } from "@/lib/program";

// One card per active program. The whole card is a stretched link to its
// counter page — the pencil icon is a separate, independently-clickable
// link layered above it via z-index, not nested inside it (nesting <a>
// inside <a> is invalid HTML). Serve/lookup lives on the dedicated Counter
// page (app/dashboard/counter/page.tsx), not embedded here.
// Customers/Activity/Stats for this program are reached via each of those
// pages' own merged-view program picker instead of a per-card link.
export function ProgramCard({ program }: { program: Program }) {
  const badge = PROGRAM_TYPE_BADGE[program.type] ?? PROGRAM_TYPE_BADGE.stamp;
  const scoped = (href: string) => `${href}?p=${program.id}`;

  return (
    <div className="relative flex flex-col gap-4 rounded-2xl border bg-card p-5 shadow-sm">
      <Link
        href={scoped("/dashboard/counter")}
        aria-label={`Open counter for ${program.name}`}
        className="absolute inset-0 rounded-2xl outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
      />

      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="truncate text-base font-bold tracking-tight">
              {program.name}
            </h2>
            <Badge variant={badge.variant}>{badge.label}</Badge>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {describeProgram(program)}
          </p>
          <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
            {programDetails(program).map((detail) => (
              <li key={detail}>{detail}</li>
            ))}
          </ul>
        </div>
        <Link
          href={`/setup?edit=${program.id}`}
          aria-label={`Edit ${program.name}`}
          className="relative z-10 shrink-0 rounded-lg p-1.5 text-muted-foreground outline-none transition-colors hover:bg-secondary hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          <Pencil className="size-4" />
        </Link>
      </div>

      <ChevronRight
        aria-hidden="true"
        className="absolute bottom-4 right-4 size-4 text-muted-foreground"
      />
    </div>
  );
}
```

Note: this removes the `Button` import (from `@/components/ui/button`) entirely — it's no longer used anywhere in this file.

- [ ] **Step 4: Run the test file, confirm all 7 pass**

Run: `pnpm exec vitest run src/app/dashboard/program-card.dom.test.tsx`
Expected: 7 passed (0 failed)

- [ ] **Step 5: Full gate + commit**

Run: `pnpm check && pnpm test`
Expected: PASS

```bash
git add src/app/dashboard/program-card.tsx src/app/dashboard/program-card.dom.test.tsx
git commit -m "feat(dashboard): make the whole program card tappable to open its counter"
```

---

## Task 2: Manual verification + README fallout

**Files:**

- Modify: `src/app/dashboard/README.md` (per-folder README convention — `program-card.tsx`'s one-line description needs to mention the card is now a stretched link, not a button; verify against the CI `readme-freshness` gate, which fails if `program-card.tsx`/`program-card.dom.test.tsx` changed without their folder's README.md touched)

**Interfaces:** none — this task only verifies and documents; no code changes expected unless verification surfaces a bug.

- [ ] **Step 1: Read `src/app/dashboard/README.md` and check the current `program-card.tsx` bullet wording**

Open the file and find the `program-card.tsx` (and `program-card.dom.test.tsx`, if it has its own bullet) entries — confirm whether they mention "Open Counter" button wording that needs updating to describe the stretched-link/chevron behavior instead.

- [ ] **Step 2: Update the bullet(s), re-run `pnpm check` to confirm formatting**

Run: `pnpm check`
Expected: PASS

- [ ] **Step 3: Start the dev server**

Run: `pnpm dev`
Expected: server up at http://localhost:3000

- [ ] **Step 4: Manually verify in the browser**

Navigate to `/dashboard` (with at least one active program). Confirm:

- Clicking/tapping anywhere on a program card (not just a button) navigates to `/dashboard/counter?p=<id>`.
- Clicking the pencil icon still navigates to `/setup?edit=<id>` and does **not** also trigger the counter navigation.
- A small muted chevron (`›`) appears in the bottom-right corner of each card.
- For a card with several detail lines (e.g. a program with both expiry and head-start set), the chevron doesn't visually overlap the last detail line's text. If it does, add `pb-2` (or similar) to the header `<div>` in `program-card.tsx`, re-run `pnpm check && pnpm test`, and amend the Task 1 commit's follow-up with a small fix commit.
- Tabbing via keyboard reaches both the card link (announced as "Open counter for `<name>`") and the pencil link (announced as "Edit `<name>`") as two distinct, independently-focusable stops, each showing its own focus ring.

- [ ] **Step 5: Stop the dev server, run the full suite one final time**

Run: `pnpm check && pnpm test`
Expected: PASS

- [ ] **Step 6: Commit README fallout only if Step 2 changed anything**

```bash
git add src/app/dashboard/README.md
git commit -m "docs(dashboard): note the tappable-card behavior on program-card.tsx"
```

If Step 2 made no changes, skip this commit — there's nothing to commit.
