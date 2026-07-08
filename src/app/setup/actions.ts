"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireVendor } from "@/lib/auth";
import {
  saveProgramSchema,
  buildPlantConfig,
  listPrograms,
  isPro,
  canCreateProgram,
} from "@/lib/program";
import { createServerClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/types";

type ProgramInsert = Database["loopkit"]["Tables"]["programs"]["Insert"];

export type SaveProgramState = { error?: string };

export async function saveProgramAction(
  _prev: SaveProgramState,
  formData: FormData,
): Promise<SaveProgramState> {
  const { user } = await requireVendor();

  const id = String(formData.get("id") ?? "").trim();
  const isEdit = id.length > 0;

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
    return { error: "Check the card details and try again." };
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

  if (isEdit) {
    const { error } = await supabase.from("programs").update(row).eq("id", id);
    if (error) return { error: "Couldn't save your card. Try again." };
    revalidatePath("/dashboard");
    redirect(`/dashboard?p=${id}`);
  }

  // Re-check the free/Pro gate server-side — never trust the client to have
  // hidden the create form.
  const programs = await listPrograms();
  const pro = await isPro();
  if (!canCreateProgram(programs.length, pro)) {
    return {
      error: "You're on the free plan — 1 program. Ask an admin for Pro.",
    };
  }

  const { data: created, error } = await supabase
    .from("programs")
    .insert(row)
    .select("id")
    .single();
  if (error || !created) {
    return { error: "Couldn't create your card. Try again." };
  }

  revalidatePath("/dashboard");
  redirect(`/dashboard?p=${created.id}`);
}
