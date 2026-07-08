"use client";

import { ConfettiBurst } from "@/components/confetti-burst";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export function RewardCelebration({
  open,
  phone,
  rewardText,
  onOpenChange,
}: {
  open: boolean;
  phone: string;
  rewardText: string;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <>
      <ConfettiBurst active={open} />
      <AlertDialog open={open} onOpenChange={onOpenChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-center text-2xl">
              🎉 Reward unlocked!
            </AlertDialogTitle>
            <AlertDialogDescription className="text-center">
              {phone} just earned {rewardText}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction
              className="w-full"
              onClick={() => onOpenChange(false)}
            >
              Nice!
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
