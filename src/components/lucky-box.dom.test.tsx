// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { LuckyBox } from "./lucky-box";

describe("LuckyBox", () => {
  it("renders the mystery-box prompt and pity progress", () => {
    render(<LuckyBox visitsSinceWin={3} pityCeiling={8} />);
    expect(screen.getByText("Tap for a surprise")).toBeInTheDocument();
    expect(screen.getByText("Guaranteed win by visit 3/8")).toBeInTheDocument();
  });

  it("clamps the displayed progress at the pity ceiling", () => {
    render(<LuckyBox visitsSinceWin={20} pityCeiling={8} />);
    expect(screen.getByText("Guaranteed win by visit 8/8")).toBeInTheDocument();
  });
});
