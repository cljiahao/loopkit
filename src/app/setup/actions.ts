"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireVendor } from "@/lib/auth";
import { programInputSchema } from "@/lib/program";
import { createServerClient } from "@/lib/supabase/server";

export async function saveProgramAction(formData: FormData): Promise<void> {
  const { user } = await requireVendor();

  const parsed = programInputSchema.safeParse({
    name: formData.get("name"),
    stamps_required: formData.get("stamps_required"),
    reward_text: formData.get("reward_text"),
  });
  if (!parsed.success) {
    throw new Error(`Invalid program input: ${parsed.error.message}`);
  }

  const supabase = await createServerClient();
  // vendor_id is unique — a vendor has exactly one program, so this upsert
  // both creates the first card and edits it thereafter.
  const { error } = await supabase
    .from("programs")
    .upsert(
      { vendor_id: user.id, ...parsed.data },
      { onConflict: "vendor_id" },
    );
  if (error) throw new Error(`saveProgramAction: ${error.message}`);

  revalidatePath("/dashboard");
  redirect("/dashboard");
}
