import { CheckForm } from "@/app/c/check-form";

type CheckPageProps = {
  searchParams: Promise<{ p?: string }>;
};

export default async function CheckPage({ searchParams }: CheckPageProps) {
  const { p } = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center p-5">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <span className="text-3xl font-bold">loopkit</span>
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
