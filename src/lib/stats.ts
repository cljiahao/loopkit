import { cache } from "react";
import { createServerClient } from "@/lib/supabase/server";
import { sgtDateKey } from "@/lib/format";
import { isWonVisit } from "@/lib/metrics";
import { MS_PER_DAY } from "@/lib/utils";

export type ProgramStats = {
  enrolled: number;
  newThisWeek: number;
  visitsTotal: number;
  visits30d: number;
  visitsByDay: { date: string; count: number }[];
  rewardsTotal: number;
  rewards30d: number;
  redemptionRate: number;
  repeatVisitRate: number;
  active: number;
  lapsed: number;
  avgVisitsPerCustomer: number;
  visitsDelta: number | null;
  rewardsDelta: number | null;
  activeDelta: number | null;
  // Average gap between a repeat customer's consecutive visits, pooled
  // across cards, computed over full history (not the 30-day window).
  avgDaysBetweenVisits: number | null;
};

type StatsEvent = {
  card_id: string;
  kind: string;
  created_at: string;
  payload?: unknown;
};
type StatsCard = { id: string; created_at: string };

// Splits raw stamp_events into the two buckets every stat in this module is
// built from. `regen` (card regeneration) events land in neither — they are
// not a customer action.
export function classifyActivity(events: StatsEvent[]): {
  activityEvents: StatsEvent[];
  rewardEvents: StatsEvent[];
} {
  const activityEvents = events.filter(
    (e) => e.kind === "stamp" || e.kind === "visit",
  );
  const rewardEvents = events.filter(
    (e) => e.kind === "redeem" || isWonVisit(e),
  );
  return { activityEvents, rewardEvents };
}

// Percent change of current vs prior. null when prior is 0 — growth from
// nothing is undefined; the UI shows "—", never Infinity/NaN.
export function pctChange(current: number, prior: number): number | null {
  if (prior === 0) return null;
  return ((current - prior) / prior) * 100;
}

// Always 30 entries (oldest first, today last), zero-filled for days with no
// activity — callers can render a fixed-width bar strip with no gap logic.
export function bucketVisitsByDay(
  activityEvents: { created_at: string }[],
  nowMs: number,
): { date: string; count: number }[] {
  const countByDay = new Map<string, number>();
  for (const e of activityEvents) {
    const key = sgtDateKey(e.created_at);
    countByDay.set(key, (countByDay.get(key) ?? 0) + 1);
  }

  const days: { date: string; count: number }[] = [];
  for (let i = 29; i >= 0; i--) {
    const key = sgtDateKey(new Date(nowMs - i * MS_PER_DAY).toISOString());
    days.push({ date: key, count: countByDay.get(key) ?? 0 });
  }
  return days;
}

// Average days between a repeat customer's consecutive visits, pooled
// across every card with 2+ activity events. null when no card in the
// program has repeated yet — the UI shows "—", not a misleading 0.
export function avgDaysBetweenVisits(
  activityEvents: StatsEvent[],
): number | null {
  const byCard = new Map<string, number[]>();
  for (const e of activityEvents) {
    const t = Date.parse(e.created_at);
    if (!Number.isFinite(t)) continue;
    const arr = byCard.get(e.card_id) ?? [];
    arr.push(t);
    byCard.set(e.card_id, arr);
  }

  const gapsDays: number[] = [];
  for (const timestamps of byCard.values()) {
    if (timestamps.length < 2) continue;
    timestamps.sort((a, b) => a - b);
    for (let i = 1; i < timestamps.length; i++) {
      gapsDays.push((timestamps[i] - timestamps[i - 1]) / MS_PER_DAY);
    }
  }
  if (gapsDays.length === 0) return null;
  return gapsDays.reduce((sum, g) => sum + g, 0) / gapsDays.length;
}

