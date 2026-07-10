# Vendor-level join Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace loopkit's per-program join QR (`/c?p=<program_id>`) with
one QR per vendor (`/c?v=<vendor_id>`) that auto-enrolls a scanning
customer into every one of that vendor's currently-active programs, and
shows all of that phone's cards at the vendor — including cards for
programs the vendor has since deactivated — on one page.

**Architecture:** Two new SECURITY DEFINER Postgres functions
(`vendor_active_programs` for the pre-phone preview, `vendor_join` for the
actual enroll-and-read) become the new public data boundary for `/c`,
replacing `enroll_card`+`card_view`'s direct use there. `vendor_join`
internally delegates to the existing `enroll_card` RPC per program so its
seeding/head-start logic isn't duplicated. Everything else — the `cards`
table, the engine `Strategy` layer, and the vendor dashboard's
program-scoped pages — is untouched; this is a redesign of the
identity/enrollment/QR boundary only, not the data model.

**Tech Stack:** Next.js 16 App Router (async `searchParams`), Supabase
`@supabase/ssr` (SECURITY DEFINER RPCs as the public write boundary),
Vitest, `qrcode` (existing dependency, unchanged usage).

## Global Constraints

- No changes to `cards`/`stamp_events` schema, to any engine `Strategy`
  file (`src/lib/engine/*`), or to `enroll_card`/`record_visit`/`redeem`/
  `regenerate_card` — this redesign only adds two new functions and
  changes their callers.
- `vendor_join` must not raise on a vendor with zero active programs or an
  unknown vendor id — it returns whatever cards already exist (possibly
  none), never an exception, so the page can show an empty state instead
  of an error.
- A card for a deactivated program must still appear in `vendor_join`'s
  result (`active: false` on that row) — never filtered out once a card
  exists.
- No live users exist yet — the old `/c?p=` param and its single-card
  `StatusState` shape are dropped outright, not kept for back-compat.
- The vendor dashboard's Counter/Customers/Activity/Stats/Plan pages keep
  their existing `?p=` program scoping unchanged — only `/dashboard/grow`
  and the public `/c/*` surface change.

---

### Task 1: Migration + types + schema test

**Files:**

- Create: `supabase/migrations/0015_loopkit_vendor_join.sql`
- Modify: `src/lib/types.ts` (insert two `Functions` entries after
  `card_view`, currently ending at line 257 — see current file for exact
  surrounding context before editing)
- Create: `test/db/vendor-join-schema.test.ts`

**Interfaces:**

- Produces: two public RPCs, `vendor_active_programs(p_vendor uuid)` and
  `vendor_join(p_vendor uuid, p_phone text)`, callable via
  `supabase.rpc("vendor_active_programs", { p_vendor })` and
  `supabase.rpc("vendor_join", { p_vendor, p_phone })` — the exact shapes
  Task 2's server action consumes.
- Consumes: `loopkit.enroll_card(p_program uuid, p_phone text) returns text`
  (existing, unmodified — called via `perform` inside `vendor_join`).

- [ ] **Step 1: Create the migration**

Create `supabase/migrations/0015_loopkit_vendor_join.sql`:

```sql
-- Public: list a vendor's currently-active programs (name/type/reward only
-- — enough for the /c landing page to preview what a scan joins, before
-- the customer has typed a phone number). Supersedes the old
-- card_view-called-with-an-empty-phone hack used for the same purpose.
create or replace function loopkit.vendor_active_programs(p_vendor uuid)
returns table (id uuid, name text, type text, reward_text text)
language sql security definer stable set search_path = '' as $$
  select id, name, type, reward_text
  from loopkit.programs
  where vendor_id = p_vendor and active
  order by created_at asc;
$$;

grant execute on function loopkit.vendor_active_programs(uuid) to anon, authenticated, service_role;

-- Public: the /c?v=<vendor> entry point. Enrolls the phone into every one
-- of the vendor's active programs it doesn't already have a card for
-- (delegating to enroll_card so seeding/head-start logic lives in exactly
-- one place), then returns every card the phone holds at this vendor —
-- including cards for programs that have since gone inactive, so a
-- customer doesn't lose sight of progress on a program the vendor paused.
create or replace function loopkit.vendor_join(p_vendor uuid, p_phone text)
returns table (
  program_id uuid, name text, type text, config jsonb, state jsonb,
  stamp_count int, card_token text, reward_text text, stamps_required int,
  expiry_days int, cycle_started_at timestamptz, active boolean
)
language plpgsql security definer set search_path = '' as $$
declare v_program record;
begin
  if p_phone !~ '^\+65[3689][0-9]{7}$' then
    raise exception 'invalid phone';
  end if;

  for v_program in
    select p.id from loopkit.programs p
    where p.vendor_id = p_vendor and p.active
      and not exists (
        select 1 from loopkit.cards c
        where c.program_id = p.id and c.phone = p_phone
      )
  loop
    perform loopkit.enroll_card(v_program.id, p_phone);
  end loop;

  return query
    select p.id, p.name, p.type, p.config, coalesce(c.state, '{}'::jsonb),
           coalesce(c.stamp_count, 0), c.card_token, p.reward_text,
           p.stamps_required, p.expiry_days, c.cycle_started_at, p.active
    from loopkit.cards c
    join loopkit.programs p on p.id = c.program_id
    where p.vendor_id = p_vendor and c.phone = p_phone
    order by c.created_at asc;
end;
$$;

grant execute on function loopkit.vendor_join(uuid, text) to anon, authenticated, service_role;
```

