import { createServerClient } from "@/lib/supabase/server";
import { listPrograms } from "@/lib/program";

export type VendorCustomerRow = {
  phone: string;
  name: string | null;
  programNames: string[];
  totalStamps: number;
  totalRewards: number;
  lastSeenAt: string;
};

type CustomerFields = {
  phone: string;
  name: string | null;
  last_seen_at: string;
};
type CardFields = {
  phone: string;
  program_id: string;
  stamp_count: number;
  reward_count: number;
};

// Pure: merge one vendor's customers rows with their cards across every
// program into one row per phone. A customer's programNames are deduped
// (a phone should only ever have one card per program, but this stays
// defensive rather than assuming the DB-level unique constraint holds).
export function aggregateCustomers(
  customers: CustomerFields[],
  cards: CardFields[],
  programNameById: Record<string, string>,
): VendorCustomerRow[] {
  const cardsByPhone = new Map<string, CardFields[]>();
  for (const card of cards) {
    const existing = cardsByPhone.get(card.phone) ?? [];
    existing.push(card);
    cardsByPhone.set(card.phone, existing);
  }

  const rows = customers.map((customer) => {
    const ownCards = cardsByPhone.get(customer.phone) ?? [];
    const programNames = [...new Set(ownCards.map((c) => c.program_id))]
      .map((id) => programNameById[id])
      .filter((name): name is string => name !== undefined);
    return {
      phone: customer.phone,
      name: customer.name,
      programNames,
      totalStamps: ownCards.reduce((sum, c) => sum + c.stamp_count, 0),
      totalRewards: ownCards.reduce((sum, c) => sum + c.reward_count, 0),
      lastSeenAt: customer.last_seen_at,
    };
  });

  return rows.sort((a, b) => (a.lastSeenAt < b.lastSeenAt ? 1 : -1));
}

// Impure shell: the signed-in vendor's customers across every program, most
// recently active first. RLS scopes both `customers` and `cards` to the
// vendor automatically (owns_program / customers_own), so no explicit
// vendor_id filter is needed here — only the program-id narrowing for the
// cards join.
export async function listVendorCustomers(
  q?: string,
): Promise<VendorCustomerRow[]> {
  const supabase = await createServerClient();
  const programs = await listPrograms();
  const programNameById = Object.fromEntries(
    programs.map((p) => [p.id, p.name]),
  );
  const programIds = programs.map((p) => p.id);

  let customersQuery = supabase
    .from("customers")
    .select("phone,name,last_seen_at")
    .order("last_seen_at", { ascending: false });
  const term = q?.trim();
  if (term) customersQuery = customersQuery.ilike("phone", `%${term}%`);

  const { data: customersData, error: customersError } = await customersQuery;
  if (customersError)
    throw new Error(`listVendorCustomers: ${customersError.message}`);

  if (programIds.length === 0) {
    return aggregateCustomers(customersData ?? [], [], programNameById);
  }

  const { data: cardsData, error: cardsError } = await supabase
    .from("cards")
    .select("phone,program_id,stamp_count,reward_count")
    .in("program_id", programIds);
  if (cardsError) throw new Error(`listVendorCustomers: ${cardsError.message}`);

  return aggregateCustomers(
    customersData ?? [],
    cardsData ?? [],
    programNameById,
  );
}
