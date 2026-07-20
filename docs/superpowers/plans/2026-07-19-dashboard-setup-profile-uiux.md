# Dashboard/Setup/Profile UI-UX Pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a shared polished-card primitive, port qkit's profile social links, and reskin+relayout the dashboard and `/setup` create-card flow, per `docs/superpowers/specs/2026-07-19-dashboard-setup-profile-uiux-design.md`.

**Architecture:** A new `ElevatedCard`/`Section` primitive pair (Task 1) replaces the repeated hand-rolled `<Card><CardHeader>icon-badge...` block used today in `profile-form.tsx` and `setup-form.tsx`. Profile social links (Tasks 2-3) are backed by the already-shared `merqo.vendor_profile` table — loopkit already reads it (`getOrCreateVendorProfile`, used by `/setup`); this adds the write side (`upsertVendorProfile`) and the UI. Dashboard (Task 4) and `/setup` (Task 5) each get a reskin + the layout change confirmed during brainstorming (dashboard: quick-actions row + "Your programs" heading; `/setup`: sticky-docked preview).

**Tech Stack:** Next.js 16 App Router · React 19 · TypeScript strict · Tailwind v4 · Supabase (`@supabase/ssr`) · Vitest + Testing Library · Zod · pnpm.

## Global Constraints

- TypeScript strict — no `any`, no `@ts-ignore`.
- No DB/schema/migration change — `upsert_vendor_profile` is a merqo-owned RPC already deployed to the shared Supabase project; only a typed TS wrapper is added on loopkit's side.
- `ProgramCard` (dashboard's tappable stretched-link card) is **not** reskinned — out of scope per the spec.
- `NewProgramTile`'s dashed "add new" outline is **not** reskinned to `ElevatedCard` — it's a deliberately distinct "add slot" affordance (dashed border, not a solid content card), not part of the "flat plain card" complaint. (This narrows the spec's Area 2 file list by one file; noted here since it's a deviation from the spec text, not an omission.)
- `PreviewCard`'s own internal styling (`rounded-xl border bg-muted/40`, a recessed "preview well" look) is **not** reskinned — it's intentionally distinct from a content card. Only its position in the layout changes (Task 5).
- Run `pnpm check && pnpm test` after every task; commit after every task.
- Work happens in the existing worktree `.claude/worktrees/uiux-polish`, branch `worktree-uiux-polish`, freshly branched off `main` after PR #13 merged.

---

## Task 1: `ElevatedCard` + `Section` primitives

**Files:**

- Create: `src/components/elevated-card.tsx`
- Create: `src/components/section.tsx`
- Create: `src/components/section.dom.test.tsx`

**Interfaces:**

- Produces: `ElevatedCard({ as?: "div" | "section"; className?: string; children: React.ReactNode } & React.HTMLAttributes<HTMLElement>)` and `Section({ icon: React.ReactNode; eyebrow?: string; title: string; description: string; children: React.ReactNode })` — consumed by Tasks 3, 4, 5.

- [ ] **Step 1: Write `src/components/elevated-card.tsx`**

```tsx
import { cn } from "@/lib/utils";

// The polished-card look shared across profile/dashboard/setup: rounded
// corners, a soft two-layer lifted shadow, no scallop/paper theme (that's
// qkit's Ticket component, deliberately not adopted here — see
// docs/superpowers/specs/2026-07-19-dashboard-setup-profile-uiux-design.md).
export function ElevatedCard({
  as: As = "div",
  className,
  children,
  ...props
}: {
  as?: "div" | "section";
  className?: string;
  children: React.ReactNode;
} & React.HTMLAttributes<HTMLElement>) {
  return (
    <As
      className={cn(
        "rounded-[20px] border bg-card shadow-[0_1px_0_0_var(--color-border),0_12px_28px_-20px_rgba(0,0,0,0.35)]",
        className,
      )}
      {...props}
    >
      {children}
    </As>
  );
}
```

- [ ] **Step 2: Write `src/components/section.tsx`**

```tsx
import { ElevatedCard } from "@/components/elevated-card";

// Icon-badge + eyebrow/title/description header over an ElevatedCard.
// Replaces the repeated hand-rolled <Card><CardHeader>...icon badge...
// block in profile-form.tsx and setup-form.tsx (Tasks 3 and 5).
export function Section({
  icon,
  eyebrow,
  title,
  description,
  children,
}: {
  icon: React.ReactNode;
  eyebrow?: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <ElevatedCard as="section" className="px-7 py-6">
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
          {icon}
        </span>
        <div>
          {eyebrow ? (
            <p className="text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              {eyebrow}
            </p>
          ) : null}
          <h2 className="mt-0.5 font-display text-lg font-semibold leading-tight">
            {title}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        </div>
      </div>
      <div className="mt-5 space-y-4">{children}</div>
    </ElevatedCard>
  );
}
```

- [ ] **Step 3: Write the failing test, then confirm it passes (component already implemented above — this is characterization coverage, not TDD-first, since the component is a trivial presentational wrapper)**

```tsx
// src/components/section.dom.test.tsx
// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Store } from "lucide-react";
import { Section } from "@/components/section";

describe("Section", () => {
  it("renders icon, eyebrow, title, description, and children", () => {
    render(
      <Section
        icon={<Store data-testid="icon" />}
        eyebrow="Shown to customers"
        title="Stall name"
        description="The name on your customers' card."
      >
        <p>field content</p>
      </Section>,
    );
    expect(screen.getByTestId("icon")).toBeInTheDocument();
    expect(screen.getByText("Shown to customers")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Stall name" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("The name on your customers' card."),
    ).toBeInTheDocument();
    expect(screen.getByText("field content")).toBeInTheDocument();
  });

  it("omits the eyebrow paragraph when not provided", () => {
    render(
      <Section icon={<Store />} title="Title only" description="desc">
        <p>child</p>
      </Section>,
    );
    expect(screen.queryByText("Shown to customers")).not.toBeInTheDocument();
  });

  it("renders as a <section> element", () => {
    const { container } = render(
      <Section icon={<Store />} title="T" description="D">
        <p>c</p>
      </Section>,
    );
    expect(container.querySelector("section")).toBeInTheDocument();
  });
});
```

Run: `pnpm exec vitest run src/components/section.dom.test.tsx`
Expected: 3 passed (0 failed)

- [ ] **Step 4: Full gate + commit**

Run: `pnpm check && pnpm test`
Expected: PASS

```bash
git add src/components/elevated-card.tsx src/components/section.tsx src/components/section.dom.test.tsx
git commit -m "feat(ui): add ElevatedCard/Section shared primitives"
```

---

## Task 2: Profile social links — data layer

**Files:**

- Modify: `src/lib/merqo-vendor-profile.ts`
- Modify: `src/lib/types.ts`
- Modify: `src/app/dashboard/profile/actions.ts`
- Create: `src/app/dashboard/profile/actions.test.ts`

**Interfaces:**

- Produces: `upsertVendorProfile<Db, SchemaName>(supabase, vendorId, stallName, socialLinks): Promise<VendorProfile>` (from `merqo-vendor-profile.ts`), `type SocialLinks = { website?: string; instagram?: string; facebook?: string; tiktok?: string }` (from `types.ts`), `updateSocialLinksAction(input: SocialLinks): Promise<{ error?: string }>` (from `profile/actions.ts`) — consumed by Task 3.

- [ ] **Step 1: Add `SocialLinks` to `src/lib/types.ts`**

Find:

```typescript
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

// Hand-written mirror of supabase/migrations/0001_loopkit_core.sql — no live
```

Replace with:

```typescript
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

// Not part of the loopkit schema — this is the shape of the shared
// merqo.vendor_profile.social_links JSONB column (see
// src/lib/merqo-vendor-profile.ts), which loopkit reads/writes but doesn't
// own. Same 4 keys as qkit's identically-named type, since both kits read
// the same column.
export type SocialLinks = {
  website?: string;
  instagram?: string;
  facebook?: string;
  tiktok?: string;
};

// Hand-written mirror of supabase/migrations/0001_loopkit_core.sql — no live
```

- [ ] **Step 2: Add `upsert_vendor_profile` to `merqo-vendor-profile.ts`'s `MerqoSchema` and add `upsertVendorProfile`**

Find:

```typescript
type MerqoSchema = {
  merqo: {
    Tables: Record<string, never>;
    Views: Record<string, never>;
    Functions: {
      get_or_create_vendor_profile: {
        Args: { p_vendor_id: string; p_default_stall_name: string | null };
        Returns: VendorProfile;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
```

Replace with:

```typescript
type MerqoSchema = {
  merqo: {
    Tables: Record<string, never>;
    Views: Record<string, never>;
    Functions: {
      get_or_create_vendor_profile: {
        Args: { p_vendor_id: string; p_default_stall_name: string | null };
        Returns: VendorProfile;
      };
      upsert_vendor_profile: {
        Args: {
          p_vendor_id: string;
          p_stall_name: string;
          p_social_links: Record<string, string>;
        };
        Returns: VendorProfile;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
```

Then append, at the end of the file, after the existing `getOrCreateVendorProfile` function:

```typescript
/**
 * Update the vendor's shared merqo.vendor_profile row (stall name +
 * social links). Mirrors qkit's implementation exactly — same RPC,
 * same generic Db/SchemaName pattern as getOrCreateVendorProfile above.
 */
export async function upsertVendorProfile<
  Db,
  SchemaName extends string & Exclude<keyof Db, "__InternalSupabase">,
>(
  supabase: SupabaseClient<Db, SchemaName>,
  vendorId: string,
  stallName: string,
  socialLinks: Record<string, string>,
): Promise<VendorProfile> {
  const merqoClient = supabase as unknown as SupabaseClient<MerqoSchema>;
  const { data, error } = await merqoClient
    .schema("merqo")
    .rpc("upsert_vendor_profile", {
      p_vendor_id: vendorId,
      p_stall_name: stallName,
      p_social_links: socialLinks,
    });
  if (error) {
    throw new Error(`upsert_vendor_profile failed: ${error.message}`);
  }
  return data;
}
```

- [ ] **Step 3: Add `socialLinksSchema` + `updateSocialLinksAction` to `src/app/dashboard/profile/actions.ts`**

Read the current file first — it has `updateStallNameAction` and `updatePasswordAction`, each returning `{ error?: string }` (not a shared `ActionResult` type; match this file's own convention, not qkit's). Find:

```typescript
"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { saveStallName } from "@/lib/vendor";
import { createServerClient } from "@/lib/supabase/server";

export async function updateStallNameAction(
```

Replace with:

```typescript
"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { saveStallName } from "@/lib/vendor";
import { createServerClient } from "@/lib/supabase/server";
import {
  getOrCreateVendorProfile,
  upsertVendorProfile,
} from "@/lib/merqo-vendor-profile";
import type { SocialLinks } from "@/lib/types";

export async function updateStallNameAction(
```

Then find (the end of the existing file):

```typescript
export async function updatePasswordAction(
  password: string,
): Promise<{ error?: string }> {
  const parsed = passwordSchema.safeParse(password);
  if (!parsed.success) return { error: "Use at least 8 characters." };

  const supabase = await createServerClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data });
  if (error) return { error: "Couldn't update your password. Try again." };
  return {};
}
```

Replace with (same block, plus the new schema + action appended):

```typescript
export async function updatePasswordAction(
  password: string,
): Promise<{ error?: string }> {
  const parsed = passwordSchema.safeParse(password);
  if (!parsed.success) return { error: "Use at least 8 characters." };

  const supabase = await createServerClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data });
  if (error) return { error: "Couldn't update your password. Try again." };
  return {};
}

// Empty string clears a field (the form sends "" for a cleared input, not
// omission) — preprocessed to undefined so it round-trips through
// merqo.vendor_profile as "not set" rather than a literal empty string.
// Same emptyToUndefined + preprocess idiom as program.ts's expiry_days —
// deliberately not a `.optional().or(z.literal(""))` union, which gives
// unpredictable issue ordering/messages on real validation failures.
function emptyToUndefined(value: unknown): unknown {
  return value === "" || value == null ? undefined : value;
}

const socialUrl = z.preprocess(
  emptyToUndefined,
  z
    .string()
    .trim()
    .max(200, "That link is too long")
    .url("Enter a valid URL, e.g. https://instagram.com/yourstall")
    .optional(),
);

const socialLinksSchema = z.object({
  website: socialUrl,
  instagram: socialUrl,
  facebook: socialUrl,
  tiktok: socialUrl,
});

/**
 * Update the vendor's profile-level social/website links, stored in the
 * shared merqo.vendor_profile row (same table getOrCreateVendorProfile
 * already reads elsewhere, e.g. /setup's page.tsx). Preserves the row's
 * existing stall_name — this action only ever changes social_links.
 */
export async function updateSocialLinksAction(
  input: SocialLinks,
): Promise<{ error?: string }> {
  const parsed = socialLinksSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check your links" };
  }

  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };

  try {
    const current = await getOrCreateVendorProfile(supabase, user.id, null);
    await upsertVendorProfile(
      supabase,
      user.id,
      current.stall_name,
      parsed.data,
    );
  } catch (err) {
    console.error(
      "updateSocialLinksAction failed",
      err instanceof Error ? err.message : err,
    );
    return { error: "Could not save links" };
  }

  revalidatePath("/dashboard/profile");
  return {};
}
```

- [ ] **Step 4: Write `src/app/dashboard/profile/actions.test.ts`**

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  getUserMock,
  getOrCreateVendorProfileMock,
  upsertVendorProfileMock,
  revalidatePathMock,
} = vi.hoisted(() => ({
  getUserMock: vi.fn(),
  getOrCreateVendorProfileMock: vi.fn(),
  upsertVendorProfileMock: vi.fn(),
  revalidatePathMock: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerClient: vi.fn(async () => ({
    auth: { getUser: getUserMock },
  })),
}));
vi.mock("@/lib/merqo-vendor-profile", () => ({
  getOrCreateVendorProfile: getOrCreateVendorProfileMock,
  upsertVendorProfile: upsertVendorProfileMock,
}));
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));
vi.mock("@/lib/vendor", () => ({ saveStallName: vi.fn() }));

