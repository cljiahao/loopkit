"use client";

import { useActionState } from "react";
import { claimEarnAction, type EarnState } from "./actions";
import { ElevatedCard } from "@/components/elevated-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: EarnState = { status: "idle" };

export function EarnForm({
  orderId,
  vendorName,
}: {
  orderId: string;
  vendorName?: string;
}) {
  const [state, formAction, pending] = useActionState(
    claimEarnAction,
    initialState,
  );

  if (state.status === "success") {
    return (
      <ElevatedCard className="p-6 text-center">
        <p className="text-lg font-semibold">
          {state.stampCount}/{state.stampsRequired} stamps
        </p>
        {state.rewardText && (
          <p className="mt-1 text-sm text-muted-foreground">
            {state.rewardText}
          </p>
        )}
      </ElevatedCard>
    );
  }

  return (
    <ElevatedCard className="p-6">
      <form action={formAction} className="space-y-4">
        <input type="hidden" name="order" value={orderId} />
        <p className="text-sm">
          Earn a stamp with {vendorName ?? "this shop"}?
        </p>
        <div className="space-y-2">
          <Label
            htmlFor="earn-phone"
            className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
          >
            Your phone number
          </Label>
          <Input
            id="earn-phone"
            name="phone"
            type="tel"
            required
            placeholder="9123 4567"
            className="h-11 rounded-xl"
          />
        </div>
        <div className="space-y-2">
          <Label
            htmlFor="earn-name"
            className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
          >
            Name (optional)
          </Label>
          <Input
            id="earn-name"
            name="name"
            placeholder="Your name"
            className="h-11 rounded-xl"
          />
        </div>
        {state.status === "error" && (
          <p role="alert" className="text-sm text-destructive">
            {state.message}
          </p>
        )}
        <Button
          type="submit"
          disabled={pending}
          className="h-11 w-full rounded-xl text-base font-semibold"
        >
          {pending ? "Claiming…" : "Claim stamp"}
        </Button>
      </form>
    </ElevatedCard>
  );
}
