import { describe, it, expect, vi, beforeEach } from "vitest";

const { requireVendorMock, rpcMock } = vi.hoisted(() => ({
  requireVendorMock: vi.fn(),
  rpcMock: vi.fn(),
}));
vi.mock("@/features/auth", () => ({ requireVendor: requireVendorMock }));
vi.mock("@/lib/supabase/server", () => ({
  createServerClient: vi.fn(async () => ({ rpc: rpcMock })),
}));

import { resolveTokenAction } from "@/app/dashboard/actions";

const fd = (token: string) => {
  const f = new FormData();
  f.set("token", token);
  return f;
};

describe("resolveTokenAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireVendorMock.mockResolvedValue({ user: { id: "v" } });
  });
  it("returns the phone and programId for a token the vendor owns", async () => {
    rpcMock.mockResolvedValue({
      data: [{ program_id: "p", card_id: "c", phone: "+6591234567" }],
      error: null,
    });
    const res = await resolveTokenAction(fd("tok"));
    expect(res).toEqual({
      success: true,
      phone: "+6591234567",
      programId: "p",
    });
  });
  it("errors when the token is empty", async () => {
    const res = await resolveTokenAction(fd(""));
    expect(res.success).toBe(false);
    expect(rpcMock).not.toHaveBeenCalled();
  });
  it("errors when no card matches (not this shop's)", async () => {
    rpcMock.mockResolvedValue({ data: [], error: null });
    const res = await resolveTokenAction(fd("tok"));
    expect(res.success).toBe(false);
  });
});
