import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  requireVendorMock,
  listProgramsMock,
  isProMock,
  getProgramByIdMock,
  rpcMock,
} = vi.hoisted(() => ({
  requireVendorMock: vi.fn(),
  listProgramsMock: vi.fn(),
  isProMock: vi.fn(),
  getProgramByIdMock: vi.fn(),
  rpcMock: vi.fn(),
}));

vi.mock("@/features/auth", () => ({ requireVendor: requireVendorMock }));

vi.mock("@/lib/program", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/program")>();
  return {
    ...actual,
    listPrograms: listProgramsMock,
    isPro: isProMock,
    getProgramById: getProgramByIdMock,
  };
});

const updateEq = vi.fn(async () => ({ error: null }));
const fromMock = vi.fn(() => ({
  update: () => ({ eq: updateEq }),
}));
vi.mock("@/lib/supabase/server", () => ({
  createServerClient: vi.fn(async () => ({ from: fromMock, rpc: rpcMock })),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));

import { saveProgramAction } from "@/app/setup/actions";

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

describe("saveProgramAction (gated create + edit)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireVendorMock.mockResolvedValue({ user: { id: "v1" } });
    rpcMock.mockResolvedValue({ data: "new-id", error: null });
  });

  it("blocks a free vendor already at the one-program limit", async () => {
    listProgramsMock.mockResolvedValue([{ id: "existing", active: true }]);
    isProMock.mockResolvedValue(false);

    const res = await saveProgramAction({}, form(stampFields));

    expect(res.error).toMatch(/free plan/i);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("lets a free vendor create when their only program is inactive (mid-migration)", async () => {
    listProgramsMock.mockResolvedValue([{ id: "retired", active: false }]);
    isProMock.mockResolvedValue(false);

    await expect(saveProgramAction({}, form(stampFields))).rejects.toThrow(
      "REDIRECT:/dashboard?p=new-id",
    );
    expect(rpcMock).toHaveBeenCalledWith(
      "create_program",
      expect.objectContaining({ p_type: "stamp" }),
    );
  });

  it("lets a free vendor create their first program via create_program", async () => {
    listProgramsMock.mockResolvedValue([]);
    isProMock.mockResolvedValue(false);

    await expect(saveProgramAction({}, form(stampFields))).rejects.toThrow(
      "REDIRECT:/dashboard?p=new-id",
    );
    expect(rpcMock).toHaveBeenCalledWith(
      "create_program",
      expect.objectContaining({ p_type: "stamp", p_name: "Coffee card" }),
    );
  });

  it("lets a Pro vendor create beyond the free limit", async () => {
    listProgramsMock.mockResolvedValue([{ id: "a" }, { id: "b" }]);
    isProMock.mockResolvedValue(true);

    await expect(saveProgramAction({}, form(stampFields))).rejects.toThrow(
      "REDIRECT:/dashboard?p=new-id",
    );
    expect(rpcMock).toHaveBeenCalledTimes(1);
  });

  it("maps the DB insufficient_privilege backstop to the upsell message", async () => {
    listProgramsMock.mockResolvedValue([]);
    isProMock.mockResolvedValue(true);
    rpcMock.mockResolvedValue({ data: null, error: { code: "42501" } });

    const res = await saveProgramAction({}, form(stampFields));
    expect(res.error).toMatch(/free plan/i);
  });

  it("edits an existing program without re-checking the gate", async () => {
    getProgramByIdMock.mockResolvedValue({ id: "p-edit", type: "stamp" });

    await expect(
      saveProgramAction({}, form({ ...stampFields, id: "p-edit" })),
    ).rejects.toThrow("REDIRECT:/dashboard?p=p-edit");
    expect(updateEq).toHaveBeenCalledWith("id", "p-edit");
    expect(rpcMock).not.toHaveBeenCalled();
    expect(listProgramsMock).not.toHaveBeenCalled();
  });

  it("keeps the existing type on edit, ignoring a submitted type change", async () => {
    getProgramByIdMock.mockResolvedValue({ id: "p-edit", type: "plant" });

    // Submitting stamp fields for a plant program must not corrupt it: the
    // locked plant type is used, so the stamp-only payload fails validation.
    const res = await saveProgramAction(
      {},
      form({ ...stampFields, id: "p-edit" }),
    );
    expect(res.error).toBeTruthy();
    expect(updateEq).not.toHaveBeenCalled();
  });

  it("rejects invalid input with an error state", async () => {
    const res = await saveProgramAction({}, form({ ...stampFields, name: "" }));
    expect(res.error).toBeTruthy();
    expect(rpcMock).not.toHaveBeenCalled();
  });
});
