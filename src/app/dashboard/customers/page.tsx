import { redirect } from "next/navigation";
import { requireVendor } from "@/lib/auth";
import { getProgram } from "@/lib/program";
import { listCards } from "@/lib/cards";
import { formatSgtDate } from "@/lib/format";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

type CustomersPageProps = {
  searchParams: Promise<{ q?: string }>;
};

export default async function CustomersPage({
  searchParams,
}: CustomersPageProps) {
  await requireVendor();

  const program = await getProgram();
  if (!program) redirect("/setup");

  const { q } = await searchParams;
  const cards = await listCards(program.id, q);

  return (
    <main className="mx-auto max-w-2xl space-y-8 p-5 py-10">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Customers</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Everyone who has a {program.name} card.
        </p>
      </div>

      <form className="flex items-center gap-3" action="/dashboard/customers">
        <Input
          type="search"
          name="q"
          defaultValue={q ?? ""}
          placeholder="Search by phone"
          className="h-11 rounded-xl"
        />
        <Button
          type="submit"
          variant="outline"
          className="h-11 rounded-xl px-6"
        >
          Search
        </Button>
      </form>

      <div className="rounded-2xl border bg-card p-6 shadow-sm">
        {cards.length === 0 ? (
          <p className="text-sm text-muted-foreground">No customers yet.</p>
        ) : (
          <ul className="divide-y">
            {cards.map((card) => (
              <li
                key={card.id}
                className="flex items-center justify-between py-3 text-sm first:pt-0 last:pb-0"
              >
                <div>
                  <p className="font-medium">{card.phone}</p>
                  <p className="mt-0.5 text-muted-foreground">
                    {card.stamp_count}/{program.stamps_required} stamps
                    {card.reward_count > 0 &&
                      ` · ${card.reward_count} reward${card.reward_count === 1 ? "" : "s"}`}
                  </p>
                </div>
                <span className="text-muted-foreground">
                  {formatSgtDate(card.updated_at)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
