# Vendor identity & profile UI

Date: 2026-07-11

## Problem

Loopkit has no vendor identity beyond `auth.users` — no `vendors` table
exists at all (`src/lib/auth.ts:5-8` says so explicitly: "unlike merqo's
requireVendor... loopkit has no such catalog"). `programs.vendor_id`
references `auth.users(id)` directly. Two consequences:

1. There's no stall/business name anywhere — `DashboardNav`'s account badge
   and dropdown label are built from **email** (`initials(email)`,
   `dashboard-nav.tsx:60-66,178`; `email` shown raw at `dashboard-nav.tsx:185`).
   A vendor can't set a customer-facing business name, and "why can't two
   vendors share the same stall name" is moot — no such field exists to
   collide on.
2. `/dashboard/profile/page.tsx` and `/dashboard/plan/page.tsx` both render
   plan tier + an upgrade prompt (`profile/page.tsx:29-62` shows a `Badge`
   plus, if free, a `ProLock`; `plan/page.tsx:42-47,62-81` shows the same
   `Badge` plus, if free, a full pricing card). Two pages, two different UI
   treatments, same fact. qkit avoids this by strict separation: its
   `/profile` page (`qkit/src/app/dashboard/profile/profile-form.tsx`) is
   pure identity (stall name, profile icon, display name, email, password)
   and never mentions plan/tier at all — tier only shows in the nav dropdown
   badge and on the dedicated plan page.

Also missing relative to qkit: a profile photo (qkit's `ImageUploader` +
`resizeToWebp` pattern, stored in `auth.users.user_metadata.avatar_url`, no
DB column needed).

**Note on scope already covered:** loopkit's navbar (`dashboard-nav.tsx`,
`dashboard/layout.tsx:53`) already has a sticky header, an account dropdown
(avatar + tier badge + email + Profile link + Sign out), and a `size-8`
rounded-md avatar badge with a ring — i.e. it already structurally matches
qkit's pattern. The gap is narrower than a first pass suggests: the avatar's
initials are computed from email instead of a stall name (because no stall
name exists), and there's no photo upload. This spec closes those two gaps
and the profile/plan duplication — it does not need a navbar rebuild.

## What does NOT change

- `dashboard-nav.tsx`'s overall structure (sticky header, dropdown menu,
  `size-8` avatar shape, tier badge, mobile burger panel) — reused as-is.
- `/dashboard/plan/page.tsx`'s content — it already owns tier/upgrade
  messaging correctly; this spec only removes the duplicate from `/profile`.
- Auth methods, RLS on `programs`/`cards`, `vendor_pro`, or any engine code.
- `requireVendor()`'s signature — vendor profile lookup is additive, not a
  replacement for the `auth.users` check.

## What changes

### A. New table — `supabase/migrations/0017_loopkit_vendor_profile.sql`

A `loopkit.vendors` row per vendor, created lazily (not at signup — loopkit
has no onboarding step today; a vendor's first `programs` insert is their
first real action). Mirrors `vendor_pro`'s shape (`0007_loopkit_multiprogram.sql:10-15`:
`vendor_id` as primary key referencing `auth.users`, not a surrogate id).

Schema note: `phone` is included here (nullable, unused by this spec) even
though this spec never writes it, because sub-project B (vendor phone
onboarding) needs the same table with the same primary key shape. One
migration, owned by whichever spec ships first — B's draft explicitly
consumes this table rather than redefining it. Do not let both specs create
`loopkit.vendors` independently.

```sql
create table loopkit.vendors (
  vendor_id  uuid primary key references auth.users(id) on delete cascade,
  name       text,
  phone      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table loopkit.vendors enable row level security;

create policy vendors_own on loopkit.vendors
  for all using (vendor_id = (select auth.uid()))
  with check (vendor_id = (select auth.uid()));

grant select, insert, update on loopkit.vendors to authenticated;
grant all on loopkit.vendors to service_role;

-- Public-read bucket for vendor profile photos. Public because the stamp
-- card / /c pages are unauthenticated and may eventually show a vendor
-- photo to customers (out of scope here, but no reason to block it later
-- with a private bucket now).
insert into storage.buckets (id, name, public)
values ('vendor-images', 'vendor-images', true)
on conflict (id) do nothing;

create policy vendor_images_public_read
  on storage.objects for select
  using (bucket_id = 'vendor-images');

create policy vendor_images_vendor_insert
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'vendor-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy vendor_images_vendor_update
  on storage.objects for update to authenticated
  using (
    bucket_id = 'vendor-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy vendor_images_vendor_delete
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'vendor-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
```