- [ ] **Step 2: Write the failing schema test**

Create `test/db/vendor-join-schema.test.ts`:

```typescript
import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";

const sql = readFileSync(
  "supabase/migrations/0015_loopkit_vendor_join.sql",
  "utf8",
);

describe("0015 vendor join", () => {
  it("defines vendor_active_programs, granted to anon", () => {
    expect(sql).toMatch(
      /create or replace function loopkit\.vendor_active_programs\(p_vendor uuid\)/i,
    );
    expect(sql).toMatch(
      /grant execute on function loopkit\.vendor_active_programs\(uuid\) to anon/i,
    );
  });

  it("defines vendor_join with the same phone guard as enroll_card, granted to anon", () => {
    expect(sql).toMatch(
      /create or replace function loopkit\.vendor_join\(p_vendor uuid, p_phone text\)/i,
    );
    expect(sql).toMatch(/\^\\\+65\[3689\]\[0-9\]\{7\}\$/);
    expect(sql).toMatch(
      /grant execute on function loopkit\.vendor_join\(uuid, text\) to anon/i,
    );
  });

  it("only auto-enrolls programs the phone doesn't already have a card for", () => {
    expect(sql).toMatch(
      /not exists \(\s*select 1 from loopkit\.cards c\s*where c\.program_id = p\.id and c\.phone = p_phone/i,
    );
  });

  it("delegates seeding to enroll_card rather than duplicating it", () => {
    expect(sql).toMatch(
      /perform loopkit\.enroll_card\(v_program\.id, p_phone\)/i,
    );
  });

  it("only fans out enrollment into active programs", () => {
    expect(sql).toMatch(
      /where p\.vendor_id = p_vendor and p\.active\s*\n\s*and not exists/i,
    );
  });

  it("reads back every existing card regardless of the program's active status", () => {
    expect(sql).toMatch(
      /from loopkit\.cards c\s*join loopkit\.programs p on p\.id = c\.program_id\s*where p\.vendor_id = p_vendor and c\.phone = p_phone/i,
    );
  });
});
```

- [ ] **Step 3: Run the test to verify it passes**

Run: `pnpm vitest run test/db/vendor-join-schema.test.ts`
Expected: PASS, all 6 tests (this is a regex-on-file-text test, so it
passes as soon as the migration file from Step 1 exists with matching
text — there is no separate "RED" phase here, matching this repo's
existing schema-test convention, e.g.
`test/db/enroll-phone-guard-schema.test.ts`).

- [ ] **Step 4: Add the two RPC signatures to `src/lib/types.ts`**

Find the existing `card_view` entry (it ends with `}[];\n      };` right
before `card_by_token: {`). Insert these two new entries between them:

```typescript
vendor_active_programs: {
  Args: {
    p_vendor: string;
  }
  Returns: {
    id: string;
    name: string;
    type: string;
    reward_text: string;
  }
  [];
}
vendor_join: {
  Args: {
    p_vendor: string;
    p_phone: string;
  }
  Returns: {
    program_id: string;
    name: string;
    type: string;
    config: Json;
    state: Json;
    stamp_count: number;
    card_token: string;
    reward_text: string;
    stamps_required: number;
    expiry_days: number | null;
    cycle_started_at: string | null;
    active: boolean;
  }
  [];
}
```

So the surrounding block reads (unchanged lines shown for placement only):

