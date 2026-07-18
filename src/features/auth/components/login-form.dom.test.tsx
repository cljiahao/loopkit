// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const {
  routerPush,
  routerRefresh,
  searchParamsValue,
  vendorPhoneOnboardActionMock,
  authMock,
} = vi.hoisted(() => ({
  routerPush: vi.fn(),
  routerRefresh: vi.fn(),
  searchParamsValue: { current: "" },
  vendorPhoneOnboardActionMock: vi.fn().mockResolvedValue({}),
  authMock: {
    signInWithOAuth: vi.fn().mockResolvedValue({ error: null }),
    signInAnonymously: vi.fn().mockResolvedValue({ error: null }),
    signUp: vi.fn().mockResolvedValue({ data: { session: {} }, error: null }),
    signInWithPassword: vi.fn().mockResolvedValue({ error: null }),
    resetPasswordForEmail: vi.fn().mockResolvedValue({ error: null }),
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: routerPush, refresh: routerRefresh }),
  useSearchParams: () => new URLSearchParams(searchParamsValue.current),
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ auth: authMock }),
}));

vi.mock("../api/actions", () => ({
  vendorPhoneOnboardAction: vendorPhoneOnboardActionMock,
}));

import { LoginForm } from "./login-form";

describe("LoginForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    searchParamsValue.current = "";
    authMock.signInWithOAuth.mockResolvedValue({ error: null });
    authMock.signInAnonymously.mockResolvedValue({ error: null });
    authMock.signUp.mockResolvedValue({ data: { session: {} }, error: null });
    authMock.signInWithPassword.mockResolvedValue({ error: null });
    authMock.resetPasswordForEmail.mockResolvedValue({ error: null });
    vendorPhoneOnboardActionMock.mockResolvedValue({});
  });

  it("renders the sign-in form by default", () => {
    render(<LoginForm />);
    expect(
      screen.getByRole("heading", { name: "Welcome back" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Continue with Google/ }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeInTheDocument();
  });

  it("starts in signup mode when the mode search param is signup", () => {
    searchParamsValue.current = "mode=signup";
    render(<LoginForm />);
    expect(
      screen.getByRole("heading", { name: "Create your account" }),
    ).toBeInTheDocument();
  });

  it("calls signInWithOAuth when Continue with Google is clicked", async () => {
    const user = userEvent.setup();
    render(<LoginForm />);
    await user.click(
      screen.getByRole("button", { name: /Continue with Google/ }),
    );
    expect(authMock.signInWithOAuth).toHaveBeenCalledWith({
      provider: "google",
      options: { redirectTo: expect.stringContaining("/auth/callback") },
    });
  });

  it("shows an error when Google sign-in fails to start", async () => {
    authMock.signInWithOAuth.mockResolvedValue({
      error: { message: "OAuth unavailable" },
    });
    const user = userEvent.setup();
    render(<LoginForm />);
    await user.click(
      screen.getByRole("button", { name: /Continue with Google/ }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "OAuth unavailable",
    );
  });

  it("signs in with email/password and redirects to dashboard on success", async () => {
    const user = userEvent.setup();
    render(<LoginForm />);
    await user.type(screen.getByLabelText("Email"), "vendor@example.com");
    await user.type(screen.getByLabelText("Password"), "hunter2");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() =>
      expect(authMock.signInWithPassword).toHaveBeenCalledWith({
        email: "vendor@example.com",
        password: "hunter2",
      }),
    );
    expect(routerPush).toHaveBeenCalledWith("/dashboard");
    expect(routerRefresh).toHaveBeenCalled();
  });

  it("shows an error message when sign-in fails", async () => {
    authMock.signInWithPassword.mockResolvedValue({
      error: { message: "Invalid credentials" },
    });
    const user = userEvent.setup();
    render(<LoginForm />);
    await user.type(screen.getByLabelText("Email"), "vendor@example.com");
    await user.type(screen.getByLabelText("Password"), "wrong");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Invalid credentials",
    );
    expect(routerPush).not.toHaveBeenCalled();
  });

  it("switches to signup mode and shows the check-your-email state when signUp returns no session", async () => {
    authMock.signUp.mockResolvedValue({ data: { session: null }, error: null });
    const user = userEvent.setup();
    render(<LoginForm />);
    await user.click(screen.getByRole("button", { name: "Create an account" }));
    expect(
      screen.getByRole("heading", { name: "Create your account" }),
    ).toBeInTheDocument();

    await user.type(screen.getByLabelText("Email"), "new@example.com");
    await user.type(screen.getByLabelText("Password"), "hunter2");
    await user.click(screen.getByRole("button", { name: "Create account" }));

    expect(authMock.signUp).toHaveBeenCalledWith({
      email: "new@example.com",
      password: "hunter2",
      options: { emailRedirectTo: expect.stringContaining("/auth/callback") },
    });
    expect(await screen.findByText("Check your email")).toBeInTheDocument();
    expect(screen.getByText(/confirmation link/)).toBeInTheDocument();
  });

  it("redirects to dashboard on signup when a session is returned immediately", async () => {
    authMock.signUp.mockResolvedValue({
      data: { session: { access_token: "x" } },
      error: null,
    });
    const user = userEvent.setup();
    render(<LoginForm />);
    await user.click(screen.getByRole("button", { name: "Create an account" }));
    await user.type(screen.getByLabelText("Email"), "new@example.com");
    await user.type(screen.getByLabelText("Password"), "hunter2");
    await user.click(screen.getByRole("button", { name: "Create account" }));

    await waitFor(() => expect(routerPush).toHaveBeenCalledWith("/dashboard"));
  });

  it("shows an error when signup fails", async () => {
    authMock.signUp.mockResolvedValue({
      data: { session: null },
      error: { message: "Email already registered" },
    });
    const user = userEvent.setup();
    render(<LoginForm />);
    await user.click(screen.getByRole("button", { name: "Create an account" }));
    await user.type(screen.getByLabelText("Email"), "dup@example.com");
    await user.type(screen.getByLabelText("Password"), "hunter2");
    await user.click(screen.getByRole("button", { name: "Create account" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Email already registered",
    );
  });

  it("toggles the phone-onboard form and submits it", async () => {
    const user = userEvent.setup();
    render(<LoginForm />);
    await user.click(
      screen.getByRole("button", { name: "Continue with name & phone" }),
    );

    await user.type(
      screen.getByLabelText("Your name or business"),
      "Kopi Corner",
    );
    await user.type(screen.getByLabelText("Phone number"), "91234567");
    await user.click(screen.getByRole("button", { name: "Continue" }));

    await waitFor(() => expect(authMock.signInAnonymously).toHaveBeenCalled());
    expect(vendorPhoneOnboardActionMock).toHaveBeenCalledWith(
      "Kopi Corner",
      "91234567",
    );
    expect(routerPush).toHaveBeenCalledWith("/dashboard");
  });

  it("shows an error when the anonymous session for phone onboarding fails", async () => {
    authMock.signInAnonymously.mockResolvedValue({
      error: { message: "Anon sign-in disabled" },
    });
    const user = userEvent.setup();
    render(<LoginForm />);
    await user.click(
      screen.getByRole("button", { name: "Continue with name & phone" }),
    );
    await user.type(
      screen.getByLabelText("Your name or business"),
      "Kopi Corner",
    );
    await user.type(screen.getByLabelText("Phone number"), "91234567");
    await user.click(screen.getByRole("button", { name: "Continue" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Anon sign-in disabled",
    );
    expect(vendorPhoneOnboardActionMock).not.toHaveBeenCalled();
  });

  it("shows a phone-onboard error without navigating away", async () => {
    vendorPhoneOnboardActionMock.mockResolvedValue({
      error: "Enter a valid Singapore phone number.",
    });
    const user = userEvent.setup();
    render(<LoginForm />);
    await user.click(
      screen.getByRole("button", { name: "Continue with name & phone" }),
    );
    await user.type(
      screen.getByLabelText("Your name or business"),
      "Kopi Corner",
    );
    await user.type(screen.getByLabelText("Phone number"), "123");
    await user.click(screen.getByRole("button", { name: "Continue" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Enter a valid Singapore phone number.",
    );
    expect(routerPush).not.toHaveBeenCalled();
  });

  it("shows a generic error when the phone-onboard action throws", async () => {
    vendorPhoneOnboardActionMock.mockRejectedValue(new Error("network down"));
    const user = userEvent.setup();
    render(<LoginForm />);
    await user.click(
      screen.getByRole("button", { name: "Continue with name & phone" }),
    );
    await user.type(
      screen.getByLabelText("Your name or business"),
      "Kopi Corner",
    );
    await user.type(screen.getByLabelText("Phone number"), "91234567");
    await user.click(screen.getByRole("button", { name: "Continue" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Something went wrong. Try again.",
    );
  });

  it("sends a password-reset email and shows the check-your-email reset state", async () => {
    const user = userEvent.setup();
    render(<LoginForm />);
    await user.type(screen.getByLabelText("Email"), "vendor@example.com");
    await user.click(screen.getByRole("button", { name: "Forgot password?" }));

    expect(authMock.resetPasswordForEmail).toHaveBeenCalledWith(
      "vendor@example.com",
      {
        redirectTo: expect.stringContaining(
          "/auth/callback?next=/reset-password",
        ),
      },
    );
    expect(await screen.findByText("Check your email")).toBeInTheDocument();
    expect(screen.getByText(/password reset link/)).toBeInTheDocument();
  });

  it("shows an error and does not send when Forgot password is clicked with no email", async () => {
    const user = userEvent.setup();
    render(<LoginForm />);
    await user.click(screen.getByRole("button", { name: "Forgot password?" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Enter your email first.",
    );
    expect(authMock.resetPasswordForEmail).not.toHaveBeenCalled();
  });

  it("returns to sign-in from the check-your-email state", async () => {
    const user = userEvent.setup();
    render(<LoginForm />);
    await user.type(screen.getByLabelText("Email"), "vendor@example.com");
    await user.click(screen.getByRole("button", { name: "Forgot password?" }));
    await screen.findByText("Check your email");

    await user.click(screen.getByRole("button", { name: "Back to sign in" }));
    expect(
      screen.getByRole("heading", { name: "Welcome back" }),
    ).toBeInTheDocument();
  });
});
