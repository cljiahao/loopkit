# Dashboard: tappable program card — Design

## Context

This is item 1 of 3 in a larger UX cleanup the vendor raised in one sitting
(dashboard card tap target, the `/setup` create-vs-manage split, and a
larger program-type consolidation) — deliberately split into three separate
spec → plan → build cycles given the size gap between them. This spec covers
only the dashboard card.

Today, `ProgramCard` (`src/app/dashboard/program-card.tsx`) shows a card per
active program with a separate "Open Counter" button at the bottom. The
vendor's complaint: the label "Open Counter" reads as if the card itself is
_not_ open/active — confusing wording, and an extra tap target when the
whole card could just be tappable.

## Current state (verified against the actual component)

```tsx
// src/app/dashboard/program-card.tsx (current, 45 lines)
export function ProgramCard({ program }: { program: Program }) {
  const badge = PROGRAM_TYPE_BADGE[program.type] ?? PROGRAM_TYPE_BADGE.stamp;
  const scoped = (href: string) => `${href}?p=${program.id}`;

  return (
    <div className="flex flex-col gap-4 rounded-2xl border bg-card p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">{/* name, badge, description, details */}</div>
        <Link
          href={`/setup?edit=${program.id}`}
          aria-label={`Edit ${program.name}`}
        >
          <Pencil className="size-4" />
        </Link>
      </div>
      <Button asChild className="h-11 w-full rounded-xl font-semibold">
        <Link href={scoped("/dashboard/counter")}>Open Counter</Link>
      </Button>
    </div>
  );
}
```

- The root is a plain `<div>` — not a link. Only the pencil icon and the
  "Open Counter" button are actual `<Link>`s today.
- `program-card.dom.test.tsx` (5 tests) asserts: name/badge/description
  render, expiry/head-start detail lines render, "Never expires" fallback,
  `Edit` link → `/setup?edit=<id>`, `Open Counter` link (by accessible
  name `/open counter/i`) → `/dashboard/counter?p=<id>`, and that no
  Customers/Activity/Stats links render.
- No "stretched link" (whole-card-clickable-via-absolute-overlay) pattern
  exists anywhere else in this codebase today (checked
  `src/app/dashboard/`, `src/components/`) — this introduces the pattern,
  not reuses one, so it needs to be done carefully and match Tailwind
  conventions already used elsewhere in this file.

## Design

### Structure: stretched link, not a wrapping `<a>`

Nesting an `<a>` inside another `<a>` (wrapping the pencil-icon link in an
outer card-link) is invalid HTML and breaks focus order. Instead, use the
standard "stretched link" technique:

- The card's root `<div>` gets `relative` (it already has no positioning
  today).
- Add a new `<Link href={scoped("/dashboard/counter")}>` as the **first**
  child of the root, styled `absolute inset-0 rounded-2xl` (matching the
  card's own corner radius so any focus ring lines up) — visually
  invisible, but its click/tap area covers the entire card.
- The pencil-edit `<Link>` gets `relative z-10` added to its existing
  classes, so it renders above the stretched link and stays independently
  clickable — clicking the pencil does not also trigger the card-level
  navigation, because the pencil's own link element is what receives the
  click (an ordinary DOM hit-test, no JS/`stopPropagation` needed).
- Remove the `<Button asChild>…Open Counter…</Button>` block entirely — the
  stretched link replaces it. `Button` becomes unused in this file; drop
  its import too.

### Accessible name

The stretched link's visible content is empty (it's a transparent overlay),
so it needs `aria-label={`Open counter for ${program.name}`}` — matching
this file's existing convention of dynamic per-program `aria-label`s (the
pencil link already does `aria-label={`Edit ${program.name}`}`). Screen
reader users tabbing to the card hear "Open counter for Coffee Stamps,
link"; the plain-text name/badge/description content elsewhere in the card
remains readable as ordinary text, same as today.

### Visual affordance

Add a small trailing chevron (`ChevronRight` from `lucide-react`, already a
dependency via other `lucide-react` icons in this codebase) in the
bottom-right corner of the card, muted color (`text-muted-foreground`),
`aria-hidden="true"` (decorative only — the accessible name lives on the
stretched link, not the chevron). This needs its own small positioning
(e.g. `absolute bottom-4 right-4`, sitting below the stretched link in
z-order since it's purely decorative and never needs its own click
handling — the stretched link underneath still receives the click through
it).

Removing the `Button` row leaves the header `<div>` as the only element in
the `flex flex-col gap-4` root, so card height now tracks the header's
content height plus `p-5` padding — a card with a long `programDetails`
list could render its last detail line close to the chevron's `bottom-4`
position. Not fixable in the abstract (depends on real content in the
browser); the implementation plan's manual visual check should confirm
this and add `pb-2` (or similar) to the header if the chevron crowds the
text.

### Full replacement file

```tsx
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
// inside <a> is invalid HTML).
// Serve/lookup lives on the dedicated Counter page (app/dashboard/counter/page.tsx).
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

Note the bottom padding: today's card uses `p-5` uniformly; the chevron at
`bottom-4 right-4` sits inside that padding without needing an extra
bottom-height reservation, since it replaces the vertical space the
`Button` row used to occupy.

## Testing

- `program-card.dom.test.tsx`'s existing 5 tests: the name/badge/description
  test, expiry/head-start detail test, "Never expires" test, and the
  no-Customers/Activity/Stats test are all unaffected (same DOM elements,
  same text). The Edit-link test is unaffected (same `aria-label`, same
  href).
- The `Open Counter` test **must change** — there's no longer a link with
  accessible name matching `/open counter/i` (no visible text). Replace it
  with an assertion on the stretched link's `aria-label`:
  ```tsx
  it("links the whole card to /dashboard/counter?p=<id>", () => {
    render(<ProgramCard program={program} />);
    expect(
      screen.getByRole("link", { name: /open counter for coffee stamps/i }),
    ).toHaveAttribute("href", "/dashboard/counter?p=p1");
  });
  ```
- New test: the pencil-edit link and the stretched card-link are two
  distinct elements (not one link wrapping the other) — assert
  `screen.getAllByRole("link")` has exactly 2 entries, and that neither
  link is a DOM descendant of the other.
- `pnpm check && pnpm test` must pass.

## Out of scope

- The `/setup` create-vs-manage split and the program-type consolidation —
  separate specs, tracked next.
- The dedicated Counter page (`src/app/dashboard/counter/page.tsx`) itself —
  unchanged, only how you navigate to it changes.
- `serve-customer.tsx` — the vendor's actual stamping UI on the counter
  page, untouched.
