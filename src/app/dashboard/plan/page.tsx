import { Check, Sparkles } from "lucide-react";
import { requireVendor } from "@/features/auth";
import { isPro, listPrograms, currentProgram } from "@/lib/program";
import { getProgramStats } from "@/lib/stats";
import { UpgradeCta } from "@/app/dashboard/plan/upgrade-cta";
import { Badge } from "@/components/ui/badge";
import { ElevatedCard } from "@/components/elevated-card";

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

const FEATURES = [
  { label: "Loyalty programs", free: "1", pro: "∞" },
  { label: "Loyalty card templates", free: true, pro: true },
  { label: "Change card type", free: true, pro: true },
  { label: "Stats dashboard", free: true, pro: true },
] as const;

export default async function PlanPage({
  searchParams,
}: {
  searchParams: Promise<{ p?: string }>;
}) {
  await requireVendor();
  const [pro, programs] = await Promise.all([isPro(), listPrograms()]);
  const { p } = await searchParams;
  const program = currentProgram(programs, p);
  const stats = program ? await getProgramStats(program.id) : null;

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
        <span className="inline-flex items-center gap-1.5">
          {pro && <Sparkles className="size-3.5 text-primary" />}
          <Badge variant={pro ? "gold" : "secondary"}>
            {pro ? "Pro" : "Free"}
          </Badge>
        </span>
      </div>

      {stats && stats.enrolled > 0 && program && (
        <ElevatedCard className="px-5 py-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            How your program is doing
          </p>
          <p className="mt-1.5 text-sm">
            <strong className="font-semibold">
              {Math.round(stats.repeatVisitRate * 100)}%
            </strong>{" "}
            of your customers have come back for a second visit, and you&apos;ve
            handed out{" "}
            <strong className="font-semibold">{stats.rewardsTotal}</strong>{" "}
            reward
            {stats.rewardsTotal === 1 ? "" : "s"} so far with {program.name}.
          </p>
        </ElevatedCard>
      )}

      {pro ? (
        <ElevatedCard
          as="section"
          className="px-5 py-4 text-sm text-muted-foreground"
        >
          You&apos;re on Pro — unlimited loyalty programs are unlocked. Thanks
          for supporting loopkit.
        </ElevatedCard>
      ) : (
        <ElevatedCard className="border-primary/40 p-5">
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
        </ElevatedCard>
      )}

      {/* Header and every row use the same fixed column widths (not "auto")
          so the Free/Pro ticks line up under their headers regardless of
          each row being its own grid instance. */}
      <div className="overflow-hidden rounded-2xl border">
        <div className="grid grid-cols-[1fr_2.75rem_2.75rem] gap-x-5 px-5 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <span>Feature</span>
          <span className="text-center">Free</span>
          <span className="text-center">Pro</span>
        </div>
        {FEATURES.map((f) => (
          <div
            key={f.label}
            className="grid grid-cols-[1fr_2.75rem_2.75rem] items-center gap-x-5 border-t px-5 py-3 text-sm"
          >
            <span>{f.label}</span>
            <span className="text-center text-muted-foreground">
              {typeof f.free === "string" ? f.free : <Cell on={f.free} />}
            </span>
            <span className="text-center">
              {typeof f.pro === "string" ? f.pro : <Cell on={f.pro} />}
            </span>
          </div>
        ))}
      </div>
    </main>
  );
}
