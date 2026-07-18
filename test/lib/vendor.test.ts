import { describe, it, expect, vi, beforeEach } from "vitest";

const { requireVendorMock } = vi.hoisted(() => ({
  requireVendorMock: vi.fn(async () => ({ user: { id: "vendor-1" } })),
}));
vi.mock("@/features/auth", () => ({ requireVendor: requireVendorMock }));

const upsertMock = vi.fn(
  async (): Promise<{ error: { message: string } | null }> => ({
    error: null,
  }),
);
const selectChain = {
  maybeSingle: vi.fn(
    async (): Promise<{
      data: { name: string } | null;
      error: { message: string } | null;
    }> => ({ data: null, error: null }),
  ),
};
const fromMock = vi.fn(() => ({
  upsert: upsertMock,
  select: () => selectChain,
}));
vi.mock("@/lib/supabase/server", () => ({
  createServerClient: vi.fn(async () => ({ from: fromMock })),
}));

import { stallNameSchema, saveStallName, getVendorProfile } from "@/lib/vendor";

describe("stallNameSchema", () => {
  it("accepts a valid stall name", () => {
    expect(stallNameSchema.safeParse({ name: "Kopi Corner" }).success).toBe(
      true,
    );
  });

  it("rejects an empty name", () => {
    expect(stallNameSchema.safeParse({ name: "" }).success).toBe(false);
  });

  it("rejects a whitespace-only name (trims to empty)", () => {
    expect(stallNameSchema.safeParse({ name: "   " }).success).toBe(false);
  });

  it("rejects a name over 60 characters", () => {
    expect(stallNameSchema.safeParse({ name: "a".repeat(61) }).success).toBe(
      false,
    );
  });

  it("accepts a name at exactly 60 characters", () => {
    expect(stallNameSchema.safeParse({ name: "a".repeat(60) }).success).toBe(
      true,
    );
  });
});

describe("saveStallName", () => {
  beforeEach(() => {
    upsertMock.mockClear();
  });

  it("upserts the vendor's name on vendor_id conflict", async () => {
    const res = await saveStallName("Kopi Corner");
    expect(res.error).toBeUndefined();
    expect(upsertMock).toHaveBeenCalledWith(
      expect.objectContaining({ vendor_id: "vendor-1", name: "Kopi Corner" }),
      { onConflict: "vendor_id" },
    );
  });

  it("returns an error without throwing when Supabase errors", async () => {
    upsertMock.mockResolvedValueOnce({ error: { message: "db down" } });
    const res = await saveStallName("Kopi Corner");
    expect(res.error).toMatch(/couldn't save/i);
  });

  it("rejects an invalid name without calling Supabase", async () => {
    const res = await saveStallName("");
    expect(res.error).toBeDefined();
    expect(upsertMock).not.toHaveBeenCalled();
  });
});

describe("getVendorProfile", () => {
  it("returns name:null when the vendor has no row yet", async () => {
    const res = await getVendorProfile();
    expect(res).toEqual({ name: null });
  });

  it("throws when Supabase errors", async () => {
    selectChain.maybeSingle.mockResolvedValueOnce({
      data: null,
      error: { message: "db down" },
    });
    await expect(getVendorProfile()).rejects.toThrow(
      "getVendorProfile: db down",
    );
  });
});
