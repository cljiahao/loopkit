"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// Reached from the password-reset email → /auth/callback establishes a recovery
// session and forwards here. We update the password on that session, then land
// the user in their dashboard.
export default function ResetPasswordPage() {
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
          <span className="text-3xl font-bold">loopkit</span>
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
