# loopkit v2 Phase 3a — Customer card view + QR — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use `- [ ]`.

**Goal:** Turn the public `/c` page into a real customer card view: it shows the shop, the customer's progress (any type, via the engine), the reward, **and the customer's own QR** — plus lets a customer enroll (create their card) by phone. This is the customer-facing surface; the vendor **camera scan** that reads the QR is the next slice (Phase 3b).

**Architecture:** A SECURITY-DEFINER `card_view(program, phone)` returns the raw `type`/`config`/`state`/`card_token`/`name` (anon-safe, no direct table access), and the TypeScript action computes progress with the existing engine `getProgress` — so `/c` is type-agnostic (dots view works for stamp AND lucky). Each card gets a unique opaque `card_token` (the QR payload). QR is rendered **server-side as an SVG** (no client bundle) via the `qrcode` package.

**Tech Stack:** Next 16, TS strict, Supabase (`@supabase/ssr`, schema `loopkit`), Vitest, pnpm 11, `qrcode`. Builds on Phase 1–2 (`src/lib/engine/*`, migrations 0004–0005).

## Global Constraints

- TS strict; no `any`/`@ts-ignore`; no inline comments; match existing style.
- `/c` is PUBLIC (anon). All customer reads go through SECURITY-DEFINER functions — never a direct anon table select.
- The QR payload is the opaque `card_token` only — never a phone number or PII.
- Stamp/redeem/play actions stay vendor-gated (unchanged).
- Schema change → migration `0006_*` + `src/lib/types.ts` + drift test.
- Every task ends green: `pnpm check && pnpm test && pnpm build`.
- Spec: `docs/superpowers/specs/2026-07-07-loopkit-v2-core-design.md` §2.

---

## File Structure

- `supabase/migrations/0006_loopkit_card_token.sql` (new) — `card_token` column + `enroll_card` + `card_view` + `card_by_token`.
- `src/lib/types.ts` (modify) — new rpcs + `cards.card_token`.
- `src/lib/qr.ts` (new) — `qrSvg(text): Promise<string>`.
- `src/app/c/actions.ts` (modify) — `checkStatusAction` uses `card_view` + engine `getProgress`; `enroll_card` for the token.
- `src/app/c/status-state.ts` (modify) — carry a generic `{ view, label, rewardReady, name, reward_text, token }`.
- `src/app/c/check-form.tsx` (modify) — render generic dots from `view` + the QR image.
- `package.json` — add `qrcode` + `@types/qrcode`.
- Tests: `test/db/card-token-schema.test.ts`, `test/lib/qr.test.ts`.

---

### Task 1: Migration 0006 — token + customer read functions

**Files:** Create `supabase/migrations/0006_loopkit_card_token.sql`; Modify `src/lib/types.ts`, `docs/DEPLOY.md`; Test `test/db/card-token-schema.test.ts`.

**Interfaces:**
- `cards.card_token text not null unique` (per-row random; existing rows backfilled).
- `enroll_card(p_program uuid, p_phone text) returns text` — public SECURITY DEFINER; creates the card if absent; returns its `card_token`.
- `card_view(p_program uuid, p_phone text) returns table(name text, type text, config jsonb, state jsonb, card_token text, reward_text text, stamps_required int)` — public SECURITY DEFINER; the anon-safe read behind `/c`.
- `card_by_token(p_token text) returns table(program_id uuid, card_id uuid, phone text)` — SECURITY DEFINER, returns a row only when the CALLER owns the program (for the Phase 3b vendor scan).

- [ ] **Step 1: Failing drift test**

```ts
// test/db/card-token-schema.test.ts
import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";

const sql = readFileSync(
  "supabase/migrations/0006_loopkit_card_token.sql",
  "utf8",
);

describe("0006 card token", () => {
  it("adds a unique card_token to cards", () => {
    expect(sql).toMatch(/add column card_token text not null unique/i);
  });
  it("defines enroll_card (public) + card_view + card_by_token", () => {
    expect(sql).toMatch(/create or replace function loopkit\.enroll_card\(/i);
    expect(sql).toMatch(/create or replace function loopkit\.card_view\(/i);
    expect(sql).toMatch(/create or replace function loopkit\.card_by_token\(/i);
  });
  it("card_by_token is owner-gated", () => {
    expect(sql).toMatch(/owns_program/i);
  });
  it("grants card_view + enroll_card to anon", () => {
    expect(sql).toMatch(
      /grant execute on function loopkit\.card_view\([^)]*\) to anon/i,
    );
    expect(sql).toMatch(
      /grant execute on function loopkit\.enroll_card\([^)]*\) to anon/i,
    );
  });
});
```

