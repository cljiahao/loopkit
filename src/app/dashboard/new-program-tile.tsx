import Link from "next/link";
import { Plus } from "lucide-react";
import { ProLock } from "@/components/pro-lock";

// Trailing tile in the program grid — the one place "add a program" lives
// on the dashboard now that Edit/serve/etc moved onto each card.
export function NewProgramTile({ canCreate }: { canCreate: boolean }) {
  if (!canCreate) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed bg-card p-5 text-center shadow-sm">
        <p className="text-sm text-muted-foreground">
          Free plan includes 1 active program.
        </p>
        <ProLock label="Upgrade to Pro" />
      </div>
    );
  }

  return (
    <Link
      href="/setup"
      className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed p-5 text-center text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
    >
      <Plus className="size-5" />
      <span className="text-sm font-semibold">New program</span>
    </Link>
  );
}
