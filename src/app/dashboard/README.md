# dashboard

## Purpose

Vendor console root: program grid, shared shop QR, scan-to-serve entry point, and the account nav/layout — plus the server actions (`actions.ts`) that back stamping, engine "visit" events, redemption, card regeneration, and QR-token resolution for the whole dashboard tree.

## Contents

- `actions.ts` — server actions (`stampAction`, `recordVisitAction`, `redeemPlantAction`, `regenerateCardAction`, `resolveTokenAction`, `lookupAction`, `redeemAction`, `saveQkitEarnConfigAction`) that stamp/play/redeem/regenerate cards and save qkit-earn config, each RLS-scoped via `requireVendor`
- `activity/`
- `card-link.tsx` — client `CardLinkActions`: copy-link and print-QR buttons for the shop QR block
- `card.ts` — exports the shared `StampCard` type `{ id, phone, stamp_count }` used across actions and form components
- `counter/`
- `customers/`
- `dashboard-nav.dom.test.tsx` — jsdom tests asserting `DashboardNav`'s inline nav links, mobile menu toggle, and account-dropdown item order (Profile/Settings/Plan/Get help/Feedback/Sign out, no duplicate Customers item), that Feedback opens the `FeedbackForm` Sheet, that Get help is a `mailto:` link, and that the dropdown label shows the stall name (or a "Your stall" fallback) with a static "Vendor account" subtitle, never the vendor's email
- `dashboard-nav.tsx` — client `DashboardNav`: sticky header with a left-hand group (mobile burger — left of the brand, opposite the account menu — brand, Dashboard/Customers/Activity/Stats nav links) and a right-hand account dropdown (Profile/Settings/Plan/Get help/Feedback/Sign out) with initials avatar and tier badge; the dropdown label shows the stall name (`vendorName || "Your stall"`) and a static "Vendor account" subtitle — matching qkit's dropdown exactly, never the vendor's email, which loopkit previously leaked into one of those two lines; Get help is a `mailto:` link, Feedback opens a `Sheet` rendering `FeedbackForm`; the mobile link panel closes on a tap-away scrim as well as the burger toggle
- `dashboard-page.dom.test.tsx` — jsdom test asserting `DashboardPage` renders a "Your programs" heading above the program grid alongside the Shop QR block and scan entry
- `dashboard-view.test.ts` — unit tests for `shouldShowQr` (hides QR block at zero active programs, shows it otherwise)
- `dashboard-view.ts` — exports `shouldShowQr(activeProgramCount)`, a pure helper deciding whether the shop QR block should render
- `layout.tsx` — async `DashboardLayout` server component: requires vendor auth, redirects admins to `/admin`, renders the sticky header with `DashboardNav`, and defines an inline sign-out server action
- `loading.tsx` — `DashboardLoading` skeleton fallback (pulse placeholders for header and cards) shown while the dashboard route segment streams
- `new-program-tile.dom.test.tsx` — jsdom tests for `NewProgramTile` linking to `/setup` when allowed, showing an upgrade prompt at the free-tier cap
- `new-program-tile.tsx` — `NewProgramTile`: trailing grid tile linking to `/setup` to add a program, or a Pro upgrade prompt when at the free-plan cap
- `page.tsx` — `DashboardPage` server component: loads programs, redirects to `/setup` on zero programs, renders the Shop QR block and "Scan a customer" button as a side-by-side quick-actions row (stacks to full-width on mobile) above a "Your programs" heading and the program card grid + new-program tile for active programs
- `plan/`
- `profile/`
- `program-card.dom.test.tsx` — jsdom tests for `ProgramCard` rendering name/badge/description, expiry/head-start detail lines, the Edit link, the whole-card stretched link to the counter page, and that its two links aren't nested inside each other
- `program-card.tsx` — client `ProgramCard`: one card per active program showing type badge, description, detail lines, an Edit link, and a stretched `Link` covering the whole card that opens its counter page (with a decorative chevron affordance) — tapping anywhere on the card opens the counter, replacing the old "Open Counter" button
- `program-display.test.ts` — unit tests for `PROGRAM_TYPE_BADGE`, `describeProgram`, and `programDetails` across every program type
- `program-display.ts` — exports `PROGRAM_TYPE_BADGE` map, `describeProgram()` (one-line reward-mechanic blurb per program type), and `programDetails()` (expiry/head-start detail lines)
- `program-switcher.dom.test.tsx` — jsdom tests for `ProgramSwitcher`: renders "All programs" plus each program, preserves other URL params, hides itself with only one program
- `program-switcher.tsx` — client `ProgramSwitcher`: same-page Select control that switches the `p` query param across Stats/Activity/Customers views, preserving other params; accepts optional `triggerId`/`triggerClassName` to render as a bare standalone control (Customers, Stats — the default) or as one field among others sharing a card's border/background (Activity, via `ActivityFilters`)
- `qkit-earn-settings.dom.test.tsx` — jsdom tests for `QkitEarnSettings`: shows upgrade prompt when not Pro, lets a Pro vendor pick a program and toggle the switch
- `qkit-earn-settings.tsx` — client `QkitEarnSettings` form: Pro-gated switch + program picker that calls `saveQkitEarnConfigAction`
- `redeem-button.dom.test.tsx` — jsdom test asserting `RedeemButton`'s confirm dialog shows the exact stamp count and carryover wording
- `redeem-button.tsx` — client `RedeemButton`: AlertDialog-confirmed redeem control that calls `redeemAction` and reports the reset card back to the caller
- `scan-and-route.dom.test.tsx` — jsdom tests for `ScanAndRoute`: passes the "Scan a customer" label through and routes to the resolved card's Counter page with phone pre-filled
- `scan-and-route.tsx` — client `ScanAndRoute`: an `ElevatedCard` wrapping `ScanButton` with a "Scan a customer to stamp or redeem" caption, routing a scanned card to `/dashboard/counter` for its own program with the phone pre-filled
- `scan-button.dom.test.tsx` — jsdom tests for `ScanButton`'s default and custom label rendering
- `scan-button.tsx` — client `ScanButton`: opens a camera modal, decodes a QR via `@zxing/browser`, resolves the token through `resolveTokenAction`, and reports `{ phone, programId }`
- `serve-customer.tsx` — client `ServeCustomer`: the full serve flow (stamp/lucky/plant/wheel/scratch) — scan-or-manual phone entry, primary action + lookup, per-type result rendering (stamp progress, lucky win, plant growth, wheel/scratch), redeem and regenerate-card dialogs, reward celebration
- `settings/`
- `shop-qr-block.dom.test.tsx` — jsdom tests for `ShopQrBlock`'s join copy (named programs vs. generic fallback) and rendered link
- `shop-qr-block.tsx` — `ShopQrBlock`: an `ElevatedCard`-based shared shop-wide QR code panel with join copy naming active programs, the raw link, and `CardLinkActions`; the link-text column uses `self-stretch sm:self-auto` so it's actually width-constrained (and its `truncate` takes effect) in the mobile `flex-col` layout, where the parent's `items-start` alone doesn't stretch flex children to the container width
- `stats/`

