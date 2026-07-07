"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useAsyncAction } from "@/hooks/use-async-action";
import { lookupAction } from "@/app/dashboard/actions";
import { RedeemButton } from "@/app/dashboard/redeem-button";
import type { StampCard } from "@/app/dashboard/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function CardLookup({ stampsRequired }: { stampsRequired: number }) {
  const { pending, run } = useAsyncAction();
  const [card, setCard] = useState<StampCard | null>(null);
  const [rewardReady, setRewardReady] = useState(false);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    run(async () => {
      const result = await lookupAction(formData);
      if (!result.success) {
        setCard(null);
        toast.error(result.error);
        return;
      }
      setCard(result.card);
      setRewardReady(result.rewardReady);
    });
  }

  return (
    <div className="space-y-4">
      <form onSubmit={onSubmit} className="flex items-end gap-3">
        <div className="flex-1 space-y-2">
          <Label
            htmlFor="lookup-phone"
            className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
          >
            Customer phone
          </Label>
          <Input
            id="lookup-phone"
            name="phone"
            type="tel"
            required
            placeholder="9123 4567"
            className="h-11 rounded-xl"
          />
        </div>
        <Button
          type="submit"
          variant="outline"
          disabled={pending}
          className="h-11 rounded-xl px-6 font-semibold"
        >
          {pending ? "Looking…" : "Look up"}
        </Button>
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
