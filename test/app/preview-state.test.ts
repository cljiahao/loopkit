import { describe, it, expect } from "vitest";
import {
  buildPreviewProgress,
  buildPreviewProgram,
  buildInitialCard,
} from "@/app/setup/preview-state";

const base = {
  name: "Coffee card",
  rewardText: "Free kopi",
  stampsRequired: 10,
  visitsToBloom: 6,
  winPercent: 20,
  pityCeiling: 8 as number | undefined,
  segments: [
    { label: "Try again", weight: 5, is_reward: false },
    { label: "Free item", weight: 1, is_reward: true },
  ],
  headStart: false,
  headStartPercent: 20,
  variant: "dots" as const,
};

describe("buildPreviewProgress", () => {
  it("stamp: fresh card shows zero-filled dots", () => {
    const progress = buildPreviewProgress({ ...base, type: "stamp" });
    expect(progress.label).toBe("0/10 stamps");
    expect(progress.view).toEqual({
      kind: "dots",
      filled: 0,
      total: 10,
      variant: "dots",
    });
  });

  it("stamp: head start seeds ~20% of stamps_required, capped below the requirement", () => {
    const progress = buildPreviewProgress({
      ...base,
      type: "stamp",
      headStart: true,
    });
    expect(progress.label).toBe("2/10 stamps");
    expect(progress.view).toEqual({
      kind: "dots",
      filled: 2,
      total: 10,
      variant: "dots",
    });
  });

  it("plant: fresh card starts at Seed", () => {
    const progress = buildPreviewProgress({ ...base, type: "plant" });
    expect(progress.view).toEqual({
      kind: "plant",
      stage: 0,
      stageName: "Seed",
      totalStages: 5,
      wilting: false,
      variant: "plant",
    });
  });

  it("plant: head start floors growth at the Sprout stage", () => {
    const progress = buildPreviewProgress({
      ...base,
      type: "plant",
      headStart: true,
    });
    expect(progress.view).toEqual({
      kind: "plant",
      stage: 1,
      stageName: "Sprout",
      totalStages: 5,
      wilting: false,
      variant: "plant",
    });
  });

  it("lucky: always previews at the zero/unplayed state, ignoring head start", () => {
    const fresh = buildPreviewProgress({ ...base, type: "lucky" });
    const withHeadStart = buildPreviewProgress({
      ...base,
      type: "lucky",
      headStart: true,
    });
    expect(fresh.view).toEqual({ kind: "dots", filled: 0, total: 8 });
    expect(withHeadStart.view).toEqual(fresh.view);
  });

  it("wheel: renders the configured segments at the zero/unplayed state", () => {
    const progress = buildPreviewProgress({
      ...base,
      type: "wheel",
      pityCeiling: undefined,
    });
    expect(progress.view.kind).toBe("chance");
    if (progress.view.kind !== "chance") {
      throw new Error("expected a chance view");
    }
    expect(progress.view.variant).toBe("wheel");
    expect(progress.view.landedId).toBeNull();
    expect(
      progress.view.segments.map((s) => ({ label: s.label, reward: s.reward })),
    ).toEqual([
      { label: "Try again", reward: false },
      { label: "Free item", reward: true },
    ]);
  });

  it("stamp: a custom head-start percent scales the seed", () => {
    const progress = buildPreviewProgress({
      ...base,
      type: "stamp",
      headStart: true,
      headStartPercent: 30,
    });
    // round(10 * 30 / 100) = 3
    expect(progress.label).toBe("3/10 stamps");
  });

  it("plant: a low head-start percent still floors at the Sprout stage", () => {
    const progress = buildPreviewProgress({
      ...base,
      type: "plant",
      headStart: true,
      headStartPercent: 10,
    });
    // round(6 * 10 / 100) = 1, floored to the Sprout threshold round(6*0.25)=2
    expect(progress.view).toEqual({
      kind: "plant",
      stage: 1,
      stageName: "Sprout",
      totalStages: 5,
      wilting: false,
      variant: "plant",
    });
  });

  it("stamp: variant flame renders a flame view in progress", () => {
    const progress = buildPreviewProgress({
      ...base,
      type: "stamp",
      variant: "flame",
      headStart: true,
    });
    expect(progress.view.kind).toBe("flame");
  });

  it("plant: cup variant shows the cup stage names", () => {
    const progress = buildPreviewProgress({
      ...base,
      type: "plant",
      variant: "cup",
    });
    expect(progress.view).toEqual({
      kind: "plant",
      stage: 0,
      stageName: "Empty",
      totalStages: 5,
      wilting: false,
      variant: "cup",
    });
  });

  it("plant: cup variant head start floors growth at the Sip stage, same as plant floors at Sprout", () => {
    const progress = buildPreviewProgress({
      ...base,
      type: "plant",
      variant: "cup",
      headStart: true,
    });
    expect(progress.view).toEqual({
      kind: "plant",
      stage: 1,
      stageName: "Sip",
      totalStages: 5,
      wilting: false,
      variant: "cup",
    });
  });
});

describe("buildPreviewProgram", () => {
  it("builds a stamp program", () => {
    const program = buildPreviewProgram({ ...base, type: "stamp" });
    expect(program).toEqual({
      type: "stamp",
      stamps_required: 10,
      reward_text: "Free kopi",
      config: {
        stamps_required: 10,
        reward_text: "Free kopi",
        variant: "dots",
      },
    });
  });

  it("stamp: variant flame flows into the built program's config", () => {
    const program = buildPreviewProgram({
      ...base,
      type: "stamp",
      variant: "flame",
    });
    expect(program.config).toMatchObject({ variant: "flame" });
  });

  it("builds a lucky program, defaulting the pity ceiling to 8", () => {
    const program = buildPreviewProgram({
      ...base,
      type: "lucky",
      pityCeiling: undefined,
    });
    expect(program.stamps_required).toBe(8);
    expect(program.config).toMatchObject({
      win_probability: 0.2,
      pity_ceiling: 8,
      cooldown_visits: 0,
    });
  });

  it("builds a wheel program from the configured segments", () => {
    const program = buildPreviewProgram({
      ...base,
      type: "wheel",
      pityCeiling: undefined,
    });
    expect(program.type).toBe("wheel");
    expect(program.stamps_required).toBe(10);
  });
});

describe("buildInitialCard", () => {
  const now = new Date("2026-07-15T00:00:00Z");

  it("returns the fresh card when head start is off", () => {
    expect(
      buildInitialCard({ ...base, type: "stamp", headStart: false }, now),
    ).toEqual({ state: {}, stamp_count: 0, reward_count: 0 });
  });

  it("seeds the stamp head-start position", () => {
    const card = buildInitialCard(
      { ...base, type: "stamp", headStart: true },
      now,
    );
    expect(card.stamp_count).toBe(2);
  });

  it("seeds the plant head-start position at the Sprout floor", () => {
    const card = buildInitialCard(
      { ...base, type: "plant", headStart: true },
      now,
    );
    expect(card.state).toMatchObject({ growth: 2 });
  });

  it("never seeds a head start for lucky, even when the toggle is on", () => {
    const card = buildInitialCard(
      { ...base, type: "lucky", headStart: true },
      now,
    );
    expect(card).toEqual({ state: {}, stamp_count: 0, reward_count: 0 });
  });
});
