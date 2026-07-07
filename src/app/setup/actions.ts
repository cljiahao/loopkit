"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireVendor } from "@/lib/auth";
import { saveProgramSchema, buildPlantConfig } from "@/lib/program";
import { createServerClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/types";

type ProgramInsert = Database["loopkit"]["Tables"]["programs"]["Insert"];

export async function saveProgramAction(formData: FormData): Promise<void> {
  const { user } = await requireVendor();

  const parsed = saveProgramSchema.safeParse({
    type: formData.get("type"),
    name: formData.get("name"),
    stamps_required: formData.get("stamps_required"),
    reward_text: formData.get("reward_text"),
    win_percent: formData.get("win_percent"),
    pity_ceiling: formData.get("pity_ceiling"),
    visits_to_bloom: formData.get("visits_to_bloom"),
  });
  if (!parsed.success) {
    throw new Error(`Invalid program input: ${parsed.error.message}`);
  }

  const data = parsed.data;
  // A card's stamps_required column is NOT NULL and 2..20; lucky programs reuse
  // the pity ceiling and plant programs reuse visits-to-bloom to satisfy it. The
  // type-specific knobs live in the config blob the TypeScript strategy reads.
  let row: ProgramInsert;
  if (data.type === "stamp") {
    row = {
      vendor_id: user.id,
      type: "stamp",
      name: data.name,
      stamps_required: data.stamps_required,
      reward_text: data.reward_text,
      config: {
        stamps_required: data.stamps_required,
        reward_text: data.reward_text,
      },
    };
  } else if (data.type === "lucky") {
    row = {
      vendor_id: user.id,
      type: "lucky",
      name: data.name,
      stamps_required: data.pity_ceiling,
      reward_text: data.reward_text,
      config: {
        win_probability: data.win_percent / 100,
        pity_ceiling: data.pity_ceiling,
        cooldown_visits: 1,
        reward_text: data.reward_text,
      },
    };
  } else {
    row = {
      vendor_id: user.id,
      type: "plant",
      name: data.name,
      stamps_required: data.visits_to_bloom,
      reward_text: data.reward_text,
      config: buildPlantConfig(data.visits_to_bloom, data.reward_text),
    };
  }

  const supabase = await createServerClient();
  // vendor_id is unique — a vendor has exactly one program, so this upsert
  // both creates the first card and edits it thereafter.
  const { error } = await supabase
    .from("programs")
    .upsert(row, { onConflict: "vendor_id" });
  if (error) throw new Error(`saveProgramAction: ${error.message}`);

  revalidatePath("/dashboard");
  redirect("/dashboard");
}
