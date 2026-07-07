"use client";

import { useActionState } from "react";
import { checkStatusAction } from "@/app/c/actions";
import { STATUS_IDLE } from "@/app/c/status-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export function CheckForm({ programId }: { programId: string }) {
  const [state, formAction, pending] = useActionState(
    checkStatusAction,
    STATUS_IDLE,
  );

  const stampsRequired = state.stamps_required ?? 0;
  const stampCount = state.stamp_count ?? 0;
  const rewardReady = state.status === "found" && stampCount >= stampsRequired;

  return (
    <div className="space-y-6">
      <form action={formAction} className="space-y-4">
        <input type="hidden" name="program" value={programId} />
        <div className="space-y-2">
          <Label
            htmlFor="phone"
            className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
          >
            Your phone number
          </Label>
          <Input
            id="phone"
            name="phone"
            type="tel"
            required
            placeholder="9123 4567"
            className="h-11 rounded-xl"
          />
        </div>
        <Button
          type="submit"
          disabled={pending}
          className="h-11 w-full rounded-xl text-base font-semibold"
        >
          Check my stamps
        </Button>
      </form>

      {(state.status === "none" || state.status === "error") && (
        <p role="alert" className="text-sm text-destructive">
          {state.message}
        </p>
      )}

      {state.status === "found" && (
        <div className="space-y-3 rounded-xl border bg-muted/40 p-4">
          <div className="flex flex-wrap gap-1.5">
            {Array.from({ length: stampsRequired }, (_, i) => (
              <span
                key={i}
                className={cn(
                  "size-6 rounded-full border-2",
                  i < stampCount
                    ? "border-primary bg-primary"
                    : "border-muted-foreground/30",
                )}
                aria-hidden="true"
              />
            ))}
          </div>
          <p className="text-sm font-medium">
            {stampCount} / {stampsRequired} stamps
          </p>
          <p className="text-sm text-muted-foreground">
            Reward: {state.reward_text}
          </p>
          {rewardReady && (
            <p className="text-sm font-semibold text-primary">
              🎉 Reward ready!
            </p>
          )}
        </div>
      )}
    </div>
  );
}
