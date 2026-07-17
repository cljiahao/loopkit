# profile

## Purpose

Vendor profile page at `/dashboard/profile` — lets a vendor edit their stall name, profile icon, private display name, and sign-in password, each saved independently.

## Contents

- `actions.ts` — server actions `updateStallNameAction()` (persists via `saveStallName`, revalidates the dashboard layout) and `updatePasswordAction()` (Zod-validates an 8-72 char password, updates it via the Supabase auth client).
- `page.tsx` — `ProfilePage` server component; requires a vendor, loads the vendor profile and auth `user_metadata` display name, and renders `ProfileForm`.
- `profile-form.tsx` — `ProfileForm` client component; four independently-saving cards (stall name via server action, avatar via `ImageUploader` + browser auth client, display name via browser auth client, password change with client-side confirm match).

## Parent

[dashboard](../README.md)