- [ ] **Step 2: Run → FAIL** (file not found).

- [ ] **Step 3: Write the migration**

```sql
-- supabase/migrations/0006_loopkit_card_token.sql
-- Customer-facing surface: every card gets an opaque token (the QR payload),
-- and three SECURITY DEFINER read/enroll functions power the public /c page and
-- (next slice) the vendor scan. No direct anon table access.

-- A volatile default gives each existing row a distinct token on add.
alter table loopkit.cards
  add column card_token text not null unique
    default replace(gen_random_uuid()::text, '-', '');

-- Enroll (public): ensure a card exists for this phone, return its token.
create or replace function loopkit.enroll_card(p_program uuid, p_phone text)
returns text language plpgsql security definer set search_path = '' as $$
declare v_token text;
begin
  insert into loopkit.cards (program_id, phone)
    values (p_program, p_phone)
  on conflict (program_id, phone) do nothing;
  select card_token into v_token
    from loopkit.cards
    where program_id = p_program and phone = p_phone;
  return v_token;
end;
$$;

-- Customer read (public): raw type/config/state so the TS engine renders
-- progress. Only for an active program; the token lets the customer show a QR.
create or replace function loopkit.card_view(p_program uuid, p_phone text)
returns table (
  name text, type text, config jsonb, state jsonb,
  card_token text, reward_text text, stamps_required int
)
language sql security definer stable set search_path = '' as $$
  select p.name, p.type, p.config, coalesce(c.state, '{}'::jsonb),
         c.card_token, p.reward_text, p.stamps_required
  from loopkit.programs p
  left join loopkit.cards c on c.program_id = p.id and c.phone = p_phone
  where p.id = p_program and p.active;
$$;

-- Vendor scan resolve (owner-gated): a token → its card, only if the caller
-- owns the program. Used by the Phase 3b camera scan.
create or replace function loopkit.card_by_token(p_token text)
returns table (program_id uuid, card_id uuid, phone text)
language sql security definer stable set search_path = '' as $$
  select c.program_id, c.id, c.phone
  from loopkit.cards c
  where c.card_token = p_token and loopkit.owns_program(c.program_id);
$$;

grant execute on function loopkit.enroll_card(uuid, text) to anon, authenticated, service_role;
grant execute on function loopkit.card_view(uuid, text) to anon, authenticated, service_role;
grant execute on function loopkit.card_by_token(text) to authenticated, service_role;
```

- [ ] **Step 4: `src/lib/types.ts`** — add `cards.card_token: string`; add the three rpcs to `Functions` (Args + Returns rows) matching existing rpc typing.

- [ ] **Step 5: `docs/DEPLOY.md`** — add "apply `0006_loopkit_card_token.sql`".

- [ ] **Step 6: Run → PASS** (4 tests). Then `pnpm check && pnpm test && pnpm build` green; commit `feat: 0006 card_token + customer read functions`.

---

### Task 2: `qrcode` dependency + server SVG helper

**Files:** Create `src/lib/qr.ts`; Modify `package.json`; Test `test/lib/qr.test.ts`.

**Interfaces:** `qrSvg(text: string): Promise<string>` — returns an inline SVG string (no width/height attrs stripped; scalable), for embedding via `dangerouslySetInnerHTML`.

- [ ] **Step 1:** `pnpm add qrcode && pnpm add -D @types/qrcode`.

- [ ] **Step 2: Failing test**

```ts
// test/lib/qr.test.ts
import { describe, it, expect } from "vitest";
import { qrSvg } from "@/lib/qr";

describe("qrSvg", () => {
  it("produces an svg for a token", async () => {
    const svg = await qrSvg("abc123");
    expect(svg).toContain("<svg");
    expect(svg).toContain("</svg>");
  });
});
```

