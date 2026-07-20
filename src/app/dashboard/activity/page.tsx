import { redirect } from "next/navigation";
import { requireVendor } from "@/features/auth";
import { listPrograms, currentProgram } from "@/lib/program";
import { listActivity } from "@/lib/activity";
import { ProgramSwitcher } from "@/app/dashboard/program-switcher";
import { ActivityTable } from "@/app/dashboard/activity/activity-table";
import { ActivityFilters } from "@/app/dashboard/activity/activity-filters";

const PAGE_SIZE = 25;

type ActivityPageProps = {
  searchParams: Promise<{
    p?: string;
    type?: string;
    from?: string;
    to?: string;
    page?: string;
  }>;
};

function paginationHref(
  basePath: string,
  current: Record<string, string | undefined>,
  page: number,
): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(current)) {
    if (value) params.set(key, value);
  }
  params.set("page", String(page));
  return `${basePath}?${params.toString()}`;
}

export default async function ActivityPage({
  searchParams,
}: ActivityPageProps) {
  await requireVendor();

  const programs = await listPrograms();
  const { p, type: rawType, from, to, page: rawPage } = await searchParams;
  const type =
    rawType === "stamps" || rawType === "rewards" ? rawType : undefined;
  const page = Math.max(1, Number(rawPage) || 1);
  const offset = (page - 1) * PAGE_SIZE;

  if (!p && programs.length === 1) {
    const params = new URLSearchParams();
    if (rawType) params.set("type", rawType);
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    if (rawPage) params.set("page", rawPage);
    params.set("p", programs[0].id);
    redirect(`/dashboard/activity?${params.toString()}`);
  }

  const basePath = "/dashboard/activity";

  if (!p) {
    const { rows, hasMore } = await listActivity({
      programIds: programs.map((prog) => prog.id),
      type,
      dateFrom: from,
      dateTo: to,
      limit: PAGE_SIZE,
      offset,
    });
    return (
      <main className="mx-auto max-w-7xl space-y-8 p-5 py-10">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Activity</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Recent stamps, plays, and redemptions across every program.
          </p>
        </div>

        <ProgramSwitcher programs={programs} currentId="" basePath={basePath} />
        <ActivityFilters
          basePath={basePath}
          currentP={undefined}
          type={type}
          from={from}
          to={to}
        />
        <ActivityTable activity={rows} showProgram />
        <div className="flex items-center justify-between">
          {page > 1 ? (
            <a
              href={paginationHref(basePath, { type, from, to }, page - 1)}
              className="text-sm font-medium text-muted-foreground hover:text-foreground hover:underline"
            >
              ← Previous
            </a>
          ) : (
            <span />
          )}
          {hasMore && (
            <a
              href={paginationHref(basePath, { type, from, to }, page + 1)}
              className="text-sm font-medium text-muted-foreground hover:text-foreground hover:underline"
            >
              Next →
            </a>
          )}
        </div>
      </main>
    );
  }

  const program = currentProgram(programs, p);
  if (!program) redirect("/setup");

  const { rows, hasMore } = await listActivity({
    programIds: [program.id],
    type,
    dateFrom: from,
    dateTo: to,
    limit: PAGE_SIZE,
    offset,
  });

  return (
    <main className="mx-auto max-w-7xl space-y-8 p-5 py-10">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Activity</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Recent stamps, plays, and redemptions for {program.name}.
        </p>
      </div>

      <ProgramSwitcher
        programs={programs}
        currentId={program.id}
        basePath={basePath}
      />
      <ActivityFilters
        basePath={basePath}
        currentP={program.id}
        type={type}
        from={from}
        to={to}
      />
      <ActivityTable activity={rows} showProgram={false} />
      <div className="flex items-center justify-between">
        {page > 1 ? (
          <a
            href={paginationHref(
              basePath,
              { p: program.id, type, from, to },
              page - 1,
            )}
            className="text-sm font-medium text-muted-foreground hover:text-foreground hover:underline"
          >
            ← Previous
          </a>
        ) : (
          <span />
        )}
        {hasMore && (
          <a
            href={paginationHref(
              basePath,
              { p: program.id, type, from, to },
              page + 1,
            )}
            className="text-sm font-medium text-muted-foreground hover:text-foreground hover:underline"
          >
            Next →
          </a>
        )}
      </div>
    </main>
  );
}
