"use client";

import { useEffect, useState } from "react";
import type { Progress } from "@/lib/engine/types";
import { Plant } from "@/components/plant";
import { Cup } from "@/components/cup";
import { Wheel } from "@/components/wheel";
import { ScratchCard } from "@/components/scratch-card";
import { FlameLayers } from "@/components/flame-layers";
import { StampDots } from "@/components/stamp-dots";
import { PointsBar } from "@/components/points-bar";
import { CardBurst } from "@/components/card-burst";
import { cn } from "@/lib/utils";

const CHANCE_RESULT_VISIBLE_MS = 1500;

// Mirrors ProgramCardStatus's view-kind switch (src/app/c/program-card-status.tsx)
// — same components, same props — so the /setup preview can never visually
// drift from a real customer card. No redeem/regenerate interactivity —
// this is a static snapshot of the current form values, not a live card.
//
// Unlike ProgramCardStatus, every visual sits in one fixed-height, centered
// box (h-36) here: switching card type in /setup shouldn't make the preview
// panel jump around in height between a wide stamp grid, a square plant/
// wheel, or a compact flame layer.
export function PreviewCard({
  progress,
  name,
  rewardText,
  celebrating = false,
  revealing = false,
  lastChanceResult = null,
}: {
  progress: Progress;
  name: string;
  rewardText: string;
  celebrating?: boolean;
  revealing?: boolean;
  lastChanceResult?: { won: boolean } | null;
}) {
  const view = progress.view;

  const [showChanceResult, setShowChanceResult] = useState(false);
  useEffect(() => {
    if (!lastChanceResult) return;
    // lastChanceResult is external input (a new tick result from
    // usePreviewAnimation), not derivable from existing render state — same
    // external-input-driven case already established in preview-animation.ts
    // and program-card-status.tsx, so the render-time-derivation case
    // react-hooks/set-state-in-effect guards against doesn't apply here.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setShowChanceResult(true);
    const timer = setTimeout(
      () => setShowChanceResult(false),
      CHANCE_RESULT_VISIBLE_MS,
    );
    return () => clearTimeout(timer);
  }, [lastChanceResult]);

  return (
    <div className="relative space-y-4 rounded-xl border bg-muted/40 p-4">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Customer preview
      </p>
      <p className="text-sm font-semibold">{name || "Your card"}</p>
      <div className="flex h-36 items-center justify-center">
        {view.kind === "plant" ? (
          view.variant === "cup" ? (
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
          )
        ) : view.kind === "flame" ? (
          <FlameLayers
            filled={view.filled}
            total={view.total}
            stage={view.stage}
            stageName={view.stageName}
          />
        ) : view.kind === "chance" ? (
          view.variant === "wheel" ? (
            <Wheel
              segments={view.segments}
              landedId={view.landedId}
              spinning={revealing}
            />
          ) : (
            <ScratchCard
              scratching={revealing}
              revealed={view.landedId !== null}
              label={
                view.segments.find((s) => s.id === view.landedId)?.label ?? ""
              }
              reward={
                view.segments.find((s) => s.id === view.landedId)?.reward ??
                false
              }
            />
          )
        ) : view.kind === "dots" ? (
          view.variant === "points" ? (
            <PointsBar filled={view.filled} total={view.total} />
          ) : (
            <StampDots filled={view.filled} total={view.total} />
          )
        ) : null}
      </div>
      <p className="font-mono text-sm font-medium">{progress.label}</p>
      <p className="text-sm text-muted-foreground">
        Reward: {rewardText || "—"}
      </p>
      <CardBurst active={celebrating} />
      {view.kind === "chance" && lastChanceResult && showChanceResult && (
        <div
          className={cn(
            "absolute top-3 right-3 rounded-full px-3 py-1 text-xs font-semibold shadow-sm",
            lastChanceResult.won
              ? "bg-gold text-gold-foreground"
              : "bg-muted text-muted-foreground",
          )}
        >
          {lastChanceResult.won ? "🎉 You won!" : "Try again"}
        </div>
      )}
    </div>
  );
}
