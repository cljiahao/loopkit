// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { stampMock } = vi.hoisted(() => ({ stampMock: vi.fn() }));
vi.mock("@/app/dashboard/actions", () => ({
  stampAction: stampMock,
  redeemAction: vi.fn(),
  lookupAction: vi.fn(),
}));

const { toastSuccess, toastError } = vi.hoisted(() => ({
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));
vi.mock("sonner", () => ({
  toast: { success: toastSuccess, error: toastError },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

import { StampForm } from "@/app/dashboard/stamp-form";

describe("StampForm", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders the phone input and Add stamp button", () => {
    render(<StampForm programId="prog-1" stampsRequired={10} />);
    expect(screen.getByLabelText("Customer phone")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Add stamp" }),
    ).toBeInTheDocument();
  });

  it("stamps, toasts, shows the card, and clears the input", async () => {
    stampMock.mockResolvedValue({
      success: true,
      card: { id: "card-1", phone: "+6591234567", stamp_count: 3 },
      rewardReady: false,
    });
    const user = userEvent.setup();
    render(<StampForm programId="prog-1" stampsRequired={10} />);
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
    render(<StampForm programId="prog-1" stampsRequired={10} />);
    await user.type(screen.getByLabelText("Customer phone"), "91234567");
    await user.click(screen.getByRole("button", { name: "Add stamp" }));

    await waitFor(() =>
      expect(screen.getByText("Reward ready!")).toBeInTheDocument(),
    );
    expect(screen.getByRole("button", { name: "Redeem" })).toBeInTheDocument();
  });

  it("toasts an error and shows no card on failure", async () => {
    stampMock.mockResolvedValue({ success: false, error: "Bad number." });
    const user = userEvent.setup();
    render(<StampForm programId="prog-1" stampsRequired={10} />);
    await user.type(screen.getByLabelText("Customer phone"), "91234567");
    await user.click(screen.getByRole("button", { name: "Add stamp" }));

    await waitFor(() => expect(toastError).toHaveBeenCalledWith("Bad number."));
    expect(screen.queryByText("Reward ready!")).not.toBeInTheDocument();
  });
});