```typescript
card_view: {
  Args: {
    p_program: string;
    p_phone: string;
  }
  Returns: {
    name: string;
    type: string;
    config: Json;
    state: Json;
    stamp_count: number;
    card_token: string;
    reward_text: string;
    stamps_required: number;
    expiry_days: number | null;
    cycle_started_at: string | null;
  }
  [];
}
vendor_active_programs: {
  Args: {
    p_vendor: string;
  }
  Returns: {
    id: string;
    name: string;
    type: string;
    reward_text: string;
  }
  [];
}
vendor_join: {
  Args: {
    p_vendor: string;
    p_phone: string;
  }
  Returns: {
    program_id: string;
    name: string;
    type: string;
    config: Json;
    state: Json;
    stamp_count: number;
    card_token: string;
    reward_text: string;
    stamps_required: number;
    expiry_days: number | null;
    cycle_started_at: string | null;
    active: boolean;
  }
  [];
}
card_by_token: {
  Args: {
    p_token: string;
  }
  Returns: {
    program_id: string;
    card_id: string;
    phone: string;
  }
  [];
}
```

- [ ] **Step 5: Run the full suite and typecheck**

Run: `pnpm check && pnpm test`
Expected: PASS — confirms the `types.ts` edit didn't break any existing
typed Supabase call site.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0015_loopkit_vendor_join.sql src/lib/types.ts test/db/vendor-join-schema.test.ts
git commit -m "feat: add vendor_active_programs + vendor_join RPCs"
```

---

### Task 2: Server-side data layer for `/c` (status state + actions)

**Files:**

- Modify: `src/app/c/status-state.ts` (full replacement — see below)
- Modify: `src/app/c/actions.ts` (full replacement — see below;
  `regenerateCardAction` is included unchanged, only `checkStatusAction`
  is new)
- Modify: `test/app/check-status-action.test.ts` (full replacement — see
  below)

**Interfaces:**

- Consumes: `vendor_join` RPC from Task 1 (`Args: { p_vendor, p_phone }`,
  `Returns` shape as declared in `src/lib/types.ts`).
- Produces: `CardStatus` and `StatusState` types, and
  `checkStatusAction(prev: StatusState, formData: FormData): Promise<StatusState>`
  — Task 3's `CheckForm`/`ProgramCardStatus` components consume these.

- [ ] **Step 1: Replace `src/app/c/status-state.ts`**

```typescript
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
};

export type StatusState = {
  status: "idle" | "found" | "none" | "error";
  cards?: CardStatus[];
  message?: string;
  phone?: string;
};

