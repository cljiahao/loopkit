import { describe, it, expect, vi, beforeEach } from "vitest";

const { getProgramByIdMock, rpcMock } = vi.hoisted(() => ({
  getProgramByIdMock: vi.fn(),
  rpcMock: vi.fn(),
}));

vi.mock("@/features/auth", () => ({
  requireVendor: vi.fn(async () => ({ user: { id: "v1" } })),
}));

vi.mock("@/lib/program", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/program")>();
  return {
    ...actual,
    getProgramById: getProgramByIdMock,
  };
});

const updateCalls: Array<{ table: string; values: unknown; eqId: string }> = [];
const fromMock = vi.fn((table: string) => ({
  update: (values: unknown) => ({
    eq: async (_col: string, id: string) => {
      updateCalls.push({ table, values, eqId: id });
      return { error: null as { message: string } | null };
    },
  }),
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

import { changeTypeAction } from "@/app/setup/actions";

function form(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

const stampFields = {
  replacing: "old-id",
  type: "stamp",
  name: "New coffee card",
  stamps_required: "10",
  reward_text: "Free kopi",
  head_start: "false",
};

describe("changeTypeAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    updateCalls.length = 0;
    getProgramByIdMock.mockResolvedValue({ id: "old-id", type: "wheel" });
    rpcMock.mockResolvedValue({ data: "new-id", error: null });
  });

  it("rejects an unknown or unowned replacing id without any writes", async () => {
    getProgramByIdMock.mockResolvedValue(null);

    const res = await changeTypeAction({}, form(stampFields));

    expect(res.error).toBeTruthy();
    expect(fromMock).not.toHaveBeenCalled();
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("deactivates the old program, then creates the new one, then links them, in order", async () => {
    await expect(changeTypeAction({}, form(stampFields))).rejects.toThrow(
      "REDIRECT:/dashboard?p=new-id",
    );

    expect(updateCalls[0]).toMatchObject({
      values: { active: false },
      eqId: "old-id",
    });
    expect(rpcMock).toHaveBeenCalledWith(
      "create_program",
      expect.objectContaining({ p_type: "stamp", p_name: "New coffee card" }),
    );
    expect(updateCalls[1]).toMatchObject({
      values: { replaced_by: "new-id" },
      eqId: "old-id",
    });
  });

  it("leaves the old program deactivated and returns an error if create_program fails, without linking", async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: "boom" } });

    const res = await changeTypeAction({}, form(stampFields));

    expect(res.error).toBeTruthy();
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0]).toMatchObject({ values: { active: false } });
  });

  it("still redirects successfully even if the final link update fails", async () => {
    fromMock.mockImplementation((table: string) => ({
      update: (values: unknown) => ({
        eq: async (_col: string, id: string) => {
          updateCalls.push({ table, values, eqId: id });
          if ("replaced_by" in (values as object)) {
            return { error: { message: "link failed" } };
          }
          return { error: null };
        },
      }),
    }));

    await expect(changeTypeAction({}, form(stampFields))).rejects.toThrow(
      "REDIRECT:/dashboard?p=new-id",
    );
  });

  it("rejects invalid config input without any writes", async () => {
    const res = await changeTypeAction({}, form({ ...stampFields, name: "" }));

    expect(res.error).toBeTruthy();
    expect(fromMock).not.toHaveBeenCalled();
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("passes carry_over_stamps through on a same-type (stamp -> stamp) migration when ticked", async () => {
    getProgramByIdMock.mockResolvedValue({ id: "old-id", type: "stamp" });

    await expect(
      changeTypeAction({}, form({ ...stampFields, carry_over_stamps: "true" })),
    ).rejects.toThrow("REDIRECT:/dashboard?p=new-id");

    expect(rpcMock).toHaveBeenCalledWith(
      "create_program",
      expect.objectContaining({ p_carry_over_stamps: true }),
    );
  });

  it("ignores carry_over_stamps when the predecessor's type differs from the new type", async () => {
    getProgramByIdMock.mockResolvedValue({ id: "old-id", type: "wheel" });

    await expect(
      changeTypeAction({}, form({ ...stampFields, carry_over_stamps: "true" })),
    ).rejects.toThrow("REDIRECT:/dashboard?p=new-id");

    expect(rpcMock).toHaveBeenCalledWith(
      "create_program",
      expect.objectContaining({ p_carry_over_stamps: false }),
    );
  });

  it("defaults carry_over_stamps to false when not submitted", async () => {
    getProgramByIdMock.mockResolvedValue({ id: "old-id", type: "stamp" });

    await expect(changeTypeAction({}, form(stampFields))).rejects.toThrow(
      "REDIRECT:/dashboard?p=new-id",
    );

    expect(rpcMock).toHaveBeenCalledWith(
      "create_program",
      expect.objectContaining({ p_carry_over_stamps: false }),
    );
  });

  it("passes reward_expiry_days through when the new type supports it", async () => {
    await expect(
      changeTypeAction({}, form({ ...stampFields, reward_expiry_days: "30" })),
    ).rejects.toThrow("REDIRECT:/dashboard?p=new-id");

    expect(rpcMock).toHaveBeenCalledWith(
      "create_program",
      expect.objectContaining({ p_reward_expiry_days: 30 }),
    );
  });

  it("sends p_reward_expiry_days=null when the new type doesn't support it", async () => {
    await expect(
      changeTypeAction(
        {},
        form({
          replacing: "old-id",
          type: "lucky",
          name: "Lucky spin",
          reward_text: "Free kopi",
          win_percent: "10",
          pity_ceiling: "5",
        }),
      ),
    ).rejects.toThrow("REDIRECT:/dashboard?p=new-id");

    expect(rpcMock).toHaveBeenCalledWith(
      "create_program",
      expect.objectContaining({ p_reward_expiry_days: null }),
    );
  });
});
