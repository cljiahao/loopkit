"use server";

import { createServerClient } from "@/lib/supabase/server";
import { normalizePhone } from "@/lib/phone";
import type { StatusState } from "@/app/c/status-state";

// Public stamp-check action — no auth. The vendor shares /c?p=<programId>;
// the phone the customer types in is the only input, and card_status
// (SECURITY DEFINER) is the sole read path, so no table/PII is exposed here.
export async function checkStatusAction(
  _prev: StatusState,
  formData: FormData,
): Promise<StatusState> {
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
  const { data, error } = await supabase.rpc("card_status", {
    p_program: programId,
    p_phone: normalized.phone,
  });
  if (error) {
    return { status: "error", message: "Something went wrong." };
  }

  // No rows: the program doesn't exist or is inactive. A row with
  // stamp_count 0 (existing program, no card yet) is a valid "found" state.
  const row = data?.[0];
  if (!row) {
    return { status: "none", message: "We couldn't find that card." };
  }

  return {
    status: "found",
    name: row.name,
    stamp_count: row.stamp_count,
    stamps_required: row.stamps_required,
    reward_text: row.reward_text,
  };
}
