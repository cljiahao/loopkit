// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DashboardNav } from "./dashboard-nav";

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard/activity",
}));

vi.mock("@/app/actions/feedback", () => ({
  submitFeedbackAction: vi.fn(async () => ({ success: true })),
}));

describe("DashboardNav", () => {
  const baseProps = {
    signOut: vi.fn(async () => {}),
    email: "vendor@example.com",
    vendorName: "Kopi Corner",
    avatarUrl: null,
    tier: "free" as const,
  };

  it("renders Customers, Activity, and Stats as inline nav links", () => {
    render(<DashboardNav {...baseProps} />);
    expect(screen.getByRole("link", { name: "Customers" })).toHaveAttribute(
      "href",
      "/dashboard/customers",
    );
    expect(screen.getByRole("link", { name: "Activity" })).toHaveAttribute(
      "href",
      "/dashboard/activity",
    );
    expect(screen.getByRole("link", { name: "Stats" })).toHaveAttribute(
      "href",
      "/dashboard/stats",
    );
  });

  it("renders Dashboard as the first inline nav link", () => {
    render(<DashboardNav {...baseProps} />);
    const links = screen.getAllByRole("link");
    const navLabels = ["Dashboard", "Customers", "Activity", "Stats"];
    const navLinks = links.filter((l) =>
      navLabels.includes(l.textContent ?? ""),
    );
    expect(navLinks.map((l) => l.textContent)).toEqual(navLabels);
    expect(screen.getByRole("link", { name: "Dashboard" })).toHaveAttribute(
      "href",
      "/dashboard",
    );
  });

  it("renders a mobile menu toggle", () => {
    render(<DashboardNav {...baseProps} />);
    expect(
      screen.getByRole("button", { name: /open menu/i }),
    ).toBeInTheDocument();
  });

  it("toggles the mobile link panel open and closed", async () => {
    const user = userEvent.setup();
    render(<DashboardNav {...baseProps} />);
    const toggle = screen.getByRole("button", { name: /open menu/i });
    await user.click(toggle);
    expect(
      screen.getByRole("button", { name: /close menu/i }),
    ).toBeInTheDocument();
  });

  it("renders the burger toggle before the wordmark, and the account menu alone on the right", () => {
    render(<DashboardNav {...baseProps} />);
    const toggle = screen.getByRole("button", { name: /open menu/i });
    const wordmarkLink = screen.getByRole("link", {
      name: /loopkit dashboard home/i,
    });
    const accountButton = screen.getByRole("button", {
      name: /account menu/i,
    });

    expect(
      toggle.compareDocumentPosition(wordmarkLink) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      wordmarkLink.compareDocumentPosition(accountButton) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("closes the mobile panel when the tap-away scrim is clicked", async () => {
    const user = userEvent.setup();
    render(<DashboardNav {...baseProps} />);
    await user.click(screen.getByRole("button", { name: /open menu/i }));
    expect(
      screen.getByRole("button", { name: /close menu/i }),
    ).toBeInTheDocument();

    const scrim = document.querySelector(
      'button[aria-hidden="true"].fixed.inset-0',
    );
    expect(scrim).not.toBeNull();
    await user.click(scrim as HTMLButtonElement);
    expect(
      screen.getByRole("button", { name: /open menu/i }),
    ).toBeInTheDocument();
  });

  it("account menu has Profile, Settings, Plan, Sign out (in that order), and no separate Customers item", async () => {
    const user = userEvent.setup();
    render(<DashboardNav {...baseProps} />);
    const accountButton = screen.getByRole("button", {
      name: /account menu/i,
    });
    await user.click(accountButton);

    const dropdownLinks = screen
      .getAllByRole("menuitem")
      .filter((l) =>
        ["Profile", "Settings", "Plan"].includes(l.textContent ?? ""),
      );
    expect(dropdownLinks.map((l) => l.textContent)).toEqual([
      "Profile",
      "Settings",
      "Plan",
    ]);
    expect(screen.getByText("Sign out")).toBeInTheDocument();
    // "Customers" appears exactly once — the inline nav link (asserted by
    // role "link" above) — proving the account-dropdown item was removed,
    // not merely hidden.
    expect(screen.getAllByText("Customers")).toHaveLength(1);
  });

  it("account menu has Profile, Settings, Plan, Get help, Feedback, then Sign out, in order", async () => {
    const user = userEvent.setup();
    render(<DashboardNav {...baseProps} />);
    await user.click(screen.getByRole("button", { name: /account menu/i }));
    const menuItems = screen.getAllByRole("menuitem");
    expect(menuItems.map((item) => item.textContent)).toEqual([
      "Profile",
      "Settings",
      "Plan",
      "Get help",
      "Feedback",
      "Sign out",
    ]);
  });

  it("opens the feedback sheet with the FeedbackForm when Feedback is clicked", async () => {
    const user = userEvent.setup();
    render(<DashboardNav {...baseProps} />);
    await user.click(screen.getByRole("button", { name: /account menu/i }));
    await user.click(screen.getByRole("menuitem", { name: /feedback/i }));
    expect(
      screen.getByRole("heading", { name: /share feedback/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/how likely are you to recommend loopkit/i),
    ).toBeInTheDocument();
  });

  it("links Get help to a mailto address", async () => {
    const user = userEvent.setup();
    render(<DashboardNav {...baseProps} />);
    await user.click(screen.getByRole("button", { name: /account menu/i }));
    const getHelp = screen.getByRole("menuitem", { name: /get help/i });
    const link = getHelp.querySelector("a") ?? getHelp;
    expect(link).toHaveAttribute("href", expect.stringMatching(/^mailto:/));
  });

  it("account menu shows the stall name with a static 'Vendor account' subtitle, never the email", async () => {
    const user = userEvent.setup();
    render(<DashboardNav {...baseProps} />);
    await user.click(screen.getByRole("button", { name: /account menu/i }));
    expect(screen.getByText("Kopi Corner")).toBeInTheDocument();
    expect(screen.getByText("Vendor account")).toBeInTheDocument();
    expect(screen.queryByText("vendor@example.com")).not.toBeInTheDocument();
  });

  it("falls back to 'Your stall' (not the email) when no stall name is set", async () => {
    const user = userEvent.setup();
    render(<DashboardNav {...baseProps} vendorName={null} />);
    await user.click(screen.getByRole("button", { name: /account menu/i }));
    expect(screen.getByText("Your stall")).toBeInTheDocument();
    expect(screen.getByText("Vendor account")).toBeInTheDocument();
    expect(screen.queryByText("vendor@example.com")).not.toBeInTheDocument();
  });
});
