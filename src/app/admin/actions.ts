"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin";
import { createServiceClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/action-result";
import type { Json } from "@/lib/types";

/**
 * Append an admin-audit row. Best-effort: a hiccup here must not fail the action
 * it records, but it's logged so a broken trail stays visible.
 */
async function recordAudit(
  adminId: string,
  action: string,
  targetId: string | null,
  detail: Json,
): Promise<void> {
  const supabase = await createServiceClient();
  const { error } = await supabase.from("admin_audit").insert({
    admin_id: adminId,
    action,
    target_id: targetId,
    detail,
  });
  if (error) console.error("admin_audit insert failed", error.message);
}

const setProgramActiveSchema = z.object({
  programId: z.string().uuid(),
  active: z.enum(["true", "false"]).transform((v) => v === "true"),
});

/**
 * Activate or deactivate any vendor's program. Admin-only: requireAdmin() 404s
 * non-admins before any write. Uses the service-role client (allowed in Server
 * Actions) because RLS scopes program UPDATE to the owning vendor.
 */
export async function setProgramActive(
  formData: FormData,
): Promise<ActionResult> {
  const { user } = await requireAdmin();

  const parsed = setProgramActiveSchema.safeParse({
    programId: formData.get("programId"),
    active: formData.get("active"),
  });
  if (!parsed.success) return { success: false, error: "Invalid input" };

  const supabase = await createServiceClient();
  const { data: updated, error } = await supabase
    .from("programs")
    .update({ active: parsed.data.active })
    .eq("id", parsed.data.programId)
    .select("id")
    .maybeSingle();
  if (error || !updated) {
    console.error(
      "setProgramActive failed",
      error?.message ?? "no row updated",
    );
    return { success: false, error: "Could not update program" };
  }

  await recordAudit(user.id, "set_program_active", parsed.data.programId, {
    active: parsed.data.active,
  });

  revalidatePath("/admin/programs");
  revalidatePath(`/admin/programs/${parsed.data.programId}`);
  return { success: true };
}

const setVendorProSchema = z.object({
  vendorId: z.string().uuid(),
  pro: z.enum(["true", "false"]).transform((v) => v === "true"),
});

/**
 * Grant or revoke a vendor's Pro tier. Admin-only: requireAdmin() 404s
 * non-admins first. Pro membership is presence in vendor_pro, so granting is an
 * upsert and revoking a delete, both via the service-role client (allowed in
 * Server Actions) since RLS scopes vendor_pro reads to the owner or an admin.
 */
export async function setVendorPro(formData: FormData): Promise<ActionResult> {
  const { user } = await requireAdmin();

  const parsed = setVendorProSchema.safeParse({
    vendorId: formData.get("vendorId"),
    pro: formData.get("pro"),
  });
  if (!parsed.success) return { success: false, error: "Invalid input" };

  const supabase = await createServiceClient();
  const { error } = parsed.data.pro
    ? await supabase
        .from("vendor_pro")
        .upsert(
          { vendor_id: parsed.data.vendorId },
          { onConflict: "vendor_id" },
        )
    : await supabase
        .from("vendor_pro")
        .delete()
        .eq("vendor_id", parsed.data.vendorId);
  if (error) {
    console.error("setVendorPro failed", error.message);
    return { success: false, error: "Could not update Pro status" };
  }

  await recordAudit(user.id, "set_vendor_pro", parsed.data.vendorId, {
    pro: parsed.data.pro,
  });

  revalidatePath("/admin/vendors");
  return { success: true };
}

const removeCardSchema = z.object({ cardId: z.string().uuid() });

/**
 * Remove a customer's card (light moderation — a wrong number, an abusive
 * entry). Deleting the card cascades its stamp_events. Admin-only, service-role.
 */
export async function removeCard(formData: FormData): Promise<ActionResult> {
  const { user } = await requireAdmin();

  const parsed = removeCardSchema.safeParse({ cardId: formData.get("cardId") });
  if (!parsed.success) return { success: false, error: "Invalid input" };

  const supabase = await createServiceClient();
  // The card's program is needed to revalidate the detail page it was removed
  // from; read it before the delete removes the row.
  const { data: card } = await supabase
    .from("cards")
    .select("program_id")
    .eq("id", parsed.data.cardId)
    .maybeSingle();
  if (!card) return { success: false, error: "Card not found" };

  const { error } = await supabase
    .from("cards")
    .delete()
    .eq("id", parsed.data.cardId);
  if (error) {
    console.error("removeCard failed", error.message);
    return { success: false, error: "Could not remove card" };
  }

  await recordAudit(user.id, "remove_card", parsed.data.cardId, {
    program_id: card.program_id,
  });

  revalidatePath(`/admin/programs/${card.program_id}`);
  return { success: true };
}

const resolveUpgradeRequestSchema = z.object({
  requestId: z.string().uuid(),
  vendorId: z.string().uuid(),
});

/**
 * Grant a vendor Pro and clear their pending upgrade request in one action —
 * the admin's "Grant Pro" button on the /admin/vendors pending-requests
 * section. Admin-only, service-role (RLS scopes vendor_pro/upgrade_requests
 * reads to the owner or an admin).
 */
export async function resolveUpgradeRequest(
  formData: FormData,
): Promise<ActionResult> {
  const { user } = await requireAdmin();

  const parsed = resolveUpgradeRequestSchema.safeParse({
    requestId: formData.get("requestId"),
    vendorId: formData.get("vendorId"),
  });
  if (!parsed.success) return { success: false, error: "Invalid input" };

  const supabase = await createServiceClient();

  const { error: proError } = await supabase
    .from("vendor_pro")
    .upsert({ vendor_id: parsed.data.vendorId }, { onConflict: "vendor_id" });
  if (proError) {
    console.error("resolveUpgradeRequest (grant) failed", proError.message);
    return { success: false, error: "Could not grant Pro" };
  }

  const { error: resolveError } = await supabase
    .from("upgrade_requests")
    .update({ status: "resolved" })
    .eq("id", parsed.data.requestId);
  if (resolveError) {
    console.error(
      "resolveUpgradeRequest (resolve) failed",
      resolveError.message,
    );
    return {
      success: false,
      error: "Granted Pro, but could not clear the request",
    };
  }

  await recordAudit(user.id, "resolve_upgrade_request", parsed.data.vendorId, {
    requestId: parsed.data.requestId,
  });

  revalidatePath("/admin/vendors");
  return { success: true };
}
