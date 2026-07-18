import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { createServerClient } from "@/lib/supabase/server";

// Shared vendor gate for server components/actions. Unlike merqo's
// requireVendor (notFound — vendor identity is looked up by email in a
// separate catalog table), loopkit has no such catalog: an unauthenticated
// request just needs to sign in, so we redirect to /login instead.
export async function requireVendor(): Promise<{ user: User }> {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { user };
}
