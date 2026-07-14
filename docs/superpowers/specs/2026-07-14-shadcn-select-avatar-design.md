# shadcn Select + Avatar conversion

Date: 2026-07-14

## Problem

New standing instruction from the user: always use shadcn's components
where possible; install via the shadcn CLI if a needed one isn't already
in `src/components/ui/`. Two existing pieces predate this rule and were
hand-rolled instead:

- `src/app/dashboard/program-switcher.tsx` — a plain native `<select>`.
- `src/app/dashboard/dashboard-nav.tsx`'s account-menu trigger — a
  hand-rolled `<span>` wrapping either a `next/image` avatar or an
  initials fallback.

`src/components/ui/` currently has: `alert-dialog`, `badge`, `button`,
`card`, `dropdown-menu`, `input`, `label` — no `select.tsx` or
`avatar.tsx`.

## A known tension, surfaced and resolved

`ProgramSwitcher` was rewritten earlier _this same session_ specifically
to mirror qkit's plain native `<select>` pattern (the user's own explicit
complaint that triggered that rewrite: "why cn you follow how qkit handle
the stats... there's already a good working example"). shadcn's `Select`
is Radix-based — a custom popover/listbox, not a native `<select>` — a
real interaction-model change (no native mobile picker wheel). This was
raised directly to the user before designing further; they confirmed they
still want the conversion, so the shadcn-first rule takes precedence here
over the earlier native-select choice.

## Decisions

- `ProgramSwitcher`'s public API (`programs`, `currentId`, `basePath`)
  does not change — none of its three call sites (Stats/Activity/
  Customers) need touching. Only the internals swap.
- Radix `Select` disallows an empty-string item `value` (reserved
  internally). `currentId=""` (the "All programs" sentinel used
  throughout this session's design) maps to an internal `"all"` sentinel
  for the `Select`'s own `value`/`onValueChange`, translated back to `""`
  before calling the existing `handleChange`/`router.push` logic — so the
  URL/query-param contract (`?p=<id>` or no `p` at all) is unchanged.
- `DashboardNav`'s avatar becomes `Avatar`/`AvatarImage`/`AvatarFallback`,
  keeping the current visual footprint (`size-8`, `rounded-md`, `ring-1
ring-inset ring-primary/25`, `bg-primary/12`, initials fallback in the
  same mono/xs/semibold styling) via `className` overrides — shadcn's
  `Avatar` defaults to `rounded-full`, which this app does not use.
  Accepted tradeoff: Radix's `AvatarImage` renders a plain `<img>`, not
  `next/image`, so it loses Next's automatic optimization/lazy-loading.
  `avatarUrl` is a small OAuth profile photo (Google avatar via Supabase
  auth), so the real-world impact is minor — explicitly accepted, not
  silently dropped.
- The `DropdownMenuTrigger`/account-menu button wrapper around the avatar
  is untouched — only the avatar markup inside it changes.

## A. Install

```bash
pnpm dlx shadcn@latest add select avatar
```

Adds `src/components/ui/select.tsx` and `src/components/ui/avatar.tsx`
(standard shadcn new-york-style output, matching this repo's existing
`components.json` config — same as how `dropdown-menu.tsx` etc. were
added).

## B. `ProgramSwitcher` → shadcn `Select`

New internals (same file, same exported signature):

```tsx
"use client";

import { useRouter, useSearchParams } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const ALL_PROGRAMS = "all";

export function ProgramSwitcher({
  programs,
  currentId,
  basePath,
}: {
  programs: { id: string; name: string }[];
  currentId: string;
  basePath: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  if (programs.length <= 1) return null;

  function handleChange(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value && value !== ALL_PROGRAMS) {
      params.set("p", value);
    } else {
      params.delete("p");
    }
    const query = params.toString();
    router.push(query ? `${basePath}?${query}` : basePath);
  }

  return (
    <Select value={currentId || ALL_PROGRAMS} onValueChange={handleChange}>
      <SelectTrigger
        aria-label="Switch program"
        className="mb-4 h-9 w-auto min-w-[10rem] rounded-lg border bg-card px-3 text-sm"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL_PROGRAMS}>All programs</SelectItem>
        {programs.map((option) => (
          <SelectItem key={option.id} value={option.id}>
            {option.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
```

`handleChange` receives the raw `Select` value directly (`"all"` or a
program id) — no `event.target.value` unwrapping needed, since
`onValueChange` already hands back the selected value.

## C. `DashboardNav` avatar → shadcn `Avatar`

Replaces the current `<span>` block (the `DropdownMenuTrigger`'s `<button>`
wrapper stays exactly as-is):

```tsx
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

// ...inside the existing <button aria-label="Account menu">...
<Avatar className="size-8 shrink-0 rounded-md ring-1 ring-inset ring-primary/25">
  <AvatarImage src={avatarUrl ?? undefined} alt="" />
  <AvatarFallback className="rounded-md bg-primary/12 font-mono text-xs font-semibold tracking-tight text-primary">
    {initials(label)}
  </AvatarFallback>
</Avatar>;
```

The `Image`/`next/image` import in `dashboard-nav.tsx` is removed (no
longer used anywhere in the file — confirm before deleting).

## D. Testing

- `program-switcher.dom.test.tsx` rewritten: `fireEvent.change` on a
  native `<select>` no longer applies. Use `@testing-library/user-event`
  to click the `SelectTrigger` (found via its `aria-label="Switch
program"`), then click the target `SelectItem` by its visible text
  (Radix renders `SelectContent` in a portal, so `screen.getByRole` /
  `screen.getByText` still finds it after the trigger opens it — assert
  the item exists before clicking). Assert the same 5 behaviors as
  today's suite: renders "All programs" + every program with the current
  one shown, selecting "All programs" pushes with `p` removed, selecting
  a program pushes with `p` set (existing params preserved), renders
  `null` at `programs.length <= 1`.
- Radix `Select` needs two jsdom polyfills this repo's `test/setup.ts`
  doesn't currently provide: `Element.prototype.hasPointerCapture` and
  `Element.prototype.scrollIntoView` (both no-ops in jsdom by default,
  which Radix's internal positioning logic calls and jsdom doesn't
  implement, causing thrown errors without a stub). Add both as global
  no-op stubs in `test/setup.ts` — this benefits any future Radix
  `Select`/similar component test in this repo, not just this one file.
- `dashboard-nav.dom.test.tsx`: no existing assertion targets the
  avatar's internals (only the "Account menu" button role and dropdown
  contents) — expected to keep passing unchanged. Verify this
  empirically rather than assuming.

## Out of scope

- Any other hand-rolled UI element beyond these two flagged gaps — no
  broader repo-wide shadcn audit in this pass.
- Any visual redesign beyond matching current styling exactly.
