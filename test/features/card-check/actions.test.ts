import { describe, it, expect, vi, beforeEach } from "vitest";

const { rpcMock, allowRequestMock } = vi.hoisted(() => ({
  rpcMock: vi.fn(),
  allowRequestMock: vi.fn(async () => true),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerClient: vi.fn(async () => ({ rpc: rpcMock })),
}));

vi.mock("@/lib/qr", () => ({
  qrSvg: vi.fn(async (text: string) => `<svg data-token="${text}"></svg>`),
}));

vi.mock("@/lib/rate-limit", () => ({
  allowRequest: allowRequestMock,
}));

import {
  checkStatusAction,
  regenerateCardAction,
} from "@/features/card-check/api/actions";
import { STATUS_IDLE } from "@/features/card-check/types";

function form(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

function mockJoin(rows: unknown[]) {
  rpcMock.mockImplementation((fn: string) => {
    if (fn === "vendor_join")
      return Promise.resolve({ data: rows, error: null });
    return Promise.resolve({ data: null, error: null });
  });
}

function mockRegenerate(card: unknown) {
  rpcMock.mockImplementation((fn: string) => {
    if (fn === "regenerate_card")
      return Promise.resolve({ data: card, error: null });
    return Promise.resolve({ data: null, error: null });
  });
}

describe("checkStatusAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    allowRequestMock.mockResolvedValue(true);
  });

  it("rejects an invalid phone without calling the RPC", async () => {
    const result = await checkStatusAction(
      STATUS_IDLE,
      form({ vendor: "v1", phone: "not-a-phone" }),
    );

    expect(result).toEqual({
      status: "error",
      message: "Enter a valid Singapore phone number.",
    });
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("rejects a missing vendor without calling the RPC", async () => {
    const result = await checkStatusAction(
      STATUS_IDLE,
      form({ vendor: "", phone: "91234567" }),
    );

    expect(result).toEqual({ status: "error", message: "Missing shop." });
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("returns a rate-limit error without calling the RPC when too many attempts have been made", async () => {
    allowRequestMock.mockResolvedValue(false);
    const result = await checkStatusAction(
      STATUS_IDLE,
      form({ vendor: "v1", phone: "91234567" }),
    );

    expect(result).toEqual({
      status: "error",
      message: "Too many attempts — try again in a minute.",
    });
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("calls vendor_join with the normalized phone", async () => {
    mockJoin([
      {
        program_id: "p1",
        name: "Kaya Toast Co.",
        type: "stamp",
        config: {},
        state: {},
        stamp_count: 3,
        card_token: "tok_abc",
        reward_text: "Free kopi",
        stamps_required: 10,
        expiry_days: null,
        cycle_started_at: null,
        active: true,
      },
    ]);

    await checkStatusAction(
      STATUS_IDLE,
      form({ vendor: "v1", phone: "9123 4567" }),
    );

    expect(rpcMock).toHaveBeenCalledWith("vendor_join", {
      p_vendor: "v1",
      p_phone: "+6591234567",
    });
  });

  it("returns one card per row, reading stamp_count not the (empty) state blob", async () => {
    mockJoin([
      {
        program_id: "p1",
        name: "Kaya Toast Co.",
        type: "stamp",
        config: {},
        state: {},
        stamp_count: 3,
        card_token: "tok_abc",
        reward_text: "Free kopi",
        stamps_required: 10,
        expiry_days: null,
        cycle_started_at: null,
        active: true,
      },
    ]);

    const result = await checkStatusAction(
      STATUS_IDLE,
      form({ vendor: "v1", phone: "91234567" }),
    );

    expect(result).toEqual({
      status: "found",
      phone: "+6591234567",
      cards: [
        {
          programId: "p1",
          name: "Kaya Toast Co.",
          label: "3/10 stamps",
          view: { kind: "dots", filled: 3, total: 10, variant: "dots" },
          rewardReady: false,
          reward_text: "Free kopi",
          qr: '<svg data-token="tok_abc"></svg>',
          expired: false,
          active: true,
          replacedByName: null,
          carriedOverCount: null,
        },
      ],
    });
  });

  it("returns multiple cards when the phone has more than one program at this vendor", async () => {
    mockJoin([
      {
        program_id: "p1",
        name: "Stamp Card",
        type: "stamp",
        config: {},
        state: {},
        stamp_count: 2,
        card_token: "tok_1",
        reward_text: "Free kopi",
        stamps_required: 8,
        expiry_days: null,
        cycle_started_at: null,
        active: true,
      },
      {
        program_id: "p2",
        name: "Grow-a-kopi",
        type: "plant",
        config: {
          stages: [
            { name: "Seed", threshold: 0 },
            { name: "Sprout", threshold: 1 },
            { name: "Leafing", threshold: 2 },
            { name: "Budding", threshold: 3 },
            { name: "Bloom", threshold: 4 },
          ],
          growth_per_visit: 1,
          grace_days: 5,
          decay_rate: 0.5,
          floor_growth: 1,
          reward_text: "Free set",
        },
        state: {
          growth: 1,
          last_visit_at: "2026-07-01T00:00:00Z",
          blooms: 0,
          bloomed: false,
        },
        stamp_count: 0,
        card_token: "tok_2",
        reward_text: "Free set",
        stamps_required: 4,
        expiry_days: null,
        cycle_started_at: null,
        active: true,
      },
    ]);

    const result = await checkStatusAction(
      STATUS_IDLE,
      form({ vendor: "v1", phone: "91234567" }),
    );

    expect(result.status).toBe("found");
    expect(result.cards).toHaveLength(2);
    expect(result.cards?.map((c) => c.programId)).toEqual(["p1", "p2"]);
  });

  it("marks a card inactive when its program is no longer active, without dropping it", async () => {
    mockJoin([
      {
        program_id: "p1",
        name: "Old Program",
        type: "stamp",
        config: {},
        state: {},
        stamp_count: 5,
        card_token: "tok_1",
        reward_text: "Free item",
        stamps_required: 10,
        expiry_days: null,
        cycle_started_at: null,
        active: false,
      },
    ]);

    const result = await checkStatusAction(
      STATUS_IDLE,
      form({ vendor: "v1", phone: "91234567" }),
    );

    expect(result.cards?.[0].active).toBe(false);
  });

  it("surfaces the replacement program's name on a retired card", async () => {
    mockJoin([
      {
        program_id: "p1",
        name: "Old Program",
        type: "stamp",
        config: {},
        state: {},
        stamp_count: 5,
        card_token: "tok_1",
        reward_text: "Free item",
        stamps_required: 10,
        expiry_days: null,
        cycle_started_at: null,
        active: false,
        replaced_by_name: "Weekly Regular",
      },
    ]);

    const result = await checkStatusAction(
      STATUS_IDLE,
      form({ vendor: "v1", phone: "91234567" }),
    );

    expect(result.cards?.[0].replacedByName).toBe("Weekly Regular");
  });

  it("surfaces how many stamps carried over onto the replacement card", async () => {
    mockJoin([
      {
        program_id: "p1",
        name: "Old Program",
        type: "stamp",
        config: {},
        state: {},
        stamp_count: 5,
        card_token: "tok_1",
        reward_text: "Free item",
        stamps_required: 10,
        expiry_days: null,
        cycle_started_at: null,
        active: false,
        replaced_by_name: "Weekly Regular",
        replaced_by_stamp_count: 6,
      },
    ]);

    const result = await checkStatusAction(
      STATUS_IDLE,
      form({ vendor: "v1", phone: "91234567" }),
    );

    expect(result.cards?.[0].carriedOverCount).toBe(6);
  });

  it("reports no carried-over count when the replacement card has zero stamps (or none exists)", async () => {
    mockJoin([
      {
        program_id: "p1",
        name: "Old Program",
        type: "stamp",
        config: {},
        state: {},
        stamp_count: 5,
        card_token: "tok_1",
        reward_text: "Free item",
        stamps_required: 10,
        expiry_days: null,
        cycle_started_at: null,
        active: false,
        replaced_by_name: "Weekly Regular",
        replaced_by_stamp_count: 0,
      },
    ]);

    const result = await checkStatusAction(
      STATUS_IDLE,
      form({ vendor: "v1", phone: "91234567" }),
    );

    expect(result.cards?.[0].carriedOverCount).toBeNull();
  });

  it("reports expired once a card's expiry window has elapsed", async () => {
    mockJoin([
      {
        program_id: "p1",
        name: "Kaya Toast Co.",
        type: "stamp",
        config: {},
        state: {},
        stamp_count: 3,
        card_token: "tok_abc",
        reward_text: "Free kopi",
        stamps_required: 10,
        expiry_days: 30,
        cycle_started_at: "2020-01-01T00:00:00Z",
        active: true,
      },
    ]);

    const result = await checkStatusAction(
      STATUS_IDLE,
      form({ vendor: "v1", phone: "91234567" }),
    );

    expect(result.cards?.[0].expired).toBe(true);
  });

  it("reports none when vendor_join returns no rows", async () => {
    mockJoin([]);

    const result = await checkStatusAction(
      STATUS_IDLE,
      form({ vendor: "bad-vendor", phone: "91234567" }),
    );

    expect(result).toEqual({
      status: "none",
      message: "We couldn't find any rewards here.",
    });
  });

  it("reports an error when vendor_join fails", async () => {
    rpcMock.mockImplementation(() =>
      Promise.resolve({ data: null, error: { message: "db down" } }),
    );

    const result = await checkStatusAction(
      STATUS_IDLE,
      form({ vendor: "v1", phone: "91234567" }),
    );

    expect(result).toEqual({
      status: "error",
      message: "Something went wrong.",
    });
  });
});

describe("regenerateCardAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    allowRequestMock.mockResolvedValue(true);
  });

  it("rejects an invalid phone without calling the RPC", async () => {
    const result = await regenerateCardAction(
      form({ phone: "not-a-phone", program: "p1" }),
    );

    expect(result).toEqual({
      success: false,
      error: "Enter a valid Singapore phone number.",
    });
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("rejects a missing program id without calling the RPC", async () => {
    const result = await regenerateCardAction(
      form({ phone: "91234567", program: "" }),
    );

    expect(result).toEqual({ success: false, error: "Missing program." });
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("returns a rate-limit error without calling the RPC when too many attempts have been made", async () => {
    allowRequestMock.mockResolvedValue(false);
    const result = await regenerateCardAction(
      form({ phone: "91234567", program: "p1" }),
    );

    expect(result).toEqual({
      success: false,
      error: "Too many attempts — try again in a minute.",
    });
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("reports an error when the RPC fails", async () => {
    rpcMock.mockImplementation(() =>
      Promise.resolve({ data: null, error: { message: "db down" } }),
    );

    const result = await regenerateCardAction(
      form({ phone: "91234567", program: "p1" }),
    );

    expect(result).toEqual({
      success: false,
      error: "Something went wrong.",
    });
  });

  it("reports an error when the RPC returns no card", async () => {
    mockRegenerate(null);

    const result = await regenerateCardAction(
      form({ phone: "91234567", program: "p1" }),
    );

    expect(result).toEqual({
      success: false,
      error: "Something went wrong.",
    });
  });

  it("calls regenerate_card with the normalized phone and returns it on success", async () => {
    mockRegenerate({ id: "card-1" });

    const result = await regenerateCardAction(
      form({ phone: "9123 4567", program: "p1" }),
    );

    expect(rpcMock).toHaveBeenCalledWith("regenerate_card", {
      p_program: "p1",
      p_phone: "+6591234567",
    });
    expect(result).toEqual({ success: true, phone: "+6591234567" });
  });
});
