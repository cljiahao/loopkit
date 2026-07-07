import { createServiceClient } from "@/lib/supabase/server";
import type { CardRow } from "@/lib/cards";

type ServiceClient = Awaited<ReturnType<typeof createServiceClient>>;

export type ProgramOverviewRow = {
  id: string;
  name: string;
  active: boolean;
  vendor_email: string | null;
  customer_count: number;
  stamps_issued: number;
  rewards_redeemed: number;
  last_activity_at: string | null;
  created_at: string;
};

export type PlatformTotals = {
  programs: number;
  active_programs: number;
  customers: number;
  stamps_issued: number;
  rewards_redeemed: number;
};

export type ActivityRow = {
  id: string;
  kind: string;
  created_at: string;
  phone: string | null;
  program_name: string | null;
};

export type ProgramDetail = {
  program: {
    id: string;
    name: string;
    active: boolean;
    stamps_required: number;
    reward_text: string;
    created_at: string;
  };
  vendor_email: string | null;
  cards: CardRow[];
  events: {
    id: string;
    kind: string;
    created_at: string;
    phone: string | null;
  }[];
};

// The admins console spans every vendor, so it reads with the service-role
// client (RLS-exempt) rather than widening the per-vendor policies. Vendor
// identity lives on auth.users, resolved to email via the admin API.
async function emailByUserId(
  supabase: ServiceClient,
): Promise<Map<string, string | null>> {
  const { data } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  return new Map((data?.users ?? []).map((u) => [u.id, u.email ?? null]));
}

/**
 * Every program with its aggregate stats and owning vendor's email, for the
 * admin triage table. Aggregation is done in TS over three flat reads (programs,
 * cards, stamp_events) to avoid multi-join SQL — fine at validation scale.
 */
export async function listProgramsOverview(): Promise<ProgramOverviewRow[]> {
  const supabase = await createServiceClient();
  const [programsRes, cardsRes, eventsRes] = await Promise.all([
    supabase.from("programs").select("id, name, active, vendor_id, created_at"),
    supabase.from("cards").select("id, program_id, reward_count"),
    supabase.from("stamp_events").select("card_id, kind, created_at"),
  ]);
  for (const r of [programsRes, cardsRes, eventsRes]) {
    if (r.error) throw new Error(`listProgramsOverview: ${r.error.message}`);
  }
  const programs = programsRes.data ?? [];
  const cards = cardsRes.data ?? [];
  const events = eventsRes.data ?? [];
  const emails = await emailByUserId(supabase);

  const programIdByCardId = new Map(cards.map((c) => [c.id, c.program_id]));
  const customers = new Map<string, number>();
  const rewards = new Map<string, number>();
  for (const c of cards) {
    customers.set(c.program_id, (customers.get(c.program_id) ?? 0) + 1);
    rewards.set(
      c.program_id,
      (rewards.get(c.program_id) ?? 0) + c.reward_count,
    );
  }
  const stamps = new Map<string, number>();
  const lastActivity = new Map<string, string>();
  for (const e of events) {
    const pid = programIdByCardId.get(e.card_id);
    if (!pid) continue;
    if (e.kind === "stamp") stamps.set(pid, (stamps.get(pid) ?? 0) + 1);
    const prev = lastActivity.get(pid);
    if (!prev || e.created_at > prev) lastActivity.set(pid, e.created_at);
  }

  return programs.map((p) => ({
    id: p.id,
    name: p.name,
    active: p.active,
    vendor_email: emails.get(p.vendor_id) ?? null,
    customer_count: customers.get(p.id) ?? 0,
    stamps_issued: stamps.get(p.id) ?? 0,
    rewards_redeemed: rewards.get(p.id) ?? 0,
    last_activity_at: lastActivity.get(p.id) ?? null,
    created_at: p.created_at,
  }));
}

