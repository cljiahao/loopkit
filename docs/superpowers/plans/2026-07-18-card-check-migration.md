# `features/card-check` Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate loopkit's public card-check flow (`src/app/c/*`) into a templateCentral-style `src/features/card-check/` folder, per `docs/superpowers/specs/2026-07-18-card-check-migration-design.md`, closing two pre-existing test-coverage gaps (`check-form.tsx`, `regenerateCardAction`) along the way instead of as a follow-up.

**Architecture:** Build the new `src/features/card-check/` structure first (`types.ts`, `api/`, `components/`, `index.ts`) alongside the untouched old `src/app/c/*` files — every intermediate task keeps the app buildable and fully tested, and each new file's tests are written test-first against the new location. Unlike Phase 1 (`features/auth`), nothing outside `src/app/c/` imports from it, so there is no external sweep task: a single cutover task turns `src/app/c/page.tsx` into a thin wrapper and deletes the old files, and it stays typecheck-clean throughout (no broken intermediate commit needed, since there's nothing external to repoint).

**Tech Stack:** Next.js 16 App Router · TypeScript strict · `@supabase/ssr` · Vitest · `vi.hoisted` + `vi.mock` (this repo's established mocking style) · `@testing-library/react` + `@testing-library/user-event` · pnpm.

## Global Constraints

- TypeScript strict — no `any`, no `@ts-ignore`.
- This is a pure code-location migration — zero behavioral changes to the check/enroll/regenerate flow.
- `src/app/dashboard/serve-customer.tsx` (the vendor-side counter scan/stamp flow) is **not** part of this migration despite the similar name — different feature, later phase.
- The `vendor_active_programs` RPC call in `page.tsx` stays in the route file — it's page-specific (resolves which programs to show before the customer types anything), not part of `checkStatusAction`'s enroll flow.
- External consumers import only from `@/features/card-check` (the barrel `index.ts`) — never reach into `@/features/card-check/api/*` or `@/features/card-check/components/*` directly. The barrel exports `CheckForm` only.
- Follow this repo's existing `vi.hoisted` + `vi.mock` mocking style in every test — see `test/app/check-status-action.test.ts` (Supabase RPC mocking) and `src/features/auth/components/login-form.dom.test.tsx` (sibling-server-action mocking) for the canonical patterns.
- Per the established per-folder README convention (rich mode): every new/changed folder gets an accurate `README.md`, enforced by the `readme-freshness` CI gate — not optional polish, a PR without it fails CI.
- Run `pnpm check && pnpm test` after every task; commit after every task.
- Work happens in a git worktree (this repo's established convention, e.g. `.claude/worktrees/card-check-migration`) on a feature branch — `main` hard-blocks direct commits via the lefthook + PreToolUse hooks.

---

## Task 1: `features/card-check/types.ts`

**Files:**

- Create: `src/features/card-check/types.ts`

**Interfaces:**

- Produces: type `CardStatus`, type `StatusState`, constant `STATUS_IDLE: StatusState` — consumed by Task 2 (`api/actions.ts`) and Task 3 (`components/*.tsx`). `src/app/c/status-state.ts` (the old location) is untouched by this task.

This file is a verbatim copy with no import-path changes — `status-state.ts` today only imports from `@/lib/engine/types`, an absolute path unaffected by the move.

- [ ] **Step 1: Create the file**

```typescript
// src/features/card-check/types.ts
import type { ProgressView } from "@/lib/engine/types";

// Shared client/server state type for the public card-check form. A
// "use server" module may only export async functions, so this plain module
// is what both actions.ts and check-form.tsx import.
export type CardStatus = {
  programId: string;
  name: string;
  label: string;
  view: ProgressView;
  rewardReady: boolean;
  reward_text: string;
  qr: string;
  expired: boolean;
  active: boolean;
  replacedByName: string | null;
  carriedOverCount: number | null;
};

export type StatusState = {
  status: "idle" | "found" | "none" | "error";
  cards?: CardStatus[];
  message?: string;
  phone?: string;
};

export const STATUS_IDLE: StatusState = { status: "idle" };
```

- [ ] **Step 2: Typecheck**

Run: `pnpm tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Confirm the old file is untouched**

Run: `git status --porcelain src/app/c/status-state.ts`
Expected: no output

- [ ] **Step 4: Commit**

```bash
git add src/features/card-check/types.ts
git commit -m "feat: add features/card-check/types.ts alongside the existing src/app/c/status-state.ts"
```

---

## Task 2: `features/card-check/api/actions.ts` + its tests (moved + new)

**Files:**

- Create: `src/features/card-check/api/actions.ts`
- Create: `test/features/card-check/actions.test.ts`

**Interfaces:**

- Consumes: `CardStatus`, `StatusState` from `../types` (Task 1).
- Produces: `checkStatusAction(prevState: StatusState, formData: FormData): Promise<StatusState>`, `regenerateCardAction(formData: FormData): Promise<ActionResult<{ phone: string }>>` — both consumed by Task 3 (`components/*.tsx`) and Task 4 (barrel). `src/app/c/actions.ts` (the old location) and `test/app/check-status-action.test.ts` (the old test) are untouched by this task.

- [ ] **Step 1: Write the failing test — moves `test/app/check-status-action.test.ts`'s 12 existing tests to the new import paths, and adds new tests for `regenerateCardAction` and the rate-limit branch (both currently untested at the old location)**

```typescript
// test/features/card-check/actions.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const { rpcMock, allowRequestMock } = vi.hoisted(() => ({
  rpcMock: vi.fn(),
  allowRequestMock: vi.fn(async () => true),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerClient: vi.fn(async () => ({ rpc: rpcMock })),
}));

vi.mock("@/lib/qr", () => ({
  qrSvg: vi.fn(async (text: string) => `<svg data-token="${text}"></svg>`),
}));

vi.mock("@/lib/rate-limit", () => ({
  allowRequest: allowRequestMock,
}));

import {
  checkStatusAction,
  regenerateCardAction,
} from "@/features/card-check/api/actions";
import { STATUS_IDLE } from "@/features/card-check/types";

function form(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

function mockJoin(rows: unknown[]) {
  rpcMock.mockImplementation((fn: string) => {
    if (fn === "vendor_join")
      return Promise.resolve({ data: rows, error: null });
    return Promise.resolve({ data: null, error: null });
  });
}

function mockRegenerate(card: unknown) {
  rpcMock.mockImplementation((fn: string) => {
    if (fn === "regenerate_card")
      return Promise.resolve({ data: card, error: null });
    return Promise.resolve({ data: null, error: null });
  });
}

describe("checkStatusAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    allowRequestMock.mockResolvedValue(true);
  });

  it("rejects an invalid phone without calling the RPC", async () => {
    const result = await checkStatusAction(
      STATUS_IDLE,
      form({ vendor: "v1", phone: "not-a-phone" }),
    );

    expect(result).toEqual({
      status: "error",
      message: "Enter a valid Singapore phone number.",
    });
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("rejects a missing vendor without calling the RPC", async () => {
    const result = await checkStatusAction(
      STATUS_IDLE,
      form({ vendor: "", phone: "91234567" }),
    );

    expect(result).toEqual({ status: "error", message: "Missing shop." });
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("returns a rate-limit error without calling the RPC when too many attempts have been made", async () => {
    allowRequestMock.mockResolvedValue(false);
    const result = await checkStatusAction(
      STATUS_IDLE,
      form({ vendor: "v1", phone: "91234567" }),
    );

    expect(result).toEqual({
      status: "error",
      message: "Too many attempts — try again in a minute.",
    });
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("calls vendor_join with the normalized phone", async () => {
    mockJoin([
      {
        program_id: "p1",
        name: "Kaya Toast Co.",
        type: "stamp",
        config: {},
        state: {},
        stamp_count: 3,
        card_token: "tok_abc",
        reward_text: "Free kopi",
        stamps_required: 10,
        expiry_days: null,
        cycle_started_at: null,
        active: true,
      },
    ]);

    await checkStatusAction(
      STATUS_IDLE,
      form({ vendor: "v1", phone: "9123 4567" }),
    );

    expect(rpcMock).toHaveBeenCalledWith("vendor_join", {
      p_vendor: "v1",
      p_phone: "+6591234567",
    });
  });

  it("returns one card per row, reading stamp_count not the (empty) state blob", async () => {
    mockJoin([
      {
        program_id: "p1",
        name: "Kaya Toast Co.",
        type: "stamp",
        config: {},
        state: {},
        stamp_count: 3,
        card_token: "tok_abc",
        reward_text: "Free kopi",
        stamps_required: 10,
        expiry_days: null,
        cycle_started_at: null,
        active: true,
      },
    ]);

    const result = await checkStatusAction(
      STATUS_IDLE,
      form({ vendor: "v1", phone: "91234567" }),
    );

    expect(result).toEqual({
      status: "found",
      phone: "+6591234567",
      cards: [
        {
          programId: "p1",
          name: "Kaya Toast Co.",
          label: "3/10 stamps",
          view: { kind: "dots", filled: 3, total: 10, variant: "dots" },
          rewardReady: false,
          reward_text: "Free kopi",
          qr: '<svg data-token="tok_abc"></svg>',
          expired: false,
          active: true,
          replacedByName: null,
          carriedOverCount: null,
        },
      ],
    });
  });

  it("returns multiple cards when the phone has more than one program at this vendor", async () => {
    mockJoin([
      {
        program_id: "p1",
        name: "Stamp Card",
        type: "stamp",
        config: {},
        state: {},
        stamp_count: 2,
        card_token: "tok_1",
        reward_text: "Free kopi",
        stamps_required: 8,
        expiry_days: null,
        cycle_started_at: null,
        active: true,
      },
      {
        program_id: "p2",
        name: "Grow-a-kopi",
        type: "plant",
        config: {
          stages: [
            { name: "Seed", threshold: 0 },
            { name: "Sprout", threshold: 1 },
            { name: "Leafing", threshold: 2 },
            { name: "Budding", threshold: 3 },
            { name: "Bloom", threshold: 4 },
          ],
          growth_per_visit: 1,
          grace_days: 5,
          decay_rate: 0.5,
          floor_growth: 1,
          reward_text: "Free set",
        },
        state: {
          growth: 1,
          last_visit_at: "2026-07-01T00:00:00Z",
          blooms: 0,
          bloomed: false,
        },
        stamp_count: 0,
        card_token: "tok_2",
        reward_text: "Free set",
        stamps_required: 4,
        expiry_days: null,
        cycle_started_at: null,
        active: true,
      },
    ]);

    const result = await checkStatusAction(
      STATUS_IDLE,
      form({ vendor: "v1", phone: "91234567" }),
    );

    expect(result.status).toBe("found");
    expect(result.cards).toHaveLength(2);
    expect(result.cards?.map((c) => c.programId)).toEqual(["p1", "p2"]);
  });

  it("marks a card inactive when its program is no longer active, without dropping it", async () => {
    mockJoin([
      {
        program_id: "p1",
        name: "Old Program",
        type: "stamp",
        config: {},
        state: {},
        stamp_count: 5,
        card_token: "tok_1",
        reward_text: "Free item",
        stamps_required: 10,
        expiry_days: null,
        cycle_started_at: null,
        active: false,
      },
    ]);

    const result = await checkStatusAction(
      STATUS_IDLE,
      form({ vendor: "v1", phone: "91234567" }),
    );

    expect(result.cards?.[0].active).toBe(false);
  });

  it("surfaces the replacement program's name on a retired card", async () => {
    mockJoin([
      {
        program_id: "p1",
        name: "Old Program",
        type: "stamp",
        config: {},
        state: {},
        stamp_count: 5,
        card_token: "tok_1",
        reward_text: "Free item",
        stamps_required: 10,
        expiry_days: null,
        cycle_started_at: null,
        active: false,
        replaced_by_name: "Weekly Regular",
      },
    ]);

    const result = await checkStatusAction(
      STATUS_IDLE,
      form({ vendor: "v1", phone: "91234567" }),
    );

    expect(result.cards?.[0].replacedByName).toBe("Weekly Regular");
  });

  it("surfaces how many stamps carried over onto the replacement card", async () => {
    mockJoin([
      {
        program_id: "p1",
        name: "Old Program",
        type: "stamp",
        config: {},
        state: {},
        stamp_count: 5,
        card_token: "tok_1",
        reward_text: "Free item",
        stamps_required: 10,
        expiry_days: null,
        cycle_started_at: null,
        active: false,
        replaced_by_name: "Weekly Regular",
        replaced_by_stamp_count: 6,
      },
    ]);

    const result = await checkStatusAction(
      STATUS_IDLE,
      form({ vendor: "v1", phone: "91234567" }),
    );

    expect(result.cards?.[0].carriedOverCount).toBe(6);
  });

  it("reports no carried-over count when the replacement card has zero stamps (or none exists)", async () => {
    mockJoin([
      {
        program_id: "p1",
        name: "Old Program",
        type: "stamp",
        config: {},
        state: {},
        stamp_count: 5,
        card_token: "tok_1",
        reward_text: "Free item",
        stamps_required: 10,
        expiry_days: null,
        cycle_started_at: null,
        active: false,
        replaced_by_name: "Weekly Regular",
        replaced_by_stamp_count: 0,
      },
    ]);

    const result = await checkStatusAction(
      STATUS_IDLE,
      form({ vendor: "v1", phone: "91234567" }),
    );

    expect(result.cards?.[0].carriedOverCount).toBeNull();
  });

  it("reports expired once a card's expiry window has elapsed", async () => {
    mockJoin([
      {
        program_id: "p1",
        name: "Kaya Toast Co.",
        type: "stamp",
        config: {},
        state: {},
        stamp_count: 3,
        card_token: "tok_abc",
        reward_text: "Free kopi",
        stamps_required: 10,
        expiry_days: 30,
        cycle_started_at: "2020-01-01T00:00:00Z",
        active: true,
      },
    ]);

    const result = await checkStatusAction(
      STATUS_IDLE,
      form({ vendor: "v1", phone: "91234567" }),
    );

    expect(result.cards?.[0].expired).toBe(true);
  });

  it("reports none when vendor_join returns no rows", async () => {
    mockJoin([]);

    const result = await checkStatusAction(
      STATUS_IDLE,
      form({ vendor: "bad-vendor", phone: "91234567" }),
    );

    expect(result).toEqual({
      status: "none",
      message: "We couldn't find any rewards here.",
    });
  });

  it("reports an error when vendor_join fails", async () => {
    rpcMock.mockImplementation(() =>
      Promise.resolve({ data: null, error: { message: "db down" } }),
    );

    const result = await checkStatusAction(
      STATUS_IDLE,
      form({ vendor: "v1", phone: "91234567" }),
    );

    expect(result).toEqual({
      status: "error",
      message: "Something went wrong.",
    });
  });
});

describe("regenerateCardAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    allowRequestMock.mockResolvedValue(true);
  });

  it("rejects an invalid phone without calling the RPC", async () => {
    const result = await regenerateCardAction(
      form({ phone: "not-a-phone", program: "p1" }),
    );

    expect(result).toEqual({
      success: false,
      error: "Enter a valid Singapore phone number.",
    });
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("rejects a missing program id without calling the RPC", async () => {
    const result = await regenerateCardAction(
      form({ phone: "91234567", program: "" }),
    );

    expect(result).toEqual({ success: false, error: "Missing program." });
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("returns a rate-limit error without calling the RPC when too many attempts have been made", async () => {
    allowRequestMock.mockResolvedValue(false);
    const result = await regenerateCardAction(
      form({ phone: "91234567", program: "p1" }),
    );

    expect(result).toEqual({
      success: false,
      error: "Too many attempts — try again in a minute.",
    });
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("reports an error when the RPC fails", async () => {
    rpcMock.mockImplementation(() =>
      Promise.resolve({ data: null, error: { message: "db down" } }),
    );

    const result = await regenerateCardAction(
      form({ phone: "91234567", program: "p1" }),
    );

    expect(result).toEqual({
      success: false,
      error: "Something went wrong.",
    });
  });

  it("reports an error when the RPC returns no card", async () => {
    mockRegenerate(null);

    const result = await regenerateCardAction(
      form({ phone: "91234567", program: "p1" }),
    );

    expect(result).toEqual({
      success: false,
      error: "Something went wrong.",
    });
  });

  it("calls regenerate_card with the normalized phone and returns it on success", async () => {
    mockRegenerate({ id: "card-1" });

    const result = await regenerateCardAction(
      form({ phone: "9123 4567", program: "p1" }),
    );

    expect(rpcMock).toHaveBeenCalledWith("regenerate_card", {
      p_program: "p1",
      p_phone: "+6591234567",
    });
    expect(result).toEqual({ success: true, phone: "+6591234567" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run test/features/card-check/actions.test.ts`
Expected: FAIL with "Failed to resolve import @/features/card-check/api/actions" (the file doesn't exist yet)

- [ ] **Step 3: Create the implementation (verbatim copy of `src/app/c/actions.ts`, with the `status-state` import repointed at the sibling file from Task 1)**

```typescript
// src/features/card-check/api/actions.ts
"use server";

import { createServerClient } from "@/lib/supabase/server";
import { normalizePhone } from "@/lib/phone";
import { getProgress } from "@/lib/engine";
import { qrSvg } from "@/lib/qr";
import { allowRequest } from "@/lib/rate-limit";
import { isCardExpired } from "@/lib/expiry";
import type { ActionResult } from "@/lib/action-result";
import type { CardStatus, StatusState } from "../types";

type VendorJoinRow = {
  program_id: string;
  name: string;
  type: string;
  config: unknown;
  state: unknown;
  stamp_count: number;
  card_token: string;
  reward_text: string;
  stamps_required: number;
  expiry_days: number | null;
  cycle_started_at: string | null;
  active: boolean;
  replaced_by_name: string | null;
  replaced_by_stamp_count: number | null;
};

// Public card-check action — no auth. The vendor shares /c?v=<vendorId>; the
// phone the customer types in is the only input. vendor_join (SECURITY
// DEFINER) is the sole read/write path: it enrolls the phone into every
// active program it doesn't already have a card for, then returns every
// card the phone holds at this vendor. The engine computes progress per
// card, so this stays type-agnostic across program types.
export async function checkStatusAction(
  _prev: StatusState,
  formData: FormData,
): Promise<StatusState> {
  if (!(await allowRequest("c-check"))) {
    return {
      status: "error",
      message: "Too many attempts — try again in a minute.",
    };
  }

  const normalized = normalizePhone(String(formData.get("phone") ?? ""));
  if (!normalized.ok) {
    return {
      status: "error",
      message: "Enter a valid Singapore phone number.",
    };
  }

  const vendorId = String(formData.get("vendor") ?? "");
  if (!vendorId) {
    return { status: "error", message: "Missing shop." };
  }

  const supabase = await createServerClient();

  const { data, error } = await supabase.rpc("vendor_join", {
    p_vendor: vendorId,
    p_phone: normalized.phone,
  });
  if (error) {
    console.error("vendor_join failed", error);
    return { status: "error", message: "Something went wrong." };
  }

  const rows = (data ?? []) as VendorJoinRow[];
  if (rows.length === 0) {
    return { status: "none", message: "We couldn't find any rewards here." };
  }

  const cards: CardStatus[] = await Promise.all(
    rows.map(async (row) => {
      const programLike = {
        type: row.type,
        config: row.config,
        stamps_required: row.stamps_required,
        reward_text: row.reward_text,
      };
      const cardLike = {
        state: row.state,
        stamp_count: row.stamp_count ?? 0,
        reward_count: 0,
      };
      const progress = getProgress(programLike, cardLike, new Date());
      const qr = await qrSvg(row.card_token);
      const expired =
        row.cycle_started_at != null &&
        isCardExpired(row.cycle_started_at, row.expiry_days, new Date());

      return {
        programId: row.program_id,
        name: row.name,
        label: progress.label,
        view: progress.view,
        rewardReady: progress.rewardReady,
        reward_text: row.reward_text,
        qr,
        expired,
        active: row.active,
        replacedByName: row.replaced_by_name ?? null,
        carriedOverCount:
          row.replaced_by_stamp_count && row.replaced_by_stamp_count > 0
            ? row.replaced_by_stamp_count
            : null,
      };
    }),
  );

  return { status: "found", cards, phone: normalized.phone };
}

// Customer self-service card regeneration — for a lost QR or an expired card.
// Same trust model as enroll_card/checkStatusAction: identity is the phone
// number typed into /c, no separate customer auth exists in this app. Rate-
// limited like the rest of the public /c surface. Unchanged by the
// vendor-level join redesign — still acts on one program's card at a time,
// invoked per-card from the check-form's card list.
export async function regenerateCardAction(
  formData: FormData,
): Promise<ActionResult<{ phone: string }>> {
  if (!(await allowRequest("c-check"))) {
    return {
      success: false,
      error: "Too many attempts — try again in a minute.",
    };
  }

  const normalized = normalizePhone(String(formData.get("phone") ?? ""));
  if (!normalized.ok) {
    return { success: false, error: "Enter a valid Singapore phone number." };
  }
  const programId = String(formData.get("program") ?? "");
  if (!programId) {
    return { success: false, error: "Missing program." };
  }

  const supabase = await createServerClient();
  const { data: card, error } = await supabase.rpc("regenerate_card", {
    p_program: programId,
    p_phone: normalized.phone,
  });
  if (error || !card) {
    console.error("regenerate_card failed", error);
    return { success: false, error: "Something went wrong." };
  }

  return { success: true, phone: normalized.phone };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run test/features/card-check/actions.test.ts`
Expected: PASS (19 tests — 12 moved `checkStatusAction` tests + 1 new rate-limit test + 6 new `regenerateCardAction` tests)

- [ ] **Step 5: Confirm the old file and old test are untouched, full suite still green**

Run: `git status --porcelain src/app/c/actions.ts test/app/check-status-action.test.ts`
Expected: no output (both files unmodified — the old test still passes against the old, still-existing `src/app/c/actions.ts`)
Run: `pnpm test`
Expected: PASS, baseline count + 19 (the old `test/app/check-status-action.test.ts`'s 12 tests still run too, until Task 5 deletes it)

- [ ] **Step 6: Commit**

```bash
git add src/features/card-check/api/actions.ts test/features/card-check/actions.test.ts
git commit -m "feat: add features/card-check/api/actions.ts, closing the regenerateCardAction and rate-limit coverage gaps"
```

---

## Task 3: `features/card-check/components/{check-form,program-card-status}.tsx` + tests (new + moved)

**Files:**

- Create: `src/features/card-check/components/check-form.tsx`
- Create: `src/features/card-check/components/check-form.dom.test.tsx`
- Create: `src/features/card-check/components/program-card-status.tsx`
- Create: `src/features/card-check/components/program-card-status.dom.test.tsx`

**Interfaces:**

- Consumes: `checkStatusAction`, `regenerateCardAction` from `../api/actions` (Task 2); `CardStatus`, `StatusState` from `../types` (Task 1).
- Produces: `CheckForm({ vendorId: string })`, `ProgramCardStatus({ card: CardStatus, phone: string })` — both consumed by Task 4 (barrel). `src/app/c/check-form.tsx`, `src/app/c/program-card-status.tsx`, and `src/app/c/program-card-status.dom.test.tsx` (the old locations) are untouched by this task.

- [ ] **Step 1: Write the failing test for `check-form.tsx` — entirely new, this component has zero coverage today**

```typescript
// @vitest-environment jsdom
// src/features/card-check/components/check-form.dom.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { checkStatusActionMock } = vi.hoisted(() => ({
  checkStatusActionMock: vi.fn(),
}));

vi.mock("../api/actions", () => ({
  checkStatusAction: checkStatusActionMock,
}));

import { CheckForm } from "./check-form";
import { STATUS_IDLE } from "../types";

describe("CheckForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the phone input and submit button with the vendor id in a hidden field", () => {
    const { container } = render(<CheckForm vendorId="v1" />);
    expect(screen.getByLabelText("Your phone number")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Check my card" }),
    ).toBeInTheDocument();
    const hidden = container.querySelector('input[name="vendor"]');
    expect(hidden).toHaveValue("v1");
  });

  it("submits the phone and vendor id, then renders a ProgramCardStatus per returned card", async () => {
    checkStatusActionMock.mockResolvedValue({
      status: "found",
      phone: "+6591234567",
      cards: [
        {
          programId: "p1",
          name: "Kaya Toast Co.",
          label: "3/10 stamps",
          view: { kind: "dots", filled: 3, total: 10, variant: "dots" },
          rewardReady: false,
          reward_text: "Free kopi",
          qr: "",
          expired: false,
          active: true,
          replacedByName: null,
          carriedOverCount: null,
        },
      ],
    });
    const user = userEvent.setup();
    render(<CheckForm vendorId="v1" />);
    await user.type(screen.getByLabelText("Your phone number"), "91234567");
    await user.click(screen.getByRole("button", { name: "Check my card" }));

    expect(await screen.findByText("Kaya Toast Co.")).toBeInTheDocument();
    expect(checkStatusActionMock).toHaveBeenCalledWith(
      STATUS_IDLE,
      expect.any(FormData),
    );
  });

  it("shows a role=alert message when the action returns an error", async () => {
    checkStatusActionMock.mockResolvedValue({
      status: "error",
      message: "Enter a valid Singapore phone number.",
    });
    const user = userEvent.setup();
    render(<CheckForm vendorId="v1" />);
    await user.type(screen.getByLabelText("Your phone number"), "123");
    await user.click(screen.getByRole("button", { name: "Check my card" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Enter a valid Singapore phone number.",
    );
  });

  it("shows a role=alert message when the action finds nothing", async () => {
    checkStatusActionMock.mockResolvedValue({
      status: "none",
      message: "We couldn't find any rewards here.",
    });
    const user = userEvent.setup();
    render(<CheckForm vendorId="v1" />);
    await user.type(screen.getByLabelText("Your phone number"), "91234567");
    await user.click(screen.getByRole("button", { name: "Check my card" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "We couldn't find any rewards here.",
    );
  });
});
```

- [ ] **Step 2: Write the failing test for `program-card-status.tsx` — moved verbatim from `src/app/c/program-card-status.dom.test.tsx`, only import paths change**

```typescript
// @vitest-environment jsdom
// src/features/card-check/components/program-card-status.dom.test.tsx
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { ProgramCardStatus } from "./program-card-status";
import type { CardStatus } from "../types";

function baseCard(overrides: Partial<CardStatus>): CardStatus {
  return {
    programId: "p1",
    name: "Grow-a-kopi",
    label: "Sip",
    reward_text: "Free kopi",
    rewardReady: false,
    expired: false,
    active: true,
    replacedByName: null,
    carriedOverCount: null,
    qr: null,
    view: {
      kind: "plant",
      stage: 1,
      stageName: "Sip",
      totalStages: 5,
      wilting: false,
      variant: "cup",
    },
    ...overrides,
  } as CardStatus;
}

describe("ProgramCardStatus points variant", () => {
  it("renders PointsBar when view.variant is points", () => {
    const { getByText } = render(
      <ProgramCardStatus
        card={baseCard({
          view: { kind: "dots", filled: 40, total: 100, variant: "points" },
        })}
        phone="+6591234567"
      />,
    );
    expect(getByText("40 / 100 points")).toBeInTheDocument();
  });

  it("still renders StampDots (not PointsBar) when view.variant is dots", () => {
    const { container, queryByText } = render(
      <ProgramCardStatus
        card={baseCard({
          view: { kind: "dots", filled: 3, total: 5, variant: "dots" },
        })}
        phone="+6591234567"
      />,
    );
    expect(queryByText(/points$/)).not.toBeInTheDocument();
    expect(container.querySelectorAll("span[aria-hidden]").length).toBe(5);
  });
});

describe("ProgramCardStatus cup variant", () => {
  it("renders the Cup visual (not Plant) when view.variant is cup", () => {
    const { container } = render(
      <ProgramCardStatus card={baseCard({})} phone="+6591234567" />,
    );
    // Cup draws exactly one clipPath (defs > clipPath#cup-body-clip); Plant never does.
    expect(container.querySelector("#cup-body-clip")).toBeInTheDocument();
  });

  it("renders the Plant visual (not Cup) when view.variant is plant", () => {
    const { container } = render(
      <ProgramCardStatus
        card={baseCard({
          view: {
            kind: "plant",
            stage: 1,
            stageName: "Sprout",
            totalStages: 5,
            wilting: false,
            variant: "plant",
          },
        })}
        phone="+6591234567"
      />,
    );
    expect(container.querySelector("#cup-body-clip")).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run both tests to verify they fail**

Run: `pnpm vitest run src/features/card-check/components`
Expected: FAIL with "Failed to resolve import" for both `./check-form` and `./program-card-status` (neither file exists yet)

- [ ] **Step 4: Create `check-form.tsx` (verbatim copy of `src/app/c/check-form.tsx`, with imports repointed at the new sibling files)**

```typescript
// src/features/card-check/components/check-form.tsx
"use client";

import { useActionState } from "react";
import { checkStatusAction } from "../api/actions";
import { STATUS_IDLE } from "../types";
import { ProgramCardStatus } from "./program-card-status";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function CheckForm({ vendorId }: { vendorId: string }) {
  const [state, formAction, pending] = useActionState(
    checkStatusAction,
    STATUS_IDLE,
  );

  return (
    <div className="space-y-6">
      <form action={formAction} className="space-y-4">
        <input type="hidden" name="vendor" value={vendorId} />
        <div className="space-y-2">
          <Label
            htmlFor="phone"
            className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
          >
            Your phone number
          </Label>
          <Input
            id="phone"
            name="phone"
            type="tel"
            required
            placeholder="9123 4567"
            className="h-11 rounded-xl"
          />
        </div>
        <Button
          type="submit"
          disabled={pending}
          className="h-11 w-full rounded-xl text-base font-semibold"
        >
          {pending ? "Checking…" : "Check my card"}
        </Button>
      </form>

      {(state.status === "none" || state.status === "error") && (
        <p role="alert" className="text-sm text-destructive">
          {state.message}
        </p>
      )}

      {state.status === "found" && state.cards && (
        <div className="space-y-4">
          {state.cards.map((card) => (
            <ProgramCardStatus
              key={card.programId}
              card={card}
              phone={state.phone!}
            />
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Create `program-card-status.tsx` (verbatim copy of `src/app/c/program-card-status.tsx`, with imports repointed at the new sibling files)**

```typescript
// src/features/card-check/components/program-card-status.tsx
"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { regenerateCardAction } from "../api/actions";
import type { CardStatus } from "../types";
import { Plant } from "@/components/plant";
import { Cup } from "@/components/cup";
import { Wheel } from "@/components/wheel";
import { ScratchCard } from "@/components/scratch-card";
import { FlameLayers } from "@/components/flame-layers";
import { StampDots } from "@/components/stamp-dots";
import { PointsBar } from "@/components/points-bar";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

// One customer's progress card for a single program, at the vendor-level
// /c page. Each instance owns its own regenerate-dialog state — necessary
// now that a customer can have several of these on one page at once.
export function ProgramCardStatus({
  card,
  phone,
}: {
  card: CardStatus;
  phone: string;
}) {
  const [regenOpen, setRegenOpen] = useState(false);
  const [regenerating, startRegenerate] = useTransition();
  const view = card.view;

  // Auto-opens once per retired card the first time this customer loads
  // /c after a vendor migrates its type. "Seen" persists in localStorage,
  // same no-server-round-trip trust model as regenerateCardAction's local
  // UX elsewhere on this page — there's no customer auth to key a
  // server-side "dismissed" flag off of.
  const [noticeOpen, setNoticeOpen] = useState(false);

  useEffect(() => {
    if (card.active || !card.replacedByName) return;
    const key = `loopkit:seen-replaced:${card.programId}`;
    if (!localStorage.getItem(key)) {
      // Reading localStorage (an external, non-reactive source) on mount to
      // seed one-time dialog state — not derivable from props/state, so
      // this isn't the render-time-derivation case the rule guards against.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setNoticeOpen(true);
    }
    // Only re-check when the identity of the retired card changes — not on
    // every render, and not keyed on active/replacedByName individually
    // since those don't change without programId also changing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card.programId]);

  function dismissNotice() {
    localStorage.setItem(`loopkit:seen-replaced:${card.programId}`, "1");
    setNoticeOpen(false);
  }

  function confirmRegenerate() {
    startRegenerate(async () => {
      const fd = new FormData();
      fd.set("program", card.programId);
      fd.set("phone", phone);
      const res = await regenerateCardAction(fd);
      if (!res.success) {
        toast.error(res.error);
        return;
      }
      toast.success("New card issued — check your card again to see it.");
      setRegenOpen(false);
    });
  }

  return (
    <div className="space-y-4 rounded-xl border bg-muted/40 p-4">
      <p className="text-sm font-semibold">{card.name}</p>
      {view?.kind === "plant" ? (
        <div className="flex flex-col items-center gap-2">
          {view.variant === "cup" ? (
            <Cup
              stage={view.stage}
              totalStages={view.totalStages}
              wilting={view.wilting}
            />
          ) : (
            <Plant
              stage={view.stage}
              totalStages={view.totalStages}
              wilting={view.wilting}
            />
          )}
        </div>
      ) : view?.kind === "flame" ? (
        <div className="flex flex-col items-center gap-2">
          <FlameLayers
            filled={view.filled}
            total={view.total}
            stage={view.stage}
            stageName={view.stageName}
          />
        </div>
      ) : view?.kind === "chance" ? (
        <div className="flex flex-col items-center gap-2">
          {view.variant === "wheel" ? (
            <Wheel segments={view.segments} landedId={view.landedId} />
          ) : (
            <ScratchCard
              revealed={view.landedId !== null}
              label={
                view.segments.find((s) => s.id === view.landedId)?.label ?? ""
              }
              reward={
                view.segments.find((s) => s.id === view.landedId)?.reward ??
                false
              }
            />
          )}
        </div>
      ) : view?.kind === "dots" ? (
        view.variant === "points" ? (
          <PointsBar filled={view.filled} total={view.total} />
        ) : (
          <StampDots filled={view.filled} total={view.total} />
        )
      ) : null}
      <p className="font-mono text-sm font-medium">{card.label}</p>
      <p className="text-sm text-muted-foreground">
        Reward: {card.reward_text}
      </p>
      {card.rewardReady && (
        <p className="text-sm font-semibold text-gold-accent">
          🎉 Reward ready!
        </p>
      )}
      {card.expired && (
        <p className="text-sm font-semibold text-destructive">
          This card has expired.
        </p>
      )}
      {!card.active && (
        <p className="text-xs text-muted-foreground">
          {card.replacedByName
            ? `This card is retired — check your rewards again to see your new ${card.replacedByName} card.`
            : "This program is no longer joinable, but you can still redeem what you've earned."}
        </p>
      )}
      {card.qr && (
        <div className="flex flex-col items-center gap-2 pt-2">
          <div
            className="w-full max-w-[180px] rounded-xl border bg-white p-3 [&_svg]:h-auto [&_svg]:w-full"
            dangerouslySetInnerHTML={{ __html: card.qr }}
          />
          <p className="text-xs text-muted-foreground">Show this to the shop</p>
        </div>
      )}
      <AlertDialog open={regenOpen} onOpenChange={setRegenOpen}>
        <AlertDialogTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="rounded-xl text-xs text-muted-foreground"
          >
            {card.expired ? "Get a new card" : "Lost your code? Get a new one"}
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Get a new card?</AlertDialogTitle>
            <AlertDialogDescription>
              This issues a fresh QR code and resets your progress to zero. Any
              reward you&apos;ve already earned should be redeemed at the shop
              first.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={regenerating}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={regenerating}
              onClick={(e) => {
                e.preventDefault();
                confirmRegenerate();
              }}
            >
              {regenerating ? "Issuing…" : "Get a new card"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {card.replacedByName && (
        <AlertDialog
          open={noticeOpen}
          onOpenChange={(open) => {
            if (!open) dismissNotice();
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {card.name} has a new card: {card.replacedByName}
              </AlertDialogTitle>
              <AlertDialogDescription>
                Your old rewards are still yours to redeem — show the shop this
                card. Next time you check in, you&apos;ll get the new card
                automatically.
                {card.carriedOverCount
                  ? ` Your ${card.carriedOverCount} stamps carried over.`
                  : ""}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogAction onClick={dismissNotice}>
                Got it
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}
```

- [ ] **Step 6: Run both tests to verify they pass**

Run: `pnpm vitest run src/features/card-check/components`
Expected: PASS (4 tests in `check-form.dom.test.tsx` + 4 tests in `program-card-status.dom.test.tsx` = 8 tests)

- [ ] **Step 7: Confirm the old files are untouched and full suite still green**

Run: `git status --porcelain src/app/c/check-form.tsx src/app/c/program-card-status.tsx src/app/c/program-card-status.dom.test.tsx`
Expected: no output
Run: `pnpm test`
Expected: PASS, baseline count + 19 (Task 2) + 8 (this task) — the old `program-card-status.dom.test.tsx` at `src/app/c/` still runs too, until Task 5 deletes it

- [ ] **Step 8: Commit**

```bash
git add src/features/card-check/components
git commit -m "feat: add features/card-check/components/{check-form,program-card-status}.tsx, closing the check-form.tsx coverage gap"
```

---

## Task 4: `features/card-check/index.ts` barrel

**Files:**

- Create: `src/features/card-check/index.ts`

**Interfaces:**

- Consumes: `CheckForm` (Task 3).
- Produces: the single public entry point `@/features/card-check` — consumed by Task 5 (thin `src/app/c/page.tsx` wrapper).

- [ ] **Step 1: Create the barrel**

```typescript
// src/features/card-check/index.ts
export { CheckForm } from "./components/check-form";
```

- [ ] **Step 2: Typecheck**

Run: `pnpm tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/features/card-check/index.ts
git commit -m "feat: add features/card-check/index.ts barrel"
```

---

## Task 5: Cutover — thin `src/app/c/page.tsx`, delete old files and old tests

Unlike Phase 1, nothing outside `src/app/c/` imports from it (verified in the spec's inventory) — so this task both cuts over and cleans up in one typecheck-clean commit, with no follow-up sweep task.

**Files:**

- Modify: `src/app/c/page.tsx` (replace entirely)
- Delete: `src/app/c/actions.ts`, `src/app/c/check-form.tsx`, `src/app/c/program-card-status.tsx`, `src/app/c/status-state.ts`, `src/app/c/program-card-status.dom.test.tsx`
- Delete: `test/app/check-status-action.test.ts`

**Interfaces:**

- Consumes: `CheckForm` from `@/features/card-check` (the barrel — Task 4).
- Produces: nothing new — this task is the point where the old `src/app/c/*` code paths stop existing.

- [ ] **Step 1: Replace `src/app/c/page.tsx` with the thin wrapper**

```typescript
// src/app/c/page.tsx
import { Wordmark } from "@/components/landing/wordmark";
import { createServerClient } from "@/lib/supabase/server";
import { CheckForm } from "@/features/card-check";

type CheckPageProps = {
  searchParams: Promise<{ v?: string }>;
};

export default async function CheckPage({ searchParams }: CheckPageProps) {
  const { v } = await searchParams;

  // Resolve which active programs this vendor runs up front, so the
  // customer sees what a scan joins before they type anything.
  // vendor_active_programs is SECURITY DEFINER and public — an unknown
  // vendor id just returns an empty list.
  let programs: {
    id: string;
    name: string;
    type: string;
    reward_text: string;
  }[] = [];
  if (v) {
    const supabase = await createServerClient();
    const { data } = await supabase.rpc("vendor_active_programs", {
      p_vendor: v,
    });
    programs = data ?? [];
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-5">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <Wordmark className="text-3xl" />
          <h1 className="mt-3 font-display text-2xl font-bold tracking-tight">
            Loyalty card
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {programs.length > 0
              ? `Join: ${programs.map((p) => p.name).join(", ")}`
              : "Check your rewards."}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            New here? Enter your phone to join — no app needed.
          </p>
        </div>

        <div className="rounded-2xl border bg-card px-7 py-9 shadow-sm">
          {v ? (
            <CheckForm vendorId={v} />
          ) : (
            <p className="text-sm text-muted-foreground">
              Ask the shop for their loyalty link.
            </p>
          )}
        </div>
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Delete the fully-migrated old files and their superseded tests**

```bash
rm src/app/c/actions.ts src/app/c/check-form.tsx src/app/c/program-card-status.tsx src/app/c/status-state.ts src/app/c/program-card-status.dom.test.tsx
rm test/app/check-status-action.test.ts
```

- [ ] **Step 3: Typecheck — should stay clean, no external call sites to break**

Run: `pnpm tsc --noEmit`
Expected: PASS

- [ ] **Step 4: Full test suite**

Run: `pnpm test`
Expected: PASS. Net change from baseline: +19 (Task 2's `test/features/card-check/actions.test.ts`) +8 (Task 3's two component test files) −12 (deleted `test/app/check-status-action.test.ts`) −4 (deleted `src/app/c/program-card-status.dom.test.tsx`) = baseline + 11

- [ ] **Step 5: Confirm zero references to the old paths remain**

```bash
grep -rln '"@/app/c/actions"' src test
grep -rln '"@/app/c/check-form"' src test
grep -rln '"@/app/c/program-card-status"' src test
grep -rln '"@/app/c/status-state"' src test
```

Expected: no output from any command

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: cut over to features/card-check, delete old src/app/c files and superseded tests"
```

---

## Task 6: Per-folder READMEs

**Files:**

- Create: `src/features/card-check/README.md`, `src/features/card-check/api/README.md`, `src/features/card-check/components/README.md`, `test/features/card-check/README.md`
- Modify (regenerate): `src/app/c/README.md`
- Modify (add a bullet to the Contents list): `src/features/README.md`

**Interfaces:** none — documentation only.

- [ ] **Step 1: Regenerate `src/app/c/README.md`**

`ls src/app/c/` now shows just `page.tsx` and `README.md`. Follow the shape already established for other thin route wrappers (see `src/app/login/README.md` from Phase 1 for the exact `# name` / `## Purpose` / `## Contents` / `## Parent` shape — this folder has no subfolders, so no `## Connectivity` section). Write a `## Contents` bullet for `page.tsx` describing it as the thin route entry that resolves `vendor_active_programs` and renders `CheckForm` from `@/features/card-check` — grounded in the actual Task 5 file content, not copied from this plan's prose.

- [ ] **Step 2: Create `src/features/card-check/README.md`**

Purpose: the public, unauthenticated card-check flow reached via `/c?v=<vendorId>` — a customer checks or enrolls their loyalty card by phone number, and can self-service regenerate a lost/expired card. Contents: `api/`, `components/`, `index.ts`. Connectivity: `index.ts` is the only path external code should import from (`src/app/c/page.tsx` imports `CheckForm`) — `api/` and `components/` are private implementation, consumed internally by `index.ts` and by each other (`components/check-form.tsx` imports `checkStatusAction` from `../api/actions`, `components/program-card-status.tsx` imports `regenerateCardAction` from `../api/actions`).

- [ ] **Step 3: Create `src/features/card-check/api/README.md`**

Purpose: server-side card-check logic. Contents (rich mode, read each file): `actions.ts` — real description of `checkStatusAction` (enrolls a phone into every active program at a vendor via `vendor_join`, computes per-card progress) and `regenerateCardAction` (reissues a card via `regenerate_card`), grounded in the actual file. Connectivity: N/A (no subfolders). Note that `types.ts` lives one level up at the feature root (sibling to `api/`, not inside it) since both `api/actions.ts` and `components/check-form.tsx` import it.

- [ ] **Step 4: Create `src/features/card-check/components/README.md`**

Purpose: client-side card-check UI. Contents (rich mode): `check-form.tsx` — real description (phone-entry form using `useActionState` + `checkStatusAction`, renders a `ProgramCardStatus` per returned card); `check-form.dom.test.tsx` — real description of what the new test covers; `program-card-status.tsx` — real description (renders one program's progress visual by `view.kind`/`view.variant`, handles card-regeneration and retired-card-notice dialogs); `program-card-status.dom.test.tsx` — real description.

- [ ] **Step 5: Create `test/features/card-check/README.md`**

Mirror `test/features/auth/README.md`'s structure and purpose (from Phase 1), adjusted for this feature: purpose is "tests for `src/features/card-check/`'s non-DOM server actions"; contents: `actions.test.ts` — real description of what it covers (both `checkStatusAction` and `regenerateCardAction`, including the rate-limit branch).

- [ ] **Step 6: Add a `card-check/` bullet to `src/features/README.md`'s Contents list**

Read the current `src/features/README.md` (created in Phase 1) — its Contents list is just `- \`auth/\``. Add `- \`card-check/\`` alphabetized after it. Also update its `## Connectivity` section: the current text says "not yet exercised with only `auth/` present" — with a second feature now present, drop that caveat since the "features do not import from each other directly" rule is now real to state without a hedge (still true here — `card-check` doesn't import from `auth`, and vice versa).

- [ ] **Step 7: Verify every touched/new folder's README is accurate**

```bash
ls src/features src/features/card-check src/features/card-check/api src/features/card-check/components test/features/card-check src/app/c
```

Cross-check each listing against the README you just wrote or regenerated for that folder — every real child present, nothing invented.

- [ ] **Step 8: Commit**

```bash
git add src/features/card-check src/app/c/README.md src/features/README.md test/features/card-check
git commit -m "docs: add per-folder READMEs for the new features/card-check structure"
```

---

## Task 7: Final verification

**Files:** none — verification only.

- [ ] **Step 1: Full quality gate**

```bash
pnpm check
pnpm test
```

Expected: both PASS, test count = baseline + 11 (per Task 5's Step 4 accounting).

- [ ] **Step 2: Confirm no stray references to deleted files anywhere in the repo (not just src/test)**

```bash
grep -rln '"@/app/c/actions"' . --include="*.ts" --include="*.tsx" 2>/dev/null | grep -v node_modules
grep -rln '"@/app/c/status-state"' . --include="*.ts" --include="*.tsx" 2>/dev/null | grep -v node_modules
```

Expected: no output from either

- [ ] **Step 3: Manual smoke test — start the dev server and exercise the migrated page**

```bash
pnpm dev
```

Visit `/c` (no `v` param): confirm it renders the "Ask the shop for their loyalty link" fallback message, matching pre-migration behavior. Visit `/c?v=<any-id>` (a nonexistent vendor id is fine — `vendor_active_programs` is public and returns an empty list for an unknown vendor per the code comment): confirm the phone-entry `CheckForm` renders (label, input, "Check my card" button). You cannot fully exercise the enroll/regenerate flow without live Supabase data in this environment — structural confirmation that the page renders without a client-side exception (check the browser console) is sufficient; do not claim the full enroll flow was tested if it wasn't.

- [ ] **Step 4: Confirm the five old `src/app/c/*` files and the old test no longer exist**

```bash
for f in src/app/c/actions.ts src/app/c/check-form.tsx src/app/c/program-card-status.tsx src/app/c/status-state.ts src/app/c/program-card-status.dom.test.tsx test/app/check-status-action.test.ts; do
  test -f "$f" && echo "STILL EXISTS — bug: $f" || echo "correctly removed: $f"
done
```

Expected: `correctly removed` six times

- [ ] **Step 5: Report status**

This plan's execution ends here — pushing the branch, opening a PR, and watching CI are the controller's job once this task completes (same pattern as Phase 1's Task 8), not a step to script blindly here since the exact branch/worktree name depends on how execution was set up. Report: all 7 tasks complete, quality gate green, manual smoke check results for `/c` (no param) and `/c?v=<id>`.
