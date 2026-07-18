"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireVendor } from "@/features/auth";
import {
  saveProgramSchema,
  buildProgramFields,
  getProgramById,
  listPrograms,
  isPro,
  canCreateProgram,
  canPrepProgram,
  getEntitlement,
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
    expiry_days: formData.get("expiry_days"),
    reward_expiry_days: formData.get("reward_expiry_days"),
    head_start: formData.get("head_start"),
    head_start_percent: formData.get("head_start_percent"),
    variant: formData.get("variant"),
  });
  if (!parsed.success) {
    return { error: "Check the card details and try again." };
  }

  const data = parsed.data;
  const { type, stampsRequired, config, headStart, headStartPercent } =
    buildProgramFields(data);

  const supabase = await createServerClient();

  if (isEdit) {
    const update: ProgramUpdate = {
      type,
      name: data.name,
      stamps_required: stampsRequired,
      reward_text: data.reward_text,
      config,
      expiry_days: data.expiry_days ?? null,
      reward_expiry_days:
        "reward_expiry_days" in data ? (data.reward_expiry_days ?? null) : null,
      head_start: headStart,
      head_start_percent: headStartPercent,
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
  if (
    !canCreateProgram(
      getEntitlement(pro),
      programs.filter((p) => p.active).length,
    )
  ) {
    return { error: UPSELL_ERROR };
  }

  const { data: created, error } = await supabase.rpc("create_program", {
    p_type: type,
    p_name: data.name,
    p_stamps_required: stampsRequired,
    p_reward_text: data.reward_text,
    p_config: config,
    p_expiry_days: data.expiry_days ?? null,
    p_reward_expiry_days:
      "reward_expiry_days" in data ? (data.reward_expiry_days ?? null) : null,
    p_head_start: headStart,
    p_head_start_percent: headStartPercent,
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

// Vendor-initiated "change type" flow (templates-and-migration design,
// Section C): a program's type is immutable in place (see the comment on
// saveProgramAction above), so migrating means retiring the old program and
// creating a fresh one — never mutating `type` on an existing row.
//
// Order matters: the old program is deactivated BEFORE the new one is
// created. create_program's plan-cap gate counts only active programs
// (migration 0016), so deactivating first is what lets a free-tier vendor's
// single active program be replaced without ever needing a Pro upsell.
export async function changeTypeAction(
  _prev: SaveProgramState,
  formData: FormData,
): Promise<SaveProgramState> {
  await requireVendor();

  const replacingId = String(formData.get("replacing") ?? "").trim();
  const existing = replacingId ? await getProgramById(replacingId) : null;
  if (!existing) return { error: "Couldn't find that card." };

  const parsed = saveProgramSchema.safeParse({
    type: formData.get("type"),
    name: formData.get("name"),
    stamps_required: formData.get("stamps_required"),
    reward_text: formData.get("reward_text"),
    win_percent: formData.get("win_percent"),
    pity_ceiling: formData.get("pity_ceiling"),
    visits_to_bloom: formData.get("visits_to_bloom"),
    segments: formData.get("segments"),
    expiry_days: formData.get("expiry_days"),
    reward_expiry_days: formData.get("reward_expiry_days"),
    head_start: formData.get("head_start"),
    head_start_percent: formData.get("head_start_percent"),
    variant: formData.get("variant"),
  });
  if (!parsed.success) {
    return { error: "Check the card details and try again." };
  }

  const { type, stampsRequired, config, headStart, headStartPercent } =
    buildProgramFields(parsed.data);

  // Belt-and-suspenders: the UI only renders the checkbox when the
  // predecessor's type and the new type both resolve to "stamp" (Task 3),
  // but a stray field in the submitted form must never carry the flag
  // through for a type pairing the RPC's own guard (Task 1) wouldn't have
  // honored anyway — this keeps the intent visible at the call site too.
  const carryOverStamps =
    formData.get("carry_over_stamps") === "true" &&
    existing.type === "stamp" &&
    type === "stamp";

  const supabase = await createServerClient();

  // 1. Deactivate the old program first (see order note above).
  const { error: deactivateError } = await supabase
    .from("programs")
    .update({ active: false })
    .eq("id", replacingId);
  if (deactivateError) {
    return { error: "Couldn't change your card. Try again." };
  }

  // 2. Create the new program.
  const { data: created, error: createError } = await supabase.rpc(
    "create_program",
    {
      p_type: type,
      p_name: parsed.data.name,
      p_stamps_required: stampsRequired,
      p_reward_text: parsed.data.reward_text,
      p_config: config,
      p_expiry_days: parsed.data.expiry_days ?? null,
      p_reward_expiry_days:
        "reward_expiry_days" in parsed.data
          ? (parsed.data.reward_expiry_days ?? null)
          : null,
      p_head_start: headStart,
      p_carry_over_stamps: carryOverStamps,
      p_head_start_percent: headStartPercent,
    },
  );
  if (createError || !created) {
    // Old program is already deactivated with no replacement yet — not data
    // loss. The vendor can retry from /setup; the free-tier gate is open
    // again (active count is back to 0). No saga/rollback machinery, matching
    // this codebase's existing non-transactional RPC-sequencing pattern.
    return { error: "Couldn't create the new card. Try again from Setup." };
  }

  // 3. Link old -> new so vendor_join can tell affected customers. Best
  // effort: a failure here just means the retired card shows the generic
  // message (program-card-status.tsx) instead of naming the replacement —
  // cosmetic, not blocking.
  await supabase
    .from("programs")
    .update({ replaced_by: created })
    .eq("id", replacingId);

  revalidatePath("/setup");
  redirect(`/dashboard?p=${created}`);
}

const PREP_UPSELL_ERROR =
  "You already have a card and a prepped replacement — activate or replace one first.";

// Free-tier prep flow: create a second program that starts inactive
// (hidden from customers — enroll_card gates on active) alongside the
// vendor's existing active one. The vendor activates it later via
// activateProgramAction when ready. Pro doesn't need this action (Pro
// creates directly active via saveProgramAction, no cap) but isn't
// blocked from calling it either — canPrepProgram/create_program's
// p_active=false branch never restricts Pro.
export async function prepProgramAction(
  _prev: SaveProgramState,
  formData: FormData,
): Promise<SaveProgramState> {
  await requireVendor();

  const parsed = saveProgramSchema.safeParse({
    type: formData.get("type"),
    name: formData.get("name"),
    stamps_required: formData.get("stamps_required"),
    reward_text: formData.get("reward_text"),
    win_percent: formData.get("win_percent"),
    pity_ceiling: formData.get("pity_ceiling"),
    visits_to_bloom: formData.get("visits_to_bloom"),
    segments: formData.get("segments"),
    expiry_days: formData.get("expiry_days"),
    reward_expiry_days: formData.get("reward_expiry_days"),
    head_start: formData.get("head_start"),
    head_start_percent: formData.get("head_start_percent"),
    variant: formData.get("variant"),
  });
  if (!parsed.success) {
    return { error: "Check the card details and try again." };
  }

  const { type, stampsRequired, config, headStart, headStartPercent } =
    buildProgramFields(parsed.data);

  const programs = await listPrograms();
  const pro = await isPro();
  if (
    !canPrepProgram(
      getEntitlement(pro),
      programs.filter((p) => p.replaced_by === null).length,
    )
  ) {
    return { error: PREP_UPSELL_ERROR };
  }

  const supabase = await createServerClient();
  const { data: created, error } = await supabase.rpc("create_program", {
    p_type: type,
    p_name: parsed.data.name,
    p_stamps_required: stampsRequired,
    p_reward_text: parsed.data.reward_text,
    p_config: config,
    p_expiry_days: parsed.data.expiry_days ?? null,
    p_reward_expiry_days:
      "reward_expiry_days" in parsed.data
        ? (parsed.data.reward_expiry_days ?? null)
        : null,
    p_head_start: headStart,
    p_active: false,
    p_head_start_percent: headStartPercent,
  });
  if (error) {
    if (error.code === "42501") return { error: PREP_UPSELL_ERROR };
    return { error: "Couldn't create your card. Try again." };
  }
  if (!created) {
    return { error: "Couldn't create your card. Try again." };
  }

  revalidatePath("/setup");
  redirect(`/setup?edit=${created}`);
}

// Free-tier "flip the switch" action: activates a prepped program,
// deactivating whatever else is currently active for this vendor (the
// activate_program RPC, migration 0023, does the actual swap + links the
// old program(s) to this one via replaced_by).
export async function activateProgramAction(
  _prev: SaveProgramState,
  formData: FormData,
): Promise<SaveProgramState> {
  await requireVendor();

  const id = String(formData.get("id") ?? "").trim();
  if (!id) return { error: "Couldn't find that card." };

  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc("activate_program", {
    p_program: id,
  });
  if (error || !data) {
    return { error: "Couldn't activate that card. Try again." };
  }

  revalidatePath("/setup");
  revalidatePath("/dashboard");
  redirect(`/dashboard?p=${id}`);
}

// Pro-only scheduled cutover: sets a future date on which `id` retires and
// hands over to `successor_id`. The schedule_retirement RPC (migration
// 0023) enforces Pro-only, ownership of both programs, and that both are
// currently active — this action just surfaces its errors.
export async function scheduleRetirementAction(
  _prev: SaveProgramState,
  formData: FormData,
): Promise<SaveProgramState> {
  await requireVendor();

  const id = String(formData.get("id") ?? "").trim();
  const successorId = String(formData.get("successor_id") ?? "").trim();
  const dateValue = String(formData.get("date") ?? "").trim();
  if (!id || !successorId || !dateValue) {
    return { error: "Pick a successor card and a date." };
  }

  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime()) || date.getTime() <= Date.now()) {
    return { error: "Pick a date in the future." };
  }

  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc("schedule_retirement", {
    p_program: id,
    p_successor: successorId,
    p_date: date.toISOString(),
  });
  if (error || !data) {
    if (error?.code === "42501") {
      return { error: "Scheduled retirement is a Pro feature." };
    }
    return { error: "Couldn't schedule that. Try again." };
  }

  revalidatePath("/setup");
  redirect("/setup");
}
