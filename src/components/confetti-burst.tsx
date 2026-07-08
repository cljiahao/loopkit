"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";

const COLORS = [
  "bg-gold",
  "bg-primary",
  "bg-emerald-500",
  "bg-sky-500",
  "bg-rose-500",
];

type Piece = {
  id: number;
  left: number;
  delay: number;
  duration: number;
  color: string;
};

function makePieces(count: number): Piece[] {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    left: Math.random() * 100,
    delay: Math.random() * 0.3,
    duration: 1.6 + Math.random() * 1.2,
    color: COLORS[i % COLORS.length],
  }));
}

export function ConfettiBurst({ active }: { active: boolean }) {
  const pieces = useMemo(() => (active ? makePieces(40) : []), [active]);

  if (!active) return null;

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-[60] overflow-hidden"
    >
      {pieces.map((p) => (
        <span
          key={p.id}
          className={cn(
            "confetti-piece absolute top-0 size-2 rounded-sm",
            p.color,
          )}
          style={{
            left: `${p.left}%`,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.duration}s`,
          }}
        />
      ))}
    </div>
  );
}