import { updateSocialLinksAction } from "./actions";

describe("updateSocialLinksAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getUserMock.mockResolvedValue({ data: { user: { id: "v1" } } });
    getOrCreateVendorProfileMock.mockResolvedValue({
      vendor_id: "v1",
      stall_name: "Kopi Corner",
      social_links: {},
      created_at: "",
      updated_at: "",
    });
  });

  it("saves valid links, preserving the existing stall name", async () => {
    const res = await updateSocialLinksAction({
      website: "https://kopicorner.com",
      instagram: "https://instagram.com/kopicorner",
    });

    expect(res.error).toBeUndefined();
    expect(upsertVendorProfileMock).toHaveBeenCalledWith(
      expect.anything(),
      "v1",
      "Kopi Corner",
      {
        website: "https://kopicorner.com",
        instagram: "https://instagram.com/kopicorner",
      },
    );
    expect(revalidatePathMock).toHaveBeenCalledWith("/dashboard/profile");
  });

  it("rejects an invalid URL without calling upsertVendorProfile", async () => {
    const res = await updateSocialLinksAction({ website: "not-a-url" });

    expect(res.error).toBe(
      "Enter a valid URL, e.g. https://instagram.com/yourstall",
    );
    expect(upsertVendorProfileMock).not.toHaveBeenCalled();
  });

  it("returns an error when not signed in", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });

    const res = await updateSocialLinksAction({});

    expect(res.error).toBe("Not signed in");
    expect(upsertVendorProfileMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 5: Run the tests, confirm they pass**

Run: `pnpm exec vitest run src/app/dashboard/profile/actions.test.ts`
Expected: 3 passed (0 failed)

- [ ] **Step 6: Full gate + commit**

Run: `pnpm check && pnpm test`
Expected: PASS

```bash
git add src/lib/types.ts src/lib/merqo-vendor-profile.ts src/app/dashboard/profile/actions.ts src/app/dashboard/profile/actions.test.ts
git commit -m "feat(profile): add upsertVendorProfile + updateSocialLinksAction"
```

---

## Task 3: Profile social links — UI + reskin

**Files:**

- Modify: `package.json` (add `@icons-pack/react-simple-icons`)
- Create: `src/components/social-icons.tsx`
- Create: `src/components/social-links-fields.tsx`
- Create: `src/components/social-links-fields.dom.test.tsx`
- Modify: `src/app/dashboard/profile/page.tsx`
- Modify: `src/app/dashboard/profile/profile-form.tsx`
- Create: `src/app/dashboard/profile/profile-form.dom.test.tsx`

**Interfaces:**

- Consumes: `Section` (Task 1), `SocialLinks` type + `updateSocialLinksAction` (Task 2), `getOrCreateVendorProfile` (existing, `src/lib/merqo-vendor-profile.ts`).
- Produces: nothing new consumed elsewhere — `ProfileForm`'s exported shape gains one prop (`socialLinks: SocialLinks`), which only `profile/page.tsx` calls.

- [ ] **Step 1: Add the icon dependency**

```bash
pnpm add @icons-pack/react-simple-icons@^13.13.0
```

Run: `pnpm check` (confirms the lockfile change alone doesn't break anything)

- [ ] **Step 2: Write `src/components/social-icons.tsx`** (ported from qkit's identical file — kit-agnostic, no changes needed)

```tsx
import { Globe } from "lucide-react";
import {
  SiInstagram,
  SiFacebook,
  SiTiktok,
} from "@icons-pack/react-simple-icons";
import type { SocialLinks } from "@/lib/types";

/**
 * Shared vendor social-link field list: real brand marks + official colors
 * (via Simple Icons, `color="default"`) everywhere a link is shown or
 * edited. `website` has no brand mark — a generic globe, tinted by the
 * caller via currentColor.
 */
export const SOCIAL_LINK_FIELDS: {
  key: keyof SocialLinks;
  label: string;
  icon: React.ComponentType<{ className?: string; size?: number }>;
}[] = [
  { key: "website", label: "Website", icon: Globe },
  {
    key: "instagram",
    label: "Instagram",
    icon: (props) => <SiInstagram color="default" {...props} />,
  },
  {
    key: "facebook",
    label: "Facebook",
    icon: (props) => <SiFacebook color="default" {...props} />,
  },
  {
    key: "tiktok",
    label: "TikTok",
    icon: (props) => <SiTiktok color="default" {...props} />,
  },
];
```

- [ ] **Step 3: Write `src/components/social-links-fields.tsx`** (ported from qkit; `FORM_LABEL_CLASS` doesn't exist in loopkit's `utils.ts` — inline the same class string setup-form.tsx/profile-form.tsx already use locally)

```tsx
"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SOCIAL_LINK_FIELDS } from "@/components/social-icons";
import type { SocialLinks } from "@/lib/types";

const labelClass =
  "text-xs font-semibold uppercase tracking-wider text-muted-foreground";

const PLACEHOLDERS: Record<keyof SocialLinks, string> = {
  website: "https://your-stall.com",
  instagram: "https://instagram.com/yourstall",
  facebook: "https://facebook.com/yourstall",
  tiktok: "https://tiktok.com/@yourstall",
};

const FIELDS = SOCIAL_LINK_FIELDS.map((field) => ({
  ...field,
  placeholder: PLACEHOLDERS[field.key],
}));

export function SocialLinksFields({
  value,
  onChange,
  idPrefix,
}: {
  value: SocialLinks;
  onChange: (next: SocialLinks) => void;
  idPrefix: string;
}) {
  function setField(key: keyof SocialLinks, raw: string) {
    const next = { ...value };
    if (raw) next[key] = raw;
    else delete next[key];
    onChange(next);
  }

  return (
    <div className="space-y-4">
      {FIELDS.map(({ key, label, placeholder, icon: Icon }) => {
        const id = `${idPrefix}-${key}`;
        return (
          <div key={key} className="space-y-2">
            <Label htmlFor={id} className={labelClass}>
              <span className="inline-flex items-center gap-1.5">
                <Icon className="size-3.5" />
                {label}
              </span>
            </Label>
            <Input
              id={id}
              value={value[key] ?? ""}
              placeholder={placeholder}
              className="h-11 rounded-xl"
              onChange={(e) => setField(key, e.target.value)}
            />
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4: Write `src/components/social-links-fields.dom.test.tsx`**

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SocialLinksFields } from "@/components/social-links-fields";

describe("SocialLinksFields", () => {
  it("renders one input per social field, prefilled from value", () => {
    render(
      <SocialLinksFields
        value={{ website: "https://kopicorner.com" }}
        onChange={vi.fn()}
        idPrefix="test"
      />,
    );
    expect(screen.getByLabelText(/website/i)).toHaveValue(
      "https://kopicorner.com",
    );
    expect(screen.getByLabelText(/instagram/i)).toHaveValue("");
  });

  it("adds a key when a field is typed into", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <SocialLinksFields value={{}} onChange={onChange} idPrefix="test" />,
    );
    await user.type(screen.getByLabelText(/instagram/i), "x");
    expect(onChange).toHaveBeenLastCalledWith({ instagram: "x" });
  });

  it("removes a key when its field is cleared", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <SocialLinksFields
        value={{ website: "a" }}
        onChange={onChange}
        idPrefix="test"
      />,
    );
    await user.clear(screen.getByLabelText(/website/i));
    expect(onChange).toHaveBeenLastCalledWith({});
  });
});
```

- [ ] **Step 5: Run the new tests**

Run: `pnpm exec vitest run src/components/social-links-fields.dom.test.tsx`
Expected: 3 passed (0 failed)

- [ ] **Step 6: Update `src/app/dashboard/profile/page.tsx`**

Find (the whole current file):

```tsx
import { requireVendor } from "@/features/auth";
import { getVendorProfile } from "@/lib/vendor";
import { ProfileForm } from "@/app/dashboard/profile/profile-form";

export default async function ProfilePage() {
  const { user } = await requireVendor();
  const rawDisplayName = user.user_metadata?.display_name;
  const displayName = typeof rawDisplayName === "string" ? rawDisplayName : "";
  const profile = await getVendorProfile();

  return (
    <main className="mx-auto max-w-lg space-y-8 p-5 py-10 md:max-w-4xl">
      <div>
        <h1 className="font-display text-2xl font-bold">Profile</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Your stall name, profile icon, how we address you, and your sign-in
          password. Each section saves on its own.
        </p>
      </div>
      <ProfileForm
        vendorId={user.id}
        email={user.email ?? ""}
        name={profile.name}
        avatarUrl={user.user_metadata?.avatar_url ?? null}
        displayName={displayName}
      />
    </main>
  );
}
```

Replace with:

```tsx
import { requireVendor } from "@/features/auth";
import { getVendorProfile } from "@/lib/vendor";
import { createServerClient } from "@/lib/supabase/server";
import { getOrCreateVendorProfile } from "@/lib/merqo-vendor-profile";
import { ProfileForm } from "@/app/dashboard/profile/profile-form";
import type { SocialLinks } from "@/lib/types";

export default async function ProfilePage() {
  const { user } = await requireVendor();
  const rawDisplayName = user.user_metadata?.display_name;
  const displayName = typeof rawDisplayName === "string" ? rawDisplayName : "";
  const profile = await getVendorProfile();

  const supabase = await createServerClient();
  // Same cross-schema, degrade-to-empty-on-failure pattern as /setup's page
  // (src/app/setup/page.tsx) — social links are a nice-to-have, not worth
  // hard-failing the whole profile page over a merqo hiccup.
  let socialLinks: SocialLinks = {};
  try {
    const vendorProfile = await getOrCreateVendorProfile(
      supabase,
      user.id,
      profile.name,
    );
    socialLinks = vendorProfile.social_links as SocialLinks;
  } catch (err) {
    console.error(
      "profile: shared vendor profile read failed",
      err instanceof Error ? err.message : err,
    );
  }

  return (
    <main className="mx-auto max-w-lg space-y-8 p-5 py-10 md:max-w-4xl">
      <div>
        <h1 className="font-display text-2xl font-bold">Profile</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Your stall name, social links, profile icon, how we address you, and
          your sign-in password. Each section saves on its own.
        </p>
      </div>
      <ProfileForm
        vendorId={user.id}
        email={user.email ?? ""}
        name={profile.name}
        avatarUrl={user.user_metadata?.avatar_url ?? null}
        displayName={displayName}
        socialLinks={socialLinks}
      />
    </main>
  );
}
```

- [ ] **Step 7: Rewrite `src/app/dashboard/profile/profile-form.tsx`**

Replace the entire file with:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Store, UserRound, IdCard, KeyRound, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Section } from "@/components/section";
import { SocialLinksFields } from "@/components/social-links-fields";
import { ImageUploader } from "@/components/image-uploader";
import { createClient } from "@/lib/supabase/client";
import { useAsyncAction } from "@/hooks/use-async-action";
import type { SocialLinks } from "@/lib/types";
import {
  updateStallNameAction,
  updatePasswordAction,
  updateSocialLinksAction,
} from "./actions";

const labelClass =
  "text-xs font-semibold uppercase tracking-wider text-muted-foreground";

interface Props {
  vendorId: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  displayName: string;
  socialLinks: SocialLinks;
}

export function ProfileForm({
  vendorId,
  email,
  name,
  avatarUrl,
  displayName,
  socialLinks,
}: Props) {
  const router = useRouter();
  const supabase = createClient();

  // Stall name — persisted via a server action (RLS-scoped write to
  // loopkit.vendors) + revalidatePath so the nav picks it up.
  const initialName = name ?? "";
  const [stallName, setStallName] = useState(initialName);
  const { pending: savingName, run: runName } = useAsyncAction();

  // Social/website links — profile-level defaults stored in the shared
  // merqo.vendor_profile row (Task 2's updateSocialLinksAction).
  const [links, setLinks] = useState<SocialLinks>(socialLinks);
  const { pending: savingLinks, run: runLinks } = useAsyncAction();

  // Photo — the uploader handles the storage upload; we persist the returned
  // URL straight to auth user_metadata client-side, same channel the nav
  // reads from (Task 3). No server action needed for this piece.
  const [avatar, setAvatar] = useState(avatarUrl);

  // Display name — private, decorative only (not shown anywhere else in
  // the app). Persisted the same way avatar_url already is: directly on
  // the auth user via the browser client, no server action needed.
  const initialDisplayName = displayName;
  const [display, setDisplay] = useState(initialDisplayName);
  const { pending: savingDisplay, run: runDisplay } = useAsyncAction();

  // Password — persisted via the browser auth client's own session, matched
  // client-side against a confirm field before it's ever sent.
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const { pending: savingPassword, run: runPassword } = useAsyncAction();

  function saveStallName() {
    return runName(async () => {
      const res = await updateStallNameAction(stallName.trim());
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Stall name saved");
      router.refresh();
    });
  }

  function saveLinks() {
    return runLinks(async () => {
      const res = await updateSocialLinksAction(links);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Links saved");
      router.refresh();
    });
  }

  async function handleAvatarChange(url: string | null) {
    setAvatar(url);
    const { error } = await supabase.auth.updateUser({
      data: { avatar_url: url },
    });
    if (error) {
      toast.error("Couldn't save your photo. Try again.");
      return;
    }
    toast.success(url ? "Photo saved" : "Photo removed");
    router.refresh();
  }

  function saveDisplayName() {
    return runDisplay(async () => {
      const trimmed = display.trim().slice(0, 60);
      const { error } = await supabase.auth.updateUser({
        data: { display_name: trimmed },
      });
      if (error) {
        toast.error("Couldn't save your display name. Try again.");
        return;
      }
      setDisplay(trimmed);
      toast.success("Display name saved");
      router.refresh();
    });
  }

  function savePassword() {
    if (password !== confirm) {
      toast.error("Passwords don't match.");
      return;
    }
    return runPassword(async () => {
      const res = await updatePasswordAction(password);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Password updated");
      setPassword("");
      setConfirm("");
    });
  }

  const passwordsFilled = password.length > 0 && confirm.length > 0;

  return (
    <div className="md:columns-2 md:gap-5 [&>*]:mb-5 [&>*]:break-inside-avoid-column">
      <Section
        icon={<Store className="size-4" />}
        eyebrow="Shown to customers"
        title="Stall name"
        description="The name on your customers' card and at the counter."
      >
        <div className="space-y-2">
          <Label htmlFor="stall-name" className={labelClass}>
            Stall name
          </Label>
          <Input
            id="stall-name"
            value={stallName}
            maxLength={60}
            onChange={(e) => setStallName(e.target.value)}
            placeholder="Kopi Corner"
            className="h-11 rounded-xl"
          />
        </div>
        <div className="flex justify-end">
          <Button
            type="button"
            onClick={saveStallName}
            disabled={savingName || stallName.trim() === initialName.trim()}
            className="h-10 rounded-xl font-semibold"
          >
            {savingName ? "Saving…" : "Save"}
          </Button>
        </div>
      </Section>

      <Section
        icon={<Share2 className="size-4" />}
        eyebrow="Shown to customers"
        title="Social & website"
        description="Shown on your customer's card. Each link is optional."
      >
        <SocialLinksFields
          value={links}
          onChange={setLinks}
          idPrefix="profile"
        />
        <div className="flex justify-end">
          <Button
            type="button"
            onClick={saveLinks}
            disabled={savingLinks}
            className="h-10 rounded-xl font-semibold"
          >
            {savingLinks ? "Saving…" : "Save links"}
          </Button>
        </div>
      </Section>

      <Section
        icon={<UserRound className="size-4" />}
        eyebrow="Your account menu"
        title="Profile icon"
        description="A small image for your account menu. Defaults to your initials."
      >
        <ImageUploader
          bucket="vendor-images"
          pathPrefix={vendorId}
          value={avatar}
          onChange={handleAvatarChange}
        />
      </Section>

      <Section
        icon={<IdCard className="size-4" />}
        eyebrow="Just for you"
        title="Display name"
        description="How loopkit addresses you. Customers never see this."
      >
        <div className="space-y-2">
          <Label htmlFor="display-name" className={labelClass}>
            Display name
          </Label>
          <Input
            id="display-name"
            value={display}
            maxLength={60}
            onChange={(e) => setDisplay(e.target.value)}
            placeholder="e.g. Aisha"
            className="h-11 rounded-xl"
          />
        </div>
        <div className="flex justify-end">
          <Button
            type="button"
            onClick={saveDisplayName}
            disabled={
              savingDisplay || display.trim() === initialDisplayName.trim()
            }
            className="h-10 rounded-xl font-semibold"
          >
            {savingDisplay ? "Saving…" : "Save"}
          </Button>
        </div>
      </Section>

      <Section
        icon={<KeyRound className="size-4" />}
        eyebrow="Sign-in security"
        title="Change password"
        description="Set a new password. At least 8 characters."
      >
        <div className="space-y-2">
          <Label htmlFor="email" className={labelClass}>
            Email
          </Label>
          <Input
            id="email"
            value={email}
            readOnly
            disabled
            className="h-11 rounded-xl bg-muted/40"
          />
          <p className="text-xs text-muted-foreground">
            Your sign-in email. It can&apos;t be changed here.
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="new-password" className={labelClass}>
            New password
          </Label>
          <Input
            id="new-password"
            type="password"
            autoComplete="new-password"
            value={password}
            placeholder="••••••••"
            onChange={(e) => setPassword(e.target.value)}
            className="h-11 rounded-xl"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirm-password" className={labelClass}>
            Confirm new password
          </Label>
          <Input
            id="confirm-password"
            type="password"
            autoComplete="new-password"
            value={confirm}
            placeholder="••••••••"
            onChange={(e) => setConfirm(e.target.value)}
            className="h-11 rounded-xl"
          />
        </div>
        <div className="flex justify-end">
          <Button
            type="button"
            onClick={savePassword}
            disabled={savingPassword || !passwordsFilled}
            className="h-10 rounded-xl font-semibold"
          >
            {savingPassword ? "Updating…" : "Update password"}
          </Button>
        </div>
      </Section>
    </div>
  );
}
```

- [ ] **Step 8: Write `src/app/dashboard/profile/profile-form.dom.test.tsx`** (this component has no test today — first coverage)

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { updateStallNameMock, updatePasswordMock, updateSocialLinksMock } =
  vi.hoisted(() => ({
    updateStallNameMock: vi.fn().mockResolvedValue({}),
    updatePasswordMock: vi.fn().mockResolvedValue({}),
    updateSocialLinksMock: vi.fn().mockResolvedValue({}),
  }));
vi.mock("./actions", () => ({
  updateStallNameAction: updateStallNameMock,
  updatePasswordAction: updatePasswordMock,
  updateSocialLinksAction: updateSocialLinksMock,
}));
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: { updateUser: vi.fn().mockResolvedValue({ error: null }) },
  }),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/components/image-uploader", () => ({
  ImageUploader: () => <div data-testid="image-uploader" />,
}));

import { ProfileForm } from "./profile-form";

describe("ProfileForm", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders all 5 sections", () => {
    render(
      <ProfileForm
        vendorId="v1"
        email="a@b.com"
        name="Kopi Corner"
        avatarUrl={null}
        displayName=""
        socialLinks={{}}
      />,
    );
    expect(screen.getByText("Stall name")).toBeInTheDocument();
    expect(screen.getByText("Social & website")).toBeInTheDocument();
    expect(screen.getByText("Profile icon")).toBeInTheDocument();
    expect(screen.getByText("Display name")).toBeInTheDocument();
    expect(screen.getByText("Change password")).toBeInTheDocument();
  });

  it("prefills the social links fields and saves them", async () => {
    const user = userEvent.setup();
    render(
      <ProfileForm
        vendorId="v1"
        email="a@b.com"
        name="Kopi Corner"
        avatarUrl={null}
        displayName=""
        socialLinks={{ website: "https://kopicorner.com" }}
      />,
    );
    expect(screen.getByLabelText(/website/i)).toHaveValue(
      "https://kopicorner.com",
    );

    await user.type(
      screen.getByLabelText(/instagram/i),
      "https://instagram.com/x",
    );
    await user.click(screen.getByRole("button", { name: "Save links" }));

    expect(updateSocialLinksMock).toHaveBeenCalledWith({
      website: "https://kopicorner.com",
      instagram: "https://instagram.com/x",
    });
  });

  it("saves the stall name", async () => {
    const user = userEvent.setup();
    render(
      <ProfileForm
        vendorId="v1"
        email="a@b.com"
        name="Kopi Corner"
        avatarUrl={null}
        displayName=""
        socialLinks={{}}
      />,
    );
    const input = screen.getByLabelText("Stall name");
    await user.clear(input);
    await user.type(input, "New Name");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(updateStallNameMock).toHaveBeenCalledWith("New Name");
  });
});
```

- [ ] **Step 9: Run the new tests**

Run: `pnpm exec vitest run src/app/dashboard/profile/profile-form.dom.test.tsx`
Expected: 3 passed (0 failed)

- [ ] **Step 10: Full gate + commit**

Run: `pnpm check && pnpm test`
Expected: PASS

```bash
git add package.json pnpm-lock.yaml src/components/social-icons.tsx src/components/social-links-fields.tsx src/components/social-links-fields.dom.test.tsx src/app/dashboard/profile/page.tsx src/app/dashboard/profile/profile-form.tsx src/app/dashboard/profile/profile-form.dom.test.tsx
git commit -m "feat(profile): add social links section, reskin profile page"
```

---

## Task 4: Dashboard reskin + layout

**Files:**

- Modify: `src/app/dashboard/page.tsx`
- Modify: `src/app/dashboard/shop-qr-block.tsx`
- Modify: `src/app/dashboard/scan-and-route.tsx`
- Create: `src/app/dashboard/dashboard-page.dom.test.tsx`

**Interfaces:**

- Consumes: `ElevatedCard` (Task 1).
- Produces: no exported-shape changes to any of these components.

- [ ] **Step 1: Reskin `src/app/dashboard/shop-qr-block.tsx`**

Find:

```tsx
import { CardLinkActions } from "@/app/dashboard/card-link";
```

Replace with:

```tsx
import { CardLinkActions } from "@/app/dashboard/card-link";
import { ElevatedCard } from "@/components/elevated-card";
```

Find:

```tsx
return (
  <div className="flex flex-col items-start gap-4 rounded-2xl border bg-card p-5 shadow-sm sm:flex-row sm:items-center">
    <div
      className="shrink-0 rounded-xl border bg-white p-2 [&_svg]:size-20"
      dangerouslySetInnerHTML={{ __html: qrSvgMarkup }}
    />
    <div className="min-w-0 flex-1 space-y-2">
      <p className="text-sm font-medium">{joinCopy}</p>
      <code className="block truncate rounded-lg bg-muted px-3 py-2 font-mono text-xs">
        {link}
      </code>
      <CardLinkActions link={link} />
    </div>
  </div>
);
```

Replace with:

```tsx
return (
  <ElevatedCard className="flex h-full flex-col items-start gap-4 p-5 sm:flex-row sm:items-center">
    <div
      className="shrink-0 rounded-xl border bg-white p-2 [&_svg]:size-20"
      dangerouslySetInnerHTML={{ __html: qrSvgMarkup }}
    />
    <div className="min-w-0 flex-1 space-y-2">
      <p className="text-sm font-medium">{joinCopy}</p>
      <code className="block truncate rounded-lg bg-muted px-3 py-2 font-mono text-xs">
        {link}
      </code>
      <CardLinkActions link={link} />
    </div>
  </ElevatedCard>
);
```

- [ ] **Step 2: Reskin `src/app/dashboard/scan-and-route.tsx` and add a heading**

Find (the whole current file):

```tsx
"use client";

import { useRouter } from "next/navigation";
import { ScanButton } from "@/app/dashboard/scan-button";

// Program-agnostic entry point: scans any of the vendor's cards and routes
// straight to that card's own program's Counter, phone pre-filled — no
// need to already be on the right program's card to serve a customer.
export function ScanAndRoute() {
  const router = useRouter();
  return (
    <ScanButton
      label="Scan a customer"
      onResolved={({ phone, programId }) => {
        router.push(
          `/dashboard/counter?p=${programId}&phone=${encodeURIComponent(phone)}`,
        );
      }}
    />
  );
}
```

Replace with:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { ScanButton } from "@/app/dashboard/scan-button";
import { ElevatedCard } from "@/components/elevated-card";

// Program-agnostic entry point: scans any of the vendor's cards and routes
// straight to that card's own program's Counter, phone pre-filled — no
// need to already be on the right program's card to serve a customer.
export function ScanAndRoute() {
  const router = useRouter();
  return (
    <ElevatedCard className="flex h-full flex-col justify-center gap-3 p-5">
      <p className="text-sm font-medium">Scan a customer to stamp or redeem.</p>
      <ScanButton
        label="Scan a customer"
        onResolved={({ phone, programId }) => {
          router.push(
            `/dashboard/counter?p=${programId}&phone=${encodeURIComponent(phone)}`,
          );
        }}
      />
    </ElevatedCard>
  );
}
```

- [ ] **Step 3: Restructure the layout in `src/app/dashboard/page.tsx`**

Find:

```tsx
      ) : (
        <>
          <ShopQrBlock
            qrSvgMarkup={cardQr}
            link={cardLink}
            programNames={activePrograms.map((prog) => prog.name)}
          />

          <ScanAndRoute />

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {activePrograms.map((prog) => (
              <ProgramCard key={prog.id} program={prog} />
            ))}
            <NewProgramTile canCreate={canCreate} />
          </div>
        </>
      )}
