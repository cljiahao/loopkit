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

describe("SetupForm type picker", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows a single flat grid of all six types with no template/custom toggle", () => {
    render(
      <SetupForm
        program={null}
        isEdit={false}
        replacingId={null}
        replacingType={null}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Stamp card" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Lucky Tap" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sprout" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Spin the Wheel" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Scratch Card" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Flame Club" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Custom — start from scratch"),
    ).not.toBeInTheDocument();
  });

  it("resets name and reward to blank when a new type is picked", async () => {
    const user = userEvent.setup();
    render(
      <SetupForm
        program={null}
        isEdit={false}
        replacingId={null}
        replacingType={null}
      />,
    );
    await user.type(screen.getByLabelText("Card name"), "My card");
    await user.type(screen.getByLabelText("Reward"), "Free item");

    await user.click(screen.getByRole("button", { name: "Flame Club" }));

    expect(screen.getByLabelText("Card name")).toHaveValue("");
    expect(screen.getByLabelText("Reward")).toHaveValue("");
  });

  it("Flame Club tile saves type=stamp with variant=flame and the flame-specific label", async () => {
    const user = userEvent.setup();
    render(
      <SetupForm
        program={null}
        isEdit={false}
        replacingId={null}
        replacingType={null}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Flame Club" }));
    expect(screen.getByText("Visits for full blaze")).toBeInTheDocument();

    await user.type(screen.getByLabelText("Card name"), "Coffee card");
    await user.type(screen.getByLabelText("Reward"), "Free kopi");
    await user.click(screen.getByRole("button", { name: "Create card" }));

    expect(saveMock).toHaveBeenCalled();
    const submitted = saveMock.mock.calls[0][1] as FormData;
    expect(submitted.get("type")).toBe("stamp");
    expect(submitted.get("variant")).toBe("flame");
  });

  it("Fill the Cup tile saves type=plant with variant=cup and the fill-specific label", async () => {
    const user = userEvent.setup();
    render(
      <SetupForm
        program={null}
        isEdit={false}
        replacingId={null}
        replacingType={null}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Fill the Cup" }));
    expect(screen.getByText("Visits to fill")).toBeInTheDocument();

    await user.type(screen.getByLabelText("Card name"), "Fill-a-kopi");
    await user.type(screen.getByLabelText("Reward"), "Free kopi");
    await user.click(screen.getByRole("button", { name: "Create card" }));

    expect(saveMock).toHaveBeenCalled();
    const submitted = saveMock.mock.calls[0][1] as FormData;
    expect(submitted.get("type")).toBe("plant");
    expect(submitted.get("variant")).toBe("cup");
  });

  it("Sprout tile still saves type=plant with variant=plant and the bloom-specific label", async () => {
    const user = userEvent.setup();
    render(
      <SetupForm
        program={null}
        isEdit={false}
        replacingId={null}
        replacingType={null}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Sprout" }));
    expect(screen.getByText("Visits to bloom")).toBeInTheDocument();

    await user.type(screen.getByLabelText("Card name"), "Grow-a-kopi");
    await user.type(screen.getByLabelText("Reward"), "Free kopi");
    await user.click(screen.getByRole("button", { name: "Create card" }));

    expect(saveMock).toHaveBeenCalled();
    const submitted = saveMock.mock.calls[0][1] as FormData;
    expect(submitted.get("type")).toBe("plant");
    expect(submitted.get("variant")).toBe("plant");
  });

  it("stamp quick-pick chips set stamps required", async () => {
    const user = userEvent.setup();
    render(
      <SetupForm
        program={null}
        isEdit={false}
        replacingId={null}
        replacingType={null}
      />,
    );
    await user.click(screen.getByRole("button", { name: "15" }));
    expect(screen.getByLabelText("Stamps required")).toHaveValue(15);
    expect(screen.getByText("0/15 stamps")).toBeInTheDocument();
  });

  it("shows the type-picker heading and both card-details cards", () => {
    render(
      <SetupForm
        program={null}
        isEdit={false}
        replacingId={null}
        replacingType={null}
      />,
    );
    expect(screen.getByText("Choose a card type")).toBeInTheDocument();
    expect(screen.getByText("Basics")).toBeInTheDocument();
    expect(screen.getByText("Rules")).toBeInTheDocument();
  });

  it("edit mode shows the locked type label and preview together, no type grid", () => {
    render(
      <SetupForm
        program={
          {
            id: "p1",
            name: "Coffee card",
            stamps_required: 10,
            reward_text: "Free kopi",
            type: "stamp",
            config: {},
            active: true,
            head_start: false,
            replaced_by: null,
            carry_over_stamps: false,
          } as never
        }
        isEdit
        replacingId={null}
        replacingType={null}
      />,
    );
    expect(screen.getByText("Stamp card")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Lucky Tap" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("0/10 stamps")).toBeInTheDocument();
  });

  it("shows the head-start percent input only for stamp/plant with the toggle on, and submits it", async () => {
    const user = userEvent.setup();
    render(
      <SetupForm
        program={null}
        isEdit={false}
        replacingId={null}
        replacingType={null}
      />,
    );
    expect(
      screen.queryByLabelText("Head start amount"),
    ).not.toBeInTheDocument();

    await user.click(screen.getByLabelText(/give new customers a head start/i));
    const percentInput = screen.getByLabelText("Head start amount");
    expect(percentInput).toHaveValue(20);

    await user.clear(percentInput);
    await user.type(percentInput, "35");
    await user.type(screen.getByLabelText("Card name"), "Coffee card");
    await user.type(screen.getByLabelText("Reward"), "Free kopi");
    await user.click(screen.getByRole("button", { name: "Create card" }));

    expect(saveMock).toHaveBeenCalled();
    const submitted = saveMock.mock.calls[0][1] as FormData;
    expect(submitted.get("head_start_percent")).toBe("35");
  });
});
