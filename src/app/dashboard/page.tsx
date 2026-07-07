import { redirect } from "next/navigation";
import { Gift, Stamp } from "lucide-react";
import { requireVendor } from "@/lib/auth";
import { getProgram } from "@/lib/program";
import { formatSgtDateTime } from "@/lib/format";
import { createServerClient } from "@/lib/supabase/server";
import { StampForm } from "@/app/dashboard/stamp-form";
import { CardLookup } from "@/app/dashboard/card-lookup";

export default async function DashboardPage() {
  await requireVendor();

  const program = await getProgram();
  if (!program) redirect("/setup");

  const supabase = await createServerClient();
  // RLS (events_own) already scopes this to the signed-in vendor's cards.
  const { data: events } = await supabase
    .from("stamp_events")
    .select("id,kind,created_at,card_id")
    .order("created_at", { ascending: false })
    .limit(10);

  // Resolve each event's card phone in one follow-up read (cards_own scopes it
  // to this vendor). A join keeps the activity rows meaningful — which customer.
  const cardIds = [...new Set((events ?? []).map((e) => e.card_id))];
  const phoneByCardId = new Map<string, string>();
  if (cardIds.length) {
    const { data: cards } = await supabase
      .from("cards")
      .select("id,phone")
      .in("id", cardIds);
    for (const c of cards ?? []) phoneByCardId.set(c.id, c.phone);
  }

  return (
    <main className="mx-auto max-w-2xl space-y-8 p-5 py-10">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{program.name}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Buy {program.stamps_required}, get 1 {program.reward_text}
        </p>
      </div>

      <div className="rounded-2xl border bg-card p-6 shadow-sm">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Stamp a customer
        </h2>
        <div className="mt-4">
          <StampForm stampsRequired={program.stamps_required} />
        </div>
      </div>

      <div className="rounded-2xl border bg-card p-6 shadow-sm">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Look up a card
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Check a customer&apos;s progress and redeem a full card — without
          adding a stamp.
        </p>
        <div className="mt-4">
          <CardLookup stampsRequired={program.stamps_required} />
        </div>
      </div>

      <div className="rounded-2xl border bg-card p-6 shadow-sm">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Recent activity
        </h2>
        <ul className="mt-4 space-y-2.5">
          {events && events.length > 0 ? (
            events.map((event) => {
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
                    <span className="min-w-0">
                      <span className="font-medium capitalize">
                        {event.kind}
                      </span>
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
            })
          ) : (
            <li className="text-sm text-muted-foreground">No stamps yet.</li>
          )}
        </ul>
      </div>
    </main>
  );
}