```

Replace with:

```tsx
      ) : (
        <>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-stretch">
            <div className="sm:flex-[1.4]">
              <ShopQrBlock
                qrSvgMarkup={cardQr}
                link={cardLink}
                programNames={activePrograms.map((prog) => prog.name)}
              />
            </div>
            <div className="sm:flex-1">
              <ScanAndRoute />
            </div>
          </div>

          <div>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Your programs
            </h2>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {activePrograms.map((prog) => (
                <ProgramCard key={prog.id} program={prog} />
              ))}
              <NewProgramTile canCreate={canCreate} />
            </div>
          </div>
        </>
      )}
```

- [ ] **Step 4: Write `src/app/dashboard/dashboard-page.dom.test.tsx`**

`dashboard/page.tsx` has no dedicated test today (a diff-cover risk for a page.tsx this session already hit once with `/setup`'s page — see `docs/superpowers/plans/2026-07-19-setup-create-manage-split.md`'s Task 3). Add one now, following `setup-page.dom.test.tsx`'s pattern (call the async Server Component directly, mock its dependencies):

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/features/auth", () => ({
  requireVendor: vi.fn(async () => ({ user: { id: "v1", email: "v@x.com" } })),
}));
vi.mock("@/lib/program", () => ({
  listPrograms: vi.fn(async () => [
    {
      id: "p1",
      name: "Coffee Stamps",
      type: "stamp",
      active: true,
      stamps_required: 10,
      reward_text: "Free coffee",
      config: {},
      expiry_days: null,
      head_start: false,
      head_start_percent: 20,
      replaced_by: null,
      carry_over_stamps: false,
    },
  ]),
  isPro: vi.fn(async () => false),
  canCreateProgram: vi.fn(() => true),
  getEntitlement: vi.fn(() => ({ tier: "free" })),
  applyDueCutovers: vi.fn(async () => {}),
}));
vi.mock("@/lib/qr", () => ({ qrSvg: vi.fn(async () => "<svg></svg>") }));
vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Map([["host", "example.com"]])),
}));
vi.mock("@/app/dashboard/program-card", () => ({
  ProgramCard: ({ program }: { program: { name: string } }) => (
    <div>{program.name}</div>
  ),
}));
vi.mock("@/app/dashboard/new-program-tile", () => ({
  NewProgramTile: () => <div>New program tile</div>,
}));
vi.mock("@/app/dashboard/shop-qr-block", () => ({
  ShopQrBlock: () => <div>Shop QR block</div>,
}));
vi.mock("@/app/dashboard/scan-and-route", () => ({
  ScanAndRoute: () => <div>Scan and route</div>,
}));

import DashboardPage from "./page";

describe("DashboardPage", () => {
  it("shows a 'Your programs' heading above the program grid", async () => {
    render(await DashboardPage());

    expect(
      screen.getByRole("heading", { name: "Your programs" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Coffee Stamps")).toBeInTheDocument();
    expect(screen.getByText("Shop QR block")).toBeInTheDocument();
    expect(screen.getByText("Scan and route")).toBeInTheDocument();
  });
});
```

