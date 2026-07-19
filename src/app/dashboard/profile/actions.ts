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
  name: string,
): Promise<{ error?: string }> {
  const res = await saveStallName(name);
  if (!res.error) revalidatePath("/dashboard", "layout");
  return res;
}

const passwordSchema = z.string().min(8).max(72);

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
