// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { BackButton } from "./back-button";

describe("BackButton", () => {
  it("renders the label as a link to href", () => {
    render(<BackButton href="/dashboard" label="Back to dashboard" />);
    expect(
      screen.getByRole("link", { name: /back to dashboard/i }),
    ).toHaveAttribute("href", "/dashboard");
  });
});
