// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ShopQrBlock } from "./shop-qr-block";

describe("ShopQrBlock", () => {
  it("shows the join instruction and the link", () => {
    render(
      <ShopQrBlock
        qrSvgMarkup="<svg></svg>"
        link="https://example.com/c?v=vendor1"
        programNames={["Coffee Stamps", "Lucky Tap"]}
      />,
    );
    expect(
      screen.getByText(/scan this to join coffee stamps, lucky tap/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText("https://example.com/c?v=vendor1"),
    ).toBeInTheDocument();
  });

  it("falls back to generic copy when there are no active programs", () => {
    render(
      <ShopQrBlock
        qrSvgMarkup="<svg></svg>"
        link="https://example.com/c?v=vendor1"
        programNames={[]}
      />,
    );
    expect(
      screen.getByText(/scan this to join your programs/i),
    ).toBeInTheDocument();
  });
});
