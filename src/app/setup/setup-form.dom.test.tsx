// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { saveMock } = vi.hoisted(() => ({
  saveMock: vi.fn().mockResolvedValue({}),
}));
vi.mock("@/app/setup/actions", () => ({
  saveProgramAction: saveMock,
  changeTypeAction: vi.fn().mockResolvedValue({}),
  prepProgramAction: vi.fn().mockResolvedValue({}),
}));

import { SetupForm } from "@/app/setup/setup-form";

describe("SetupForm live preview", () => {
  beforeEach(() => vi.clearAllMocks());

  it("updates the preview on every keystroke", async () => {
    const user = userEvent.setup();
    render(
      <SetupForm
        program={null}
        isEdit={false}
        replacingId={null}
        replacingType={null}
      />,
    );
    expect(screen.getByText("0/10 stamps")).toBeInTheDocument();

    const stampsInput = screen.getByLabelText("Stamps required");
    await user.clear(stampsInput);
    await user.type(stampsInput, "5");

    expect(screen.getByText("0/5 stamps")).toBeInTheDocument();
  });

  it("reflects head-start seeding in the preview when the toggle is on", async () => {
    const user = userEvent.setup();
    render(
      <SetupForm
        program={null}
        isEdit={false}
        replacingId={null}
        replacingType={null}
      />,
    );
    await user.click(screen.getByLabelText(/give new customers a head start/i));
    expect(screen.getByText("2/10 stamps")).toBeInTheDocument();
  });

  it("still submits the edited controlled field values", async () => {
    const user = userEvent.setup();
    render(
      <SetupForm
        program={null}
        isEdit={false}
        replacingId={null}
        replacingType={null}
      />,
    );
    await user.type(screen.getByLabelText("Card name"), "Coffee card");
    await user.type(screen.getByLabelText("Reward"), "Free kopi");
    await user.click(screen.getByRole("button", { name: "Create card" }));

    expect(saveMock).toHaveBeenCalled();
    const submitted = saveMock.mock.calls[0][1] as FormData;
    expect(submitted.get("name")).toBe("Coffee card");
    expect(submitted.get("reward_text")).toBe("Free kopi");
    expect(submitted.get("stamps_required")).toBe("10");
  });
});
