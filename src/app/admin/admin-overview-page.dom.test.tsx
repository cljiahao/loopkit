// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/lib/admin", () => ({ requireAdmin: vi.fn(async () => ({})) }));
vi.mock("@/lib/admin-data", () => ({
  platformTotals: vi.fn(async () => ({
    programs: 4,
    active_programs: 3,
    customers: 120,
    stamps_issued: 900,
    rewards_redeemed: 60,
  })),
  recentActivity: vi.fn(async () => [
    {
      id: "e1",
      kind: "stamp",
      created_at: "2026-07-10T00:00:00Z",
      phone: "+6591234567",
      program_name: "Coffee Stamps",
    },
    {
      id: "e2",
      kind: "redeem",
      created_at: "2026-07-11T00:00:00Z",
      phone: "+6598765432",
      program_name: "Bakery Stamps",
    },
  ]),
}));

import AdminOverviewPage from "./page";

describe("AdminOverviewPage", () => {
  it("renders platform totals and recent activity", async () => {
    render(await AdminOverviewPage());
    expect(screen.getByText("Overview")).toBeInTheDocument();
    expect(screen.getByText("120")).toBeInTheDocument();
    expect(screen.getByText("Coffee Stamps")).toBeInTheDocument();
    expect(screen.getByText("Bakery Stamps")).toBeInTheDocument();
  });

  it("shows an empty state when there is no activity yet", async () => {
    const { recentActivity } = await import("@/lib/admin-data");
    vi.mocked(recentActivity).mockResolvedValueOnce([]);
    render(await AdminOverviewPage());
    expect(screen.getByText("No activity yet.")).toBeInTheDocument();
  });
});