- [ ] **Step 5: Run the new test**

Run: `pnpm exec vitest run src/app/dashboard/dashboard-page.dom.test.tsx`
Expected: 1 passed (0 failed)

Note: if `next/headers`'s `headers()` mock shape doesn't match what `page.tsx` calls (`h.get(...)`), adjust the mock to return an object with a `get` method instead of a `Map` — verify against the actual `headers()` usage in `page.tsx` (`h.get("x-forwarded-host")`) and fix the mock to match before moving on.

- [ ] **Step 6: Full gate + commit**

Run: `pnpm check && pnpm test`
Expected: PASS

```bash
git add src/app/dashboard/page.tsx src/app/dashboard/shop-qr-block.tsx src/app/dashboard/scan-and-route.tsx src/app/dashboard/dashboard-page.dom.test.tsx
git commit -m "feat(dashboard): quick-actions row, programs heading, ElevatedCard reskin"
```

---

## Task 5: `/setup` reskin + layout (sticky preview)

**Files:**

- Modify: `src/app/setup/setup-form.tsx`

**Interfaces:**

- Consumes: `Section` (Task 1).
- Produces: no change to `SetupForm`'s exported props shape.

This task rewrites the file's `return` statement (everything from `return (` to the closing `);`) — the state/handlers above it (lines 1-230) are untouched. The type-picker's family/style grid JSX (the two-step picker built in the card-type-family-picker plan) is copied verbatim into its new `Section` wrapper; only the wrapper changes, not its contents.

