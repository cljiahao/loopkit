import { describe, it, expect } from "vitest";
import {
  FAMILIES,
  familyOf,
  isSingleStyleFamily,
  resolveFamilyAndStyle,
  styleToTypeAndVariant,
} from "./card-type-picker";

describe("FAMILIES", () => {
  it("has exactly 4 families in order: stamp, plant, chance, lucky", () => {
    expect(FAMILIES.map((f) => f.key)).toEqual([
      "stamp",
      "plant",
      "chance",
      "lucky",
    ]);
  });

  it("stamp has 3 styles, plant has 2, chance has 2, lucky has 1", () => {
    expect(familyOf("stamp").styles).toHaveLength(3);
    expect(familyOf("plant").styles).toHaveLength(2);
    expect(familyOf("chance").styles).toHaveLength(2);
    expect(familyOf("lucky").styles).toHaveLength(1);
  });
});

describe("isSingleStyleFamily", () => {
  it("is true only for lucky", () => {
    expect(isSingleStyleFamily("lucky")).toBe(true);
    expect(isSingleStyleFamily("stamp")).toBe(false);
    expect(isSingleStyleFamily("plant")).toBe(false);
    expect(isSingleStyleFamily("chance")).toBe(false);
  });
});

describe("resolveFamilyAndStyle", () => {
  it("maps stamp with no/'dots' variant to the stamp family's dots style", () => {
    expect(resolveFamilyAndStyle("stamp", undefined)).toEqual({
      family: "stamp",
      style: "dots",
    });
    expect(resolveFamilyAndStyle("stamp", "dots")).toEqual({
      family: "stamp",
      style: "dots",
    });
  });

  it("maps stamp/flame and stamp/points to the stamp family", () => {
    expect(resolveFamilyAndStyle("stamp", "flame")).toEqual({
      family: "stamp",
      style: "flame",
    });
    expect(resolveFamilyAndStyle("stamp", "points")).toEqual({
      family: "stamp",
      style: "points",
    });
  });

  it("maps plant with no/'plant' variant and 'cup' variant to the plant family", () => {
    expect(resolveFamilyAndStyle("plant", undefined)).toEqual({
      family: "plant",
      style: "plant",
    });
    expect(resolveFamilyAndStyle("plant", "plant")).toEqual({
      family: "plant",
      style: "plant",
    });
    expect(resolveFamilyAndStyle("plant", "cup")).toEqual({
      family: "plant",
      style: "cup",
    });
  });

  it("maps wheel and scratch to the chance family", () => {
    expect(resolveFamilyAndStyle("wheel", undefined)).toEqual({
      family: "chance",
      style: "wheel",
    });
    expect(resolveFamilyAndStyle("scratch", undefined)).toEqual({
      family: "chance",
      style: "scratch",
    });
  });

  it("maps lucky to the lucky family", () => {
    expect(resolveFamilyAndStyle("lucky", undefined)).toEqual({
      family: "lucky",
      style: "lucky",
    });
  });
});

describe("styleToTypeAndVariant", () => {
  it("round-trips every style through resolveFamilyAndStyle back to itself", () => {
    for (const family of FAMILIES) {
      for (const style of family.styles) {
        const { type, variant } = styleToTypeAndVariant(style.key);
        expect(resolveFamilyAndStyle(type, variant)).toEqual({
          family: family.key,
          style: style.key,
        });
      }
    }
  });

  it("wheel, scratch, and lucky styles carry no variant", () => {
    expect(styleToTypeAndVariant("wheel").variant).toBeUndefined();
    expect(styleToTypeAndVariant("scratch").variant).toBeUndefined();
    expect(styleToTypeAndVariant("lucky").variant).toBeUndefined();
  });
});
