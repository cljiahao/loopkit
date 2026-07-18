// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import type { Program } from "@/lib/program";
import { ProgramCard } from "./program-card";

const program: Program = {
  id: "p1",
  name: "Coffee Stamps",
  stamps_required: 8,
  reward_text: "a free coffee",
  type: "stamp",
  config: {},
  active: true,
  expiry_days: null,
  head_start: false,
  head_start_percent: 20,
  replaced_by: null,
  carry_over_stamps: false,
};

describe("ProgramCard", () => {
  it("renders the program name, type badge, and description", () => {
    render(<ProgramCard program={program} />);
    expect(screen.getByText("Coffee Stamps")).toBeInTheDocument();
    expect(screen.getByText("Stamp")).toBeInTheDocument();
    expect(screen.getByText(/buy 8, get 1 a free coffee/i)).toBeInTheDocument();
  });

  it("renders the expiry and head-start detail lines", () => {
    const withDetails: Program = {
      ...program,
      expiry_days: 30,
      head_start: true,
    };
    render(<ProgramCard program={withDetails} />);
    expect(screen.getByText("Resets after 30 days")).toBeInTheDocument();
    expect(
      screen.getByText("New customers get a head start"),
    ).toBeInTheDocument();
  });

  it("shows 'Never expires' when there is no expiry", () => {
    render(<ProgramCard program={program} />);
    expect(screen.getByText("Never expires")).toBeInTheDocument();
  });

  it("links Edit to /setup?edit=<id>", () => {
    render(<ProgramCard program={program} />);
    expect(
      screen.getByRole("link", { name: /edit coffee stamps/i }),
    ).toHaveAttribute("href", "/setup?edit=p1");
  });

  it("links the whole card to /dashboard/counter?p=<id>", () => {
    render(<ProgramCard program={program} />);
    expect(
      screen.getByRole("link", { name: /open counter for coffee stamps/i }),
    ).toHaveAttribute("href", "/dashboard/counter?p=p1");
  });

  it("renders exactly 2 links, neither nested inside the other", () => {
    const { container } = render(<ProgramCard program={program} />);
    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(2);
    for (const link of links) {
      expect(link.parentElement?.closest("a")).toBeNull();
    }
    // Sanity: both links are direct descendants of the card root, not of
    // each other — the root itself is the outermost element rendered.
    const root = container.firstElementChild;
    expect(links.every((l) => root?.contains(l))).toBe(true);
  });

  it("does not render Customers, Activity, or Stats links", () => {
    render(<ProgramCard program={program} />);
    expect(
      screen.queryByRole("link", { name: "Customers" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Activity" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Stats" }),
    ).not.toBeInTheDocument();
  });
});
