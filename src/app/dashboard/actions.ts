"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireVendor } from "@/features/auth";
import { getProgramById, isPro } from "@/lib/program";
import { normalizePhone } from "@/lib/phone";
import { rewardReady } from "@/lib/loyalty";
import { applyVisit, getProgress, resolvePlantState } from "@/lib/engine";
import { plantStrategy, type PlantConfig } from "@/lib/engine/plant";
import { isCardExpired } from "@/lib/expiry";
import { createServerClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/action-result";
import type { Progress } from "@/lib/engine/types";
import type { Json } from "@/lib/types";
import type { StampCard } from "@/app/dashboard/card";

type CardResult = ActionResult<{ card: StampCard; rewardReady: boolean }>;

// Resolve which of the vendor's programs a counter form is acting on. The form
// carries the current program's id in a hidden input; getProgramById is
// RLS-scoped, so a vendor can only ever resolve their own programs.
async function programFromForm(formData: FormData) {
  const id = String(formData.get("program_id") ?? "").trim();
  return id ? getProgramById(id) : null;
}

// Add a stamp to the phone's card (add_stamp no longer caps at the requirement — it increments unconditionally).
export async function stampAction(formData: FormData): Promise<CardResult> {
  await requireVendor();

  const program = await programFromForm(formData);
  if (!program) {
    return { success: false, error: "Set up your card first." };
  }

  const normalized = normalizePhone(String(formData.get("phone") ?? ""));
  if (!normalized.ok) {
    return { success: false, error: "Enter a valid Singapore phone number." };
  }

  const supabase = await createServerClient();
  const { data: existingCycle } = await supabase
    .from("cards")
    .select("cycle_started_at")
    .eq("program_id", program.id)
    .eq("phone", normalized.phone)
    .maybeSingle();
  if (
    existingCycle &&
    isCardExpired(
      existingCycle.cycle_started_at,
      program.expiry_days,
      new Date(),
    )
  ) {
    return {
      success: false,
      error: "This card has expired. Regenerate it to start a new cycle.",
    };
  }

  const { data: card, error } = await supabase.rpc("add_stamp", {
    p_program: program.id,
    p_phone: normalized.phone,
  });
  if (error || !card) {
    console.error("add_stamp failed", error);
    return { success: false, error: "Something went wrong. Try again." };
  }

  revalidatePath("/dashboard");
  return {
    success: true,
    card: { id: card.id, phone: card.phone, stamp_count: card.stamp_count },
    rewardReady: rewardReady(card.stamp_count, program.stamps_required),
  };
}

type VisitResult = ActionResult<{
  rewardUnlocked: boolean;
  progress: Progress;
  reward_text: string;
  phone: string;
}>;

// Generic engine play path for non-stamp types (Lucky Tap, Sprout). The pure
// strategy computes the next card state from a server-generated roll —
// randomness never comes from the client — and record_visit persists it and
// logs the event. Fresh per-type progress is derived so the client can render it.
export async function recordVisitAction(
  formData: FormData,
): Promise<VisitResult> {
  await requireVendor();
  const program = await programFromForm(formData);
  if (!program) return { success: false, error: "Set up your card first." };
  const normalized = normalizePhone(String(formData.get("phone") ?? ""));
  if (!normalized.ok) {
    return { success: false, error: "Enter a valid Singapore phone number." };
  }

  const supabase = await createServerClient();
  const { data: existing } = await supabase
    .from("cards")
    .select("id,phone,stamp_count,reward_count,state,cycle_started_at")
    .eq("program_id", program.id)
    .eq("phone", normalized.phone)
    .maybeSingle();

  const now = new Date();
  if (
    existing &&
    isCardExpired(existing.cycle_started_at, program.expiry_days, now)
  ) {
    return {
      success: false,
      error: "This card has expired. Regenerate it to start a new cycle.",
    };
  }

  const card = existing ?? { state: {}, stamp_count: 0, reward_count: 0 };
  const event = { kind: "visit" as const, payload: { roll: Math.random() } };
  const { state, rewardUnlocked } = applyVisit(program, card, event, now);

  const { error } = await supabase.rpc("record_visit", {
    p_program: program.id,
    p_phone: normalized.phone,
    p_state: state as Json,
    p_kind: "visit",
    p_payload: { won: rewardUnlocked, roll: event.payload.roll },
  });
  if (error) {
    console.error("record_visit failed", error.message);
    return { success: false, error: "Something went wrong. Try again." };
  }

  const progress = getProgress(
    program,
    { state, stamp_count: 0, reward_count: 0 },
    now,
  );

  revalidatePath("/dashboard");
  return {
    success: true,
    rewardUnlocked,
    progress,
    reward_text:
      (program.config as { reward_text?: string })?.reward_text ??
      program.reward_text,
    phone: normalized.phone,
  };
}

// Redeem a bloomed Sprout: the pure strategy carries over any excess growth
// past the bloom threshold (instead of resetting to a seed) and counts the
// bloom; record_visit persists the carried-over state and logs a 'redeem'
// event so metrics and recent activity see the reward. Reuses the generic
// write path — no card id needed, just the phone.
export async function redeemPlantAction(
  formData: FormData,
): Promise<ActionResult<{ phone: string; progress: Progress }>> {
  await requireVendor();
  const program = await programFromForm(formData);
  if (!program) return { success: false, error: "Set up your card first." };
  const normalized = normalizePhone(String(formData.get("phone") ?? ""));
  if (!normalized.ok) {
    return { success: false, error: "Enter a valid Singapore phone number." };
  }

  const supabase = await createServerClient();
  const { data: existing } = await supabase
    .from("cards")
    .select("state")
    .eq("program_id", program.id)
    .eq("phone", normalized.phone)
    .maybeSingle();
  if (!existing) {
    return { success: false, error: "No card yet for that number." };
  }

  const config = program.config as PlantConfig;
  const state = resolvePlantState({
    state: existing.state,
    stamp_count: 0,
    reward_count: 0,
  });
  const reset = plantStrategy.redeem(state, config);

  const { error } = await supabase.rpc("record_visit", {
    p_program: program.id,
    p_phone: normalized.phone,
    p_state: reset as unknown as Json,
    p_kind: "redeem",
    p_payload: { reward: program.reward_text },
  });
  if (error) {
    console.error("record_visit redeem failed", error.message);
    return { success: false, error: "Something went wrong. Try again." };
  }

  const progress = getProgress(
    program,
    { state: reset, stamp_count: 0, reward_count: 0 },
    new Date(),
  );

  revalidatePath("/dashboard");
  return { success: true, phone: normalized.phone, progress };
}

// Regenerate a customer's card: reissues the card_token (invalidates the old
// QR) and resets progress + the expiry clock — for a lost QR or a fresh start
// after expiry. Vendor-triggered counterpart to the customer self-service
// action in src/app/c/actions.ts; both call the same public regenerate_card
// RPC (phone-validated, no separate customer auth exists in this app).
export async function regenerateCardAction(
  formData: FormData,
): Promise<ActionResult<{ phone: string }>> {
  await requireVendor();
  const program = await programFromForm(formData);
  if (!program) return { success: false, error: "Set up your card first." };
  const normalized = normalizePhone(String(formData.get("phone") ?? ""));
  if (!normalized.ok) {
    return { success: false, error: "Enter a valid Singapore phone number." };
  }

  const supabase = await createServerClient();
  const { data: card, error } = await supabase.rpc("regenerate_card", {
    p_program: program.id,
    p_phone: normalized.phone,
  });
  if (error || !card) {
    console.error("regenerate_card failed", error);
    return { success: false, error: "Something went wrong. Try again." };
  }

  revalidatePath("/dashboard");
  return { success: true, phone: normalized.phone };
}

// Resolve a scanned card_token to its phone via the owner-gated card_by_token
// RPC. Identifies only — the phone flows into the existing stamp/play action.
export async function resolveTokenAction(
  formData: FormData,
): Promise<ActionResult<{ phone: string; programId: string }>> {
  await requireVendor();
  const token = String(formData.get("token") ?? "").trim();
  if (!token) return { success: false, error: "No code scanned." };

  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc("card_by_token", {
    p_token: token,
  });
  if (error) {
    console.error("card_by_token failed", error.message);
    return { success: false, error: "Couldn't read that code." };
  }
  const row = data?.[0];
  if (!row) return { success: false, error: "That card isn't for this shop." };
  return { success: true, phone: row.phone, programId: row.program_id };
}

type LookupResult = ActionResult<{ card: StampCard; progress: Progress }>;

// Read a card's status by phone WITHOUT mutating it — so any type's reward can
// be redeemed without a spurious visit. Type-aware: the engine computes the
// per-type progress (stamp dots / lucky / plant) the client renders. Vendor-
// scoped by RLS (cards_own), and returns the card id the stamp redeem RPC needs.
export async function lookupAction(formData: FormData): Promise<LookupResult> {
  await requireVendor();

  const program = await programFromForm(formData);
  if (!program) {
    return { success: false, error: "Set up your card first." };
  }

  const normalized = normalizePhone(String(formData.get("phone") ?? ""));
  if (!normalized.ok) {
    return { success: false, error: "Enter a valid Singapore phone number." };
  }

  const supabase = await createServerClient();
  const { data: card, error } = await supabase
    .from("cards")
    .select("id,phone,stamp_count,reward_count,state")
    .eq("program_id", program.id)
    .eq("phone", normalized.phone)
    .maybeSingle();
  if (error) {
    console.error("card lookup failed", error);
    return { success: false, error: "Something went wrong. Try again." };
  }
  if (!card) {
    return { success: false, error: "No card yet for that number." };
  }

  const progress = getProgress(
    program,
    {
      state: card.state,
      stamp_count: card.stamp_count,
      reward_count: card.reward_count,
    },
    new Date(),
  );

  return {
    success: true,
    card: { id: card.id, phone: card.phone, stamp_count: card.stamp_count },
    progress,
  };
}

// Redeem a full card: resets stamps to 0 and logs the reward. Returns the
// reset card so the UI can replace the reward-ready block with a confirmation.
export async function redeemAction(formData: FormData): Promise<CardResult> {
  await requireVendor();

  const parsed = z.string().min(1).safeParse(formData.get("card_id"));
  if (!parsed.success) {
    return { success: false, error: "Missing card." };
  }

  const supabase = await createServerClient();
  const { data: card, error } = await supabase.rpc("redeem", {
    p_card: parsed.data,
  });
  if (error || !card) {
    console.error("redeem failed", error);
    return { success: false, error: "Something went wrong. Try again." };
  }

  revalidatePath("/dashboard");
  return {
    success: true,
    card: { id: card.id, phone: card.phone, stamp_count: card.stamp_count },
    rewardReady: false,
  };
}

export type QkitEarnConfigResult = ActionResult<{
  enabled: boolean;
  programId: string | null;
}>;

// Vendor-owned setting: which stamp program (if any) earns a stamp when a
// customer completes a qkit order. Pro-gated, same tier check as the
// program-count limit (isPro from @/lib/program).
export async function saveQkitEarnConfigAction(
  formData: FormData,
): Promise<QkitEarnConfigResult> {
  const { user } = await requireVendor();
  const pro = await isPro();
  if (!pro) {
    return { success: false, error: "Upgrade to Pro to enable this." };
  }

  const enabled = formData.get("enabled") === "on";
  const programId = String(formData.get("program_id") ?? "");
  // qkit_earn_config.program_id is NOT NULL — a program must be picked
  // whether the vendor is turning the setting on or off.
  if (!programId) {
    return { success: false, error: "Pick a program first." };
  }

  const supabase = await createServerClient();
  const { error } = await supabase
    .from("qkit_earn_config")
    .upsert(
      { vendor_id: user.id, program_id: programId, enabled },
      { onConflict: "vendor_id" },
    );
  if (error) {
    console.error("saveQkitEarnConfigAction failed", error.message);
    return { success: false, error: "Something went wrong." };
  }

  revalidatePath("/dashboard/settings");
  return { success: true, enabled, programId };
}
