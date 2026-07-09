export type VendorStatus =
  { active: true; plan: "free" | "pro" } | { active: false; plan: null };

/**
 * Neither loopkit.programs nor loopkit.vendor_pro has an email column (both
 * key on auth.users(id)), so the caller supplies the auth-user list (from
 * supabase.auth.admin.listUsers) alongside the two id lists, and this pure
 * function does the lookup.
 */
export function resolveVendorStatus(
  email: string,
  authUsers: { id: string; email: string | null }[],
  programVendorIds: string[],
  proVendorIds: string[],
): VendorStatus {
  const key = email.toLowerCase();
  const user = authUsers.find((u) => u.email?.toLowerCase() === key);
  if (!user) return { active: false, plan: null };
  if (!programVendorIds.includes(user.id)) return { active: false, plan: null };
  return {
    active: true,
    plan: proVendorIds.includes(user.id) ? "pro" : "free",
  };
}
