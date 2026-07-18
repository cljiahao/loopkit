import { createServerClient } from "@/lib/supabase/server";

export type VoucherRow = {
  id: string;
  reward_text: string;
  earned_at: string;
  expires_at: string | null;
  redeemed_at: string | null;
  status: "active" | "redeemed" | "expired";
  updated_at: string;
};

const VOUCHER_COLUMNS =
  "id,reward_text,earned_at,expires_at,redeemed_at,status,updated_at";

// Impure shell: every voucher a card has ever had, most recently earned
// first. RLS (reward_vouchers_own) scopes this to programs the signed-in
// vendor owns.
export async function listCardVouchers(cardId: string): Promise<VoucherRow[]> {
  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("reward_vouchers")
    .select(VOUCHER_COLUMNS)
    .eq("card_id", cardId)
    .order("earned_at", { ascending: false });
  if (error) throw new Error(`listCardVouchers: ${error.message}`);
  return (data ?? []) as VoucherRow[];
}

// Pure: the earliest still-`active`-status voucher, or null. This is the
// DB's status, not a display-adjusted "is it actually past expiry" check —
// see isPastExpiry for that.
export function oldestActiveVoucher(vouchers: VoucherRow[]): VoucherRow | null {
  const active = vouchers.filter((v) => v.status === "active");
  if (active.length === 0) return null;
  return active.reduce((oldest, v) =>
    v.earned_at < oldest.earned_at ? v : oldest,
  );
}

// Pure: true when an active-status voucher's expires_at has already passed
// but the DB row hasn't been swept yet (only add_stamp/redeem/Plant's
// visit path can sweep — a read-only view just displays this). Never
// mutates anything.
export function isPastExpiry(voucher: VoucherRow, now: Date): boolean {
  return voucher.expires_at !== null && new Date(voucher.expires_at) <= now;
}

// Pure: whole days until expiry, floored at 0. Only meaningful when
// expires_at is non-null — callers check that first.
export function daysUntilExpiry(expiresAt: string, now: Date): number {
  const ms = new Date(expiresAt).getTime() - now.getTime();
  return Math.max(0, Math.ceil(ms / 86_400_000));
}

// Pure: vouchers that flipped to 'expired' at/after sinceIso — i.e. during
// the current request. Lets a caller toast "a reward just expired" without
// add_stamp/redeem needing to change their return shape.
export function countJustExpired(
  vouchers: VoucherRow[],
  sinceIso: string,
): number {
  return vouchers.filter(
    (v) => v.status === "expired" && v.updated_at >= sinceIso,
  ).length;
}

// Impure shell: sweeps this card's past-expiry active vouchers, returns how
// many were just flipped. Callers forfeit the corresponding threshold's
// worth of progress themselves (Stamp does this in SQL already inside
// add_stamp/redeem; Plant's TS server actions call this directly).
export async function expireStaleVouchers(cardId: string): Promise<number> {
  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc("expire_stale_vouchers", {
    p_card: cardId,
  });
  if (error) throw new Error(`expireStaleVouchers: ${error.message}`);
  return data ?? 0;
}

// Impure shell: grants `count` new vouchers for a card. `immediate` is for
// instant-resolve types (Lucky/Wheel/Scratch) — born already redeemed.
export async function grantRewardVoucher(
  cardId: string,
  rewardText: string,
  expiryDays: number | null,
  count: number,
  immediate: boolean,
): Promise<void> {
  const supabase = await createServerClient();
  const { error } = await supabase.rpc("grant_reward_voucher", {
    p_card: cardId,
    p_reward_text: rewardText,
    p_expiry_days: expiryDays,
    p_count: count,
    p_immediate: immediate,
  });
  if (error) throw new Error(`grantRewardVoucher: ${error.message}`);
}

// Impure shell: marks the oldest active voucher redeemed. Throws with the
// raw Postgres message (including "no_active_voucher" when none exist) —
// callers pattern-match on that to show a friendly error.
export async function redeemOldestVoucher(cardId: string): Promise<void> {
  const supabase = await createServerClient();
  const { error } = await supabase.rpc("redeem_oldest_voucher", {
    p_card: cardId,
  });
  if (error) throw new Error(error.message);
}
