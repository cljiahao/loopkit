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
  const { error } = await supabase.from("vendors").upsert(
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
