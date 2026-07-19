import { describe, it, expect } from "vitest";
import { resolveSetupView } from "./setup-view";

const base = {
  migrating: false,
  isEdit: false,
  prepping: false,
  scheduling: false,
  managing: false,
  canCreate: false,
};

describe("resolveSetupView", () => {
  it("returns 'migrate' when migrating, regardless of everything else", () => {
    expect(
      resolveSetupView({ ...base, migrating: true, canCreate: true }),
    ).toBe("migrate");
  });

  it("returns 'edit' when isEdit, regardless of canCreate", () => {
    expect(resolveSetupView({ ...base, isEdit: true, canCreate: true })).toBe(
      "edit",
    );
  });

  it("returns 'prep' when prepping, regardless of canCreate", () => {
    expect(resolveSetupView({ ...base, prepping: true, canCreate: true })).toBe(
      "prep",
    );
  });

  it("returns 'schedule' when scheduling, regardless of canCreate — regression guard for the Pro-vendor bug where canCreate (always true for Pro) made schedule unreachable", () => {
    expect(
      resolveSetupView({ ...base, scheduling: true, canCreate: true }),
    ).toBe("schedule");
  });

  it("returns 'manage' when managing and nothing else is set", () => {
    expect(resolveSetupView({ ...base, managing: true })).toBe("manage");
  });

  it("returns 'create' when nothing is set and canCreate is true", () => {
    expect(resolveSetupView({ ...base, canCreate: true })).toBe("create");
  });

  it("returns 'upsell' when nothing is set and canCreate is false", () => {
    expect(resolveSetupView({ ...base })).toBe("upsell");
  });

  it("prioritizes migrate over edit when both are somehow set", () => {
    expect(resolveSetupView({ ...base, migrating: true, isEdit: true })).toBe(
      "migrate",
    );
  });

  it("prioritizes prep over schedule when both are somehow set", () => {
    expect(
      resolveSetupView({ ...base, prepping: true, scheduling: true }),
    ).toBe("prep");
  });
});
