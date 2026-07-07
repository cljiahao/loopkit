import { Gift, Stamp } from "lucide-react";
import { requireAdmin } from "@/lib/admin";
import { platformTotals, recentActivity } from "@/lib/admin-data";
import { formatSgtDateTime } from "@/lib/format";
import { Stat } from "@/app/admin/stat";

export const revalidate = 0;

export default async function AdminOverviewPage() {
  await requireAdmin();

  const [totals, activity] = await Promise.all([
    platformTotals(),
    recentActivity(15),
  ]);

  return (
    <main className="mx-auto max-w-5xl space-y-8 px-5 py-8">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Internal
        </p>
        <h1 className="text-3xl font-bold tracking-tight">Overview</h1>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Stat label="Programs" value={totals.programs} />
        <Stat label="Active programs" value={totals.active_programs} />
        <Stat label="Customers" value={totals.customers} />
        <Stat label="Stamps issued" value={totals.stamps_issued} />
        <Stat label="Rewards redeemed" value={totals.rewards_redeemed} />
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Recent activity across all shops
        </h2>
        <div className="rounded-2xl border bg-card p-6 shadow-sm">
          <ul className="space-y-2.5">
            {activity.length > 0 ? (
              activity.map((event) => {
                const isRedeem = event.kind === "redeem";
                return (
                  <li
                    key={event.id}
                    className="flex items-center justify-between gap-3 text-sm"
                  >
                    <span className="flex min-w-0 items-center gap-2.5">
                      <span
                        className={
                          isRedeem
                            ? "grid size-7 shrink-0 place-items-center rounded-full bg-gold/20 text-gold-foreground"
                            : "grid size-7 shrink-0 place-items-center rounded-full bg-primary/10 text-primary"
                        }
                      >
                        {isRedeem ? (
                          <Gift className="size-3.5" />
                        ) : (
                          <Stamp className="size-3.5" />
                        )}
                      </span>
                      <span className="min-w-0 truncate">
                        <span className="font-medium">
                          {event.program_name ?? "—"}
                        </span>
                        <span className="ml-2 text-muted-foreground">
                          {event.phone ?? "—"}
                        </span>
                      </span>
                    </span>
                    <span className="shrink-0 text-muted-foreground">
                      {formatSgtDateTime(event.created_at)}
                    </span>
                  </li>
                );
              })
            ) : (
              <li className="text-sm text-muted-foreground">
                No activity yet.
              </li>
            )}
          </ul>
        </div>
      </section>
    </main>
  );
}
