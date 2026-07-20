import { redirect } from "next/navigation";
import { ArrowUp, ArrowDown } from "lucide-react";
import { requireVendor } from "@/features/auth";
import { listPrograms, currentProgram } from "@/lib/program";
import { getProgramStats, getVendorStats } from "@/lib/stats";
import { cn } from "@/lib/utils";
import { ProgramSwitcher } from "@/app/dashboard/program-switcher";
import { ElevatedCard } from "@/components/elevated-card";

function Delta({ pct }: { pct: number | null }) {
  if (pct === null) return null;
  const up = pct >= 0;
  const Icon = up ? ArrowUp : ArrowDown;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[0.65rem] font-semibold tabular-nums",
        up
          ? "bg-emerald-500/12 text-emerald-700 dark:text-emerald-400"
          : "bg-destructive/12 text-destructive",
      )}
      title="vs. the prior 30 days"
    >
      <Icon className="size-3" />
      {Math.abs(Math.round(pct))}%
    </span>
  );
}

function Tile({
  label,
  value,
  delta,
}: {
  label: string;
  value: string;
  delta?: number | null;
}) {
  return (
    <ElevatedCard className="p-5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-2xl font-bold tracking-tight">{value}</p>
        {delta !== undefined && <Delta pct={delta} />}
      </div>
      <p className="mt-1 text-xs font-medium text-muted-foreground">{label}</p>
    </ElevatedCard>
  );
}

type StatsPageProps = {
  searchParams: Promise<{ p?: string }>;
};

export default async function StatsPage({ searchParams }: StatsPageProps) {
  await requireVendor();

  const programs = await listPrograms();
  const { p } = await searchParams;

  if (!p && programs.length === 1) {
    redirect(`/dashboard/stats?p=${programs[0].id}`);
  }

  if (!p) {
    const stats = await getVendorStats(programs.map((prog) => prog.id));
    const maxDay = Math.max(1, ...stats.visitsByDay.map((d) => d.count));

    return (
      <main className="mx-auto max-w-7xl space-y-8 p-5 py-10">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Stats</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            How your shop is performing across every program.
          </p>
        </div>

        <ProgramSwitcher
          programs={programs}
          currentId=""
          basePath="/dashboard/stats"
        />

        {stats.enrolled === 0 ? (
          <ElevatedCard className="p-6">
            <p className="text-sm text-muted-foreground">
              No customers yet — share your QR from the Counter page to start
              enrolling.
            </p>
          </ElevatedCard>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Tile label="Enrolled customers" value={String(stats.enrolled)} />
              <Tile
                label="Active / lapsed (30d)"
                value={`${stats.active} / ${stats.lapsed}`}
                delta={stats.activeDelta}
              />
              <Tile
                label="Redemption rate"
                value={`${Math.round(stats.redemptionRate * 100)}%`}
              />
              <Tile
                label="Repeat-visit rate"
                value={`${Math.round(stats.repeatVisitRate * 100)}%`}
              />
              <Tile
                label="Visits (30d)"
                value={String(stats.visits30d)}
                delta={stats.visitsDelta}
              />
              <Tile
                label="Rewards redeemed (30d)"
                value={String(stats.rewards30d)}
                delta={stats.rewardsDelta}
              />
              <Tile
                label="Avg days between visits"
                value={
                  stats.avgDaysBetweenVisits === null
                    ? "—"
                    : `${stats.avgDaysBetweenVisits.toFixed(1)}d`
                }
              />
            </div>

            <ElevatedCard className="p-6">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Last 30 days
              </h2>
              <div className="mt-4 flex h-24 items-end gap-[3px]">
                {stats.visitsByDay.map((d) => (
                  <div
                    key={d.date}
                    title={`${d.date}: ${d.count}`}
                    className="flex-1 rounded-t bg-primary/70"
                    style={{
                      height: `${Math.max(4, (d.count / maxDay) * 100)}%`,
                    }}
                  />
                ))}
              </div>
            </ElevatedCard>
          </>
        )}
      </main>
    );
  }

  const program = currentProgram(programs, p);
  if (!program) redirect("/setup");

  const stats = await getProgramStats(program.id);
  const maxDay = Math.max(1, ...stats.visitsByDay.map((d) => d.count));

  return (
    <main className="mx-auto max-w-7xl space-y-8 p-5 py-10">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Stats</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          How {program.name} is performing.
        </p>
      </div>

      <ProgramSwitcher
        programs={programs}
        currentId={program.id}
        basePath="/dashboard/stats"
      />

      {stats.enrolled === 0 ? (
        <ElevatedCard className="p-6">
          <p className="text-sm text-muted-foreground">
            No customers yet — share your QR from the Counter page to start
            enrolling.
          </p>
        </ElevatedCard>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Tile label="Enrolled customers" value={String(stats.enrolled)} />
            <Tile
              label="Active / lapsed (30d)"
              value={`${stats.active} / ${stats.lapsed}`}
              delta={stats.activeDelta}
            />
            <Tile
              label="Redemption rate"
              value={`${Math.round(stats.redemptionRate * 100)}%`}
            />
            <Tile
              label="Repeat-visit rate"
              value={`${Math.round(stats.repeatVisitRate * 100)}%`}
            />
            <Tile
              label="Visits (30d)"
              value={String(stats.visits30d)}
              delta={stats.visitsDelta}
            />
            <Tile
              label="Rewards redeemed (30d)"
              value={String(stats.rewards30d)}
              delta={stats.rewardsDelta}
            />
            <Tile
              label="Avg days between visits"
              value={
                stats.avgDaysBetweenVisits === null
                  ? "—"
                  : `${stats.avgDaysBetweenVisits.toFixed(1)}d`
              }
            />
          </div>

          <ElevatedCard className="p-6">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Last 30 days
            </h2>
            <div className="mt-4 flex h-24 items-end gap-[3px]">
              {stats.visitsByDay.map((d) => (
                <div
                  key={d.date}
                  title={`${d.date}: ${d.count}`}
                  className="flex-1 rounded-t bg-primary/70"
                  style={{
                    height: `${Math.max(4, (d.count / maxDay) * 100)}%`,
                  }}
                />
              ))}
            </div>
          </ElevatedCard>
        </>
      )}
    </main>
  );
}
