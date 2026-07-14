# qkit-parity Nav Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace loopkit's invented program-switcher UX with qkit's proven pattern (one instant `<select>`, no submit button), move the qkit-integration settings off the dashboard body onto a dedicated `/dashboard/settings` page reached from the account dropdown (mirroring qkit's placement), and shorten the browser tab title.

**Architecture:** Three independent, disjoint-file changes. Task 1 rewrites `ProgramSwitcher` as a `"use client"` component driven by `useRouter`/`useSearchParams` and updates its three call sites (Stats, Activity, Customers merged+filtered branches), deleting Customers' duplicate hand-rolled inline picker in the process. Task 2 adds a new settings page and dropdown link, relocating (not rewriting) the existing `QkitEarnSettings` form. Task 3 is a one-line metadata change. No task depends on another.

**Tech Stack:** Next.js 16 App Router (Server Components + one new Client Component), TypeScript strict, Tailwind v4, Vitest + Testing Library (jsdom).

## Global Constraints

- Keep the codebase clean: delete Customers' duplicate inline picker block entirely — no leftover dead code, no old-and-new `ProgramSwitcher` forms coexisting.
- Every task's commit must leave `pnpm check` (prettier + eslint + tsc) clean.
- `ProgramSwitcher`'s new client-side behavior must match qkit's `StatsControls.setParam` pattern exactly: copy existing `useSearchParams()` params, set/delete the one key, `router.push`. No submit button, no GET form.
- The new settings page title is **"Settings"** — not "Board settings" (that name is specific to qkit's own alerting feature, which loopkit doesn't have).
- `QkitEarnSettings` (`src/app/dashboard/qkit-earn-settings.tsx`) and its test file are **not modified** — only referenced from a new location. Its internal `import { saveQkitEarnConfigAction } from "./actions"` is a relative import to `src/app/dashboard/actions.ts`; since the component file itself does not move, this import stays valid unchanged.

---

### Task 1: Instant client-side `ProgramSwitcher`

**Files:**

- Modify: `src/app/dashboard/program-switcher.tsx` (full rewrite)
- Modify: `src/app/dashboard/program-switcher.dom.test.tsx` (full rewrite)
- Modify: `src/app/dashboard/stats/page.tsx:70-74` and `:157-161` (prop name `action` → `basePath`)
- Modify: `src/app/dashboard/activity/page.tsx:88-92` and `:133-137` (prop name `action` → `basePath`)
- Modify: `src/app/dashboard/customers/page.tsx:85-89` (prop name `action` → `basePath`) and `:125-151` (delete duplicate inline picker, replace with `<ProgramSwitcher>`)

**Interfaces:**

- Produces: `ProgramSwitcher({ programs: {id, name}[], currentId: string, basePath: string })` — a `"use client"` component. `currentId=""` renders "All programs" selected; `currentId="<program.id>"` renders that program selected. Renders `null` when `programs.length <= 1`.

- [ ] **Step 1: Write the failing test**

Replace the full contents of `src/app/dashboard/program-switcher.dom.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ProgramSwitcher } from "./program-switcher";

const { routerPush, searchParamsValue } = vi.hoisted(() => ({
  routerPush: vi.fn(),
  searchParamsValue: { current: "" },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: routerPush }),
  useSearchParams: () => new URLSearchParams(searchParamsValue.current),
}));

const programs = [
  { id: "p1", name: "Coffee Stamps" },
  { id: "p2", name: "Bubble Tea Club" },
];

describe("ProgramSwitcher", () => {
  it("renders All programs plus every program, with the current one selected", () => {
    searchParamsValue.current = "p=p2";
    render(
      <ProgramSwitcher
        programs={programs}
        currentId="p2"
        basePath="/dashboard/stats"
      />,
    );
    const select = screen.getByLabelText("Switch program") as HTMLSelectElement;
    expect(select.value).toBe("p2");
    expect(
      screen.getByRole("option", { name: "All programs" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: "Coffee Stamps" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: "Bubble Tea Club" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Switch" }),
    ).not.toBeInTheDocument();
  });

  it("selects All programs when currentId is empty", () => {
    searchParamsValue.current = "";
    render(
      <ProgramSwitcher
        programs={programs}
        currentId=""
        basePath="/dashboard/stats"
      />,
    );
    const select = screen.getByLabelText("Switch program") as HTMLSelectElement;
    expect(select.value).toBe("");
  });

  it("pushes the base path with p set, preserving other params, on change", () => {
    searchParamsValue.current = "q=alice";
    render(
      <ProgramSwitcher
        programs={programs}
        currentId=""
        basePath="/dashboard/customers"
      />,
    );
    fireEvent.change(screen.getByLabelText("Switch program"), {
      target: { value: "p1" },
    });
    expect(routerPush).toHaveBeenCalledWith(
      "/dashboard/customers?q=alice&p=p1",
    );
  });

  it("pushes the base path with p removed when All programs is chosen", () => {
    searchParamsValue.current = "p=p1&q=alice";
    render(
      <ProgramSwitcher
        programs={programs}
        currentId="p1"
        basePath="/dashboard/customers"
      />,
    );
    fireEvent.change(screen.getByLabelText("Switch program"), {
      target: { value: "" },
    });
    expect(routerPush).toHaveBeenCalledWith("/dashboard/customers?q=alice");
  });

  it("renders nothing when there is only one program", () => {
    render(
      <ProgramSwitcher
        programs={[programs[0]]}
        currentId="p1"
        basePath="/dashboard/stats"
      />,
    );
    expect(screen.queryByLabelText("Switch program")).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test program-switcher.dom.test.tsx`