- [ ] **Step 3:** Run → FAIL. Implement:

```ts
import QRCode from "qrcode";

export async function qrSvg(text: string): Promise<string> {
  return QRCode.toString(text, {
    type: "svg",
    margin: 1,
    errorCorrectionLevel: "M",
  });
}
```

- [ ] **Step 4:** Run → PASS. `pnpm check && pnpm test && pnpm build` green; commit `feat: qr svg helper`.

---

### Task 3: Type-agnostic `/c` card view + QR

**Files:** Modify `src/app/c/actions.ts`, `src/app/c/status-state.ts`, `src/app/c/check-form.tsx` (read `src/lib/engine/index.ts` for `getProgress`, and the existing `check-form.tsx` dot markup to mirror).

**Interfaces:** `checkStatusAction` now returns, on found: `{ status:'found', name, label, filled, total, rewardReady, reward_text, qr }` where `filled/total` come from `getProgress(program-like, card-like, new Date()).view`, `rewardReady` from `.rewardReady`, and `qr` is `await qrSvg(card_token)`. On no card: `status:'none'`.

- [ ] **Step 1:** Rewrite `checkStatusAction` (`src/app/c/actions.ts`): validate phone (existing); call `enroll_card(program, phone)` to guarantee a card + get the token; call `card_view(program, phone)`; build `program-like = { type, config, stamps_required, reward_text }` and `card-like = { state, stamp_count: 0, reward_count: 0 }` from the row; `const p = getProgress(programLike, cardLike, new Date())`; `const qr = await qrSvg(row.card_token)`; return `{ status:'found', name: row.name, label: p.label, filled: p.view.filled, total: p.view.total, rewardReady: p.rewardReady, reward_text: row.reward_text, qr }`. On any rpc error, `console.error(...)` + `{status:'error', message:'Something went wrong.'}` (existing pattern). If `card_view` returns no row (inactive/unknown program) → `{status:'none', message:'We couldn\'t find that card.'}`.

- [ ] **Step 2:** Update `status-state.ts` — replace stamp-specific fields with the generic set: `status`, `name?`, `label?`, `filled?`, `total?`, `rewardReady?`, `reward_text?`, `qr?`, `message?`.

- [ ] **Step 3:** Update `check-form.tsx` — on `found`, render: the shop `name` (if not already an `<h1>` on the page), the dot row from `filled`/`total` (reuse the EXISTING dot markup, driving `stamped = i < filled`, `total` slots, last slot = reward `Gift`), the `label`, `Reward: {reward_text}`, the `🎉 Reward ready!` line when `rewardReady`, and — new — the QR: a bordered white tile containing `dangerouslySetInnerHTML={{ __html: qr }}` (constrain to ~180px, `[&_svg]:w-full [&_svg]:h-auto`) with caption "Show this to the shop". Keep the "Checking…" pending + error states.

- [ ] **Step 4:** `pnpm check && pnpm test && pnpm build` green; update the existing `check-status-action` test to the new return shape (mock `enroll_card`/`card_view` rpcs); commit `feat: type-agnostic /c card view with customer QR`.

---

## Self-Review

**Spec coverage (§2):** `/c` becomes the customer card view with per-type progress (engine `getProgress`, dots work for stamp+lucky) ✓; shop name ✓; customer QR from an opaque token (no PII) ✓; enrollment by phone (`enroll_card`) ✓; anon-safe via SECURITY DEFINER ✓; redeem/stamp stay vendor-gated (untouched) ✓. Vendor camera **scan** deferred to Phase 3b (uses `card_by_token`, added here) ✓.

**Placeholder scan:** Task 3 steps are directive but name exact functions, return fields, and reuse the existing dot markup — no vague catch-alls.

**Type consistency:** `card_view`/`enroll_card`/`card_by_token` signatures match across migration, `types.ts`, and the action; `getProgress` `.view.filled/.total/.rewardReady`/`.label` consumed as defined in Phase 1; `qrSvg` returns a string embedded via `dangerouslySetInnerHTML`.
