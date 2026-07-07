"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireVendor } from "@/lib/auth";
import { getProgram } from "@/lib/program";
import { normalizePhone } from "@/lib/phone";
import { rewardReady } from "@/lib/loyalty";
import { createServerClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/action-result";
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
    return { success: false, error: "Something went wrong. Try again." };
  }

  revalidatePath("/dashboard");
  return {
    success: true,
    card: { id: card.id, phone: card.phone, stamp_count: card.stamp_count },
    rewardReady: rewardReady(card.stamp_count, program.stamps_required),
  };
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
    return { success: false, error: "Something went wrong. Try again." };
  }

  revalidatePath("/dashboard");
  return {
    success: true,
    card: { id: card.id, phone: card.phone, stamp_count: card.stamp_count },
    rewardReady: false,
  };
}
