"use server";

import { createServerClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/action-result";

/**
 * File a self-serve Pro upgrade request for the admin to action. Idempotent:
 * a second click while a request is still pending is a no-op success — same
 * pattern as qkit's requestUpgrade, minus the event/monthly kind (loopkit has
 * one paid tier).
 */
export async function requestUpgrade(): Promise<ActionResult> {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Please sign in first" };

  const { data: existing } = await supabase
    .from("upgrade_requests")
    .select("id")
    .eq("vendor_id", user.id)
    .eq("status", "pending")
    .limit(1)
    .maybeSingle();
  if (existing) return { success: true };

  const { error } = await supabase
    .from("upgrade_requests")
    .insert({ vendor_id: user.id });
  if (error) {
    console.error("requestUpgrade failed", error.message);
    return { success: false, error: "Could not send your request" };
  }
  return { success: true };
}
