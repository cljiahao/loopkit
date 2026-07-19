// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { Program } from "@/lib/program";

const { listProgramsMock, isProMock } = vi.hoisted(() => ({
  listProgramsMock: vi.fn(),
  isProMock: vi.fn(),
}));

vi.mock("@/features/auth", () => ({
  requireVendor: vi.fn(async () => ({ user: { id: "v1", email: "v@x.com" } })),
}));
vi.mock("@/lib/program", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/program")>();
  return {
    ...actual,
    listPrograms: listProgramsMock,
    isPro: isProMock,
    applyDueCutovers: vi.fn(async () => {}),
  };
});
vi.mock("@/lib/supabase/server", () => ({
  createServerClient: vi.fn(async () => ({})),
}));
vi.mock("@/lib/merqo-vendor-profile", () => ({
  getOrCreateVendorProfile: vi.fn(async () => ({
    vendor_id: "v1",
    stall_name: "Test Stall",
    social_links: {},
    created_at: "",
    updated_at: "",
  })),
}));
vi.mock("@/lib/vendor", () => ({
  getVendorProfile: vi.fn(async () => ({ name: "Test Vendor" })),
}));
vi.mock("@/app/setup/actions", () => ({
  activateProgramAction: vi.fn(),
}));
vi.mock("@/app/setup/setup-form", () => ({
  SetupForm: ({ isEdit }: { isEdit: boolean }) => (
    <div data-testid="setup-form">{isEdit ? "edit-mode" : "create-mode"}</div>
  ),
}));
vi.mock("@/app/setup/schedule-retirement-form", () => ({
  ScheduleRetirementForm: ({ program }: { program: { name: string } }) => (
    <div data-testid="schedule-form">{program.name}</div>
  ),
}));

import SetupPage from "./page";

function program(overrides: Partial<Program>): Program {
  return {
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
    ...overrides,
  };
}

describe("SetupPage", () => {
  it("shows the create form and a Manage-programs link when a Pro vendor with an existing program visits bare /setup", async () => {
    listProgramsMock.mockResolvedValue([program({})]);
    isProMock.mockResolvedValue(true);

    render(await SetupPage({ searchParams: Promise.resolve({}) }));

    expect(
      screen.getByRole("heading", { level: 1, name: "Create a program" }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("setup-form")).toHaveTextContent("create-mode");
    expect(
      screen.getByRole("link", { name: /manage your programs/i }),
    ).toHaveAttribute("href", "/setup?manage=1");
  });

  it("shows the upsell card (not the create form) and still shows a Manage-programs link for a free-tier vendor at their cap", async () => {
    listProgramsMock.mockResolvedValue([program({})]);
    isProMock.mockResolvedValue(false);

    render(await SetupPage({ searchParams: Promise.resolve({}) }));

    expect(
      screen.getByRole("heading", { level: 1, name: "Free plan: 1 program" }),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("setup-form")).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /manage your programs/i }),
    ).toHaveAttribute("href", "/setup?manage=1");
  });

  it("shows only the create form (no upsell, no Manage link) for a first-run vendor with zero programs", async () => {
    listProgramsMock.mockResolvedValue([]);
    isProMock.mockResolvedValue(false);

    render(await SetupPage({ searchParams: Promise.resolve({}) }));

    expect(screen.getByText("Set up your loyalty card")).toBeInTheDocument();
    expect(screen.getByTestId("setup-form")).toHaveTextContent("create-mode");
    expect(
      screen.queryByRole("link", { name: /manage your programs/i }),
    ).not.toBeInTheDocument();
  });

  it("shows only the management list (not the create form) at /setup?manage=1, with a + New program link", async () => {
    listProgramsMock.mockResolvedValue([program({})]);
    isProMock.mockResolvedValue(true);

    render(await SetupPage({ searchParams: Promise.resolve({ manage: "1" }) }));

    expect(screen.getByText("Your programs")).toBeInTheDocument();
    expect(screen.getByText("Coffee Stamps")).toBeInTheDocument();
    expect(screen.queryByTestId("setup-form")).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /\+ new program/i }),
    ).toHaveAttribute("href", "/setup");
  });

  it("shows only the edit form (not the list) at /setup?edit=<id>", async () => {
    listProgramsMock.mockResolvedValue([program({})]);
    isProMock.mockResolvedValue(true);

    render(await SetupPage({ searchParams: Promise.resolve({ edit: "p1" }) }));

    expect(
      screen.getByRole("heading", { level: 1, name: "Edit your card" }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("setup-form")).toHaveTextContent("edit-mode");
    expect(screen.queryByText("Your programs")).not.toBeInTheDocument();
  });

  it("shows only the prep form (not the list) at /setup?prep=<id>", async () => {
    listProgramsMock.mockResolvedValue([program({})]);
    isProMock.mockResolvedValue(false);

    render(await SetupPage({ searchParams: Promise.resolve({ prep: "p1" }) }));

    expect(screen.getByText("Set up the replacement")).toBeInTheDocument();
    expect(screen.queryByText("Your programs")).not.toBeInTheDocument();
  });

  it("shows the schedule form (not the create form) at /setup?schedule=<id> for a Pro vendor — regression test for the fix where canCreate made schedule unreachable", async () => {
    listProgramsMock.mockResolvedValue([
      program({ id: "p1", name: "Coffee Stamps" }),
      program({ id: "p2", name: "Bakery Stamps" }),
    ]);
    isProMock.mockResolvedValue(true);

    render(
      await SetupPage({ searchParams: Promise.resolve({ schedule: "p1" }) }),
    );

    expect(screen.getByText("Schedule retirement")).toBeInTheDocument();
    expect(screen.getByTestId("schedule-form")).toHaveTextContent(
      "Coffee Stamps",
    );
    expect(screen.queryByTestId("setup-form")).not.toBeInTheDocument();
  });

  it("shows only the migrate form (not the list) at /setup?migrate=<id>", async () => {
    listProgramsMock.mockResolvedValue([program({})]);
    isProMock.mockResolvedValue(true);

    render(
      await SetupPage({ searchParams: Promise.resolve({ migrate: "p1" }) }),
    );

    expect(screen.getByText("Pick a new card type")).toBeInTheDocument();
    expect(screen.getByTestId("setup-form")).toHaveTextContent("create-mode");
    expect(screen.queryByText("Your programs")).not.toBeInTheDocument();
  });
});
