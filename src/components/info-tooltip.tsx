"use client";

import { Info } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

// Tap/click-triggered (not hover-only) so it works on touch — most vendors
// on this app are on their phone. `label` doubles as the accessible name,
// since an icon-only trigger needs one either way.
export function InfoTooltip({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={label}
          className="inline-flex size-4 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
        >
          <Info className="size-full" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="text-muted-foreground">
        {children}
      </PopoverContent>
    </Popover>
  );
}
