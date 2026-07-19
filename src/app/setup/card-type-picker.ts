// Pure family/style data and mapping for /setup's type picker. Groups the
// backend's existing 5 program types (2 of which already fan out into
// variants) into 4 vendor-facing families with a style sub-step, so the
// picker stops reading as "8 unrelated card types." No new type/variant
// value is introduced — "chance" is a UI-only grouping label over the
// existing wheel/scratch DB type values. Extracted from setup-form.tsx so
// this mapping gets fast, unmocked test coverage, same pattern as
// setup-view.ts / dashboard-view.ts.

export type FamilyKey = "stamp" | "plant" | "chance" | "lucky";

export type StyleKey =
  "dots" | "flame" | "points" | "plant" | "cup" | "wheel" | "scratch" | "lucky";

export type StyleOption = {
  key: StyleKey;
  label: string;
  description: string;
};

export type Family = {
  key: FamilyKey;
  label: string;
  description: string;
  styles: StyleOption[];
};

export const FAMILIES: Family[] = [
  {
    key: "stamp",
    label: "Stamp Card",
    description: "Collect stamps toward a reward",
    styles: [
      {
        key: "dots",
        label: "Classic",
        description: "Collect stamps toward a reward",
      },
      {
        key: "flame",
        label: "Flame Club",
        description: "Build a flame with every visit",
      },
      {
        key: "points",
        label: "Points Club",
        description: "Earn a set number of points every visit",
      },
    ],
  },
  {
    key: "plant",
    label: "Sprout",
    description: "Grow a plant with every visit",
    styles: [
      {
        key: "plant",
        label: "Classic",
        description: "Grow a plant with every visit",
      },
      {
        key: "cup",
        label: "Fill the Cup",
        description: "Fill a cup with every visit",
      },
    ],
  },
  {
    key: "chance",
    label: "Chance Card",
    description: "A random prize on every visit",
    styles: [
      {
        key: "wheel",
        label: "Spin the Wheel",
        description: "Spin for a prize on every visit",
      },
      {
        key: "scratch",
        label: "Scratch Card",
        description: "Scratch for a prize on every visit",
      },
    ],
  },
  {
    key: "lucky",
    label: "Lucky Tap",
    description: "A chance to win on every visit",
    styles: [
      {
        key: "lucky",
        label: "Lucky Tap",
        description: "A chance to win on every visit",
      },
    ],
  },
];

export function familyOf(key: FamilyKey): Family {
  const family = FAMILIES.find((f) => f.key === key);
  if (!family) throw new Error(`Unknown family: ${key}`);
  return family;
}

export function isSingleStyleFamily(key: FamilyKey): boolean {
  return familyOf(key).styles.length === 1;
}

// Which family + style a saved type/variant pair belongs to — drives the
// picker's active-tile highlight in both steps.
export function resolveFamilyAndStyle(
  type: string,
  variant: string | undefined,
): { family: FamilyKey; style: StyleKey } {
  if (type === "stamp") {
    if (variant === "flame") return { family: "stamp", style: "flame" };
    if (variant === "points") return { family: "stamp", style: "points" };
    return { family: "stamp", style: "dots" };
  }
  if (type === "plant") {
    if (variant === "cup") return { family: "plant", style: "cup" };
    return { family: "plant", style: "plant" };
  }
  if (type === "wheel") return { family: "chance", style: "wheel" };
  if (type === "scratch") return { family: "chance", style: "scratch" };
  return { family: "lucky", style: "lucky" };
}

const STYLE_TO_TYPE_VARIANT: Record<
  StyleKey,
  {
    type: "stamp" | "plant" | "wheel" | "scratch" | "lucky";
    variant?: "dots" | "flame" | "points" | "plant" | "cup";
  }
> = {
  dots: { type: "stamp", variant: "dots" },
  flame: { type: "stamp", variant: "flame" },
  points: { type: "stamp", variant: "points" },
  plant: { type: "plant", variant: "plant" },
  cup: { type: "plant", variant: "cup" },
  wheel: { type: "wheel" },
  scratch: { type: "scratch" },
  lucky: { type: "lucky" },
};

// The inverse of resolveFamilyAndStyle — picking a style resolves to the
// type/variant pair saved to the database. wheel/scratch/lucky never had a
// variant column value, so their entries omit it.
export function styleToTypeAndVariant(style: StyleKey): {
  type: "stamp" | "plant" | "wheel" | "scratch" | "lucky";
  variant?: "dots" | "flame" | "points" | "plant" | "cup";
} {
  return STYLE_TO_TYPE_VARIANT[style];
}
