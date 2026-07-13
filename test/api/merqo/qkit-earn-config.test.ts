import { describe, it, expect, beforeEach, vi } from "vitest";

const { fromMock } = vi.hoisted(() => ({ fromMock: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: vi.fn(async () => ({ from: fromMock })),
}));

import { GET } from "@/app/api/merqo/qkit-earn-config/route";

function result(row: unknown) {
  const r: Record<string, unknown> = {};
  const chain = () => r;
  Object.assign(r, {
    select: chain,
    eq: chain,
    maybeSingle: () => Promise.resolve({ data: row, error: null }),
  });
  return r;
}

describe("GET /api/merqo/qkit-earn-config", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.MERQO_METRICS_SECRET = "test-secret";
  });

  const req = (vendorId: string, auth?: string) =>
    new Request(
      `http://localhost/api/merqo/qkit-earn-config?vendor_id=${vendorId}`,
      {
        headers: auth ? { Authorization: auth } : {},
      },
    );

  it("401 when the bearer is missing", async () => {
    const res = await GET(req("v1"));
    expect(res.status).toBe(401);
  });

  it("400 when vendor_id is missing", async () => {
    const res = await GET(
      new Request("http://localhost/api/merqo/qkit-earn-config", {
        headers: { Authorization: "Bearer test-secret" },
      }),
    );
    expect(res.status).toBe(400);
  });

  it("returns enabled:false when no config row exists", async () => {
    fromMock.mockReturnValueOnce(result(null));
    const res = await GET(req("v1", "Bearer test-secret"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ enabled: false });
  });

  it("returns enabled:true with program_name when configured and enabled", async () => {
    fromMock.mockReturnValueOnce(
      result({ enabled: true, programs: { name: "Coffee Stamps" } }),
    );
    const res = await GET(req("v1", "Bearer test-secret"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      enabled: true,
      program_name: "Coffee Stamps",
    });
  });
});
