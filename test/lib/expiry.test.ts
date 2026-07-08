import { describe, it, expect } from "vitest";
import { isCardExpired } from "@/lib/expiry";

describe("isCardExpired", () => {
  const cycleStart = "2026-01-01T00:00:00Z";

  it("never expires when expiry_days is null", () => {
    expect(
      isCardExpired(cycleStart, null, new Date("2030-01-01T00:00:00Z")),
    ).toBe(false);
  });

  it("is not expired before the window elapses", () => {
    expect(
      isCardExpired(cycleStart, 90, new Date("2026-03-01T00:00:00Z")),
    ).toBe(false);
  });

  it("is expired once the window has elapsed", () => {
    expect(
      isCardExpired(cycleStart, 90, new Date("2026-04-15T00:00:00Z")),
    ).toBe(true);
  });

  it("is expired exactly at the boundary", () => {
    expect(
      isCardExpired(cycleStart, 90, new Date("2026-04-01T00:00:00Z")),
    ).toBe(true);
  });
});
