import type { ComponentProps } from "react";
import type { Badge } from "@/components/ui/badge";
import type { ProgramHealth } from "@/lib/program-health";

export type BadgeVariant = {
  variant: NonNullable<ComponentProps<typeof Badge>["variant"]>;
  label: string;
};

// Health → badge look, shared by the triage list and the detail header so the
// two never drift. Gold = the reward motif for a thriving shop; muted outline
// for a quiet one; secondary for a fresh signup still finding its feet.
export const HEALTH_BADGE: Record<ProgramHealth, BadgeVariant> = {
  active: { variant: "gold", label: "active" },
  new: { variant: "secondary", label: "new" },
  quiet: { variant: "outline", label: "quiet" },
};
