"use server";

import { createServerClient } from "@/lib/supabase/server";
import { normalizePhone } from "@/lib/phone";
import { getProgress } from "@/lib/engine";
import { qrSvg } from "@/lib/qr";
import { allowRequest } from "@/lib/rate-limit";
import { isCardExpired } from "@/lib/expiry";
import type { ActionResult } from "@/lib/action-result";
import type { CardStatus, StatusState } from "../types";

type VendorJoinRow = {
  program_id: string;
  name: string;
  type: string;
  config: unknown;
  state: unknown;
  stamp_count: number;
  card_token: string;
  reward_text: string;
  stamps_required: number;
  expiry_days: number | null;
  cycle_started_at: string | null;
  active: boolean;
  replaced_by_name: string | null;
  replaced_by_stamp_count: number | null;
};

// Public card-check action — no auth. The vendor shares /c?v=<vendorId>; the
// phone the customer types in is the only input. vendor_join (SECURITY
// DEFINER) is the sole read/write path: it enrolls the phone into every
// active program it doesn't already have a card for, then returns every
// card the phone holds at this vendor. The engine computes progress per
// card, so this stays type-agnostic across program types.
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

  const vendorId = String(formData.get("vendor") ?? "");
  if (!vendorId) {
    return { status: "error", message: "Missing shop." };
  }

  const supabase = await createServerClient();

  const { data, error } = await supabase.rpc("vendor_join", {
    p_vendor: vendorId,
    p_phone: normalized.phone,
  });
  if (error) {
    console.error("vendor_join failed", error);
    return { status: "error", message: "Something went wrong." };
  }

  const rows = (data ?? []) as VendorJoinRow[];
  if (rows.length === 0) {
    return { status: "none", message: "We couldn't find any rewards here." };
  }

  const cards: CardStatus[] = await Promise.all(
    rows.map(async (row) => {
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
        programId: row.program_id,
        name: row.name,
        label: progress.label,
        view: progress.view,
        rewardReady: progress.rewardReady,
        reward_text: row.reward_text,
        qr,
        expired,
        active: row.active,
        replacedByName: row.replaced_by_name ?? null,
        carriedOverCount:
          row.replaced_by_stamp_count && row.replaced_by_stamp_count > 0
            ? row.replaced_by_stamp_count
            : null,
      };
    }),
  );

  return { status: "found", cards, phone: normalized.phone };
}

// Customer self-service card regeneration — for a lost QR or an expired card.
// Same trust model as enroll_card/checkStatusAction: identity is the phone
// number typed into /c, no separate customer auth exists in this app. Rate-
// limited like the rest of the public /c surface. Unchanged by the
// vendor-level join redesign — still acts on one program's card at a time,
// invoked per-card from the check-form's card list.
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
