# Vendor phone-OTP onboarding

Date: 2026-07-11

## Problem

`/login` (`src/app/login/page.tsx`) only offers two vendor sign-in paths:
Google OAuth (`signInWithOAuth`, lines 63-76) and email+password
(`signUp`/`signInWithPassword`, lines 84-121). Clarence wants a third:
name + phone number, so a vendor can pick whichever they prefer. No prior
art for this exists in loopkit or in qkit (qkit also ships only Google +
email/password — confirmed by the parallel qkit research pass, no
`signInWithOtp`/phone hits anywhere in its `src/`). This is a genuinely new
build, not a port.

Two things complicate "just add phone auth":

1. **loopkit has no `vendors` table at all.** Unlike qkit
   (`vendors.name`, a real row per vendor), loopkit's vendor identity is
   bare `auth.users` — `requireVendor()` (`src/lib/auth.ts:9-16`) returns
   only `{ user }`, and every vendor-scoped query filters by
   `auth.uid()` directly (RLS `programs_own`, no join table). There is
   nowhere to put a vendor's display name today. Spec A (vendor identity &
   profile UI) also wants a name field — **this spec and Spec A both need
   the same piece of schema.** Whichever lands first should add it; the
   other should consume it, not add a second name field.
2. **Real phone verification costs money and needs a provider.** Supabase
   Auth's phone flow (`supabase.auth.signInWithOtp({ phone })` to send a
   code, `supabase.auth.verifyOtp({ phone, token, type: "sms" })` to
   confirm) only works once an SMS provider is wired up in the Supabase
   project's Auth settings — Supabase does not send SMS itself. As of
   Supabase's current docs, supported providers are Twilio, Twilio Verify,
   MessageBird, Vonage, and TextLocal; each needs its own account,
   API keys entered into the Supabase dashboard, and bills Clarence
   per message sent. This is an operational/billing decision outside the
   codebase, not something this spec can silently assume.

## Two designs — pick one

### Option 1 (recommended): unverified name + phone

Vendor types a name and a Singapore phone number, no SMS round-trip. This
is **not** Supabase Auth's phone provider — Supabase Auth requires a
verified phone (OTP) to use `phone` as a session identity; without OTP
there's no session to establish that way. Instead, do what loopkit's
customer side already does: treat phone as a plain identity value, not an
auth credential.

- Reuse `normalizePhone()` (`src/lib/phone.ts:1-10`) and its `+65[3689]`
  validation — the same SG-mobile rule already enforced customer-side in
  `checkStatusAction` and DB-side in `vendor_join`'s regex check
  (`supabase/migrations/0016_loopkit_program_replacement.sql:63`).
  Consistent validation, not a new rule invented for vendors.
