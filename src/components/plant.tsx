import { cn } from "@/lib/utils";

const SOIL_Y = 74;
const STEM_MAX_Y = 18;
const MAX_LEAF_PAIRS = 3;
const GROWTH_TRANSITION =
  "motion-safe:transition-all motion-safe:duration-[1600ms] motion-safe:ease-out";

export function Plant({
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
  const isBloom = stage >= totalStages - 1 && totalStages > 1;
  const leafPairs = Math.min(stage, MAX_LEAF_PAIRS);

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
      <path
        d="M32 74 h36 l-4 16 a2 2 0 0 1 -2 2 h-24 a2 2 0 0 1 -2 -2 z"
        className="fill-primary/25 stroke-primary/40"
        strokeWidth="1.5"
      />
      <rect
        x="30"
        y="70"
        width="40"
        height="6"
        rx="2"
        className="fill-primary/35"
      />
      <g
        style={{
          transformOrigin: "50px 74px",
          transform: wilting ? "rotate(9deg)" : "none",
        }}
        className="motion-safe:transition-transform motion-safe:duration-500"
      >
        <line
          x1="50"
          y1={SOIL_Y}
          x2="50"
          y2={STEM_MAX_Y}
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          style={{
            transformOrigin: `50px ${SOIL_Y}px`,
            transform: `scaleY(${frac})`,
          }}
          className={GROWTH_TRANSITION}
        />
        {frac === 0 && (
          <circle cx="50" cy="70" r="3.5" className="fill-primary/60" />
        )}
        {Array.from({ length: MAX_LEAF_PAIRS }, (_, i) => {
          const t = (i + 1) / (MAX_LEAF_PAIRS + 1);
          const y = SOIL_Y - (SOIL_Y - STEM_MAX_Y) * t;
          const visible = i < leafPairs;
          return (
            <g
              key={i}
              style={{
                transformOrigin: `50px ${y}px`,
                transitionDelay: `${i * 200}ms`,
              }}
              className={cn(
                GROWTH_TRANSITION,
                visible ? "opacity-100 scale-100" : "opacity-0 scale-0",
              )}
            >
              <path
                d={`M50 ${y} q -14 -6 -20 -14 q 12 0 20 8 z`}
                fill="currentColor"
              />
              <path
                d={`M50 ${y} q 14 -6 20 -14 q -12 0 -20 8 z`}
                fill="currentColor"
              />
            </g>
          );
        })}
        {isBloom && (
          <g
            style={{ transformOrigin: `50px ${STEM_MAX_Y}px` }}
            className={cn(
              GROWTH_TRANSITION,
              "opacity-100 scale-100 starting:opacity-0 starting:scale-0",
            )}
          >
            {Array.from({ length: 6 }, (_, i) => (
              <ellipse
                key={i}
                cx="50"
                cy={STEM_MAX_Y - 8}
                rx="4.5"
                ry="9"
                className={wilting ? "fill-muted-foreground/50" : "fill-gold"}
                style={{
                  transformOrigin: `50px ${STEM_MAX_Y}px`,
                  transform: `rotate(${i * 60}deg)`,
                }}
              />
            ))}
            <circle
              cx="50"
              cy={STEM_MAX_Y}
              r="5"
              className={
                wilting ? "fill-muted-foreground" : "fill-gold-foreground"
              }
            />
          </g>
        )}
      </g>
    </svg>
  );
}
