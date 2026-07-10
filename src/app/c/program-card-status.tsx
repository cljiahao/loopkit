"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { regenerateCardAction } from "@/app/c/actions";
import type { CardStatus } from "@/app/c/status-state";
import { Plant } from "@/components/plant";
import { Wheel } from "@/components/wheel";
import { ScratchCard } from "@/components/scratch-card";
import { StreakFlame } from "@/components/streak-flame";
import { StampDots } from "@/components/stamp-dots";
import { Button } from "@/components/ui/button";
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

// One customer's progress card for a single program, at the vendor-level
// /c page. Each instance owns its own regenerate-dialog state — necessary
// now that a customer can have several of these on one page at once.
export function ProgramCardStatus({
  card,
  phone,
}: {
  card: CardStatus;
  phone: string;
}) {
  const [regenOpen, setRegenOpen] = useState(false);
  const [regenerating, startRegenerate] = useTransition();
  const view = card.view;

  function confirmRegenerate() {
    startRegenerate(async () => {
      const fd = new FormData();
      fd.set("program", card.programId);
      fd.set("phone", phone);
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
    <div className="space-y-4 rounded-xl border bg-muted/40 p-4">
      <p className="text-sm font-semibold">{card.name}</p>
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
                view.segments.find((s) => s.id === view.landedId)?.label ?? ""
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
      <p className="font-mono text-sm font-medium">{card.label}</p>
      <p className="text-sm text-muted-foreground">
        Reward: {card.reward_text}
      </p>
      {card.rewardReady && (
        <p className="text-sm font-semibold text-gold-accent">
          🎉 Reward ready!
        </p>
      )}
      {card.expired && (
        <p className="text-sm font-semibold text-destructive">
          This card has expired.
        </p>
      )}
      {!card.active && (
        <p className="text-xs text-muted-foreground">
          {card.replacedByName
            ? `This card is retired — check your rewards again to see your new ${card.replacedByName} card.`
            : "This program is no longer joinable, but you can still redeem what you've earned."}
        </p>
      )}
      {card.qr && (
        <div className="flex flex-col items-center gap-2 pt-2">
          <div
            className="w-full max-w-[180px] rounded-xl border bg-white p-3 [&_svg]:h-auto [&_svg]:w-full"
            dangerouslySetInnerHTML={{ __html: card.qr }}
          />
          <p className="text-xs text-muted-foreground">Show this to the shop</p>
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
            {card.expired ? "Get a new card" : "Lost your code? Get a new one"}
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Get a new card?</AlertDialogTitle>
            <AlertDialogDescription>
              This issues a fresh QR code and resets your progress to zero. Any
              reward you&apos;ve already earned should be redeemed at the shop
              first.
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
  );
}
