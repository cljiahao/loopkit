import { cn } from "@/lib/utils";

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
  const soilY = 74;
  const stemTopY = soilY - (soilY - 18) * frac;
  const isBloom = stage >= totalStages - 1 && totalStages > 1;
  const leafPairs = Math.min(stage, 3);

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
        {frac > 0 && (
          <line
            x1="50"
            y1="74"
            x2="50"
            y2={stemTopY}
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
          />
        )}
        {frac === 0 && (
          <circle cx="50" cy="70" r="3.5" className="fill-primary/60" />
        )}
        {Array.from({ length: leafPairs }, (_, i) => {
          const t = (i + 1) / (leafPairs + 1);
          const y = 74 - (74 - stemTopY) * t;
          return (
            <g key={i}>
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
          <g style={{ transformOrigin: `50px ${stemTopY}px` }}>
            {Array.from({ length: 6 }, (_, i) => (
              <ellipse
                key={i}
                cx="50"
                cy={stemTopY - 8}
                rx="4.5"
                ry="9"
                className={wilting ? "fill-muted-foreground/50" : "fill-gold"}
                style={{
                  transformOrigin: `50px ${stemTopY}px`,
                  transform: `rotate(${i * 60}deg)`,
                }}
              />
            ))}
            <circle
              cx="50"
              cy={stemTopY}
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
