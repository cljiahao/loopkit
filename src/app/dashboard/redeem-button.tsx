"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useAsyncAction } from "@/hooks/use-async-action";
import { redeemAction } from "@/app/dashboard/actions";
import type { StampCard } from "@/app/dashboard/card";
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

/** Redeem control with an AlertDialog confirm — resetting a card is destructive. */
export function RedeemButton({
  card,
  onRedeemed,
}: {
  card: StampCard;
  onRedeemed: (card: StampCard) => void;
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const { pending, run } = useAsyncAction();

  function confirm() {
    run(async () => {
      const fd = new FormData();
      fd.set("card_id", card.id);
      const result = await redeemAction(fd);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(`Reward redeemed for ${card.phone}.`);
      onRedeemed(result.card);
      router.refresh();
      setOpen(false);
    });
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button variant="outline" size="sm" className="rounded-xl">
          Redeem
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Redeem reward?</AlertDialogTitle>
          <AlertDialogDescription>
            Redeem reward for {card.phone}? This resets their card.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={pending}
            onClick={(e) => {
              e.preventDefault();
              confirm();
            }}
          >
            {pending ? "Redeeming…" : "Redeem"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
