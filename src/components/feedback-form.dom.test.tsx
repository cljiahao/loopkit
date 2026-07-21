// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FeedbackForm } from "./feedback-form";

vi.mock("@/app/actions/feedback", () => ({
  submitFeedbackAction: vi.fn(async () => ({ success: true })),
}));

import { submitFeedbackAction } from "@/app/actions/feedback";

describe("FeedbackForm", () => {
  it("requires a score before sending", async () => {
    const user = userEvent.setup();
    render(<FeedbackForm />);
    await user.click(screen.getByRole("button", { name: /send feedback/i }));
    expect(submitFeedbackAction).not.toHaveBeenCalled();
  });

  it("submits the picked score", async () => {
    const user = userEvent.setup();
    render(<FeedbackForm />);
    await user.click(screen.getByRole("radio", { name: "8" }));
    await user.click(screen.getByRole("button", { name: /send feedback/i }));
    expect(submitFeedbackAction).toHaveBeenCalledWith({
      nps: 8,
      message: undefined,
    });
  });
});
