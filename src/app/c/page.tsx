import { Wordmark } from "@/components/landing/wordmark";
import { createServerClient } from "@/lib/supabase/server";
import { CheckForm } from "@/features/card-check";

type CheckPageProps = {
  searchParams: Promise<{ v?: string }>;
};

export default async function CheckPage({ searchParams }: CheckPageProps) {
  const { v } = await searchParams;

  // Resolve which active programs this vendor runs up front, so the
  // customer sees what a scan joins before they type anything.
  // vendor_active_programs is SECURITY DEFINER and public — an unknown
  // vendor id just returns an empty list.
  let programs: {
    id: string;
    name: string;
    type: string;
    reward_text: string;
  }[] = [];
  if (v) {
    const supabase = await createServerClient();
    const { data } = await supabase.rpc("vendor_active_programs", {
      p_vendor: v,
    });
    programs = data ?? [];
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-5">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <Wordmark className="text-3xl" />
          <h1 className="mt-3 font-display text-2xl font-bold tracking-tight">
            Loyalty card
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {programs.length > 0
              ? `Join: ${programs.map((p) => p.name).join(", ")}`
              : "Check your rewards."}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            New here? Enter your phone to join — no app needed.
          </p>
        </div>

        <div className="rounded-2xl border bg-card px-7 py-9 shadow-sm">
          {v ? (
            <CheckForm vendorId={v} />
          ) : (
            <p className="text-sm text-muted-foreground">
              Ask the shop for their loyalty link.
            </p>
          )}
        </div>
      </div>
    </main>
  );
}
