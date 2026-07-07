# loopkit v2 core — design

**Status:** approved direction (2026-07-07), pending spec review → plan.

**Goal:** turn loopkit from a single-type (stamp card) tool into a **multi-template loyalty engine** with a **customer-facing** surface, delivering the flagship **🌱 Sprout** (grow-a-plant) template. Research basis: `docs/superpowers/research` (color/psychology/identity streams, 2026-07-07 session) — endowed-progress, variable-ratio, loss-aversion, pet-companion; SG check-in analysis; WCAG.

**In scope (this spec):**
1. A generalized, **event-sourced program engine** (strategy-per-type; progress derived on read).
2. Migrate the existing **stamp card** onto the engine (no behavior change for current vendors).
3. Two new templates: **Lucky Tap** (variable-ratio; engine proof) and **Sprout** (flagship gamified).
4. A **customer-facing card view** (mobile web, no app install) that shows progress + the customer's **QR**; **QR check-in** (vendor scans) as the new default, **phone entry** as the always-on fallback.

**Deferred (future specs, noted as roadmap):** Streak Club, Kaki Points, Bring-a-Kaki templates; NFC; Apple/Google Wallet passes; SMS/push re-engagement (loopkit is **no-SMS by design** — the wilt nudge is visible in the customer view for now). Tiers.

**Non-negotiables (carried from research):** stamp/redeem **actions stay vendor-gated** (anti-fraud); gold is a fill never small text; every progress state uses icon+shape not hue alone; customer surface never requires an app install.

---

## 1. Architecture — the program engine

Today's schema hard-codes one type (`programs.stamps_required`, `cards.stamp_count`). Generalize to **event-sourced + strategy-per-type**: the counter action is always "record an event for a customer"; each template is a pluggable strategy over the same event stream. State is a **cache** derivable by replaying events; **progress is computed on read** so time-based mechanics (wilt) need no cron.

### 1.1 Schema (migration `0004_loopkit_engine.sql`, additive + backfill)

Generalize, keeping existing rows working:

- **`programs`** — add:
  - `type text not null default 'stamp'` check in (`'stamp'`,`'lucky'`,`'plant'`).
  - `config jsonb not null default '{}'` — all per-type knobs (see §3).
  - Keep `stamps_required`/`reward_text` for backward compat; the stamp strategy reads them (or migrate them into `config` — see backfill).
- **`cards`** — this is the membership row; add:
  - `state jsonb not null default '{}'` — per-type state (growth, wins, etc.).
  - `last_event_at timestamptz` — for lazy time-decay.
  - Keep `stamp_count`/`reward_count` (stamp strategy + existing UI keep working during transition).
- **`stamp_events`** → keep the table (rename deferred to avoid churn); generalize `kind` check to (`'stamp'`,`'redeem'`,`'visit'`,`'win'`) and add `payload jsonb`. Existing rows stay valid.
- **Backfill:** for existing programs set `type='stamp'`, `config = jsonb_build_object('stamps_required', stamps_required, 'reward_text', reward_text)`; cards `state = jsonb_build_object('stamp_count', stamp_count)`. Idempotent.
- **New RPCs** are thin: keep `add_stamp`/`redeem`/`card_status` working for `type='stamp'`; add a generic **`record_visit(p_program uuid, p_phone text, p_payload jsonb)`** (SECURITY DEFINER, `owns_program` gated) that inserts an event and updates `last_event_at` + the card row; the **strategy logic lives in TypeScript** (server), not SQL, so the engine is testable and templates ship without migrations. The RPC just persists events/state the server computed. (Rationale: keep Postgres dumb, keep strategies in one testable place.)

RLS/grants mirror 0001 (vendor-scoped writes via SECURITY DEFINER fns / service role; `cards_own` select already lets a vendor read their cards; **customer** reads go through the public SECURITY DEFINER `card_status`-style path, extended per type).

### 1.2 The strategy interface (`src/lib/engine/`)

One module per type implementing:

```ts
type Progress = { stage: string; label: string; display: ProgressView; rewardReady: boolean };
interface Strategy<Config, State> {
  defaults(config: Config): State;                       // new card
  progress(state: State, config: Config, now: Date): Progress;   // derived (applies time-decay)
  apply(event: EngineEvent, state: State, config: Config, now: Date):
        { state: State; rewardUnlocked: boolean; payload: Json };  // fold one event
  redeem(state: State, config: Config): State;           // consume the reward, reset
}
```

