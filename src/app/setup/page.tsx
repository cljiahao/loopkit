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

const typeLabel: Record<string, string> = {
  stamp: "Stamp card",
  lucky: "Lucky Tap",
  plant: "Sprout",
};

export default async function SetupPage({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string }>;
}) {
  await requireVendor();
  const { edit } = await searchParams;
  const programs = await listPrograms();
  const editing = edit ? currentProgram(programs, edit) : null;
  const isEdit = editing !== null;
  const pro = await isPro();
  const canCreate = canCreateProgram(programs.length, pro);
  const firstRun = programs.length === 0;

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center p-5">
      <div className="w-full">
        <div className="mb-8 text-center">
          <Wordmark className="text-3xl" />
          <h1 className="mt-3 font-display text-2xl font-bold tracking-tight">
            {isEdit
              ? "Edit your card"
              : firstRun
                ? "Set up your loyalty card"
                : "Your loyalty programs"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {isEdit
              ? "Update your loyalty card details."
              : firstRun
                ? "Set up your loyalty card in a minute."
                : "Manage your loyalty programs."}
          </p>
        </div>

        {!isEdit && programs.length > 0 ? (
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
                      <p className="truncate font-medium">{program.name}</p>
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

        {isEdit || canCreate ? (
          <div className="rounded-2xl border bg-card shadow-sm">
            <div className="px-7 pt-9 pb-8">
              <h2 className="text-3xl font-bold tracking-tight">
                {isEdit ? "Edit your card" : "Create a program"}
              </h2>
              <p className="mt-1.5 text-sm text-muted-foreground">
                {isEdit
                  ? "Change how customers earn their reward."
                  : "Pick a card type and set how customers earn their reward."}
              </p>

              <SetupForm program={editing} isEdit={isEdit} />
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
