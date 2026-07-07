"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireVendor } from "@/lib/auth";
import { getProgram } from "@/lib/program";
import { normalizePhone } from "@/lib/phone";
import { rewardReady } from "@/lib/loyalty";
import { applyVisit } from "@/lib/engine";
import { createServerClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/action-result";
import type { Json } from "@/lib/types";
import type { StampCard } from "@/app/dashboard/card";

type CardResult = ActionResult<{ card: StampCard; rewardReady: boolean }>;

// Add a stamp to the phone's card (capped at the requirement by add_stamp).
export async function stampAction(formData: FormData): Promise<CardResult> {
  await requireVendor();

  const program = await getProgram();
  if (!program) {
    return { success: false, error: "Set up your card first." };
  }

  const normalized = normalizePhone(String(formData.get("phone") ?? ""));
  if (!normalized.ok) {
    return { success: false, error: "Enter a valid Singapore phone number." };
  }

  const supabase = await createServerClient();
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
  won: boolean;
  reward_text: string;
  phone: string;
}>;

// Generic engine play path for non-stamp types (Lucky Tap). The pure strategy
// computes the next card state from a server-generated roll — randomness never
// comes from the client — and record_visit persists it and logs the event.
export async function recordVisitAction(
  formData: FormData,
): Promise<VisitResult> {
  await requireVendor();
  const program = await getProgram();
  if (!program) return { success: false, error: "Set up your card first." };
  const normalized = normalizePhone(String(formData.get("phone") ?? ""));
  if (!normalized.ok) {
    return { success: false, error: "Enter a valid Singapore phone number." };
  }

  const supabase = await createServerClient();
  const { data: existing } = await supabase
    .from("cards")
    .select("id,phone,stamp_count,reward_count,state")
    .eq("program_id", program.id)
    .eq("phone", normalized.phone)
    .maybeSingle();

  const card = existing ?? { state: {}, stamp_count: 0, reward_count: 0 };
  const event = { kind: "visit" as const, payload: { roll: Math.random() } };
  const { state, rewardUnlocked } = applyVisit(
    program,
    card,
    event,
    new Date(),
  );

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

  revalidatePath("/dashboard");
  return {
    success: true,
    won: rewardUnlocked,
    reward_text:
      (program.config as { reward_text?: string })?.reward_text ??
      program.reward_text,
    phone: normalized.phone,
  };
}

// Resolve a scanned card_token to its phone via the owner-gated card_by_token
// RPC. Identifies only — the phone flows into the existing stamp/play action.
export async function resolveTokenAction(
  formData: FormData,
): Promise<ActionResult<{ phone: string }>> {
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
  return { success: true, phone: row.phone };
}

// Read a card's status by phone WITHOUT stamping it — so a full card can be
// redeemed without being pushed past the ceiling. Vendor-scoped by RLS
// (cards_own), and returns the card id the redeem RPC needs.
export async function lookupAction(formData: FormData): Promise<CardResult> {
  await requireVendor();

  const program = await getProgram();
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
    .select("id,phone,stamp_count")
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

  return {
    success: true,
    card: { id: card.id, phone: card.phone, stamp_count: card.stamp_count },
    rewardReady: rewardReady(card.stamp_count, program.stamps_required),
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
