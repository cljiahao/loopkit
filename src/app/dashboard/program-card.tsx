"use client";

import Link from "next/link";
import { Pencil } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PROGRAM_TYPE_BADGE, describeProgram } from "./program-display";
import type { Program } from "@/lib/program";

// One card per active program. Field order is fixed across every card
// (header -> Open Counter) so scanning a grid of several cards stays
// fast regardless of how many a vendor has. Serve/lookup lives on the
// dedicated Counter page now (see app/dashboard/counter/page.tsx), not
// embedded here. Customers/Activity/Stats for this program are reached
// via each of those pages' own merged-view program picker instead of a
// per-card link.
export function ProgramCard({ program }: { program: Program }) {
  const badge = PROGRAM_TYPE_BADGE[program.type] ?? PROGRAM_TYPE_BADGE.stamp;
  const scoped = (href: string) => `${href}?p=${program.id}`;

  return (
    <div className="flex flex-col gap-4 rounded-2xl border bg-card p-5 shadow-sm">
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
        </div>
        <Link
          href={`/setup?edit=${program.id}`}
          aria-label={`Edit ${program.name}`}
          className="shrink-0 rounded-lg p-1.5 text-muted-foreground outline-none transition-colors hover:bg-secondary hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          <Pencil className="size-4" />
        </Link>
      </div>

      <Button asChild className="h-11 w-full rounded-xl font-semibold">
        <Link href={scoped("/dashboard/counter")}>Open Counter</Link>
      </Button>
    </div>
  );
}
