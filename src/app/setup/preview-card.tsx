import type { Progress } from "@/lib/engine/types";
import { Plant } from "@/components/plant";
import { Cup } from "@/components/cup";
import { Wheel } from "@/components/wheel";
import { ScratchCard } from "@/components/scratch-card";
import { FlameLayers } from "@/components/flame-layers";
import { StampDots } from "@/components/stamp-dots";

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
}: {
  progress: Progress;
  name: string;
  rewardText: string;
}) {
  const view = progress.view;
  return (
    <div className="space-y-4 rounded-xl border bg-muted/40 p-4">
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
            <Wheel segments={view.segments} landedId={view.landedId} />
          ) : (
            <ScratchCard revealed={false} label="" reward={false} />
          )
        ) : view.kind === "dots" ? (
          <StampDots filled={view.filled} total={view.total} />
        ) : null}
      </div>
      <p className="font-mono text-sm font-medium">{progress.label}</p>
      <p className="text-sm text-muted-foreground">
        Reward: {rewardText || "—"}
      </p>
    </div>
  );
}