- [ ] **Step 1: Update imports**

Find:

```tsx
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { usePreviewAnimation } from "@/app/setup/preview-animation";
import { PreviewCard } from "@/app/setup/preview-card";
import { Tag, SlidersHorizontal } from "lucide-react";
```

Replace with:

```tsx
import { cn } from "@/lib/utils";
import { usePreviewAnimation } from "@/app/setup/preview-animation";
import { PreviewCard } from "@/app/setup/preview-card";
import { Section } from "@/components/section";
import { Tag, SlidersHorizontal } from "lucide-react";
```

- [ ] **Step 2: Add a computed preview element and restructure the returned JSX**

Find (right before the `return (` statement, the end of `removeSegment`):

```tsx
  function removeSegment(index: number) {
    setSegments((prev) => prev.filter((_, i) => i !== index));
  }

  return (
    <div className="mt-7 grid grid-cols-1 gap-6 md:grid-cols-2 md:items-start">
      <div className="space-y-4">
        <h3 className={labelClass}>Choose a card type</h3>
        {isEdit ? (
          <p className="flex h-11 items-center rounded-xl border bg-muted/40 px-3 text-sm font-semibold text-muted-foreground">
            {typeLabels[selectedOptionKey]}
          </p>
        ) : familyStep === "family" ? (
```

