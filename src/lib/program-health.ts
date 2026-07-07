import { MS_PER_DAY } from "@/lib/utils";

export type ProgramHealth = "new" | "quiet" | "active";

export type ProgramHealthInput = {
  customer_count: number;
  last_activity_at: string | null;
  created_at: string;
};

// A program with barely any customers in its first week is still finding its
// feet — "new" rather than "quiet", so a fresh signup isn't flagged as dark.
const NEW_CUSTOMER_CEILING = 3;
const NEW_AGE_DAYS = 7;
// No stamping for this long reads as a program the vendor has stopped using.
const QUIET_AFTER_DAYS = 14;

/**
 * Triage label for a loyalty program from its customer count, last stamp/redeem
 * time, and age. Pure (no DB, no wall clock): the caller passes `now` in ms.
 * "new" wins over "quiet" so a just-created program is never flagged as dark.
 */
export function programHealth(
  p: ProgramHealthInput,
  now: number,
): ProgramHealth {
  const ageDays = (now - Date.parse(p.created_at)) / MS_PER_DAY;
  if (p.customer_count <= NEW_CUSTOMER_CEILING && ageDays <= NEW_AGE_DAYS) {
    return "new";
  }
  const lastMs = p.last_activity_at ? Date.parse(p.last_activity_at) : null;
  if (lastMs === null || now - lastMs >= QUIET_AFTER_DAYS * MS_PER_DAY) {
    return "quiet";
  }
  return "active";
}
