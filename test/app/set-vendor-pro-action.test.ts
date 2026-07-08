import { describe, it, expect, vi, beforeEach } from "vitest";

const { requireAdminMock, upsertMock, deleteEqMock, insertMock } = vi.hoisted(
  () => ({
    requireAdminMock: vi.fn(),
    upsertMock: vi.fn(),
    deleteEqMock: vi.fn(),
    insertMock: vi.fn(),
  }),
);

vi.mock("@/lib/admin", () => ({ requireAdmin: requireAdminMock }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const fromMock = vi.fn((table: string) => {
  if (table === "vendor_pro") {
    return {
      upsert: upsertMock,
      delete: () => ({ eq: deleteEqMock }),
    };
  }
  return { insert: insertMock };
});
vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: vi.fn(async () => ({ from: fromMock })),
}));

import { setVendorPro } from "@/app/admin/actions";

function form(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

const vendorId = "11111111-1111-1111-1111-111111111111";

describe("setVendorPro", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAdminMock.mockResolvedValue({ user: { id: "admin-1" } });
    upsertMock.mockResolvedValue({ error: null });
    deleteEqMock.mockResolvedValue({ error: null });
    insertMock.mockResolvedValue({ error: null });
  });

  it("upserts vendor_pro when granting Pro", async () => {
    const res = await setVendorPro(form({ vendorId, pro: "true" }));
    expect(res.success).toBe(true);
    expect(upsertMock).toHaveBeenCalledWith(
      { vendor_id: vendorId },
      { onConflict: "vendor_id" },
    );
    expect(deleteEqMock).not.toHaveBeenCalled();
  });

  it("deletes vendor_pro when removing Pro", async () => {
    const res = await setVendorPro(form({ vendorId, pro: "false" }));
    expect(res.success).toBe(true);
    expect(deleteEqMock).toHaveBeenCalledWith("vendor_id", vendorId);
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it("writes an admin_audit row on success", async () => {
    await setVendorPro(form({ vendorId, pro: "true" }));
    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        admin_id: "admin-1",
        action: "set_vendor_pro",
        target_id: vendorId,
        detail: { pro: true },
      }),
    );
  });

  it("rejects a non-uuid vendorId without writing", async () => {
    const res = await setVendorPro(form({ vendorId: "nope", pro: "true" }));
    expect(res.success).toBe(false);
    expect(upsertMock).not.toHaveBeenCalled();
    expect(deleteEqMock).not.toHaveBeenCalled();
  });
});
