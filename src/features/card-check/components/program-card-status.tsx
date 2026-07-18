"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { regenerateCardAction } from "../api/actions";
import type { CardStatus } from "../types";
import { Plant } from "@/components/plant";
import { Cup } from "@/components/cup";
import { Wheel } from "@/components/wheel";
import { ScratchCard } from "@/components/scratch-card";
import { FlameLayers } from "@/components/flame-layers";
import { StampDots } from "@/components/stamp-dots";
import { PointsBar } from "@/components/points-bar";
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

  // Auto-opens once per retired card the first time this customer loads
  // /c after a vendor migrates its type. "Seen" persists in localStorage,
  // same no-server-round-trip trust model as regenerateCardAction's local
  // UX elsewhere on this page — there's no customer auth to key a
  // server-side "dismissed" flag off of.
  const [noticeOpen, setNoticeOpen] = useState(false);

  useEffect(() => {
    if (card.active || !card.replacedByName) return;
    const key = `loopkit:seen-replaced:${card.programId}`;
    if (!localStorage.getItem(key)) {
      // Reading localStorage (an external, non-reactive source) on mount to
      // seed one-time dialog state — not derivable from props/state, so
      // this isn't the render-time-derivation case the rule guards against.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setNoticeOpen(true);
    }
    // Only re-check when the identity of the retired card changes — not on
    // every render, and not keyed on active/replacedByName individually
    // since those don't change without programId also changing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card.programId]);

  function dismissNotice() {
    localStorage.setItem(`loopkit:seen-replaced:${card.programId}`, "1");
    setNoticeOpen(false);
  }

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
          {view.variant === "cup" ? (
            <Cup
              stage={view.stage}
              totalStages={view.totalStages}
              wilting={view.wilting}
            />
          ) : (
            <Plant
              stage={view.stage}
              totalStages={view.totalStages}
              wilting={view.wilting}
            />
          )}
        </div>
      ) : view?.kind === "flame" ? (
        <div className="flex flex-col items-center gap-2">
          <FlameLayers
            filled={view.filled}
            total={view.total}
            stage={view.stage}
            stageName={view.stageName}
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
        view.variant === "points" ? (
          <PointsBar filled={view.filled} total={view.total} />
        ) : (
          <StampDots filled={view.filled} total={view.total} />
        )
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
      {card.replacedByName && (
        <AlertDialog
          open={noticeOpen}
          onOpenChange={(open) => {
            if (!open) dismissNotice();
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {card.name} has a new card: {card.replacedByName}
              </AlertDialogTitle>
              <AlertDialogDescription>
                Your old rewards are still yours to redeem — show the shop this
                card. Next time you check in, you&apos;ll get the new card
                automatically.
                {card.carriedOverCount
                  ? ` Your ${card.carriedOverCount} stamps carried over.`
                  : ""}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogAction onClick={dismissNotice}>
                Got it
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}