// Pure card-level aggregation. `activityEvents`/`rewardEvents` are the
// already-classified arrays from `classifyActivity` — this function does no
// kind filtering itself.
export function computeCardStats(
  cards: StatsCard[],
  activityEvents: StatsEvent[],
  rewardEvents: StatsEvent[],
  nowMs: number,
): Omit<ProgramStats, "visitsByDay"> {
  const enrolled = cards.length;
  const cutoff7d = nowMs - 7 * MS_PER_DAY;
  const cutoff30d = nowMs - 30 * MS_PER_DAY;
  const cutoff60d = nowMs - 60 * MS_PER_DAY;

  const newThisWeek = cards.filter(
    (c) => Date.parse(c.created_at) >= cutoff7d,
  ).length;

  const visitsTotal = activityEvents.length;
  const visits30d = activityEvents.filter(
    (e) => Date.parse(e.created_at) >= cutoff30d,
  ).length;

  const rewardsTotal = rewardEvents.length;
  const rewards30d = rewardEvents.filter(
    (e) => Date.parse(e.created_at) >= cutoff30d,
  ).length;

  const activityCountByCard = new Map<string, number>();
  const activeCardIds = new Set<string>();
  for (const e of activityEvents) {
    activityCountByCard.set(
      e.card_id,
      (activityCountByCard.get(e.card_id) ?? 0) + 1,
    );
    if (Date.parse(e.created_at) >= cutoff30d) activeCardIds.add(e.card_id);
  }
  const repeatCards = [...activityCountByCard.values()].filter(
    (n) => n >= 2,
  ).length;

  const priorVisits30d = activityEvents.filter((e) => {
    const t = Date.parse(e.created_at);
    return t >= cutoff60d && t < cutoff30d;
  }).length;

  const priorRewards30d = rewardEvents.filter((e) => {
    const t = Date.parse(e.created_at);
    return t >= cutoff60d && t < cutoff30d;
  }).length;

  const priorActiveCardIds = new Set<string>();
  for (const e of activityEvents) {
    const t = Date.parse(e.created_at);
    if (t >= cutoff60d && t < cutoff30d) priorActiveCardIds.add(e.card_id);
  }

  return {
    enrolled,
    newThisWeek,
    visitsTotal,
    visits30d,
    rewardsTotal,
    rewards30d,
    redemptionRate: enrolled === 0 ? 0 : rewardsTotal / enrolled,
    repeatVisitRate: enrolled === 0 ? 0 : repeatCards / enrolled,
    active: activeCardIds.size,
    lapsed: enrolled - activeCardIds.size,
    avgVisitsPerCustomer: enrolled === 0 ? 0 : visitsTotal / enrolled,
    visitsDelta: pctChange(visits30d, priorVisits30d),
    rewardsDelta: pctChange(rewards30d, priorRewards30d),
    activeDelta: pctChange(activeCardIds.size, priorActiveCardIds.size),
    avgDaysBetweenVisits: null,
  };
}

// Impure shell: fetch this program's cards + stamp_events (RLS scopes both
// to the signed-in vendor, same as activity/page.tsx), then delegate to the
// pure helpers above.
export const getProgramStats = cache(async function getProgramStats(
  programId: string,
): Promise<ProgramStats> {
  const supabase = await createServerClient();
  const nowMs = Date.now();

  const { data: cards, error: cardsError } = await supabase
    .from("cards")
    .select("id,created_at")
    .eq("program_id", programId);
  if (cardsError) throw new Error(`getProgramStats: ${cardsError.message}`);

  const cardIds = (cards ?? []).map((c) => c.id);

  let events: StatsEvent[] = [];
  if (cardIds.length > 0) {
    const { data, error } = await supabase
      .from("stamp_events")
      .select("card_id,kind,payload,created_at")
      .in("card_id", cardIds);
    if (error) throw new Error(`getProgramStats: ${error.message}`);
    events = data ?? [];
  }

  const { activityEvents, rewardEvents } = classifyActivity(events);
  const cardStats = computeCardStats(
    cards ?? [],
    activityEvents,
    rewardEvents,
    nowMs,
  );
  const visitsByDay = bucketVisitsByDay(activityEvents, nowMs);

  return {
    ...cardStats,
    visitsByDay,
    avgDaysBetweenVisits: avgDaysBetweenVisits(activityEvents),
  };
});

// Impure shell: fetch cards+events across every one of the vendor's
// programs (not just one), then delegate to the same pure pipeline
// getProgramStats uses. classifyActivity/computeCardStats/
// bucketVisitsByDay/avgDaysBetweenVisits are already program-agnostic —
// no new pure logic is needed, only a wider query.
export async function getVendorStats(
  programIds: string[],
): Promise<ProgramStats> {
  const supabase = await createServerClient();
  const nowMs = Date.now();

  if (programIds.length === 0) {
    const cardStats = computeCardStats([], [], [], nowMs);
    return {
      ...cardStats,
      visitsByDay: bucketVisitsByDay([], nowMs),
      avgDaysBetweenVisits: null,
    };
  }

  const { data: cards, error: cardsError } = await supabase
    .from("cards")
    .select("id,created_at")
    .in("program_id", programIds);
  if (cardsError) throw new Error(`getVendorStats: ${cardsError.message}`);

  const cardIds = (cards ?? []).map((c) => c.id);

  let events: StatsEvent[] = [];
  if (cardIds.length > 0) {
    const { data, error } = await supabase
      .from("stamp_events")
      .select("card_id,kind,payload,created_at")
      .in("card_id", cardIds);
    if (error) throw new Error(`getVendorStats: ${error.message}`);
    events = data ?? [];
  }

  const { activityEvents, rewardEvents } = classifyActivity(events);
  const cardStats = computeCardStats(
    cards ?? [],
    activityEvents,
    rewardEvents,
    nowMs,
  );
  const visitsByDay = bucketVisitsByDay(activityEvents, nowMs);

  return {
    ...cardStats,
    visitsByDay,
    avgDaysBetweenVisits: avgDaysBetweenVisits(activityEvents),
  };
}
