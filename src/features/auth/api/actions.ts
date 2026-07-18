"use server";

import { z } from "zod";
import { normalizePhone } from "@/lib/phone";
import { requireVendor } from "./require-vendor";
import { createServerClient } from "@/lib/supabase/server";

const nameSchema = z.string().trim().min(1).max(60);

// Unverified name+phone vendor onboarding (spec:
// 2026-07-11-vendor-phone-onboarding-design.md, Option 1). Called after the
// client has already established an anonymous session via
// signInAnonymously() — requireVendor() here just reads that session, it
// does not create one. Phone is stored as vendor-supplied data, not a
// verified credential — same trust model as a customer typing their own
// number at /c today.
export async function vendorPhoneOnboardAction(
  name: string,
  phoneRaw: string,
): Promise<{ error?: string }> {
  const { user } = await requireVendor();

  const parsedName = nameSchema.safeParse(name);
  if (!parsedName.success) return { error: "Enter your name." };

  const phone = normalizePhone(phoneRaw);
  if (!phone.ok) return { error: "Enter a valid Singapore phone number." };

  const supabase = await createServerClient();
  const { error } = await supabase
    .from("vendors")
    .upsert(
      { vendor_id: user.id, name: parsedName.data, phone: phone.phone },
      { onConflict: "vendor_id" },
    );
  if (error) return { error: "Couldn't save your details. Try again." };
  return {};
}
