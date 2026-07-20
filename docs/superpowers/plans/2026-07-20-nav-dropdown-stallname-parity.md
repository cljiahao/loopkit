# Nav/Dropdown/Stall-Name qkit Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix three loopkit surfaces that drifted from qkit's established pattern — the mobile burger menu's position, the program-switcher dropdown's position, and stall name's missing cutover to the shared `merqo.vendor_profile` table.

**Architecture:** Three independent, low-risk changes on one branch. Areas 1–2 are pure JSX repositioning (no new logic, no new props). Area 3 changes `src/lib/vendor.ts`'s read/write path from the local `loopkit.vendors` table to the shared `merqo.vendor_profile` table via the existing `getOrCreateVendorProfile`/`upsertVendorProfile` RPC wrappers — no schema change, no migration.

**Tech Stack:** Next.js 16 App Router (server components), TypeScript strict, Vitest + Testing Library, Supabase (`@supabase/ssr`), Zod.

## Global Constraints

- TypeScript strict — no `any`, no `@ts-ignore`.
- Never widen an RLS policy to "fix" a query — none of these changes touch RLS.
- Run `pnpm check && pnpm test` before considering any task done (Constitution §6).
- Work stays on branch `nav-dropdown-stallname-parity` (already created, spec committed as `be031b2`/`22b8085`/`464b2f4`) — never commit to `main`.
- Full spec: `docs/superpowers/specs/2026-07-20-nav-dropdown-stallname-parity-design.md`.

---

## Task 1: Burger menu — left group + tap-away scrim

**Files:**

