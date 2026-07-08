// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { stampMock, recordVisitMock, lookupMock, redeemPlantMock } = vi.hoisted(
  () => ({
    stampMock: vi.fn(),
    recordVisitMock: vi.fn(),
    lookupMock: vi.fn(),
    redeemPlantMock: vi.fn(),
  }),
);
vi.mock("@/app/dashboard/actions", () => ({
  stampAction: stampMock,
  recordVisitAction: recordVisitMock,
  lookupAction: lookupMock,
  redeemPlantAction: redeemPlantMock,
  redeemAction: vi.fn(),
  resolveTokenAction: vi.fn(),
}));

const { toast, toastSuccess, toastError } = vi.hoisted(() => {
  const success = vi.fn();
  const error = vi.fn();
  const fn = Object.assign(vi.fn(), { success, error });
  return { toast: fn, toastSuccess: success, toastError: error };
});
vi.mock("sonner", () => ({ toast }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

import { ServeCustomer } from "@/app/dashboard/serve-customer";

describe("ServeCustomer", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders the phone input, primary action, and Look up", () => {
    render(
      <ServeCustomer
        programId="p1"
        type="stamp"
        stampsRequired={10}
        rewardText="Free kopi"
      />,
    );
    expect(screen.getByLabelText("Customer phone")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Add stamp" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Look up" })).toBeInTheDocument();
  });

  it("stamps, toasts, shows the card, and clears the input", async () => {
    stampMock.mockResolvedValue({
      success: true,
      card: { id: "card-1", phone: "+6591234567", stamp_count: 3 },
      rewardReady: false,
    });
    const user = userEvent.setup();
    render(
      <ServeCustomer
        programId="p1"
        type="stamp"
        stampsRequired={10}
        rewardText="Free kopi"
      />,
    );
    const input = screen.getByLabelText("Customer phone") as HTMLInputElement;
    await user.type(input, "91234567");
    await user.click(screen.getByRole("button", { name: "Add stamp" }));

    await waitFor(() => expect(stampMock).toHaveBeenCalled());
    expect(toastSuccess).toHaveBeenCalled();
    expect(screen.getByText("+6591234567")).toBeInTheDocument();
    expect(input.value).toBe("");
  });

  it("surfaces a Redeem button once the stamped card is full", async () => {
    stampMock.mockResolvedValue({
      success: true,
      card: { id: "card-1", phone: "+6591234567", stamp_count: 10 },
      rewardReady: true,
    });
    const user = userEvent.setup();
    render(
      <ServeCustomer
        programId="p1"
        type="stamp"
        stampsRequired={10}
        rewardText="Free kopi"
      />,
    );
    await user.type(screen.getByLabelText("Customer phone"), "91234567");
    await user.click(screen.getByRole("button", { name: "Add stamp" }));

    await waitFor(() =>
      expect(screen.getByText("Reward ready!")).toBeInTheDocument(),
    );
    expect(
      screen.getByRole("heading", { name: "🎉 Reward unlocked!" }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Nice!" }));

    expect(screen.getByRole("button", { name: "Redeem" })).toBeInTheDocument();
  });

  it("toasts an error and shows no card on failure", async () => {
    stampMock.mockResolvedValue({ success: false, error: "Bad number." });
    const user = userEvent.setup();
    render(
      <ServeCustomer
        programId="p1"
        type="stamp"
        stampsRequired={10}
        rewardText="Free kopi"
      />,
    );
    await user.type(screen.getByLabelText("Customer phone"), "91234567");
    await user.click(screen.getByRole("button", { name: "Add stamp" }));

    await waitFor(() => expect(toastError).toHaveBeenCalledWith("Bad number."));
    expect(screen.queryByText("Reward ready!")).not.toBeInTheDocument();
  });

  it("looks up a card without mutating and shares the same result card", async () => {
    lookupMock.mockResolvedValue({
      success: true,
      card: { id: "card-1", phone: "+6591234567", stamp_count: 10 },
      progress: {
        view: { kind: "dots", filled: 10, total: 10 },
        label: "10/10 stamps",
        rewardReady: true,
      },
    });
    const user = userEvent.setup();
    render(
      <ServeCustomer
        programId="p1"
        type="stamp"
        stampsRequired={10}
        rewardText="Free kopi"
      />,
    );
    await user.type(screen.getByLabelText("Customer phone"), "91234567");
    await user.click(screen.getByRole("button", { name: "Look up" }));

    await waitFor(() => expect(lookupMock).toHaveBeenCalled());
    expect(stampMock).not.toHaveBeenCalled();
    expect(screen.getByText("Reward ready!")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Redeem" })).toBeInTheDocument();
  });

  it("labels the primary action per type", () => {
    const { rerender } = render(
      <ServeCustomer
        programId="p1"
        type="lucky"
        stampsRequired={5}
        rewardText="A prize"
      />,
    );
    expect(screen.getByRole("button", { name: "Play" })).toBeInTheDocument();
    rerender(
      <ServeCustomer
        programId="p1"
        type="plant"
        stampsRequired={8}
        rewardText="A bloom"
      />,
    );
    expect(screen.getByRole("button", { name: "Water" })).toBeInTheDocument();
  });

  it("plays a lucky round and shows the win state", async () => {
    recordVisitMock.mockResolvedValue({
      success: true,
      rewardUnlocked: true,
      reward_text: "A prize",
      phone: "+6591234567",
      progress: { view: { kind: "dots", filled: 0, total: 5 }, label: "" },
    });
    const user = userEvent.setup();
    render(
      <ServeCustomer
        programId="p1"
        type="lucky"
        stampsRequired={5}
        rewardText="A prize"
      />,
    );
    await user.type(screen.getByLabelText("Customer phone"), "91234567");
    await user.click(screen.getByRole("button", { name: "Play" }));

    await waitFor(() => expect(recordVisitMock).toHaveBeenCalled());
    expect(screen.getByText("🎉 Won A prize!")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "🎉 Reward unlocked!" }),
    ).toBeInTheDocument();
  });

  it("does not celebrate a lucky round with no win", async () => {
    recordVisitMock.mockResolvedValue({
      success: true,
      rewardUnlocked: false,
      reward_text: "A prize",
      phone: "+6591234567",
      progress: { view: { kind: "dots", filled: 0, total: 5 }, label: "" },
    });
    const user = userEvent.setup();
    render(
      <ServeCustomer
        programId="p1"
        type="lucky"
        stampsRequired={5}
        rewardText="A prize"
      />,
    );
    await user.type(screen.getByLabelText("Customer phone"), "91234567");
    await user.click(screen.getByRole("button", { name: "Play" }));

    await waitFor(() => expect(recordVisitMock).toHaveBeenCalled());
    expect(
      screen.queryByRole("heading", { name: "🎉 Reward unlocked!" }),
    ).not.toBeInTheDocument();
  });
});
