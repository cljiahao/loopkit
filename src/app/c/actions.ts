"use server";

import { createServerClient } from "@/lib/supabase/server";
import { normalizePhone } from "@/lib/phone";
import { getProgress } from "@/lib/engine";
import { qrSvg } from "@/lib/qr";
import { allowRequest } from "@/lib/rate-limit";
import { isCardExpired } from "@/lib/expiry";
import type { ActionResult } from "@/lib/action-result";
import type { StatusState } from "@/app/c/status-state";

// Public card-check action — no auth. The vendor shares /c?p=<programId>; the
// phone the customer types in is the only input. enroll_card + card_view
// (SECURITY DEFINER) are the sole read/write paths, so no table/PII is exposed
// here. The engine computes progress, so the view is type-agnostic.
export async function checkStatusAction(
  _prev: StatusState,
  formData: FormData,
): Promise<StatusState> {
  if (!(await allowRequest("c-check"))) {
    return {
      status: "error",
      message: "Too many attempts — try again in a minute.",
    };
  }

  const normalized = normalizePhone(String(formData.get("phone") ?? ""));
  if (!normalized.ok) {
    return {
      status: "error",
      message: "Enter a valid Singapore phone number.",
    };
  }

  const programId = String(formData.get("program") ?? "");
  if (!programId) {
    return { status: "error", message: "Missing program." };
  }

  const supabase = await createServerClient();

  const { error: enrollError } = await supabase.rpc("enroll_card", {
    p_program: programId,
    p_phone: normalized.phone,
  });
  if (enrollError) {
    console.error("enroll_card failed", enrollError);
    return { status: "error", message: "Something went wrong." };
  }

  const { data, error } = await supabase.rpc("card_view", {
    p_program: programId,
    p_phone: normalized.phone,
  });
  if (error) {
    console.error("card_view failed", error);
    return { status: "error", message: "Something went wrong." };
  }

  // No rows: the program doesn't exist or is inactive.
  const row = data?.[0];
  if (!row) {
    return { status: "none", message: "We couldn't find that card." };
  }

  const programLike = {
    type: row.type,
    config: row.config,
    stamps_required: row.stamps_required,
    reward_text: row.reward_text,
  };
  const cardLike = {
    state: row.state,
    stamp_count: row.stamp_count ?? 0,
    reward_count: 0,
  };
  const progress = getProgress(programLike, cardLike, new Date());
  const qr = await qrSvg(row.card_token);
  const expired =
    row.cycle_started_at != null &&
    isCardExpired(row.cycle_started_at, row.expiry_days, new Date());

  return {
    status: "found",
    name: row.name,
    label: progress.label,
    view: progress.view,
    rewardReady: progress.rewardReady,
    reward_text: row.reward_text,
    qr,
    expired,
    programId,
    phone: normalized.phone,
  };
}

// Customer self-service card regeneration — for a lost QR or an expired card.
// Same trust model as enroll_card/checkStatusAction: identity is the phone
// number typed into /c, no separate customer auth exists in this app. Rate-
// limited like the rest of the public /c surface.
export async function regenerateCardAction(
  formData: FormData,
): Promise<ActionResult<{ phone: string }>> {
  if (!(await allowRequest("c-check"))) {
    return {
      success: false,
      error: "Too many attempts — try again in a minute.",
    };
  }

  const normalized = normalizePhone(String(formData.get("phone") ?? ""));
  if (!normalized.ok) {
    return { success: false, error: "Enter a valid Singapore phone number." };
  }
  const programId = String(formData.get("program") ?? "");
  if (!programId) {
    return { success: false, error: "Missing program." };
  }

  const supabase = await createServerClient();
  const { data: card, error } = await supabase.rpc("regenerate_card", {
    p_program: programId,
    p_phone: normalized.phone,
  });
  if (error || !card) {
    console.error("regenerate_card failed", error);
    return { success: false, error: "Something went wrong." };
  }

  return { success: true, phone: normalized.phone };
}
