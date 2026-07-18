import { describe, it, expect, vi, beforeEach } from "vitest";

const { requireVendorMock, saveStallNameMock } = vi.hoisted(() => ({
  requireVendorMock: vi.fn(async () => ({ user: { id: "vendor-1" } })),
  saveStallNameMock: vi.fn(async () => ({})),
}));
vi.mock("@/features/auth", () => ({ requireVendor: requireVendorMock }));
vi.mock("@/lib/vendor", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/vendor")>();
  return { ...actual, saveStallName: saveStallNameMock };
});

const updateUserMock = vi.fn(async () => ({ error: null }));
vi.mock("@/lib/supabase/server", () => ({
  createServerClient: vi.fn(async () => ({
    auth: { updateUser: updateUserMock },
  })),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import {
  updateStallNameAction,
  updatePasswordAction,
} from "@/app/dashboard/profile/actions";

beforeEach(() => {
  // Clears call history only (not the default implementations set above via
  // vi.fn(impl)) — each test starts from a clean "not yet called" baseline.
  vi.clearAllMocks();
});

describe("updateStallNameAction", () => {
  it("delegates to saveStallName", async () => {
    const res = await updateStallNameAction("Kopi Corner");
    expect(saveStallNameMock).toHaveBeenCalledWith("Kopi Corner");
    expect(res.error).toBeUndefined();
  });
});

describe("updatePasswordAction", () => {
  it("calls supabase.auth.updateUser with the new password", async () => {
    const res = await updatePasswordAction("newpassword123");
    expect(updateUserMock).toHaveBeenCalledWith({ password: "newpassword123" });
    expect(res.error).toBeUndefined();
  });

  it("rejects a password under 8 characters without calling Supabase", async () => {
    const res = await updatePasswordAction("short");
    expect(res.error).toBeDefined();
    expect(updateUserMock).not.toHaveBeenCalled();
  });
});
