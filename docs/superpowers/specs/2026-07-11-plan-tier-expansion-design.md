# Plan/pricing tier expansion

Date: 2026-07-11

## Problem

`/setup`'s free-tier cap and `/dashboard/plan`'s comparison table are both
thin: one gated capability (program count), one feature row. The user wants
the plan page "expanded, similar to qkit." qkit's plan page is richer in two
independent ways that must not be conflated:

1. **A unified entitlement model** — `getEntitlement()` resolves one
   `Entitlement` object (`maxBooths`, `maxMenuItems`,
   `maxOptionGroupsPerItem`, `autoCloseHours`, `stockCaps`, `statsRanges`)
   from `(plan, licenseExpiresAt, now)`, and every gate in the app
   (`canAddBooth`, `canAddMenuItem`, `canHaveOptionGroups`, stats range
   picker) reads that one object instead of branching on tier name directly.
2. **A third tier** — `pass`, a time-boxed, per-event license, priced
   per-day. This exists because qkit's unit of sale is naturally
   event-shaped (a vendor works one market day, wants the full kit for that
   day, doesn't want a subscription).

**These don't both apply to loopkit.** (1) is a portable code-quality
pattern regardless of tier count. (2) is not portable by inspection — a
loyalty program is inherently ongoing (a shop's stamp card doesn't have a
"day" it applies to), so there's no obvious loopkit analogue to a
time-boxed pass. Inventing one without a real business reason would be
scope creep. This spec treats (1) and the comparison-table richness as the
buildable part, and treats a third tier as blocked on a business answer
(see Open questions).

## What does NOT change

- Two tiers: `free` / `pro`. No third tier is added by this spec.
- `vendor_pro` as the source of truth for Pro status (`src/lib/program.ts:313-322`)
  — no `licenseExpiresAt`/time-boxed license concept, since there's no pass
  tier to expire.
- The free-tier cap itself: 1 active program. Not touched — only how the
  cap (and any future caps) are represented in code.
- `/setup`'s and `/setup/actions.ts`'s call sites keep calling a boolean-ish
  gate function for program creation — behavior identical, only the
  function each calls changes (below).

## What changes

### A. Entitlement object — `src/lib/program.ts`

Today, "Pro" gates exactly **one** thing in the whole codebase:
`canCreateProgram(count, pro)` (`src/lib/program.ts:308-310`), called from
`src/app/setup/page.tsx:39-43` and `src/app/setup/actions.ts:89-91`.
`isPro()` (`program.ts:313-322`) is otherwise only read for **display**
(profile page badge, plan page badge/copy, dashboard layout) — not gating.

This is a much thinner footprint than qkit's six-axis `Entitlement` (which
justifies its refactor because six call sites would otherwise each hand-rll
tier checks). Porting the _pattern_ is still worth doing — it gives
Section B's richer comparison table real gates to point at instead of
decorative checkmarks — but the object starts small and grows only as real
gated features are added, not speculatively:

```typescript
export type Tier = "free" | "pro";

export interface Entitlement {
  tier: Tier;
  maxActivePrograms: number | null; // null = unlimited
}

const FREE: Entitlement = { tier: "free", maxActivePrograms: 1 };
const PRO: Entitlement = { tier: "pro", maxActivePrograms: null };

export function getEntitlement(pro: boolean): Entitlement {
  return pro ? PRO : FREE;
}

export function canCreateProgram(
  ent: Entitlement,
  activeCount: number,
): boolean {
  return ent.maxActivePrograms === null || activeCount < ent.maxActivePrograms;
}
```

