// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { scheduleMock } = vi.hoisted(() => ({
  scheduleMock: vi.fn().mockResolvedValue({}),
}));
vi.mock("@/app/setup/actions", () => ({
  scheduleRetirementAction: scheduleMock,
}));

import { ScheduleRetirementForm } from "@/app/setup/schedule-retirement-form";

describe("ScheduleRetirementForm", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders a successor picker defaulting to the first successor, and a date input", async () => {
    render(
      <ScheduleRetirementForm
        program={{ id: "p1", name: "Old card" } as never}
        successors={[
          { id: "p2", name: "New card" } as never,
          { id: "p3", name: "Another card" } as never,
        ]}
      />,
    );
    const trigger = screen.getByLabelText("Replacement card");
    expect(trigger).toHaveTextContent("New card");

    // Check these before opening the listbox: Radix's Select traps focus by
    // marking the rest of the page aria-hidden while open, which would hide
    // the button from getByRole.
    expect(screen.getByLabelText("Retirement date")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Schedule retirement" }),
    ).toBeInTheDocument();

    await userEvent.click(trigger);
    // Radix's hidden bubble <select> (rendered because this Select has a
    // `name`, for native FormData submission) duplicates every option's
    // text, so scope the visible-listbox assertion to the open listbox
    // rather than a bare getByText which would match both nodes.
    expect(
      within(screen.getByRole("listbox")).getByText("Another card"),
    ).toBeInTheDocument();
  });

  it("submits the program id, chosen successor, and date", async () => {
    const user = userEvent.setup();
    render(
      <ScheduleRetirementForm
        program={{ id: "p1", name: "Old card" } as never}
        successors={[
          { id: "p2", name: "New card" } as never,
          { id: "p3", name: "Another card" } as never,
        ]}
      />,
    );
    await user.click(screen.getByLabelText("Replacement card"));
    await user.click(
      within(screen.getByRole("listbox")).getByText("Another card"),
    );
    await user.type(screen.getByLabelText("Retirement date"), "2030-01-01");
    await user.click(
      screen.getByRole("button", { name: "Schedule retirement" }),
    );
    expect(scheduleMock).toHaveBeenCalled();
    const submittedData = scheduleMock.mock.calls[0][1] as FormData;
    expect(submittedData.get("successor_id")).toBe("p3");
    expect(submittedData.get("id")).toBe("p1");
  });
});
