import { describe, it, expect, vi, beforeEach } from "vitest";

// Mirrors qkit's sales/summary.test.ts mock style for the Supabase server
// client — here stubbing the `rpc` calls the action makes.
const { rpcMock } = vi.hoisted(() => ({ rpcMock: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({
  createServerClient: vi.fn(async () => ({ rpc: rpcMock })),
}));

vi.mock("@/lib/qr", () => ({
  qrSvg: vi.fn(async (text: string) => `<svg data-token="${text}"></svg>`),
}));

import { checkStatusAction } from "@/app/c/actions";
import { STATUS_IDLE } from "@/app/c/status-state";

function form(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

function mockRpcs(view: unknown[]) {
  rpcMock.mockImplementation((fn: string) => {
    if (fn === "enroll_card") {
      return Promise.resolve({ data: "tok_abc", error: null });
    }
    return Promise.resolve({ data: view, error: null });
  });
}

describe("checkStatusAction", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects an invalid phone without calling the RPC", async () => {
    const result = await checkStatusAction(
      STATUS_IDLE,
      form({ program: "p1", phone: "not-a-phone" }),
    );

    expect(result).toEqual({
      status: "error",
      message: "Enter a valid Singapore phone number.",
    });
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("rejects a missing program without calling the RPC", async () => {
    const result = await checkStatusAction(
      STATUS_IDLE,
      form({ program: "", phone: "91234567" }),
    );

    expect(result).toEqual({ status: "error", message: "Missing program." });
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("normalizes the phone and enrolls + reads with it", async () => {
    mockRpcs([
      {
        name: "Kaya Toast Co.",
        type: "stamp",
        config: {},
        state: { stamp_count: 3, reward_count: 0 },
        card_token: "tok_abc",
        reward_text: "Free kopi",
        stamps_required: 10,
      },
    ]);

    await checkStatusAction(
      STATUS_IDLE,
      form({ program: "p1", phone: "9123 4567" }),
    );

    expect(rpcMock).toHaveBeenCalledWith("enroll_card", {
      p_program: "p1",
      p_phone: "+6591234567",
    });
    expect(rpcMock).toHaveBeenCalledWith("card_view", {
      p_program: "p1",
      p_phone: "+6591234567",
    });
  });

  it("reports found with engine progress, reward, and QR", async () => {
    mockRpcs([
      {
        name: "Kaya Toast Co.",
        type: "stamp",
        config: {},
        state: { stamp_count: 3, reward_count: 0 },
        card_token: "tok_abc",
        reward_text: "Free kopi",
        stamps_required: 10,
      },
    ]);

    const result = await checkStatusAction(
      STATUS_IDLE,
      form({ program: "p1", phone: "91234567" }),
    );

    expect(result).toEqual({
      status: "found",
      name: "Kaya Toast Co.",
      label: "3/10 stamps",
      view: { kind: "dots", filled: 3, total: 10 },
      rewardReady: false,
      reward_text: "Free kopi",
      qr: '<svg data-token="tok_abc"></svg>',
    });
  });

  it("reports none when card_view returns no rows (bad/inactive program)", async () => {
    mockRpcs([]);

    const result = await checkStatusAction(
      STATUS_IDLE,
      form({ program: "bad-program", phone: "91234567" }),
    );

    expect(result).toEqual({
      status: "none",
      message: "We couldn't find that card.",
    });
  });

  it("reports an error when enroll_card fails", async () => {
    rpcMock.mockImplementation((fn: string) => {
      if (fn === "enroll_card") {
        return Promise.resolve({ data: null, error: { message: "db down" } });
      }
      return Promise.resolve({ data: [], error: null });
    });

    const result = await checkStatusAction(
      STATUS_IDLE,
      form({ program: "p1", phone: "91234567" }),
    );

    expect(result).toEqual({
      status: "error",
      message: "Something went wrong.",
    });
  });

  it("reports an error when card_view fails", async () => {
    rpcMock.mockImplementation((fn: string) => {
      if (fn === "enroll_card") {
        return Promise.resolve({ data: "tok_abc", error: null });
      }
      return Promise.resolve({ data: null, error: { message: "db down" } });
    });

    const result = await checkStatusAction(
      STATUS_IDLE,
      form({ program: "p1", phone: "91234567" }),
    );

    expect(result).toEqual({
      status: "error",
      message: "Something went wrong.",
    });
  });
});
