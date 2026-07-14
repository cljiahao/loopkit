import { redirect } from "next/navigation";
import { Gift, Stamp } from "lucide-react";
import { requireVendor } from "@/lib/auth";
import { listPrograms, currentProgram } from "@/lib/program";
import { formatSgtDateTime } from "@/lib/format";
import { createServerClient } from "@/lib/supabase/server";
import { listVendorActivity, type VendorActivityRow } from "@/lib/activity";
import { Badge } from "@/components/ui/badge";
import { ProgramSwitcher } from "@/app/dashboard/program-switcher";

// Extracted so it's testable with plain props. Renders the vendor-level
// (no ?p=) feed: every event across every program, each tagged with which
// program it belongs to (not implicit anymore once merged).
export function VendorActivityList({
  activity,
}: {
  activity: VendorActivityRow[];
}) {
  if (activity.length === 0) {
    return (
      <div className="rounded-2xl border bg-card p-6 shadow-sm">
        <p className="text-sm text-muted-foreground">No activity yet.</p>
      </div>
    );
  }

  return (
    <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {activity.map((event) => (
        <li
          key={event.id}
          className="flex items-center justify-between gap-3 rounded-xl border bg-card p-3 text-sm shadow-sm"
        >
          <span className="flex min-w-0 items-center gap-2.5">
            <span
              className={
                event.isReward
                  ? "grid size-7 shrink-0 place-items-center rounded-full bg-gold/20 text-gold-accent"
                  : "grid size-7 shrink-0 place-items-center rounded-full bg-primary/10 text-primary"
              }
            >
              {event.isReward ? (
                <Gift className="size-3.5" />
              ) : (
                <Stamp className="size-3.5" />
              )}
            </span>
            <span className="min-w-0">
              <span className="font-medium capitalize">{event.label}</span>
              <span className="ml-2 truncate text-muted-foreground">
                {event.phone}
              </span>
              <Badge variant="secondary" className="ml-2">
                {event.programName}
              </Badge>
            </span>
          </span>
          <span className="shrink-0 text-muted-foreground">
            {formatSgtDateTime(event.createdAt)}
          </span>
        </li>
      ))}
    </ul>
  );
}

type ActivityPageProps = {
  searchParams: Promise<{ p?: string }>;
};

export default async function ActivityPage({
  searchParams,
}: ActivityPageProps) {
  await requireVendor();

  const programs = await listPrograms();
  const { p } = await searchParams;

  if (!p && programs.length === 1) {
    redirect(`/dashboard/activity?p=${programs[0].id}`);
  }

  if (!p) {
    const activity = await listVendorActivity();
    return (
      <main className="mx-auto max-w-7xl space-y-8 p-5 py-10">
        <div>
          <ProgramSwitcher
            programs={programs}
            currentId=""
            basePath="/dashboard/activity"
          />
          <h1 className="text-2xl font-bold tracking-tight">Activity</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Recent stamps, plays, and redemptions across every program.
          </p>
        </div>
        <VendorActivityList activity={activity} />
      </main>
    );
  }

  const program = currentProgram(programs, p);
  if (!program) redirect("/setup");

  const supabase = await createServerClient();
  // Scope recent activity to the current program's cards (cards_own already
  // limits this to the signed-in vendor). Reading the cards first also gives us
  // the phone map the activity list needs.
  const { data: cards } = await supabase
    .from("cards")
    .select("id,phone")
    .eq("program_id", program.id);
  const phoneByCardId = new Map<string, string>();
  const cardIds = (cards ?? []).map((c) => c.id);
  for (const c of cards ?? []) phoneByCardId.set(c.id, c.phone);

  const events =
    cardIds.length > 0
      ? (
          await supabase
            .from("stamp_events")
            .select("id,kind,payload,created_at,card_id")
            .in("card_id", cardIds)
            .order("created_at", { ascending: false })
            .limit(10)
        ).data
      : [];

  return (
    <main className="mx-auto max-w-7xl space-y-8 p-5 py-10">
      <div>
        <ProgramSwitcher
          programs={programs}
          currentId={program.id}
          basePath="/dashboard/activity"
        />
        <h1 className="text-2xl font-bold tracking-tight">Activity</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Recent stamps, plays, and redemptions for {program.name}.
        </p>
      </div>

      {events && events.length > 0 ? (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {events.map((event) => {
            const won =
              event.kind === "visit" &&
              typeof event.payload === "object" &&
              event.payload !== null &&
              (event.payload as { won?: boolean }).won === true;
            const isReward = event.kind === "redeem" || won;
            const label = won
              ? "Won"
              : event.kind === "visit"
                ? "Visit"
                : event.kind;
            return (
              <li
                key={event.id}
                className="flex items-center justify-between gap-3 rounded-xl border bg-card p-3 text-sm shadow-sm"
              >
                <span className="flex min-w-0 items-center gap-2.5">
                  <span
                    className={
                      isReward
                        ? "grid size-7 shrink-0 place-items-center rounded-full bg-gold/20 text-gold-accent"
                        : "grid size-7 shrink-0 place-items-center rounded-full bg-primary/10 text-primary"
                    }
                  >
                    {isReward ? (
                      <Gift className="size-3.5" />
                    ) : (
                      <Stamp className="size-3.5" />
                    )}
                  </span>
                  <span className="min-w-0">
                    <span className="font-medium capitalize">{label}</span>
                    <span className="ml-2 truncate text-muted-foreground">
                      {phoneByCardId.get(event.card_id) ?? "—"}
                    </span>
                  </span>
                </span>
                <span className="shrink-0 text-muted-foreground">
                  {formatSgtDateTime(event.created_at)}
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="rounded-2xl border bg-card p-6 shadow-sm">
          <p className="text-sm text-muted-foreground">No stamps yet.</p>
        </div>
      )}
    </main>
  );
}
