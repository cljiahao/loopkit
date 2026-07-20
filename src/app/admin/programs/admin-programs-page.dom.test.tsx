// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/lib/admin", () => ({ requireAdmin: vi.fn(async () => ({})) }));
vi.mock("@/lib/admin-data", () => ({
  listProgramsOverview: vi.fn(async () => [
    {
      id: "p1",
      name: "Coffee Stamps",
      active: true,
      vendor_email: "vendor@example.com",
      customer_count: 10,
      stamps_issued: 50,
      rewards_redeemed: 5,
      last_activity_at: "2026-07-10T00:00:00Z",
      created_at: "2026-01-01T00:00:00Z",
    },
    {
      id: "p2",
      name: "Retired Program",
      active: false,
      vendor_email: null,
      customer_count: 0,
      stamps_issued: 0,
      rewards_redeemed: 0,
      last_activity_at: null,
      created_at: "2026-01-01T00:00:00Z",
    },
  ]),
}));

import AdminProgramsPage from "./page";

describe("AdminProgramsPage", () => {
  it("renders every program row with its vendor and an inactive marker", async () => {
    render(await AdminProgramsPage());
    expect(screen.getByText("Programs")).toBeInTheDocument();
    expect(screen.getByText("Coffee Stamps")).toBeInTheDocument();
    expect(screen.getByText("vendor@example.com")).toBeInTheDocument();
    expect(screen.getByText("Retired Program")).toBeInTheDocument();
    expect(screen.getByText("inactive")).toBeInTheDocument();
  });

  it("shows an empty state when there are no programs", async () => {
    const { listProgramsOverview } = await import("@/lib/admin-data");
    vi.mocked(listProgramsOverview).mockResolvedValueOnce([]);
    render(await AdminProgramsPage());
    expect(screen.getByText("No programs yet.")).toBeInTheDocument();
  });
});
