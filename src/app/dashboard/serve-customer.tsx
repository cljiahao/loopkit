"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useAsyncAction } from "@/hooks/use-async-action";
import {
  stampAction,
  recordVisitAction,
  lookupAction,
  redeemPlantAction,
} from "@/app/dashboard/actions";
import { RedeemButton } from "@/app/dashboard/redeem-button";
import { ScanButton } from "@/app/dashboard/scan-button";
import { Plant } from "@/components/plant";
import type { StampCard } from "@/app/dashboard/card";
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

type PlantView = {
  kind: "plant";
  stage: number;
  stageName: string;
  totalStages: number;
  wilting: boolean;
};

type ServeResult =
  | { mode: "stamp"; phone: string; card: StampCard; rewardReady: boolean }
  | {
      mode: "lucky";
      phone: string;
      played: boolean;
      won: boolean;
      label: string;
    }
  | {
      mode: "plant";
      phone: string;
      view: PlantView;
      label: string;
      rewardReady: boolean;
      rewardUnlocked: boolean;
    };

const ACTION_COPY: Record<string, { idle: string; pending: string }> = {
  lucky: { idle: "Play", pending: "Playing…" },
  plant: { idle: "Water", pending: "Watering…" },
  stamp: { idle: "Add stamp", pending: "Stamping…" },
};

