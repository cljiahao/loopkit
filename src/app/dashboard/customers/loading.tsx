export default function CustomersLoading() {
  return (
    <main className="mx-auto max-w-2xl space-y-8 p-5 py-10">
      <div className="space-y-2">
        <div className="h-8 w-40 animate-pulse rounded-lg bg-muted" />
        <div className="h-4 w-56 animate-pulse rounded bg-muted" />
      </div>
      <div className="h-11 w-full animate-pulse rounded-xl bg-muted" />
      <div className="rounded-2xl border bg-card p-6 shadow-sm">
        <div className="space-y-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between">
              <div className="space-y-2">
                <div className="h-4 w-28 animate-pulse rounded bg-muted" />
                <div className="h-3 w-20 animate-pulse rounded bg-muted" />
              </div>
              <div className="h-3 w-16 animate-pulse rounded bg-muted" />
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
