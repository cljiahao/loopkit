// src/components/plant.dom.test.tsx
// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { Plant } from "@/components/plant";

describe("Plant", () => {
  it("renders an svg", () => {
    const { container } = render(
      <Plant stage={0} totalStages={5} wilting={false} />,
    );
    expect(container.querySelector("svg")).toBeInTheDocument();
  });

  it("collapses the stem to zero height and shows the seed dot at stage 0", () => {
    const { container } = render(
      <Plant stage={0} totalStages={5} wilting={false} />,
    );
    const line = container.querySelector("line");
    expect(line).toHaveStyle({ transform: "scaleY(0)" });
    const seed = Array.from(container.querySelectorAll("circle")).find((c) =>
      c.getAttribute("class")?.includes("fill-primary/60"),
    );
    expect(seed).toBeInTheDocument();
  });

  it("scales the stem toward full height as stage increases", () => {
    const { container } = render(
      <Plant stage={2} totalStages={5} wilting={false} />,
    );
    const line = container.querySelector("line");
    expect(line).toHaveStyle({ transform: "scaleY(0.5)" });
  });

  it("shows leafPairs = min(stage, 3) leaf slots as visible, the rest hidden", () => {
    const { container } = render(
      <Plant stage={1} totalStages={5} wilting={false} />,
    );
    const leafSlots = container.querySelectorAll("g > g");
    expect(leafSlots).toHaveLength(3);
    const classes = Array.from(leafSlots).map((g) => g.getAttribute("class"));
    expect(classes[0]).toContain("opacity-100");
    expect(classes[0]).toContain("scale-100");
    expect(classes[1]).toContain("opacity-0");
    expect(classes[1]).toContain("scale-0");
    expect(classes[2]).toContain("opacity-0");
  });

  it("keeps an already-placed leaf pair's position stable when a new pair appears", () => {
    const first = render(<Plant stage={1} totalStages={5} wilting={false} />);
    const dAtStage1 = first.container
      .querySelectorAll("g > g")[0]
      .querySelector("path")
      ?.getAttribute("d");

    const second = render(<Plant stage={2} totalStages={5} wilting={false} />);
    const dAtStage2 = second.container
      .querySelectorAll("g > g")[0]
      .querySelector("path")
      ?.getAttribute("d");

    expect(dAtStage1).toBe(dAtStage2);
  });

  it("renders the bloom only at the final stage", () => {
    const notBloom = render(
      <Plant stage={3} totalStages={5} wilting={false} />,
    );
    // Just the base shadow ellipse — no bloom petals yet.
    expect(notBloom.container.querySelectorAll("ellipse")).toHaveLength(1);

    const bloom = render(<Plant stage={4} totalStages={5} wilting={false} />);
    // Shadow ellipse + 6 petal ellipses.
    expect(bloom.container.querySelectorAll("ellipse")).toHaveLength(7);
  });

  it("dims the plant color when wilting", () => {
    const { container } = render(
      <Plant stage={2} totalStages={5} wilting={true} />,
    );
    expect(container.querySelector("svg")?.getAttribute("class")).toContain(
      "text-muted-foreground",
    );
  });
});
