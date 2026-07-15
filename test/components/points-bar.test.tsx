// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PointsBar } from "@/components/points-bar";

describe("PointsBar", () => {
  it("renders the filled/total count as a formatted number", () => {
    render(<PointsBar filled={740} total={1000} />);
    expect(screen.getByText("740 / 1,000 points")).toBeInTheDocument();
  });

  it("fill bar width matches the filled/total ratio", () => {
    const { container } = render(<PointsBar filled={25} total={100} />);
    const bar = container.querySelector('[data-testid="points-bar-fill"]');
    expect(bar).toHaveStyle({ width: "25%" });
  });

  it("clamps fill width at 100% when filled exceeds total (carryover case)", () => {
    const { container } = render(<PointsBar filled={150} total={100} />);
    const bar = container.querySelector('[data-testid="points-bar-fill"]');
    expect(bar).toHaveStyle({ width: "100%" });
  });
});
