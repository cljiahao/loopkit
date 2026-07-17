# vendor-status

## Purpose

GET endpoint resolving a vendor's status by email for Merqo — used to look
up whether an email belongs to an active/Pro loopkit vendor.

## Contents

- `route.ts` — `GET`: bearer-auth via `bearerOk()`, validates an `email` query param with Zod, reads up to 1000 auth users plus `programs`/`vendor_pro` via the service-role client, resolves status with `resolveVendorStatus()`, returns it as JSON (documented known limitation: no pagination past the first 1000 auth users).

## Parent

[merqo](../README.md)
