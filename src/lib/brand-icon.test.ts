import { describe, expect, it } from "vitest";
import { brandIcon, BRAND_RASPBERRY, BRAND_BLUSH } from "@/lib/brand-icon";

// brandIcon() returns a plain React element (no DOM/next/og rendering
// needed to test it) — inspect its props directly, same approach as
// testing any other pure function's return value. ReactElement.props is
// typed `unknown` generically, so assert the shape this component actually
// produces rather than reaching for `any`.
type BrandIconProps = {
  children: string;
  style: {
    width: number;
    height: number;
    background: string;
    color: string;
    fontSize: number;
    borderRadius: number;
  };
};

function props(size: number): BrandIconProps {
  return brandIcon(size).props as BrandIconProps;
}

describe("brandIcon", () => {
  it("renders the 'L' letter on a raspberry background with a blush foreground", () => {
    const p = props(32);
    expect(p.children).toBe("L");
    expect(p.style.background).toBe(BRAND_RASPBERRY);
    expect(p.style.color).toBe(BRAND_BLUSH);
  });

  it("scales fontSize and borderRadius proportionally to the requested size", () => {
    const small = props(32);
    const large = props(180);
    expect(small.style.width).toBe(32);
    expect(small.style.height).toBe(32);
    expect(small.style.fontSize).toBeCloseTo(32 * 0.62);
    expect(small.style.borderRadius).toBeCloseTo(32 * 0.22);
    expect(large.style.fontSize).toBeCloseTo(180 * 0.62);
    expect(large.style.borderRadius).toBeCloseTo(180 * 0.22);
  });
});
