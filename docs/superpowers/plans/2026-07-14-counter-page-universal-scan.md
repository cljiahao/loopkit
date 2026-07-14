# Counter page + universal QR scan Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move add-stamp/lookup off the dashboard cards onto a dedicated per-program Counter page (back button, qkit-style), and make QR scanning program-agnostic — scan any customer's card from anywhere and land on the right program's Counter automatically.

**Architecture:** `card_by_token` (the RPC behind scanning) already resolves `program_id` from the token alone — today's `resolveTokenAction` throws it away. This plan surfaces that field end to end: `ScanButton` is generalized to hand back `{ phone, programId }` instead of just `phone`, then reused in two places — inside the new Counter page's `ServeCustomer` (redirects if the scanned card is for a different program) and in a new program-agnostic entry point on `/dashboard` (always redirects to the resolved program's Counter). No RPC/schema changes.

**Tech Stack:** Next.js 16 App Router, React Server + Client Components, TypeScript strict, Vitest + Testing Library (jsdom).

## Global Constraints

- TypeScript strict — no `any`, no `@ts-ignore` (repo-wide rule, `loopkit/AGENTS.md`).
- No Supabase migrations, RLS changes, or RPCs — `card_by_token` already returns `program_id` (confirmed in `src/lib/types.ts`'s `Functions.card_by_token.Returns`); this plan only wires an already-available field through the application layer.
- `ServeCustomer`'s internal serve/lookup/redeem/regenerate logic is unchanged — only its phone input gains an optional pre-fill and its `ScanButton` usage gains a mismatch check.
- Every new/changed component file gets a co-located `*.dom.test.tsx`; every changed server action gets its existing test file extended (`test/app/resolve-token-action.test.ts`).
- Run `pnpm check` (prettier + eslint + tsc) and `pnpm test` before each commit — **every task's commit must leave the build typechecking clean**, even mid-plan. Do not split a prop-signature change from its one consumer across two commits in a way that leaves the build red in between.

---

## File Structure

- **Modify** `src/app/dashboard/scan-button.tsx` — generalize the callback from `onScanned: (phone: string) => void` to `onResolved: (result: { phone: string; programId: string }) => void`, add an optional `label` prop (default `"Scan to serve"`).
- **Create** `src/app/dashboard/scan-button.dom.test.tsx` — light render tests (default label, custom label).
- **Modify** `src/app/dashboard/actions.ts` — `resolveTokenAction` returns `programId` alongside `phone`.
- **Modify** `test/app/resolve-token-action.test.ts` — assert `programId` in the success case.
- **Modify** `src/app/dashboard/serve-customer.tsx` — update its `ScanButton` usage to the new `onResolved` shape with a mismatch-redirect (its only consumer, updated in the same task as the signature change so the build never goes red).
- **Modify** `test/app/serve-customer.test.tsx` — mock `ScanButton` to exercise the match/mismatch branches; extend the `next/navigation` mock with `push`.
- **Create** `src/components/back-button.tsx` — shared component, mirrors qkit's exact pattern.
- **Create** `src/components/back-button.dom.test.tsx`.
- **Create** `src/app/dashboard/counter/page.tsx` — new `?p=<id>` page: back button, program header, `ServeCustomer`.
- **Create** `src/app/dashboard/counter/counter-page.dom.test.tsx`.
- **Modify** `src/app/dashboard/serve-customer.tsx` (again, additive) — add optional `initialPhone` prop (pre-fills the phone input, no auto-submit).
- **Modify** `src/app/dashboard/program-card.tsx` — remove the embedded `<ServeCustomer>`, replace with an "Open Counter" link to `/dashboard/counter?p=<id>`.
- **Modify** `src/app/dashboard/program-card.dom.test.tsx` — remove the ServeCustomer-specific test and its `next/navigation` mock (no longer needed — `ProgramCard` no longer renders anything that calls `useRouter`); add an Open-Counter-link test.
- **Create** `src/app/dashboard/scan-and-route.tsx` — client component wrapping `ScanButton`, program-agnostic, always redirects to the resolved program's Counter.
- **Create** `src/app/dashboard/scan-and-route.dom.test.tsx`.
- **Modify** `src/app/dashboard/page.tsx` — render `<ScanAndRoute />` above the card grid.

No changes to: `src/lib/types.ts` (the `card_by_token` RPC type already includes `program_id`), any Supabase migration, `src/lib/program.ts`, `src/app/dashboard/redeem-button.tsx`, any of the 6 program-type engine files.

---

## Task 1: Generalize `ScanButton` end to end (its one consumer included)

**Files:**

- Modify: `src/app/dashboard/scan-button.tsx`
- Create: `src/app/dashboard/scan-button.dom.test.tsx`
- Modify: `src/app/dashboard/actions.ts`
- Modify: `test/app/resolve-token-action.test.ts`
- Modify: `src/app/dashboard/serve-customer.tsx`
- Modify: `test/app/serve-customer.test.tsx`

**Interfaces:**

- Produces: `ScanButton(props: { label?: string; onResolved: (result: { phone: string; programId: string }) => void })` — replaces the old `{ onScanned: (phone: string) => void }` signature. `resolveTokenAction(formData: FormData): Promise<ActionResult<{ phone: string; programId: string }>>` — the `programId` field is new; `phone` is unchanged.
- Consumes: `card_by_token`'s RPC row already includes `program_id` (`src/lib/types.ts` — no change needed there).

This task rewires `ScanButton`'s only consumer (`ServeCustomer`) in the same commit as the signature change, so the build never typechecks red between commits. Task 2 later adds a _second_, purely additive change to `serve-customer.tsx` (the `initialPhone` prop) — unrelated to this task's edits, no conflict.

- [ ] **Step 1: Write the failing test for `resolveTokenAction`**

Replace the first test in `test/app/resolve-token-action.test.ts` (the file already exists — only this one `it` block changes, the other two stay as-is):

```ts
it("returns the phone and programId for a token the vendor owns", async () => {
  rpcMock.mockResolvedValue({
    data: [{ program_id: "p", card_id: "c", phone: "+6591234567" }],
    error: null,
  });
  const res = await resolveTokenAction(fd("tok"));
  expect(res).toEqual({
    success: true,
    phone: "+6591234567",
    programId: "p",
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test resolve-token-action.test.ts`
Expected: FAIL — current `resolveTokenAction` returns `{ success: true, phone: row.phone }`, missing `programId`.

- [ ] **Step 3: Update `resolveTokenAction`**

In `src/app/dashboard/actions.ts`, find:

```ts
export async function resolveTokenAction(
  formData: FormData,
): Promise<ActionResult<{ phone: string }>> {
```

Replace with:

```ts
export async function resolveTokenAction(
  formData: FormData,
): Promise<ActionResult<{ phone: string; programId: string }>> {
```

Find the return statement at the end of the function:

```ts
  const row = data?.[0];
  if (!row) return { success: false, error: "That card isn't for this shop." };
  return { success: true, phone: row.phone };
}
```

Replace with:

```ts
  const row = data?.[0];
  if (!row) return { success: false, error: "That card isn't for this shop." };
  return { success: true, phone: row.phone, programId: row.program_id };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test resolve-token-action.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Write the failing test for `ScanButton`**

Create `src/app/dashboard/scan-button.dom.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ScanButton } from "./scan-button";

vi.mock("@/app/dashboard/actions", () => ({ resolveTokenAction: vi.fn() }));

describe("ScanButton", () => {
  it("renders the default label", () => {
    render(<ScanButton onResolved={vi.fn()} />);
    expect(
      screen.getByRole("button", { name: /scan to serve/i }),
    ).toBeInTheDocument();
  });

  it("renders a custom label when provided", () => {
    render(<ScanButton label="Scan a customer" onResolved={vi.fn()} />);
    expect(
      screen.getByRole("button", { name: /scan a customer/i }),
    ).toBeInTheDocument();
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `pnpm test scan-button.dom.test.tsx`
Expected: FAIL — `ScanButton` doesn't accept a `label` prop yet, and its hardcoded text is "Scan to serve" regardless.

- [ ] **Step 7: Rewrite `scan-button.tsx`**

Replace the whole file:

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Camera, X } from "lucide-react";
import { resolveTokenAction } from "@/app/dashboard/actions";
import { Button } from "@/components/ui/button";

export function ScanButton({
  label = "Scan to serve",
  onResolved,
}: {
  label?: string;
  onResolved: (result: { phone: string; programId: string }) => void;
}) {
  const [open, setOpen] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    let stop: (() => void) | undefined;
    (async () => {
      try {
        const { BrowserQRCodeReader } = await import("@zxing/browser");
        const reader = new BrowserQRCodeReader();
        const controls = await reader.decodeFromVideoDevice(
          undefined,
          videoRef.current ?? undefined,
          async (result) => {
            if (!result || cancelled) return;
            cancelled = true;
            controls.stop();
            const fd = new FormData();
            fd.set("token", result.getText());
            const res = await resolveTokenAction(fd);
            if (res.success) {
              onResolved({ phone: res.phone, programId: res.programId });
              setOpen(false);
            } else {
              toast.error(res.error);
              setOpen(false);
            }
          },
        );
        stop = () => controls.stop();
      } catch {
        toast.error("Couldn't open the camera. Check permissions.");
        setOpen(false);
      }
    })();
    return () => {
      cancelled = true;
      stop?.();
    };
  }, [open, onResolved]);

  return (
    <>
      <Button
        type="button"
        size="lg"
        onClick={() => setOpen(true)}
        className="h-14 w-full rounded-xl text-base font-semibold"
      >
        <Camera className="size-5" />
        {label}
      </Button>
      {open && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-5 bg-black/90 p-5">
          <video
            ref={videoRef}
            className="w-full max-w-sm rounded-2xl"
            muted
            playsInline
          />
          <p className="text-sm text-white/80">
            Point at the customer&rsquo;s QR code
          </p>
          <Button
            type="button"
            variant="secondary"
            onClick={() => setOpen(false)}
            className="rounded-xl"
          >
            <X className="size-4" /> Cancel
          </Button>
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `pnpm test scan-button.dom.test.tsx`
Expected: PASS (2 tests)

- [ ] **Step 9: Update `ServeCustomer`'s `ScanButton` usage — mismatch redirect**

`ServeCustomer` already imports and calls `useRouter()` (`const router = useRouter();`, used elsewhere in the file for `.refresh()`) — no new import needed, just use `router.push` too.

Find the `<ScanButton>` usage at the top of the returned JSX in `src/app/dashboard/serve-customer.tsx`:

```tsx
<ScanButton
  onScanned={(phone) => {
    if (phoneRef.current) {
      phoneRef.current.value = phone;
      formRef.current?.requestSubmit();
    }
  }}
/>
```

Replace with:

```tsx
<ScanButton
  onResolved={({ phone, programId: scannedProgramId }) => {
    if (scannedProgramId !== programId) {
      router.push(
        `/dashboard/counter?p=${scannedProgramId}&phone=${encodeURIComponent(phone)}`,
      );
      return;
    }
    if (phoneRef.current) {
      phoneRef.current.value = phone;
      formRef.current?.requestSubmit();
    }
  }}
/>
```

This preserves today's exact auto-submit behavior when the scanned card matches the program you're already on, and adds a redirect (no auto-submit — the destination Counter page, built in Task 2, pre-fills only) when it doesn't. The route this redirects to (`/dashboard/counter`) doesn't exist until Task 2 — that's fine, this task's own tests (next step) verify the `router.push` call happens with the right URL, not that the route resolves.

- [ ] **Step 10: Typecheck**

Run: `pnpm check`
Expected: PASS — `serve-customer.tsx` now matches `ScanButton`'s new `onResolved` prop, no leftover `onScanned` reference anywhere in the codebase (grep confirms `ScanButton` has exactly one consumer, this file).

- [ ] **Step 11: Update `serve-customer.test.tsx` for the mismatch/match branches**

Extend the `next/navigation` mock to include `push`:

```tsx
const { routerPush } = vi.hoisted(() => ({ routerPush: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: routerPush }),
}));
```

Add a mock for `ScanButton` right after the existing `vi.mock("sonner", ...)` block, before the `import { ServeCustomer } from ...` line:

```tsx
vi.mock("@/app/dashboard/scan-button", () => ({
  ScanButton: ({
    onResolved,
  }: {
    onResolved: (result: { phone: string; programId: string }) => void;
  }) => (
    <button
      type="button"
      onClick={() => onResolved({ phone: "+6591234567", programId: "p2" })}
    >
      Mock scan
    </button>
  ),
}));
```

Add two new tests at the end of the `describe("ServeCustomer", ...)` block:

```tsx
it("redirects to the scanned card's own Counter page when it belongs to a different program", async () => {
  const user = userEvent.setup();
  render(
    <ServeCustomer
      programId="p1"
      type="stamp"
      stampsRequired={10}
      rewardText="Free kopi"
    />,
  );
  await user.click(screen.getByRole("button", { name: "Mock scan" }));
  expect(routerPush).toHaveBeenCalledWith(
    "/dashboard/counter?p=p2&phone=%2B6591234567",
  );
  expect(stampMock).not.toHaveBeenCalled();
});

it("fills and submits in place when the scanned card matches the current program", async () => {
  stampMock.mockResolvedValue({
    success: true,
    card: { id: "card-1", phone: "+6591234567", stamp_count: 3 },
    rewardReady: false,
  });
  const user = userEvent.setup();
  render(
    <ServeCustomer
      programId="p2"
      type="stamp"
      stampsRequired={10}
      rewardText="Free kopi"
    />,
  );
  await user.click(screen.getByRole("button", { name: "Mock scan" }));
  await waitFor(() => expect(stampMock).toHaveBeenCalled());
  expect(routerPush).not.toHaveBeenCalled();
});
```

- [ ] **Step 12: Run tests to verify they pass**

Run: `pnpm test serve-customer.test.tsx`
Expected: PASS (10 tests — 8 existing + 2 new)

- [ ] **Step 13: Full suite**

Run: `pnpm check && pnpm test`
Expected: no TS errors; full suite passes.

- [ ] **Step 14: Commit**

```bash
git add src/app/dashboard/scan-button.tsx src/app/dashboard/scan-button.dom.test.tsx src/app/dashboard/actions.ts test/app/resolve-token-action.test.ts src/app/dashboard/serve-customer.tsx test/app/serve-customer.test.tsx
git commit -m "feat(dashboard): surface programId from card scans, add scan-mismatch redirect"
```

---

## Task 2: Counter page (`BackButton` + route + `initialPhone` pre-fill)

**Files:**

- Create: `src/components/back-button.tsx`
- Create: `src/components/back-button.dom.test.tsx`
- Create: `src/app/dashboard/counter/page.tsx`
- Create: `src/app/dashboard/counter/counter-page.dom.test.tsx`
- Modify: `src/app/dashboard/serve-customer.tsx` (additive — the `initialPhone` prop; unrelated to Task 1's edits to this same file, no conflict)

**Interfaces:**

- Consumes: `PROGRAM_TYPE_BADGE`/`describeProgram` from `src/app/dashboard/program-display.ts` (unchanged, existing). `listPrograms`/`currentProgram` from `@/lib/program` (unchanged, existing). `ServeCustomer` (from Task 1, its `onResolved`/mismatch-redirect already wired).
- Produces: `BackButton(props: { href: string; label: string })`. `ServeCustomer` gains an optional `initialPhone?: string` prop.

- [ ] **Step 1: Write the failing test for `BackButton`**

Create `src/components/back-button.dom.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { BackButton } from "./back-button";

describe("BackButton", () => {
  it("renders the label as a link to href", () => {
    render(<BackButton href="/dashboard" label="Back to dashboard" />);
    expect(
      screen.getByRole("link", { name: /back to dashboard/i }),
    ).toHaveAttribute("href", "/dashboard");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test back-button.dom.test.tsx`
Expected: FAIL with "Cannot find module './back-button'"

- [ ] **Step 3: Write `back-button.tsx`**

Create `src/components/back-button.tsx`:

```tsx
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

// Consistent "leave this page" nav — a real button (proper hit target,
// hover/focus state), not a plain text link that reads as body copy.
// Mirrors qkit's identical component.
export function BackButton({ href, label }: { href: string; label: string }) {
  return (
    <Button asChild variant="ghost" size="sm" className="rounded-lg">
      <Link href={href}>
        <ArrowLeft className="size-4" />
        {label}
      </Link>
    </Button>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test back-button.dom.test.tsx`
Expected: PASS (1 test)

- [ ] **Step 5: Add `initialPhone` to `ServeCustomer`**

In `src/app/dashboard/serve-customer.tsx`, change the props type (find `export function ServeCustomer({` and its type block):

```tsx
export function ServeCustomer({
  programId,
  type,
  stampsRequired,
  rewardText,
  initialPhone,
}: {
  programId: string;
  type: string;
  stampsRequired: number;
  rewardText: string;
  initialPhone?: string;
}) {
```

Find the `<Input>` for the phone field:

```tsx
<Input
  ref={phoneRef}
  id="phone"
  name="phone"
  type="tel"
  required
  placeholder="9123 4567"
  className="h-11 rounded-xl"
/>
```

Add `defaultValue={initialPhone}`:

```tsx
<Input
  ref={phoneRef}
  id="phone"
  name="phone"
  type="tel"
  required
  placeholder="9123 4567"
  defaultValue={initialPhone}
  className="h-11 rounded-xl"
/>
```

- [ ] **Step 6: Typecheck**

Run: `pnpm check`
Expected: PASS.

- [ ] **Step 7: Write the failing test for the Counter page**

Create `src/app/dashboard/counter/counter-page.dom.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/lib/auth", () => ({ requireVendor: vi.fn(async () => ({})) }));
vi.mock("@/lib/program", () => ({
  listPrograms: vi.fn(async () => [
    {
      id: "p1",
      name: "Coffee Stamps",
      type: "stamp",
      stamps_required: 8,
      reward_text: "a free coffee",
      config: {},
      active: true,
      expiry_days: null,
      head_start: false,
      replaced_by: null,
      carry_over_stamps: false,
    },
  ]),
  currentProgram: (programs: { id: string }[], id?: string) =>
    programs.find((p) => p.id === id) ?? null,
}));
vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));
vi.mock("@/app/dashboard/actions", () => ({
  stampAction: vi.fn(),
  recordVisitAction: vi.fn(),
  lookupAction: vi.fn(),
  redeemPlantAction: vi.fn(),
  redeemStreakAction: vi.fn(),
  regenerateCardAction: vi.fn(),
  resolveTokenAction: vi.fn(),
}));

import CounterPage from "./page";

describe("CounterPage", () => {
  it("renders the back button, program header, and phone pre-fill", async () => {
    render(
      await CounterPage({
        searchParams: Promise.resolve({ p: "p1", phone: "+6591234567" }),
      }),
    );
    expect(
      screen.getByRole("link", { name: /back to dashboard/i }),
    ).toHaveAttribute("href", "/dashboard");
    expect(screen.getByText("Coffee Stamps")).toBeInTheDocument();
    expect(screen.getByLabelText("Customer phone")).toHaveValue("+6591234567");
  });
});
```

- [ ] **Step 8: Run test to verify it fails**

Run: `pnpm test counter-page.dom.test.tsx`
Expected: FAIL with "Cannot find module './page'" (the route doesn't exist yet)

- [ ] **Step 9: Write `counter/page.tsx`**

Create `src/app/dashboard/counter/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { requireVendor } from "@/lib/auth";
import { listPrograms, currentProgram } from "@/lib/program";
import {
  PROGRAM_TYPE_BADGE,
  describeProgram,
} from "@/app/dashboard/program-display";
import { ServeCustomer } from "@/app/dashboard/serve-customer";
import { BackButton } from "@/components/back-button";
import { Badge } from "@/components/ui/badge";

type CounterPageProps = {
  searchParams: Promise<{ p?: string; phone?: string }>;
};

export default async function CounterPage({ searchParams }: CounterPageProps) {
  await requireVendor();

  const { p, phone } = await searchParams;
  if (!p) redirect("/dashboard");

  const programs = await listPrograms();
  const program = currentProgram(programs, p);
  if (!program) redirect("/dashboard");

  const badge = PROGRAM_TYPE_BADGE[program.type] ?? PROGRAM_TYPE_BADGE.stamp;

  return (
    <main className="mx-auto max-w-2xl space-y-6 p-5 py-10">
      <BackButton href="/dashboard" label="Back to dashboard" />

      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-bold tracking-tight">{program.name}</h1>
          <Badge variant={badge.variant}>{badge.label}</Badge>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {describeProgram(program)}
        </p>
      </div>

      <ServeCustomer
        programId={program.id}
        type={program.type}
        stampsRequired={program.stamps_required}
        rewardText={program.reward_text}
        initialPhone={phone}
      />
    </main>
  );
}
```

Note: `p` missing, or `p` not matching any of the vendor's programs, both redirect to `/dashboard` (not `/setup`) — unlike Customers/Activity/Stats, Counter has no vendor-level fallback (serving is inherently per-program), so an invalid/missing `p` sends the vendor back to the card grid to pick a program, not to onboarding.

- [ ] **Step 10: Run test to verify it passes**

Run: `pnpm test counter-page.dom.test.tsx`
Expected: PASS (1 test)

- [ ] **Step 11: Typecheck + full suite**

Run: `pnpm check && pnpm test`
Expected: no TS errors; full suite passes.

- [ ] **Step 12: Commit**

```bash
git add src/components/back-button.tsx src/components/back-button.dom.test.tsx src/app/dashboard/counter/page.tsx src/app/dashboard/counter/counter-page.dom.test.tsx src/app/dashboard/serve-customer.tsx
git commit -m "feat(dashboard): add Counter page with back button and phone pre-fill"
```

---

## Task 3: `ProgramCard`'s "Open Counter" link + global scan-and-route

**Files:**

- Modify: `src/app/dashboard/program-card.tsx`
- Modify: `src/app/dashboard/program-card.dom.test.tsx`
- Create: `src/app/dashboard/scan-and-route.tsx`
- Create: `src/app/dashboard/scan-and-route.dom.test.tsx`
- Modify: `src/app/dashboard/page.tsx`

**Interfaces:**

- Consumes: `ScanButton`'s `{ onResolved: (result: { phone: string; programId: string }) => void }` (Task 1). The Counter route `/dashboard/counter?p=<id>` (Task 2).
- Produces: `ScanAndRoute()` — no props, self-contained client component.

- [ ] **Step 1: Write the failing tests for `ProgramCard`**

In `src/app/dashboard/program-card.dom.test.tsx`, remove the `vi.mock("next/navigation", ...)` block at the top (lines 7-12 in the current file — `ProgramCard` no longer renders `ServeCustomer`, so nothing in it calls `useRouter` anymore) and remove the whole `it("renders the ServeCustomer widget for this program", ...)` test at the end. Add this test in its place:

```tsx
it("links Open Counter to /dashboard/counter?p=<id>", () => {
  render(<ProgramCard program={program} stats={stats} />);
  expect(screen.getByRole("link", { name: /open counter/i })).toHaveAttribute(
    "href",
    "/dashboard/counter?p=p1",
  );
});
```

The file's final shape (for reference — the 4 unaffected tests stay exactly as they are today):

```tsx
// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import type { Program } from "@/lib/program";
import type { ProgramStats } from "@/lib/stats";
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
  replaced_by: null,
  carry_over_stamps: false,
};

const stats = { active: 12 } as ProgramStats;

describe("ProgramCard", () => {
  it("renders the program name, type badge, and description", () => {
    render(<ProgramCard program={program} stats={stats} />);
    expect(screen.getByText("Coffee Stamps")).toBeInTheDocument();
    expect(screen.getByText("Stamp")).toBeInTheDocument();
    expect(screen.getByText(/buy 8, get 1 a free coffee/i)).toBeInTheDocument();
  });

  it("links Edit to /setup?edit=<id>", () => {
    render(<ProgramCard program={program} stats={stats} />);
    expect(
      screen.getByRole("link", { name: /edit coffee stamps/i }),
    ).toHaveAttribute("href", "/setup?edit=p1");
  });

  it("shows the active-count stat when stats are available", () => {
    render(<ProgramCard program={program} stats={stats} />);
    expect(screen.getByText(/12 active/i)).toBeInTheDocument();
  });

  it("falls back to a dash when stats are null (fetch failed)", () => {
    render(<ProgramCard program={program} stats={null} />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("scopes footer links to this program via ?p=", () => {
    render(<ProgramCard program={program} stats={stats} />);
    expect(screen.getByRole("link", { name: "Customers" })).toHaveAttribute(
      "href",
      "/dashboard/customers?p=p1",
    );
    expect(screen.getByRole("link", { name: "Activity" })).toHaveAttribute(
      "href",
      "/dashboard/activity?p=p1",
    );
    expect(screen.getByRole("link", { name: "Stats" })).toHaveAttribute(
      "href",
      "/dashboard/stats?p=p1",
    );
  });

  it("links Open Counter to /dashboard/counter?p=<id>", () => {
    render(<ProgramCard program={program} stats={stats} />);
    expect(screen.getByRole("link", { name: /open counter/i })).toHaveAttribute(
      "href",
      "/dashboard/counter?p=p1",
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test program-card.dom.test.tsx`
Expected: FAIL — no "Open Counter" link exists yet; `ServeCustomer`'s phone input is still on the card (the removed test would otherwise still pass, which is fine, but the new test fails).

- [ ] **Step 3: Rewrite `program-card.tsx`**

Replace the whole file:

```tsx
"use client";

import Link from "next/link";
import { Pencil } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PROGRAM_TYPE_BADGE, describeProgram } from "./program-display";
import type { Program } from "@/lib/program";
import type { ProgramStats } from "@/lib/stats";

// One card per active program. Field order is fixed across every card
// (header -> stat -> Open Counter -> footer links) so scanning a grid of
// several cards stays fast regardless of how many a vendor has. Serve/
// lookup lives on the dedicated Counter page now (see
// app/dashboard/counter/page.tsx), not embedded here.
export function ProgramCard({
  program,
  stats,
}: {
  program: Program;
  stats: ProgramStats | null;
}) {
  const badge = PROGRAM_TYPE_BADGE[program.type] ?? PROGRAM_TYPE_BADGE.stamp;
  const scoped = (href: string) => `${href}?p=${program.id}`;

  return (
    <div className="flex flex-col gap-4 rounded-2xl border bg-card p-5 shadow-sm">
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
        </div>
        <Link
          href={`/setup?edit=${program.id}`}
          aria-label={`Edit ${program.name}`}
          className="shrink-0 rounded-lg p-1.5 text-muted-foreground outline-none transition-colors hover:bg-secondary hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          <Pencil className="size-4" />
        </Link>
      </div>

      <p className="text-xs font-medium text-muted-foreground">
        {stats ? `${stats.active} active (30d)` : "—"}
      </p>

      <Button asChild className="h-11 w-full rounded-xl font-semibold">
        <Link href={scoped("/dashboard/counter")}>Open Counter</Link>
      </Button>

      <div className="flex gap-4 border-t pt-3 text-sm font-medium text-muted-foreground">
        <Link
          href={scoped("/dashboard/customers")}
          className="hover:text-foreground"
        >
          Customers
        </Link>
        <Link
          href={scoped("/dashboard/activity")}
          className="hover:text-foreground"
        >
          Activity
        </Link>
        <Link
          href={scoped("/dashboard/stats")}
          className="hover:text-foreground"
        >
          Stats
        </Link>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test program-card.dom.test.tsx`
Expected: PASS (5 tests)

- [ ] **Step 5: Write the failing tests for `ScanAndRoute`**

Create `src/app/dashboard/scan-and-route.dom.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { routerPush } = vi.hoisted(() => ({ routerPush: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: routerPush }),
}));

vi.mock("@/app/dashboard/scan-button", () => ({
  ScanButton: ({
    label,
    onResolved,
  }: {
    label?: string;
    onResolved: (result: { phone: string; programId: string }) => void;
  }) => (
    <button
      type="button"
      onClick={() => onResolved({ phone: "+6591234567", programId: "p9" })}
    >
      {label}
    </button>
  ),
}));

import { ScanAndRoute } from "./scan-and-route";

describe("ScanAndRoute", () => {
  it("passes the 'Scan a customer' label to ScanButton", () => {
    render(<ScanAndRoute />);
    expect(
      screen.getByRole("button", { name: "Scan a customer" }),
    ).toBeInTheDocument();
  });

  it("routes to the resolved card's Counter page with phone pre-filled", async () => {
    const user = userEvent.setup();
    render(<ScanAndRoute />);
    await user.click(screen.getByRole("button", { name: "Scan a customer" }));
    expect(routerPush).toHaveBeenCalledWith(
      "/dashboard/counter?p=p9&phone=%2B6591234567",
    );
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `pnpm test scan-and-route.dom.test.tsx`
Expected: FAIL with "Cannot find module './scan-and-route'"

- [ ] **Step 7: Write `scan-and-route.tsx`**

Create `src/app/dashboard/scan-and-route.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { ScanButton } from "@/app/dashboard/scan-button";

// Program-agnostic entry point: scans any of the vendor's cards and routes
// straight to that card's own program's Counter, phone pre-filled — no
// need to already be on the right program's card to serve a customer.
export function ScanAndRoute() {
  const router = useRouter();
  return (
    <ScanButton
      label="Scan a customer"
      onResolved={({ phone, programId }) => {
        router.push(
          `/dashboard/counter?p=${programId}&phone=${encodeURIComponent(phone)}`,
        );
      }}
    />
  );
}
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `pnpm test scan-and-route.dom.test.tsx`
Expected: PASS (2 tests)

- [ ] **Step 9: Wire `ScanAndRoute` into `dashboard/page.tsx`**

In `src/app/dashboard/page.tsx`, add the import alongside the other `@/app/dashboard/*` imports:

```tsx
import { ScanAndRoute } from "@/app/dashboard/scan-and-route";
```

Find the block that renders `<ShopQrBlock ... />` followed by the grid `<div>`:

```tsx
          <ShopQrBlock
            qrSvgMarkup={cardQr}
            link={cardLink}
            programNames={activePrograms.map((prog) => prog.name)}
          />

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
```

Insert `<ScanAndRoute />` between them:

```tsx
          <ShopQrBlock
            qrSvgMarkup={cardQr}
            link={cardLink}
            programNames={activePrograms.map((prog) => prog.name)}
          />

          <ScanAndRoute />

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
```

- [ ] **Step 10: Typecheck + full suite**

Run: `pnpm check && pnpm test`
Expected: no TS errors; full suite passes.

- [ ] **Step 11: Manual smoke test**

Run: `pnpm dev`, sign in as a vendor with 2+ active programs.

Check:

- `/dashboard` shows a "Scan a customer" button above the card grid, and each card shows "Open Counter" instead of the inline serve form.
- Clicking "Open Counter" on a card lands on `/dashboard/counter?p=<id>` with a working back button, correct program name/badge, and the full `ServeCustomer` widget (stamp/lookup/redeem all work exactly as before, just relocated).
- From the Counter page, scanning a card that belongs to a _different_ program redirects to that program's Counter page with the phone pre-filled (not auto-submitted).
- From `/dashboard`'s new global "Scan a customer" button, scanning any card lands directly on the correct program's Counter page, phone pre-filled.

- [ ] **Step 12: Commit**

```bash
git add src/app/dashboard/program-card.tsx src/app/dashboard/program-card.dom.test.tsx src/app/dashboard/scan-and-route.tsx src/app/dashboard/scan-and-route.dom.test.tsx src/app/dashboard/page.tsx
git commit -m "feat(dashboard): ProgramCard Open Counter link + global scan-and-route entry point"
```

---

## Self-Review

**Spec coverage:**

- `resolveTokenAction`/`ScanButton` surface `programId` → Task 1.
- Mismatch redirect on the Counter page's own scan button → Task 1 (`ServeCustomer`'s `onResolved` handler — built ahead of the Counter route existing, verified via the `router.push` call itself, not a live route).
- New Counter page (`?p=<id>`, back button, program header, `ServeCustomer`) → Task 2.
- Counter page pre-fills phone from `?phone=`, does not auto-submit → Task 2 (`initialPhone` prop, plain `defaultValue`, no `requestSubmit()` call in the page itself).
- `ProgramCard` drops embedded serve widget, gains "Open Counter" link → Task 3.
- Global program-agnostic scan entry point on `/dashboard` → Task 3 (`ScanAndRoute`).
- No RPC/migration changes → confirmed throughout, `card_by_token`'s existing `Returns` type already covers this.
- Stamp redeem-carryover → out of scope (Spec C), untouched.

**Placeholder scan:** no TBD/TODO; every step has complete code.

**Build-integrity check (self-correction applied):** the initial draft of this plan split `ScanButton`'s signature change (Task 1) from its one consumer's update (originally Task 2), leaving the build typechecking red between the two commits — a direct violation of this plan's own "run `pnpm check` before each commit" constraint. Fixed by moving `ServeCustomer`'s `ScanButton` usage and mismatch-redirect into Task 1 itself, so the signature change and its only consumer land in one commit. Task 2's separate edit to the same file (`initialPhone`) is additive and independent — no conflict with Task 1's edit.

**Type consistency:** `ScanButton`'s `onResolved` signature (`{ phone: string; programId: string }`, Task 1) is consumed identically in `ServeCustomer` (Task 1) and `ScanAndRoute` (Task 3) — same field names throughout. `resolveTokenAction`'s new `programId` field (Task 1) matches what `ScanButton` reads off it (`res.programId`, Task 1) and what the Counter page route expects in its query string (`?p=${programId}`, used consistently in Task 1's redirect and Task 3's `ScanAndRoute`). `BackButton`'s props (`href`, `label`) match its one call site in the Counter page (Task 2) exactly.
