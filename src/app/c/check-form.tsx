"use client";

import { useActionState, useState, useTransition } from "react";
import { toast } from "sonner";
import { checkStatusAction, regenerateCardAction } from "@/app/c/actions";
import { STATUS_IDLE } from "@/app/c/status-state";
import { Plant } from "@/components/plant";
import { Wheel } from "@/components/wheel";
import { ScratchCard } from "@/components/scratch-card";
import { StreakFlame } from "@/components/streak-flame";
import { StampDots } from "@/components/stamp-dots";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export function CheckForm({ programId }: { programId: string }) {
  const [state, formAction, pending] = useActionState(
    checkStatusAction,
    STATUS_IDLE,
  );
  const [regenOpen, setRegenOpen] = useState(false);
  const [regenerating, startRegenerate] = useTransition();

  const view = state.view;

  function confirmRegenerate() {
    if (!state.programId || !state.phone) return;
    startRegenerate(async () => {
      const fd = new FormData();
      fd.set("program", state.programId!);
      fd.set("phone", state.phone!);
      const res = await regenerateCardAction(fd);
      if (!res.success) {
        toast.error(res.error);
        return;
      }
      toast.success("New card issued — check your card again to see it.");
      setRegenOpen(false);
    });
  }

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
          ) : view?.kind === "streak" ? (
            <div className="flex flex-col items-center gap-2">
              <StreakFlame
                current={view.current}
                target={view.target}
                status={view.status}
              />
            </div>
          ) : view?.kind === "chance" ? (
            <div className="flex flex-col items-center gap-2">
              {view.variant === "wheel" ? (
                <Wheel segments={view.segments} landedId={view.landedId} />
              ) : (
                <ScratchCard
                  revealed={view.landedId !== null}
                  label={
                    view.segments.find((s) => s.id === view.landedId)?.label ??
                    ""
                  }
                  reward={
                    view.segments.find((s) => s.id === view.landedId)?.reward ??
                    false
                  }
                />
              )}
            </div>
          ) : view?.kind === "dots" ? (
            <StampDots filled={view.filled} total={view.total} />
          ) : null}
          <p className="font-mono text-sm font-medium">{state.label}</p>
          <p className="text-sm text-muted-foreground">
            Reward: {state.reward_text}
          </p>
          {state.rewardReady && (
            <p className="text-sm font-semibold text-gold-accent">
              🎉 Reward ready!
            </p>
          )}
          {state.expired && (
            <p className="text-sm font-semibold text-destructive">
              This card has expired.
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
          <AlertDialog open={regenOpen} onOpenChange={setRegenOpen}>
            <AlertDialogTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="rounded-xl text-xs text-muted-foreground"
              >
                {state.expired
                  ? "Get a new card"
                  : "Lost your code? Get a new one"}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Get a new card?</AlertDialogTitle>
                <AlertDialogDescription>
                  This issues a fresh QR code and resets your progress to zero.
                  Any reward you&apos;ve already earned should be redeemed at
                  the shop first.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={regenerating}>
                  Cancel
                </AlertDialogCancel>
                <AlertDialogAction
                  disabled={regenerating}
                  onClick={(e) => {
                    e.preventDefault();
                    confirmRegenerate();
                  }}
                >
                  {regenerating ? "Issuing…" : "Get a new card"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      )}
    </div>
  );
}
