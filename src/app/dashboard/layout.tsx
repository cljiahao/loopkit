import { redirect } from "next/navigation";
import { requireVendor } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase/server";
import { DashboardNav } from "@/app/dashboard/dashboard-nav";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireVendor();

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
      <div className="flex-1">{children}</div>
    </div>
  );
}
