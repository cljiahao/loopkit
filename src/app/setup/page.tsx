import { requireVendor } from "@/lib/auth";
import { getProgram } from "@/lib/program";
import { saveProgramAction } from "@/app/setup/actions";
import { Wordmark } from "@/components/landing/wordmark";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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

            <form action={saveProgramAction} className="mt-7 space-y-5">
              <div className="space-y-2">
                <Label
                  htmlFor="name"
                  className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                >
                  Card name
                </Label>
                <Input
                  id="name"
                  name="name"
                  type="text"
                  required
                  maxLength={60}
                  placeholder="Coffee card"
                  defaultValue={program?.name ?? ""}
                  className="h-11 rounded-xl"
                />
              </div>
              <div className="space-y-2">
                <Label
                  htmlFor="stamps_required"
                  className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                >
                  Stamps required
                </Label>
                <Input
                  id="stamps_required"
                  name="stamps_required"
                  type="number"
                  required
                  min={2}
                  max={20}
                  placeholder="10"
                  defaultValue={program?.stamps_required ?? 10}
                  className="h-11 rounded-xl"
                />
              </div>
              <div className="space-y-2">
                <Label
                  htmlFor="reward_text"
                  className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                >
                  Reward
                </Label>
                <Input
                  id="reward_text"
                  name="reward_text"
                  type="text"
                  required
                  maxLength={80}
                  placeholder="Free kopi"
                  defaultValue={program?.reward_text ?? ""}
                  className="h-11 rounded-xl"
                />
              </div>
              <Button
                type="submit"
                size="lg"
                className="h-12 w-full rounded-xl text-base font-semibold"
              >
                {isEdit ? "Save changes" : "Create card"}
              </Button>
            </form>
          </div>
        </div>
      </div>
    </main>
  );
}
