"use client";

import { useActionState } from "react";
import { checkStatusAction } from "../api/actions";
import { STATUS_IDLE } from "../types";
import { ProgramCardStatus } from "./program-card-status";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function CheckForm({ vendorId }: { vendorId: string }) {
  const [state, formAction, pending] = useActionState(
    checkStatusAction,
    STATUS_IDLE,
  );

  return (
    <div className="space-y-6">
      <form action={formAction} className="space-y-4">
        <input type="hidden" name="vendor" value={vendorId} />
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
          {pending ? "Checking…" : "Check my card"}
        </Button>
      </form>

      {(state.status === "none" || state.status === "error") && (
        <p role="alert" className="text-sm text-destructive">
          {state.message}
        </p>
      )}

      {state.status === "found" && state.cards && (
        <div className="space-y-4">
          {state.cards.map((card) => (
            <ProgramCardStatus
              key={card.programId}
              card={card}
              phone={state.phone!}
            />
          ))}
        </div>
      )}
    </div>
  );
}
