"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useAsyncAction } from "@/hooks/use-async-action";
import { recordVisitAction, redeemPlantAction } from "@/app/dashboard/actions";
import { ScanButton } from "@/app/dashboard/scan-button";
import { Plant } from "@/components/plant";
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

type WaterResult = {
  view: PlantView;
  label: string;
  phone: string;
  reward_text: string;
  rewardUnlocked: boolean;
};

export function PlantForm({ programId }: { programId: string }) {
  const router = useRouter();
  const { pending, run } = useAsyncAction();
  const phoneRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [result, setResult] = useState<WaterResult | null>(null);
  const [redeemOpen, setRedeemOpen] = useState(false);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formEl = e.currentTarget;
    const formData = new FormData(formEl);
    run(async () => {
      const res = await recordVisitAction(formData);
      if (!res.success) {
        toast.error(res.error);
        return;
      }
      if (res.progress.view.kind !== "plant") return;
      if (res.rewardUnlocked) {
        toast.success(`🌻 ${res.phone} bloomed — ${res.reward_text} unlocked!`);
      } else {
        toast(`Watered ${res.phone} — now ${res.progress.view.stageName}.`);
      }
      setResult({
        view: res.progress.view,
        label: res.progress.label,
        phone: res.phone,
        reward_text: res.reward_text,
        rewardUnlocked: res.rewardUnlocked,
      });
      router.refresh();
      formEl.reset();
      phoneRef.current?.focus();
    });
  }

  function confirmRedeem() {
    if (!result) return;
    run(async () => {
      const fd = new FormData();
      fd.set("phone", result.phone);
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
      <form ref={formRef} onSubmit={onSubmit} className="flex items-end gap-3">
        <input type="hidden" name="program_id" value={programId} />
        <div className="flex-1 space-y-2">
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
          {pending ? "Watering…" : "Water"}
        </Button>
        <ScanButton
          onScanned={(phone) => {
            if (phoneRef.current) {
              phoneRef.current.value = phone;
              formRef.current?.requestSubmit();
            }
          }}
        />
      </form>

      {result && (
        <div
          className={
            result.rewardUnlocked
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
                  🌻 Bloomed! {result.reward_text} unlocked.
                </p>
              )}
            </div>
          </div>
          {result.rewardUnlocked && (
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
                      Redeem {result.reward_text} for {result.phone}? This
                      resets their plant to a seed.
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
                        confirmRedeem();
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
