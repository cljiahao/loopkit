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
        variant: "plant",
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

  it("renders the cup visual for a cup-variant plant view", () => {
    const progress: Progress = {
      stage: "Sip",
      label: "Sip",
      view: {
        kind: "plant",
        stage: 1,
        stageName: "Sip",
        totalStages: 5,
        wilting: false,
        variant: "cup",
      },
      rewardReady: false,
    };
    const { container } = render(
      <PreviewCard
        progress={progress}
        name="Fill-a-kopi"
        rewardText="Free kopi"
      />,
    );
    expect(container.querySelector("#cup-body-clip")).toBeInTheDocument();
  });

  it("renders PointsBar when view.variant is points", () => {
    render(
      <PreviewCard
        progress={{
          stage: "collecting",
          label: "40/100 points",
          rewardReady: false,
          view: { kind: "dots", filled: 40, total: 100, variant: "points" },
        }}
        name="Coffee Points"
        rewardText="Free drink"
      />,
    );
    expect(screen.getByText("40 / 100 points")).toBeInTheDocument();
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

  it("reveals the scratch card result from the real engine view, not a hardcoded placeholder", () => {
    const progress: Progress = {
      stage: "play",
      label: "Scratch to reveal",
      view: {
        kind: "chance",
        variant: "scratch",
        segments: [
          { id: "a", label: "Try again", reward: false },
          { id: "b", label: "Free item", reward: true },
        ],
        landedId: "b",
      },
      rewardReady: false,
    };
    render(
      <PreviewCard
        progress={progress}
        name="Scratch to win"
        rewardText="Free item"
      />,
    );
    expect(screen.getByText("Free item")).toBeInTheDocument();
  });

  it("renders a card burst overlay when celebrating", () => {
    const progress: Progress = {
      stage: "collecting",
      label: "2/2 stamps",
      view: { kind: "dots", filled: 2, total: 2 },
      rewardReady: true,
    };
    const { container } = render(
      <PreviewCard
        progress={progress}
        name="Coffee card"
        rewardText="Free kopi"
        celebrating={true}
      />,
    );
    expect(
      container.querySelectorAll(".card-burst-piece").length,
    ).toBeGreaterThan(0);
  });

  it("does not render a card burst overlay when not celebrating", () => {
    const progress: Progress = {
      stage: "collecting",
      label: "1/2 stamps",
      view: { kind: "dots", filled: 1, total: 2 },
      rewardReady: false,
    };
    const { container } = render(
      <PreviewCard
        progress={progress}
        name="Coffee card"
        rewardText="Free kopi"
      />,
    );
    expect(container.querySelectorAll(".card-burst-piece")).toHaveLength(0);
  });

  it("shows a win popup for a chance result that won", () => {
    const progress: Progress = {
      stage: "play",
      label: "Spin to play",
      view: {
        kind: "chance",
        variant: "wheel",
        segments: [{ id: "a", label: "Free item", reward: true }],
        landedId: "a",
      },
      rewardReady: false,
    };
    render(
      <PreviewCard
        progress={progress}
        name="Spin to win"
        rewardText="Free item"
        lastChanceResult={{ won: true }}
      />,
    );
    expect(screen.getByText("🎉 You won!")).toBeInTheDocument();
  });

  it("shows a lose popup for a chance result that lost", () => {
    const progress: Progress = {
      stage: "play",
      label: "Spin to play",
      view: {
        kind: "chance",
        variant: "wheel",
        segments: [{ id: "a", label: "No prize", reward: false }],
        landedId: "a",
      },
      rewardReady: false,
    };
    render(
      <PreviewCard
        progress={progress}
        name="Spin to win"
        rewardText="Free item"
        lastChanceResult={{ won: false }}
      />,
    );
    // Segment label is "No prize" (not "Try again") to avoid colliding with
    // the popup's own literal "Try again" text — the wheel segment and the
    // lose-popup badge would otherwise both render that exact string.
    expect(screen.getByText("Try again")).toBeInTheDocument();
  });

  it("passes spinning to Wheel while revealing (before a result lands)", () => {
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
        revealing
      />,
    );
    const wheelGroup = container.querySelector("svg g");
    expect(wheelGroup?.getAttribute("class")).toContain(
      "motion-safe:animate-spin",
    );
  });

  it("passes scratching to ScratchCard while revealing", () => {
    const progress: Progress = {
      stage: "play",
      label: "Scratch to reveal",
      view: {
        kind: "chance",
        variant: "scratch",
        segments: [
          { id: "a", label: "Try again", reward: false },
          { id: "b", label: "Free item", reward: true },
        ],
        landedId: null,
      },
      rewardReady: false,
    };
    render(
      <PreviewCard
        progress={progress}
        name="Scratch to win"
        rewardText="Free item"
        revealing
      />,
    );
    expect(screen.getByTestId("scratch-strokes")).toBeInTheDocument();
  });
});