export function ServeCustomer({
  programId,
  type,
  stampsRequired,
  rewardText,
}: {
  programId: string;
  type: string;
  stampsRequired: number;
  rewardText: string;
}) {
  const router = useRouter();
  const { pending, run } = useAsyncAction();
  const phoneRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [result, setResult] = useState<ServeResult | null>(null);
  const [redeemOpen, setRedeemOpen] = useState(false);
  const [lookingUp, setLookingUp] = useState(false);

  const copy = ACTION_COPY[type] ?? ACTION_COPY.stamp;

  function onPrimary(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formEl = e.currentTarget;
    const formData = new FormData(formEl);
    run(async () => {
      if (type === "lucky") {
        const res = await recordVisitAction(formData);
        if (!res.success) {
          toast.error(res.error);
          return;
        }
        if (res.rewardUnlocked) {
          toast.success(`🎉 ${res.phone} won ${res.reward_text}!`);
        } else {
          toast(`No win this time for ${res.phone}.`);
        }
        setResult({
          mode: "lucky",
          phone: res.phone,
          played: true,
          won: res.rewardUnlocked,
          label: res.progress.label,
        });
      } else if (type === "plant") {
        const res = await recordVisitAction(formData);
        if (!res.success) {
          toast.error(res.error);
          return;
        }
        if (res.progress.view.kind !== "plant") return;
        if (res.rewardUnlocked) {
          toast.success(
            `🌻 ${res.phone} bloomed — ${res.reward_text} unlocked!`,
          );
        } else {
          toast(`Watered ${res.phone} — now ${res.progress.view.stageName}.`);
        }
        setResult({
          mode: "plant",
          phone: res.phone,
          view: res.progress.view,
          label: res.progress.label,
          rewardReady: res.progress.rewardReady,
          rewardUnlocked: res.rewardUnlocked,
        });
      } else {
        const res = await stampAction(formData);
        if (!res.success) {
          toast.error(res.error);
          return;
        }
        toast.success(
          `Stamped ${res.card.phone} — ${res.card.stamp_count}/${stampsRequired}`,
        );
        setResult({
          mode: "stamp",
          phone: res.card.phone,
          card: res.card,
          rewardReady: res.rewardReady,
        });
      }
      router.refresh();
      formEl.reset();
      phoneRef.current?.focus();
    });
  }

  function onLookup() {
    const formEl = formRef.current;
    if (!formEl) return;
    const formData = new FormData(formEl);
    run(async () => {
      setLookingUp(true);
      try {
        const res = await lookupAction(formData);
        if (!res.success) {
          toast.error(res.error);
          return;
        }
        if (type === "plant") {
          if (res.progress.view.kind !== "plant") return;
          setResult({
            mode: "plant",
            phone: res.card.phone,
            view: res.progress.view,
            label: res.progress.label,
            rewardReady: res.progress.rewardReady,
            rewardUnlocked: false,
          });
        } else if (type === "lucky") {
          setResult({
            mode: "lucky",
            phone: res.card.phone,
            played: false,
            won: false,
            label: res.progress.label,
          });
        } else {
          setResult({
            mode: "stamp",
            phone: res.card.phone,
            card: res.card,
            rewardReady: res.progress.rewardReady,
          });
        }
      } finally {
        setLookingUp(false);
      }
    });
  }

  function confirmRedeemPlant() {
    if (!result || result.mode !== "plant") return;
    const phone = result.phone;
    run(async () => {
      const fd = new FormData();
      fd.set("phone", phone);
      fd.set("program_id", programId);
      const res = await redeemPlantAction(fd);
      if (!res.success) {
        toast.error(res.error);
        return;
      }
      toast.success(`Reward redeemed for ${res.phone}.`);
      setResult(null);
      setRedeemOpen(false);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <ScanButton
        onScanned={(phone) => {
          if (phoneRef.current) {
            phoneRef.current.value = phone;
            formRef.current?.requestSubmit();
          }
        }}
      />

      <div className="relative">
        <div className="absolute inset-0 flex items-center" aria-hidden="true">
          <div className="w-full border-t" />
        </div>
        <div className="relative flex justify-center">
          <span className="bg-card px-3 text-xs font-medium text-muted-foreground">
            or enter phone manually
          </span>
        </div>
      </div>

      <form
        ref={formRef}
        onSubmit={onPrimary}
        className="flex flex-wrap items-end gap-3"
      >
        <input type="hidden" name="program_id" value={programId} />
        <div className="min-w-48 flex-1 space-y-2">
          <Label
            htmlFor="phone"
            className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
          >
            Customer phone
          </Label>
          <Input
            ref={phoneRef}
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
          className="h-11 rounded-xl px-6 font-semibold"
        >
          {pending && !lookingUp ? copy.pending : copy.idle}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={pending}
          onClick={onLookup}
          className="h-11 rounded-xl px-5 font-semibold"
        >
          {lookingUp ? "Looking up…" : "Look up"}
        </Button>
      </form>

      {result?.mode === "stamp" && (
        <div
          className={
            result.rewardReady
              ? "rounded-xl border border-gold bg-gold/10 p-4"
              : "rounded-xl border bg-muted/40 p-4"
          }
        >
          <p className="text-sm font-medium">{result.phone}</p>
          <p className="mt-1 font-mono text-sm text-muted-foreground">
            {result.card.stamp_count} / {stampsRequired} stamps
          </p>
          {result.rewardReady && (
            <div className="mt-3 space-y-2">
              <p className="text-sm font-semibold text-gold-foreground">
                Reward ready!
              </p>
              <RedeemButton
                card={result.card}
                onRedeemed={(next) =>
                  setResult({
                    mode: "stamp",
                    phone: next.phone,
                    card: next,
                    rewardReady: false,
                  })
                }
              />
            </div>
          )}
        </div>
      )}

      {result?.mode === "lucky" && (
        <div
          className={
            result.won
              ? "rounded-xl border border-gold bg-gold/10 p-4"
              : "rounded-xl border bg-muted/40 p-4"
          }
        >
          <p className="text-sm font-medium">{result.phone}</p>
          {result.won ? (
            <p className="mt-1 text-sm font-semibold text-gold-foreground">
              🎉 Won {rewardText}!
            </p>
          ) : result.played ? (
            <p className="mt-1 text-sm text-muted-foreground">
              No win this time.
            </p>
          ) : (
            <p className="mt-1 text-sm text-muted-foreground">{result.label}</p>
          )}
        </div>
      )}

      {result?.mode === "plant" && (
        <div
          className={
            result.rewardReady
              ? "rounded-xl border border-gold bg-gold/10 p-4"
              : "rounded-xl border bg-muted/40 p-4"
          }
        >
          <div className="flex items-center gap-4">
            <Plant
              stage={result.view.stage}
              totalStages={result.view.totalStages}
              wilting={result.view.wilting}
              className="size-24 shrink-0"
            />
            <div className="min-w-0 space-y-1">
              <p className="text-sm font-medium">{result.phone}</p>
              <p className="text-sm text-muted-foreground">{result.label}</p>
              {result.rewardUnlocked && (
                <p className="text-sm font-semibold text-gold-foreground">
                  🌻 Bloomed! {rewardText} unlocked.
                </p>
              )}
            </div>
          </div>
          {result.rewardReady && (
            <div className="mt-4">
              <AlertDialog open={redeemOpen} onOpenChange={setRedeemOpen}>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" size="sm" className="rounded-xl">
                    Redeem
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Redeem reward?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Redeem {rewardText} for {result.phone}? This resets their
                      plant to a seed.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel disabled={pending}>
                      Cancel
                    </AlertDialogCancel>
                    <AlertDialogAction
                      disabled={pending}
                      onClick={(e) => {
                        e.preventDefault();
                        confirmRedeemPlant();
                      }}
                    >
                      {pending ? "Redeeming…" : "Redeem"}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
