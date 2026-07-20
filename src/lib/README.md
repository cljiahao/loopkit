# lib

## Purpose

Domain logic and infrastructure for loopkit: program/card/customer CRUD,
the stamp/points/lucky-reward engine dispatch, stats, admin aggregation,
Supabase clients, and the HTTP contract with merqo (metrics + vendor
profile/status).

## Contents

- `action-result.ts` — `ActionResult<T>`: discriminated `{success:true}&T | {success:false,error}` return type shared by Server Actions
- `activity.ts` — `mapActivityRow` (pure event→row classifier) and `listActivity` (paginated, filterable vendor activity feed across programs, fetches `limit+1` rows to detect a next page)
- `admin-data.ts` — service-role reads for the `/admin` console: `listProgramsOverview`, `listVendors`, `listPendingUpgradeRequests`, `platformTotals`, `recentActivity`, `getProgramDetail`; resolves vendor email via `auth.admin.listUsers`
- `admin.ts` — `isAdmin`/`requireAdmin`: admin membership check via the `admins` table (RLS-gated) and a 404-on-fail gate for `/admin` routes and actions
- `auth.ts` — `requireVendor()`: vendor auth gate for server components/actions, redirects unauthenticated requests to `/login`
- `cards.ts` — `listCards`: the signed-in vendor's cards for one program, optional phone search, most-recently-updated first
- `customers.ts` — `aggregateCustomers` (pure phone-keyed merge of customers+cards across programs) and `listVendorCustomers` (impure shell, RLS-scoped)
- `engine/`
- `expiry.ts` — `isCardExpired`: pure day-elapsed check against a card's cycle start and the program's `expiry_days`
- `format.ts` — `formatSgtDateTime`/`formatSgtDate`/`sgtDateKey`: Asia/Singapore-pinned timestamp formatters and a calendar-day grouping key
- `image-resize.ts` — `resizeToWebp`: browser-only Canvas resize + WebP re-encode before upload, falls back to the original file on decode/encode failure
- `loyalty.ts` — `rewardReady`: one-line pure check that a stamp count has met the program's requirement
- `merqo-vendor-profile.test.ts` — vitest tests for `getOrCreateVendorProfile`: asserts the `.schema("merqo").rpc(...)` call shape and that a Postgres error is rethrown with context
- `merqo-vendor-profile.ts` — `getOrCreateVendorProfile`/`upsertVendorProfile`: hand-written mirror of merqo's cross-schema RPC contract, generic over the caller's own `Database`/schema so `"loopkit"`-scoped clients type-check, casts to `merqo` schema only for the RPC calls; `upsertVendorProfile` is the write path used by the profile page's social-links save
- `merqo-vendor-status.test.ts` — vitest tests for `resolveVendorStatus`: active/free, active/pro, case-insensitive email match, inactive-no-user, inactive-no-program cases
- `merqo-vendor-status.ts` — `resolveVendorStatus`: pure lookup mapping an email + auth-user list + program/pro vendor-id lists to `{active, plan}`, since neither `programs` nor `vendor_pro` carries an email column
- `metrics.ts` — `isWonVisit` (pure) and `computeLoopkitMetrics`: maps loopkit's stamp-card domain onto merqo's qkit-shaped metrics payload (programs→vendors, stamp/visit events→orders, no revenue/GMV in v1)
- `phone.ts` — `normalizePhone`: validates an SG mobile number (starts 3/6/8/9, 8 digits) and returns E.164 `+65…`
- `program-config.ts` — pure, server-import-free program config builders: `buildPlantConfig` (5-stage growth/decay config from a single visits-to-bloom knob) and `buildChanceConfig` (wheel/scratch segment config with fresh per-segment ids); kept free of `next/headers` so client bundles (`preview-state.ts`) can import it directly
- `program-health.ts` — `programHealth`: pure triage label ("new"/"quiet"/"active") from a program's customer count, age, and last-activity timestamp
- `program.ts` — `Program`/`SaveProgramInput` types, `programInputSchema`/`saveProgramSchema` (discriminated-union Zod schema per program type), `buildProgramFields`, `listPrograms`/`getProgramById`/`currentProgram`, `Entitlement`/`getEntitlement`/`canCreateProgram`/`canPrepProgram` (free vs. pro tier caps), `isPro`, `applyDueCutovers` (lazy scheduled-retirement cutover), `getProgram` (transitional single-program shim)
- `qr.ts` — `qrSvg`: renders a QR code as an SVG string via the `qrcode` package
- `rate-limit.ts` — `allowRequest`: per-IP sliding-window rate limit via optional Upstash Redis, dynamically imported and fail-open when unconfigured
- `stats.ts` — `classifyActivity`/`pctChange`/`bucketVisitsByDay`/`avgDaysBetweenVisits`/`computeCardStats` (pure aggregation pipeline) plus `getProgramStats`/`getVendorStats` (impure shells fetching cards+stamp_events) — powers the vendor stats dashboard
- `supabase/`
- `types.ts` — `Json` type, `SocialLinks` (shape of the shared `merqo.vendor_profile.social_links` JSONB column — not part of the `loopkit` schema), and the hand-written `Database["loopkit"]` interface (Row/Insert/Update per table), a manual mirror of `supabase/migrations/` kept in sync by hand (no live DB codegen yet)
- `utils.ts` — `cn` (clsx+tailwind-merge), `MS_PER_HOUR`/`MS_PER_DAY` constants, `formatPrice`, `centsToDollarString`, `genOrderNumber`, `parseDollarsToCents`, `orderHasPricing`, `count`, `formatOptions` — general-purpose formatting/shared helpers
- `vendor.ts` — `stallNameSchema`, `getVendorProfile`/`saveStallName`: the vendor's stall name, read from and written to the shared `merqo.vendor_profile` table (local `vendors.name` is only a lazy-create seed value)
- `vouchers.ts` — `listCardVouchers`/`oldestActiveVoucher`/`isPastExpiry`/`daysUntilExpiry`/`countJustExpired` (pure reads/derivations) and `expireStaleVouchers`/`grantRewardVoucher`/`redeemOldestVoucher` (RPC wrappers) over `reward_vouchers`, the reward-claim ledger backing Stamp/Plant/Wheel/Scratch/Lucky rewards

## Connectivity

`engine/` holds the pure per-program-type strategy implementations
(`stamp`/`lucky`/`plant`/`chance`), dispatched via `engine/index.ts`'s
`applyVisit`/`getProgress`; `program.ts` and `program-config.ts` build the
`config` blobs those strategies consume. `supabase/` provides the three
client factories (`client.ts` browser, `server.ts` cookie-backed + service,
`middleware.ts` session refresh) that every other file in this folder
depends on for reads/writes, all pinned to `db: { schema: "loopkit" }`
matching `types.ts`'s `Database` shape. `activity.ts`, `cards.ts`,
`customers.ts`, `stats.ts`, and `program.ts` are the vendor-facing RLS-scoped
data layer; `admin.ts`/`admin-data.ts` mirror the same tables via the
service-role client for the cross-vendor `/admin` console.
`merqo-vendor-profile.ts`/`merqo-vendor-status.ts`/`metrics.ts` form the HTTP
contract with the merqo parent app, reusing the same Supabase client
generically across schemas.

## Parent

[src](../README.md)
