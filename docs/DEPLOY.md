# loopkit — Deploy & Attach Runbook

loopkit runs on the **shared Merqo Supabase project** (same one as qkit/merqo),
in its own `loopkit` schema. It reports to merqo over the HTTP metrics API.

Do the steps in order: **A (Supabase) → B (Vercel) → C (attach to merqo)**.

## A. Supabase (shared project)

1. **Expose the `loopkit` schema**: Settings → API → _Exposed schemas_ → add
   `loopkit` → Save. (Without this, supabase-js returns `PGRST106` for `loopkit.*`.)
2. **Apply the migrations** — SQL Editor, in order:
   - `supabase/migrations/0001_loopkit_core.sql` → Run. (Creates the `loopkit`
     schema, `programs`/`cards`/`stamp_events`, RLS, and the
     `owns_program`/`add_stamp`/`redeem`/`card_status` functions + grants.)
   - `supabase/migrations/0002_loopkit_stamp_cap.sql` → Run. (Caps `add_stamp`
     at the program's `stamps_required` so a full card can be redeemed without an
     extra stamp, and extends `card_status` to return the shop `name`. Safe to
     re-run; RLS/grants preserved.)
   - `supabase/migrations/0003_loopkit_admin.sql` → Run. (Adds the platform-
     operator admin: `admins` allow-list, `admin_audit` trail, the `is_admin`
     membership function, RLS, and grants. Backs the `/admin` console.)
   - apply `0004_loopkit_engine.sql` (additive columns + backfill; safe,
     idempotent). Adds the v2 engine columns — `programs.type`/`config`,
     `cards.state`/`last_event_at`, `stamp_events.payload` and a generalized
     `kind` check — then backfills existing rows. No function/RLS changes.
   - apply `0005_loopkit_record_visit.sql` (adds the generic `record_visit`
     RPC — SECURITY DEFINER, `owns_program`-gated; persists the state the
     TypeScript strategy computed and logs one event). Backs non-stamp types
     (Lucky Tap); the stamp card keeps its `add_stamp` path. Safe to re-run.
   - apply `0006_loopkit_card_token.sql` (adds the opaque `cards.card_token`
     column — the QR payload — plus the public SECURITY DEFINER `enroll_card`
     and `card_view` functions behind the customer `/c` page, and the owner-
     gated `card_by_token` for the Phase 3b vendor scan). No direct anon table
     access; existing rows are backfilled with distinct tokens on add.
   - apply `0007_loopkit_multiprogram.sql` (drops the one-program-per-vendor
     unique constraint so a vendor can own many programs, indexes
     `programs.vendor_id`, and adds the `vendor_pro` Pro allow-list + the
     `is_pro` SECURITY DEFINER predicate). The free/Pro limit — free = 1
     program, Pro = unlimited — is enforced in the `/setup` create action, not
     in SQL. Safe to re-run; existing single-program vendors stay valid.

     **Grant a vendor Pro (admin/SQL only; no self-serve billing yet).** Find
     the vendor's id under Authentication → Users, then in the SQL Editor run:

     ```sql
     insert into loopkit.vendor_pro (vendor_id) values ('<VENDOR_AUTH_USER_ID>');
     ```

   - apply `0008_loopkit_hardening.sql` (v2 hardening). Recreates `card_view` to
     also return the `stamp_count` column (so a stamp card's `/c` progress is
     correct); adds the `create_program` SECURITY DEFINER gate and **revokes
     direct `insert` on `loopkit.programs` from `authenticated`** so the free/Pro
     program limit is enforced in the database, not just the app; guards
     `enroll_card` to only seed cards for active programs; and **drops the
     redundant `card_status`** function (the `/c` page now reads `card_view`).
     Safe to re-run. After this migration, programs can only be created via the
     `create_program` RPC — vendors can still `select`/`update` their own rows.

   - apply `0009_loopkit_enroll_phone_guard.sql` — rejects malformed phone
     strings inside `enroll_card` so a direct anonymous RPC call can't seed junk
     cards. Safe to re-run.

   - apply `0010_loopkit_chance_types.sql` — widens the `programs.type` check
     constraint to admit `wheel` and `scratch`, the two chance-based templates
     (Spin-the-Wheel, Scratch Card). They share one weighted-outcome strategy
     in TypeScript (`src/lib/engine/chance.ts`) and reuse `record_visit` — no
     new tables/RPCs. Safe to re-run.

   - apply `0011_loopkit_streak_type.sql` — widens the `programs.type` check
     constraint to admit `streak`, the Streak Club template. Its lazy window
     derivation lives in TypeScript (`src/lib/engine/streak.ts`) and reuses
     `record_visit` — no new tables/RPCs. Safe to re-run.

   - apply `0012_loopkit_card_lifecycle.sql` — adds vendor-configurable card
     expiry (`programs.expiry_days`) and a public, phone-validated
     `regenerate_card` RPC (reissues a card's QR token and resets its
     progress — for a lost code or a fresh start after expiry). Recreates
     `create_program` (additive `p_expiry_days`, defaulted) and `card_view`
     (adds `expiry_days`/`cycle_started_at`) — same grants as before. Safe to
     re-run.

   - apply `0013_loopkit_upgrade_requests.sql` — adds `loopkit.upgrade_requests`
     (vendor self-files on hitting the free-tier program cap; admin resolves on
     `/admin/vendors` and grants Pro). No payment integration — same manual-
     fulfillment model as qkit's `purchase_requests`. Safe to re-run.

   - apply `0014_loopkit_head_start.sql` — adds `programs.head_start` (vendor
     opt-in, off by default) and updates `create_program`/`enroll_card` to seed
     new cards ~20% toward the first reward (Endowed Progress Effect) for
     stamp/plant/streak types. Chance types (wheel/scratch) are untouched — no
     accumulating goal to seed. Safe to re-run.

   - apply `0015_loopkit_vendor_join.sql` — adds `vendor_active_programs` (public,
     lists a vendor's active programs for the `/c` pre-phone preview) and
     `vendor_join` (public; enrolls a phone into every active program it lacks a
     card for, then returns all its cards at that vendor — including cards for
     programs since deactivated). Supersedes the old empty-phone `card_view` hack.
     Safe to re-run.

   - apply `0016_loopkit_program_replacement.sql` — adds `programs.replaced_by`
     and fixes the free-tier cap to count only _active_ programs (so
     deactivating a program to migrate its type doesn't permanently burn a free
     vendor's only slot). Recreates `vendor_join` to surface the replacement
     program's name for a retired card. Safe to re-run.

   - apply `0017_loopkit_vendor_profile.sql` — adds `loopkit.vendors` (lazily
     created on first `/profile` save; name/phone) and a public-read
     `vendor-images` storage bucket + per-vendor-folder write policies. Safe to
     re-run.

   - apply `0018_loopkit_carry_over.sql` — adds `programs.carry_over_stamps`
     (vendor opt-in). On program-type migration, seeds a new stamp card with the
     predecessor's stamp count (stamp→stamp only; takes precedence over
     head_start when it applies, falls back to head_start otherwise). Recreates
     `vendor_join` to also surface the replacement card's carried-over
     stamp_count. Safe to re-run.

   - apply `0019_qkit_earn.sql` — adds `loopkit.qkit_earn_config` (vendor's
     chosen stamp program + on/off toggle), `loopkit.qkit_earn_events`
     (one-award-per-order idempotency), and `cards.customer_name` (optional
     name capture alongside the phone-only identity model). Requires merqo's
     `0008_kit_events.sql` to already be live (see below). Safe to re-run.

   - apply `0020_qkit_earn_functions.sql` — adds `qkit_earn_lookup` and
     `qkit_earn_commit`, the anonymous-flow SECURITY DEFINER pair backing
     `/earn`. Gated by `merqo.kit_events` + `qkit_earn_events` instead of
     `owns_program`, since no vendor session exists on this customer-facing
     path. Safe to re-run.

   - **Optional — rate limiting on the public `/c` surface.** The card-check
     action is throttled per-IP only if an Upstash Redis is configured. Create a
     free Upstash Redis and set `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`
     in Vercel to enable it; leave them blank and the limiter fails open (no
     throttling). The `0009` phone guard works regardless.

   - **Bootstrap the first admin.** The `/admin` console 404s until your auth
     user is in `loopkit.admins` — there is no self-serve UI. Sign in once so the
     account exists, find its id under Authentication → Users, then in the SQL
     Editor run:

     ```sql
     insert into loopkit.admins (user_id) values ('<YOUR_AUTH_USER_ID>');
     ```

     An admin account has no vendor program: `/dashboard` redirects it to
     `/admin`.
3. **Auth** is shared — email + Google are already configured (qkit/merqo use
   them). Add loopkit's callback to Authentication → **URL Configuration →
   Redirect URLs**: `https://<loopkit-domain>/auth/callback`.

## B. loopkit on Vercel

1. Vercel → New Project → import `cljiahao/loopkit`.
2. Environment Variables (Production + Preview) — **same shared Supabase project**:
   - `NEXT_PUBLIC_SUPABASE_URL` = shared project URL
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` = anon key
   - `SUPABASE_SECRET_KEY` = service_role key
   - `NEXT_PUBLIC_BASE_URL` = `https://<loopkit-domain>`
   - `MERQO_METRICS_SECRET` = a fresh strong secret (generate one; used in step C)
3. Deploy. **Smoke**: `/` (landing) loads; `/login` → sign in → `/setup` (first
   run) → set up a card → `/dashboard` → stamp a phone; `/c?p=<programId>` shows
   the customer's progress.

## C. Attach to merqo

In the merqo Supabase SQL Editor, point merqo's `loopkit` registry row at this
deploy and flip it live (the row already exists as `coming_soon`):

```sql
update merqo.products
set status = 'live',
    app_url = 'https://<loopkit-domain>',
    metrics_url = 'https://<loopkit-domain>/api/merqo/metrics',
    metrics_secret = '<same MERQO_METRICS_SECRET as loopkit Vercel>'
where slug = 'loopkit';
```

Verify:

```bash
curl -H "Authorization: Bearer <MERQO_METRICS_SECRET>" https://<loopkit-domain>/api/merqo/metrics
```

→ `200` JSON with `product: "loopkit"` and the metric fields. `401` = secret
mismatch. merqo's `/team` then renders the loopkit card with live numbers — no
merqo code change needed.

## Notes

- Rotate the secret by updating both loopkit's Vercel env and merqo's
  `merqo.products.metrics_secret` for the loopkit row.
- Cross-kit data is normally HTTP-only (loopkit never queries another kit's
  schema from app code). One deliberate exception: the qkit-loopkit
  auto-award functions below read `merqo.kit_events` directly from inside a
  SECURITY DEFINER Postgres function — never via a Supabase JS client — since
  all three kits already share one Postgres instance and a same-DB read
  avoids an HTTP round-trip for a per-claim verification check.
- **qkit-loopkit auto-award**: apply `0019_qkit_earn.sql` and
  `0020_qkit_earn_functions.sql` before deploying the `/earn` page and
  dashboard setting code (same class as the 0006/0007 notes above — the
  page reads these tables/functions on every load and will 500 without them).
  Requires merqo's `0008_kit_events.sql` to already be live (the functions
  read `merqo.kit_events`).
