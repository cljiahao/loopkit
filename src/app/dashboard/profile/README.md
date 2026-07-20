# profile

## Purpose

Vendor profile page at `/dashboard/profile` — lets a vendor edit their stall name, social/website links, profile icon, private display name, and sign-in password, each saved independently.

## Contents

- `actions.test.ts` — unit tests for `updateSocialLinksAction`: saves valid links while preserving the existing `stall_name`, rejects an invalid URL without calling `upsertVendorProfile`, errors when not signed in, and errors (without revalidating) when the upsert throws.
- `actions.ts` — server actions `updateStallNameAction()` (persists via `saveStallName`, revalidates the dashboard layout), `updatePasswordAction()` (Zod-validates an 8-72 char password, updates it via the Supabase auth client), and `updateSocialLinksAction()` (Zod-validates each link as an optional URL, preserves the shared `merqo.vendor_profile` row's `stall_name` while upserting `social_links`).
- `page.tsx` — `ProfilePage` server component; requires a vendor, loads the vendor profile and auth `user_metadata` display name, reads the shared `merqo.vendor_profile` row's `social_links` (degrading to `{}` on failure, same pattern as `/setup`'s page), and renders `ProfileForm`.
- `profile-form.dom.test.tsx` — jsdom tests for `ProfileForm`: renders all 5 sections, prefills the social-links fields from `socialLinks` and saves them via `updateSocialLinksAction`, saves the stall name via `updateStallNameAction`.
- `profile-form.tsx` — `ProfileForm` client component; five independently-saving `Section` cards (stall name via server action, social/website links via `SocialLinksFields` + server action, avatar via `ImageUploader` + browser auth client, display name via browser auth client, password change with client-side confirm match).

## Parent

[dashboard](../README.md)
