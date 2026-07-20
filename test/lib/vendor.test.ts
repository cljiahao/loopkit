import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  requireVendorMock,
  getOrCreateVendorProfileMock,
  upsertVendorProfileMock,
} = vi.hoisted(() => ({
  requireVendorMock: vi.fn(async () => ({ user: { id: "vendor-1" } })),
  getOrCreateVendorProfileMock: vi.fn(),
  upsertVendorProfileMock: vi.fn(),
}));
vi.mock("@/features/auth", () => ({ requireVendor: requireVendorMock }));
vi.mock("@/lib/merqo-vendor-profile", () => ({
  getOrCreateVendorProfile: getOrCreateVendorProfileMock,
  upsertVendorProfile: upsertVendorProfileMock,
}));

const selectChain = {
  maybeSingle: vi.fn(
    async (): Promise<{
      data: { name: string } | null;
      error: { message: string } | null;
    }> => ({ data: null, error: null }),
  ),
};
const fromMock = vi.fn(() => ({
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
    getOrCreateVendorProfileMock.mockReset();
    upsertVendorProfileMock.mockReset();
    getOrCreateVendorProfileMock.mockResolvedValue({
      vendor_id: "vendor-1",
      stall_name: "Old Name",
      social_links: { website: "https://old.example" },
      created_at: "",
      updated_at: "",
    });
    upsertVendorProfileMock.mockResolvedValue({
      vendor_id: "vendor-1",
      stall_name: "Kopi Corner",
      social_links: { website: "https://old.example" },
      created_at: "",
      updated_at: "",
    });
  });

  it("saves the name to merqo.vendor_profile, preserving existing social links", async () => {
    const res = await saveStallName("Kopi Corner");
    expect(res.error).toBeUndefined();
    expect(upsertVendorProfileMock).toHaveBeenCalledWith(
      expect.anything(),
      "vendor-1",
      "Kopi Corner",
      { website: "https://old.example" },
    );
  });

  it("returns an error without throwing when the merqo write fails", async () => {
    upsertVendorProfileMock.mockRejectedValueOnce(new Error("db down"));
    const res = await saveStallName("Kopi Corner");
    expect(res.error).toMatch(/couldn't save/i);
  });

  it("rejects an invalid name without calling merqo", async () => {
    const res = await saveStallName("");
    expect(res.error).toBeDefined();
    expect(getOrCreateVendorProfileMock).not.toHaveBeenCalled();
    expect(upsertVendorProfileMock).not.toHaveBeenCalled();
  });
});

describe("getVendorProfile", () => {
  beforeEach(() => {
    getOrCreateVendorProfileMock.mockReset();
    selectChain.maybeSingle.mockReset();
    selectChain.maybeSingle.mockResolvedValue({ data: null, error: null });
  });

  it("returns the merqo stall_name, not the local vendors.name row", async () => {
    getOrCreateVendorProfileMock.mockResolvedValue({
      vendor_id: "vendor-1",
      stall_name: "Merqo Name",
      social_links: {},
      created_at: "",
      updated_at: "",
    });
    const res = await getVendorProfile();
    expect(res).toEqual({ name: "Merqo Name" });
    expect(getOrCreateVendorProfileMock).toHaveBeenCalledWith(
      expect.anything(),
      "vendor-1",
      null,
    );
  });

  it("passes the local vendors.name as the seed when a local row exists", async () => {
    selectChain.maybeSingle.mockResolvedValueOnce({
      data: { name: "Local Name" },
      error: null,
    });
    getOrCreateVendorProfileMock.mockResolvedValue({
      vendor_id: "vendor-1",
      stall_name: "Local Name",
      social_links: {},
      created_at: "",
      updated_at: "",
    });
    await getVendorProfile();
    expect(getOrCreateVendorProfileMock).toHaveBeenCalledWith(
      expect.anything(),
      "vendor-1",
      "Local Name",
    );
  });

  it("falls back to the local name when the merqo read fails", async () => {
    selectChain.maybeSingle.mockResolvedValueOnce({
      data: { name: "Local Name" },
      error: null,
    });
    getOrCreateVendorProfileMock.mockRejectedValueOnce(new Error("db down"));
    const res = await getVendorProfile();
    expect(res).toEqual({ name: "Local Name" });
  });

  it("throws when the local Supabase read errors", async () => {
    selectChain.maybeSingle.mockResolvedValueOnce({
      data: null,
      error: { message: "db down" },
    });
    await expect(getVendorProfile()).rejects.toThrow(
      "getVendorProfile: db down",
    );
  });

  it("passes the fallbackName as the seed when no local row exists", async () => {
    selectChain.maybeSingle.mockResolvedValueOnce({
      data: null,
      error: null,
    });
    getOrCreateVendorProfileMock.mockResolvedValue({
      vendor_id: "vendor-1",
      stall_name: "vendor@example.com",
      social_links: {},
      created_at: "",
      updated_at: "",
    });
    await getVendorProfile("vendor@example.com");
    expect(getOrCreateVendorProfileMock).toHaveBeenCalledWith(
      expect.anything(),
      "vendor-1",
      "vendor@example.com",
    );
  });

  it("ignores fallbackName when a local row already has a name", async () => {
    selectChain.maybeSingle.mockResolvedValueOnce({
      data: { name: "Local Name" },
      error: null,
    });
    getOrCreateVendorProfileMock.mockResolvedValue({
      vendor_id: "vendor-1",
      stall_name: "Local Name",
      social_links: {},
      created_at: "",
      updated_at: "",
    });
    await getVendorProfile("vendor@example.com");
    expect(getOrCreateVendorProfileMock).toHaveBeenCalledWith(
      expect.anything(),
      "vendor-1",
      "Local Name",
    );
  });
});
