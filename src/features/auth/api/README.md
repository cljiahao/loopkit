# api

## Purpose

Server-side auth logic: the vendor-auth guard and the phone-onboarding
server action.

## Contents

- `actions.ts` — `vendorPhoneOnboardAction`: `"use server"` action for
  unverified name+phone vendor onboarding; validates a trimmed 1-60 char
  name and an SG mobile number via `normalizePhone`, then upserts them onto
  the calling vendor's row (`vendor_id` from `requireVendor()`'s session
  user) — assumes the client has already established an anonymous Supabase
  session before calling
- `require-vendor.ts` — `requireVendor`: reads the current Supabase session
  and returns `{ user }`; redirects unauthenticated requests to `/login`
  (unlike merqo's identity-catalog-backed `requireVendor`, loopkit has no
  vendor catalog to 404 against)

## Parent

[auth](../README.md)
