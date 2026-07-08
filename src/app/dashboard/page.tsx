import { redirect } from "next/navigation";
import { Gift, Stamp } from "lucide-react";
import { requireVendor } from "@/lib/auth";
import { getProgram } from "@/lib/program";
import { formatSgtDateTime } from "@/lib/format";
import { qrSvg } from "@/lib/qr";
import { createServerClient } from "@/lib/supabase/server";
import { StampForm } from "@/app/dashboard/stamp-form";
import { LuckyForm } from "@/app/dashboard/lucky-form";
import { PlantForm } from "@/app/dashboard/plant-form";
import { CardLookup } from "@/app/dashboard/card-lookup";
import { CardLinkActions } from "@/app/dashboard/card-link";

export default async function DashboardPage() {
  await requireVendor();

  const program = await getProgram();
  if (!program) redirect("/setup");

  const isLucky = program.type === "lucky";
  const isPlant = program.type === "plant";
  const config = (program.config ?? {}) as { win_probability?: number };

  const base = process.env.NEXT_PUBLIC_BASE_URL ?? "";
  const cardLink = `${base}/c?p=${program.id}`;
  const cardQr = await qrSvg(cardLink);

  const supabase = await createServerClient();
  // RLS (events_own) already scopes this to the signed-in vendor's cards.
  const { data: events } = await supabase
    .from("stamp_events")
    .select("id,kind,payload,created_at,card_id")
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
          {isLucky
            ? `Every visit has a ${Math.round((config.win_probability ?? 0) * 100)}% chance to win ${program.reward_text}`
            : isPlant
              ? `Water it ${program.stamps_required} times to bloom ${program.reward_text}`
              : `Buy ${program.stamps_required}, get 1 ${program.reward_text}`}
        </p>
      </div>

      <div className="rounded-2xl border bg-card p-6 shadow-sm">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          {isLucky
            ? "Play a round"
            : isPlant
              ? "Water a plant"
              : "Stamp a customer"}
        </h2>
        <div className="mt-4">
          {isLucky ? (
            <LuckyForm />
          ) : isPlant ? (
            <PlantForm />
          ) : (
            <StampForm stampsRequired={program.stamps_required} />
          )}
        </div>
      </div>

      <div className="rounded-2xl border bg-card p-6 shadow-sm">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Your customer card
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Share this link or print the QR — customers open it to see their{" "}
          {program.name} card.
        </p>
        <div className="mt-4 flex flex-col items-start gap-4 sm:flex-row sm:items-center">
          <div
            className="shrink-0 rounded-xl border bg-white p-2 [&_svg]:size-32"
            dangerouslySetInnerHTML={{ __html: cardQr }}
          />
          <div className="min-w-0 space-y-3">
            <code className="block truncate rounded-lg bg-muted px-3 py-2 font-mono text-xs">
              {cardLink}
            </code>
            <CardLinkActions link={cardLink} />
          </div>
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
                  className="flex items-center justify-between gap-3 text-sm"
                >
                  <span className="flex min-w-0 items-center gap-2.5">
                    <span
                      className={
                        isReward
                          ? "grid size-7 shrink-0 place-items-center rounded-full bg-gold/20 text-gold-foreground"
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
            })
          ) : (
            <li className="text-sm text-muted-foreground">No stamps yet.</li>
          )}
        </ul>
      </div>
    </main>
  );
}
