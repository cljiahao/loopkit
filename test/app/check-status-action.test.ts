import { describe, it, expect, vi, beforeEach } from "vitest";

// Mirrors qkit's sales/summary.test.ts mock style for the Supabase server
// client — here stubbing the `rpc` call the action makes.
const { rpcMock } = vi.hoisted(() => ({ rpcMock: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({
  createServerClient: vi.fn(async () => ({ rpc: rpcMock })),
}));

import { checkStatusAction } from "@/app/c/actions";
import { STATUS_IDLE } from "@/app/c/status-state";

function form(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
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

  it("normalizes the phone and calls card_status with it", async () => {
    rpcMock.mockResolvedValue({
      data: [
        {
          name: "Kaya Toast Co.",
          stamp_count: 3,
          stamps_required: 10,
          reward_text: "Free kopi",
        },
      ],
      error: null,
    });

    await checkStatusAction(
      STATUS_IDLE,
      form({ program: "p1", phone: "9123 4567" }),
    );

    expect(rpcMock).toHaveBeenCalledWith("card_status", {
      p_program: "p1",
      p_phone: "+6591234567",
    });
  });

  it("reports found with the row's stamp progress and reward", async () => {
    rpcMock.mockResolvedValue({
      data: [
        {
          name: "Kaya Toast Co.",
          stamp_count: 3,
          stamps_required: 10,
          reward_text: "Free kopi",
        },
      ],
      error: null,
    });

    const result = await checkStatusAction(
      STATUS_IDLE,
      form({ program: "p1", phone: "91234567" }),
    );

    expect(result).toEqual({
      status: "found",
      name: "Kaya Toast Co.",
      stamp_count: 3,
      stamps_required: 10,
      reward_text: "Free kopi",
    });
  });

  it("reports none when the RPC returns no rows (bad/inactive program)", async () => {
    rpcMock.mockResolvedValue({ data: [], error: null });

    const result = await checkStatusAction(
      STATUS_IDLE,
      form({ program: "bad-program", phone: "91234567" }),
    );

    expect(result).toEqual({
      status: "none",
      message: "We couldn't find that card.",
    });
  });

  it("reports an error when the RPC fails", async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: "db down" } });

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
