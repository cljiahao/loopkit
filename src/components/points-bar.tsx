import { cn } from "@/lib/utils";

export function PointsBar({
  filled,
  total,
  className,
}: {
  filled: number;
  total: number;
  className?: string;
}) {
  const pct = Math.min(Math.max((filled / total) * 100, 0), 100);
  return (
    <div className={cn("flex w-full max-w-xs flex-col gap-1.5", className)}>
      <p className="font-mono text-sm font-semibold text-gold-accent">
        {filled.toLocaleString()} / {total.toLocaleString()} points
      </p>
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted/40">
        <div
          data-testid="points-bar-fill"
          className="h-full rounded-full bg-gold transition-[width]"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
