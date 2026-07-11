# QR model + customer identity

Date: 2026-07-11

## ⚠ This spec opens on a contradiction, not a problem statement

Yesterday's merge (`50b9e72`, folded into
`docs/superpowers/specs/2026-07-11-loyalty-templates-and-migration-design.md`
lines 31-39) made a **deliberate, explicit** decision:

> "the vendor-level join QR (`/c?v=<vendor_id>`, one QR per shop, auto-enrolls
> into every active program) stays exactly as it is. No per-program join QR,
> no separate customer-stamping QR system."

That was shipped in commit `50b9e72` ("vendor-level Grow QR, drop program
scoping from the Grow nav link") and locked in by name in the very next
spec's "What does NOT change" section. It reads as a considered call, not an
oversight — someone chose vendor-level over per-program on purpose, one day
before this dump.

Clarence's new ask: "QR code will be unique to the loyalty card similar to
how QR is unique to each booth in qkit."

These two statements are in direct tension. This spec does not resolve that
tension for you — it lays out what's actually true today, what qkit's model
does and doesn't map onto, and asks you to consciously pick, rather than
silently overriding yesterday's decision or silently keeping it.

## What's actually true today (read before deciding anything)

Two QR codes already coexist in loopkit, and they are **not** the same kind
of QR:

1. **Join QR** — vendor-scoped, `/c?v=<vendor_id>`
   (`src/app/dashboard/grow/page.tsx:21`). One per shop. Scanning it lands a
   customer on `/c`, they type their phone, `vendor_join`
   (`supabase/migrations/0015_loopkit_vendor_join.sql:22-55`) auto-enrolls
   that phone into _every_ active program at that vendor and returns every
   card the phone holds. This is the piece `50b9e72` made vendor-level.

2. **Stamp QR** — already per-card, not per-vendor.
   `src/app/c/actions.ts:88`: `qrSvg(row.card_token)` — every `cards` row has
   its own unique `card_token`, rendered as its own QR
   (`src/app/c/program-card-status.tsx:114-121`, "Show this to the shop").
   Vendor-side, `src/app/dashboard/scan-button.tsx` opens a camera, decodes
   that QR, and `resolveTokenAction` (`src/app/dashboard/actions.ts:305`)
   resolves the token straight back to a phone + program, which
   `ServeCustomer` (`src/app/dashboard/serve-customer.tsx:395-402`) feeds
   into the stamp/play/water action for that program.

So the "vendor scans customer's unique QR based on the loyalty card to issue
a stamp" ask from the dump — **already built, already shipped, no gap.**
Only the _join_ QR is vendor-level.

## What qkit's model actually is (and where the analogy breaks)

qkit's per-booth QR (`src/lib/booth-code.ts`, `booth-qr-poster.tsx`) is a
static rotatable `short_code` on the `booths` row — one QR per booth,
scanning it lands on an anonymous, no-login order form
(`src/app/o/[code]/page.tsx`). Customers never authenticate; a placed order
is remembered only in the browser's `localStorage`
(`src/lib/recent-orders.ts`, explicit comment: "Customers are unauthenticated,
so there is no server record tying an order to a device").

Two consequences for the "customer logs into loopkit to retrieve their QR"
ask:

- The **join-QR-per-entity** part of qkit's pattern (one static, regeneratable
  QR per booth/program) is directly reusable prior art — _if_ you decide the
  join QR should be per-program.
- The **customer login** part has **zero prior art in either codebase.**
  qkit is guest-only by design. loopkit today is guest-only too — pure
  phone-number identity, no password, no session
  (`src/app/c/actions.ts:28-33,112-116`, explicit comments confirming this).
  Building real customer accounts would be new ground for both kits, not a
  port.

## Decision 1 — does the join QR go back to per-program?

Three options, not a recommendation baked in:

**(a) Keep vendor-level (reaffirm yesterday's decision).** Zero work. A
customer scans once, sees every active program at that shop. Downside: a
vendor running several programs (Pro tier) can't print/hand out a QR for
just one of them — e.g. a promo table for a single seasonal card.

**(b) Revert to per-program join QR**, mirroring qkit's per-booth model. One
`short_code`-style QR per `programs` row, printed per card. Undoes `50b9e72`
and the "What does NOT change" line in yesterday's spec — a vendor with 3
active programs now manages 3 join QRs instead of 1. More granular, more
vendor overhead, more surface to explain to a small-vendor user who may not
want to think about "which QR is which."

**(c) Both — vendor-level QR stays as the default/onboarding QR, each
program additionally gets its own shareable join link/QR** for targeted
use (e.g. a promo flyer for one card). No regression from today, additive.
Slightly more surface area to build (need a `programs.join_code` or reuse
`id`-based route per program) and to explain in the UI (two kinds of QR on
`/dashboard/grow` or wherever Grow's content moves to — see Decision 3).

No default recommendation stated here — this is squarely a business call
about how vendors actually want to hand out QRs, and it directly reverses a
decision made less than 24 hours ago. State explicitly which of (a)/(b)/(c)
you want before any implementation plan is written for this spec.

## Decision 2 — customer accounts: full login, or is `card_token` already enough?

The dump's ask: "once user onboarded, it'll generate a unique QR code that
can be retrieved by login in to loopkit if they are the customer."

**(a) Full customer accounts.** Real auth — phone OTP (Supabase phone
provider, real per-message SMS cost) or magic-link email, persistent
session, a customer-facing `/account` area listing all their cards/QRs
across every vendor they've joined. This is a genuinely new subsystem: new
auth flow, new session handling, new customer-facing pages, ongoing SMS
cost if phone-based. Biggest-scope option by far.

**(b) No new auth — today's model already satisfies the ask.** A customer's
`card_token` QR (`src/app/c/actions.ts:88`) is already a durable,
retrievable credential: lose it, go back to `/c?v=<vendor>`, type the same
phone number, `vendor_join` re-derives every card that phone holds — no
password, nothing to remember but a phone number they already know. There's
also `regenerateCardAction`
(`src/app/c/program-card-status.tsx:39-52`) for the actual-loss case. Under
this read, "login in to loopkit" in the dump may describe a _mental model_
("go back to the site and get my QR") that the phone-number flow already
delivers, not a literal password-login feature. Zero new work, but doesn't
give a customer one unified view across multiple vendors, and "type your
phone number" is weaker to say out loud than "log in."

**(c) Middle ground — no new auth system, just make the existing flow feel
like an account.** E.g. a "Save this shop" affordance that stores
`/c?v=<vendor>` as a bookmark/home-screen shortcut per vendor client-side, or
a lightweight cross-vendor landing page keyed purely by phone number (type
your number once, see every vendor you've joined) without any password/OTP.
Cheap, no new auth surface, but the phone number itself remains the entire
security model (mildly guessable/social-engineerable — already true today,
not a new exposure).

**Recommendation:** (b), possibly evolving toward (c) later, unless there's
a concrete reason a customer needs to act as an authenticated identity
across vendors (e.g. a future customer-facing feature that requires knowing
"this is definitely the same person," not just "someone who knows this phone
number"). (a) is a real subsystem with real ongoing cost (SMS) and should
only be built if there's a specific feature that needs it — flag if you have
one in mind that isn't in this dump yet.

## Decision 3 — Grow → Counter merge (not contradictory, concrete proposal)

Straightforward, independent of Decisions 1 and 2. loopkit's nav already has
a page named **Counter** (`src/app/dashboard/dashboard-nav.tsx:22`,
`href: "/dashboard"` — today's "Serve a customer" page,
`src/app/dashboard/page.tsx:55-72`). "Merge Grow into the counter" is
already named in the existing IA — this is a file move, not a naming
decision.

Proposed change: fold `src/app/dashboard/grow/page.tsx`'s QR-display block
(the join-QR card + copy link, lines 48-61) into `src/app/dashboard/page.tsx`
as a collapsed/secondary section below "Serve a customer" (e.g. a "Get new
customers" disclosure or a second card). Drop the `Grow` entry from `LINKS`
in `dashboard-nav.tsx:26` and delete `src/app/dashboard/grow/`. No RPC/schema
changes — same `qrSvg(cardLink)` call, same `/c?v=<user.id>` link, just
relocated. If Decision 1 lands on (b) or (c), this section becomes "your
join QRs" (plural) instead of one QR — sequence this merge _after_ Decision
1 is settled so it isn't done twice.

## What does NOT change (regardless of Decision 1/2 outcome)

- `card_token`/`qrSvg`/`resolveTokenAction`/`ScanButton` stamp-issuing flow
  — already per-card, already correct, untouched by this spec.
- `cards`/`stamp_events` schema, engine `Strategy` code.
- Phone number as the customer's sole identity key at the data layer — even
  under Decision 2(a), phone stays the underlying join key; an added auth
  layer would sit on top, not replace `cards.phone`.

## Testing

Deferred to the implementation plan once Decisions 1/2 are made — the test
surface differs enormously between "no new work" (Decision 1a + 2b) and
"new phone-OTP subsystem" (Decision 2a), so writing a test plan now would be
guessing.

## Open questions for Clarence

1. **Join QR scope** (Decision 1) — (a) keep vendor-level as shipped
   yesterday, (b) revert to per-program, or (c) both? This directly reverses
   `50b9e72` if you pick (b) or (c) — confirm that's intentional.
2. **Customer accounts** (Decision 2) — (a) full login/OTP subsystem, (b)
   keep today's phone-number-is-the-credential model (recommended), or (c)
   a no-auth "feels like an account" middle ground? If you lean (a), what's
   the concrete feature that needs a real authenticated cross-vendor
   customer identity — is it in this dump already or something new?
3. Does Grow→Counter merge (Decision 3) proceed regardless of how 1/2
   land, or should it wait until the join-QR scope is settled (recommended,
   since the section's content — one QR vs. several — depends on Decision 1)?
