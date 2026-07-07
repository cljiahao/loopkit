import { requireVendor } from "@/lib/auth";
import { getProgram } from "@/lib/program";
import { SetupForm } from "@/app/setup/setup-form";
import { Wordmark } from "@/components/landing/wordmark";

export default async function SetupPage() {
  await requireVendor();
  const program = await getProgram();
  const isEdit = program !== null;

  return (
    <main className="flex min-h-screen items-center justify-center p-5">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <Wordmark className="text-3xl" />
          <p className="mt-1 text-sm text-muted-foreground">
            {isEdit
              ? "Update your loyalty card details."
              : "Set up your loyalty card in a minute."}
          </p>
        </div>

        <div className="rounded-2xl border bg-card shadow-sm">
          <div className="px-7 pt-9 pb-8">
            <h1 className="text-3xl font-bold tracking-tight">
              {isEdit ? "Edit your card" : "Set up your card"}
            </h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              This is the one loyalty program your customers will stamp.
            </p>

            <SetupForm program={program} isEdit={isEdit} />
          </div>
        </div>
      </div>
    </main>
  );
}
