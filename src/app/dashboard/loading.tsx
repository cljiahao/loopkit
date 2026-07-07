export default function DashboardLoading() {
  return (
    <main className="mx-auto max-w-2xl space-y-8 p-5 py-10">
      <div className="space-y-2">
        <div className="h-8 w-48 animate-pulse rounded-lg bg-muted" />
        <div className="h-4 w-64 animate-pulse rounded bg-muted" />
      </div>
      <div className="rounded-2xl border bg-card p-6 shadow-sm">
        <div className="h-4 w-32 animate-pulse rounded bg-muted" />
        <div className="mt-4 h-11 w-full animate-pulse rounded-xl bg-muted" />
      </div>
      <div className="rounded-2xl border bg-card p-6 shadow-sm">
        <div className="h-4 w-32 animate-pulse rounded bg-muted" />
        <div className="mt-4 space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="h-5 w-full animate-pulse rounded bg-muted"
            />
          ))}
        </div>
      </div>
    </main>
  );
}
