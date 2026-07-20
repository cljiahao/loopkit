// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Stat } from "./stat";

describe("Stat", () => {
  it("renders the label and value", () => {
    render(<Stat label="Programs" value={12} />);
    expect(screen.getByText("Programs")).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();
  });

  it("accepts a string value and a custom className", () => {
    render(<Stat label="Redemption rate" value="42%" className="col-span-2" />);
    expect(screen.getByText("42%")).toBeInTheDocument();
  });
});
