// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { routerPush, routerRefresh, updateUserMock } = vi.hoisted(() => ({
  routerPush: vi.fn(),
  routerRefresh: vi.fn(),
  updateUserMock: vi.fn().mockResolvedValue({ error: null }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: routerPush, refresh: routerRefresh }),
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ auth: { updateUser: updateUserMock } }),
}));

import { ResetPasswordForm } from "./reset-password-form";

describe("ResetPasswordForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    updateUserMock.mockResolvedValue({ error: null });
  });

  it("renders both password fields", () => {
    render(<ResetPasswordForm />);
    expect(screen.getByLabelText("New password")).toBeInTheDocument();
    expect(screen.getByLabelText("Confirm password")).toBeInTheDocument();
  });

  it("shows an error and does not call updateUser when passwords don't match", async () => {
    const user = userEvent.setup();
    render(<ResetPasswordForm />);
    await user.type(screen.getByLabelText("New password"), "hunter2");
    await user.type(screen.getByLabelText("Confirm password"), "different");
    await user.click(screen.getByRole("button", { name: "Update password" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Passwords do not match.",
    );
    expect(updateUserMock).not.toHaveBeenCalled();
  });

  it("updates the password and redirects to dashboard on success", async () => {
    const user = userEvent.setup();
    render(<ResetPasswordForm />);
    await user.type(screen.getByLabelText("New password"), "hunter2");
    await user.type(screen.getByLabelText("Confirm password"), "hunter2");
    await user.click(screen.getByRole("button", { name: "Update password" }));

    await waitFor(() =>
      expect(updateUserMock).toHaveBeenCalledWith({ password: "hunter2" }),
    );
    expect(routerPush).toHaveBeenCalledWith("/dashboard");
    expect(routerRefresh).toHaveBeenCalled();
  });

  it("shows a Supabase error without navigating away", async () => {
    updateUserMock.mockResolvedValue({
      error: { message: "Password too weak" },
    });
    const user = userEvent.setup();
    render(<ResetPasswordForm />);
    await user.type(screen.getByLabelText("New password"), "hunter2");
    await user.type(screen.getByLabelText("Confirm password"), "hunter2");
    await user.click(screen.getByRole("button", { name: "Update password" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Password too weak",
    );
    expect(routerPush).not.toHaveBeenCalled();
  });
});
