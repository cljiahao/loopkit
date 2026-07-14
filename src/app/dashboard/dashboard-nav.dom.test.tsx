// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DashboardNav } from "./dashboard-nav";

describe("DashboardNav", () => {
  const baseProps = {
    signOut: vi.fn(async () => {}),
    email: "vendor@example.com",
    vendorName: "Kopi Corner",
    avatarUrl: null,
    tier: "free" as const,
  };

  it("renders brand and account menu, no program switcher", () => {
    render(<DashboardNav {...baseProps} />);
    expect(
      screen.queryByRole("button", { name: /program/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /account menu/i }),
    ).toBeInTheDocument();
  });

  it("does not render the scoped page links or mobile burger", () => {
    render(<DashboardNav {...baseProps} />);
    expect(screen.queryByText("Counter")).not.toBeInTheDocument();
    expect(screen.queryByText("Customers")).not.toBeInTheDocument();
    expect(screen.queryByText("Activity")).not.toBeInTheDocument();
    expect(screen.queryByText("Stats")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /open menu/i }),
    ).not.toBeInTheDocument();
  });

  it("includes Plan in the account menu alongside Profile and Sign out", async () => {
    const user = userEvent.setup();
    render(<DashboardNav {...baseProps} />);
    const accountButton = screen.getByRole("button", { name: /account menu/i });
    await user.click(accountButton);
    expect(screen.getByText("Plan")).toBeInTheDocument();
    expect(screen.getByText("Profile")).toBeInTheDocument();
    expect(screen.getByText("Sign out")).toBeInTheDocument();
  });
});
