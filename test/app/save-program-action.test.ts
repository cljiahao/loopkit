import { describe, it, expect, vi, beforeEach } from "vitest";

const { requireVendorMock, listProgramsMock, isProMock, insertResult } =
  vi.hoisted(() => ({
    requireVendorMock: vi.fn(),
    listProgramsMock: vi.fn(),
    isProMock: vi.fn(),
    insertResult: { data: { id: "new-id" }, error: null },
  }));

vi.mock("@/lib/auth", () => ({ requireVendor: requireVendorMock }));

vi.mock("@/lib/program", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/program")>();
  return { ...actual, listPrograms: listProgramsMock, isPro: isProMock };
});

const insertSingle = vi.fn(async () => insertResult);
const updateEq = vi.fn(async () => ({ error: null }));
const fromMock = vi.fn(() => ({
  insert: () => ({ select: () => ({ single: insertSingle }) }),
  update: () => ({ eq: updateEq }),
}));
vi.mock("@/lib/supabase/server", () => ({
  createServerClient: vi.fn(async () => ({ from: fromMock })),
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
};

describe("saveProgramAction (gated create + edit)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireVendorMock.mockResolvedValue({ user: { id: "v1" } });
  });

  it("blocks a free vendor already at the one-program limit", async () => {
    listProgramsMock.mockResolvedValue([{ id: "existing" }]);
    isProMock.mockResolvedValue(false);

    const res = await saveProgramAction({}, form(stampFields));

    expect(res.error).toMatch(/free plan/i);
    expect(insertSingle).not.toHaveBeenCalled();
  });

  it("lets a free vendor create their first program", async () => {
    listProgramsMock.mockResolvedValue([]);
    isProMock.mockResolvedValue(false);

    await expect(saveProgramAction({}, form(stampFields))).rejects.toThrow(
      "REDIRECT:/dashboard?p=new-id",
    );
    expect(insertSingle).toHaveBeenCalledTimes(1);
  });

  it("lets a Pro vendor create beyond the free limit", async () => {
    listProgramsMock.mockResolvedValue([{ id: "a" }, { id: "b" }]);
    isProMock.mockResolvedValue(true);

    await expect(saveProgramAction({}, form(stampFields))).rejects.toThrow(
      "REDIRECT:/dashboard?p=new-id",
    );
    expect(insertSingle).toHaveBeenCalledTimes(1);
  });

  it("edits an existing program without re-checking the gate", async () => {
    await expect(
      saveProgramAction({}, form({ ...stampFields, id: "p-edit" })),
    ).rejects.toThrow("REDIRECT:/dashboard?p=p-edit");
    expect(updateEq).toHaveBeenCalledWith("id", "p-edit");
    expect(insertSingle).not.toHaveBeenCalled();
    expect(listProgramsMock).not.toHaveBeenCalled();
  });

  it("rejects invalid input with an error state", async () => {
    const res = await saveProgramAction({}, form({ ...stampFields, name: "" }));
    expect(res.error).toBeTruthy();
    expect(insertSingle).not.toHaveBeenCalled();
  });
});