`canCreateProgram`'s signature changes from `(count, pro)` to `(ent,
count)` — both call sites (`setup/page.tsx:40-43`, `setup/actions.ts:90`)
update to call `getEntitlement(pro)` first, same as they already call
`isPro()` first today. `isPro()` itself (`program.ts:313-322`) is
unchanged — it's the DB read; `getEntitlement` is the pure resolver layered
on top, mirroring qkit's split between "read the vendor's raw plan state"
and "resolve it to capabilities."

### B. Richer comparison table — `src/app/dashboard/plan/page.tsx`

Current table (`plan/page.tsx:83-94`) has one row. Add every real,
user-visible difference between Free and Pro that exists in the codebase
today — no invented features:

| Feature                | Free | Pro       |
| ---------------------- | ---- | --------- |
| Loyalty programs       | 1    | Unlimited |
| Loyalty card templates | ✓    | ✓         |
| Change card type       | ✓    | ✓         |
| Stats dashboard        | ✓    | ✓         |

Honest finding: **beyond program count, there is currently no other
Free/Pro differentiation anywhere in loopkit** (confirmed by grep — every
other `isPro`/`vendor_pro` reference is either the admin toggle, the merqo
status API, or a display badge, not a second gate). So the table either
stays a 1-row table truthfully, or new gates get invented first — which is
a product decision, not a spec-B implementation detail. Recommend shipping
the table with the program-count row plus whatever the user decides to
actually gate (Section C options), rather than padding it with parity rows
that don't gate anything (that would be misleading, since qkit's other
rows — "unlimited items," "auto-close hours," "stock caps" — describe real
qkit-specific gates loopkit has no equivalent feature for at all).

### C. Options for what else Pro could gate (pick zero or more)

Not designed in detail here — these are candidate second-axis gates,
listed because "expand the plan page" implies _something_ new should be
Pro-exclusive, and the user should pick before implementation, not have one
picked for them:

- **Stats history range** — loopkit's stats (`src/lib/stats.ts`) has no
  range picker today (unlike qkit's 24h/7d/30d/90d gate) — could gate a
  future range picker the same way, if/when Section E (stats expansion,
  separate spec) adds one.
- **Template access** — all templates open to both tiers today
  (`src/lib/templates.ts`); could reserve some as Pro-only, mirroring
  qkit's item-count-style gates. No evidence the user wants this — flagging
  only because it's the shape qkit uses.
- **Nothing new** — keep Free/Pro differentiated by program count alone,
  ship Section A+B only. This is the recommended default: it's honest about
  what the product actually gates today, and the `Entitlement` object from
  Section A makes adding a real gate later a small change, not a
  refactor.

## Testing

- `test/lib/program.test.ts` — extend: `getEntitlement(false)` returns
  `FREE`/`maxActivePrograms: 1`, `getEntitlement(true)` returns
  `PRO`/`maxActivePrograms: null`; `canCreateProgram` unit tests updated
  for the new `(ent, count)` signature (same cases as today's
  `canCreateProgram(count, pro)` tests, re-expressed).
- `test/app/save-program-action.test.ts` / any `/setup` action test
  currently asserting the free-tier cap — update the mocked call to the new
  signature, behavior assertions unchanged.
- No new UI tests needed for Section B (static comparison-table content).

## Out of scope

- A third tier (qkit's "pass" equivalent) — no analogous time-boxed unit of
  sale identified for loopkit's product; needs a business answer first (see
  Open questions), not a technical design.
- DB-backed/admin-configurable pricing (qkit's `pricing` table,
  `src/lib/pricing.ts`) — loopkit's Pro upgrade is already a manual
  message-us flow (`UpgradeCta`, unchanged); no price _values_ are
  displayed today to make configurable.
- Any new gated capability beyond program count (Section C lists
  candidates; none are committed).
- `statsRanges`-style gating — depends on the separate stats-expansion spec
  (Sub-project E) actually adding a range picker first.

## Open questions for Clarence

1. **Does a third tier concept exist yet?** If yes: what's the time-boxed
   or otherwise-differentiated unit it sells (there's no obvious
   "event day" equivalent for an ongoing loyalty card — is it a trial
   period? A per-campaign pass? Something else)? If no: this spec assumes
   **no**, ships Section A+B only, and a third tier becomes its own future
   spec once there's a concrete offer to design against.
2. Should anything beyond program count become Pro-gated now (Section C),
   or does Free vs. Pro stay differentiated by program count alone for
   now? Recommend: alone for now — invent gates when a real feature needs
   one, not preemptively.
