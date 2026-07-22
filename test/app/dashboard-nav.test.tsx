// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { DashboardNav } from "@/app/dashboard/dashboard-nav";

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
}));

const baseProps = {
  signOut: vi.fn(async () => {}),
  tier: "free" as const,
};

// Radix's dropdown positioning relies on pointer-capture / scrollIntoView
// APIs jsdom doesn't implement — stub them so user-event can open the menu.
beforeEach(() => {
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.setPointerCapture ??= () => {};
  Element.prototype.releasePointerCapture ??= () => {};
  Element.prototype.scrollIntoView ??= () => {};
});

describe("DashboardNav avatar trigger", () => {
  it("shows initials from the stall name when vendorName is set", () => {
    render(
      <DashboardNav
        {...baseProps}
        email="jane.doe@example.com"
        vendorName="Kopi Corner"
        avatarUrl={null}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Account menu" }),
    ).toHaveTextContent("KC");
  });

  it("falls back to email-derived initials when vendorName is null", () => {
    render(
      <DashboardNav
        {...baseProps}
        email="jane.doe@example.com"
        vendorName={null}
        avatarUrl={null}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Account menu" }),
    ).toHaveTextContent("JD");
  });

  it("strips the email domain before deriving initials, not just the local part's own dots", () => {
    // Regression check: the domain (e.g. "gmail.com") must never contribute
    // to the initials — only the local part before "@" should be split.
    render(
      <DashboardNav
        {...baseProps}
        email="jane@gmail.com"
        vendorName={null}
        avatarUrl={null}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Account menu" }),
    ).toHaveTextContent("JA");
  });

  it("renders an avatar image instead of initials when avatarUrl is set", () => {
    render(
      <DashboardNav
        {...baseProps}
        email="jane.doe@example.com"
        vendorName="Kopi Corner"
        avatarUrl="https://example.com/avatar.png"
      />,
    );
    const trigger = screen.getByRole("button", { name: "Account menu" });
    // Decorative (alt=""), so it has no accessible "img" role — query the tag.
    expect(trigger.querySelector("img")).toBeInTheDocument();
    expect(trigger).not.toHaveTextContent("KC");
  });
});

describe("DashboardNav account dropdown label", () => {
  it("shows the stall name as the primary line and a static 'Vendor account' subtitle, never the email", async () => {
    const user = userEvent.setup();
    render(
      <DashboardNav
        {...baseProps}
        email="jane.doe@example.com"
        vendorName="Kopi Corner"
        avatarUrl={null}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Account menu" }));

    expect(screen.getByText("Kopi Corner")).toBeInTheDocument();
    expect(screen.getByText("Vendor account")).toBeInTheDocument();
    expect(screen.queryByText("jane.doe@example.com")).not.toBeInTheDocument();
  });

  it("falls back to 'Your stall' (not the email) as the primary line when no stall name is set", async () => {
    const user = userEvent.setup();
    render(
      <DashboardNav
        {...baseProps}
        email="jane.doe@example.com"
        vendorName={null}
        avatarUrl={null}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Account menu" }));

    expect(screen.getByText("Your stall")).toBeInTheDocument();
    expect(screen.getByText("Vendor account")).toBeInTheDocument();
    expect(screen.queryByText("jane.doe@example.com")).not.toBeInTheDocument();
  });
});
