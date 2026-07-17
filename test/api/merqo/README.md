# merqo

## Purpose

Vitest tests for the `src/app/api/merqo/` route handlers — the HTTP surface
merqo calls into loopkit over.

## Contents

- `metrics.test.ts` — `GET /api/merqo/metrics`: bearer-secret auth (missing/wrong → 401) and the happy-path metrics payload
- `qkit-earn-config.test.ts` — `GET /api/merqo/qkit-earn-config`: bearer-secret auth, missing `vendor_id` → 400, config lookup by vendor

## Parent

[api](../README.md)