/** Platform-wide totals for the overview stat tiles. */
export async function platformTotals(): Promise<PlatformTotals> {
  const supabase = await createServiceClient();
  const [programsRes, cardsRes, eventsRes] = await Promise.all([
    supabase.from("programs").select("id, active"),
    supabase.from("cards").select("id, reward_count"),
    supabase.from("stamp_events").select("kind"),
  ]);
  for (const r of [programsRes, cardsRes, eventsRes]) {
    if (r.error) throw new Error(`platformTotals: ${r.error.message}`);
  }
  const programs = programsRes.data ?? [];
  const cards = cardsRes.data ?? [];
  const events = eventsRes.data ?? [];

  return {
    programs: programs.length,
    active_programs: programs.filter((p) => p.active).length,
    customers: cards.length,
    stamps_issued: events.filter((e) => e.kind === "stamp").length,
    rewards_redeemed: cards.reduce((sum, c) => sum + c.reward_count, 0),
  };
}

/** The most recent stamp/redeem events across all shops, named + phoned. */
export async function recentActivity(limit = 15): Promise<ActivityRow[]> {
  const supabase = await createServiceClient();
  const { data: events, error } = await supabase
    .from("stamp_events")
    .select("id, kind, created_at, card_id")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`recentActivity: ${error.message}`);

  const cardIds = [...new Set((events ?? []).map((e) => e.card_id))];
  const phoneByCardId = new Map<string, string>();
  const programIdByCardId = new Map<string, string>();
  if (cardIds.length) {
    const { data: cards } = await supabase
      .from("cards")
      .select("id, phone, program_id")
      .in("id", cardIds);
    for (const c of cards ?? []) {
      phoneByCardId.set(c.id, c.phone);
      programIdByCardId.set(c.id, c.program_id);
    }
  }
  const programIds = [...new Set([...programIdByCardId.values()])];
  const nameByProgramId = new Map<string, string>();
  if (programIds.length) {
    const { data: programs } = await supabase
      .from("programs")
      .select("id, name")
      .in("id", programIds);
    for (const p of programs ?? []) nameByProgramId.set(p.id, p.name);
  }

  return (events ?? []).map((e) => ({
    id: e.id,
    kind: e.kind,
    created_at: e.created_at,
    phone: phoneByCardId.get(e.card_id) ?? null,
    program_name:
      nameByProgramId.get(programIdByCardId.get(e.card_id) ?? "") ?? null,
  }));
}

/** One program with its owning vendor's email, cards, and recent events. */
export async function getProgramDetail(
  programId: string,
): Promise<ProgramDetail | null> {
  const supabase = await createServiceClient();
  const { data: program, error } = await supabase
    .from("programs")
    .select(
      "id, name, active, stamps_required, reward_text, vendor_id, created_at",
    )
    .eq("id", programId)
    .maybeSingle();
  if (error) throw new Error(`getProgramDetail: ${error.message}`);
  if (!program) return null;

  const { data: cardsData } = await supabase
    .from("cards")
    .select("id, phone, stamp_count, reward_count, updated_at")
    .eq("program_id", programId)
    .order("updated_at", { ascending: false });
  const cards = cardsData ?? [];
  const phoneByCardId = new Map(cards.map((c) => [c.id, c.phone]));
  const cardIds = cards.map((c) => c.id);

  // All of one program's events (validation scale is small) so the detail page
  // can both count totals and show the most recent slice.
  const { data: eventsData } = cardIds.length
    ? await supabase
        .from("stamp_events")
        .select("id, kind, created_at, card_id")
        .in("card_id", cardIds)
        .order("created_at", { ascending: false })
    : { data: [] };

  const emails = await emailByUserId(supabase);

  return {
    program: {
      id: program.id,
      name: program.name,
      active: program.active,
      stamps_required: program.stamps_required,
      reward_text: program.reward_text,
      created_at: program.created_at,
    },
    vendor_email: emails.get(program.vendor_id) ?? null,
    cards,
    events: (eventsData ?? []).map((e) => ({
      id: e.id,
      kind: e.kind,
      created_at: e.created_at,
      phone: phoneByCardId.get(e.card_id) ?? null,
    })),
  };
}
