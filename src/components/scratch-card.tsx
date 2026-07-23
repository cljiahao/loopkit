import { useMemo, type CSSProperties } from "react";
import { cn } from "@/lib/utils";

type Stroke = { id: number; top: number; rotate: number; delay: number };

// Randomized per mount, same construction pattern as CardBurst's makePieces
// (src/components/card-burst.tsx) — a fixed count of staggered strokes with
// randomized rotation, passed to the .scratch-stroke keyframe via a CSS
// custom property (--scratch-rotate) rather than an inline `transform`,
// since the keyframe's own `transform` would otherwise win over an inline
// style value for the same property once the animation starts.
function makeStrokes(count: number): Stroke[] {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    top: 15 + i * (70 / (count - 1)),
    rotate: -20 + Math.random() * 40,
    delay: i * 0.1,
  }));
}

export function ScratchCard({
  revealed,
  scratching = false,
  label,
  reward,
  className,
}: {
  revealed: boolean;
  scratching?: boolean;
  label: string;
  reward: boolean;
  className?: string;
}) {
  const strokes = useMemo(
    () => (scratching && !revealed ? makeStrokes(5) : []),
    [scratching, revealed],
  );

  return (
    <div
      className={cn(
        "relative h-28 w-48 overflow-hidden rounded-xl border",
        className,
      )}
    >
      <div
        className={cn(
          "flex h-full flex-col items-center justify-center gap-1 p-3 text-center",
          reward ? "bg-gold/10" : "bg-muted/40",
        )}
      >
        <p
          className={cn(
            "text-sm font-semibold",
            reward ? "text-gold-accent" : "text-muted-foreground",
          )}
        >
          {label}
        </p>
      </div>
      <div
        aria-hidden="true"
        className={cn(
          "absolute inset-0 flex items-center justify-center bg-gradient-to-br from-primary to-primary/70 text-sm font-semibold text-primary-foreground motion-safe:transition-opacity motion-safe:duration-500",
          revealed ? "pointer-events-none opacity-0" : "opacity-100",
        )}
      >
        Scratch to reveal
      </div>
      {scratching && !revealed && (
        <div
          aria-hidden="true"
          data-testid="scratch-strokes"
          className="pointer-events-none absolute inset-0 overflow-hidden"
        >
          {strokes.map((s) => (
            <span
              key={s.id}
              className="scratch-stroke absolute left-1 right-1 h-2 rounded-full bg-primary-foreground/50"
              style={
                {
                  top: `${s.top}%`,
                  animationDelay: `${s.delay}s`,
                  "--scratch-rotate": `${s.rotate}deg`,
                } as CSSProperties
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}
