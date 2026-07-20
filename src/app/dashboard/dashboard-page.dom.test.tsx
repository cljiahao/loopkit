// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/features/auth", () => ({
  requireVendor: vi.fn(async () => ({ user: { id: "v1", email: "v@x.com" } })),
}));
vi.mock("@/lib/program", () => ({
  listPrograms: vi.fn(async () => [
    {
      id: "p1",
      name: "Coffee Stamps",
      type: "stamp",
      active: true,
      stamps_required: 10,
      reward_text: "Free coffee",
      config: {},
      expiry_days: null,
      head_start: false,
      head_start_percent: 20,
      replaced_by: null,
      carry_over_stamps: false,
    },
  ]),
  isPro: vi.fn(async () => false),
  canCreateProgram: vi.fn(() => true),
  getEntitlement: vi.fn(() => ({ tier: "free" })),
  applyDueCutovers: vi.fn(async () => {}),
}));
vi.mock("@/lib/qr", () => ({ qrSvg: vi.fn(async () => "<svg></svg>") }));
vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Map([["host", "example.com"]])),
}));
vi.mock("@/app/dashboard/program-card", () => ({
  ProgramCard: ({ program }: { program: { name: string } }) => (
    <div>{program.name}</div>
  ),
}));
vi.mock("@/app/dashboard/new-program-tile", () => ({
  NewProgramTile: () => <div>New program tile</div>,
}));
vi.mock("@/app/dashboard/shop-qr-block", () => ({
  ShopQrBlock: () => <div>Shop QR block</div>,
}));
vi.mock("@/app/dashboard/scan-and-route", () => ({
  ScanAndRoute: () => <div>Scan and route</div>,
}));

import DashboardPage from "./page";

describe("DashboardPage", () => {
  it("shows a 'Your programs' heading above the program grid", async () => {
    render(await DashboardPage());

    expect(
      screen.getByRole("heading", { name: "Your programs" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Coffee Stamps")).toBeInTheDocument();
    expect(screen.getByText("Shop QR block")).toBeInTheDocument();
    expect(screen.getByText("Scan and route")).toBeInTheDocument();
  });
});
