# merqo

## Purpose

Merqo-facing route handlers — bearer-token-authenticated GET endpoints the
Merqo platform polls for metrics, vendor status, and qkit earn-config.

## Contents

- `metrics/`
- `qkit-earn-config/`
- `vendor-status/`

## Connectivity

All three subfolders expose a single GET `route.ts` and share an identical
`bearerOk()` constant-time bearer-token check against
`MERQO_METRICS_SECRET` (each copy is commented as "ported verbatim" from
qkit's / the sibling routes', kept in lockstep by hand rather than a shared
import). `metrics/` returns platform-wide counts, `vendor-status/` resolves
a single vendor's status by email, and `qkit-earn-config/` returns whether a
vendor's qkit-earn integration is enabled.

## Parent

[api](../README.md)
