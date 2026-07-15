// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { redirect } from "next/navigation";

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
    {
      id: "p2",
      name: "Bakery Stamps",
      type: "stamp",
      stamps_required: 10,
      reward_text: "a free pastry",
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
  // Mirrors Next.js's real redirect(): it throws to halt render, so callers
  // that don't expect a return value (like CounterPage) stop executing right
  // after calling it instead of falling through and crashing on a null program.
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));
vi.mock("@/app/dashboard/actions", () => ({
  stampAction: vi.fn(),
  recordVisitAction: vi.fn(),
  lookupAction: vi.fn(),
  redeemPlantAction: vi.fn(),
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

  it("redirects to /dashboard when ?p= is missing", async () => {
    await expect(
      CounterPage({ searchParams: Promise.resolve({}) }),
    ).rejects.toThrow("REDIRECT:/dashboard");
    expect(redirect).toHaveBeenCalledWith("/dashboard");
  });

  it("redirects to /dashboard when ?p= doesn't match any program", async () => {
    await expect(
      CounterPage({ searchParams: Promise.resolve({ p: "does-not-exist" }) }),
    ).rejects.toThrow("REDIRECT:/dashboard");
    expect(redirect).toHaveBeenCalledWith("/dashboard");
  });

  it("remounts ServeCustomer (re-applies phone pre-fill) when the resolved program changes on the same route", async () => {
    const { rerender } = render(
      await CounterPage({
        searchParams: Promise.resolve({ p: "p1", phone: "+6591234567" }),
      }),
    );
    expect(screen.getByText("Coffee Stamps")).toBeInTheDocument();
    expect(screen.getByLabelText("Customer phone")).toHaveValue("+6591234567");

    // Simulates a scan of a card from a different program while already on
    // the Counter page: same route, only searchParams change. Without a
    // `key` on ServeCustomer, React would reconcile the existing fiber and
    // the uncontrolled phone input's stale defaultValue would linger.
    rerender(
      await CounterPage({
        searchParams: Promise.resolve({ p: "p2", phone: "+6598765432" }),
      }),
    );
    expect(screen.getByText("Bakery Stamps")).toBeInTheDocument();
    expect(screen.getByLabelText("Customer phone")).toHaveValue("+6598765432");
  });
});
