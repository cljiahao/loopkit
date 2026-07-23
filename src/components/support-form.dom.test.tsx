// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SupportForm } from "./support-form";

const { submitSupportMessageActionMock } = vi.hoisted(() => ({
  submitSupportMessageActionMock: vi.fn(),
}));

vi.mock("@/app/actions/support", () => ({
  submitSupportMessageAction: submitSupportMessageActionMock,
}));

beforeEach(() => {
  submitSupportMessageActionMock.mockReset();
});

describe("SupportForm", () => {
  it("shows an error and does not submit when the body is empty", async () => {
    const user = userEvent.setup();
    render(<SupportForm />);
    await user.click(screen.getByRole("button", { name: /send message/i }));
    expect(submitSupportMessageActionMock).not.toHaveBeenCalled();
  });

  it("submits the selected category and typed body, shows a sent confirmation", async () => {
    submitSupportMessageActionMock.mockResolvedValue({ success: true });
    const user = userEvent.setup();
    render(<SupportForm />);

    await user.click(screen.getByRole("radio", { name: /pro plan/i }));
    await user.type(
      screen.getByLabelText(/describe the problem/i),
      "My plan didn't upgrade.",
    );
    await user.click(screen.getByRole("button", { name: /send message/i }));

    await waitFor(() => {
      expect(submitSupportMessageActionMock).toHaveBeenCalledWith({
        category: "billing",
        body: "My plan didn't upgrade.",
      });
    });
    await waitFor(() => {
      expect(screen.getByText(/we'll look into this/i)).toBeInTheDocument();
    });
  });
});
