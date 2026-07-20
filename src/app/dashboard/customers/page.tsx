import { redirect } from "next/navigation";
import { requireVendor } from "@/features/auth";
import { listPrograms, currentProgram } from "@/lib/program";
import { getProgress } from "@/lib/engine";
import { listCards } from "@/lib/cards";
import { listVendorCustomers, type VendorCustomerRow } from "@/lib/customers";
import { formatSgtDate } from "@/lib/format";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ElevatedCard } from "@/components/elevated-card";
import { ProgramSwitcher } from "@/app/dashboard/program-switcher";

type CustomersPageProps = {
  searchParams: Promise<{ q?: string; p?: string }>;
};

// Extracted so it's testable with plain props — no Supabase/auth mocking
// needed. Renders the vendor-level (no ?p=) list: every customer across
// every program, merged.
export function VendorCustomerList({
  customers,
}: {
  customers: VendorCustomerRow[];
}) {
  if (customers.length === 0) {
    return (
      <ElevatedCard className="p-6">
        <p className="text-sm text-muted-foreground">No customers yet.</p>
      </ElevatedCard>
    );
  }

  return (
    <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {customers.map((customer) => (
        <ElevatedCard
          as="li"
          key={customer.phone}
          className="flex flex-col gap-2 p-3 text-sm"
        >
          <div className="flex items-center justify-between gap-3">
            <p className="font-medium">{customer.name ?? customer.phone}</p>
            <span className="shrink-0 text-xs text-muted-foreground">
              {formatSgtDate(customer.lastSeenAt)}
            </span>
          </div>
          {customer.name && (
            <p className="text-xs text-muted-foreground">{customer.phone}</p>
          )}
          <div className="flex flex-wrap gap-1">
            {customer.programNames.map((name) => (
              <Badge key={name} variant="secondary">
                {name}
              </Badge>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            {customer.totalStamps} total stamps/visits · {customer.totalRewards}{" "}
            reward{customer.totalRewards === 1 ? "" : "s"}
          </p>
        </ElevatedCard>
      ))}
    </ul>
  );
}

export default async function CustomersPage({
  searchParams,
}: CustomersPageProps) {
  await requireVendor();

  const programs = await listPrograms();
  const { q, p } = await searchParams;

  if (!p && programs.length === 1) {
    redirect(
      `/dashboard/customers?p=${programs[0].id}${q ? `&q=${encodeURIComponent(q)}` : ""}`,
    );
  }

  if (!p) {
    const customers = await listVendorCustomers(q);
    return (
      <main className="mx-auto max-w-7xl space-y-8 p-5 py-10">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Customers</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Everyone who has a card at your shop, across every program.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <ProgramSwitcher
            programs={programs}
            currentId=""
            basePath="/dashboard/customers"
          />
          <form
            className="flex flex-1 items-center gap-3"
            action="/dashboard/customers"
          >
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
        </div>
        <VendorCustomerList customers={customers} />
      </main>
    );
  }

  const program = currentProgram(programs, p);
  if (!program) redirect("/setup");

  const cards = await listCards(program.id, q);
  const now = new Date();

  return (
    <main className="mx-auto max-w-7xl space-y-8 p-5 py-10">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Customers</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Everyone who has a {program.name} card.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <ProgramSwitcher
          programs={programs}
          currentId={program.id}
          basePath="/dashboard/customers"
        />
        <form
          className="flex flex-1 items-center gap-3"
          action="/dashboard/customers"
        >
          <input type="hidden" name="p" value={program.id} />
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
      </div>

      {cards.length === 0 ? (
        <ElevatedCard className="p-6">
          <p className="text-sm text-muted-foreground">No customers yet.</p>
        </ElevatedCard>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {cards.map((card) => (
            <ElevatedCard
              as="li"
              key={card.id}
              className="flex items-center justify-between gap-3 p-3 text-sm"
            >
              <div className="min-w-0">
                <p className="font-medium">{card.phone}</p>
                <p className="mt-0.5 truncate text-muted-foreground">
                  {
                    getProgress(
                      program,
                      {
                        state: card.state,
                        stamp_count: card.stamp_count,
                        reward_count: card.reward_count,
                      },
                      now,
                    ).label
                  }
                  {card.reward_count > 0 &&
                    ` · ${card.reward_count} reward${card.reward_count === 1 ? "" : "s"}`}
                </p>
              </div>
              <span className="shrink-0 text-muted-foreground">
                {formatSgtDate(card.updated_at)}
              </span>
            </ElevatedCard>
          ))}
        </ul>
      )}
    </main>
  );
}
