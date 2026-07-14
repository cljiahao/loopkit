// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/lib/auth", () => ({ requireVendor: vi.fn(async () => ({})) }));
vi.mock("@/lib/program", () => ({
  listPrograms: vi.fn(async () => [
    {
      id: "p1",
      name: "Coffee Stamps",
      type: "stamp",
      stamps_required: 8,
      reward_text: "a free coffee",
      config: {},
      active: true,
      expiry_days: null,
      head_start: false,
      replaced_by: null,
      carry_over_stamps: false,
    },
  ]),
  currentProgram: (programs: { id: string }[], id?: string) =>
    programs.find((p) => p.id === id) ?? null,
}));
vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));
vi.mock("@/app/dashboard/actions", () => ({
  stampAction: vi.fn(),
  recordVisitAction: vi.fn(),
  lookupAction: vi.fn(),
  redeemPlantAction: vi.fn(),
  redeemStreakAction: vi.fn(),
  regenerateCardAction: vi.fn(),
  resolveTokenAction: vi.fn(),
}));

import CounterPage from "./page";

describe("CounterPage", () => {
  it("renders the back button, program header, and phone pre-fill", async () => {
    render(
      await CounterPage({
        searchParams: Promise.resolve({ p: "p1", phone: "+6591234567" }),
      }),
    );
    expect(
      screen.getByRole("link", { name: /back to dashboard/i }),
    ).toHaveAttribute("href", "/dashboard");
    expect(screen.getByText("Coffee Stamps")).toBeInTheDocument();
    expect(screen.getByLabelText("Customer phone")).toHaveValue("+6591234567");
  });
});
