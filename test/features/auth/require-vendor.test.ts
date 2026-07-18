import { describe, it, expect, vi, beforeEach } from "vitest";

const { redirectMock, getUserMock } = vi.hoisted(() => ({
  redirectMock: vi.fn(),
  getUserMock: vi.fn(),
}));
vi.mock("next/navigation", () => ({ redirect: redirectMock }));
vi.mock("@/lib/supabase/server", () => ({
  createServerClient: vi.fn(async () => ({
    auth: { getUser: getUserMock },
  })),
}));

import { requireVendor } from "@/features/auth/api/require-vendor";

describe("requireVendor", () => {
  beforeEach(() => {
    redirectMock.mockClear();
    getUserMock.mockClear();
  });

  it("returns the user without redirecting when a session exists", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "vendor-1" } } });
    const result = await requireVendor();
    expect(result).toEqual({ user: { id: "vendor-1" } });
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("redirects to /login and never resolves a user when unauthenticated", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });
    await requireVendor();
    expect(redirectMock).toHaveBeenCalledWith("/login");
  });
});
