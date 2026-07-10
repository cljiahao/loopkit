"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireVendor } from "@/lib/auth";
import {
  saveProgramSchema,
  buildProgramFields,
  getProgramById,
  listPrograms,
  isPro,
  canCreateProgram,
} from "@/lib/program";
import { createServerClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/types";

type ProgramUpdate = Database["loopkit"]["Tables"]["programs"]["Update"];

const UPSELL_ERROR =
  "You're on the free plan — 1 program. Ask an admin for Pro.";

export type SaveProgramState = { error?: string };

export async function saveProgramAction(
  _prev: SaveProgramState,
  formData: FormData,
): Promise<SaveProgramState> {
  await requireVendor();

  const id = String(formData.get("id") ?? "").trim();
  const isEdit = id.length > 0;

  // A card's type is fixed once created — switching it would reinterpret every
  // existing card's state blob and corrupt progress. In edit mode, load the
  // program's current type and ignore any submitted type.
  let lockedType: string | null = null;
  if (isEdit) {
    const existing = await getProgramById(id);
    if (!existing) return { error: "Couldn't save your card. Try again." };
    lockedType = existing.type;
  }

  const parsed = saveProgramSchema.safeParse({
    type: isEdit ? lockedType : formData.get("type"),
    name: formData.get("name"),
    stamps_required: formData.get("stamps_required"),
    reward_text: formData.get("reward_text"),
    win_percent: formData.get("win_percent"),
    pity_ceiling: formData.get("pity_ceiling"),
    visits_to_bloom: formData.get("visits_to_bloom"),
    segments: formData.get("segments"),
    period_days: formData.get("period_days"),
    target_streak: formData.get("target_streak"),
    expiry_days: formData.get("expiry_days"),
    head_start: formData.get("head_start"),
  });
  if (!parsed.success) {
    return { error: "Check the card details and try again." };
  }

  const data = parsed.data;
  const { type, stampsRequired, config, headStart } = buildProgramFields(data);

  const supabase = await createServerClient();

  if (isEdit) {
    const update: ProgramUpdate = {
      type,
      name: data.name,
      stamps_required: stampsRequired,
      reward_text: data.reward_text,
      config,
      expiry_days: data.expiry_days ?? null,
      head_start: headStart,
    };
    const { error } = await supabase
      .from("programs")
      .update(update)
      .eq("id", id);
    if (error) return { error: "Couldn't save your card. Try again." };
    revalidatePath("/dashboard");
    redirect(`/dashboard?p=${id}`);
  }

  // Pre-check the free/Pro gate for a friendly message — never trust the client
  // to have hidden the create form. The create_program RPC re-enforces this in
  // the database (SECURITY DEFINER), so a direct PostgREST insert can't bypass it.
  const programs = await listPrograms();
  const pro = await isPro();
  if (!canCreateProgram(programs.filter((p) => p.active).length, pro)) {
    return { error: UPSELL_ERROR };
  }

  const { data: created, error } = await supabase.rpc("create_program", {
    p_type: type,
    p_name: data.name,
    p_stamps_required: stampsRequired,
    p_reward_text: data.reward_text,
    p_config: config,
    p_expiry_days: data.expiry_days ?? null,
    p_head_start: headStart,
  });
  if (error) {
    if (error.code === "42501") return { error: UPSELL_ERROR };
    return { error: "Couldn't create your card. Try again." };
  }
  if (!created) {
    return { error: "Couldn't create your card. Try again." };
  }

  revalidatePath("/dashboard");
  redirect(`/dashboard?p=${created}`);
}
