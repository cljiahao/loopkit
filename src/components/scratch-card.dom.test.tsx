// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ScratchCard } from "./scratch-card";

describe("ScratchCard", () => {
  it("shows the cover text and the prize label underneath", () => {
    render(<ScratchCard revealed={false} label="Free kopi" reward={true} />);
    expect(screen.getByText("Scratch to reveal")).toBeInTheDocument();
    expect(screen.getByText("Free kopi")).toBeInTheDocument();
  });

  it("renders no scratch strokes by default", () => {
    render(<ScratchCard revealed={false} label="Try again" reward={false} />);
    expect(screen.queryByTestId("scratch-strokes")).not.toBeInTheDocument();
  });

  it("renders 5 scratch strokes while scratching", () => {
    render(
      <ScratchCard
        revealed={false}
        scratching
        label="Try again"
        reward={false}
      />,
    );
    const container = screen.getByTestId("scratch-strokes");
    expect(container.querySelectorAll(".scratch-stroke")).toHaveLength(5);
  });

  it("stops rendering scratch strokes once revealed", () => {
    render(
      <ScratchCard
        revealed={true}
        scratching={false}
        label="Free kopi"
        reward={true}
      />,
    );
    expect(screen.queryByTestId("scratch-strokes")).not.toBeInTheDocument();
  });

  it("does not render scratch strokes when both revealed and scratching are true", () => {
    render(
      <ScratchCard
        revealed={true}
        scratching={true}
        label="Free kopi"
        reward={true}
      />,
    );
    expect(screen.queryByTestId("scratch-strokes")).not.toBeInTheDocument();
  });
});
