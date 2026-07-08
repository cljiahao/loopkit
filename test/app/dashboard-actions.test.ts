import { describe, it, expect, vi, beforeEach } from "vitest";

const { requireVendorMock, getProgramByIdMock, rpcMock, maybeSingleMock } =
  vi.hoisted(() => ({
    requireVendorMock: vi.fn(),
    getProgramByIdMock: vi.fn(),
    rpcMock: vi.fn(),
    maybeSingleMock: vi.fn(),
  }));

vi.mock("@/lib/auth", () => ({ requireVendor: requireVendorMock }));
vi.mock("@/lib/program", () => ({ getProgramById: getProgramByIdMock }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const fromMock = vi.fn(() => ({
  select: () => ({
    eq: () => ({ eq: () => ({ maybeSingle: maybeSingleMock }) }),
  }),
}));
vi.mock("@/lib/supabase/server", () => ({
  createServerClient: vi.fn(async () => ({ rpc: rpcMock, from: fromMock })),
}));

import { stampAction, lookupAction } from "@/app/dashboard/actions";

function form(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

const program = {
  id: "p1",
  name: "Coffee",
  stamps_required: 10,
  reward_text: "Free kopi",
  type: "stamp",
  config: {},
  active: true,
};

describe("dashboard actions thread program_id", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireVendorMock.mockResolvedValue({ user: { id: "v1" } });
    maybeSingleMock.mockResolvedValue({ data: null, error: null });
  });

  it("stampAction resolves the program from program_id and stamps it", async () => {
    getProgramByIdMock.mockResolvedValue(program);
    rpcMock.mockResolvedValue({
      data: { id: "c1", phone: "+6591234567", stamp_count: 3 },
      error: null,
    });

    const res = await stampAction(
      form({ program_id: "p1", phone: "91234567" }),
    );

    expect(getProgramByIdMock).toHaveBeenCalledWith("p1");
    expect(rpcMock).toHaveBeenCalledWith("add_stamp", {
      p_program: "p1",
      p_phone: "+6591234567",
    });
    expect(res.success).toBe(true);
  });

  it("stampAction blocks an expired card without calling add_stamp", async () => {
    getProgramByIdMock.mockResolvedValue({ ...program, expiry_days: 30 });
    maybeSingleMock.mockResolvedValue({
      data: { cycle_started_at: "2020-01-01T00:00:00Z" },
      error: null,
    });

    const res = await stampAction(
      form({ program_id: "p1", phone: "91234567" }),
    );

    expect(res.success).toBe(false);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("stampAction errors when the program_id is not owned (RLS null)", async () => {
    getProgramByIdMock.mockResolvedValue(null);

    const res = await stampAction(
      form({ program_id: "not-mine", phone: "91234567" }),
    );

    expect(res.success).toBe(false);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("stampAction errors when program_id is missing without a DB lookup", async () => {
    const res = await stampAction(form({ phone: "91234567" }));
    expect(res.success).toBe(false);
    expect(getProgramByIdMock).not.toHaveBeenCalled();
  });

  it("lookupAction scopes the card read to the resolved program and returns type-aware progress", async () => {
    getProgramByIdMock.mockResolvedValue(program);
    maybeSingleMock.mockResolvedValue({
      data: {
        id: "c1",
        phone: "+6591234567",
        stamp_count: 10,
        reward_count: 0,
        state: {},
      },
      error: null,
    });

    const res = await lookupAction(
      form({ program_id: "p1", phone: "91234567" }),
    );

    expect(getProgramByIdMock).toHaveBeenCalledWith("p1");
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.card.stamp_count).toBe(10);
      expect(res.progress.rewardReady).toBe(true);
      expect(res.progress.view).toEqual({
        kind: "dots",
        filled: 10,
        total: 10,
      });
    }
  });
});
