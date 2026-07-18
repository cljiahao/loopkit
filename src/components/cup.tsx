import { cn } from "@/lib/utils";

const GROWTH_TRANSITION =
  "motion-safe:transition-all motion-safe:duration-[1600ms] motion-safe:ease-out";

export function Cup({
  stage,
  totalStages,
  wilting,
  className,
}: {
  stage: number;
  totalStages: number;
  wilting: boolean;
  className?: string;
}) {
  const span = Math.max(totalStages - 1, 1);
  const frac = Math.min(Math.max(stage / span, 0), 1);
  const cupTopY = 30;
  const cupBottomY = 80;
  const liquidTopY = cupBottomY - (cupBottomY - cupTopY) * frac;
  const isFull = stage >= totalStages - 1 && totalStages > 1;

  return (
    <svg
      viewBox="0 0 100 100"
      aria-hidden="true"
      className={cn(
        "size-32",
        wilting ? "text-muted-foreground" : "text-primary",
        className,
      )}
    >
      <ellipse
        cx="50"
        cy="90"
        rx="26"
        ry="4"
        className="fill-muted-foreground/15"
      />
      <defs>
        <clipPath id="cup-body-clip">
          <path d="M25 30 L75 30 L65 80 L35 80 Z" />
        </clipPath>
      </defs>
      {frac > 0 && (
        <rect
          x="20"
          y={liquidTopY}
          width="60"
          height={cupBottomY - liquidTopY}
          clipPath="url(#cup-body-clip)"
          className={cn(
            GROWTH_TRANSITION,
            wilting ? "fill-muted-foreground/50" : "fill-primary/60",
          )}
        />
      )}
      <path
        d="M25 30 L75 30 L65 80 L35 80 Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <path
        d="M75 38 q14 0 14 14 q0 14 -14 14"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
      {isFull && (
        <g
          style={{ transformOrigin: `50px ${liquidTopY + 2}px` }}
          className={cn(
            GROWTH_TRANSITION,
            "opacity-100 scale-100 starting:opacity-0 starting:scale-0",
          )}
        >
          <circle
            cx="43"
            cy={liquidTopY + 2}
            r="6"
            className={wilting ? "fill-muted-foreground/50" : "fill-gold"}
          />
          <circle
            cx="55"
            cy={liquidTopY + 2}
            r="6"
            className={wilting ? "fill-muted-foreground/50" : "fill-gold"}
          />
          <path
            d={`M40 ${liquidTopY + 6} L50 ${liquidTopY + 16} L60 ${liquidTopY + 6} Z`}
            className={
              wilting ? "fill-muted-foreground" : "fill-gold-foreground"
            }
          />
        </g>
      )}
    </svg>
  );
}
