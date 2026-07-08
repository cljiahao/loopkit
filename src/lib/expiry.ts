const MS_PER_DAY = 86_400_000;

// Pure: whether a card's current cycle has expired. No expiry configured
// (null/undefined expiry_days) means the card never expires.
export function isCardExpired(
  cycleStartedAt: string,
  expiryDays: number | null | undefined,
  now: Date,
): boolean {
  if (expiryDays == null) return false;
  const elapsedDays =
    (now.getTime() - new Date(cycleStartedAt).getTime()) / MS_PER_DAY;
  return elapsedDays >= expiryDays;
}
