// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { Cup } from "@/components/cup";

describe("Cup", () => {
  it("renders an svg", () => {
    const { container } = render(
      <Cup stage={0} totalStages={5} wilting={false} />,
    );
    expect(container.querySelector("svg")).toBeInTheDocument();
  });

  it("renders no liquid fill at stage 0 (Empty)", () => {
    const { container } = render(
      <Cup stage={0} totalStages={5} wilting={false} />,
    );
    // Only the cup outline path + handle path + shadow ellipse — no fill rect
    expect(container.querySelectorAll("rect")).toHaveLength(0);
  });

  it("renders a liquid fill rect once growth has started", () => {
    const { container } = render(
      <Cup stage={2} totalStages={5} wilting={false} />,
    );
    expect(container.querySelectorAll("rect")).toHaveLength(1);
  });

  it("renders latte art only at the Full stage", () => {
    const notFull = render(<Cup stage={3} totalStages={5} wilting={false} />);
    expect(notFull.container.querySelectorAll("circle")).toHaveLength(0);
    const full = render(<Cup stage={4} totalStages={5} wilting={false} />);
    expect(full.container.querySelectorAll("circle")).toHaveLength(2);
  });

  it("dims the liquid color when wilting", () => {
    const { container } = render(
      <Cup stage={2} totalStages={5} wilting={true} />,
    );
    const rect = container.querySelector("rect");
    expect(rect?.getAttribute("class")).toContain("fill-muted-foreground");
  });

  it("uses the slow shared growth duration on the liquid fill", () => {
    const { container } = render(
      <Cup stage={2} totalStages={5} wilting={false} />,
    );
    const rect = container.querySelector("rect");
    expect(rect?.getAttribute("class")).toContain("duration-[1600ms]");
  });

  it("fades and scales the latte-art in on mount instead of popping", () => {
    const { container } = render(
      <Cup stage={4} totalStages={5} wilting={false} />,
    );
    const circle = container.querySelector("circle");
    const latteArtGroup = circle?.parentElement;
    expect(latteArtGroup?.tagName).toBe("g");
    expect(latteArtGroup?.getAttribute("class")).toContain(
      "starting:opacity-0",
    );
    expect(latteArtGroup?.getAttribute("class")).toContain("starting:scale-0");
  });
});