Replace with:

```tsx
  function removeSegment(index: number) {
    setSegments((prev) => prev.filter((_, i) => i !== index));
  }

  // Rendered twice below (mobile inline, desktop sticky) rather than
  // repositioned via CSS alone — sticky positioning only makes sense once
  // the preview is in its own grid column (lg+), so below that breakpoint
  // it renders inline right after the type picker instead, same effective
  // position it had before this task.
  const preview = (
    <PreviewCard
      progress={previewProgress}
      name={name}
      rewardText={rewardText}
      celebrating={celebrating}
      lastChanceResult={lastChanceResult}
    />
  );

  const typePicker = isEdit ? (
    <p className="flex h-11 items-center rounded-xl border bg-muted/40 px-3 text-sm font-semibold text-muted-foreground">
      {typeLabels[selectedOptionKey]}
    </p>
  ) : familyStep === "family" ? (
```

- [ ] **Step 3: Close off `typePicker` and restructure the grid + form wrapper**

Find:

```tsx
              ))}
            </div>
          </div>
        )}
        <PreviewCard
          progress={previewProgress}
          name={name}
          rewardText={rewardText}
          celebrating={celebrating}
          lastChanceResult={lastChanceResult}
        />
      </div>

      <form action={formAction} className="space-y-6">
        {program ? <input type="hidden" name="id" value={program.id} /> : null}
        {replacingId ? (
          <input type="hidden" name="replacing" value={replacingId} />
        ) : null}
        <input type="hidden" name="type" value={type} />
        {type === "stamp" || type === "plant" ? (
          <input type="hidden" name="variant" value={variant} />
        ) : null}

        <Card>
          <CardHeader>
            <div className="flex items-start gap-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                <Tag className="size-4" />
              </span>
              <div>
                <p className="text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  Every card needs this
                </p>
                <CardTitle className="mt-0.5 text-lg">Basics</CardTitle>
                <CardDescription className="mt-1">
                  The name and reward customers see.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
```

