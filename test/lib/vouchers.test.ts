import { describe, it, expect, vi, beforeEach } from "vitest";

const { fromMock, rpcMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
  rpcMock: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerClient: vi.fn(async () => ({ from: fromMock, rpc: rpcMock })),
}));

import {
  oldestActiveVoucher,
  isPastExpiry,
  daysUntilExpiry,
  countJustExpired,
  listCardVouchers,
  expireStaleVouchers,
  grantRewardVoucher,
  redeemOldestVoucher,
  type VoucherRow,
} from "@/lib/vouchers";

function voucher(overrides: Partial<VoucherRow>): VoucherRow {
  return {
    id: "v1",
    reward_text: "Free kopi",
    earned_at: "2026-07-01T00:00:00Z",
    expires_at: null,
    redeemed_at: null,
    status: "active",
    updated_at: "2026-07-01T00:00:00Z",
    ...overrides,
  };
}

describe("oldestActiveVoucher", () => {
  it("returns the earliest-earned active voucher", () => {
    const vouchers = [
      voucher({ id: "v2", earned_at: "2026-07-05T00:00:00Z" }),
      voucher({ id: "v1", earned_at: "2026-07-01T00:00:00Z" }),
    ];
    expect(oldestActiveVoucher(vouchers)?.id).toBe("v1");
  });

  it("ignores redeemed and expired vouchers", () => {
    const vouchers = [
      voucher({ id: "v1", status: "redeemed" }),
      voucher({ id: "v2", status: "expired" }),
    ];
    expect(oldestActiveVoucher(vouchers)).toBeNull();
  });

  it("returns null for an empty list", () => {
    expect(oldestActiveVoucher([])).toBeNull();
  });
});

describe("isPastExpiry", () => {
  it("is false when expires_at is null (never expires)", () => {
    expect(
      isPastExpiry(voucher({ expires_at: null }), new Date("2026-08-01")),
    ).toBe(false);
  });

  it("is true once now is at/after expires_at", () => {
    expect(
      isPastExpiry(
        voucher({ expires_at: "2026-07-10T00:00:00Z" }),
        new Date("2026-07-10T00:00:01Z"),
      ),
    ).toBe(true);
  });

  it("is false before expires_at", () => {
    expect(
      isPastExpiry(
        voucher({ expires_at: "2026-07-10T00:00:00Z" }),
        new Date("2026-07-09T00:00:00Z"),
      ),
    ).toBe(false);
  });
});

describe("daysUntilExpiry", () => {
  it("rounds up to whole days", () => {
    expect(
      daysUntilExpiry("2026-07-12T00:00:00Z", new Date("2026-07-10T00:00:00Z")),
    ).toBe(2);
  });

  it("floors at 0 for a past date", () => {
    expect(
      daysUntilExpiry("2026-07-01T00:00:00Z", new Date("2026-07-10T00:00:00Z")),
    ).toBe(0);
  });
});

describe("countJustExpired", () => {
  it("counts only expired vouchers updated at/after the given timestamp", () => {
    const vouchers = [
      voucher({
        id: "v1",
        status: "expired",
        updated_at: "2026-07-10T10:00:00Z",
      }),
      voucher({
        id: "v2",
        status: "expired",
        updated_at: "2026-07-01T00:00:00Z",
      }),
      voucher({
        id: "v3",
        status: "active",
        updated_at: "2026-07-10T10:00:00Z",
      }),
    ];
    expect(countJustExpired(vouchers, "2026-07-10T09:00:00Z")).toBe(1);
  });
});

describe("listCardVouchers", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns the card's vouchers, most recently earned first", async () => {
    const rows = [voucher({ id: "v1" })];
    const order = vi.fn(async () => ({ data: rows, error: null }));
    const eq = vi.fn(() => ({ order }));
    const select = vi.fn(() => ({ eq }));
    fromMock.mockReturnValue({ select });

    const result = await listCardVouchers("card-1");

    expect(result).toEqual(rows);
    expect(fromMock).toHaveBeenCalledWith("reward_vouchers");
    expect(eq).toHaveBeenCalledWith("card_id", "card-1");
    expect(order).toHaveBeenCalledWith("earned_at", { ascending: false });
  });

  it("throws when the query errors", async () => {
    const order = vi.fn(async () => ({
      data: null,
      error: { message: "boom" },
    }));
    fromMock.mockReturnValue({
      select: () => ({ eq: () => ({ order }) }),
    });

    await expect(listCardVouchers("card-1")).rejects.toThrow(/boom/);
  });
});

describe("expireStaleVouchers", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns how many vouchers were swept", async () => {
    rpcMock.mockResolvedValue({ data: 2, error: null });

    const count = await expireStaleVouchers("card-1");

    expect(count).toBe(2);
    expect(rpcMock).toHaveBeenCalledWith("expire_stale_vouchers", {
      p_card: "card-1",
    });
  });

  it("throws when the RPC errors", async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: "boom" } });

    await expect(expireStaleVouchers("card-1")).rejects.toThrow(/boom/);
  });
});

describe("grantRewardVoucher", () => {
  beforeEach(() => vi.clearAllMocks());

  it("calls grant_reward_voucher with the given fields", async () => {
    rpcMock.mockResolvedValue({ error: null });

    await grantRewardVoucher("card-1", "Free kopi", 30, 1, false);

    expect(rpcMock).toHaveBeenCalledWith("grant_reward_voucher", {
      p_card: "card-1",
      p_reward_text: "Free kopi",
      p_expiry_days: 30,
      p_count: 1,
      p_immediate: false,
    });
  });

  it("throws when the RPC errors", async () => {
    rpcMock.mockResolvedValue({ error: { message: "boom" } });

    await expect(
      grantRewardVoucher("card-1", "Free kopi", null, 1, true),
    ).rejects.toThrow(/boom/);
  });
});

describe("redeemOldestVoucher", () => {
  beforeEach(() => vi.clearAllMocks());

  it("calls redeem_oldest_voucher for the card", async () => {
    rpcMock.mockResolvedValue({ error: null });

    await redeemOldestVoucher("card-1");

    expect(rpcMock).toHaveBeenCalledWith("redeem_oldest_voucher", {
      p_card: "card-1",
    });
  });

  it("throws the raw Postgres message when the RPC errors", async () => {
    rpcMock.mockResolvedValue({ error: { message: "no_active_voucher" } });

    await expect(redeemOldestVoucher("card-1")).rejects.toThrow(
      "no_active_voucher",
    );
  });
});
