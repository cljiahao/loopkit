"use client";

import { useActionState } from "react";
import { Check, Gift } from "lucide-react";
import { checkStatusAction } from "@/app/c/actions";
import { STATUS_IDLE } from "@/app/c/status-state";
import { Plant } from "@/components/plant";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export function CheckForm({ programId }: { programId: string }) {
  const [state, formAction, pending] = useActionState(
    checkStatusAction,
    STATUS_IDLE,
  );

  const view = state.view;

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
          {pending ? "Checking…" : "Check my card"}
        </Button>
      </form>

      {(state.status === "none" || state.status === "error") && (
        <p role="alert" className="text-sm text-destructive">
          {state.message}
        </p>
      )}

      {state.status === "found" && (
        <div className="space-y-4 rounded-xl border bg-muted/40 p-4">
          {view?.kind === "plant" ? (
            <div className="flex flex-col items-center gap-2">
              <Plant
                stage={view.stage}
                totalStages={view.totalStages}
                wilting={view.wilting}
              />
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {Array.from(
                { length: view?.kind === "dots" ? view.total : 0 },
                (_, i) => {
                  const total = view?.kind === "dots" ? view.total : 0;
                  const filled = view?.kind === "dots" ? view.filled : 0;
                  const isReward = i === total - 1;
                  const stamped = i < filled;
                  return (
                    <span
                      key={i}
                      aria-hidden="true"
                      className={cn(
                        "flex size-7 items-center justify-center rounded-full border-2 text-sm",
                        isReward
                          ? "border-gold text-gold-foreground"
                          : stamped
                            ? "border-transparent bg-gold text-gold-foreground"
                            : "border-dashed border-muted-foreground/30",
                      )}
                    >
                      {isReward ? (
                        <Gift className="size-3.5 text-gold" />
                      ) : stamped ? (
                        <Check className="size-3.5" />
                      ) : null}
                    </span>
                  );
                },
              )}
            </div>
          )}
          <p className="font-mono text-sm font-medium">{state.label}</p>
          <p className="text-sm text-muted-foreground">
            Reward: {state.reward_text}
          </p>
          {state.rewardReady && (
            <p className="text-sm font-semibold text-gold-foreground">
              🎉 Reward ready!
            </p>
          )}
          {state.qr && (
            <div className="flex flex-col items-center gap-2 pt-2">
              <div
                className="w-full max-w-[180px] rounded-xl border bg-white p-3 [&_svg]:h-auto [&_svg]:w-full"
                dangerouslySetInnerHTML={{ __html: state.qr }}
              />
              <p className="text-xs text-muted-foreground">
                Show this to the shop
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