Replace with:

```tsx
              ))}
            </div>
          </div>
        );

  return (
    <div className="mt-7 grid grid-cols-1 gap-6 lg:grid-cols-[1.4fr_1fr] lg:items-start">
      <form action={formAction} className="space-y-6">
        {program ? <input type="hidden" name="id" value={program.id} /> : null}
        {replacingId ? (
          <input type="hidden" name="replacing" value={replacingId} />
        ) : null}
        <input type="hidden" name="type" value={type} />
        {type === "stamp" || type === "plant" ? (
          <input type="hidden" name="variant" value={variant} />
        ) : null}

        <Section
          icon={<Tag className="size-4" />}
          eyebrow="Every card needs this"
          title="Choose a card type"
          description="Pick a family, then a style."
        >
          {typePicker}
          <div className="lg:hidden">{preview}</div>
        </Section>

        <Section
          icon={<Tag className="size-4" />}
          eyebrow="Every card needs this"
          title="Basics"
          description="The name and reward customers see."
        >
```

Note: this moves the whole type-picker + the two `<form>`-opening blocks so the return statement now has exactly one `return (` — the old one (that used to open with `<div className="mt-7 grid...">` followed by the picker column) is gone, replaced by this new one. Double-check after this edit that the file has exactly one `return (` in `SetupForm` and no leftover stray `<div className="space-y-4">`/`</div>` from the old left column — the old left column's opening `<div className="space-y-4">` and its `<h3>` heading are both deleted by this edit (the heading is replaced by `Section`'s own `title="Choose a card type"`).

