import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Gift, Stamp } from "lucide-react";
import { requireAdmin } from "@/lib/admin";
import { getProgramDetail } from "@/lib/admin-data";
import { programHealth } from "@/lib/program-health";
import { HEALTH_BADGE } from "@/app/admin/health-badge";
import { formatSgtDate, formatSgtDateTime } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Stat } from "@/app/admin/stat";
import { Manage } from "@/app/admin/programs/[id]/manage";

export const revalidate = 0;

export default async function AdminProgramDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;

  const detail = await getProgramDetail(id);
  if (!detail) notFound();

  const { program, vendor_email, cards, events } = detail;
  // Reading the wall clock in an async server component is intentional here.
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();

  const stampsIssued = events.filter((e) => e.kind === "stamp").length;
  const rewardsRedeemed = cards.reduce((sum, c) => sum + c.reward_count, 0);
  const lastActivityAt = events[0]?.created_at ?? null;
  const health = programHealth(
    {
      customer_count: cards.length,
      last_activity_at: lastActivityAt,
      created_at: program.created_at,
    },
    now,
  );
  const badge = HEALTH_BADGE[health];

  return (
    <main className="mx-auto max-w-3xl space-y-8 px-5 py-8">
      <div className="space-y-3">
        <Link
          href="/admin/programs"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" /> All programs
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-bold tracking-tight">{program.name}</h1>
          <Badge variant={badge.variant} className="capitalize">
            {badge.label}
          </Badge>
          <Badge variant={program.active ? "default" : "outline"}>
            {program.active ? "Active" : "Inactive"}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          Buy {program.stamps_required}, get 1 {program.reward_text}
          {vendor_email && <> · {vendor_email}</>}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Customers" value={cards.length} />
        <Stat label="Stamps issued" value={stampsIssued} />
        <Stat label="Rewards redeemed" value={rewardsRedeemed} />
        <Stat
          label="Last activity"
          value={lastActivityAt ? formatSgtDate(lastActivityAt) : "—"}
        />
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Recent activity
        </h2>
        <div className="rounded-2xl border bg-card p-6 shadow-sm">
          <ul className="space-y-2.5">
            {events.length > 0 ? (
              events.slice(0, 15).map((event) => {
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
                        <span className="font-medium capitalize">
                          {event.kind}
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

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Manage
        </h2>
        <Manage
          program={{
            id: program.id,
            name: program.name,
            active: program.active,
          }}
          cards={cards.map((c) => ({
            id: c.id,
            phone: c.phone,
            stamp_count: c.stamp_count,
            reward_count: c.reward_count,
          }))}
          stampsRequired={program.stamps_required}
        />
      </section>
    </main>
  );
}
