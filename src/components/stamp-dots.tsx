import { Check, Gift } from "lucide-react";
import { cn } from "@/lib/utils";

export function StampDots({
  filled,
  total,
  className,
}: {
  filled: number;
  total: number;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      {Array.from({ length: total }, (_, i) => {
        const isReward = i === total - 1;
        const stamped = i < filled;
        const justStamped = stamped && i === filled - 1;
        return (
          <span
            key={i}
            aria-hidden="true"
            className={cn(
              "flex size-7 items-center justify-center rounded-full border-2 text-sm",
              isReward
                ? "border-gold text-gold-accent"
                : stamped
                  ? "border-transparent bg-gold text-gold-foreground"
                  : "border-dashed border-muted-foreground/30",
              justStamped && "motion-safe:animate-stamp-pop",
            )}
          >
            {isReward ? (
              <Gift className="size-3.5 text-gold" />
            ) : stamped ? (
              <Check className="size-3.5" />
            ) : null}
          </span>
        );
      })}
    </div>
  );
}
