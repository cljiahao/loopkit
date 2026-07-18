# `features/auth` Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate loopkit's auth code (`src/lib/auth.ts`, `src/app/login/*`, `src/app/reset-password/*`) into a templateCentral-style `src/features/auth/` folder, per `docs/superpowers/specs/2026-07-18-feature-auth-migration-design.md`.

**Architecture:** Build the new `src/features/auth/` structure first (api/, components/, index.ts) alongside the untouched old files — every intermediate task keeps the app buildable and fully tested. Only once the new structure is complete and tested does a single cutover task delete the old files and repoint `src/app/`'s thin route wrappers at the new location; a separate sweep task then updates the 14 external call-sites and 7 test mocks that reference the old `@/lib/auth` path.

**Tech Stack:** Next.js 16 App Router · TypeScript strict · Zod · `@supabase/ssr` · Vitest · `vi.hoisted` + `vi.mock` (this repo's established mocking style — see `test/lib/vendor.test.ts` for the canonical pattern) · pnpm.

## Global Constraints

- TypeScript strict — no `any`, no `@ts-ignore`.
- This is a pure code-location migration — zero behavioral changes to auth flows (OAuth, email/password, phone onboarding, password reset).
- `src/proxy.ts` is confirmed unrelated (uses `src/lib/supabase/middleware.ts` directly) — never touched by this plan.
- `src/app/auth/callback/route.ts` is a deliberate exception — stays exactly where it is, not extracted into `features/auth/api/` (25 lines, zero other importers, route-handler-shaped).
- External consumers of the auth feature import only from `@/features/auth` (the barrel `index.ts`) — never reach into `@/features/auth/api/*` or `@/features/auth/components/*` directly.
- Follow this repo's existing `vi.hoisted` + `vi.mock` mocking style in every test (see `test/lib/vendor.test.ts`, `test/app/vendor-onboard-action.test.ts` for the canonical pattern already used for this exact code).
- Per Track 1's per-folder README convention (rich mode): every new/changed folder gets an accurate `README.md`, enforced by the `readme-freshness` CI gate — this is not optional polish, a PR without it will fail CI.
- Run `pnpm check && pnpm test` after every task; commit after every task.
- Work happens in a git worktree (this repo's established convention, e.g. `.claude/worktrees/harness-parity` from Track 1) on a feature branch — `main` hard-blocks direct commits via the lefthook + PreToolUse hooks shipped in Track 1.

---

## Task 1: `features/auth/api/require-vendor.ts` + its first-ever direct test

**Files:**

- Create: `src/features/auth/api/require-vendor.ts`
- Create: `test/features/auth/require-vendor.test.ts`

**Interfaces:**

- Produces: `requireVendor(): Promise<{ user: User }>` — consumed by Task 3 (components) and Task 4 (barrel). `src/lib/auth.ts` (the old location) is untouched by this task and keeps working exactly as today; nothing is repointed at the new file yet.

- [ ] **Step 1: Write the failing test**

```typescript
// test/features/auth/require-vendor.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const { redirectMock, getUserMock } = vi.hoisted(() => ({
  redirectMock: vi.fn(),
  getUserMock: vi.fn(),
}));
vi.mock("next/navigation", () => ({ redirect: redirectMock }));
vi.mock("@/lib/supabase/server", () => ({
  createServerClient: vi.fn(async () => ({
    auth: { getUser: getUserMock },
  })),
}));

import { requireVendor } from "@/features/auth/api/require-vendor";

describe("requireVendor", () => {
  beforeEach(() => {
    redirectMock.mockClear();
    getUserMock.mockClear();
  });

  it("returns the user without redirecting when a session exists", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "vendor-1" } } });
    const result = await requireVendor();
    expect(result).toEqual({ user: { id: "vendor-1" } });
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("redirects to /login and never resolves a user when unauthenticated", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });
    await requireVendor();
    expect(redirectMock).toHaveBeenCalledWith("/login");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run test/features/auth/require-vendor.test.ts`
Expected: FAIL with "Failed to resolve import @/features/auth/api/require-vendor" (the file doesn't exist yet)

- [ ] **Step 3: Create the implementation (verbatim copy of `src/lib/auth.ts` — do not modify `src/lib/auth.ts` itself in this task)**

```typescript
// src/features/auth/api/require-vendor.ts
import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { createServerClient } from "@/lib/supabase/server";

// Shared vendor gate for server components/actions. Unlike merqo's
// requireVendor (notFound — vendor identity is looked up by email in a
// separate catalog table), loopkit has no such catalog: an unauthenticated
// request just needs to sign in, so we redirect to /login instead.
export async function requireVendor(): Promise<{ user: User }> {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { user };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run test/features/auth/require-vendor.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Confirm `src/lib/auth.ts` is completely untouched and the rest of the suite still passes**

Run: `git status --porcelain src/lib/auth.ts` — expected: no output (file unmodified)
Run: `pnpm test`
Expected: PASS, same test count as baseline plus the 2 new tests

- [ ] **Step 6: Commit**

```bash
git add src/features/auth/api/require-vendor.ts test/features/auth/require-vendor.test.ts
git commit -m "feat: add features/auth/api/require-vendor.ts alongside the existing src/lib/auth.ts"
```

---

## Task 2: `features/auth/api/actions.ts`

**Files:**

- Create: `src/features/auth/api/actions.ts`

**Interfaces:**

- Consumes: `requireVendor` from `../require-vendor` (Task 1, same feature — internal files import siblings directly, never through the barrel).
- Produces: `vendorPhoneOnboardAction(name: string, phoneRaw: string): Promise<{ error?: string }>` — consumed by Task 3 (`login-form.tsx`). `src/app/login/actions.ts` (the old location) is untouched by this task.

- [ ] **Step 1: Create the file (verbatim copy of `src/app/login/actions.ts`, with the `requireVendor` import repointed at the new sibling file created in Task 1)**

```typescript
// src/features/auth/api/actions.ts
"use server";

import { z } from "zod";
import { normalizePhone } from "@/lib/phone";
import { requireVendor } from "./require-vendor";
import { createServerClient } from "@/lib/supabase/server";

const nameSchema = z.string().trim().min(1).max(60);

// Unverified name+phone vendor onboarding (spec:
// 2026-07-11-vendor-phone-onboarding-design.md, Option 1). Called after the
// client has already established an anonymous session via
// signInAnonymously() — requireVendor() here just reads that session, it
// does not create one. Phone is stored as vendor-supplied data, not a
// verified credential — same trust model as a customer typing their own
// number at /c today.
export async function vendorPhoneOnboardAction(
  name: string,
  phoneRaw: string,
): Promise<{ error?: string }> {
  const { user } = await requireVendor();

  const parsedName = nameSchema.safeParse(name);
  if (!parsedName.success) return { error: "Enter your name." };

  const phone = normalizePhone(phoneRaw);
  if (!phone.ok) return { error: "Enter a valid Singapore phone number." };

  const supabase = await createServerClient();
  const { error } = await supabase
    .from("vendors")
    .upsert(
      { vendor_id: user.id, name: parsedName.data, phone: phone.phone },
      { onConflict: "vendor_id" },
    );
  if (error) return { error: "Couldn't save your details. Try again." };
  return {};
}
```

- [ ] **Step 2: Typecheck (no automated test for this file yet — its existing test still targets the old location and moves in Task 5, per the spec)**

Run: `pnpm tsc --noEmit`
Expected: PASS (this file isn't imported anywhere yet, so it can't break anything, but must still typecheck standalone)

- [ ] **Step 3: Confirm the old file is untouched**

Run: `git status --porcelain src/app/login/actions.ts`
Expected: no output

- [ ] **Step 4: Commit**

```bash
git add src/features/auth/api/actions.ts
git commit -m "feat: add features/auth/api/actions.ts alongside the existing src/app/login/actions.ts"
```

---

## Task 3: `features/auth/components/login-form.tsx` and `reset-password-form.tsx`

**Files:**

- Create: `src/features/auth/components/login-form.tsx`
- Create: `src/features/auth/components/reset-password-form.tsx`

**Interfaces:**

- Consumes: `vendorPhoneOnboardAction` from `../api/actions` (Task 2).
- Produces: `LoginForm` (named export, includes the `Suspense`-wrapping default-export behavior `src/app/login/page.tsx` currently has — see Task 5 for how the thin wrapper composes this), `ResetPasswordForm` (named export) — both consumed by Task 4 (barrel) and Task 5 (thin `src/app/` wrappers).

- [ ] **Step 1: Create `login-form.tsx`**

This is `src/app/login/page.tsx`'s current content, restructured so `LoginForm` (and its private `GoogleMark` helper) are the only exports — the `Suspense` wrapper and `default function LoginPage()` stay behind in `src/app/login/page.tsx` (Task 5), since that's the thin route-wrapper responsibility, not the feature's.

```typescript
// src/features/auth/components/login-form.tsx
"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { vendorPhoneOnboardAction } from "../api/actions";
import { Wordmark } from "@/components/landing/wordmark";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Mode = "signin" | "signup";

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-[1.05rem]" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1Z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.99.66-2.26 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84Z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.3 9.14 5.38 12 5.38Z"
      />
    </svg>
  );
}

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [mode, setMode] = useState<Mode>(
    searchParams.get("mode") === "signup" ? "signup" : "signin",
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showPhoneOnboard, setShowPhoneOnboard] = useState(false);
  const [vendorName, setVendorName] = useState("");
  const [vendorPhone, setVendorPhone] = useState("");
  // Set once we've emailed the user and are waiting on their click:
  // "signup" = confirm the new account, "reset" = choose a new password.
  const [sent, setSent] = useState<{
    email: string;
    kind: "signup" | "reset";
  } | null>(null);

  const isSignin = mode === "signin";

  async function signInWithGoogle() {
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    // On success the browser navigates to Google; only an early error lands here.
    if (error) {
      setError(error.message);
      setBusy(false);
    }
  }

  async function submitPhoneOnboard(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { error: anonError } = await supabase.auth.signInAnonymously();
    if (anonError) {
      setError(anonError.message);
      setBusy(false);
      return;
    }
    try {
      const result = await vendorPhoneOnboardAction(vendorName, vendorPhone);
      if (result.error) {
        setError(result.error);
        return;
      }
      router.push("/dashboard");
      router.refresh();
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const supabase = createClient();

    if (mode === "signup") {
      // Land the confirmation-email link back on loopkit — the project's Site URL
      // points at another kit (shared Supabase), so without this the confirm
      // link would bounce the vendor to the wrong app.
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });
      setBusy(false);
      if (error) {
        setError(error.message);
        return;
      }
      // Email confirmation on → no session yet. Show a "check your email" state
      // instead of bouncing to a dashboard the user can't reach.
      if (!data.session) {
        setSent({ email, kind: "signup" });
        return;
      }
      router.push("/dashboard");
      router.refresh();
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  // Email a password-reset link. The link lands on /auth/callback, which
  // establishes a recovery session and forwards to /reset-password.
  async function sendReset() {
    if (!email) {
      setError("Enter your email first.");
      return;
    }
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
    });
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    setSent({ email, kind: "reset" });
  }

  if (sent) {
    const isReset = sent.kind === "reset";
    return (
      <main className="flex min-h-screen items-center justify-center p-5">
        <div className="w-full max-w-md text-center">
          <div className="rounded-2xl border bg-card px-7 py-10 shadow-sm">
            <Wordmark className="text-2xl" />
            <h1 className="mt-6 text-3xl font-bold tracking-tight">
              Check your email
            </h1>
            <p className="mt-3 text-sm text-muted-foreground">
              {isReset ? (
                <>
                  We sent a password reset link to{" "}
                  <span className="font-medium text-foreground">
                    {sent.email}
                  </span>
                  . Open it to choose a new password.
                </>
              ) : (
                <>
                  We sent a confirmation link to{" "}
                  <span className="font-medium text-foreground">
                    {sent.email}
                  </span>
                  . Click it to activate your account, then sign in.
                </>
              )}
            </p>
            <Button
              type="button"
              variant="outline"
              className="mt-7 h-11 w-full rounded-xl"
              onClick={() => {
                setSent(null);
                setMode("signin");
              }}
            >
              Back to sign in
            </Button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-5">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <Wordmark className="text-3xl" />
          <p className="mt-1 text-sm text-muted-foreground">
            Sign in to your loopkit dashboard.
          </p>
        </div>

        <div className="rounded-2xl border bg-card shadow-sm">
          <div className="px-7 pt-9 pb-8">
            <h1 className="text-3xl font-bold tracking-tight">
              {isSignin ? "Welcome back" : "Create your account"}
            </h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              {isSignin
                ? "Sign in to your loopkit dashboard."
                : "Set up a loopkit account in seconds."}
            </p>

            <Button
              type="button"
              variant="outline"
              onClick={signInWithGoogle}
              disabled={busy}
              className="mt-7 h-12 w-full gap-2.5 rounded-xl text-[0.95rem] font-medium"
            >
              <GoogleMark />
              Continue with Google
            </Button>

            <Button
              type="button"
              variant="outline"
              onClick={() => setShowPhoneOnboard((v) => !v)}
              disabled={busy}
              className="mt-2.5 h-12 w-full gap-2.5 rounded-xl text-[0.95rem] font-medium"
            >
              Continue with name & phone
            </Button>

            {showPhoneOnboard && (
              <form onSubmit={submitPhoneOnboard} className="mt-5 space-y-5">
                <div className="space-y-2">
                  <Label
                    htmlFor="vendor-name"
                    className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                  >
                    Your name or business
                  </Label>
                  <Input
                    id="vendor-name"
                    required
                    placeholder="Kopi Corner"
                    className="h-11 rounded-xl"
                    value={vendorName}
                    onChange={(e) => setVendorName(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label
                    htmlFor="vendor-phone"
                    className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                  >
                    Phone number
                  </Label>
                  <Input
                    id="vendor-phone"
                    type="tel"
                    required
                    placeholder="9123 4567"
                    className="h-11 rounded-xl"
                    value={vendorPhone}
                    onChange={(e) => setVendorPhone(e.target.value)}
                  />
                </div>
                <Button
                  type="submit"
                  size="lg"
                  className="h-12 w-full rounded-xl text-base font-semibold"
                  disabled={busy}
                >
                  {busy ? "Please wait…" : "Continue"}
                </Button>
              </form>
            )}

            <div className="my-6 flex items-center gap-3">
              <span className="h-px flex-1 bg-border" />
              <span className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                or with email
              </span>
              <span className="h-px flex-1 bg-border" />
            </div>

            <form onSubmit={submit} className="space-y-5">
              <div className="space-y-2">
                <Label
                  htmlFor="email"
                  className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                >
                  Email
                </Label>
                <Input
                  id="email"
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="you@business.sg"
                  className="h-11 rounded-xl"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <Label
                    htmlFor="password"
                    className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                  >
                    Password
                  </Label>
                  {isSignin && (
                    <button
                      type="button"
                      onClick={sendReset}
                      disabled={busy}
                      className="text-xs font-semibold text-primary underline-offset-4 hover:underline disabled:opacity-50"
                    >
                      Forgot password?
                    </button>
                  )}
                </div>
                <Input
                  id="password"
                  type="password"
                  required
                  autoComplete={isSignin ? "current-password" : "new-password"}
                  placeholder="••••••••"
                  className="h-11 rounded-xl"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              {error && (
                <p
                  role="alert"
                  className="text-sm font-medium text-destructive"
                >
                  {error}
                </p>
              )}
              <Button
                type="submit"
                size="lg"
                className="h-12 w-full rounded-xl text-base font-semibold"
                disabled={busy}
              >
                {busy
                  ? "Please wait…"
                  : isSignin
                    ? "Sign in"
                    : "Create account"}
              </Button>
            </form>
          </div>

          <div className="border-t" />
          <p className="px-7 py-4 text-center text-sm text-muted-foreground">
            {isSignin ? "New to loopkit? " : "Already have an account? "}
            <button
              type="button"
              className="font-semibold text-primary underline-offset-4 hover:underline"
              onClick={() => {
                setMode(isSignin ? "signup" : "signin");
                setError(null);
              }}
            >
              {isSignin ? "Create an account" : "Sign in"}
            </button>
          </p>
        </div>
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Create `reset-password-form.tsx`**

Identical to today's `src/app/reset-password/page.tsx`, renamed from a default export to a named `ResetPasswordForm` export:

```typescript
// src/features/auth/components/reset-password-form.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Wordmark } from "@/components/landing/wordmark";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// Reached from the password-reset email → /auth/callback establishes a recovery
// session and forwards here. We update the password on that session, then land
// the user in their dashboard.
export function ResetPasswordForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setBusy(true);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-5">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <Wordmark className="text-3xl" />
        </div>
        <div className="rounded-2xl border bg-card px-7 py-9 shadow-sm">
          <h1 className="text-3xl font-bold tracking-tight">
            Choose a new password
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Enter it twice to confirm.
          </p>
          <form onSubmit={submit} className="mt-7 space-y-5">
            <div className="space-y-2">
              <Label
                htmlFor="password"
                className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
              >
                New password
              </Label>
              <Input
                id="password"
                type="password"
                required
                autoComplete="new-password"
                placeholder="••••••••"
                className="h-11 rounded-xl"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label
                htmlFor="confirm"
                className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
              >
                Confirm password
              </Label>
              <Input
                id="confirm"
                type="password"
                required
                autoComplete="new-password"
                placeholder="••••••••"
                className="h-11 rounded-xl"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </div>
            {error && (
              <p role="alert" className="text-sm font-medium text-destructive">
                {error}
              </p>
            )}
            <Button
              type="submit"
              size="lg"
              className="h-12 w-full rounded-xl text-base font-semibold"
              disabled={busy}
            >
              {busy ? "Saving…" : "Update password"}
            </Button>
          </form>
        </div>
      </div>
    </main>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `pnpm tsc --noEmit`
Expected: PASS

- [ ] **Step 4: Confirm the old files are untouched and full suite still green**

Run: `git status --porcelain src/app/login/page.tsx src/app/reset-password/page.tsx`
Expected: no output
Run: `pnpm test`
Expected: PASS, same count as after Task 1

- [ ] **Step 5: Commit**

```bash
git add src/features/auth/components/login-form.tsx src/features/auth/components/reset-password-form.tsx
git commit -m "feat: add features/auth/components/{login-form,reset-password-form}.tsx"
```

---

## Task 4: `features/auth/index.ts` barrel

**Files:**

- Create: `src/features/auth/index.ts`

**Interfaces:**

- Consumes: `requireVendor` (Task 1), `vendorPhoneOnboardAction` (Task 2), `LoginForm` (Task 3), `ResetPasswordForm` (Task 3).
- Produces: the single public entry point `@/features/auth` — consumed by Task 5 (thin `src/app/` wrappers) and Task 6 (the 14 external call-sites).

- [ ] **Step 1: Create the barrel**

```typescript
// src/features/auth/index.ts
export { requireVendor } from "./api/require-vendor";
export { vendorPhoneOnboardAction } from "./api/actions";
export { LoginForm } from "./components/login-form";
export { ResetPasswordForm } from "./components/reset-password-form";
```

- [ ] **Step 2: Typecheck**

Run: `pnpm tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Sanity-check the barrel resolves correctly with a throwaway import**

Run: `pnpm exec tsc --noEmit -p . 2>&1 | grep -i "features/auth" || echo "no errors referencing features/auth"`
Expected: `no errors referencing features/auth`

- [ ] **Step 4: Commit**

```bash
git add src/features/auth/index.ts
git commit -m "feat: add features/auth/index.ts barrel"
```

---

## Task 5: Cutover — thin `src/app/` wrappers, delete old files, move the one test that follows its code

**Files:**

- Modify: `src/app/login/page.tsx` (replace entirely)
- Modify: `src/app/reset-password/page.tsx` (replace entirely)
- Delete: `src/app/login/actions.ts`
- Delete: `src/lib/auth.ts`
- Delete: `test/app/vendor-onboard-action.test.ts`
- Create: `test/features/auth/vendor-onboard-action.test.ts`

**Interfaces:**

- Consumes: `LoginForm`, `ResetPasswordForm`, `vendorPhoneOnboardAction` from `@/features/auth` (the barrel — Task 4).
- Produces: nothing new — this task is the point where the old auth code paths stop existing. After this task, `@/lib/auth` and `@/app/login/actions` no longer resolve; Task 6 fixes every remaining reference to them.

- [ ] **Step 1: Replace `src/app/login/page.tsx` with the thin wrapper**

```typescript
// src/app/login/page.tsx
import { Suspense } from "react";
import { LoginForm } from "@/features/auth";

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
```

- [ ] **Step 2: Replace `src/app/reset-password/page.tsx` with the thin wrapper**

```typescript
// src/app/reset-password/page.tsx
import { ResetPasswordForm } from "@/features/auth";

export default function ResetPasswordPage() {
  return <ResetPasswordForm />;
}
```

- [ ] **Step 3: Delete the two fully-migrated old files**

```bash
rm src/app/login/actions.ts src/lib/auth.ts
```

- [ ] **Step 4: Move the test that follows `vendorPhoneOnboardAction`, updating its import and mock target**

```bash
git rm test/app/vendor-onboard-action.test.ts
mkdir -p test/features/auth
```

```typescript
// test/features/auth/vendor-onboard-action.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/features/auth/api/require-vendor", () => ({
  requireVendor: vi.fn(async () => ({ user: { id: "v1" } })),
}));

const upsertCalls: Array<{ values: unknown; onConflict: string }> = [];
const fromMock = vi.fn(() => ({
  upsert: (values: unknown, opts: { onConflict: string }) => {
    upsertCalls.push({ values, onConflict: opts.onConflict });
    return Promise.resolve({ error: null as { message: string } | null });
  },
}));
vi.mock("@/lib/supabase/server", () => ({
  createServerClient: vi.fn(async () => ({ from: fromMock })),
}));

import { vendorPhoneOnboardAction } from "@/features/auth/api/actions";

describe("vendorPhoneOnboardAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    upsertCalls.length = 0;
  });

  it("rejects an empty name without writing", async () => {
    const res = await vendorPhoneOnboardAction("  ", "91234567");
    expect(res.error).toBeTruthy();
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("rejects an invalid phone without writing", async () => {
    const res = await vendorPhoneOnboardAction("Kopi Corner", "12345");
    expect(res.error).toBeTruthy();
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("upserts a normalized phone and trimmed name on the happy path", async () => {
    const res = await vendorPhoneOnboardAction(" Kopi Corner ", "91234567");
    expect(res.error).toBeUndefined();
    expect(upsertCalls[0]).toMatchObject({
      values: { vendor_id: "v1", name: "Kopi Corner", phone: "+6591234567" },
      onConflict: "vendor_id",
    });
  });

  it("allows a duplicate name/phone already used by another vendor", async () => {
    // No uniqueness check exists client-side or in this action — the DB has
    // none either (spec requirement). Asserting only that no pre-check runs.
    const res = await vendorPhoneOnboardAction("Kopi Corner", "91234567");
    expect(res.error).toBeUndefined();
  });

  it("surfaces a Supabase error without throwing", async () => {
    fromMock.mockReturnValueOnce({
      upsert: () => Promise.resolve({ error: { message: "db down" } as const }),
    });
    const res = await vendorPhoneOnboardAction("Kopi Corner", "91234567");
    expect(res.error).toBeTruthy();
  });
});
```

Note the mock target changed from `@/lib/auth` to `@/features/auth/api/require-vendor` — this test mocks `requireVendor` directly (not through the barrel) because it's testing `vendorPhoneOnboardAction`, which itself imports `requireVendor` from the sibling `./require-vendor` file (Task 2), not from the barrel. Mocking the barrel here would not intercept that internal import.

- [ ] **Step 5: Expect widespread failures — this is normal, do not fix them yet**

Run: `pnpm tsc --noEmit 2>&1 | tail -20`
Expected: FAIL, with errors like `Cannot find module '@/lib/auth'` across ~14 files and `Cannot find module '@/app/login/actions'` — this is Task 6's job. Confirm the failures are _only_ "module not found" for these two exact paths, nothing else (a different error here means something in this task broke unexpectedly — stop and investigate before proceeding to Task 6).

- [ ] **Step 6: Commit anyway — the plan proceeds through the broken intermediate state deliberately, fixed by the very next task**

```bash
git add -A
git commit -m "feat: cut over to features/auth — thin route wrappers, delete old files, move vendor-onboard test"
```

---

## Task 6: Repoint the 14 external call-sites and 7 remaining test mocks

**Files:**

- Modify (import line only, `@/lib/auth` → `@/features/auth`): `src/lib/program.ts`, `src/lib/vendor.ts`, `src/app/setup/actions.ts`, `src/app/setup/page.tsx`, `src/app/dashboard/actions.ts`, `src/app/dashboard/activity/page.tsx`, `src/app/dashboard/counter/page.tsx`, `src/app/dashboard/layout.tsx`, `src/app/dashboard/customers/page.tsx`, `src/app/dashboard/page.tsx`, `src/app/dashboard/plan/page.tsx`, `src/app/dashboard/profile/page.tsx`, `src/app/dashboard/settings/page.tsx`, `src/app/dashboard/stats/page.tsx`
- Modify (`vi.mock` target only, `@/lib/auth` → `@/features/auth`): `src/app/dashboard/counter/counter-page.dom.test.tsx`, `test/app/dashboard-actions.test.ts`, `test/app/change-type-action.test.ts`, `test/lib/vendor.test.ts`, `test/app/save-program-action.test.ts`, `test/app/resolve-token-action.test.ts`, `test/app/profile-actions.test.ts`

**Interfaces:**

- Consumes: `requireVendor` from `@/features/auth` (the barrel — Task 4). No signature changes anywhere in this task — every call site keeps calling `requireVendor()` exactly as before.

- [ ] **Step 1: Find every remaining reference to the old paths, to work from a concrete list rather than the plan's static one (repo state may have shifted since the spec's inventory was taken)**

```bash
grep -rln '"@/lib/auth"' src test
grep -rln '"@/app/login/actions"' src test
```

Expected output: the same 21 files listed above (14 files with an import line to change, 7 files with a `vi.mock` target to change — two disjoint sets, no file appears in both) — if this grep finds a file not in either list above, or misses one that is, treat the plan's static list as stale and follow the grep output instead; note the discrepancy in your task report.

- [ ] **Step 2: For each of the 21 files, change the import/mock line**

Every file has exactly one line to change, one of these two forms:

```typescript
// Before
import { requireVendor } from "@/lib/auth";
// After
import { requireVendor } from "@/features/auth";
```

```typescript
// Before (test files using vi.mock)
vi.mock("@/lib/auth", () => ({ ... }));
// After
vi.mock("@/features/auth", () => ({ ... }));
```

Apply this to every file returned by Step 1's grep. Do not change anything else in any of these files — the mock factory bodies, the call sites of `requireVendor()`, everything else stays byte-identical.

- [ ] **Step 3: Verify zero references to the old paths remain**

```bash
grep -rln '"@/lib/auth"' src test
grep -rln '"@/app/login/actions"' src test
```

Expected: no output from either command

- [ ] **Step 4: Typecheck — this should now be clean**

Run: `pnpm tsc --noEmit`
Expected: PASS (the Task 5 failures are now resolved)

- [ ] **Step 5: Full test suite**

Run: `pnpm test`
Expected: PASS, same total test count as baseline (no tests added or removed in this task — Task 1 added 2, Task 5's move is a like-for-like relocation)

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "fix: repoint the 21 remaining @/lib/auth and @/app/login/actions references at @/features/auth"
```

---

## Task 7: Per-folder READMEs

**Files:**

- Create: `src/features/README.md`, `src/features/auth/README.md`, `src/features/auth/api/README.md`, `src/features/auth/components/README.md`, `test/features/README.md`, `test/features/auth/README.md`
- Modify (regenerate): `src/app/login/README.md`, `src/app/reset-password/README.md`
- Modify (append `features/` to the Contents list): `src/README.md`

**Interfaces:** none — documentation only.

- [ ] **Step 1: Regenerate `src/app/login/README.md`**

`ls src/app/login/` now shows just `page.tsx` and `README.md`. Follow the template already established in this repo (see `src/app/reset-password/README.md`'s current content, or any other leaf `src/app/*` folder from Track 1, for the exact `# name` / `## Purpose` / `## Contents` / `## Parent` shape — this folder has no subfolders, so no `## Connectivity` section). Write a `## Contents` bullet for `page.tsx` describing it as the thin `Suspense`-wrapped route entry that renders `LoginForm` from `@/features/auth` — grounded in the actual Task 5 file content, not copied from this plan's prose.

- [ ] **Step 2: Regenerate `src/app/reset-password/README.md`**

Same process — `ls src/app/reset-password/` now shows just `page.tsx` (thin wrapper rendering `ResetPasswordForm`) and `README.md`.

- [ ] **Step 3: Create `src/features/README.md`**

This is a new parent folder with one child so far (`auth/`). Purpose: templateCentral-style feature folders — one folder per domain feature, each with its own `api/`/`components/`/`index.ts` and a single public entry point. Contents: `auth/`. Connectivity: `src/app/` pages compose from `src/features/<name>/` via each feature's `index.ts` barrel; features do not import from each other directly (not yet applicable with only one feature, but state the intended rule since later phases will add more).

- [ ] **Step 4: Create `src/features/auth/README.md`**

Purpose: authentication — login (Google OAuth, email/password, unverified name+phone onboarding), the shared `requireVendor` guard used across dashboard/setup, and password reset. Contents: `api/`, `components/`, `index.ts`. Connectivity: `index.ts` is the only path external code should import from (dashboard/setup pages import `requireVendor`; `src/app/login/`, `src/app/reset-password/` import their form components) — `api/` and `components/` are private implementation, consumed internally by `index.ts` and by each other (`components/login-form.tsx` imports `vendorPhoneOnboardAction` from `../api/actions`).

- [ ] **Step 5: Create `src/features/auth/api/README.md`**

Purpose: server-side auth logic — the vendor-auth guard and the phone-onboarding server action. Contents (rich mode, read each file): `actions.ts` — real one-line description of `vendorPhoneOnboardAction`'s behavior (from the actual file); `require-vendor.ts` — real one-line description of `requireVendor`'s behavior. Connectivity: N/A (no subfolders).

- [ ] **Step 6: Create `src/features/auth/components/README.md`**

Purpose: client-side auth UI. Contents (rich mode): `login-form.tsx` — real description grounded in the file (Google OAuth, phone onboarding, email/password sign-in/sign-up, password-reset request); `reset-password-form.tsx` — real description (password + confirm, calls `supabase.auth.updateUser`).

- [ ] **Step 7: Create `test/features/README.md` and `test/features/auth/README.md`**

Mirror the `src/features/` / `src/features/auth/` structure and purpose, adjusted for "tests for" phrasing — follow this repo's existing `test/lib/README.md` or `test/app/README.md` (from Track 1) as the exact template reference.

- [ ] **Step 8: Add `features/` to `src/README.md`'s Contents list**

Read the current `src/README.md` (created in Track 1's Task 13) and add a `- \`features/\``bullet to its`## Contents` section, sorted alphabetically alongside the existing entries (`app/`, `components/`, `hooks/`, `lib/`). Do not touch anything else in the file.

- [ ] **Step 9: Verify every touched/new folder's README is accurate**

```bash
ls src/features src/features/auth src/features/auth/api src/features/auth/components test/features test/features/auth src/app/login src/app/reset-password
```

Cross-check each listing against the README you just wrote or regenerated for that folder — every real child present, nothing invented.

- [ ] **Step 10: Commit**

```bash
git add src/features src/app/login/README.md src/app/reset-password/README.md src/README.md test/features
git commit -m "docs: add per-folder READMEs for the new features/auth structure"
```

---

## Task 8: Final verification

**Files:** none — verification only.

- [ ] **Step 1: Full quality gate**

```bash
pnpm check
pnpm test
```

Expected: both PASS, test count unchanged from baseline plus the 2 new `require-vendor.test.ts` tests.

- [ ] **Step 2: Confirm no stray references to deleted files anywhere in the repo (not just src/test)**

```bash
grep -rln '"@/lib/auth"' . --include="*.ts" --include="*.tsx" 2>/dev/null | grep -v node_modules
grep -rln '"@/app/login/actions"' . --include="*.ts" --include="*.tsx" 2>/dev/null | grep -v node_modules
```

Expected: no output from either

- [ ] **Step 3: Manual smoke test — start the dev server and exercise both migrated pages**

```bash
pnpm dev
```

Visit `/login` in a browser: confirm the page renders (Google button, name/phone button, email/password form), matches what `/login` looked like before this migration (no visual/behavioral change expected — this is a pure code-location migration). Visit `/reset-password` directly: confirm the password + confirm fields render. You cannot fully exercise the OAuth/email flows without live Supabase credentials in this environment — visual/structural confirmation that both pages render without a client-side exception (check the browser console) is sufficient for this task; do not claim the full auth flow was tested if it wasn't.

- [ ] **Step 4: Confirm `src/lib/auth.ts` and `src/app/login/actions.ts` no longer exist**

```bash
test -f src/lib/auth.ts && echo "STILL EXISTS — bug" || echo "correctly removed"
test -f src/app/login/actions.ts && echo "STILL EXISTS — bug" || echo "correctly removed"
```

Expected: `correctly removed` twice

- [ ] **Step 5: Report status**

This plan's execution ends here — pushing the branch, opening a PR, and watching CI are the controller's job once this task completes (same pattern as Track 1's Task 18), not a step to script blindly here since the exact branch/worktree name depends on how execution was set up. Report: all 8 tasks complete, quality gate green, manual smoke check results for `/login` and `/reset-password`.
