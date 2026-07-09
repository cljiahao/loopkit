import { requireVendor } from "@/lib/auth";
import { listPrograms, isPro } from "@/lib/program";
import { Badge } from "@/components/ui/badge";
import { ProLock } from "@/components/pro-lock";

export default async function ProfilePage() {
  const { user } = await requireVendor();
  const [programs, pro] = await Promise.all([listPrograms(), isPro()]);

  return (
    <main className="mx-auto max-w-2xl space-y-8 p-5 py-10">
      <div>
        <h1 className="font-display text-2xl font-bold">Profile</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Your vendor account and plan.
        </p>
      </div>

      <div className="space-y-4 rounded-xl border bg-card p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Email
            </p>
            <p className="mt-1 text-sm font-medium">{user.email}</p>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 border-t pt-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Plan
            </p>
            <p className="mt-1 text-sm font-medium">
              {pro ? "Pro — unlimited cards" : "Free — 1 card"}
            </p>
          </div>
          <Badge variant={pro ? "gold" : "secondary"}>
            {pro ? "Pro" : "Free"}
          </Badge>
        </div>

        <div className="flex items-center justify-between gap-3 border-t pt-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Cards
            </p>
            <p className="mt-1 text-sm font-medium">
              {programs.length} {programs.length === 1 ? "card" : "cards"} set
              up
            </p>
          </div>
        </div>

        {!pro && (
          <div className="border-t pt-4">
            <p className="text-xs text-muted-foreground">
              Free accounts get one card.
            </p>
            <ProLock label="Upgrade to Pro" className="mt-2" />
          </div>
        )}
      </div>
    </main>
  );
}
