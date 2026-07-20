// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/features/auth", () => ({ requireVendor: vi.fn(async () => ({})) }));
vi.mock("@/app/dashboard/plan/actions", () => ({
  requestUpgrade: vi.fn(),
}));

const program = { id: "p1", name: "Coffee Stamps", type: "stamp" };

vi.mock("@/lib/program", () => ({
  isPro: vi.fn(async () => false),
  listPrograms: vi.fn(async () => [program]),
  currentProgram: (progs: { id: string }[], id?: string) =>
    progs.find((p) => p.id === id) ?? null,
}));
vi.mock("@/lib/stats", () => ({
  getProgramStats: vi.fn(async () => ({
    enrolled: 5,
    repeatVisitRate: 0.6,
    rewardsTotal: 3,
  })),
}));

import PlanPage from "./page";

describe("PlanPage", () => {
  it("shows the Pro upsell card and the feature comparison table for a Free vendor", async () => {
    render(await PlanPage({ searchParams: Promise.resolve({}) }));
    expect(screen.getByText("Plan")).toBeInTheDocument();
    expect(screen.getAllByText("Free").length).toBeGreaterThan(0);
    expect(
      screen.getByText(/run more than one loyalty program/i),
    ).toBeInTheDocument();
    expect(screen.getByText("Loyalty programs")).toBeInTheDocument();
  });

  it("shows the Pro-active message and program stats summary for a Pro vendor", async () => {
    const { isPro } = await import("@/lib/program");
    vi.mocked(isPro).mockResolvedValueOnce(true);
    render(await PlanPage({ searchParams: Promise.resolve({ p: "p1" }) }));
    expect(
      screen.getByText(/unlimited loyalty programs are unlocked/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/how your program is doing/i)).toBeInTheDocument();
  });
});
