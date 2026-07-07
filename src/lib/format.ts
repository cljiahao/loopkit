// Vercel runs server components in UTC, so a bare toLocaleString() renders the
// wrong wall-clock time for a Singapore vendor. Pin every user-facing timestamp
// to Asia/Singapore (SGT, UTC+8).
const SGT = "Asia/Singapore";

/** e.g. "7 Jul 2026, 3:04 pm" — SGT date + time for activity rows. */
export function formatSgtDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-SG", {
    timeZone: SGT,
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** e.g. "7 Jul 2026" — SGT date only, for last-seen columns. */
export function formatSgtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-SG", {
    timeZone: SGT,
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
