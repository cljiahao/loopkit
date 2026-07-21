# admin

## Purpose

Merqo-team internal admin console — the gated layout, shared nav, and shared
figure/badge helpers used by the overview, programs, and vendors screens.

## Contents

- `actions.ts` — Server Actions (all admin-only via `requireAdmin()`): `setProgramActive`, `setVendorPro`, `removeCard`, `resolveUpgradeRequest`, each writing via the service-role client and appending an `admin_audit` row.
- `admin-nav.tsx` — `AdminNav` client component: the Overview/Programs/Vendors tab bar, highlighting the active section by path.
- `health-badge.ts` — `HEALTH_BADGE` map from `ProgramHealth` to a Badge variant/label, shared by the programs list and the program detail header.
- `layout.tsx` — `AdminLayout`: gates every `/admin` route with `requireAdmin()`, renders the header (wordmark, Admin badge, sign-out) and `AdminNav`.
- `page.tsx` — `AdminOverviewPage`: platform-wide totals (programs, customers, stamps, rewards) and a recent cross-shop activity feed, wrapped in `ElevatedCard`.
- `programs/`
- `stat.tsx` — `Stat`: a small labeled-value tile (`ElevatedCard`-based) used across the admin overview and program detail pages.
- `vendors/`

## Connectivity

`programs/` and `vendors/` are the two admin sections linked from
`admin-nav.tsx`'s tab bar; both render inside `layout.tsx`'s gated shell.
Their page/detail components pull shared pieces from this folder — `stat.tsx`
for figure tiles, `health-badge.ts` for health badges, and `actions.ts` for
the Server Actions their client components call (`Manage` in
`programs/[id]`, `ResolveUpgradeRequestButton` and `VendorProToggle` in
`vendors/`).

## Parent

[app](../README.md)
