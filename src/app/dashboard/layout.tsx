import { Suspense } from "react";
import { redirect } from "next/navigation";
import { requireVendor } from "@/lib/auth";
import { isAdmin } from "@/lib/admin";
import { createServerClient } from "@/lib/supabase/server";
import { DashboardNav } from "@/app/dashboard/dashboard-nav";
import { DashboardTabs } from "@/app/dashboard/dashboard-tabs";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user } = await requireVendor();

  // Admins have no program and don't use the vendor dashboard — send them home.
  if (await isAdmin(user.id)) redirect("/admin");

  // Inline server action so the header's Sign out `<form>` can post directly —
  // no client bundle, no exposed endpoint beyond this closure.
  async function signOut() {
    "use server";
    const supabase = await createServerClient();
    await supabase.auth.signOut();
    redirect("/login");
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-20 border-b bg-background/85 px-5 py-3 backdrop-blur-md">
        <DashboardNav signOut={signOut} />
      </header>
      <Suspense fallback={null}>
        <DashboardTabs />
      </Suspense>
      <div className="flex-1 pb-16 sm:pb-0">{children}</div>
    </div>
  );
}