- `src/lib/engine/index.ts` — a registry `STRATEGIES[type]` + `getProgress(program, card, now)` / `applyVisit(program, card, event, now)`.
- Server actions call the engine, then persist via `record_visit`/`redeem` RPCs. Progress is **never** stored as a live number for time-decayed types — always recomputed from `state` + `last_event_at`.
- Pure, fully unit-testable (no I/O). This is where the bulk of tests live.

---

## 2. Customer-facing surface

**Decision:** go customer-facing; keep the stamp/redeem *action* vendor-gated. Web only (no app install).

- **`/c?p=<programId>` (exists)** becomes the customer's card view for that shop: shop name, their progress rendered per type (dot row for stamp, plant for Sprout, "you won!" history for Lucky), and — once identified — **their QR** (encodes an opaque membership token, not the phone). Phone entry still available to look up.
- **Identity / check-in:**
  - **Default (new): customer shows QR → vendor scans.** Vendor dashboard gets a "Scan" button (camera via `getUserMedia` + a small QR-decode lib, e.g. `jsqr`/`@zxing/browser` — evaluate bundle size; lazy-load, camera only on the scan screen). Scanned token → resolves membership → same stamp flow.
  - **Fallback (always on): vendor types phone** (today's flow, unchanged).
  - **Enrollment:** customer opens `/c?p=…`, enters phone once → card created + a shareable link/QR shown. Or vendor types phone → card exists → customer can open the link later.
  - QR token = a random `card_token` (new column on `cards`, unique), resolvable only via a SECURITY DEFINER lookup that returns the membership id for a vendor-owned program. No PII in the QR.
- **Redeem stays vendor-confirmed** (vendor taps Redeem / scans the reward) → big "Redeemed ✓" state.
- **Celebration:** on the completing event, a lightweight confetti + "reward unlocked" reveal in both vendor + customer views (SVG/CSS, respects reduced-motion).

---

## 3. The three initial templates

### 3.1 `stamp` (existing — migrated onto the engine)
- **config:** `{ stamps_required: int(2..20), reward_text: string }`.
- **state:** `{ stamp_count: int }`.
- **progress:** dot row; `rewardReady = stamp_count >= stamps_required` (capped, per 0002).
- **apply(visit):** `stamp_count = min(stamp_count+1, stamps_required)`; unlock when reaching required.
- **redeem:** `stamp_count = 0`, `reward_count += 1`.
- No behavior change vs today; this validates the engine against a known-good type.

### 3.2 `lucky` — Lucky Tap (build first after engine)
- **config:** `{ win_probability: float, pity_ceiling: int, cooldown_visits: int, prize_pool: [{id,label,weight}], reward_text }`.
- **state:** `{ visits_since_win: int, total_wins: int }`.
- **apply(visit):** server-side RNG (never client). Win if `cooldown` satisfied AND (`random() < win_probability` OR `visits_since_win+1 >= pity_ceiling`). On win: pick weighted prize, `visits_since_win = 0`, `total_wins += 1`, `rewardUnlocked = true`, payload `{won:true, prize_id}`. Else `visits_since_win += 1`.
- **progress:** "🎲 tap to play" + "guaranteed win by visit N" (goal-gradient); win history.
- **redeem:** marks the specific win consumed.
- **Behavioral lever:** variable-ratio + pity ceiling (loss aversion). Lowest build cost — proves the engine end-to-end.

### 3.3 `plant` — 🌱 Sprout (flagship)
- **config:** `{ stages:[{name,threshold}], growth_per_visit:int, grace_days:int, decay_rate:float(per day), bloom_reward_text, species?:[] }`.
- **state:** `{ growth_at_last_visit:number, current_cycle:int, species:string, blooms:int }` (+ `cards.last_event_at`).
- **progress (derived, the crux):**
  ```
  daysIdle   = max(0, daysBetween(last_event_at, now))
  decayed    = max(FLOOR_GROWTH, growth_at_last_visit − decay_rate × max(0, daysIdle − grace_days))
  stage      = highest stages[].threshold ≤ decayed
  wilting    = decayed < growth_at_last_visit
  rewardReady= decayed ≥ bloomThreshold
  ```
  - **Grace period** (~5 days): weekly regulars never wilt.
  - **Floor at Sprout** — the plant droops, **never dies** (research: neglect-only punishment → churn).
  - **Wilt is a visible state** in the customer card (droopy plant art), not an SMS (no-SMS design); a push/SMS nudge is future.
- **apply(visit):** first settle decay into `growth_at_last_visit`, then `+= growth_per_visit`; if crosses bloom threshold → `rewardUnlocked`.
- **redeem (bloom):** reset to a fresh seed, `blooms += 1`, optionally next `species` (collection hook).
- **Tuning:** bloom in ~4–6 visits at the shop's natural cadence, faster than decay can meaningfully set back.
- **Art:** lightweight SVG stages (seed → sprout → leafing → budding → bloom) + a wilted variant; reduced-motion safe.
- **Behavioral lever:** pet-companion/Tamagotchi (ownership, non-habituating) + loss aversion + goal-gradient.

---

## 4. Vendor + admin flow changes

- **Create program (`/setup`)** becomes a **type picker**: choose Stamp / Lucky Tap / Sprout, then a type-specific config form (Zod-validated per type). Existing vendors keep their stamp program untouched.
- **Dashboard counter** stays "identify customer → one tap" for stamp/lucky/plant; Lucky shows the win/no-win result inline; Sprout shows the new growth stage. Adds the **Scan** entry point (QR) beside phone entry.
- **Admin** (`/admin/programs`) already lists programs — extend the triage/detail to be **type-aware** (show type badge; progress/stat labels adapt). The engine's `progress()` powers admin read views too.
- **Metrics** (`/api/merqo/metrics`) — keep mapping to merqo's qkit-shaped payload; `stamps_issued` generalizes to "events"; revenue stays 0. No merqo change needed.

---

## 5. Data flow

1. Vendor identifies customer (scan QR → token → membership, or type phone → membership; create if new).
2. Server action `requireVendor()` → load `program` + `card` → `engine.applyVisit(program, card, event, now)` (pure) → persist via `record_visit` RPC (event + new state + `last_event_at`) → `ActionResult` with the fresh `progress()` → toast + optimistic UI + `router.refresh()`.
3. Customer opens `/c?p=…` → public SECURITY DEFINER read returns program + (by token/phone) their `state` → `engine.progress(state, config, now)` renders the type-specific view.
4. Redeem: vendor-gated action → `engine.redeem` → persist.

## 6. Error handling
- All actions return `ActionResult`; **log the real Postgres error server-side** (already added), generic message to user.
- Degraded reads never fake success (show a clear "couldn't load" state).
- Engine strategies are total functions (no throw on normal input); invalid config caught by Zod at program creation.

## 7. Testing
- **Engine strategies:** exhaustive unit tests — stamp cap, lucky RNG (seeded/deterministic via injected rng + pity/cooldown), **plant decay math** (grace, floor, wilt, bloom, cycle reset) across time. This is the highest-value test surface.
- **Migration 0004:** schema drift guard (mirrors existing convention) + a backfill correctness check.
- **Actions:** contract tests for record_visit/redeem via mocked supabase.
- **e2e smoke:** create each program type → identify → visit → reward, gated behind live Supabase.

## 8. Rollout / phases (for the plan)
- **Phase 1 — Engine + stamp migration:** `0004` + `src/lib/engine/{index,stamp}.ts` + rewire existing stamp actions/pages through the engine. Ship: no user-visible change, everything green. (De-risks the abstraction against a known type.)
- **Phase 2 — Lucky Tap:** `lucky` strategy + type picker (Stamp/Lucky) + counter result UI. Ship: vendors can run a second type.
- **Phase 3 — Customer surface + QR:** `/c` card view per type, `card_token`, QR display + vendor Scan (camera). Ship: customer-facing, QR check-in default, phone fallback.
- **Phase 4 — Sprout:** `plant` strategy + decay math + SVG plant stages + celebration. Ship: the flagship.
- Each phase is independently shippable and reviewed.

## 9. Open questions (resolve during plan)
- QR-decode library choice + bundle impact (evaluate `@zxing/browser` vs `jsqr`; lazy-load).
- Whether to keep `add_stamp`/`card_status` RPCs long-term or fully route through `record_visit` (Phase 1 keeps them; can converge later).
- Plant art: hand-drawn SVG set vs a minimal geometric plant (lean geometric for load/offline + reduced-motion).
