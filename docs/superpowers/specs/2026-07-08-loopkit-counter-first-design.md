# loopkit "Counter-first" redesign — design

**Status:** approved direction (2026-07-08, user: templates + dashboard IA + onboarding feel wrong; auto-mode — decided and proceeding). Research: `docs/superpowers/research` (this session's onboarding/check-in + dashboard-IA/template-catalog streams).

**Goal:** Fix three related complaints in one coherent redesign:

1. The vendor dashboard is a wall of information, not a fast counter tool.
2. Onboarding feels vendor-driven when it should be self-serve (customer scans to join).
3. Only 3 loyalty templates exist; the vendor wants visibly more variety (spin-the-wheel, points, etc).

**Key finding (already true, underused):** self-serve enrollment **already exists** — `/c?p=<id>` + `enroll_card` lets a customer type their own phone once and get their card + QR. The gap isn't missing infrastructure, it's that (a) the counter screen doesn't make **scan** the obvious default over typing a phone, and (b) there's no vendor-facing "Grow" surface framing `/c` as the thing to print and hand out. This redesign reframes existing pieces more than it builds new plumbing.

**Non-negotiables carried forward:** stamp/redeem stay vendor-gated (self-stamp fraud stays closed); RLS/gate model unchanged; no `/c` schema change beyond what's needed for new templates; every phase ships independently and green.

---

## Part 1 — Dashboard IA: Counter-first

**Model (research: Square splits POS-vs-back-office; Loopy's Stamper is one-button):** a persistent bottom tab bar, four tabs, **Counter is the default landing tab and holds only the identify+act job.**

| Tab                                             | Content (moved from today's single page)                                                                                                                                                                                                  |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Counter** (default `/dashboard`)              | ONLY: slim program bar (name+type badge+switcher, collapsed) + the identify control (Scan primary, phone secondary) → after identify, a result sheet (progress + primary action + Redeem-when-ready). No QR panel, no activity list here. |
| **Customers** (`/dashboard/customers`, exists)  | unchanged — the searchable list.                                                                                                                                                                                                          |
| **Activity** (`/dashboard/activity`, new route) | the recent-activity list, lifted verbatim off Counter.                                                                                                                                                                                    |
| **Grow** (`/dashboard/grow`, new route)         | the "Your customer card" QR/link/print panel, lifted verbatim, reframed as **"Get customers to join"** — this is where self-serve onboarding is explained and the join material lives.                                                    |

`Edit` moves into a small menu/kebab on the slim program bar (still `/setup?edit=`).

**Scan-first on Counter:** reorder the identify row so **Scan is the primary, large button**; phone entry becomes a secondary "or type a number" affordance (collapsed/smaller), not a peer-sized field. This directly answers "why do I have to type the phone" — you don't, by default; scanning is first.

**Component moves (no logic change, pure reorg):**

- New `src/app/dashboard/dashboard-tabs.tsx` (client, bottom-fixed on mobile / top on wider, `usePathname` active state) rendered from `dashboard/layout.tsx`.
- `dashboard/page.tsx` shrinks to: slim program bar + `<ServeCustomer>` only.
- New `dashboard/activity/page.tsx`: the activity list + query, moved as-is (scoped to current program via `?p=`).
- New `dashboard/grow/page.tsx`: the QR/link panel, moved as-is (scoped to current program via `?p=`).
- `serve-customer.tsx`: reorder Scan above the phone field; make Scan visually primary (large button, camera icon + "Scan to serve"); phone input becomes a smaller "or enter phone manually" row, collapsed behind a toggle/link if it reads cleaner, else just visually secondary. Keep Look-up as a small secondary action, not a peer button to the primary type-action.

## Part 2 — Onboarding: make self-serve the framed default

No new customer-facing plumbing — `/c` + `enroll_card` already do this. Changes are framing + a distinct entry:

- **`Grow` tab copy** reframes `/c` as a **join** flow for the vendor's own understanding: "Print this QR — new customers scan it to join instantly, no typing needed from you." (Today's copy already says "share this link"; sharpen it to explicitly separate join-yourself from vendor-assisted.)
- **`/c` page** (`src/app/c/page.tsx`, `check-form.tsx`): when a phone hasn't been entered yet, headline shifts from generic "Check your card" to "**Join {shop}**" for first-time framing, while still working for a returning customer checking progress (same form, sharper copy — `status==="none"` vs first-visit copy is cosmetic, no logic change).
- **Vendor phone-entry stays as assisted fallback** (per research: keep it for the customer who can't self-serve), just visually demoted on Counter (Part 1).
- **qkit auto-earn** (customer already identified in qkit → auto-stamp, no scan) is explicitly **deferred** — it requires cross-repo wiring into qkit's order-completion path and is its own project once qkit exposes an order-completed hook. Out of scope here.

## Part 3 — More templates (Wave 0 + Wave 1 only; rest deferred)

Per the research build order, ship the highest wow/effort-ratio templates that reuse existing engine patterns (no new infra):

- **Wave 0 — a shared "chance" strategy** generalizing Lucky Tap's proven pattern (server `payload.roll`, pity ceiling) to a **weighted multi-outcome** config, with two presentations:
  - **🎡 Spin-the-Wheel** — visible wheel, weighted prize segments (e.g. free item / 10% off / try again), same anti-fraud posture as Lucky (server-side RNG only).
  - **🎟️ Scratch Card** — same chance engine, a scratch-reveal presentation instead of a wheel.
  - Both are new `program.type` values (`wheel`, `scratch`) sharing one `chanceStrategy` factory, differing only in `ProgressView` kind + the on-counter reveal component.
- **Wave 1 — 🔥 Streaks** — consecutive-period visit tracking, reusing Sprout's proven lazy-time-derivation pattern (no cron): a period length + streak count derived from `last_visit_at`, reward at N, loss-averse "your streak resets if you skip a period."

**Explicitly deferred** (need new infra per research — separate future specs): Points-to-redeem (catalog UI + spend capture for $-based), Tiers (ongoing-perk model doesn't fit unlock-then-reset), Collect-a-Set (counter-side item picker), Challenges (windowed event queries), Referral (cross-card writes), qkit auto-earn.

---

## Rollout (phases for the plan)

- **Phase W1 — Dashboard IA** (Part 1 + Part 2 framing). Pure reorg + copy; no schema, no new server actions. Highest-impact, lowest-risk — ships first.
- **Phase W2 — Chance engine + Wheel + Scratch** (Wave 0). New migration (program type + config), new strategy, new UI, reuses `record_visit`.
- **Phase W3 — Streaks** (Wave 1). New migration/strategy, reuses Sprout's decay-derivation pattern.

## Testing

Each phase: unit tests for any new pure logic (chance weighting, streak derivation), a migration drift test where schema changes, `pnpm check/test/build` green, no regression to existing stamp/lucky/plant flows.
