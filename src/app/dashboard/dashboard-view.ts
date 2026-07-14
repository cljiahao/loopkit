// Pure composition helpers for dashboard/page.tsx. Extracted so the
// zero-active-programs branching (which decides whether the shop QR block
// renders) has fast, unmocked test coverage without needing to render the
// whole async server component (Supabase/auth/qr dependencies).

// The shop QR block invites customers to scan and join "your programs" — it
// must never render when there are no active programs to join, or it
// contradicts the empty-state message telling the vendor none are active.
export function shouldShowQr(activeProgramCount: number): boolean {
  return activeProgramCount > 0;
}
