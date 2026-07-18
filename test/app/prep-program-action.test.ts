import { describe, it, expect, vi, beforeEach } from "vitest";

const { requireVendorMock, listProgramsMock, isProMock, rpcMock } = vi.hoisted(
  () => ({
    requireVendorMock: vi.fn(),
    listProgramsMock: vi.fn(),
    isProMock: vi.fn(),
    rpcMock: vi.fn(),
  }),
);

vi.mock("@/features/auth", () => ({ requireVendor: requireVendorMock }));

vi.mock("@/lib/program", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/program")>();
  return {
    ...actual,
    listPrograms: listProgramsMock,
    isPro: isProMock,
  };
});

vi.mock("@/lib/supabase/server", () => ({
  createServerClient: vi.fn(async () => ({ rpc: rpcMock })),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));

import { prepProgramAction } from "@/app/setup/actions";

function form(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

const stampFields = {
  type: "stamp",
  name: "Coffee card",
  stamps_required: "10",
  reward_text: "Free kopi",
  head_start: "false",
};

describe("prepProgramAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireVendorMock.mockResolvedValue({ user: { id: "v1" } });
    listProgramsMock.mockResolvedValue([]);
    isProMock.mockResolvedValue(false);
    rpcMock.mockResolvedValue({ data: "prep-id", error: null });
  });

  it("creates an inactive replacement program and redirects to edit it", async () => {
    await expect(
      prepProgramAction({}, form({ ...stampFields, reward_expiry_days: "30" })),
    ).rejects.toThrow("REDIRECT:/setup?edit=prep-id");

    expect(rpcMock).toHaveBeenCalledWith(
      "create_program",
      expect.objectContaining({
        p_type: "stamp",
        p_active: false,
        p_reward_expiry_days: 30,
      }),
    );
  });

  it("sends p_reward_expiry_days=null for a type that doesn't support it", async () => {
    await expect(
      prepProgramAction(
        {},
        form({
          type: "lucky",
          name: "Lucky spin",
          reward_text: "Free kopi",
          win_percent: "10",
          pity_ceiling: "5",
        }),
      ),
    ).rejects.toThrow("REDIRECT:/setup?edit=prep-id");

    expect(rpcMock).toHaveBeenCalledWith(
      "create_program",
      expect.objectContaining({ p_reward_expiry_days: null }),
    );
  });

  it("blocks a free vendor already at the live-in-play prep cap", async () => {
    listProgramsMock.mockResolvedValue([
      { replaced_by: null },
      { replaced_by: null },
    ]);

    const res = await prepProgramAction({}, form(stampFields));

    expect(res.error).toMatch(/already have a card/i);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("maps the DB insufficient_privilege backstop to the upsell message", async () => {
    rpcMock.mockResolvedValue({ data: null, error: { code: "42501" } });

    const res = await prepProgramAction({}, form(stampFields));

    expect(res.error).toMatch(/already have a card/i);
  });

  it("returns a generic error when create_program fails for another reason", async () => {
    rpcMock.mockResolvedValue({ data: null, error: { code: "23505" } });

    const res = await prepProgramAction({}, form(stampFields));

    expect(res.error).toMatch(/couldn't create your card/i);
  });

  it("rejects invalid input with an error state", async () => {
    const res = await prepProgramAction({}, form({ ...stampFields, name: "" }));

    expect(res.error).toBeTruthy();
    expect(rpcMock).not.toHaveBeenCalled();
  });
});
