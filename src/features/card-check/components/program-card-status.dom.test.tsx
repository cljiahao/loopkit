// @vitest-environment jsdom
// src/features/card-check/components/program-card-status.dom.test.tsx
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { ProgramCardStatus } from "./program-card-status";
import type { CardStatus } from "../types";

function baseCard(overrides: Partial<CardStatus>): CardStatus {
  return {
    programId: "p1",
    name: "Grow-a-kopi",
    label: "Sip",
    reward_text: "Free kopi",
    rewardReady: false,
    expired: false,
    active: true,
    replacedByName: null,
    carriedOverCount: null,
    qr: null,
    view: {
      kind: "plant",
      stage: 1,
      stageName: "Sip",
      totalStages: 5,
      wilting: false,
      variant: "cup",
    },
    ...overrides,
  } as CardStatus;
}

describe("ProgramCardStatus points variant", () => {
  it("renders PointsBar when view.variant is points", () => {
    const { getByText } = render(
      <ProgramCardStatus
        card={baseCard({
          view: { kind: "dots", filled: 40, total: 100, variant: "points" },
        })}
        phone="+6591234567"
      />,
    );
    expect(getByText("40 / 100 points")).toBeInTheDocument();
  });

  it("still renders StampDots (not PointsBar) when view.variant is dots", () => {
    const { container, queryByText } = render(
      <ProgramCardStatus
        card={baseCard({
          view: { kind: "dots", filled: 3, total: 5, variant: "dots" },
        })}
        phone="+6591234567"
      />,
    );
    expect(queryByText(/points$/)).not.toBeInTheDocument();
    expect(container.querySelectorAll("span[aria-hidden]").length).toBe(5);
  });
});

describe("ProgramCardStatus cup variant", () => {
  it("renders the Cup visual (not Plant) when view.variant is cup", () => {
    const { container } = render(
      <ProgramCardStatus card={baseCard({})} phone="+6591234567" />,
    );
    // Cup draws exactly one clipPath (defs > clipPath#cup-body-clip); Plant never does.
    expect(container.querySelector("#cup-body-clip")).toBeInTheDocument();
  });

  it("renders the Plant visual (not Cup) when view.variant is plant", () => {
    const { container } = render(
      <ProgramCardStatus
        card={baseCard({
          view: {
            kind: "plant",
            stage: 1,
            stageName: "Sprout",
            totalStages: 5,
            wilting: false,
            variant: "plant",
          },
        })}
        phone="+6591234567"
      />,
    );
    expect(container.querySelector("#cup-body-clip")).not.toBeInTheDocument();
  });
});
