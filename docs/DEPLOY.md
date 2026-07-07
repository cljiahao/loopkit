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
- loopkit never reads another kit's schema; cross-kit data is HTTP-only.
