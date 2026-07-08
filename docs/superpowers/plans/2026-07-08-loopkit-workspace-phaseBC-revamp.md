# loopkit Workspace Phase B+C — Dashboard revamp + Admin Pro toggle — Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use `- [ ]`.

**Goal:** Make the vendor dashboard read as a calm workspace — one merged "serve a customer" flow (folding in today's separate look-up box) + a clearer program header — and add a Make-Pro toggle to `/admin`.

**Tech Stack:** Next 16, TS strict, Supabase (schema `loopkit`), Vitest, pnpm 11. Builds on Phase A (multi-program, `program_id` threading, `vendor_pro`/`is_pro`, `getProgress`).

## Global Constraints

- TS strict; no `any`/`@ts-ignore`; no inline comments; match existing style + tokens.
- Reuse existing actions (`stampAction`/`recordVisitAction`/`lookupAction`/`redeemAction`/`redeemPlantAction`/`resolveTokenAction`) and components (`ScanButton`, `RedeemButton`, `<Plant>`, `Badge`) — do NOT add new server actions or a migration.
- Keep the counter fast: the primary type action stays one step (type phone → act); look-up is a secondary affordance on the same card, not a separate box.
- No `/c` change. Stamp/lucky/plant/redeem behavior unchanged — this is a UI reorganization.
- Every task ends green: `pnpm check && pnpm test && pnpm build`.
- Spec: `docs/superpowers/specs/2026-07-08-loopkit-vendor-workspace-design.md` §4–5.

---

### Task 1: Program header — type badge

**Files:** `src/app/dashboard/page.tsx`.

- [ ] Add a shadcn `Badge` next to the program name showing the type: `Stamp` / `Lucky Tap` / `Sprout` (map from `program.type`; use the `gold` variant for Sprout, default otherwise). Keep the existing switcher + Edit link + reward subtitle. Green; commit `feat: dashboard program type badge`.

### Task 2: Merge look-up into one "Serve a customer" card

**Files:** `src/app/dashboard/page.tsx`; new `src/app/dashboard/serve-customer.tsx`; remove the separate "Look up a card" section (keep `card-lookup.tsx` only if reused).

- [ ] Create `ServeCustomer` (`"use client"`, mirrors the existing `stamp-form`/`lucky-form`/`plant-form` + `card-lookup`), props `{ programId, type, stampsRequired, rewardText }`. Layout:
  - One identify row: phone `Input` (ref) + `ScanButton` (fills phone + submits the primary action).
  - Primary action button — "Add stamp" / "Play" / "Water" per `type` (pending label) → calls the type's existing action (`stampAction`/`recordVisitAction`) with `program_id`.
  - A secondary "Look up" button → calls `lookupAction` (non-mutating) so a full card can be checked/redeemed without acting.
  - One shared **result card**: shows the customer's progress (stamp/lucky dots OR `<Plant>` for sprout — reuse `getProgress`-shaped fields the actions return; the actions already return `card`/`progress`), and a `RedeemButton` (or plant redeem) when the reward is ready. Clear + refocus the phone field after a mutating action; `router.refresh()`.
  - This single card REPLACES both the per-type form section AND the separate "Look up a card" section on the dashboard.
- [ ] `dashboard/page.tsx`: render `<ServeCustomer .../>` in the "Serve a customer" section; delete the standalone "Look up a card" block. Keep customer-card panel + recent activity.
- [ ] Reconcile the actions' return shapes so `ServeCustomer` can render one result card for all three types (stamp returns `{card, rewardReady}`; recordVisit returns `{rewardUnlocked, progress, ...}`; lookup returns `{card, rewardReady}`). If needed, normalize in the component (not the actions). Redeem: stamp/lucky use `redeemAction(card_id)`; plant uses `redeemPlantAction(program_id+phone)` — branch by type.
- [ ] Update/trim tests touched (the old `stamp-form.test.tsx` may move to a `serve-customer` test or stay if `stamp-form` is retained internally). Green; commit `feat: merge stamp + look-up into one Serve-a-customer flow`.

_Note:_ if a full unified component is too large in one pass, an acceptable smaller version is: keep the per-type form as the primary action but add the "Look up" secondary button + shared result into it, and delete the separate look-up section. The requirement that must hold: **no separate "Look up a card" box; look-up + act share one card.**

### Task 3: `/admin` Make-Pro toggle (Phase C)

**Files:** `src/app/admin/programs/page.tsx` or a new `src/app/admin/vendors/page.tsx`; `src/app/admin/actions.ts`; reuse `admin_audit`.

- [ ] Add a vendors view to `/admin`: list distinct `programs.vendor_id` (service-role read) with email (via `supabase.auth.admin.listUsers`), their program count, and Pro status (from `vendor_pro`).
- [ ] Add `setVendorPro(formData: { vendorId, pro })` server action: `requireAdmin` → service-role upsert/delete on `vendor_pro` → `recordAudit(user.id, 'set_vendor_pro', vendorId, {pro})` → `revalidatePath`. An `AlertDialog`-free toggle (a form button per row) + toast is fine (mirrors qkit admin's no-modal style).
- [ ] Link it from the admin nav (add a "Vendors" tab, or fold into the programs list). Green; commit `feat: admin Make-Pro toggle`.

---

## Self-Review

**Spec coverage (§4–5):** program header badge (Task 1); merged serve-a-customer flow removing the separate look-up box (Task 2); admin Pro toggle (Task 3). Switcher/Edit/customer-card/activity already shipped in Phase A. No migration, no `/c` change, reuse existing actions.

**Placeholder scan:** Task 2 gives a fallback smaller-scope option with a hard invariant ("no separate look-up box; look-up + act share one card") so it can't degrade to vague. Tasks name exact files/actions/props.

**Type consistency:** `ServeCustomer` props `{programId,type,stampsRequired,rewardText}`; reuses `stampAction`/`recordVisitAction`/`lookupAction`/`redeemAction`/`redeemPlantAction` return shapes (normalized in-component); `setVendorPro` writes `vendor_pro`, audits via `admin_audit`.
