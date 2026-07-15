// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PreviewCard } from "@/app/setup/preview-card";
import type { Progress } from "@/lib/engine/types";

describe("PreviewCard", () => {
  it("renders the name, reward text, and label", () => {
    const progress: Progress = {
      stage: "collecting",
      label: "2/10 stamps",
      view: { kind: "dots", filled: 2, total: 10 },
      rewardReady: false,
    };
    render(
      <PreviewCard
        progress={progress}
        name="Coffee card"
        rewardText="Free kopi"
      />,
    );
    expect(screen.getByText("Coffee card")).toBeInTheDocument();
    expect(screen.getByText("2/10 stamps")).toBeInTheDocument();
    expect(screen.getByText("Reward: Free kopi")).toBeInTheDocument();
  });

  it("renders the plant visual for a plant view", () => {
    const progress: Progress = {
      stage: "Sprout",
      label: "Sprout",
      view: {
        kind: "plant",
        stage: 1,
        stageName: "Sprout",
        totalStages: 5,
        wilting: false,
      },
      rewardReady: false,
    };
    const { container } = render(
      <PreviewCard
        progress={progress}
        name="Grow-a-kopi"
        rewardText="Free kopi"
      />,
    );
    expect(container.querySelector("svg")).toBeInTheDocument();
    expect(screen.getByText("Sprout")).toBeInTheDocument();
  });

  it("renders the flame layers for a flame view", () => {
    const progress: Progress = {
      stage: "collecting",
      label: "Inner Flame — 4/8",
      view: {
        kind: "flame",
        filled: 4,
        total: 8,
        stage: 1,
        stageName: "Inner Flame",
        totalStages: 3,
      },
      rewardReady: false,
    };
    render(
      <PreviewCard
        progress={progress}
        name="Weekly regular"
        rewardText="Free item"
      />,
    );
    // FlameLayers renders its own "{stageName} — {filled}/{total}" text
    // alongside the identical progress.label below it, so both instances
    // are expected here.
    expect(screen.getAllByText("Inner Flame — 4/8")).toHaveLength(2);
  });

  it("renders the wheel for a chance view with variant wheel", () => {
    const progress: Progress = {
      stage: "play",
      label: "Spin to play",
      view: {
        kind: "chance",
        variant: "wheel",
        segments: [
          { id: "a", label: "Try again", reward: false },
          { id: "b", label: "Free item", reward: true },
        ],
        landedId: null,
      },
      rewardReady: false,
    };
    const { container } = render(
      <PreviewCard
        progress={progress}
        name="Spin to win"
        rewardText="Free item"
      />,
    );
    expect(container.querySelector("svg")).toBeInTheDocument();
  });

  it("falls back to placeholder name and reward text when both are blank", () => {
    const progress: Progress = {
      stage: "collecting",
      label: "0/10 stamps",
      view: { kind: "dots", filled: 0, total: 10 },
      rewardReady: false,
    };
    render(<PreviewCard progress={progress} name="" rewardText="" />);
    expect(screen.getByText("Your card")).toBeInTheDocument();
    expect(screen.getByText("Reward: —")).toBeInTheDocument();
  });
});