No uniqueness constraint on `name` — duplicate stall names across vendors
are explicitly allowed (user requirement). `name` is nullable: a vendor who
never sets one keeps working exactly as today (falls back to email-based
initials, see Section C).

`src/lib/types.ts` gains a `vendors` table entry (Row/Insert/Update, same
shape as `vendor_pro`'s entry).

### B. `src/lib/vendor.ts` (new)

Vendor-profile reads/writes live here rather than growing `program.ts`
(which is program/engine concerns) or `auth.ts` (which is the auth gate
only, per its own comment about deliberately not being a catalog lookup).

```typescript
import { z } from "zod";
import { requireVendor } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase/server";

export const stallNameSchema = z.object({
  name: z.string().trim().min(1).max(60),
});

export type VendorProfile = {
  name: string | null;
};

// The signed-in vendor's profile row, or a name:null default if they've
// never set one — RLS (vendors_own) scopes this to auth.uid() already, so
// there's nothing to distinguish "not found" from "not theirs."
export async function getVendorProfile(): Promise<VendorProfile> {
  const supabase = await createServerClient();
  const { data } = await supabase.from("vendors").select("name").maybeSingle();
  return { name: data?.name ?? null };
}

export async function saveStallName(name: string): Promise<{ error?: string }> {
  const { user } = await requireVendor();
  const parsed = stallNameSchema.safeParse({ name });
  if (!parsed.success) return { error: "Enter a stall name." };

  const supabase = await createServerClient();
  const { error } = await supabase
    .from("vendors")
    .upsert(
      {
        vendor_id: user.id,
        name: parsed.data.name,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "vendor_id" },
    );
  if (error) return { error: "Couldn't save your stall name. Try again." };
  return {};
}
```

`saveStallName` is a plain async function (not a `useActionState`-style
server action) called from a client component the same way qkit's
`updateStallName` is — a `"use server"` file wrapping it 1:1, per this
repo's existing split between plain server actions
(`src/app/setup/actions.ts`) and this narrower case.

### C. Avatar/initials source — `dashboard-nav.tsx`

`initials()` (`dashboard-nav.tsx:59-66`) takes a `label: string` instead of
specifically `email` — same splitting logic, just fed the stall name when
present:

```typescript
const label = vendorName?.trim() || email;
```

`DashboardNav` gains two new props: `vendorName: string | null` and
`avatarUrl: string | null`. `dashboard/layout.tsx` fetches both alongside
`isPro()`/`listPrograms()` via `getVendorProfile()` and
`user.user_metadata?.avatar_url ?? null`.

Avatar rendering (`dashboard-nav.tsx:174-179`) gains the image branch, same
shape as qkit's inline avatar (`qkit/dashboard-nav.tsx` equivalent, not
re-read in full here but same `MediaImage`-or-initials pattern already
described in the research): if `avatarUrl` is set, render an `<Image
fill>` inside the existing `size-8 rounded-md ring-1 ring-inset` wrapper;
else keep today's initials span. Next.js `<Image>` (not qkit's
`MediaImage` wrapper, which doesn't exist in loopkit) needs the
`vendor-images` Supabase Storage hostname added to
`next.config.ts`'s `images.remotePatterns` — check this file exists and
has a `remotePatterns` array before assuming; if there's no existing remote
image config in loopkit at all, this is a new addition, not an edit.

Dropdown label (`dashboard-nav.tsx:183-190`) shows stall name as the
primary line when set, email as a secondary line — today it's just email;
swap to:

```tsx
<p className="truncate text-sm font-semibold">{vendorName ?? email}</p>;
{
  vendorName && (
    <p className="truncate text-xs text-muted-foreground">{email}</p>
  );
}
```

### D. Profile page rewrite — `src/app/dashboard/profile/page.tsx` + new `profile-form.tsx`