Expected: FAIL — `ProgramSwitcher` still exports the old GET-form component (no `useRouter`/`useSearchParams` import in the source, wrong prop name `action`, `select` is not controlled the same way, no "All programs" option).

- [ ] **Step 3: Write minimal implementation**

Replace the full contents of `src/app/dashboard/program-switcher.tsx`:

```tsx
"use client";

import { useRouter, useSearchParams } from "next/navigation";

// Same-page program switcher for every Stats/Activity/Customers view (merged
// and filtered alike), mirroring qkit's StatsControls: one instant <select>,
// no submit button. Copies the current URL's other params (e.g. Customers'
// `q` search term) forward so switching programs never drops them.
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
    if (value) {
      params.set("p", value);
    } else {
      params.delete("p");
    }
    const query = params.toString();
    router.push(query ? `${basePath}?${query}` : basePath);
  }

  return (
    <select
      value={currentId}
      onChange={(e) => handleChange(e.target.value)}
      aria-label="Switch program"
      className="mb-4 h-9 rounded-lg border bg-card px-3 text-sm"
    >
      <option value="">All programs</option>
      {programs.map((option) => (
        <option key={option.id} value={option.id}>
          {option.name}
        </option>
      ))}
    </select>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test program-switcher.dom.test.tsx`
Expected: PASS (5/5 tests)

- [ ] **Step 5: Update the three call sites**

In `src/app/dashboard/stats/page.tsx`, both `<ProgramSwitcher>` usages (merged branch around line 70, filtered branch around line 157) change the `action` prop to `basePath`:

```tsx
<ProgramSwitcher
  programs={programs}
  currentId={programs[0]?.id ?? ""}
  basePath="/dashboard/stats"
/>
```

```tsx
<ProgramSwitcher
  programs={programs}
  currentId={program.id}
  basePath="/dashboard/stats"
/>
```

In `src/app/dashboard/activity/page.tsx`, both `<ProgramSwitcher>` usages (merged branch around line 88, filtered branch around line 133) change the `action` prop to `basePath` the same way, with `basePath="/dashboard/activity"`.

In `src/app/dashboard/customers/page.tsx`:

1. The merged branch's `<ProgramSwitcher>` (around line 85) changes `action` to `basePath="/dashboard/customers"`.
2. The filtered branch's duplicate hand-rolled picker (lines 125-151 today — the `{programs.length > 1 ? (<form>...</form>) : null}` block with the hidden `q` input) is deleted entirely and replaced with:

```tsx
<ProgramSwitcher
  programs={programs}
  currentId={program.id}
  basePath="/dashboard/customers"
/>
```

`useSearchParams()` inside `ProgramSwitcher` now carries `q` forward automatically — no hidden field needed.

- [ ] **Step 6: Run the full test suite and typecheck**

