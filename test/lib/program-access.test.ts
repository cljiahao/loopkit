import { describe, it, expect } from "vitest";
import { currentProgram, canCreateProgram } from "@/lib/program";
import type { Program } from "@/lib/program";

const program = (id: string): Program => ({
  id,
  name: `Program ${id}`,
  stamps_required: 10,
  reward_text: "Free kopi",
  type: "stamp",
  config: {},
  active: true,
  head_start: false,
  replaced_by: null,
});

describe("currentProgram", () => {
  it("returns null when the vendor has no programs", () => {
    expect(currentProgram([])).toBeNull();
    expect(currentProgram([], "anything")).toBeNull();
  });

  it("returns the first program when no id is requested", () => {
    const list = [program("a"), program("b")];
    expect(currentProgram(list)?.id).toBe("a");
  });

  it("returns the requested program when the vendor owns it", () => {
    const list = [program("a"), program("b")];
    expect(currentProgram(list, "b")?.id).toBe("b");
  });

  it("falls back to the first program when the requested id is not owned", () => {
    const list = [program("a"), program("b")];
    expect(currentProgram(list, "zzz")?.id).toBe("a");
  });

  it("ignores an empty requested id and returns the first", () => {
    const list = [program("a"), program("b")];
    expect(currentProgram(list, "")?.id).toBe("a");
  });
});

describe("canCreateProgram", () => {
  it("lets a free vendor create their first program", () => {
    expect(canCreateProgram(0, false)).toBe(true);
  });

  it("blocks a free vendor at the one-program limit", () => {
    expect(canCreateProgram(1, false)).toBe(false);
    expect(canCreateProgram(2, false)).toBe(false);
  });

  it("lets a Pro vendor create regardless of count", () => {
    expect(canCreateProgram(0, true)).toBe(true);
    expect(canCreateProgram(1, true)).toBe(true);
    expect(canCreateProgram(50, true)).toBe(true);
  });
});
