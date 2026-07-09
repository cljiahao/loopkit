# loopkit Vendor-Status Endpoint Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Merqo a way to ask loopkit "is `<email>` an active vendor, and what plan?" over HTTP, mirroring qkit's identical endpoint so Merqo's sync logic treats both kits uniformly.

**Architecture:** One new route, `GET /api/merqo/vendor-status`, guarded by the same `bearerOk()` already ported verbatim into loopkit's `/api/merqo/metrics` route. The route resolves the query-string email to an `auth.users` id via the admin API (neither `loopkit.programs` nor `loopkit.vendor_pro` has an email column), then checks whether that id owns a program (`active`) and whether it's in `vendor_pro` (`plan`). The lookup logic is a pure, unit-testable function; the route stays a thin HTTP wrapper.

**Tech Stack:** Next.js 16 route handler, Supabase service client, Vitest.

## Global Constraints

- TypeScript strict — no `any`, no `@ts-ignore` (AGENTS.md).
- Validate all user input with Zod at every boundary (AGENTS.md) — the `email` query param must be validated before use.
- Authorization lives in RLS / the service-role boundary, not ad hoc app checks — this route uses the service-role client precisely because it must read across all vendors, same justification as `admin-data.ts`.
- No secrets in `NEXT_PUBLIC_*`.
- Reuse the existing `MERQO_METRICS_SECRET` env var — do not introduce a new secret.
- `bearerOk()` must stay byte-identical to qkit's (`../qkit/src/app/api/merqo/metrics/route.ts`), matching the existing comment convention in loopkit's metrics route ("Ported verbatim from qkit's bearerOk — keep in lockstep").

---

### Task 1: `resolveVendorStatus` — pure lookup logic + test

**Files:**
- Create: `src/lib/merqo-vendor-status.ts`
- Test: `src/lib/merqo-vendor-status.test.ts`

**Interfaces:**
- Consumes: nothing (pure function, takes plain data).
- Produces: `resolveVendorStatus(email: string, authUsers: {id: string; email: string | null}[], programVendorIds: string[], proVendorIds: string[]): VendorStatus` — used by Task 2's route handler.

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/merqo-vendor-status.test.ts
import { describe, it, expect } from "vitest";
import { resolveVendorStatus } from "./merqo-vendor-status";

const authUsers = [
  { id: "u1", email: "alice@example.com" },
  { id: "u2", email: "BOB@Example.com" },
];

