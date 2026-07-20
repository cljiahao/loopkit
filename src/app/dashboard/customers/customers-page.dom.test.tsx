// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { VendorCustomerRow } from "@/lib/customers";

vi.mock("@/features/auth", () => ({ requireVendor: vi.fn(async () => ({})) }));
vi.mock("@/lib/customers", () => ({
  listVendorCustomers: vi.fn(async () => []),
}));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const program = { id: "p1", name: "Coffee Stamps", type: "stamp" };

vi.mock("@/lib/program", () => ({
  listPrograms: vi.fn(async () => [program]),
  currentProgram: (progs: { id: string }[], id?: string) =>
    progs.find((p) => p.id === id) ?? null,
}));
vi.mock("@/lib/cards", () => ({ listCards: vi.fn(async () => []) }));
vi.mock("@/lib/engine", () => ({
  getProgress: vi.fn(() => ({ label: "3/8 stamps" })),
}));

import CustomersPage, { VendorCustomerList } from "./page";

const customers: VendorCustomerRow[] = [
  {
    phone: "+6591234567",
    name: "Jane",
    programNames: ["Coffee Stamps", "Lucky Tap"],
    totalStamps: 8,
    totalRewards: 1,
    lastSeenAt: "2026-07-10T00:00:00Z",
  },
];

describe("VendorCustomerList", () => {
  it("renders a customer's name, phone, program badges, and totals", () => {
    render(<VendorCustomerList customers={customers} />);
    expect(screen.getByText("Jane")).toBeInTheDocument();
    expect(screen.getByText("+6591234567")).toBeInTheDocument();
    expect(screen.getByText("Coffee Stamps")).toBeInTheDocument();
    expect(screen.getByText("Lucky Tap")).toBeInTheDocument();
    expect(screen.getByText(/8/)).toBeInTheDocument();
  });

  it("falls back to phone-only when name is null", () => {
    const noName: VendorCustomerRow[] = [{ ...customers[0], name: null }];
    render(<VendorCustomerList customers={noName} />);
    expect(screen.getByText("+6591234567")).toBeInTheDocument();
  });

  it("shows an empty state with zero customers", () => {
    render(<VendorCustomerList customers={[]} />);
    expect(screen.getByText(/no customers yet/i)).toBeInTheDocument();
  });
});

describe("CustomersPage (program-scoped)", () => {
  it("shows an empty state when the program has no cards yet", async () => {
    render(await CustomersPage({ searchParams: Promise.resolve({ p: "p1" }) }));
    expect(screen.getByText(/no customers yet/i)).toBeInTheDocument();
  });

  it("renders each card's phone, progress, and last-updated date", async () => {
    const { listCards } = await import("@/lib/cards");
    vi.mocked(listCards).mockResolvedValueOnce([
      {
        id: "c1",
        phone: "+6591234567",
        stamp_count: 3,
        reward_count: 0,
        state: {},
        updated_at: "2026-07-10T00:00:00Z",
      },
    ]);
    render(await CustomersPage({ searchParams: Promise.resolve({ p: "p1" }) }));
    expect(screen.getByText("+6591234567")).toBeInTheDocument();
    expect(screen.getByText("3/8 stamps")).toBeInTheDocument();
  });
});
