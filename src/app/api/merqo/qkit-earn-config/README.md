# qkit-earn-config

## Purpose

GET endpoint reporting whether a given vendor has qkit-earn integration
enabled, and for which program.

## Contents

- `route.ts` — `GET`: bearer-auth via `bearerOk()`, requires a `vendor_id` query param, reads `qkit_earn_config` (joined to `programs.name`) via the service-role client, returns `{ enabled: false }` or `{ enabled: true, program_name }`.

## Parent

[merqo](../README.md)