## Connectivity

`layout.tsx` wraps every route below (including all 7 subfolders) with vendor-auth enforcement and the `DashboardNav` header; its inline sign-out action posts through the nav's dropdown form. `page.tsx` is the dashboard home, composing `ShopQrBlock` (fed by `card-link.tsx`'s copy/print actions), `ScanAndRoute` (which wraps `scan-button.tsx` and routes into `counter/`), and a grid of `program-card.tsx` cards (styled via `program-display.ts`) plus `new-program-tile.tsx`. `actions.ts` is the shared server-action surface: `serve-customer.tsx` (used by `counter/`) calls `stampAction`/`recordVisitAction`/`lookupAction`/`redeemPlantAction`/`regenerateCardAction`, `redeem-button.tsx` calls `redeemAction`, and `scan-button.tsx` calls `resolveTokenAction`; `qkit-earn-settings.tsx` (used by `settings/`) calls `saveQkitEarnConfigAction`. `card.ts`'s `StampCard` type is shared by `actions.ts`, `redeem-button.tsx`, and `serve-customer.tsx`. `program-switcher.tsx` is a cross-cutting control reused by the `activity/`, `customers/`, and `stats/` subfolders to filter their merged views by program. `dashboard-view.ts`'s `shouldShowQr` gates whether `page.tsx` renders the QR/scan/grid block or an empty-state message.

## Parent

[app](../README.md)