- [ ] **Step 4: Reskin the Basics card's closing and the Rules card**

Find:

```tsx
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-start gap-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                <SlidersHorizontal className="size-4" />
              </span>
              <div>
                <p className="text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  How it works
                </p>
                <CardTitle className="mt-0.5 text-lg">Rules</CardTitle>
                <CardDescription className="mt-1">
                  Head start, carry-over, and how long a card lasts.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
```

Replace with:

```tsx
            </div>
        </Section>

        <Section
          icon={<SlidersHorizontal className="size-4" />}
          eyebrow="How it works"
          title="Rules"
          description="Head start, carry-over, and how long a card lasts."
        >
```

- [ ] **Step 5: Close the Rules section, the form, and add the sticky preview column**

Find (the file's final lines):

```tsx
            </Button>
          </CardContent>
        </Card>
      </form>
    </div>
  );
}
```

Replace with:

```tsx
            </Button>
        </Section>
      </form>

      <div className="hidden lg:sticky lg:top-6 lg:block lg:self-start">
        {preview}
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Typecheck and lint**

Run: `pnpm exec tsc --noEmit && pnpm exec eslint src/app/setup/setup-form.tsx`
Expected: PASS, no errors — pay particular attention to JSX indentation/closing-tag mismatches from the manual edits above (the `Section` closes replace `</CardContent></Card>` pairs, which are now single closes); if `tsc`/`eslint` flag a mismatched tag, re-read the whole file and fix the nesting rather than guessing.

- [ ] **Step 7: Run the existing setup-form test suite**

Run: `pnpm exec vitest run src/app/setup/setup-form.dom.test.tsx`
Expected: all existing tests still pass — they assert on text/roles (e.g. "Flame Club", "Create card", "Visits to bloom"), not on wrapper markup, so this reskin/relayout shouldn't break any of them. If any fail, read the failure and confirm whether it's a real regression (fix it) or an assertion that happened to depend on old DOM structure (e.g. `container.querySelector`) — none of the existing tests in this file use `container.querySelector`, so a failure here is a real regression, not incidental.

- [ ] **Step 8: Full gate + commit**

Run: `pnpm check && pnpm test`
Expected: PASS

```bash
git add src/app/setup/setup-form.tsx
git commit -m "feat(setup): sticky preview column, Section reskin for Basics/Rules/type-picker"
```

---

## Task 6: Manual verification + README/CHANGELOG fallout

**Files:**

- Modify: `src/components/README.md` (add bullets for `elevated-card.tsx`, `section.tsx`, `section.dom.test.tsx`, `social-icons.tsx`, `social-links-fields.tsx`, `social-links-fields.dom.test.tsx`)
- Modify: `src/app/dashboard/profile/README.md` (update for the new Social & website section, `actions.test.ts`, `profile-form.dom.test.tsx`)
- Modify: `src/app/dashboard/README.md` (update for the quick-actions row, "Your programs" heading, `dashboard-page.dom.test.tsx`)
- Modify: `src/app/setup/README.md` (update `setup-form.tsx`'s bullet for the sticky preview + Section reskin)
- Modify: `CHANGELOG.md`

**Interfaces:** none — this task only verifies and documents.

- [ ] **Step 1: Update all 4 README.md files**

Add one bullet per new file (matching each README's existing one-line-per-file convention) and update the bullets for every modified file to describe its new behavior — Sections listed above name exactly which files changed per directory.

- [ ] **Step 2: Add a CHANGELOG entry**

Under `## [Unreleased]` → `### Added` in `CHANGELOG.md`:

```markdown
- Profile settings: a new "Social & website" section (website/Instagram/
  Facebook/TikTok), backed by the shared `merqo.vendor_profile` table
  loopkit already partially used (`/setup`'s vendor-name seeding). Ported
  from qkit's identical feature.
```

Under `### Changed`:

```markdown
- New shared `Section`/`ElevatedCard` primitive (rounded corners, soft
  lifted shadow, icon-badge header) replaces the plain `Card`-based blocks
  on profile settings, the dashboard, and `/setup`'s create-card form.
  Deliberately not qkit's scalloped "kitchen ticket" look — that's
  food-stall-specific branding qkit owns; loopkit borrows only the
  spacing/hierarchy pattern.
- Dashboard: the Shop QR block and "Scan a customer" button are now a
  side-by-side quick-actions row instead of two stacked full-width blocks
  (stacks back to full-width on mobile), and the program grid now has a
  "Your programs" heading.
- `/setup`'s live preview now docks in a sticky side column on desktop
  instead of scrolling away while filling in a long Rules section (e.g.
  the Wheel/Scratch segment editor); the type picker, Basics, and Rules
  cards become one flowing main column instead of a 2-column split.
```

- [ ] **Step 3: Re-run `pnpm check` to confirm formatting**

Run: `pnpm check`
Expected: PASS

- [ ] **Step 4: Start the dev server**

Run: `pnpm dev`
Expected: server up at http://localhost:3000

- [ ] **Step 5: Manually verify in the browser**

With a vendor account:

- Visit `/dashboard/profile` — confirm the "Social & website" section appears between Stall name and Profile icon, all 5 sections use the new rounded/shadowed card look, fill in a link and confirm it saves (reload the page, confirm it persisted).
- Visit `/dashboard` — confirm the Shop QR block and Scan button sit side by side on desktop and stack on narrow/mobile widths, and a "Your programs" heading appears above the program grid.
- Visit `/setup` (fresh create) — confirm the type picker, Basics, and Rules cards flow in one main column using the new rounded/shadowed look, and on a wide (desktop) viewport the live preview stays visible in a side column while you scroll down through Rules (e.g. pick Wheel/Scratch and scroll through the segment editor). Shrink the browser to a narrow/mobile width and confirm the preview instead appears inline right after the type picker, with no sticky/side-column behavior.

- [ ] **Step 6: Stop the dev server, run the full suite one final time**

Run: `pnpm check && pnpm test`
Expected: PASS

- [ ] **Step 7: Commit README/CHANGELOG fallout**

```bash
git add src/components/README.md src/app/dashboard/profile/README.md src/app/dashboard/README.md src/app/setup/README.md CHANGELOG.md
git commit -m "docs: document the dashboard/setup/profile UI-UX pass"
```
