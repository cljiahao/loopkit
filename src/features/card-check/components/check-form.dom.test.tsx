// @vitest-environment jsdom
// src/features/card-check/components/check-form.dom.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { checkStatusActionMock } = vi.hoisted(() => ({
  checkStatusActionMock: vi.fn(),
}));

vi.mock("../api/actions", () => ({
  checkStatusAction: checkStatusActionMock,
}));

import { CheckForm } from "./check-form";
import { STATUS_IDLE } from "../types";

describe("CheckForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the phone input and submit button with the vendor id in a hidden field", () => {
    const { container } = render(<CheckForm vendorId="v1" />);
    expect(screen.getByLabelText("Your phone number")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Check my card" }),
    ).toBeInTheDocument();
    const hidden = container.querySelector('input[name="vendor"]');
    expect(hidden).toHaveValue("v1");
  });

  it("submits the phone and vendor id, then renders a ProgramCardStatus per returned card", async () => {
    checkStatusActionMock.mockResolvedValue({
      status: "found",
      phone: "+6591234567",
      cards: [
        {
          programId: "p1",
          name: "Kaya Toast Co.",
          label: "3/10 stamps",
          view: { kind: "dots", filled: 3, total: 10, variant: "dots" },
          rewardReady: false,
          reward_text: "Free kopi",
          qr: "",
          expired: false,
          active: true,
          replacedByName: null,
          carriedOverCount: null,
        },
      ],
    });
    const user = userEvent.setup();
    render(<CheckForm vendorId="v1" />);
    await user.type(screen.getByLabelText("Your phone number"), "91234567");
    await user.click(screen.getByRole("button", { name: "Check my card" }));

    expect(await screen.findByText("Kaya Toast Co.")).toBeInTheDocument();
    expect(checkStatusActionMock).toHaveBeenCalledWith(
      STATUS_IDLE,
      expect.any(FormData),
    );
  });

  it("shows a role=alert message when the action returns an error", async () => {
    checkStatusActionMock.mockResolvedValue({
      status: "error",
      message: "Enter a valid Singapore phone number.",
    });
    const user = userEvent.setup();
    render(<CheckForm vendorId="v1" />);
    await user.type(screen.getByLabelText("Your phone number"), "123");
    await user.click(screen.getByRole("button", { name: "Check my card" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Enter a valid Singapore phone number.",
    );
  });

  it("shows a role=alert message when the action finds nothing", async () => {
    checkStatusActionMock.mockResolvedValue({
      status: "none",
      message: "We couldn't find any rewards here.",
    });
    const user = userEvent.setup();
    render(<CheckForm vendorId="v1" />);
    await user.type(screen.getByLabelText("Your phone number"), "91234567");
    await user.click(screen.getByRole("button", { name: "Check my card" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "We couldn't find any rewards here.",
    );
  });
});
