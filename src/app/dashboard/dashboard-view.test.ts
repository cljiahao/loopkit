import { describe, expect, it } from "vitest";
import { shouldShowQr } from "./dashboard-view";

describe("shouldShowQr", () => {
  it("hides the shop QR block when there are zero active programs", () => {
    // Regression guard: the QR block invites customers to scan and join
    // "your programs" — it must not render alongside the "none of your
    // programs are active" empty state (dashboard/page.tsx).
    expect(shouldShowQr(0)).toBe(false);
  });

  it("shows the shop QR block when at least one program is active", () => {
    expect(shouldShowQr(1)).toBe(true);
    expect(shouldShowQr(3)).toBe(true);
  });
});
