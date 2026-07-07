import { Wordmark } from "@/components/landing/wordmark";
import { createServerClient } from "@/lib/supabase/server";
import { CheckForm } from "@/app/c/check-form";

type CheckPageProps = {
  searchParams: Promise<{ p?: string }>;
};

export default async function CheckPage({ searchParams }: CheckPageProps) {
  const { p } = await searchParams;

  // Resolve the shop name up front so the customer sees which stall this card
  // belongs to before they type anything. card_status is SECURITY DEFINER and
  // public — an empty phone matches no card but still returns the program row.
  let shopName: string | null = null;
  if (p) {
    const supabase = await createServerClient();
    const { data } = await supabase.rpc("card_status", {
      p_program: p,
      p_phone: "",
    });
    shopName = data?.[0]?.name ?? null;
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-5">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <Wordmark className="text-3xl" />
          <h1 className="mt-3 font-display text-2xl font-bold tracking-tight">
            {shopName ?? "Stamp card"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Check your stamp card.
          </p>
        </div>

        <div className="rounded-2xl border bg-card px-7 py-9 shadow-sm">
          {p ? (
            <CheckForm programId={p} />
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
