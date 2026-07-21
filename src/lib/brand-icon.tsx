import type { ReactElement } from "react";

// "Mulberry & Gold" marks, approximated from the OKLCH theme tokens as
// concrete hex — ImageResponse needs literal CSS colors, it can't consume
// the app's OKLCH custom properties.
export const BRAND_MULBERRY = "#6b2c4a";
export const BRAND_BLUSH = "#fdf3f6";

/**
 * The loopkit "L" app mark for ImageResponse-generated icons. Same
 * construction formula as every other kit's brand-icon (see
 * docs/business/2026-07-21-brand-icon-family-standard.md): fontSize
 * size*0.62, borderRadius size*0.22, fontWeight 700 — only color/letter
 * differ per product. loopkit's display font (Bricolage Grotesque, see
 * `--font-display` in globals.css) is a sans-serif, not a serif, so unlike
 * qkit's Georgia stand-in this uses the system sans-serif stack.
 */
export function brandIcon(size: number): ReactElement {
  return (
    <div
      style={{
        width: size,
        height: size,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: BRAND_MULBERRY,
        color: BRAND_BLUSH,
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
        fontWeight: 700,
        fontSize: size * 0.62,
        lineHeight: 1,
        borderRadius: size * 0.22,
      }}
    >
      L
    </div>
  );
}
