"use client";

import Link from "next/link";
import { ChevronRight, Pencil } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  PROGRAM_TYPE_BADGE,
  describeProgram,
  programDetails,
} from "./program-display";
import type { Program } from "@/lib/program";

// One card per active program. The whole card is a stretched link to its
// counter page — the pencil icon is a separate, independently-clickable
// link layered above it via z-index, not nested inside it (nesting <a>
// inside <a> is invalid HTML). Serve/lookup lives on the dedicated Counter
// page (app/dashboard/counter/page.tsx), not embedded here.
// Customers/Activity/Stats for this program are reached via each of those
// pages' own merged-view program picker instead of a per-card link.
export function ProgramCard({ program }: { program: Program }) {
  const badge = PROGRAM_TYPE_BADGE[program.type] ?? PROGRAM_TYPE_BADGE.stamp;
  const scoped = (href: string) => `${href}?p=${program.id}`;

  return (
    <div className="relative flex flex-col gap-4 rounded-2xl border bg-card p-5 shadow-sm">
      <Link
        href={scoped("/dashboard/counter")}
        aria-label={`Open counter for ${program.name}`}
        className="absolute inset-0 rounded-2xl outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
      />

      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="truncate text-base font-bold tracking-tight">
              {program.name}
            </h2>
            <Badge variant={badge.variant}>{badge.label}</Badge>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {describeProgram(program)}
          </p>
          <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
            {programDetails(program).map((detail) => (
              <li key={detail}>{detail}</li>
            ))}
          </ul>
        </div>
        <Link
          href={`/setup?edit=${program.id}`}
          aria-label={`Edit ${program.name}`}
          className="relative z-10 shrink-0 rounded-lg p-1.5 text-muted-foreground outline-none transition-colors hover:bg-secondary hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          <Pencil className="size-4" />
        </Link>
      </div>

      <ChevronRight
        aria-hidden="true"
        className="absolute bottom-4 right-4 size-4 text-muted-foreground"
      />
    </div>
  );
}
