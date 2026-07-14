// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { NewProgramTile } from "./new-program-tile";

describe("NewProgramTile", () => {
  it("links to /setup when the vendor can create another program", () => {
    render(<NewProgramTile canCreate={true} />);
    expect(screen.getByRole("link", { name: /new program/i })).toHaveAttribute(
      "href",
      "/setup",
    );
  });

  it("shows an upgrade prompt instead when at the free-tier cap", () => {
    render(<NewProgramTile canCreate={false} />);
    expect(
      screen.queryByRole("link", { name: /new program/i }),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/upgrade to pro/i)).toBeInTheDocument();
  });
});
