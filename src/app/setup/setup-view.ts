// Pure precedence logic for /setup's view routing. Extracted so this gets
// fast, unmocked test coverage without rendering the whole async server
// component (Supabase/auth/merqo dependencies) — same pattern as
// src/app/dashboard/dashboard-view.ts's shouldShowQr.

export type SetupView =
  "migrate" | "edit" | "prep" | "schedule" | "manage" | "create" | "upsell";

// Which single view /setup renders, given every explicit query-param
// intent and the ambient canCreate permission. Explicit intents (an actual
// query param was set — migrate/edit/prep/schedule/manage) always win over
// the ambient default (canCreate deciding between "create" and "upsell").
// This fixes a real bug: canCreate is unconditionally true for Pro vendors
// (unlimited programs), so a previous combined
// `isEdit || migrating || canCreate` check made the `schedule` query
// param unreachable for any Pro vendor — canCreate always won first.
export function resolveSetupView({
  migrating,
  isEdit,
  prepping,
  scheduling,
  managing,
  canCreate,
}: {
  migrating: boolean;
  isEdit: boolean;
  prepping: boolean;
  scheduling: boolean;
  managing: boolean;
  canCreate: boolean;
}): SetupView {
  if (migrating) return "migrate";
  if (isEdit) return "edit";
  if (prepping) return "prep";
  if (scheduling) return "schedule";
  if (managing) return "manage";
  return canCreate ? "create" : "upsell";
}
