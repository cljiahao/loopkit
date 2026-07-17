# lib

## Purpose

Vitest unit tests for `src/lib/` domain logic — mostly pure-function tests;
a few (`cards.test.ts`, `vendor.test.ts`) mock the Supabase server client.

## Contents

- `activity.test.ts` — `mapActivityRow`: classifies a stamp/redeem/enroll event row into an activity feed entry
- `build-plant-config.test.ts` — `buildPlantConfig`: derives five named growth stages from a single visits-to-bloom knob
- `build-program-fields.test.ts` — `buildProgramFields`: per-type (stamp/lucky/plant/wheel/scratch) program field construction
- `cards.test.ts` — `listCards`: fetches a vendor's cards for one program, optional phone search, mocks `createServerClient`
- `customers.test.ts` — `aggregateCustomers`: merges one customer's cards across programs into a single row
- `engine/`
- `expiry.test.ts` — `isCardExpired`: day-elapsed check against a card's cycle start and the program's `expiry_days`
- `loyalty.test.ts` — `rewardReady`: stamp count vs. requirement check
- `metrics.test.ts` — `computeLoopkitMetrics`: maps programs/cards/stamp events onto merqo's metrics shape
- `phone.test.ts` — `normalizePhone`: SG mobile formats normalize to E.164 `+65…`
- `program-access.test.ts` — `currentProgram`/`canCreateProgram`/`getEntitlement`: free/Pro program-count gating
- `program-health.test.ts` — `programHealth`: "new"/"quiet"/"active" triage from customer count, age, last activity
- `program.test.ts` — `programInputSchema`/`canPrepProgram`/`getEntitlement`: program validation and tier caps
- `qr.test.ts` — `qrSvg`: renders a valid `<svg>…</svg>` string for a token
- `save-program-schema.test.ts` — `saveProgramSchema`: discriminated-union Zod validation per program type
- `stats.test.ts` — `classifyActivity`/`bucketVisitsByDay`/`computeCardStats`/`pctChange`/`avgDaysBetweenVisits`: stats aggregation pipeline
- `vendor.test.ts` — vendor profile actions: `saveStallName` upsert after `requireVendor`, mocked

## Parent

[test](../README.md)
