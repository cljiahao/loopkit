import { redirect } from "next/navigation";
import { headers } from "next/headers";
import Link from "next/link";
import { requireVendor } from "@/lib/auth";
import { listPrograms, currentProgram } from "@/lib/program";
import { ServeCustomer } from "@/app/dashboard/serve-customer";
import { Badge } from "@/components/ui/badge";
import { qrSvg } from "@/lib/qr";
import { CardLinkActions } from "@/app/dashboard/card-link";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ p?: string }>;
}) {
  const { user } = await requireVendor();

  const programs = await listPrograms();
  const { p } = await searchParams;
  const program = currentProgram(programs, p);
  if (!program) redirect("/setup");

  const activePrograms = programs.filter((prog) => prog.active);

  // The QR must encode an absolute URL — a host-less path is unscannable. Fall
  // back to the request host when NEXT_PUBLIC_BASE_URL is unset.
  const h = await headers();
  const origin =
    process.env.NEXT_PUBLIC_BASE_URL ??
    `https://${h.get("x-forwarded-host") ?? h.get("host")}`;
  const cardLink = `${origin}/c?v=${user.id}`;
  const cardQr = await qrSvg(cardLink);

  const isLucky = program.type === "lucky";
  const isPlant = program.type === "plant";
  const typeBadge = isLucky
    ? { label: "Lucky Tap", variant: "default" as const }
    : isPlant
      ? { label: "Sprout", variant: "gold" as const }
      : { label: "Stamp", variant: "default" as const };
  const config = (program.config ?? {}) as { win_probability?: number };

  return (
    <main className="mx-auto max-w-2xl space-y-6 p-5 py-10">
      <div>
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <h1 className="truncate text-lg font-bold tracking-tight">
              {program.name}
            </h1>
            <Badge variant={typeBadge.variant}>{typeBadge.label}</Badge>
          </div>
          <Link
            href={`/setup?edit=${program.id}`}
            className="shrink-0 text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            Edit
          </Link>
        </div>
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
          Serve a customer
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Enter a phone or scan the customer&apos;s QR, then{" "}
          {isLucky ? "play" : isPlant ? "water" : "add a stamp"} — or look up a
          card to check progress and redeem without acting.
        </p>
        <div className="mt-4">
          <ServeCustomer
            programId={program.id}
            type={program.type}
            stampsRequired={program.stamps_required}
            rewardText={program.reward_text}
          />
        </div>
      </div>

      <details className="group rounded-2xl border bg-card shadow-sm">
        <summary className="cursor-pointer list-none px-6 py-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground [&::-webkit-details-marker]:hidden">
          Get new customers
        </summary>
        <div className="space-y-4 px-6 pb-6">
          <p className="text-xs text-muted-foreground">
            One QR for your whole shop — print this at your counter or till. New
            customers scan it once and join{" "}
            {activePrograms.length > 0
              ? activePrograms.map((prog) => prog.name).join(", ")
              : "your programs"}{" "}
            automatically, no typing needed from you. Returning customers use
            the same link to check their cards.
          </p>
          {activePrograms.length === 0 && (
            <p className="rounded-xl border bg-card px-4 py-3 text-sm text-muted-foreground">
              None of your programs are active right now — new scans won&apos;t
              join anything until you activate one.
            </p>
          )}
          <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
            <div
              className="shrink-0 rounded-xl border bg-white p-2 [&_svg]:size-24"
              dangerouslySetInnerHTML={{ __html: cardQr }}
            />
            <div className="min-w-0 flex-1 space-y-3">
              <code className="block truncate rounded-lg bg-muted px-3 py-2 font-mono text-xs">
                {cardLink}
              </code>
              <CardLinkActions link={cardLink} />
            </div>
          </div>
        </div>
      </details>
    </main>
  );
}
