"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useAsyncAction } from "@/hooks/use-async-action";
import { stampAction } from "@/app/dashboard/actions";
import { RedeemButton } from "@/app/dashboard/redeem-button";
import { ScanButton } from "@/app/dashboard/scan-button";
import type { StampCard } from "@/app/dashboard/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function StampForm({ stampsRequired }: { stampsRequired: number }) {
  const router = useRouter();
  const { pending, run } = useAsyncAction();
  const phoneRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [card, setCard] = useState<StampCard | null>(null);
  const [rewardReady, setRewardReady] = useState(false);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formEl = e.currentTarget;
    const formData = new FormData(formEl);
    run(async () => {
      const result = await stampAction(formData);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(
        `Stamped ${result.card.phone} — ${result.card.stamp_count}/${stampsRequired}`,
      );
      setCard(result.card);
      setRewardReady(result.rewardReady);
      // Refresh the server-rendered recent-activity list.
      router.refresh();
      // Clear + refocus so the next customer can be stamped without reaching
      // for the field again.
      formEl.reset();
      phoneRef.current?.focus();
    });
  }

  return (
    <div className="space-y-4">
      <form ref={formRef} onSubmit={onSubmit} className="flex items-end gap-3">
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
          {pending ? "Stamping…" : "Add stamp"}
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

      {card && (
        <div className="rounded-xl border bg-muted/40 p-4">
          <p className="text-sm font-medium">{card.phone}</p>
          <p className="mt-1 font-mono text-sm text-muted-foreground">
            {card.stamp_count} / {stampsRequired} stamps
          </p>
          {rewardReady && (
            <div className="mt-3 space-y-2">
              <p className="text-sm font-semibold text-gold-foreground">
                Reward ready!
              </p>
              <RedeemButton
                card={card}
                onRedeemed={(next) => {
                  setCard(next);
                  setRewardReady(false);
                }}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
