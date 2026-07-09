# Dashboard nav qkit-parity + Pro plan page + upgrade gating Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Merge loopkit's split dashboard nav into one qkit-style sticky bar, and add a self-serve Pro upgrade flow (plan page + admin inbox) so the existing free/Pro gate isn't a dead end.

**Architecture:** One new Supabase migration adds `loopkit.upgrade_requests` (mirrors qkit's `purchase_requests`, binary not multi-kind). A new `/dashboard/plan` page + `ProLock` component give vendors a path from "hit the free-tier limit" to "request Pro". `dashboard-nav.tsx` is rewritten to absorb `dashboard-tabs.tsx`'s page-links and the program switcher into a single bar; `dashboard-tabs.tsx` is deleted. Admin gets a "Pending upgrade requests" section on the existing `/admin/vendors` page that grants Pro and clears the request in one action.

**Tech Stack:** Next.js 16 App Router, Supabase (`@supabase/ssr`, schema `loopkit`), Tailwind v4, shadcn/ui (`DropdownMenu`, `Button`, `Badge`), lucide-react icons, Zod, `useAsyncAction` hook, `sonner` toasts, Vitest.

## Global Constraints

- TypeScript strict — no `any`, no `@ts-ignore`.
- Validate all Server Action input with Zod.
- Authorization lives in RLS policies + `requireAdmin()`/`requireVendor()` — never widen a policy to fix a query.
- Service-role client (`createServiceClient`) only in Server Actions/Route Handlers, never client components.
- `supabase-migrate` is a safety-gated skill — the agent (or you) must run `/supabase-migrate` yourself after Task 1's migration file is written; it cannot be auto-invoked.
- Every dashboard page/action stays scoped to `db: { schema: "loopkit" }`.
- Follow existing patterns: `useAsyncAction` + `sonner` toast for client mutation buttons (not qkit's `useTransition`), `ActionResult<T>` return type for Server Actions, `recordAudit()` after every admin write.

---

## File Structure

- **Create** `supabase/migrations/0013_loopkit_upgrade_requests.sql` — new table + RLS.
- **Modify** `src/lib/admin-data.ts` — add `listPendingUpgradeRequests()`.
- **Modify** `src/app/admin/actions.ts` — add `resolveUpgradeRequest()`.
- **Create** `src/app/admin/vendors/resolve-upgrade-request-button.tsx` — client button for the new action.
- **Modify** `src/app/admin/vendors/page.tsx` — render the pending-requests section.
- **Create** `src/components/pro-lock.tsx` — reusable locked-feature pill.
- **Create** `src/app/dashboard/plan/actions.ts` — `requestUpgrade()`.
- **Create** `src/app/dashboard/plan/upgrade-cta.tsx` — client button for `requestUpgrade`.
- **Create** `src/app/dashboard/plan/page.tsx` — the plan page.
- **Modify** `src/app/setup/page.tsx` — swap the dead-end free-plan card for `ProLock`.
- **Modify** `src/app/dashboard/profile/page.tsx` — swap the footer note for `ProLock`.
- **Delete** `src/app/dashboard/dashboard-tabs.tsx`.
- **Rewrite** `src/app/dashboard/dashboard-nav.tsx` — merged single bar.
- **Modify** `src/app/dashboard/layout.tsx` — fetch `programs`, drop `DashboardTabs`.

---

### Task 1: Migration — `upgrade_requests` table

**Files:**

- Create: `supabase/migrations/0013_loopkit_upgrade_requests.sql`

**Interfaces:**

- Produces: table `loopkit.upgrade_requests(id uuid, vendor_id uuid, status text, created_at timestamptz)`, consumed by Task 2 (`listPendingUpgradeRequests`), Task 3 (`resolveUpgradeRequest`), and Task 6 (`requestUpgrade`).

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/0013_loopkit_upgrade_requests.sql
-- Self-serve Pro upgrade requests. A vendor files one when they hit the
-- free-tier program cap; an admin reviews it on /admin/vendors and grants Pro,
-- which resolves the request. No payment integration — same manual-fulfillment
-- model qkit uses today (mirrors qkit.purchase_requests, but binary: loopkit
-- has one paid tier, not qkit's event/monthly split).

create table loopkit.upgrade_requests (
  id         uuid primary key default gen_random_uuid(),
  vendor_id  uuid not null references auth.users(id) on delete cascade,
  status     text not null default 'pending' check (status in ('pending','resolved')),
  created_at timestamptz not null default now()
);

create index upgrade_requests_pending_idx
  on loopkit.upgrade_requests (status, created_at desc);

alter table loopkit.upgrade_requests enable row level security;

-- A vendor files their own request and can see it (to know it's pending).
create policy upgrade_requests_vendor_insert on loopkit.upgrade_requests
  for insert with check (vendor_id = (select auth.uid()));

create policy upgrade_requests_select on loopkit.upgrade_requests
  for select using (
    vendor_id = (select auth.uid()) or loopkit.is_admin((select auth.uid()))
  );

-- Admin resolves (the admin server action uses the service role, which
-- bypasses RLS anyway — this policy documents intent for any direct client use).
create policy upgrade_requests_admin_update on loopkit.upgrade_requests
  for update using (loopkit.is_admin((select auth.uid())));

grant select, insert on loopkit.upgrade_requests to authenticated;
grant all on loopkit.upgrade_requests to service_role;
```

- [ ] **Step 2: Apply the migration + regenerate types**

Run `/supabase-migrate` yourself (it's a safety-gated skill — cannot be invoked by the agent). This applies the migration to the linked Supabase project and regenerates `src/lib/types.ts`.

- [ ] **Step 3: Verify**

Run: `pnpm tsc --noEmit`
Expected: no new errors (confirms `src/lib/types.ts` picked up the new table).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0013_loopkit_upgrade_requests.sql src/lib/types.ts
git commit -m "feat: add loopkit.upgrade_requests table for self-serve Pro requests"
```

---

### Task 2: Admin data — list pending upgrade requests

**Files:**

- Modify: `src/lib/admin-data.ts`

**Interfaces:**

- Consumes: `createServiceClient` (existing import in this file), `emailByUserId` (existing helper, same file).
- Produces: `PendingUpgradeRequest` type `{ id: string; vendor_id: string; email: string | null; created_at: string }`, `listPendingUpgradeRequests(): Promise<PendingUpgradeRequest[]>` — consumed by Task 4 (`admin/vendors/page.tsx`).

- [ ] **Step 1: Add the type + function**

Add after `VendorRow` (around line 34) and after `listVendors()` (around line 155) in `src/lib/admin-data.ts`:

```typescript
export type PendingUpgradeRequest = {
  id: string;
  vendor_id: string;
  email: string | null;
  created_at: string;
};

/**
 * Pending self-serve upgrade requests, oldest first — the admin's grant-Pro
 * inbox on /admin/vendors. Service-role read, same email-resolution pattern
 * as listVendors.
 */
export async function listPendingUpgradeRequests(): Promise<
  PendingUpgradeRequest[]
> {
  const supabase = await createServiceClient();
  const { data, error } = await supabase
    .from("upgrade_requests")
    .select("id, vendor_id, created_at")
    .eq("status", "pending")
    .order("created_at", { ascending: true });
  if (error) throw new Error(`listPendingUpgradeRequests: ${error.message}`);

  const emails = await emailByUserId(supabase);
  return (data ?? []).map((r) => ({
    id: r.id,
    vendor_id: r.vendor_id,
    email: emails.get(r.vendor_id) ?? null,
    created_at: r.created_at,
  }));
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/admin-data.ts
git commit -m "feat: add listPendingUpgradeRequests for the admin inbox"
```

---

### Task 3: Admin action — resolve an upgrade request

**Files:**

- Modify: `src/app/admin/actions.ts`

**Interfaces:**

- Consumes: `requireAdmin`, `createServiceClient`, `ActionResult`, `recordAudit` (all already in this file).
- Produces: `resolveUpgradeRequest(formData: FormData): Promise<ActionResult>` — consumed by Task 4 (`resolve-upgrade-request-button.tsx`). Takes `FormData` with `requestId` (uuid) and `vendorId` (uuid).

- [ ] **Step 1: Add the action**

Add at the end of `src/app/admin/actions.ts`, after `removeCard`:

```typescript
const resolveUpgradeRequestSchema = z.object({
  requestId: z.string().uuid(),
  vendorId: z.string().uuid(),
});

/**
 * Grant a vendor Pro and clear their pending upgrade request in one action —
 * the admin's "Grant Pro" button on the /admin/vendors pending-requests
 * section. Admin-only, service-role (RLS scopes vendor_pro/upgrade_requests
 * reads to the owner or an admin).
 */
export async function resolveUpgradeRequest(
  formData: FormData,
): Promise<ActionResult> {
  const { user } = await requireAdmin();

  const parsed = resolveUpgradeRequestSchema.safeParse({
    requestId: formData.get("requestId"),
    vendorId: formData.get("vendorId"),
  });
  if (!parsed.success) return { success: false, error: "Invalid input" };

  const supabase = await createServiceClient();

  const { error: proError } = await supabase
    .from("vendor_pro")
    .upsert({ vendor_id: parsed.data.vendorId }, { onConflict: "vendor_id" });
  if (proError) {
    console.error("resolveUpgradeRequest (grant) failed", proError.message);
    return { success: false, error: "Could not grant Pro" };
  }

  const { error: resolveError } = await supabase
    .from("upgrade_requests")
    .update({ status: "resolved" })
    .eq("id", parsed.data.requestId);
  if (resolveError) {
    console.error(
      "resolveUpgradeRequest (resolve) failed",
      resolveError.message,
    );
    return {
      success: false,
      error: "Granted Pro, but could not clear the request",
    };
  }

  await recordAudit(user.id, "resolve_upgrade_request", parsed.data.vendorId, {
    requestId: parsed.data.requestId,
  });

  revalidatePath("/admin/vendors");
  return { success: true };
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/admin/actions.ts
git commit -m "feat: add resolveUpgradeRequest admin action"
```

---

### Task 4: Admin UI — pending upgrade requests section

**Files:**

- Create: `src/app/admin/vendors/resolve-upgrade-request-button.tsx`
- Modify: `src/app/admin/vendors/page.tsx`

**Interfaces:**

- Consumes: `resolveUpgradeRequest` (Task 3), `listPendingUpgradeRequests`/`PendingUpgradeRequest` (Task 2), `useAsyncAction` (`src/hooks/use-async-action.ts`), `formatSgtDateTime` (`src/lib/format.ts`).
- Produces: `ResolveUpgradeRequestButton` component — used only in `admin/vendors/page.tsx`.

- [ ] **Step 1: Write the button component**

```typescript
// src/app/admin/vendors/resolve-upgrade-request-button.tsx
"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useAsyncAction } from "@/hooks/use-async-action";
import { resolveUpgradeRequest } from "@/app/admin/actions";
import { Button } from "@/components/ui/button";

/** Per-row Grant Pro control for a pending upgrade request. */
export function ResolveUpgradeRequestButton({
  requestId,
  vendorId,
  email,
}: {
  requestId: string;
  vendorId: string;
  email: string | null;
}) {
  const router = useRouter();
  const { pending, run } = useAsyncAction();
  const who = email ?? "vendor";

  function grant() {
    run(async () => {
      const fd = new FormData();
      fd.set("requestId", requestId);
      fd.set("vendorId", vendorId);
      const result = await resolveUpgradeRequest(fd);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(`${who} is now Pro.`);
      router.refresh();
    });
  }

  return (
    <Button
      type="button"
      size="sm"
      disabled={pending}
      onClick={grant}
      className="rounded-xl"
    >
      {pending ? "Granting…" : "Grant Pro"}
    </Button>
  );
}
```

- [ ] **Step 2: Render the section in the vendors page**

In `src/app/admin/vendors/page.tsx`, add the import and fetch, and render a section above the existing vendor table:

```typescript
import { requireAdmin } from "@/lib/admin";
import { listVendors, listPendingUpgradeRequests } from "@/lib/admin-data";
import { formatSgtDateTime } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { VendorProToggle } from "@/app/admin/vendors/vendor-pro-toggle";
import { ResolveUpgradeRequestButton } from "@/app/admin/vendors/resolve-upgrade-request-button";

export const revalidate = 0;

export default async function AdminVendorsPage() {
  await requireAdmin();

  const [vendors, pendingRequests] = await Promise.all([
    listVendors(),
    listPendingUpgradeRequests(),
  ]);

  return (
    <main className="mx-auto max-w-5xl space-y-8 px-5 py-8">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Internal
        </p>
        <h1 className="text-3xl font-bold tracking-tight">Vendors</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Grant Pro to lift a vendor&apos;s one-program limit.
        </p>
      </div>

      {pendingRequests.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Pending upgrade requests
          </h2>
          <div className="divide-y overflow-hidden rounded-2xl border bg-card shadow-sm">
            {pendingRequests.map((r) => (
              <div
                key={r.id}
                className="flex items-center justify-between gap-3 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {r.email ?? "—"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Requested {formatSgtDateTime(r.created_at)}
                  </p>
                </div>
                <ResolveUpgradeRequestButton
                  requestId={r.id}
                  vendorId={r.vendor_id}
                  email={r.email}
                />
              </div>
            ))}
          </div>
        </section>
      )}

      {vendors.length === 0 ? (
        <p className="rounded-2xl border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
          No vendors yet.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border bg-card shadow-sm">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-3">Vendor</th>
                <th className="px-4 py-3 text-right">Programs</th>
                <th className="px-4 py-3">Tier</th>
                <th className="px-4 py-3 text-right">Pro</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {vendors.map((v) => (
                <tr key={v.vendor_id} className="hover:bg-muted/40">
                  <td className="px-4 py-3 font-medium">{v.email ?? "—"}</td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {v.program_count}
                  </td>
                  <td className="px-4 py-3">
                    {v.is_pro ? (
                      <Badge variant="gold">Pro</Badge>
                    ) : (
                      <Badge variant="outline">Free</Badge>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <VendorProToggle
                      vendorId={v.vendor_id}
                      email={v.email}
                      isPro={v.is_pro}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `pnpm tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/admin/vendors/resolve-upgrade-request-button.tsx src/app/admin/vendors/page.tsx
git commit -m "feat: show pending upgrade requests on the admin vendors page"
```

---

### Task 5: `ProLock` component

**Files:**

- Create: `src/components/pro-lock.tsx`

**Interfaces:**

- Consumes: `Link` (next/link), `Lock` (lucide-react), `cn` (`@/lib/utils`).
- Produces: `ProLock({ label, className }: { label: string; className?: string })` — consumed by Task 7 (`setup/page.tsx`, `profile/page.tsx`).

- [ ] **Step 1: Write the component**

```typescript
// src/components/pro-lock.tsx
import Link from "next/link";
import { Lock } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Inline pill pointing a free-tier vendor at the plan page from wherever they
 * hit a Pro-only limit. Mirrors qkit's ProLock — one visual pattern reused at
 * every point of friction instead of a blur/modal treatment.
 */
export function ProLock({
  label,
  className,
}: {
  label: string;
  className?: string;
}) {
  return (
    <Link
      href="/dashboard/plan"
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/5 px-2.5 py-1 text-xs font-semibold text-primary transition-colors hover:bg-primary/10",
        className,
      )}
    >
      <Lock className="size-3" />
      {label}
    </Link>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/pro-lock.tsx
git commit -m "feat: add ProLock component for Pro-gated feature CTAs"
```

---

### Task 6: `requestUpgrade` action + Plan page

**Files:**

- Create: `src/app/dashboard/plan/actions.ts`
- Create: `src/app/dashboard/plan/upgrade-cta.tsx`
- Create: `src/app/dashboard/plan/page.tsx`

**Interfaces:**

- Consumes: `createServerClient` (`@/lib/supabase/server`), `ActionResult` (`@/lib/action-result`), `requireVendor` (`@/lib/auth`), `isPro` (`@/lib/program`), `useAsyncAction`, `Button`.
- Produces: `requestUpgrade(): Promise<ActionResult>`, `UpgradeCta` component, `/dashboard/plan` route — Task 8's nav "Plan" link points here.

- [ ] **Step 1: Write the server action**

```typescript
// src/app/dashboard/plan/actions.ts
"use server";

import { createServerClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/action-result";

/**
 * File a self-serve Pro upgrade request for the admin to action. Idempotent:
 * a second click while a request is still pending is a no-op success — same
 * pattern as qkit's requestUpgrade, minus the event/monthly kind (loopkit has
 * one paid tier).
 */
export async function requestUpgrade(): Promise<ActionResult> {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Please sign in first" };

  const { data: existing } = await supabase
    .from("upgrade_requests")
    .select("id")
    .eq("vendor_id", user.id)
    .eq("status", "pending")
    .limit(1)
    .maybeSingle();
  if (existing) return { success: true };

  const { error } = await supabase
    .from("upgrade_requests")
    .insert({ vendor_id: user.id });
  if (error) {
    console.error("requestUpgrade failed", error.message);
    return { success: false, error: "Could not send your request" };
  }
  return { success: true };
}
```

- [ ] **Step 2: Write the upgrade button**

```typescript
// src/app/dashboard/plan/upgrade-cta.tsx
"use client";

import { toast } from "sonner";
import { useAsyncAction } from "@/hooks/use-async-action";
import { requestUpgrade } from "@/app/dashboard/plan/actions";
import { Button } from "@/components/ui/button";

/** Files an upgrade request and shows a confirmation toast. */
export function UpgradeCta() {
  const { pending, run } = useAsyncAction();

  function onClick() {
    run(async () => {
      const result = await requestUpgrade();
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success("Request sent — we'll set you up shortly.");
    });
  }

  return (
    <Button
      size="lg"
      disabled={pending}
      onClick={onClick}
      className="h-12 w-full rounded-xl text-base font-semibold"
    >
      {pending ? "Sending…" : "Request upgrade"}
    </Button>
  );
}
```

- [ ] **Step 3: Write the plan page**

```typescript
// src/app/dashboard/plan/page.tsx
import { Check, Sparkles } from "lucide-react";
import { requireVendor } from "@/lib/auth";
import { isPro } from "@/lib/program";
import { UpgradeCta } from "@/app/dashboard/plan/upgrade-cta";

function Cell({ on }: { on: boolean }) {
  return (
    <span className="flex justify-center">
      {on ? (
        <Check className="size-4 text-primary" />
      ) : (
        <span className="text-muted-foreground/40">—</span>
      )}
    </span>
  );
}

export default async function PlanPage() {
  await requireVendor();
  const pro = await isPro();

  return (
    <main className="mx-auto max-w-2xl space-y-7 p-5 py-10">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Billing
          </p>
          <h1 className="font-display text-3xl font-bold tracking-tight">
            Plan
          </h1>
        </div>
        <span
          className={
            pro
              ? "inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1.5 text-sm font-semibold text-primary"
              : "inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1.5 text-sm font-semibold text-muted-foreground"
          }
        >
          {pro && <Sparkles className="size-3.5" />}
          {pro ? "Pro" : "Free"}
        </span>
      </div>

      {pro ? (
        <p className="rounded-xl border bg-card px-5 py-4 text-sm text-muted-foreground">
          You&apos;re on Pro — unlimited loyalty programs are unlocked.
          Thanks for supporting loopkit.
        </p>
      ) : (
        <div className="rounded-2xl border border-primary/40 bg-card p-5">
          <div className="flex items-center gap-2">
            <Sparkles className="size-4 text-primary" />
            <h2 className="font-display text-xl font-semibold">Pro</h2>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            Run more than one loyalty program at a time. Message us and
            we&apos;ll set you up — no card needed yet.
          </p>
          <div className="mt-4">
            <UpgradeCta />
          </div>
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border">
        <div className="grid grid-cols-[1fr_auto_auto] gap-x-5 px-5 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <span>Feature</span>
          <span className="text-center">Free</span>
          <span className="text-center">Pro</span>
        </div>
        <div className="grid grid-cols-[1fr_auto_auto] items-center gap-x-5 border-t px-5 py-3 text-sm">
          <span>Loyalty programs</span>
          <span className="text-center text-muted-foreground">1</span>
          <Cell on={true} />
        </div>
      </div>
    </main>
  );
}
```

- [ ] **Step 4: Typecheck**

Run: `pnpm tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/app/dashboard/plan
git commit -m "feat: add /dashboard/plan page with self-serve Pro upgrade request"
```

---

### Task 7: Wire `ProLock` into setup and profile pages

**Files:**

- Modify: `src/app/setup/page.tsx:107-119`
- Modify: `src/app/dashboard/profile/page.tsx:54-59`

**Interfaces:**

- Consumes: `ProLock` (Task 5).

- [ ] **Step 1: Replace the dead-end card in `setup/page.tsx`**

Add the import:

```typescript
import { ProLock } from "@/components/pro-lock";
```

Replace lines 107-119 (the `else` branch rendering "Free plan: 1 program"):

```typescript
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
```

- [ ] **Step 2: Replace the footer note in `profile/page.tsx`**

Add the import:

```typescript
import { ProLock } from "@/components/pro-lock";
```

Replace lines 54-59:

```typescript
        {!pro && (
          <div className="border-t pt-4">
            <p className="text-xs text-muted-foreground">
              Free accounts get one card.
            </p>
            <ProLock label="Upgrade to Pro" className="mt-2" />
          </div>
        )}
```

- [ ] **Step 3: Typecheck**

Run: `pnpm tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/setup/page.tsx src/app/dashboard/profile/page.tsx
git commit -m "feat: link free-tier limit messages to the plan page via ProLock"
```

---

### Task 8: Merge `DashboardNav` + `DashboardTabs`

**Files:**

- Delete: `src/app/dashboard/dashboard-tabs.tsx`
- Rewrite: `src/app/dashboard/dashboard-nav.tsx`
- Modify: `src/app/dashboard/layout.tsx`

**Interfaces:**

- Consumes: `Program` type (`@/lib/program`), `listPrograms` (`@/lib/program`), `DropdownMenu*` (`@/components/ui/dropdown-menu`), `Wordmark`, `cn`.
- Produces: `DashboardNav({ signOut, email, tier, programs }: { signOut: () => Promise<void>; email: string; tier: "free" | "pro"; programs: Program[] })` — replaces the old two-prop-set signature; consumed only by `layout.tsx`.

- [ ] **Step 1: Delete the old tabs file**

```bash
git rm src/app/dashboard/dashboard-tabs.tsx
```

- [ ] **Step 2: Rewrite `dashboard-nav.tsx`**

```typescript
// src/app/dashboard/dashboard-nav.tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  ChevronDown,
  History,
  LogOut,
  Menu,
  QrCode,
  Sparkles,
  Store,
  User,
  Users,
  X,
} from "lucide-react";
import { Wordmark } from "@/components/landing/wordmark";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { Program } from "@/lib/program";

type Tier = "free" | "pro";

const LINKS = [
  { href: "/dashboard", label: "Counter", icon: Store },
  { href: "/dashboard/customers", label: "Customers", icon: Users },
  { href: "/dashboard/activity", label: "Activity", icon: History },
  { href: "/dashboard/grow", label: "Grow", icon: QrCode },
  { href: "/dashboard/plan", label: "Plan", icon: Sparkles },
];

function isActive(path: string, href: string): boolean {
  return href === "/dashboard" ? path === "/dashboard" : path.startsWith(href);
}

const TIER_BADGE: Record<Tier, { label: string; className: string }> = {
  free: {
    label: "Free",
    className: "bg-secondary text-muted-foreground ring-border",
  },
  pro: {
    label: "Pro",
    className:
      "bg-emerald-500/15 text-emerald-700 ring-emerald-500/30 dark:bg-emerald-400/15 dark:text-emerald-400 dark:ring-emerald-400/30",
  },
};

function TierBadge({ tier }: { tier: Tier }) {
  const { label, className } = TIER_BADGE[tier];
  return (
    <span
      className={cn(
        "shrink-0 rounded-full px-1.5 py-0.5 font-mono text-[0.6rem] font-semibold uppercase tracking-wider ring-1 ring-inset",
        className,
      )}
    >
      {label}
    </span>
  );
}

/** Up to two initials from an email's local part; falls back to a bullet. */
function initials(email: string): string {
  const local = email.trim().split("@")[0] ?? "";
  const parts = local.split(/[._-]+/).filter(Boolean);
  if (parts.length === 0) return "•";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

/**
 * Dashboard sticky-header row: brand, program switcher (only if the vendor
 * has more than one program), page links, and the account menu — one merged
 * bar, matching qkit's dashboard-nav architecture (qkit has no multi-program
 * switcher, so that piece is loopkit-specific). Inline on sm+; below sm, page
 * links + the switcher collapse behind a burger button.
 */
export function DashboardNav({
  signOut,
  email,
  tier,
  programs,
}: {
  signOut: () => Promise<void>;
  email: string;
  tier: Tier;
  programs: Program[];
}) {
  const path = usePathname();
  const searchParams = useSearchParams();
  const p = searchParams.get("p");
  const [mobileOpen, setMobileOpen] = useState(false);

  const withProgram = (href: string) => (p ? `${href}?p=${p}` : href);
  const currentProgram = programs.find((prog) => prog.id === p) ?? programs[0];

  return (
    <div className="mx-auto flex max-w-2xl items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-3">
        <Link
          href="/dashboard"
          aria-label="loopkit dashboard home"
          className="shrink-0 rounded-sm outline-none transition-opacity hover:opacity-80 focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          <Wordmark className="text-xl" />
        </Link>

        {programs.length > 1 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="hidden max-w-[9rem] items-center gap-1 truncate rounded-lg px-2 py-1 text-sm font-medium text-muted-foreground outline-none hover:bg-secondary focus-visible:ring-[3px] focus-visible:ring-ring/50 sm:flex"
              >
                <span className="truncate">
                  {currentProgram?.name ?? "Program"}
                </span>
                <ChevronDown className="size-3.5 shrink-0" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56 rounded-xl">
              {programs.map((prog) => (
                <DropdownMenuItem key={prog.id} asChild>
                  <Link href={`/dashboard?p=${prog.id}`}>{prog.name}</Link>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      <nav className="hidden items-center gap-1 sm:flex">
        {LINKS.map((link) => {
          const Icon = link.icon;
          const active = isActive(path, link.href);
          return (
            <Link
              key={link.href}
              href={withProgram(link.href)}
              className={cn(
                "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary",
                active && "bg-primary/10 text-primary hover:bg-primary/10",
              )}
            >
              <Icon className="size-4" />
              {link.label}
            </Link>
          );
        })}
      </nav>

      <div className="flex items-center gap-1">
        <button
          type="button"
          aria-label={mobileOpen ? "Close menu" : "Open menu"}
          onClick={() => setMobileOpen((v) => !v)}
          className="rounded-lg p-1.5 text-muted-foreground hover:bg-secondary sm:hidden"
        >
          {mobileOpen ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="Account menu"
              className="flex items-center gap-2 rounded-lg py-1 pr-1 pl-1 text-left transition-colors outline-none hover:bg-secondary focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              <span
                aria-hidden="true"
                className="grid size-8 shrink-0 place-items-center rounded-md bg-primary/12 font-mono text-xs font-semibold tracking-tight text-primary ring-1 ring-inset ring-primary/25"
              >
                {initials(email)}
              </span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56 rounded-xl">
            <DropdownMenuLabel className="px-2 py-2">
              <div className="flex items-center gap-2">
                <p className="truncate text-sm font-semibold">{email}</p>
                <TierBadge tier={tier} />
              </div>
              <p className="text-xs font-normal text-muted-foreground">
                Vendor account
              </p>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/dashboard/profile" className="cursor-pointer">
                <User className="size-4" />
                Profile
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
      </div>

      {mobileOpen && (
        <div className="absolute inset-x-0 top-full z-20 border-b bg-background/95 px-5 py-3 backdrop-blur-md sm:hidden">
          {programs.length > 1 && (
            <div className="mb-2 flex flex-col gap-1 border-b pb-2">
              {programs.map((prog) => (
                <Link
                  key={prog.id}
                  href={`/dashboard?p=${prog.id}`}
                  onClick={() => setMobileOpen(false)}
                  className={cn(
                    "rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-secondary",
                    prog.id === currentProgram?.id && "text-primary",
                  )}
                >
                  {prog.name}
                </Link>
              ))}
            </div>
          )}
          <div className="flex flex-col gap-1">
            {LINKS.map((link) => {
              const Icon = link.icon;
              const active = isActive(path, link.href);
              return (
                <Link
                  key={link.href}
                  href={withProgram(link.href)}
                  onClick={() => setMobileOpen(false)}
                  className={cn(
                    "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-secondary",
                    active && "bg-primary/10 text-primary",
                  )}
                >
                  <Icon className="size-4" />
                  {link.label}
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Update `layout.tsx`**

```typescript
// src/app/dashboard/layout.tsx
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { requireVendor } from "@/lib/auth";
import { isAdmin } from "@/lib/admin";
import { isPro, listPrograms } from "@/lib/program";
import { createServerClient } from "@/lib/supabase/server";
import { DashboardNav } from "@/app/dashboard/dashboard-nav";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user } = await requireVendor();

  // Admins have no program and don't use the vendor dashboard — send them home.
  if (await isAdmin(user.id)) redirect("/admin");

  const [pro, programs] = await Promise.all([isPro(), listPrograms()]);

  // Inline server action so the header's Sign out `<form>` can post directly —
  // no client bundle, no exposed endpoint beyond this closure.
  async function signOut() {
    "use server";
    const supabase = await createServerClient();
    await supabase.auth.signOut();
    redirect("/login");
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-20 border-b bg-background/85 px-5 py-3 backdrop-blur-md">
        <Suspense fallback={null}>
          <DashboardNav
            signOut={signOut}
            email={user.email ?? ""}
            tier={pro ? "pro" : "free"}
            programs={programs}
          />
        </Suspense>
      </header>
      <div className="flex-1">{children}</div>
    </div>
  );
}
```

- [ ] **Step 4: Remove the now-redundant `<select>` program switcher from `dashboard/page.tsx`**

`src/app/dashboard/page.tsx:32-57` renders its own inline `<form>`/`<select>` program switcher. The nav now owns program switching, so delete that block:

Remove lines 32-57 (the `{programs.length > 1 ? ( <form action="/dashboard" ...> ... </form> ) : null}` block) from `src/app/dashboard/page.tsx`, leaving the `<div>` wrapper's next child (`<div className="flex items-center justify-between gap-3">`) as the first thing inside `<div>`.

- [ ] **Step 5: Typecheck**

Run: `pnpm tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Manual verification**

Run: `pnpm dev`, sign in as a vendor with at least one program, and check:

- Desktop (`≥640px`): single bar shows brand, page links (Counter/Customers/Activity/Grow/Plan), account menu. No bottom tab bar.
- Mobile (`<640px`): brand + account menu visible; burger opens a panel with the page links; closing it (tap burger again or a link) works.
- With a vendor that has 2+ programs (grant a second program via `/setup`, or check an existing multi-program vendor): program switcher appears next to the brand on desktop and in the mobile panel; switching updates `?p=` and the page content.
- `/dashboard/plan` loads from the new "Plan" link.

Expected: all of the above work with no console errors, no layout shift/overlap between the burger panel and page content.

- [ ] **Step 7: Commit**

```bash
git add src/app/dashboard/dashboard-nav.tsx src/app/dashboard/layout.tsx src/app/dashboard/page.tsx
git commit -m "feat: merge dashboard nav into one qkit-style bar"
```

---

### Task 9: Full verification pass

**Files:** none (verification only)

- [ ] **Step 1: Typecheck + lint + tests**

Run: `pnpm check`
Expected: no errors.

- [ ] **Step 2: Production build**

Run: `pnpm build`
Expected: succeeds, `/dashboard/plan` appears in the route list.

- [ ] **Step 3: Manual click-through**

Using `pnpm dev`:

1. As a free-tier vendor: visit `/setup`, confirm the free-plan card now shows the "Upgrade to Pro" `ProLock` pill instead of dead-end text; click it, land on `/dashboard/plan`; click "Request upgrade", see the success toast.
2. Visit `/dashboard/profile`, confirm the same `ProLock` pill appears under the free-tier note.
3. As an admin: visit `/admin/vendors`, confirm the "Pending upgrade requests" section shows the request just filed; click "Grant Pro"; confirm it disappears from pending and the vendor's row now shows the "Pro" badge.
4. Re-visit `/dashboard/plan` as that now-Pro vendor: confirm it shows the "You're on Pro" message instead of the upgrade card.

Expected: every step above works with no console errors.

- [ ] **Step 4: Final commit (if any fixes were needed)**

```bash
git add -A
git commit -m "fix: address issues found in manual verification"
```

(Only if Step 3 surfaced fixes — otherwise skip, nothing to commit.)
