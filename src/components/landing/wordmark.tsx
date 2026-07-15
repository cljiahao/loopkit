import { cn } from "@/lib/utils";

/** LoopKit wordmark. The "oo" are two gold stamp dots — the reward motif that
 *  runs through the brand. PascalCase compound, matching the Merqo kit-family
 *  logo convention (Apple's -Kit-style precedent: both halves capitalized). */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "font-display text-lg font-extrabold tracking-tight",
        className,
      )}
    >
      L
      <span className="text-gold" aria-hidden>
        oo
      </span>
      pKit
    </span>
  );
}
