import { redirect } from "next/navigation";
import Link from "next/link";
import { requireVendor } from "@/lib/auth";
import { listPrograms, currentProgram } from "@/lib/program";
import { ServeCustomer } from "@/app/dashboard/serve-customer";
import { Badge } from "@/components/ui/badge";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ p?: string }>;
}) {
  await requireVendor();

  const programs = await listPrograms();
  const { p } = await searchParams;
  const program = currentProgram(programs, p);
  if (!program) redirect("/setup");

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
        {programs.length > 1 ? (
          <form
            action="/dashboard"
            method="get"
            className="mb-3 flex items-center gap-2"
          >
            <select
              name="p"
              defaultValue={program.id}
              aria-label="Switch program"
              className="h-9 flex-1 rounded-lg border bg-card px-3 text-sm"
            >
              {programs.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
            </select>
            <button
              type="submit"
              className="h-9 rounded-lg border px-4 text-sm font-medium hover:bg-muted/50"
            >
              Switch
            </button>
          </form>
        ) : null}
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
    </main>
  );
}
