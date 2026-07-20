// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/features/auth", () => ({ requireVendor: vi.fn(async () => ({})) }));

const programs = [
  { id: "p1", name: "Coffee Stamps", type: "stamp" },
  { id: "p2", name: "Bakery Stamps", type: "stamp" },
];

vi.mock("@/lib/program", () => ({
  listPrograms: vi.fn(async () => programs),
  currentProgram: (progs: { id: string }[], id?: string) =>
    progs.find((p) => p.id === id) ?? null,
}));

const statsWithData = {
  enrolled: 8,
  newThisWeek: 2,
  visitsTotal: 40,
  visits30d: 15,
  visitsByDay: [{ date: "2026-07-10", count: 3 }],
  rewardsTotal: 4,
  rewards30d: 2,
  redemptionRate: 0.5,
  repeatVisitRate: 0.75,
  active: 6,
  lapsed: 2,
  avgVisitsPerCustomer: 5,
  visitsDelta: 10,
  rewardsDelta: -5,
  activeDelta: null,
  avgDaysBetweenVisits: 3.2,
};

vi.mock("@/lib/stats", () => ({
  getVendorStats: vi.fn(async () => statsWithData),
  getProgramStats: vi.fn(async () => statsWithData),
}));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

import StatsPage from "./page";

describe("StatsPage", () => {
  it("renders vendor-wide stats tiles and the visits chart when no program is selected", async () => {
    render(await StatsPage({ searchParams: Promise.resolve({}) }));
    expect(screen.getByText("Stats")).toBeInTheDocument();
    expect(screen.getByText("8")).toBeInTheDocument();
    expect(screen.getByText("Last 30 days")).toBeInTheDocument();
  });

  it("renders program-scoped stats tiles when ?p= is set", async () => {
    render(await StatsPage({ searchParams: Promise.resolve({ p: "p1" }) }));
    expect(
      screen.getByText(/how coffee stamps is performing/i),
    ).toBeInTheDocument();
    expect(screen.getByText("Last 30 days")).toBeInTheDocument();
  });

  it("shows an empty state when the shop has no enrolled customers yet", async () => {
    const { getVendorStats } = await import("@/lib/stats");
    vi.mocked(getVendorStats).mockResolvedValueOnce({
      ...statsWithData,
      enrolled: 0,
    });
    render(await StatsPage({ searchParams: Promise.resolve({}) }));
    expect(
      screen.getByText(/share your qr from the counter page/i),
    ).toBeInTheDocument();
  });
});