- Modify: `src/app/dashboard/dashboard-nav.tsx:96-225` (the component's `return`)
- Test: `src/app/dashboard/dashboard-nav.dom.test.tsx`

**Interfaces:**

- No prop or export changes — `DashboardNav`'s signature is untouched.

- [ ] **Step 1: Write the failing tests**

Add these two `it` blocks to the existing `describe("DashboardNav", ...)` in `src/app/dashboard/dashboard-nav.dom.test.tsx` (after the existing `"toggles the mobile link panel open and closed"` test):

```tsx
it("renders the burger toggle before the wordmark, and the account menu alone on the right", () => {
  render(<DashboardNav {...baseProps} />);
  const toggle = screen.getByRole("button", { name: /open menu/i });
  const wordmarkLink = screen.getByRole("link", {
    name: /loopkit dashboard home/i,
  });
  const accountButton = screen.getByRole("button", {
    name: /account menu/i,
  });

  expect(
    toggle.compareDocumentPosition(wordmarkLink) &
      Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
  expect(
    wordmarkLink.compareDocumentPosition(accountButton) &
      Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
});

it("closes the mobile panel when the tap-away scrim is clicked", async () => {
  const user = userEvent.setup();
  render(<DashboardNav {...baseProps} />);
  await user.click(screen.getByRole("button", { name: /open menu/i }));
  expect(
    screen.getByRole("button", { name: /close menu/i }),
  ).toBeInTheDocument();

  const scrim = document.querySelector(
    'button[aria-hidden="true"].fixed.inset-0',
  );
  expect(scrim).not.toBeNull();
  await user.click(scrim as HTMLButtonElement);
  expect(
    screen.getByRole("button", { name: /open menu/i }),
  ).toBeInTheDocument();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm exec vitest run src/app/dashboard/dashboard-nav.dom.test.tsx`
Expected: the first new test FAILs (`toggle` is currently found, but its position relative to `wordmarkLink` is reversed — the assertion on `toggle.compareDocumentPosition(wordmarkLink)` returns a falsy bitmask today since the toggle currently renders _after_ the wordmark). The second new test FAILs with `expect(scrim).not.toBeNull()` — no such element exists yet.

- [ ] **Step 3: Reposition the burger and add the scrim**

Replace `src/app/dashboard/dashboard-nav.tsx` lines 96–225 (the full `return (...)` statement) with:

```tsx
return (
  <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
    <div className="flex min-w-0 items-center gap-1 sm:gap-3">
      <button
        type="button"
        aria-label={mobileOpen ? "Close menu" : "Open menu"}
        onClick={() => setMobileOpen((v) => !v)}
        className="-ml-1.5 rounded-lg p-1.5 text-muted-foreground hover:bg-secondary sm:hidden"
      >
        {mobileOpen ? <X className="size-5" /> : <Menu className="size-5" />}
      </button>

      <Link
        href="/dashboard"
        aria-label="loopkit dashboard home"
        className="shrink-0 rounded-sm outline-none transition-opacity hover:opacity-80 focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        <Wordmark className="text-xl" />
      </Link>

      <nav className="hidden items-center gap-1 sm:flex">
        {LINKS.map((link) => {
          const active =
            link.href === "/dashboard"
              ? path === "/dashboard"
              : isActive(path, link.href);
          return (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "rounded-lg px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary",
                active && "bg-primary/10 text-primary hover:bg-primary/10",
              )}
            >
              {link.label}
            </Link>
          );
        })}
      </nav>
    </div>

    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Account menu"
          className="flex items-center gap-2 rounded-lg py-1 pr-1 pl-1 text-left transition-colors outline-none hover:bg-secondary focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          <Avatar className="size-8 shrink-0 rounded-md ring-1 ring-inset ring-primary/25">
            <AvatarImage src={avatarUrl ?? undefined} alt="" />
            <AvatarFallback className="rounded-md bg-primary/12 font-mono text-xs font-semibold tracking-tight text-primary">
              {initials(label)}
            </AvatarFallback>
          </Avatar>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56 rounded-xl">
        <DropdownMenuLabel className="px-2 py-2">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-semibold">
              {vendorName ?? email}
            </p>
            <TierBadge tier={tier} />
          </div>
          <p className="text-xs font-normal text-muted-foreground">
            {vendorName ? email : "Vendor account"}
          </p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/dashboard/profile" className="cursor-pointer">
            <User className="size-4" />
            Profile
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/dashboard/settings" className="cursor-pointer">
            <Settings className="size-4" />
            Settings
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/dashboard/plan" className="cursor-pointer">
            <Wallet className="size-4" />
            Plan
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <form action={signOut}>
          <DropdownMenuItem asChild variant="destructive">
            <button type="submit" className="w-full cursor-pointer">
              <LogOut className="size-4" />
              Sign out
            </button>
          </DropdownMenuItem>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>

    {mobileOpen && (
      <>
        <button
          type="button"
          aria-hidden
          tabIndex={-1}
          onClick={() => setMobileOpen(false)}
          className="fixed inset-0 z-30 cursor-default sm:hidden"
        />
        <div className="absolute inset-x-0 top-full z-40 border-b bg-background/95 px-5 py-3 backdrop-blur-md sm:hidden">
          <div className="flex flex-col gap-1">
            {LINKS.map((link) => {
              const active =
                link.href === "/dashboard"
                  ? path === "/dashboard"
                  : isActive(path, link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setMobileOpen(false)}
                  className={cn(
                    "rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-secondary",
                    active && "bg-primary/10 text-primary",
                  )}
                >
                  {link.label}
                </Link>
              );
            })}
          </div>
        </div>
      </>
    )}
  </div>
);
```

Changes from the original: the burger `<button>` moved from the right-hand group into the left-hand group (before the `Wordmark` `Link`, `-ml-1.5` to flush it against the container edge like qkit); the intermediate `<div className="flex items-center gap-1">` that wrapped burger+`DropdownMenu` is removed, so `DropdownMenu` is now a direct child of the outer `justify-between` row (its sole occupant on the right); a new tap-away scrim `<button>` (`fixed inset-0 z-30`, `aria-hidden`, `tabIndex={-1}`) is added immediately before the mobile panel, which moves from `z-20` to `z-40` so it layers above the scrim. The panel's own contents (LINKS map) are unchanged.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm exec vitest run src/app/dashboard/dashboard-nav.dom.test.tsx`
Expected: PASS (all tests in the file, including the two new ones).

- [ ] **Step 5: Full verification and commit**

Run: `pnpm check`
Expected: no errors.

```bash
git add src/app/dashboard/dashboard-nav.tsx src/app/dashboard/dashboard-nav.dom.test.tsx
git commit -m "$(cat <<'EOF'
fix(dashboard): move mobile burger to the left, add tap-away scrim

Matches qkit's hamburger-left/account-right mobile pattern — the
burger sat in the right-hand group next to the avatar before this.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Program switcher — move below the page header

**Files:**

- Modify: `src/app/dashboard/stats/page.tsx:67-166` (both branches)
- Modify: `src/app/dashboard/customers/page.tsx:82-134` (both branches)
- Modify: `src/app/dashboard/activity/page.tsx:67-136` (both branches)

**Interfaces:**

- No prop or export changes — `ProgramSwitcher`'s signature and every other component's signature are untouched. Pure JSX reorder.

No test changes: none of these three files' default page-component exports are unit-tested today (the codebase's existing convention here is to extract and test only the presentational pieces — `VendorCustomerList`, `ActivityTable` — not the async, data-fetching page shell; there is no `stats/page.test.tsx` at all). This task doesn't change that convention — it only moves existing JSX, no new logic to cover.

- [ ] **Step 1: Reorder in `src/app/dashboard/stats/page.tsx`**

Replace (no-program-selected branch, currently lines 67–79):

```tsx
    return (
      <main className="mx-auto max-w-7xl space-y-8 p-5 py-10">
        <div>
          <ProgramSwitcher
            programs={programs}
            currentId=""
            basePath="/dashboard/stats"
          />
          <h1 className="text-2xl font-bold tracking-tight">Stats</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            How your shop is performing across every program.
          </p>
        </div>
```

with:

```tsx
    return (
      <main className="mx-auto max-w-7xl space-y-8 p-5 py-10">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Stats</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            How your shop is performing across every program.
          </p>
        </div>

        <ProgramSwitcher
          programs={programs}
          currentId=""
          basePath="/dashboard/stats"
        />
```

Replace (program-selected branch, currently lines 154–166):

```tsx
    <main className="mx-auto max-w-7xl space-y-8 p-5 py-10">
      <div>
        <ProgramSwitcher
          programs={programs}
          currentId={program.id}
          basePath="/dashboard/stats"
        />
        <h1 className="text-2xl font-bold tracking-tight">Stats</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          How {program.name} is performing.
        </p>
      </div>
```

with:

```tsx
    <main className="mx-auto max-w-7xl space-y-8 p-5 py-10">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Stats</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          How {program.name} is performing.
        </p>
      </div>

      <ProgramSwitcher
        programs={programs}
        currentId={program.id}
        basePath="/dashboard/stats"
      />
```

- [ ] **Step 2: Reorder in `src/app/dashboard/customers/page.tsx`**

Replace (no-program-selected branch, currently lines 82–94):

```tsx
      <main className="mx-auto max-w-7xl space-y-8 p-5 py-10">
        <div>
          <ProgramSwitcher
            programs={programs}
            currentId=""
            basePath="/dashboard/customers"
          />
          <h1 className="text-2xl font-bold tracking-tight">Customers</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Everyone who has a card at your shop, across every program.
          </p>
        </div>
```

with:

```tsx
      <main className="mx-auto max-w-7xl space-y-8 p-5 py-10">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Customers</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Everyone who has a card at your shop, across every program.
          </p>
        </div>

        <ProgramSwitcher
          programs={programs}
          currentId=""
          basePath="/dashboard/customers"
        />
```

Replace (program-selected branch, currently lines 122–134):

```tsx
    <main className="mx-auto max-w-7xl space-y-8 p-5 py-10">
      <div>
        <ProgramSwitcher
          programs={programs}
          currentId={program.id}
          basePath="/dashboard/customers"
        />
        <h1 className="text-2xl font-bold tracking-tight">Customers</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Everyone who has a {program.name} card.
        </p>
      </div>
```

with:

```tsx
    <main className="mx-auto max-w-7xl space-y-8 p-5 py-10">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Customers</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Everyone who has a {program.name} card.
        </p>
      </div>

      <ProgramSwitcher
        programs={programs}
        currentId={program.id}
        basePath="/dashboard/customers"
      />
```

- [ ] **Step 3: Reorder in `src/app/dashboard/activity/page.tsx`**

Replace (no-program-selected branch, currently lines 67–79):

```tsx
      <main className="mx-auto max-w-7xl space-y-8 p-5 py-10">
        <div>
          <ProgramSwitcher
            programs={programs}
            currentId=""
            basePath={basePath}
          />
          <h1 className="text-2xl font-bold tracking-tight">Activity</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Recent stamps, plays, and redemptions across every program.
          </p>
        </div>
```

with:

```tsx
      <main className="mx-auto max-w-7xl space-y-8 p-5 py-10">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Activity</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Recent stamps, plays, and redemptions across every program.
          </p>
        </div>

        <ProgramSwitcher programs={programs} currentId="" basePath={basePath} />
```

Replace (program-selected branch, currently lines 124–136):

```tsx
  return (
    <main className="mx-auto max-w-7xl space-y-8 p-5 py-10">
      <div>
        <ProgramSwitcher
          programs={programs}
          currentId={program.id}
          basePath={basePath}
        />
        <h1 className="text-2xl font-bold tracking-tight">Activity</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Recent stamps, plays, and redemptions for {program.name}.
        </p>
      </div>
```

with:

```tsx
  return (
    <main className="mx-auto max-w-7xl space-y-8 p-5 py-10">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Activity</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Recent stamps, plays, and redemptions for {program.name}.
        </p>
      </div>

      <ProgramSwitcher
        programs={programs}
        currentId={program.id}
        basePath={basePath}
      />
```

- [ ] **Step 4: Run the existing test suites for these areas**

Run: `pnpm exec vitest run src/app/dashboard/customers src/app/dashboard/activity src/app/dashboard/program-switcher.dom.test.tsx`
Expected: PASS (unchanged — these tests exercise `VendorCustomerList`, `ActivityTable`, and `ProgramSwitcher` in isolation, none of which changed).

- [ ] **Step 5: Full verification and commit**

Run: `pnpm check`
Expected: no errors.

```bash
git add src/app/dashboard/stats/page.tsx src/app/dashboard/customers/page.tsx src/app/dashboard/activity/page.tsx
git commit -m "$(cat <<'EOF'
fix(dashboard): move program switcher below the page header

Stats/Customers/Activity all rendered the switcher above the <h1>;
qkit's equivalent (StatsControls) renders below it. Pure reorder, no
prop or behavior change.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Stall name → merqo.vendor_profile

**Files:**

- Modify: `src/lib/vendor.ts`
- Modify: `test/lib/vendor.test.ts`
- Modify: `src/app/dashboard/profile/profile-form.tsx:45-46` (stale comment only)
- Modify: `src/app/setup/page.tsx:20-25,46-74,132` (remove now-redundant merqo call)
- Modify: `CHANGELOG.md`

**Interfaces:**

- Consumes: `getOrCreateVendorProfile(supabase, vendorId, defaultStallName)` and `upsertVendorProfile(supabase, vendorId, stallName, socialLinks)` from `src/lib/merqo-vendor-profile.ts` (both already exist, unchanged).
- Produces: `getVendorProfile(): Promise<{ name: string | null }>` — same signature as today, but `name` now comes from `merqo.vendor_profile.stall_name` (falling back to the local `vendors.name` only if the merqo call itself fails). `saveStallName(name: string): Promise<{ error?: string }>` — same signature, now writes to `merqo.vendor_profile` instead of `loopkit.vendors`.

- [ ] **Step 1: Rewrite the failing test file**

Replace the entire contents of `test/lib/vendor.test.ts` with:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  requireVendorMock,
  getOrCreateVendorProfileMock,
  upsertVendorProfileMock,
} = vi.hoisted(() => ({
  requireVendorMock: vi.fn(async () => ({ user: { id: "vendor-1" } })),
  getOrCreateVendorProfileMock: vi.fn(),
  upsertVendorProfileMock: vi.fn(),
}));
vi.mock("@/features/auth", () => ({ requireVendor: requireVendorMock }));
vi.mock("@/lib/merqo-vendor-profile", () => ({
  getOrCreateVendorProfile: getOrCreateVendorProfileMock,
  upsertVendorProfile: upsertVendorProfileMock,
}));

const selectChain = {
  maybeSingle: vi.fn(
    async (): Promise<{
      data: { name: string } | null;
      error: { message: string } | null;
    }> => ({ data: null, error: null }),
  ),
};
const fromMock = vi.fn(() => ({
  select: () => selectChain,
}));
vi.mock("@/lib/supabase/server", () => ({
  createServerClient: vi.fn(async () => ({ from: fromMock })),
}));

import { stallNameSchema, saveStallName, getVendorProfile } from "@/lib/vendor";

describe("stallNameSchema", () => {
  it("accepts a valid stall name", () => {
    expect(stallNameSchema.safeParse({ name: "Kopi Corner" }).success).toBe(
      true,
    );
  });

  it("rejects an empty name", () => {
    expect(stallNameSchema.safeParse({ name: "" }).success).toBe(false);
  });

  it("rejects a whitespace-only name (trims to empty)", () => {
    expect(stallNameSchema.safeParse({ name: "   " }).success).toBe(false);
  });

  it("rejects a name over 60 characters", () => {
    expect(stallNameSchema.safeParse({ name: "a".repeat(61) }).success).toBe(
      false,
    );
  });

  it("accepts a name at exactly 60 characters", () => {
    expect(stallNameSchema.safeParse({ name: "a".repeat(60) }).success).toBe(
      true,
    );
  });
});

describe("saveStallName", () => {
  beforeEach(() => {
    getOrCreateVendorProfileMock.mockReset();
    upsertVendorProfileMock.mockReset();
    getOrCreateVendorProfileMock.mockResolvedValue({
      vendor_id: "vendor-1",
      stall_name: "Old Name",
      social_links: { website: "https://old.example" },
      created_at: "",
      updated_at: "",
    });
    upsertVendorProfileMock.mockResolvedValue({
      vendor_id: "vendor-1",
      stall_name: "Kopi Corner",
      social_links: { website: "https://old.example" },
      created_at: "",
      updated_at: "",
    });
  });

  it("saves the name to merqo.vendor_profile, preserving existing social links", async () => {
    const res = await saveStallName("Kopi Corner");
    expect(res.error).toBeUndefined();
    expect(upsertVendorProfileMock).toHaveBeenCalledWith(
      expect.anything(),
      "vendor-1",
      "Kopi Corner",
      { website: "https://old.example" },
    );
  });

  it("returns an error without throwing when the merqo write fails", async () => {
    upsertVendorProfileMock.mockRejectedValueOnce(new Error("db down"));
    const res = await saveStallName("Kopi Corner");
    expect(res.error).toMatch(/couldn't save/i);
  });

  it("rejects an invalid name without calling merqo", async () => {
    const res = await saveStallName("");
    expect(res.error).toBeDefined();
    expect(getOrCreateVendorProfileMock).not.toHaveBeenCalled();
    expect(upsertVendorProfileMock).not.toHaveBeenCalled();
  });
});

describe("getVendorProfile", () => {
  beforeEach(() => {
    getOrCreateVendorProfileMock.mockReset();
    selectChain.maybeSingle.mockReset();
    selectChain.maybeSingle.mockResolvedValue({ data: null, error: null });
  });

  it("returns the merqo stall_name, not the local vendors.name row", async () => {
    getOrCreateVendorProfileMock.mockResolvedValue({
      vendor_id: "vendor-1",
      stall_name: "Merqo Name",
      social_links: {},
      created_at: "",
      updated_at: "",
    });
    const res = await getVendorProfile();
    expect(res).toEqual({ name: "Merqo Name" });
    expect(getOrCreateVendorProfileMock).toHaveBeenCalledWith(
      expect.anything(),
      "vendor-1",
      null,
    );
  });

  it("passes the local vendors.name as the seed when a local row exists", async () => {
    selectChain.maybeSingle.mockResolvedValueOnce({
      data: { name: "Local Name" },
      error: null,
    });
    getOrCreateVendorProfileMock.mockResolvedValue({
      vendor_id: "vendor-1",
      stall_name: "Local Name",
      social_links: {},
      created_at: "",
      updated_at: "",
    });
    await getVendorProfile();
    expect(getOrCreateVendorProfileMock).toHaveBeenCalledWith(
      expect.anything(),
      "vendor-1",
      "Local Name",
    );
  });

  it("falls back to the local name when the merqo read fails", async () => {
    selectChain.maybeSingle.mockResolvedValueOnce({
      data: { name: "Local Name" },
      error: null,
    });
    getOrCreateVendorProfileMock.mockRejectedValueOnce(new Error("db down"));
    const res = await getVendorProfile();
    expect(res).toEqual({ name: "Local Name" });
  });

  it("throws when the local Supabase read errors", async () => {
    selectChain.maybeSingle.mockResolvedValueOnce({
      data: null,
      error: { message: "db down" },
    });
    await expect(getVendorProfile()).rejects.toThrow(
      "getVendorProfile: db down",
    );
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run test/lib/vendor.test.ts`
Expected: FAIL — `saveStallName` tests fail because the current implementation calls `supabase.from("vendors").upsert(...)`, never `upsertVendorProfileMock`; `getVendorProfile` tests fail because the current implementation returns `{ name: data?.name ?? null }` directly, never calling `getOrCreateVendorProfileMock`.

- [ ] **Step 3: Rewrite `src/lib/vendor.ts`**

Replace the entire file with:

```ts
import { z } from "zod";
import { requireVendor } from "@/features/auth";
import { createServerClient } from "@/lib/supabase/server";
import {
  getOrCreateVendorProfile,
  upsertVendorProfile,
} from "@/lib/merqo-vendor-profile";

export const stallNameSchema = z.object({
  name: z.string().trim().min(1).max(60),
});

export type VendorProfile = {
  name: string | null;
};

/**
 * The signed-in vendor's stall name — now sourced from the shared
 * merqo.vendor_profile.stall_name (mirrors qkit's cutover; see
 * docs/superpowers/specs/2026-07-20-nav-dropdown-stallname-parity-design.md).
 * loopkit.vendors.name is read only as the seed for a lazily-created merqo
 * row, never returned directly. Degrades to that local name on a merqo
 * hiccup rather than throwing — this call backs every dashboard page via
 * the layout, so a merqo outage shouldn't 500 the whole vendor console.
 */
export async function getVendorProfile(): Promise<VendorProfile> {
  const { user } = await requireVendor();
  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("vendors")
    .select("name")
    .maybeSingle();
  if (error) throw new Error(`getVendorProfile: ${error.message}`);

  const localName = data?.name ?? null;
  try {
    const profile = await getOrCreateVendorProfile(
      supabase,
      user.id,
      localName,
    );
    return { name: profile.stall_name };
  } catch (err) {
    console.error(
      "getVendorProfile: shared vendor profile read failed",
      err instanceof Error ? err.message : err,
    );
    return { name: localName };
  }
}

/**
 * Save the vendor's stall name to the shared merqo.vendor_profile row,
 * preserving its existing social_links — the same preserve-the-other-field
 * pattern src/app/dashboard/profile/actions.ts's updateSocialLinksAction
 * already uses in reverse.
 */
export async function saveStallName(name: string): Promise<{ error?: string }> {
  const { user } = await requireVendor();
  const parsed = stallNameSchema.safeParse({ name });
  if (!parsed.success) return { error: "Enter a stall name." };

  const supabase = await createServerClient();
  try {
    const current = await getOrCreateVendorProfile(supabase, user.id, null);
    await upsertVendorProfile(
      supabase,
      user.id,
      parsed.data.name,
      current.social_links,
    );
  } catch {
    return { error: "Couldn't save your stall name. Try again." };
  }
  return {};
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run test/lib/vendor.test.ts`
Expected: PASS (all 13 tests).

- [ ] **Step 5: Fix the stale comment in `profile-form.tsx`**

In `src/app/dashboard/profile/profile-form.tsx`, replace lines 45–46:

```tsx
// Stall name — persisted via a server action (RLS-scoped write to
// loopkit.vendors) + revalidatePath so the nav picks it up.
```

with:

```tsx
// Stall name — persisted via a server action to the shared
// merqo.vendor_profile row + revalidatePath so the nav picks it up.
```

- [ ] **Step 6: Remove the now-redundant merqo call in `src/app/setup/page.tsx`**

`getVendorProfile()` now does this page's `getOrCreateVendorProfile` call internally (Step 3), so this page's own copy is a redundant second round-trip to the same row for a value (`vendorProfile?.stall_name`) that's now always equal to `localProfile.name`.

Remove these imports (lines 20, 21–24):

```tsx
import { createServerClient } from "@/lib/supabase/server";
import {
  getOrCreateVendorProfile,
  type VendorProfile,
} from "@/lib/merqo-vendor-profile";
```

Replace lines 46–74:

```tsx
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
```

with:

```tsx
const { user } = await requireVendor();
await applyDueCutovers();
// getVendorProfile() now reads straight from the shared
// merqo.vendor_profile row (src/lib/vendor.ts) — no separate cross-schema
// call needed here anymore.
const localProfile = await getVendorProfile();
```

Replace line 132:

```tsx
{
  localProfile.name ?? vendorProfile?.stall_name;
}
```

with:

```tsx
{
  localProfile.name;
}
```

- [ ] **Step 7: Run the setup page's test suite**

Run: `pnpm exec vitest run src/app/setup/setup-page.dom.test.tsx`
Expected: PASS — this file already mocks `@/lib/vendor`'s `getVendorProfile` and `@/lib/merqo-vendor-profile`'s `getOrCreateVendorProfile` wholesale (returning stub values regardless of call count), so removing the second call site doesn't break its mocks; it exercises the `user`'s email as `localProfile.name` fallback data unaffected by this change.

- [ ] **Step 8: Add the CHANGELOG entry**

In `CHANGELOG.md`, under `## [Unreleased]` → `### Changed`, add (as the last bullet in that section):

```markdown
- Stall name now reads from and writes to the shared `merqo.vendor_profile`
  table (matching qkit's own cutover) instead of the local
  `loopkit.vendors.name` column — social links already worked this way.
  Mobile burger menu moved to the left of the header (next to the wordmark,
  matching qkit) instead of next to the account avatar, and gained a
  tap-away scrim. The program-switcher dropdown on Stats/Customers/Activity
  now renders below the page header instead of above it.
```

- [ ] **Step 9: Full verification and commit**

Run: `pnpm check && pnpm test`
Expected: no errors, all tests pass.

```bash
git add src/lib/vendor.ts test/lib/vendor.test.ts src/app/dashboard/profile/profile-form.tsx src/app/setup/page.tsx CHANGELOG.md
git commit -m "$(cat <<'EOF'
fix(vendor): read/write stall name via merqo.vendor_profile

Matches qkit's already-completed cutover — social links moved to the
shared table in PR #14, stall name never did, so it could drift from
what merqo/other kits see. loopkit.vendors.name is now seed-only, not
a write target; kept (not dropped), matching qkit's own "not yet
dropped" stance on its equivalent column.

Also drops setup/page.tsx's now-redundant second merqo round-trip —
getVendorProfile() does that internally as of this commit.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 10: Push and check the PR**

```bash
git push
```

Then confirm CI is green on PR #15 (`gh pr checks 15`) and, once the new Vercel preview deploys, manually click through: mobile burger position + tap-away scrim on `/dashboard`, dropdown position on `/dashboard/stats`, `/dashboard/customers`, `/dashboard/activity`, and that editing the stall name on `/dashboard/profile` is reflected immediately in the nav (this was already true before, should still be true after).

---

## Self-Review Notes

- **Spec coverage:** All three spec areas have a task (Task 1 = Area 1, Task 2 = Area 2, Task 3 = Area 3). The spec's "Out of scope" items (dropping `loopkit.vendors.name`, any `social_links` change, other visual changes) are correctly not touched by any task.
- **Type consistency:** `getVendorProfile(): Promise<VendorProfile>` (`{ name: string | null }`) and `saveStallName(name: string): Promise<{ error?: string }>` keep their existing signatures across Task 3's steps and match every existing call site (`dashboard/layout.tsx`, `dashboard/profile/page.tsx`, `setup/page.tsx`, `dashboard/profile/actions.ts`) — none of those call sites need changes beyond `setup/page.tsx`'s Step 6 cleanup.
- **No placeholders:** every step above has complete, copy-pasteable code — no "add appropriate error handling" or "similar to Task N" shortcuts.
