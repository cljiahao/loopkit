import { redirect } from "next/navigation";
import { requireVendor } from "@/lib/auth";
import { listPrograms, currentProgram } from "@/lib/program";
import { getProgramStats } from "@/lib/stats";

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border bg-card p-5 shadow-sm">
      <p className="text-2xl font-bold tracking-tight">{value}</p>
      <p className="mt-1 text-xs font-medium text-muted-foreground">{label}</p>
    </div>
  );
}

export default async function StatsPage({
  searchParams,
}: {
  searchParams: Promise<{ p?: string }>;
}) {
  await requireVendor();

  const programs = await listPrograms();
  const { p } = await searchParams;
  const program = currentProgram(programs, p);
  if (!program) redirect("/setup");

  const stats = await getProgramStats(program.id);
  const maxDay = Math.max(
    1,
    ...stats.visitsByDay.map((d: { date: string; count: number }) => d.count),
  );

  return (
    <main className="mx-auto max-w-4xl space-y-8 p-5 py-10">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Stats</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          How {program.name} is performing.
        </p>
      </div>

      {stats.enrolled === 0 ? (
        <div className="rounded-2xl border bg-card p-6 shadow-sm">
          <p className="text-sm text-muted-foreground">
            No customers yet — share your QR from the Grow tab to start
            enrolling.
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Tile label="Enrolled customers" value={String(stats.enrolled)} />
            <Tile
              label="Active / lapsed (30d)"
              value={`${stats.active} / ${stats.lapsed}`}
            />
            <Tile
              label="Redemption rate"
              value={`${Math.round(stats.redemptionRate * 100)}%`}
            />
            <Tile
              label="Repeat-visit rate"
              value={`${Math.round(stats.repeatVisitRate * 100)}%`}
            />
          </div>

          <div className="rounded-2xl border bg-card p-6 shadow-sm">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Last 30 days
            </h2>
            <div className="mt-4 flex h-24 items-end gap-[3px]">
              {stats.visitsByDay.map((d: { date: string; count: number }) => (
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
          </div>
        </>
      )}
    </main>
  );
}