describe("resolveVendorStatus", () => {
  it("active (free) when the vendor owns a program but isn't in vendor_pro", () => {
    const r = resolveVendorStatus("alice@example.com", authUsers, ["u1"], []);
    expect(r).toEqual({ active: true, plan: "free" });
  });

  it("active (pro) when the vendor owns a program and is in vendor_pro", () => {
    const r = resolveVendorStatus(
      "alice@example.com",
      authUsers,
      ["u1"],
      ["u1"],
    );
    expect(r).toEqual({ active: true, plan: "pro" });
  });

  it("matches email case-insensitively", () => {
    const r = resolveVendorStatus("bob@example.com", authUsers, ["u2"], []);
    expect(r).toEqual({ active: true, plan: "free" });
  });

  it("inactive when no auth user matches the email", () => {
    const r = resolveVendorStatus(
      "nobody@example.com",
      authUsers,
      ["u1"],
      ["u1"],
    );
    expect(r).toEqual({ active: false, plan: null });
  });

  it("inactive when the auth user exists but owns no program", () => {
    const r = resolveVendorStatus("alice@example.com", authUsers, [], []);
    expect(r).toEqual({ active: false, plan: null });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/lib/merqo-vendor-status.test.ts`
Expected: FAIL — `Cannot find module './merqo-vendor-status'`

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/lib/merqo-vendor-status.ts

export type VendorStatus =
  | { active: true; plan: "free" | "pro" }
  | { active: false; plan: null };

/**
 * Neither loopkit.programs nor loopkit.vendor_pro has an email column (both
 * key on auth.users(id)), so the caller supplies the auth-user list (from
 * supabase.auth.admin.listUsers) alongside the two id lists, and this pure
 * function does the lookup.
 */
export function resolveVendorStatus(
  email: string,
  authUsers: { id: string; email: string | null }[],
  programVendorIds: string[],
  proVendorIds: string[],
): VendorStatus {
  const key = email.toLowerCase();
  const user = authUsers.find((u) => u.email?.toLowerCase() === key);
  if (!user) return { active: false, plan: null };
  if (!programVendorIds.includes(user.id)) return { active: false, plan: null };
  return { active: true, plan: proVendorIds.includes(user.id) ? "pro" : "free" };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/lib/merqo-vendor-status.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/merqo-vendor-status.ts src/lib/merqo-vendor-status.test.ts
git commit -m "feat: add pure vendor-status lookup for the merqo sync endpoint"
```

---

### Task 2: `GET /api/merqo/vendor-status` route

**Files:**
- Create: `src/app/api/merqo/vendor-status/route.ts`

**Interfaces:**
- Consumes: `resolveVendorStatus` from Task 1 (`src/lib/merqo-vendor-status.ts`).
- Produces: the HTTP contract Merqo's `checkVendorStatus` (Merqo plan, separate repo) calls: `GET /api/merqo/vendor-status?email=<email>` with `Authorization: Bearer <MERQO_METRICS_SECRET>` → `200 {active: boolean, plan: "free"|"pro"|null}` or `401 {error: "Unauthorized"}` or `400 {error: "..."}` on a missing/invalid email param. Same shape as qkit's endpoint.

- [ ] **Step 1: Write the route**

```typescript
// src/app/api/merqo/vendor-status/route.ts
import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/server";
import { resolveVendorStatus } from "@/lib/merqo-vendor-status";

export const revalidate = 0;

// Ported verbatim from qkit's `bearerOk` — keep in lockstep with
// ../qkit/src/app/api/merqo/vendor-status/route.ts.
function bearerOk(request: Request): boolean {
  const secret = process.env.MERQO_METRICS_SECRET;
  if (!secret) return false;
  const header = request.headers.get("authorization") ?? "";
  const prefix = "Bearer ";
  if (!header.startsWith(prefix)) return false;
  const provided = Buffer.from(header.slice(prefix.length));
  const expected = Buffer.from(secret);
  return (
    provided.length === expected.length && timingSafeEqual(provided, expected)
  );
}

const querySchema = z.object({ email: z.string().email() });

export async function GET(request: Request) {
  if (!bearerOk(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const parsed = querySchema.safeParse({
    email: searchParams.get("email") ?? "",
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "email required" }, { status: 400 });
  }

  const supabase = await createServiceClient();

  const [usersRes, programsRes, proRes] = await Promise.all([
    supabase.auth.admin.listUsers({ perPage: 1000 }),
    supabase.from("programs").select("vendor_id"),
    supabase.from("vendor_pro").select("vendor_id"),
  ]);
  for (const r of [programsRes, proRes]) {
    if (r.error) {
      console.error("merqo vendor-status: read failed", r.error.message);
      return NextResponse.json(
        { error: "Upstream unavailable" },
        { status: 503 },
      );
    }
  }

  const status = resolveVendorStatus(
    parsed.data.email,
    usersRes.data?.users ?? [],
    (programsRes.data ?? []).map((p) => p.vendor_id as string),
    (proRes.data ?? []).map((p) => p.vendor_id as string),
  );

  return NextResponse.json(status);
}
```

- [ ] **Step 2: Manual verification (no colocated route test — matches the existing `/api/merqo/metrics` route, which also has no route-level test; only its pure compute/lookup function is unit-tested per Task 1)**

Run: `pnpm dev`, then in another terminal:
```bash
curl -s "http://localhost:3000/api/merqo/vendor-status?email=test@example.com" \
  -H "Authorization: Bearer $MERQO_METRICS_SECRET"
```
Expected: `{"active":false,"plan":null}` for an email with no matching auth user (or `{"active":true,"plan":"free"}` / `"pro"` for a real vendor's email in your dev DB).

```bash
curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:3000/api/merqo/vendor-status?email=test@example.com"
```
Expected: `401` (no bearer header)

- [ ] **Step 3: Run full verification**

Run: `pnpm check`
Expected: prettier/eslint/tsc all clean

Run: `pnpm vitest run`
Expected: all tests pass (including Task 1's new tests, and the existing `merqo-metrics.contract.test.ts` unaffected)

- [ ] **Step 4: Commit**

```bash
git add src/app/api/merqo/vendor-status/route.ts
git commit -m "feat: add /api/merqo/vendor-status endpoint for Merqo's vendor sync"
```

---

## Self-Review Notes

- **Spec coverage:** loopkit section of the design spec (bearer auth reuse, email→id resolution via admin API, program-ownership + vendor_pro lookup, `{active, plan}` contract, 401 on bad bearer) — covered by Tasks 1–2.
- **No placeholders** — every step has complete, runnable code.
- **Type consistency** — `VendorStatus` (Task 1) matches qkit's shape (`{active: true, plan: "free"|"pro"} | {active: false, plan: null}`) even though loopkit has no `Plan` type alias to import; inlined the same union so the wire contract matches.
