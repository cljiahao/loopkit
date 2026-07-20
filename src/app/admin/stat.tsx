import { cn } from "@/lib/utils";
import { ElevatedCard } from "@/components/elevated-card";

/** A back-office figure tile: a small uppercase label over a big value. */
export function Stat({
  label,
  value,
  className,
}: {
  label: string;
  value: string | number;
  className?: string;
}) {
  return (
    <ElevatedCard className={cn("p-4", className)}>
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-2xl font-bold tabular-nums">{value}</p>
    </ElevatedCard>
  );
}
