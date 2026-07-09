# Dashboard nav qkit-parity + Pro plan page + self-serve upgrade gating

Date: 2026-07-10

## Problem

loopkit's dashboard nav diverged from qkit (its sibling kit) into a cramped
two-bar layout (thin header + separate bottom/top tab bar), and there is no
user-facing plan/upgrade page — the existing free/Pro gate (`vendor_pro`,
`isPro()`, `canCreateProgram()`) is enforced server-side but a free vendor who
hits the 1-program limit sees a dead-end message with no path forward, and
Pro can only be granted by an admin running SQL/clicking an admin toggle.

## Decisions (from brainstorming)

- Merge `DashboardNav` + `DashboardTabs` into a single sticky bar, matching
  qkit's architecture (brand, inline page-links, account menu, mobile burger
  instead of a fixed bottom tab bar). Nav container stays `max-w-2xl` to match
  loopkit's phone-first content width (unlike qkit's `max-w-7xl` admin-console
  layout).
- Account dropdown stays Profile + Sign out only — do not build qkit's
  Settings/Get-help/Feedback surfaces now; no spec for them yet.
- The existing multi-program switcher (`?p=` query param) moves into the
  merged nav bar, inline next to the brand, and only renders when a vendor
  has more than one program.
- Keep loopkit's tier model binary (free/pro) — no time-boxed "pass" tier
  like qkit's event pass; loopkit has no event-based use case for it.
- Add a qkit-style self-serve upgrade request flow: vendor clicks "Request
  upgrade" on `/dashboard/plan`, it inserts a row admins can see and resolve
  manually. No Stripe/payment integration (mirrors qkit's current
  manual-fulfillment state, not its dark Stripe path).
- Gate scope: formalize the existing single gate (1 program free / unlimited
  Pro) — do not invent new gates (stats ranges, program-type locks, etc.)
  without a real product need.

## A. Navbar

**Delete** `src/app/dashboard/dashboard-tabs.tsx`. **Rewrite**
`src/app/dashboard/dashboard-nav.tsx` into the single merged bar:

- `sm+`: one row — brand (left), program switcher (left, only if
  `programs.length > 1`), page-links (`Counter` `/dashboard`, `Customers`
  `/dashboard/customers`, `Activity` `/dashboard/activity`, `Grow`
  `/dashboard/grow`, `Plan` `/dashboard/plan`) styled as qkit's ghost buttons
  with `bg-primary/10 text-primary` active state, account menu (right,
  unchanged: initials avatar, `TierBadge`, Profile, Sign out).
- `<sm`: brand + account menu stay visible; page-links + program switcher
  collapse behind a `Menu`/`X` burger opening a slide-down panel (qkit's
  pattern). This removes today's fixed bottom tab bar.
- Program-switcher selection and every page-link href preserve `?p=`, same
  logic `DashboardTabs` uses today (`isActive()` prefix match,
  `p ? `${href}?p=${p}`` : href`).
- `layout.tsx`: fetch `listPrograms()` alongside `isPro()`
  (`Promise.all`), pass `programs` to `DashboardNav`, drop the separate
  `<DashboardTabs/>` render and the `pb-16 sm:pb-0` bottom-bar spacer.
  `DashboardNav` stays wrapped in `Suspense` (it's a client component reading
  `useSearchParams`).

## B. Data model + upgrade flow

New migration `supabase/migrations/0013_loopkit_upgrade_requests.sql`,
binary version of qkit's `purchase_requests`:

```sql
create table loopkit.upgrade_requests (
  id         uuid primary key default gen_random_uuid(),
  vendor_id  uuid not null references auth.users(id) on delete cascade,
  status     text not null default 'pending' check (status in ('pending','resolved')),
  created_at timestamptz not null default now()
);
create index upgrade_requests_pending_idx on loopkit.upgrade_requests (status, created_at desc);
alter table loopkit.upgrade_requests enable row level security;
create policy upgrade_requests_vendor_insert on loopkit.upgrade_requests
  for insert with check (vendor_id = (select auth.uid()));
create policy upgrade_requests_select on loopkit.upgrade_requests
  for select using (vendor_id = (select auth.uid()) or loopkit.is_admin((select auth.uid())));
create policy upgrade_requests_admin_update on loopkit.upgrade_requests
  for update using (loopkit.is_admin((select auth.uid())));
grant select, insert on loopkit.upgrade_requests to authenticated;
grant all on loopkit.upgrade_requests to service_role;
```

`requestUpgrade()` server action (`src/app/dashboard/plan/actions.ts`):
idempotent — no-op success if a pending request already exists for this
vendor, else inserts one. Same shape as qkit's `requestUpgrade` in
`src/app/actions/purchase.ts`.

`ProLock` component (`src/components/pro-lock.tsx`): qkit's exact pattern —
inline pill, `Lock` icon (lucide), links to `/dashboard/plan`. Wired into two
existing dead-end spots:

- `src/app/setup/page.tsx`'s free-plan card (currently static text, no link)
- `src/app/dashboard/profile/page.tsx`'s "Ask an admin for Pro" footer line

`/dashboard/plan` page (`src/app/dashboard/plan/page.tsx`): tier badge
header; if free, one card ("Pro — unlimited programs") with an `UpgradeCta`
button (client component, `useTransition` + `toast`, mirrors qkit's
`upgrade-cta.tsx`) calling `requestUpgrade()`; if pro, a static "you're on
Pro" message. Below: a simple 2-row Free/Pro comparison (just "Loyalty
programs — 1 / Unlimited"), not qkit's full feature grid — there is only one
real gate today.

Admin side: extend `src/app/admin/vendors/page.tsx` (already the vendor/Pro
page) with a "Pending upgrade requests" section above the vendor table —
email + requested-at, a "Grant Pro" button that calls the existing
`setVendorPro` action then marks the request `resolved` (new
`resolveUpgradeRequest` admin action, service-role, `requireAdmin()`-gated,
audit-logged like the other admin actions in `src/app/admin/actions.ts`). No
new admin page.

## Out of scope

- Settings page, Get-help/Feedback drawers (qkit account-menu parity beyond
  Profile/Sign out).
- Stripe/PayNow payment collection — stays manual/out-of-band like qkit today.
- Time-boxed pass tier.
- New Pro gates beyond program count.
