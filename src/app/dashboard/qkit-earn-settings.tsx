"use client";

import { useTransition } from "react";
import { saveQkitEarnConfigAction } from "./actions";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { ElevatedCard } from "@/components/elevated-card";

type Program = { id: string; name: string };

export function QkitEarnSettings({
  programs,
  current,
  isPro,
}: {
  programs: Program[];
  current: { programId: string; enabled: boolean } | null;
  isPro: boolean;
}) {
  const [pending, startTransition] = useTransition();

  if (!isPro) {
    return (
      <ElevatedCard className="p-4 text-sm text-muted-foreground">
        Upgrade to Pro to award a stamp automatically when a customer completes
        a qkit order.
      </ElevatedCard>
    );
  }

  return (
    // Matches ElevatedCard's classes directly — a <form> needs the action
    // prop, which ElevatedCard's as="div"|"section"|"li" prop type doesn't
    // support (same rationale as activity-filters.tsx).
    <form
      className="space-y-3 rounded-[20px] border bg-card p-4 shadow-[0_1px_0_0_var(--color-border),0_12px_28px_-20px_rgba(0,0,0,0.35)]"
      action={(fd) => {
        startTransition(() => {
          void saveQkitEarnConfigAction(fd);
        });
      }}
    >
      <div className="flex items-center gap-2">
        <Switch
          id="qkit-earn-enabled"
          name="enabled"
          defaultChecked={current?.enabled ?? false}
          aria-label="Earn from qkit orders"
        />
        <Label htmlFor="qkit-earn-enabled" className="text-sm">
          Earn from qkit orders
        </Label>
      </div>
      <Select name="program_id" defaultValue={current?.programId || undefined}>
        <SelectTrigger className="w-full">
          <SelectValue placeholder="Choose a program" />
        </SelectTrigger>
        <SelectContent>
          {programs.map((p) => (
            <SelectItem key={p.id} value={p.id}>
              {p.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        type="submit"
        disabled={pending}
        className="h-10 w-full rounded-xl text-sm font-semibold"
      >
        Save
      </Button>
    </form>
  );
}