Run: `pnpm check && pnpm test`
Expected: All pass. (No other test file asserts on the old "Switch" button or `action` attribute — `customers-page.dom.test.tsx` and `activity-page.dom.test.tsx` only test the extracted `VendorCustomerList`/`VendorActivityList` components, not the page's picker, so they need no changes.)

- [ ] **Step 7: Manually verify in the running app**

Run: `pnpm dev`, sign in as a vendor with 2+ programs, visit `/dashboard/stats`. Confirm: the picker shows "All programs" selected by default, choosing a program navigates instantly (no button click) to `/dashboard/stats?p=<id>` and shows that program's stats, choosing "All programs" again navigates back to the merged view. Repeat on `/dashboard/activity` and `/dashboard/customers` — on Customers, type a search term first, then switch programs, and confirm the search term is preserved in the URL and the search box.

- [ ] **Step 8: Commit**

```bash
git add src/app/dashboard/program-switcher.tsx src/app/dashboard/program-switcher.dom.test.tsx src/app/dashboard/stats/page.tsx src/app/dashboard/activity/page.tsx src/app/dashboard/customers/page.tsx
git commit -m "feat: instant program switcher matching qkit's booth-switcher pattern"
```

---

### Task 2: Settings page

**Files:**

- Create: `src/app/dashboard/settings/page.tsx`
- Modify: `src/app/dashboard/page.tsx` (remove `qkit_earn_config` query, `QkitEarnSettings` import, `<details>` block)
- Modify: `src/app/dashboard/dashboard-nav.tsx` (add Settings dropdown item)
- Modify: `src/app/dashboard/dashboard-nav.dom.test.tsx` (assert Settings item present)
- Modify: `src/app/dashboard/actions.ts:441` (`revalidatePath` target)

**Interfaces:**

- Consumes: `QkitEarnSettings` from `@/app/dashboard/qkit-earn-settings` — unchanged signature `{ programs: {id,name}[], current: {programId,enabled}|null, isPro: boolean }`.
- Consumes: `listPrograms`, `isPro` from `@/lib/program` (already used identically in `src/app/dashboard/page.tsx` today).
- Consumes: `requireVendor` from `@/lib/auth`, `createServerClient` from `@/lib/supabase/server` (same imports `dashboard/page.tsx` already uses for this exact query).

- [ ] **Step 1: Create the settings page**

Write `src/app/dashboard/settings/page.tsx`:

```tsx
import { requireVendor } from "@/lib/auth";
import { listPrograms, isPro } from "@/lib/program";
import { createServerClient } from "@/lib/supabase/server";
import { QkitEarnSettings } from "@/app/dashboard/qkit-earn-settings";

export default async function SettingsPage() {
  const { user } = await requireVendor();

  const [programs, pro, supabase] = await Promise.all([
    listPrograms(),
    isPro(),
    createServerClient(),
  ]);
  const { data: qkitEarnConfig } = await supabase
    .from("qkit_earn_config")
    .select("program_id, enabled")
    .eq("vendor_id", user.id)
    .maybeSingle();

  return (
    <main className="mx-auto max-w-2xl space-y-8 p-5 py-10">
      <div>
        <h1 className="font-display text-2xl font-bold">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Connect loopkit with the other tools you use.
        </p>
      </div>
      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          qkit integration
        </h2>
        <QkitEarnSettings
          programs={programs
            .filter((prog) => prog.type === "stamp")
            .map((prog) => ({
              id: prog.id,
              name: prog.name,
            }))}
          current={
            qkitEarnConfig
              ? {
                  programId: qkitEarnConfig.program_id,
                  enabled: qkitEarnConfig.enabled,
                }
              : null
          }
          isPro={pro}
        />
      </div>
    </main>
  );
}
```

This mirrors `src/app/dashboard/profile/page.tsx`'s exact header/layout convention (`max-w-2xl space-y-8 p-5 py-10`, `font-display text-2xl font-bold` heading) and reuses `dashboard/page.tsx`'s exact `qkit_earn_config` query and `QkitEarnSettings` prop-building unchanged — only the surrounding page shell (a plain section instead of a `<details>`) is new.

- [ ] **Step 2: Remove the qkit-integration block from the dashboard page**

In `src/app/dashboard/page.tsx`:

1. Delete the import `import { QkitEarnSettings } from "@/app/dashboard/qkit-earn-settings";` (line 17).
2. Delete the `qkitEarnConfig` query (lines 34-38: `const { data: qkitEarnConfig } = await supabase...`).
3. Simplify `const [pro, supabase] = await Promise.all([isPro(), createServerClient()]);` (line 33) to `const pro = await isPro();` — `supabase` was only fetched for the now-deleted query; confirm no other use of `supabase` remains in this file before removing it (it is not used elsewhere in `dashboard/page.tsx`).
4. Delete the trailing `<details className="group ...">...</details>` block (lines 83-106).

- [ ] **Step 3: Add the Settings link to the account dropdown**

In `src/app/dashboard/dashboard-nav.tsx`:

1. Add `Settings` to the existing lucide-react import (line 7):

```tsx
import { LogOut, Menu, Settings, User, Wallet, X } from "lucide-react";
```

2. Insert a new `DropdownMenuItem` between the existing Plan item (lines 177-182) and Profile item (lines 183-188):

```tsx
<DropdownMenuItem asChild>
  <Link href="/dashboard/plan" className="cursor-pointer">
    <Wallet className="size-4" />
    Plan
  </Link>
</DropdownMenuItem>
<DropdownMenuItem asChild>
  <Link href="/dashboard/settings" className="cursor-pointer">
    <Settings className="size-4" />
    Settings
  </Link>
</DropdownMenuItem>
<DropdownMenuItem asChild>
  <Link href="/dashboard/profile" className="cursor-pointer">
    <User className="size-4" />
    Profile
  </Link>
</DropdownMenuItem>
```

- [ ] **Step 4: Update the dropdown test**

In `src/app/dashboard/dashboard-nav.dom.test.tsx`, extend the existing test at line 67 to also assert Settings is present:

```tsx
it("account menu has Plan, Settings, Profile, Sign out, and no separate Customers item", async () => {
  const user = userEvent.setup();
  render(<DashboardNav {...baseProps} />);
  const accountButton = screen.getByRole("button", {
    name: /account menu/i,
  });
  await user.click(accountButton);
  expect(screen.getByText("Plan")).toBeInTheDocument();
  expect(screen.getByText("Settings")).toBeInTheDocument();
  expect(screen.getByText("Profile")).toBeInTheDocument();
  expect(screen.getByText("Sign out")).toBeInTheDocument();
  // "Customers" appears exactly once — the inline nav link (asserted by
  // role "link" above) — proving the account-dropdown item was removed,
  // not merely hidden.
  expect(screen.getAllByText("Customers")).toHaveLength(1);
});
```

(Rename the `it(...)` title as shown; the assertions inside are the only change — add the `screen.getByText("Settings")` line.)

- [ ] **Step 5: Update the revalidate path**

In `src/app/dashboard/actions.ts`, in `saveQkitEarnConfigAction` (around line 441), change:

```ts
revalidatePath("/dashboard");
return { success: true, enabled, programId };
```

to:

```ts
revalidatePath("/dashboard/settings");
return { success: true, enabled, programId };
```

- [ ] **Step 6: Run the full test suite and typecheck**

Run: `pnpm check && pnpm test`
Expected: All pass.

- [ ] **Step 7: Manually verify in the running app**

Run: `pnpm dev`, sign in, open the account dropdown (avatar button, top right) — confirm "Settings" appears between "Plan" and "Profile". Click it, land on `/dashboard/settings`, confirm the qkit-integration form renders and still saves correctly (toggle the checkbox, pick a program, Save, reload, confirm it persisted). Visit `/dashboard` and confirm the qkit-integration `<details>` section is gone from the dashboard body.

- [ ] **Step 8: Commit**

```bash
git add src/app/dashboard/settings/page.tsx src/app/dashboard/page.tsx src/app/dashboard/dashboard-nav.tsx src/app/dashboard/dashboard-nav.dom.test.tsx src/app/dashboard/actions.ts
git commit -m "feat: move qkit-integration settings to a dedicated /dashboard/settings page"
```

---

### Task 3: Shorten the browser tab title

**Files:**

- Modify: `src/app/layout.tsx:32-36`

**Interfaces:**

- None — this task touches only the `metadata` export's `title` field, consumed by no other task.

- [ ] **Step 1: Change the title**

In `src/app/layout.tsx`, change:

```tsx
export const metadata: Metadata = {
  title: "loopkit — turn one-time buyers into regulars",
  description:
    "A digital stamp card for Singapore's small food vendors. Stamp customers by phone number, reward the regulars — no app for them to download.",
};
```

to:

```tsx
export const metadata: Metadata = {
  title: "loopkit: stamp cards",
  description:
    "A digital stamp card for Singapore's small food vendors. Stamp customers by phone number, reward the regulars — no app for them to download.",
};
```

- [ ] **Step 2: Run typecheck**

Run: `pnpm check`
Expected: PASS (no test covers `metadata.title` today — this is a static export with no dedicated test precedent in this repo, matching how the previous title had none either).

- [ ] **Step 3: Manually verify in the running app**

Run: `pnpm dev`, open any page, confirm the browser tab reads "loopkit: stamp cards".

- [ ] **Step 4: Commit**

```bash
git add src/app/layout.tsx
git commit -m "fix: shorten browser tab title to match qkit's format"
```
