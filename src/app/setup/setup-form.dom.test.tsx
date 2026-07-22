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
    expect(screen.getAllByText("0/10 stamps")[0]).toBeInTheDocument();

    const stampsInput = screen.getByLabelText("Stamps required");
    await user.clear(stampsInput);
    await user.type(stampsInput, "5");

    expect(screen.getAllByText("0/5 stamps")[0]).toBeInTheDocument();
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
    expect(screen.getAllByText("2/10 stamps")[0]).toBeInTheDocument();
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

  it("shows the 4 family tiles on Step 1, no flat 8-tile grid", () => {
    render(
      <SetupForm
        program={null}
        isEdit={false}
        replacingId={null}
        replacingType={null}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Stamp Card" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sprout" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Chance Card" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Lucky Tap" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Flame Club" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Spin the Wheel" }),
    ).not.toBeInTheDocument();
  });

  it("clicking a multi-style family shows its styles and a Back link", async () => {
    const user = userEvent.setup();
    render(
      <SetupForm
        program={null}
        isEdit={false}
        replacingId={null}
        replacingType={null}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Stamp Card" }));

    expect(
      screen.getByRole("button", { name: "Flame Club" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Points Club" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Classic" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "← Back" })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Stamp Card" }),
    ).not.toBeInTheDocument();
  });

  it("clicking Back returns to the 4 family tiles", async () => {
    const user = userEvent.setup();
    render(
      <SetupForm
        program={null}
        isEdit={false}
        replacingId={null}
        replacingType={null}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Stamp Card" }));
    await user.click(screen.getByRole("button", { name: "← Back" }));

    expect(
      screen.getByRole("button", { name: "Stamp Card" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sprout" })).toBeInTheDocument();
  });

  it("clicking Lucky Tap completes selection immediately, with no Step 2", async () => {
    const user = userEvent.setup();
    render(
      <SetupForm
        program={null}
        isEdit={false}
        replacingId={null}
        replacingType={null}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Lucky Tap" }));

    expect(
      screen.queryByRole("button", { name: "← Back" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText(/reward expires after/i),
    ).not.toBeInTheDocument();
  });

  it("resets name and reward to blank when a new style is picked", async () => {
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

    await user.click(screen.getByRole("button", { name: "Stamp Card" }));
    await user.click(screen.getByRole("button", { name: "Flame Club" }));

    expect(screen.getByLabelText("Card name")).toHaveValue("");
    expect(screen.getByLabelText("Reward")).toHaveValue("");
  });

  it("Flame Club style saves type=stamp with variant=flame and the flame-specific label", async () => {
    const user = userEvent.setup();
    render(
      <SetupForm
        program={null}
        isEdit={false}
        replacingId={null}
        replacingType={null}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Stamp Card" }));
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

  it("Points Club style saves type=stamp with variant=points, wider range, and points_per_visit", async () => {
    const user = userEvent.setup();
    render(
      <SetupForm
        program={null}
        isEdit={false}
        replacingId={null}
        replacingType={null}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Stamp Card" }));
    await user.click(screen.getByRole("button", { name: "Points Club" }));
    expect(screen.getByText("Points required")).toBeInTheDocument();
    expect(screen.getByLabelText("Points per visit")).toBeInTheDocument();

    const stampsInput = screen.getByLabelText("Points required");
    await user.clear(stampsInput);
    await user.type(stampsInput, "500");

    const perVisitInput = screen.getByLabelText("Points per visit");
    await user.clear(perVisitInput);
    await user.type(perVisitInput, "20");

    await user.type(screen.getByLabelText("Card name"), "Coffee Points");
    await user.type(screen.getByLabelText("Reward"), "Free drink");
    await user.click(screen.getByRole("button", { name: "Create card" }));

    expect(saveMock).toHaveBeenCalled();
    const submitted = saveMock.mock.calls[0][1] as FormData;
    expect(submitted.get("type")).toBe("stamp");
    expect(submitted.get("variant")).toBe("points");
    expect(submitted.get("stamps_required")).toBe("500");
    expect(submitted.get("points_per_visit")).toBe("20");
  });

  it("Fill the Cup style saves type=plant with variant=cup and the fill-specific label", async () => {
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

  it("Sprout's Classic style still saves type=plant with variant=plant and the bloom-specific label", async () => {
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
    await user.click(screen.getByRole("button", { name: "Classic" }));
    expect(screen.getByText("Visits to bloom")).toBeInTheDocument();

    await user.type(screen.getByLabelText("Card name"), "Grow-a-kopi");
    await user.type(screen.getByLabelText("Reward"), "Free kopi");
    await user.click(screen.getByRole("button", { name: "Create card" }));

    expect(saveMock).toHaveBeenCalled();
    const submitted = saveMock.mock.calls[0][1] as FormData;
    expect(submitted.get("type")).toBe("plant");
    expect(submitted.get("variant")).toBe("plant");
  });

  it("Spin the Wheel style shows segment rows, the odds-weight tooltip, and saves segments", async () => {
    const user = userEvent.setup();
    render(
      <SetupForm
        program={null}
        isEdit={false}
        replacingId={null}
        replacingType={null}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Chance Card" }));
    await user.click(screen.getByRole("button", { name: "Spin the Wheel" }));

    expect(screen.getByText("Wheel segments")).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", {
        name: "What the number next to each prize means",
      }),
    );
    expect(
      screen.getByText(/higher numbers land more often/i),
    ).toBeInTheDocument();

    await user.type(screen.getByLabelText("Card name"), "Spin to win");
    await user.type(screen.getByLabelText("Reward"), "Free kopi");
    await user.click(screen.getByRole("button", { name: "Create card" }));

    expect(saveMock).toHaveBeenCalled();
    const submitted = saveMock.mock.calls[0][1] as FormData;
    expect(submitted.get("type")).toBe("wheel");
    expect(JSON.parse(submitted.get("segments") as string)).toHaveLength(2);
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
    expect(screen.getAllByText("0/15 stamps")[0]).toBeInTheDocument();
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

  it("edit mode shows the locked type label and preview together, no picker", () => {
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
    expect(screen.getAllByText("0/10 stamps")[0]).toBeInTheDocument();
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

describe("SetupForm reward expiry field", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows the reward-expiry field for a stamp card", () => {
    render(
      <SetupForm
        program={null}
        isEdit={false}
        replacingId={null}
        replacingType={null}
      />,
    );
    expect(screen.getByLabelText(/reward expires after/i)).toBeInTheDocument();
  });

  it("hides the reward-expiry field for a lucky card", async () => {
    const user = userEvent.setup();
    render(
      <SetupForm
        program={null}
        isEdit={false}
        replacingId={null}
        replacingType={null}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Lucky Tap" }));
    expect(
      screen.queryByLabelText(/reward expires after/i),
    ).not.toBeInTheDocument();
  });
});
