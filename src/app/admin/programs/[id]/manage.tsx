"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { useAsyncAction } from "@/hooks/use-async-action";
import { setProgramActive, removeCard } from "@/app/admin/actions";
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

type ManageCard = {
  id: string;
  phone: string;
  stamp_count: number;
  reward_count: number;
};

/** Active toggle for the whole program + a per-card Remove control. */
export function Manage({
  program,
  cards,
  stampsRequired,
}: {
  program: { id: string; name: string; active: boolean };
  cards: ManageCard[];
  stampsRequired: number;
}) {
  return (
    <div className="space-y-6">
      <ActiveToggle program={program} />
      <div className="rounded-2xl border bg-card shadow-sm">
        <div className="border-b px-5 py-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Cards
        </div>
        {cards.length === 0 ? (
          <p className="px-5 py-6 text-sm text-muted-foreground">
            No cards yet.
          </p>
        ) : (
          <ul className="divide-y">
            {cards.map((card) => (
              <li
                key={card.id}
                className="flex items-center justify-between gap-3 px-5 py-3 text-sm"
              >
                <div className="min-w-0">
                  <p className="font-medium">{card.phone}</p>
                  <p className="mt-0.5 text-muted-foreground">
                    {card.stamp_count}/{stampsRequired} stamps
                    {card.reward_count > 0 &&
                      ` · ${card.reward_count} reward${card.reward_count === 1 ? "" : "s"}`}
                  </p>
                </div>
                <RemoveCardButton card={card} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function ActiveToggle({
  program,
}: {
  program: { id: string; name: string; active: boolean };
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const { pending, run } = useAsyncAction();
  const nextActive = !program.active;

  function confirm() {
    run(async () => {
      const fd = new FormData();
      fd.set("programId", program.id);
      fd.set("active", String(nextActive));
      const result = await setProgramActive(fd);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(
        `${program.name} is now ${nextActive ? "active" : "inactive"}.`,
      );
      router.refresh();
      setOpen(false);
    });
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button
          variant={program.active ? "outline" : "default"}
          size="sm"
          className="rounded-xl"
        >
          {program.active ? "Deactivate program" : "Reactivate program"}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {program.active ? "Deactivate" : "Reactivate"} {program.name}?
          </AlertDialogTitle>
          <AlertDialogDescription>
            {program.active
              ? "Customers won't be able to check their stamps until it's reactivated."
              : "Customers will be able to check their stamps again."}
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
            {pending ? "Saving…" : program.active ? "Deactivate" : "Reactivate"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function RemoveCardButton({ card }: { card: ManageCard }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const { pending, run } = useAsyncAction();

  function confirm() {
    run(async () => {
      const fd = new FormData();
      fd.set("cardId", card.id);
      const result = await removeCard(fd);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(`Removed ${card.phone}'s card.`);
      router.refresh();
      setOpen(false);
    });
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="rounded-xl text-muted-foreground hover:text-destructive"
        >
          <Trash2 className="size-4" />
          <span className="sr-only">Remove card</span>
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove this card?</AlertDialogTitle>
          <AlertDialogDescription>
            Remove {card.phone}&apos;s card? This deletes their stamps and
            history for this shop. It can&apos;t be undone.
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
            {pending ? "Removing…" : "Remove"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