Becomes a server component that fetches `getVendorProfile()` +
`requireVendor()`'s `user` and renders a new client `ProfileForm`
(mirrors qkit's `Section`-per-concern layout, trimmed to what loopkit
actually has — no separate "display name" concept, since loopkit has never
had one and nothing asked for it):

- **Stall name** section — `Input` + `saveStallName` action, same
  save-button-disabled-until-changed pattern as qkit.
- **Profile photo** section — new `src/components/image-uploader.tsx`
  (ported from qkit, `vendor-images` bucket instead of `booth-images`,
  single `thumb` variant only — loopkit has no banner use case, so the
  `variant` prop and `banner` sizing can be dropped rather than carried
  over unused). Saves via `supabase.auth.updateUser({ data: { avatar_url
} })`, same as qkit — no new DB write path needed.
  `src/lib/image-resize.ts` ports verbatim (framework-agnostic, no qkit
  dependencies).
- **Email** — read-only display, same as today.
- **Change password** — `supabase.auth.updateUser({ password })`, new to
  loopkit (didn't exist before), ported from qkit's pattern.

Plan/tier/`ProLock`/card-count block (today's `profile/page.tsx:29-62`) is
**removed entirely** — that information now lives only on `/plan`.

### E. `/plan` page — no structural change, one addition

Add a link back to `/dashboard/profile` near the tier badge (qkit doesn't
need this since its nav dropdown always has a Profile entry — loopkit's
does too, so this is optional polish, not a gap). Skip unless it reads as
missing in review.

## Testing

- `test/lib/vendor.test.ts` (new) — `stallNameSchema` accepts/rejects
  (empty, >60 chars, whitespace-only trims to empty and rejects);
  `saveStallName` mocked-Supabase happy path calls `upsert` with the right
  `vendor_id`/`name`, and surfaces `{ error }` on a Supabase error without
  throwing.
- `test/lib/dashboard-nav-initials.test.ts` or extend an existing
  component test if one covers `dashboard-nav.tsx` — confirm `initials()`
  is fed stall name when present and falls back to email when `null`.
- `test/db/vendor-profile-schema.test.ts` (new, matching this repo's
  existing regex-based migration tests like
  `test/db/program-replacement-schema.test.ts`) — asserts the migration
  creates `loopkit.vendors` with `vendor_id` primary key + RLS +
  `vendors_own` policy, and the `vendor-images` bucket insert +
  storage.objects policies are present.
- Manual/visual check (per this repo's UI-change convention): profile page
  no longer shows plan/tier; nav avatar shows initials from stall name once
  set; uploading a photo replaces the initials badge; removing it reverts.

## Out of scope

- Any change to `/dashboard/plan`'s content beyond an optional back-link —
  it already owns this information correctly.
- A `display_name` concept separate from stall name — qkit has one
  because it distinguishes "shown to customers" (stall name) from
  "how the app addresses the vendor" (display name); loopkit's dropdown
  and page copy don't currently make that distinction anywhere else, so
  adding it here would be new surface area nothing asked for.
- Deleting orphaned Storage objects when a vendor replaces/removes their
  photo — qkit doesn't do this for avatars either (only for booth images,
  via a separate cleanup path); best-effort orphan, not a data-loss risk
  since the bucket is small per-vendor.
- Making `name` required — a vendor who never opens `/profile` keeps
  working exactly as before, on email-derived initials.
- Any onboarding-flow change to _collect_ a stall name at signup (loopkit
  has no onboarding step today at all) — this spec only adds the field and
  a place to set it after the fact. Whether onboarding grows a "what's your
  stall name" step is part of the onboarding spec (sub-project B), not this
  one.

## Open questions for Clarence

1. **Bucket name** — used `vendor-images` (parallel to qkit's
   `booth-images`). Fine, or prefer something else?
2. **`next.config.ts` remote image config** — didn't confirm whether
   loopkit's `next.config.ts` already has a `remotePatterns`/`images`
   block for any other remote source. If it doesn't, this is the first
   one; worth a quick look before implementation starts so the plan can
   say "add" vs. "extend" precisely.
3. Section D drops qkit's separate "display name" field (see Out of
   scope) — confirm that's right, or if you actually want that
   private/internal-only name concept too.
