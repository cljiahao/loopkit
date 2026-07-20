import Link from "next/link";
import { requireVendor } from "@/features/auth";
import {
  listPrograms,
  currentProgram,
  isPro,
  canCreateProgram,
  canPrepProgram,
  getEntitlement,
  applyDueCutovers,
} from "@/lib/program";
import { SetupForm } from "@/app/setup/setup-form";
import { ScheduleRetirementForm } from "@/app/setup/schedule-retirement-form";
import { activateProgramAction } from "@/app/setup/actions";
import { resolveSetupView } from "@/app/setup/setup-view";
import { Wordmark } from "@/components/landing/wordmark";
import { ProLock } from "@/components/pro-lock";
import { BackButton } from "@/components/back-button";
import { cn } from "@/lib/utils";
import { createServerClient } from "@/lib/supabase/server";
import {
  getOrCreateVendorProfile,
  type VendorProfile,
} from "@/lib/merqo-vendor-profile";
import { getVendorProfile } from "@/lib/vendor";

const typeLabel: Record<string, string> = {
  stamp: "Stamp card",
  lucky: "Lucky Tap",
  plant: "Sprout",
  wheel: "Spin the Wheel",
  scratch: "Scratch Card",
};

export default async function SetupPage({
  searchParams,
}: {
  searchParams: Promise<{
    edit?: string;
    migrate?: string;
    prep?: string;
    schedule?: string;
    manage?: string;
  }>;
}) {
  const { user } = await requireVendor();
  await applyDueCutovers();
  const supabase = await createServerClient();
  // Prefer the vendor's existing loopkit.vendors name (set via
  // /dashboard/profile) as the seed for the shared merqo.vendor_profile row
  // — falling back to email only if they've never set one — so a vendor who
  // already has a real stall name doesn't get overwritten with their raw
  // email on first /setup visit after this table's introduction.
  const localProfile = await getVendorProfile();
  // The merqo.vendor_profile row is a one-time seed, not a live mirror —
  // nothing re-syncs stall_name after the first /setup visit, so
  // loopkit.vendors (localProfile, edited at /dashboard/profile) stays the
  // live source of truth for display; vendorProfile is only a fallback (and
  // the seed input above). It's also cross-schema and can fail independently
  // of the rest of this page — degrade to null rather than hard-failing the
  // whole vendor console on a merqo hiccup.
  let vendorProfile: VendorProfile | null = null;
  try {
    vendorProfile = await getOrCreateVendorProfile(
      supabase,
      user.id,
      localProfile.name ?? user.email ?? null,
    );
  } catch (err) {
    console.error(
      "setup: shared vendor profile read/create failed",
      err instanceof Error ? err.message : err,
    );
  }
  const { edit, migrate, schedule, prep, manage } = await searchParams;
  const programs = await listPrograms();
  const editing = edit ? currentProgram(programs, edit) : null;
  const isEdit = editing !== null;
  // Deliberately not currentProgram()'s fallback-to-first-program
  // semantics: an invalid/unowned migrate id must resolve to nothing, not
  // silently let a vendor migrate the wrong program.
  const migrating = migrate
    ? (programs.find((p) => p.id === migrate) ?? null)
    : null;
  const prepping = prep ? (programs.find((p) => p.id === prep) ?? null) : null;
  const scheduling = schedule
    ? (programs.find((p) => p.id === schedule) ?? null)
    : null;
  const managing = manage === "1";
  const pro = await isPro();
  const canCreate = canCreateProgram(
    getEntitlement(pro),
    programs.filter((p) => p.active).length,
  );
  const canPrep = canPrepProgram(
    getEntitlement(pro),
    programs.filter((p) => p.replaced_by === null).length,
  );
  const activePrograms = programs.filter((p) => p.active);
  const firstRun = programs.length === 0;

  const view = resolveSetupView({
    migrating: migrating !== null,
    isEdit,
    prepping: prepping !== null,
    scheduling: scheduling !== null,
    managing,
    canCreate,
  });

  // Thin inline server action: a plain <form action> can only pass the
  // form's formData through a single-argument function, but
  // activateProgramAction (Task 3) shares the two-argument
  // (prevState, formData) shape used by every other action in this file so
  // it plugs into useActionState identically to its siblings. This shim
  // bridges the two, matching the existing signOut-in-a-Server-Component
  // pattern (src/app/admin/layout.tsx).
  async function activate(formData: FormData) {
    "use server";
    await activateProgramAction({}, formData);
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center p-5 md:max-w-4xl">
      <div className="w-full">
        <div className="mb-4">
          <BackButton href="/dashboard" label="Back to dashboard" />
        </div>
        <div className="mb-8 text-center">
          <Wordmark className="text-3xl" />
          <p className="mt-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {localProfile.name ?? vendorProfile?.stall_name}
          </p>
          <h1 className="mt-3 font-display text-2xl font-bold tracking-tight">
            {migrating
              ? `Change ${migrating.name}'s type`
              : prepping
                ? `Set up ${prepping.name}'s replacement`
                : scheduling
                  ? `Schedule ${scheduling.name}'s retirement`
                  : isEdit
                    ? "Edit your card"
                    : managing
                      ? "Your loyalty programs"
                      : firstRun
                        ? "Set up your loyalty card"
                        : canCreate
                          ? "Create a program"
                          : "Free plan: 1 program"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {migrating
              ? "Your current card stops collecting new stamps. Customers who already have it keep it and can still redeem what they've earned — they just won't see it as something to keep working toward. Everyone gets moved onto the new card automatically next time they check their rewards."
              : prepping
                ? "Set up the card that replaces it. It stays hidden from customers until you activate it."
                : scheduling
                  ? "Pick the date it retires and which card takes over."
                  : isEdit
                    ? "Update your loyalty card details."
                    : managing
                      ? "Manage your loyalty programs."
                      : firstRun
                        ? "Set up your loyalty card in a minute."
                        : canCreate
                          ? "Pick a card type and set how customers earn their reward."
                          : "You're on the free plan, which includes one loyalty program."}
          </p>
        </div>

        {(view === "create" || view === "upsell") && programs.length > 0 ? (
          <div className="mb-6 text-center">
            <Link
              href="/setup?manage=1"
              className="text-sm font-medium text-primary hover:underline"
            >
              Manage your programs
            </Link>
          </div>
        ) : null}

        {view === "manage" ? (
          <div className="rounded-2xl border bg-card shadow-sm">
            <div className="px-7 py-6">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                  Your programs
                </h2>
                <Link
                  href="/setup"
                  className="text-sm font-medium text-primary hover:underline"
                >
                  + New program
                </Link>
              </div>
              <ul className="mt-4 divide-y">
                {programs.map((program) => (
                  <li
                    key={program.id}
                    className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
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
                    <div className="flex flex-wrap items-center gap-3 text-sm font-medium">
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
                      {program.active && !pro && canPrep && (
                        <Link
                          href={`/setup?prep=${program.id}`}
                          className="text-muted-foreground hover:text-foreground"
                        >
                          Prep replacement
                        </Link>
                      )}
                      {!program.active && program.replaced_by === null && (
                        <form action={activate}>
                          <input type="hidden" name="id" value={program.id} />
                          <button
                            type="submit"
                            className="text-muted-foreground hover:text-foreground"
                          >
                            Activate
                          </button>
                        </form>
                      )}
                      {program.active && pro && activePrograms.length > 1 && (
                        <Link
                          href={`/setup?schedule=${program.id}`}
                          className="text-muted-foreground hover:text-foreground"
                        >
                          Schedule retirement
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
        ) : view === "migrate" || view === "edit" || view === "create" ? (
          <div>
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
              replacingType={migrating ? migrating.type : null}
            />
          </div>
        ) : view === "prep" ? (
          <div>
            <h2 className="text-3xl font-bold tracking-tight">
              Set up the replacement
            </h2>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Pick a card type and set how customers earn their reward. It stays
              hidden until you activate it.
            </p>
            <SetupForm
              program={null}
              isEdit={false}
              replacingId={null}
              replacingType={null}
              prepping
            />
          </div>
        ) : view === "schedule" ? (
          <div className="rounded-2xl border bg-card shadow-sm">
            <div className="px-7 pt-9 pb-8">
              <h2 className="text-3xl font-bold tracking-tight">
                Schedule retirement
              </h2>
              <p className="mt-1.5 text-sm text-muted-foreground">
                {scheduling!.name} keeps running until the date you pick, then
                it hands over automatically.
              </p>
              <ScheduleRetirementForm
                program={scheduling!}
                successors={activePrograms.filter(
                  (p) => p.id !== scheduling!.id,
                )}
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
