# Dashboard/Setup/Profile UI-UX Pass — Design Spec

## Problem

Three vendor-facing areas need work, per user feedback (item 4 of the loopkit UX cleanup list):

1. **Profile settings** (`/dashboard/profile`) is missing a "Social & website" section — qkit's equivalent page has one, backed by the shared `merqo.vendor_profile` table loopkit already partially uses. loopkit only reads that table (`getOrCreateVendorProfile`, used today by `/setup` for the vendor name); it never writes to it, so social links have no save path.
2. Dashboard and `/setup`'s create-card flow "look quite bad" — flat, unstyled cards with no visual hierarchy, compared to qkit's more polished look.
3. Beyond visuals, both dashboard and `/setup` have layout issues confirmed during brainstorming (see Decisions below): the dashboard's QR/Scan blocks waste vertical space above the program grid, and `/setup`'s live preview can scroll out of view while filling in a long Rules section.

## Decisions (confirmed via brainstorming, including a visual mockup pass)

- **Card look:** adopt qkit's spacing/hierarchy pattern (icon badge, eyebrow/title/description, generous padding, soft lifted shadow) but **not** qkit's literal "kitchen ticket" scalloped-paper theme — that's food-stall-specific branding qkit owns deliberately; loopkit is a general small-vendor kit. New primitive, no scallop.
- **Dashboard layout:** the Shop QR block and "Scan a customer" button become a side-by-side quick-actions row (stacks to full-width on mobile, same breakpoint pattern `ShopQrBlock` already uses internally) instead of two stacked full-width blocks. The program grid gets an explicit "Your programs" heading above it (today it has none).
- **`/setup` layout:** the type picker, Basics card, and Rules card become one flowing main column (top-to-bottom order matches how a vendor actually fills the form); the live preview card docks in a side column that stays in view (`sticky`) while the main column scrolls, on `lg`+ viewports. Below `lg`, it collapses to a single column with the preview shown inline after the type picker (same as today's mobile behavior — no new mobile-specific design needed).
- **Profile social links:** port qkit's pattern exactly — `merqo.vendor_profile.social_links` (already shared infra, RPC-backed), `SocialLinksFields` component, `website`/`instagram`/`facebook`/`tiktok` fields with brand icons via `@icons-pack/react-simple-icons` (new dependency, already a proven, small package in the sibling qkit repo).
- **Sequencing:** PR #13 (`/setup` create/manage split + card-type family picker) is merged into `main` first (done); this work branches fresh from updated `main` (worktree `uiux-polish`, branch `worktree-uiux-polish`) rather than stacking on PR #13's branch.

## Components

### `src/components/elevated-card.tsx` (new)

A plain primitive: `rounded-[20px] border` + a two-layer soft shadow (`shadow-[0_1px_0_0_var(--border),0_12px_28px_-20px_rgba(0,0,0,0.35)]` — matches the brainstorm mockup's "style C"), subtle background tint (`bg-card`). No scallop, no dashed edges, no food-ticket theming. Accepts `as?: "div" | "section"` like qkit's `Ticket` (for semantic `<section>` usage) but nothing else from that API — this is a deliberately smaller primitive since loopkit doesn't need `Ticket`'s shadow/dashed/clip/borderColor variants (all of which exist in qkit to serve _other_ qkit-specific card contexts like order tickets, none of which loopkit has).

### `src/components/section.tsx` (new)

Same API shape as qkit's `Section` (`icon`, `eyebrow?`, `title`, `description`, `children`) so callers read identically to the sibling repo, but wraps `ElevatedCard` instead of `Ticket`:

```tsx
<Section
  icon={<Store className="size-4" />}
  eyebrow="Shown to customers"
  title="Stall name"
  description="..."
>
  {/* field(s) + save button */}
</Section>
```

Replaces the existing repeated `<Card><CardHeader>...icon badge...</CardHeader><CardContent>...` block that's currently hand-rolled in `profile-form.tsx` (5 times) and will also be hand-rolled in the `/setup` and dashboard reskins — this component exists specifically to stop that duplication, matching the "extract when a workflow repeats" principle already applied elsewhere in this codebase (e.g. `resolveSetupView`, `card-type-picker.ts`).

## Area 1: Profile — social links

**Data layer** (`src/lib/merqo-vendor-profile.ts`): add `upsertVendorProfile()`, mirroring qkit's implementation exactly — same `upsert_vendor_profile` RPC (merqo-owned, already deployed to the shared Supabase project; loopkit only needs its own typed TS wrapper, no migration on loopkit's side) — plus the `upsert_vendor_profile` entry in this file's local `MerqoSchema` mirror type (currently only has `get_or_create_vendor_profile`).

**Types** (`src/lib/types.ts`): add `export type SocialLinks = { website?: string; instagram?: string; facebook?: string; tiktok?: string }` — mirrors qkit's shape exactly (same 4 keys), since `merqo.vendor_profile.social_links` is the same shared JSONB column both kits read/write.

**Validation** (inline in `src/app/dashboard/profile/actions.ts`, matching this codebase's existing pattern of inlining Zod schemas near their one call site — e.g. `program.ts`'s `saveProgramSchema` — rather than a shared `schemas.ts` qkit-style file loopkit doesn't have):

```ts
const socialUrl = z
  .string()
  .trim()
  .url("Enter a valid URL")
  .max(200)
  .optional()
  .or(z.literal("").transform(() => undefined));

const socialLinksSchema = z.object({
  website: socialUrl,
  instagram: socialUrl,
  facebook: socialUrl,
  tiktok: socialUrl,
});
```

**Action** (`src/app/dashboard/profile/actions.ts`): add `updateSocialLinksAction`, following the exact shape of the existing `updateStallNameAction` in this file — parses input, calls `getOrCreateVendorProfile` then `upsertVendorProfile` (preserving the current `stall_name`, only replacing `social_links`), revalidates `/dashboard/profile`.

**Components** (ported from qkit, kit-agnostic as-is — no loopkit-specific changes needed):

- `src/components/social-icons.tsx` — `SOCIAL_LINK_FIELDS` (website/instagram/facebook/tiktok with brand icons).
- `src/components/social-links-fields.tsx` — the 4-field input group.
- New dependency: `@icons-pack/react-simple-icons` (already used, proven, in qkit).

**Wiring:**

- `src/app/dashboard/profile/page.tsx`: read the vendor profile via `getOrCreateVendorProfile` (same call `/setup`'s page already makes) and pass `socialLinks={profile.social_links}` to `ProfileForm`.
- `src/app/dashboard/profile/profile-form.tsx`: add a `socialLinks: SocialLinks` prop, a "Social & website" `Section` (between Stall name and Profile icon, matching qkit's ordering), wired to `updateSocialLinksAction` the same way `saveStall`/`saveDisplayName` already call their actions.
- Reskin: replace this file's 4 existing hand-rolled `<Card>` blocks with `<Section>`.

## Area 2: Dashboard reskin + layout

**Files:** `src/app/dashboard/page.tsx`, `src/app/dashboard/shop-qr-block.tsx`, `src/app/dashboard/new-program-tile.tsx`.

- `page.tsx`: wrap the `ShopQrBlock` + `ScanAndRoute` pair in a `flex flex-col gap-4 sm:flex-row` row (was two full-width stacked blocks); add a `"Your programs"` section heading (matching this codebase's existing label style, e.g. `text-sm font-semibold uppercase tracking-wider text-muted-foreground` used elsewhere) directly above the program grid.
- `shop-qr-block.tsx` / `new-program-tile.tsx`: reskin their outer wrapper divs to use `ElevatedCard` instead of the current ad-hoc `rounded-2xl border bg-card p-5 shadow-sm`.
- `ProgramCard` (the tappable stretched-link card from the earlier dashboard-tappable-card work) is **not** reskinned in this pass — it has its own distinct stretched-link interaction pattern built and reviewed recently; changing its visual container is a separate, deliberate decision, not a drive-by rename. Out of scope here.

## Area 3: `/setup` reskin + layout

**Files:** `src/app/setup/page.tsx`, `src/app/setup/setup-form.tsx`.

- Reskin: the Basics card, Rules card, and the type-picker's outer container currently hand-roll their own `<Card>`/plain-div wrappers — replace with `Section`/`ElevatedCard`.
- Layout: in `setup-form.tsx`'s returned JSX, change the outer grid from today's `grid-cols-1 md:grid-cols-2` (picker+preview left / Basics+Rules right) to a main-column + side-preview split: main column contains type picker → Basics → Rules in that order; preview column gets `lg:sticky lg:top-6 lg:self-start` so it docks while the main column scrolls, active only at the `lg` breakpoint. Below `lg`, preview renders inline right after the type picker (single column), same effective position it has today on mobile.

## Testing

- `elevated-card.tsx`/`section.tsx`: no dedicated unit tests needed (pure presentational wrappers, no logic) — covered indirectly by the existing DOM tests of the pages that render them (`profile-form.dom.test.tsx` if one exists, `setup-form.dom.test.tsx`, dashboard component tests), which assert on rendered text/roles, not the wrapper markup.
- `src/app/dashboard/profile/actions.test.ts` does not exist yet (loopkit's profile feature has no tests today, unlike qkit's) — create it, mirroring qkit's `actions.test.ts` structure, covering `updateSocialLinksAction`'s success path and a validation-failure path (invalid URL), matching this repo's Testing Invariant ("New Server Actions... need a Vitest test covering the success path and at least one error/authorization-failure path").
- `src/app/dashboard/profile/profile-form.dom.test.tsx` does not exist yet — create it, following `setup-form.dom.test.tsx`'s pattern (mock the action module, render `ProfileForm`, assert on rendered text/roles), covering at minimum the new Social & website section's rendering and submission plus the existing stall-name/display-name/password sections (this is the first test coverage this component will have).
- Dashboard/`,/setup` layout changes: existing DOM tests (`setup-form.dom.test.tsx`, any dashboard page tests) should continue passing unchanged since no behavior/copy changes, only wrapper markup and grid classes — the implementation plan should flag any test that asserts on now-removed class names.

## Out of scope

- `ProgramCard`'s own visual container (stretched-link card) — not touched.
- Any change to qkit itself.
- Any DB/schema/migration change on loopkit's side — `upsert_vendor_profile` is merqo-owned, shared infra already deployed.
- Per-booth/per-program social-link overrides (qkit has a booth-level override; loopkit has no equivalent concept and none was requested) — profile-level social links only.
- Any further "revamp" of Wheel/Scratch/Points card types (a separate, still-unscoped ask from earlier in this project's UX cleanup list) — not part of this UI/UX pass.
