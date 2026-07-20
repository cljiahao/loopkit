import { z } from "zod";
import { requireVendor } from "@/features/auth";
import { createServerClient } from "@/lib/supabase/server";
import {
  getOrCreateVendorProfile,
  upsertVendorProfile,
} from "@/lib/merqo-vendor-profile";

export const stallNameSchema = z.object({
  name: z.string().trim().min(1).max(60),
});

export type VendorProfile = {
  name: string | null;
};

/**
 * The signed-in vendor's stall name — now sourced from the shared
 * merqo.vendor_profile.stall_name (mirrors qkit's cutover; see
 * docs/superpowers/specs/2026-07-20-nav-dropdown-stallname-parity-design.md).
 * loopkit.vendors.name is read only as the seed for a lazily-created merqo
 * row, never returned directly. Degrades to that local name on a merqo
 * hiccup rather than throwing — this call backs every dashboard page via
 * the layout, so a merqo outage shouldn't 500 the whole vendor console.
 * `fallbackName` seeds a brand-new merqo row when the local `vendors.name`
 * column is still null (e.g. a vendor's first-ever page load is /setup,
 * before they've named their stall) — pass the vendor's email there.
 */
export async function getVendorProfile(
  fallbackName?: string | null,
): Promise<VendorProfile> {
  const { user } = await requireVendor();
  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("vendors")
    .select("name")
    .maybeSingle();
  if (error) throw new Error(`getVendorProfile: ${error.message}`);

  const localName = data?.name ?? fallbackName ?? null;
  try {
    const profile = await getOrCreateVendorProfile(
      supabase,
      user.id,
      localName,
    );
    return { name: profile.stall_name };
  } catch (err) {
    console.error(
      "getVendorProfile: shared vendor profile read failed",
      err instanceof Error ? err.message : err,
    );
    return { name: localName };
  }
}

/**
 * Save the vendor's stall name to the shared merqo.vendor_profile row,
 * preserving its existing social_links — the same preserve-the-other-field
 * pattern src/app/dashboard/profile/actions.ts's updateSocialLinksAction
 * already uses in reverse.
 */
export async function saveStallName(name: string): Promise<{ error?: string }> {
  const { user } = await requireVendor();
  const parsed = stallNameSchema.safeParse({ name });
  if (!parsed.success) return { error: "Enter a stall name." };

  const supabase = await createServerClient();
  try {
    const current = await getOrCreateVendorProfile(supabase, user.id, null);
    await upsertVendorProfile(
      supabase,
      user.id,
      parsed.data.name,
      current.social_links,
    );
  } catch {
    return { error: "Couldn't save your stall name. Try again." };
  }
  return {};
}
