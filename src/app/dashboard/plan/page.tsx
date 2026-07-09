import { Check, Sparkles } from "lucide-react";
import { requireVendor } from "@/lib/auth";
import { isPro } from "@/lib/program";
import { UpgradeCta } from "@/app/dashboard/plan/upgrade-cta";

function Cell({ on }: { on: boolean }) {
  return (
    <span className="flex justify-center">
      {on ? (
        <Check className="size-4 text-primary" />
      ) : (
        <span className="text-muted-foreground/40">—</span>
      )}
    </span>
  );
}

export default async function PlanPage() {
  await requireVendor();
  const pro = await isPro();

  return (
    <main className="mx-auto max-w-2xl space-y-7 p-5 py-10">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Billing
          </p>
          <h1 className="font-display text-3xl font-bold tracking-tight">
            Plan
          </h1>
        </div>
        <span
          className={
            pro
              ? "inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1.5 text-sm font-semibold text-primary"
              : "inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1.5 text-sm font-semibold text-muted-foreground"
          }
        >
          {pro && <Sparkles className="size-3.5" />}
          {pro ? "Pro" : "Free"}
        </span>
      </div>

      {pro ? (
        <p className="rounded-xl border bg-card px-5 py-4 text-sm text-muted-foreground">
          You&apos;re on Pro — unlimited loyalty programs are unlocked. Thanks
          for supporting loopkit.
        </p>
      ) : (
        <div className="rounded-2xl border border-primary/40 bg-card p-5">
          <div className="flex items-center gap-2">
            <Sparkles className="size-4 text-primary" />
            <h2 className="font-display text-xl font-semibold">Pro</h2>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            Run more than one loyalty program at a time. Message us and
            we&apos;ll set you up — no card needed yet.
          </p>
          <div className="mt-4">
            <UpgradeCta />
          </div>
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border">
        <div className="grid grid-cols-[1fr_auto_auto] gap-x-5 px-5 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <span>Feature</span>
          <span className="text-center">Free</span>
          <span className="text-center">Pro</span>
        </div>
        <div className="grid grid-cols-[1fr_auto_auto] items-center gap-x-5 border-t px-5 py-3 text-sm">
          <span>Loyalty programs</span>
          <span className="text-center text-muted-foreground">1</span>
          <Cell on={true} />
        </div>
      </div>
    </main>
  );
}