- Auth mechanism: **email OTP** (`supabase.auth.signInWithOtp({ email })`,
  Supabase's built-in magic-link/OTP flow) using an auto-derived
  placeholder email is a bad fit (defeats "no email needed"). Instead: use
  Supabase's **anonymous sign-in**
  (`supabase.auth.signInAnonymously()`) to establish a real session, then
  attach `{ name, phone }` to that user via `loopkit.vendors` (new table,
  see below) or `user_metadata`. The phone is stored as vendor-supplied
  data, not verified — same trust model as a customer typing their own
  phone number at `/c` today (no verification there either).
- Trade-off, stated plainly: a vendor could type someone else's number.
  Low actual risk here — the phone isn't used to receive money or reset a
  password, only to identify/label the vendor and (per Spec D, if it
  reuses this) contact them about card changes. If Spec D later wants to
  _SMS_ vendors, that reopens the provider-cost question; out of scope
  here.
- Zero new cost, zero external account to set up. Ships immediately.

### Option 2: verified phone OTP (real SMS)

Full `signInWithOtp({ phone })` / `verifyOtp()` flow, phone becomes a real
`auth.users.phone` identity Supabase manages (rotatable, used for
`auth.uid()` like any other identity).

- Requires: pick an SMS provider (Twilio is the most common Supabase
  pairing), create an account, configure it in Supabase Dashboard → Auth →
  Providers → Phone, add the API keys as project secrets. This is a
  one-time setup step Clarence has to do outside this repo — I can wire
  the client code but can't provision a Twilio account.
- Ongoing per-message cost, exact pricing not something I know precisely
  enough to quote — needs to be checked against Twilio's current SG SMS
  rates before committing, since Supabase's own pricing page doesn't set
  SMS cost (the provider bills separately).
- Stronger identity guarantee — matters if phone ever becomes the login
  credential for account recovery, not just a display field.

**Recommendation: Option 1.** The stated need ("name and phone number,
whichever vendor prefers") reads as a low-friction alternative to Google,
not a security-hardening request — Option 2's cost and setup overhead
isn't justified unless phone verification is needed for something else
later (e.g. SMS-based card-change notifications in Spec D). Start with
Option 1; upgrading to Option 2 later is additive, not a rewrite, since
the `loopkit.vendors.phone` column stays the same either way — only the
auth mechanism around it changes.

## What does NOT change

- Google OAuth flow (`src/app/login/page.tsx:63-76`, `/auth/callback`) —
  untouched, stays the default "fast path."
- Email+password flow — untouched, kept for existing accounts.
- `requireVendor()`'s contract of returning `{ user: User }` — still true
  regardless of which sign-in path was used; anonymous-auth users are
  still real Supabase `User` objects.
- `src/proxy.ts` / `updateSession()` (`src/lib/supabase/middleware.ts`) —
  the protected-path gate (`/dashboard`, `/setup`) checks `getUser()`
  only; doesn't care which provider issued the session.
- Customer-side phone identity (`/c`, `vendor_join`, `cards.phone`) —
  entirely separate concept, not reused or merged with vendor phone
  identity (see Open Questions).

## What changes

### A. Schema — reuses Spec A's `loopkit.vendors` table

No new table here. Spec A (vendor identity & profile UI) already adds
`loopkit.vendors (vendor_id, name, phone, created_at, updated_at)` with RLS
policy `vendors_own` — this spec writes `phone` into that same row instead
of defining its own table. **If this spec is implemented before Spec A**,
pull Spec A's migration forward as this spec's schema step instead of
writing a second, differently-shaped `vendors` table — the two must never
both run `create table loopkit.vendors`.

No uniqueness constraint on `name` or `phone` — mirrors the explicit ask
elsewhere in this dump ("we can onboard new users with the same stall name
or company name"). `phone` stored in loopkit's own E.164 `+65XXXXXXXX`
format via `normalizePhone()`, same as the `cards` table.

### B. Onboarding UI — `src/app/login/page.tsx`

Add a third entry point alongside "Continue with Google" and the
email/password form: a collapsed "Continue with name & phone" toggle that
reveals two inputs (Name, Phone) and a submit button. On submit:

1. `supabase.auth.signInAnonymously()` — establishes a session.
2. Upsert `{ vendor_id: user.id, name, phone: normalized.phone }` into
   `loopkit.vendors` (server action, validated with a small Zod schema
   reusing `normalizePhone`) — same table/column shape Spec A's
   `saveStallName` writes to, just also setting `phone`.
3. Redirect to `/dashboard` same as the other two paths.

Returning vendors who signed up this way have no password/email to sign
back in with — `signInAnonymously()` on a device without the original
session cookie creates a **new** anonymous identity, not the same
account. This is a real limitation of Option 1, called out explicitly in
Open Questions rather than glossed over.

### C. `requireVendor()` — no signature change

Still returns `{ user }`. Callers that want the vendor's name/phone read
`loopkit.vendors` separately (same pattern Spec A's profile page will use)
— `requireVendor()` itself stays auth-only, doesn't grow a DB read every
call site doesn't need.

## Testing

- `test/lib/phone.test.ts` — already exists for `normalizePhone`; no
  change needed, reused as-is.
- `test/app/vendor-onboard-action.test.ts` (new) — mocks
  `signInAnonymously` + `vendors` insert; covers: invalid phone rejected
  without an insert, empty name rejected, happy path inserts once and
  redirects, duplicate name/phone both allowed (asserts no uniqueness
  check is applied).
- `test/db/vendors-schema.test.ts` (new, matching the pattern of
  `test/db/program-replacement-schema.test.ts`) — regex-match the new
  migration file for the table, RLS policy, and grants.

## Out of scope

- Real SMS/OTP verification (Option 2) — deferred; revisit only if a
  later spec (e.g. Spec D's customer/vendor notifications) needs a
  verified phone as a contact channel, not just a display label.
- Linking a returning anonymous vendor back to their original account
  from a new device/browser — Option 1 has no recovery path for this;
  flagged in Open Questions, not solved here.
- Merging vendor phone identity with the existing customer phone identity
  model (`cards.phone`) — kept fully separate, see Open Questions.
- Any change to `/dashboard`, `/setup`, or other post-login vendor pages —
  this spec ends at "vendor has a session and a `loopkit.vendors` row."

## Open questions for Clarence

1. **Option 1 (unverified, free) vs. Option 2 (verified OTP, real SMS
   cost + provider setup)** — recommending Option 1 above. Your call,
   especially if you already have a Twilio account or see phone
   verification as valuable beyond onboarding (e.g. fraud prevention).
2. **If Option 2:** which provider — Supabase supports Twilio, Twilio
   Verify, MessageBird, Vonage, TextLocal. I don't have current per-SMS
   pricing for any of them; you'd need to check rates before we commit
   spend.
3. **Should vendor-side phone identity relate to customer-side phone
   identity at all** (e.g., could a vendor also be recognized as a
   "customer" of their own or another vendor's program using the same
   number), or should they stay fully separate concepts as designed above?
   Current draft keeps them separate — flag if that's wrong.
4. **Option 1's device-recovery gap** (anonymous sessions don't survive a
   cleared browser/new device) — acceptable for a first cut, or does this
   need a fallback (e.g. "forgot my anonymous account" flow) before
   shipping?
