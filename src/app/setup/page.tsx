import Link from "next/link";
import { requireVendor } from "@/lib/auth";
import {
  listPrograms,
  currentProgram,
  isPro,
  canCreateProgram,
} from "@/lib/program";
import { SetupForm } from "@/app/setup/setup-form";
import { Wordmark } from "@/components/landing/wordmark";
import { ProLock } from "@/components/pro-lock";
import { cn } from "@/lib/utils";

const typeLabel: Record<string, string> = {
  stamp: "Stamp card",
  lucky: "Lucky Tap",
  plant: "Sprout",
  wheel: "Spin the Wheel",
  scratch: "Scratch Card",
  streak: "Streak Club",
};

export default async function SetupPage({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string; migrate?: string }>;
}) {
  await requireVendor();
  const { edit, migrate } = await searchParams;
  const programs = await listPrograms();
  const editing = edit ? currentProgram(programs, edit) : null;
  const isEdit = editing !== null;
  // Deliberately not currentProgram()'s fallback-to-first-program
  // semantics: an invalid/unowned migrate id must resolve to nothing, not
  // silently let a vendor migrate the wrong program.
  const migrating = migrate
    ? (programs.find((p) => p.id === migrate) ?? null)
    : null;
  const pro = await isPro();
  const canCreate = canCreateProgram(
    programs.filter((p) => p.active).length,
    pro,
  );
  const firstRun = programs.length === 0;

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center p-5">
      <div className="w-full">
        <div className="mb-8 text-center">
          <Wordmark className="text-3xl" />
          <h1 className="mt-3 font-display text-2xl font-bold tracking-tight">
            {migrating
              ? `Change ${migrating.name}'s type`
              : isEdit
                ? "Edit your card"
                : firstRun
                  ? "Set up your loyalty card"
                  : "Your loyalty programs"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {migrating
              ? "Your current card stops collecting new stamps. Customers who already have it keep it and can still redeem what they've earned — they just won't see it as something to keep working toward. Everyone gets moved onto the new card automatically next time they check their rewards."
              : isEdit
                ? "Update your loyalty card details."
                : firstRun
                  ? "Set up your loyalty card in a minute."
                  : "Manage your loyalty programs."}
          </p>
        </div>

        {!isEdit && !migrating && programs.length > 0 ? (
          <div className="mb-6 rounded-2xl border bg-card shadow-sm">
            <div className="px-7 py-6">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Your programs
              </h2>
              <ul className="mt-4 divide-y">
                {programs.map((program) => (
                  <li
                    key={program.id}
                    className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="truncate font-medium">{program.name}</p>
                        <span
                          className={cn(
                            "shrink-0 rounded-full px-1.5 py-0.5 text-[0.6rem] font-semibold uppercase tracking-wider ring-1 ring-inset",
                            program.active
                              ? "bg-emerald-500/15 text-emerald-700 ring-emerald-500/30 dark:bg-emerald-400/15 dark:text-emerald-400 dark:ring-emerald-400/30"
                              : "bg-secondary text-muted-foreground ring-border",
                          )}
                        >
                          {program.active ? "Active" : "Inactive"}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {typeLabel[program.type] ?? program.type}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3 text-sm font-medium">
                      <Link
                        href={`/setup?edit=${program.id}`}
                        className="text-muted-foreground hover:text-foreground"
                      >
                        Edit
                      </Link>
                      {program.active && (
                        <Link
                          href={`/setup?migrate=${program.id}`}
                          className="text-muted-foreground hover:text-foreground"
                        >
                          Change type
                        </Link>
                      )}
                      <Link
                        href={`/dashboard?p=${program.id}`}
                        className="text-primary hover:underline"
                      >
                        Manage
                      </Link>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ) : null}

        {isEdit || migrating || canCreate ? (
          <div className="rounded-2xl border bg-card shadow-sm">
            <div className="px-7 pt-9 pb-8">
              <h2 className="text-3xl font-bold tracking-tight">
                {migrating
                  ? "Pick a new card type"
                  : isEdit
                    ? "Edit your card"
                    : "Create a program"}
              </h2>
              <p className="mt-1.5 text-sm text-muted-foreground">
                {migrating
                  ? "Set up the card that replaces it."
                  : isEdit
                    ? "Change how customers earn their reward."
                    : "Pick a card type and set how customers earn their reward."}
              </p>

              <SetupForm
                program={migrating ? null : editing}
                isEdit={isEdit}
                replacingId={migrating ? migrating.id : null}
              />
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border bg-card shadow-sm">
            <div className="px-7 py-8">
              <h2 className="text-xl font-bold tracking-tight">
                Free plan: 1 program
              </h2>
              <p className="mt-1.5 text-sm text-muted-foreground">
                You&apos;re on the free plan, which includes one loyalty
                program.
              </p>
              <ProLock label="Upgrade to Pro" className="mt-4" />
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