export const STATUS_IDLE: StatusState = { status: "idle" };
```

- [ ] **Step 2: Write the failing tests**

Replace `test/app/check-status-action.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mirrors qkit's sales/summary.test.ts mock style for the Supabase server
// client — here stubbing the `rpc` call the action makes.
const { rpcMock } = vi.hoisted(() => ({ rpcMock: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({
  createServerClient: vi.fn(async () => ({ rpc: rpcMock })),
}));

vi.mock("@/lib/qr", () => ({
  qrSvg: vi.fn(async (text: string) => `<svg data-token="${text}"></svg>`),
}));

import { checkStatusAction } from "@/app/c/actions";
import { STATUS_IDLE } from "@/app/c/status-state";

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

describe("checkStatusAction", () => {
  beforeEach(() => vi.clearAllMocks());

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
          view: { kind: "dots", filled: 3, total: 10 },
          rewardReady: false,
          reward_text: "Free kopi",
          qr: '<svg data-token="tok_abc"></svg>',
          expired: false,
          active: true,
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
        name: "Streak Club",
        type: "streak",
        config: { period_days: 7, target_streak: 4, reward_text: "Free set" },
        state: {
          current_streak: 1,
          window_start: "2026-07-01T00:00:00Z",
          reward_banked: false,
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
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `pnpm vitest run test/app/check-status-action.test.ts`
Expected: FAIL — `checkStatusAction` still calls `enroll_card`/`card_view`,
not `vendor_join`; the `vendor`/`program` form-field mismatch and the
`cards` vs. flat-`view` shape mismatch will fail every assertion.

- [ ] **Step 4: Replace `src/app/c/actions.ts`**

```typescript
"use server";

import { createServerClient } from "@/lib/supabase/server";
import { normalizePhone } from "@/lib/phone";
import { getProgress } from "@/lib/engine";
import { qrSvg } from "@/lib/qr";
import { allowRequest } from "@/lib/rate-limit";
import { isCardExpired } from "@/lib/expiry";
import type { ActionResult } from "@/lib/action-result";
import type { CardStatus, StatusState } from "@/app/c/status-state";

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

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm vitest run test/app/check-status-action.test.ts`
Expected: PASS, all 9 tests.

- [ ] **Step 6: Run the full test suite, then typecheck separately**

Run: `pnpm test`
Expected: PASS, full suite green (vitest doesn't typecheck, so this alone
confirms Task 2's own code and tests are correct).

Then run: `npx tsc --noEmit`
Expected: exactly one error, located in `src/app/c/check-form.tsx` (it
still references the old single-card `StatusState` shape — `programId`
prop, `state.view`, `state.label`, etc. — which Task 3 replaces). This is
expected, not a regression: `check-form.tsx` is Task 3's deliverable, not
this task's. Confirm the `tsc` output implicates ONLY that one file before
committing — if any OTHER file has a type error, that IS a regression from
this task's changes and must be fixed before committing. Do not run
`pnpm check` as a single combined command here (it would report the
expected `tsc` failure as a task failure) — run `pnpm test` and `tsc
--noEmit` separately as described.

- [ ] **Step 7: Commit**

```bash
git add src/app/c/status-state.ts src/app/c/actions.ts test/app/check-status-action.test.ts
git commit -m "feat: rewrite /c server actions around vendor_join (multi-card)"
```

---

### Task 3: `/c` page UI (form, per-card component, page)

**Files:**

- Create: `src/app/c/program-card-status.tsx`
- Modify: `src/app/c/check-form.tsx` (full replacement — see below)
- Modify: `src/app/c/page.tsx` (full replacement — see below)

**Interfaces:**

- Consumes: `CardStatus`/`StatusState`/`STATUS_IDLE` and
  `checkStatusAction`/`regenerateCardAction` from Task 2.
- Produces: `<CheckForm vendorId={string} />` (used by `page.tsx`),
  `<ProgramCardStatus card={CardStatus} phone={string} />` (used by
  `check-form.tsx`).

- [ ] **Step 1: Create `src/app/c/program-card-status.tsx`**

```tsx
"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { regenerateCardAction } from "@/app/c/actions";
import type { CardStatus } from "@/app/c/status-state";
import { Plant } from "@/components/plant";
import { Wheel } from "@/components/wheel";
import { ScratchCard } from "@/components/scratch-card";
import { StreakFlame } from "@/components/streak-flame";
import { StampDots } from "@/components/stamp-dots";
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
          <Plant
            stage={view.stage}
            totalStages={view.totalStages}
            wilting={view.wilting}
          />
        </div>
      ) : view?.kind === "streak" ? (
        <div className="flex flex-col items-center gap-2">
          <StreakFlame
            current={view.current}
            target={view.target}
            status={view.status}
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
        <StampDots filled={view.filled} total={view.total} />
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
          This program is no longer joinable, but you can still redeem what
          you&apos;ve earned.
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
    </div>
  );
}
```

- [ ] **Step 2: Replace `src/app/c/check-form.tsx`**

```tsx
"use client";

import { useActionState } from "react";
import { checkStatusAction } from "@/app/c/actions";
import { STATUS_IDLE } from "@/app/c/status-state";
import { ProgramCardStatus } from "@/app/c/program-card-status";
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

- [ ] **Step 3: Replace `src/app/c/page.tsx`**

```tsx
import { Wordmark } from "@/components/landing/wordmark";
import { createServerClient } from "@/lib/supabase/server";
import { CheckForm } from "@/app/c/check-form";

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

- [ ] **Step 4: Run typecheck/lint/format and the full test suite**

Run: `pnpm check && pnpm test`
Expected: PASS — this resolves the expected `check-form.tsx` typecheck gap
noted at the end of Task 2. No new tests are expected for these three
files specifically (no component-test precedent for `/c` UI in this repo);
correctness is carried by Task 2's action tests plus the type system.

- [ ] **Step 5: Commit**

```bash
git add src/app/c/program-card-status.tsx src/app/c/check-form.tsx src/app/c/page.tsx
git commit -m "feat: render one card per program on the vendor-level /c page"
```

---

### Task 4: Vendor dashboard — Grow page + nav scoping

**Files:**

- Modify: `src/app/dashboard/grow/page.tsx` (full replacement — see below)
- Modify: `src/app/dashboard/dashboard-nav.tsx` (three targeted edits — see
  below)

**Interfaces:**

- Consumes: `requireVendor()`, `listPrograms()` (both existing, unmodified).
- Produces: no new exports; `LINKS` entries gain a `scoped: boolean` field
  that the render loops must respect.

- [ ] **Step 1: Replace `src/app/dashboard/grow/page.tsx`**

```tsx
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { requireVendor } from "@/lib/auth";
import { listPrograms } from "@/lib/program";
import { qrSvg } from "@/lib/qr";
import { CardLinkActions } from "@/app/dashboard/card-link";

export default async function GrowPage() {
  const { user } = await requireVendor();

  const programs = await listPrograms();
  if (programs.length === 0) redirect("/setup");
  const active = programs.filter((p) => p.active);

  // The QR must encode an absolute URL — a host-less path is unscannable. Fall
  // back to the request host when NEXT_PUBLIC_BASE_URL is unset.
  const h = await headers();
  const origin =
    process.env.NEXT_PUBLIC_BASE_URL ??
    `https://${h.get("x-forwarded-host") ?? h.get("host")}`;
  const cardLink = `${origin}/c?v=${user.id}`;
  const cardQr = await qrSvg(cardLink);

  return (
    <main className="mx-auto max-w-4xl space-y-8 p-5 py-10">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Get customers to join
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          One QR for your whole shop — print this at your counter or till. New
          customers scan it once and join{" "}
          {active.length > 0
            ? active.map((p) => p.name).join(", ")
            : "your programs"}{" "}
          automatically, no typing needed from you. Returning customers use the
          same link to check their cards.
        </p>
      </div>

      {active.length === 0 && (
        <p className="rounded-xl border bg-card px-4 py-3 text-sm text-muted-foreground">
          None of your programs are active right now — new scans won&apos;t join
          anything until you activate one.
        </p>
      )}

      <div className="rounded-2xl border bg-card p-6 shadow-sm">
        <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
          <div
            className="shrink-0 rounded-xl border bg-white p-2 [&_svg]:size-32"
            dangerouslySetInnerHTML={{ __html: cardQr }}
          />
          <div className="min-w-0 space-y-3">
            <code className="block truncate rounded-lg bg-muted px-3 py-2 font-mono text-xs">
              {cardLink}
            </code>
            <CardLinkActions link={cardLink} />
          </div>
        </div>
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Give `LINKS` a `scoped` flag**

In `src/app/dashboard/dashboard-nav.tsx`, change:

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

to:

```typescript
const LINKS = [
  { href: "/dashboard", label: "Counter", scoped: true },
  { href: "/dashboard/customers", label: "Customers", scoped: true },
  { href: "/dashboard/activity", label: "Activity", scoped: true },
  { href: "/dashboard/stats", label: "Stats", scoped: true },
  { href: "/dashboard/grow", label: "Grow", scoped: false },
  { href: "/dashboard/plan", label: "Plan", scoped: true },
];
```

- [ ] **Step 3: Respect `scoped` in the desktop nav render**

Change:

```tsx
      <nav className="hidden items-center gap-1 sm:flex">
        {LINKS.map((link) => {
          const active = isActive(path, link.href);
          return (
            <Link
              key={link.href}
              href={withProgram(link.href)}
              className={cn(
```

to:

```tsx
      <nav className="hidden items-center gap-1 sm:flex">
        {LINKS.map((link) => {
          const active = isActive(path, link.href);
          return (
            <Link
              key={link.href}
              href={link.scoped ? withProgram(link.href) : link.href}
              className={cn(
```

- [ ] **Step 4: Respect `scoped` in the mobile inline list render**

Change:

```tsx
          <div className="flex flex-col gap-1">
            {LINKS.map((link) => {
              const active = isActive(path, link.href);
              return (
                <Link
                  key={link.href}
                  href={withProgram(link.href)}
                  onClick={() => setMobileOpen(false)}
```

to:

```tsx
          <div className="flex flex-col gap-1">
            {LINKS.map((link) => {
              const active = isActive(path, link.href);
              return (
                <Link
                  key={link.href}
                  href={link.scoped ? withProgram(link.href) : link.href}
                  onClick={() => setMobileOpen(false)}
```

- [ ] **Step 5: Run typecheck/lint/format and the full test suite**

Run: `pnpm check && pnpm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/app/dashboard/grow/page.tsx src/app/dashboard/dashboard-nav.tsx
git commit -m "feat: vendor-level Grow QR, drop program scoping from the Grow nav link"
```
