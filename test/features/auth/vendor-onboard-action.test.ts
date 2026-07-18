import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/features/auth/api/require-vendor", () => ({
  requireVendor: vi.fn(async () => ({ user: { id: "v1" } })),
}));

const upsertCalls: Array<{ values: unknown; onConflict: string }> = [];
const fromMock = vi.fn(() => ({
  upsert: (values: unknown, opts: { onConflict: string }) => {
    upsertCalls.push({ values, onConflict: opts.onConflict });
    return Promise.resolve({ error: null as { message: string } | null });
  },
}));
vi.mock("@/lib/supabase/server", () => ({
  createServerClient: vi.fn(async () => ({ from: fromMock })),
}));

import { vendorPhoneOnboardAction } from "@/features/auth/api/actions";

describe("vendorPhoneOnboardAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    upsertCalls.length = 0;
  });

  it("rejects an empty name without writing", async () => {
    const res = await vendorPhoneOnboardAction("  ", "91234567");
    expect(res.error).toBeTruthy();
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("rejects an invalid phone without writing", async () => {
    const res = await vendorPhoneOnboardAction("Kopi Corner", "12345");
    expect(res.error).toBeTruthy();
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("upserts a normalized phone and trimmed name on the happy path", async () => {
    const res = await vendorPhoneOnboardAction(" Kopi Corner ", "91234567");
    expect(res.error).toBeUndefined();
    expect(upsertCalls[0]).toMatchObject({
      values: { vendor_id: "v1", name: "Kopi Corner", phone: "+6591234567" },
      onConflict: "vendor_id",
    });
  });

  it("allows a duplicate name/phone already used by another vendor", async () => {
    // No uniqueness check exists client-side or in this action — the DB has
    // none either (spec requirement). Asserting only that no pre-check runs.
    const res = await vendorPhoneOnboardAction("Kopi Corner", "91234567");
    expect(res.error).toBeUndefined();
  });

  it("surfaces a Supabase error without throwing", async () => {
    fromMock.mockReturnValueOnce({
      upsert: () => Promise.resolve({ error: { message: "db down" } as const }),
    });
    const res = await vendorPhoneOnboardAction("Kopi Corner", "91234567");
    expect(res.error).toBeTruthy();
  });
});
