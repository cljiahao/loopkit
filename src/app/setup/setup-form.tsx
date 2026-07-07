"use client";

import { useState } from "react";
import { saveProgramAction } from "@/app/setup/actions";
import type { Program } from "@/lib/program";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type ProgramType = "stamp" | "lucky";

const labelClass =
  "text-xs font-semibold uppercase tracking-wider text-muted-foreground";

export function SetupForm({
  program,
  isEdit,
}: {
  program: Program | null;
  isEdit: boolean;
}) {
  const initialType: ProgramType =
    program?.type === "lucky" ? "lucky" : "stamp";
  const [type, setType] = useState<ProgramType>(initialType);
  const config = (program?.config ?? {}) as {
    win_probability?: number;
    pity_ceiling?: number;
    reward_text?: string;
  };

  return (
    <form action={saveProgramAction} className="mt-7 space-y-5">
      <div className="space-y-2">
        <Label className={labelClass}>Card type</Label>
        <div className="grid grid-cols-2 gap-2">
          {(
            [
              { value: "stamp", label: "Stamp card" },
              { value: "lucky", label: "Lucky Tap" },
            ] as const
          ).map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setType(option.value)}
              className={cn(
                "h-11 rounded-xl border text-sm font-semibold transition-colors",
                type === option.value
                  ? "border-primary bg-primary/10 text-primary"
                  : "bg-card text-muted-foreground hover:bg-muted/50",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
        <input type="hidden" name="type" value={type} />
      </div>

      <div className="space-y-2">
        <Label htmlFor="name" className={labelClass}>
          Card name
        </Label>
        <Input
          id="name"
          name="name"
          type="text"
          required
          maxLength={60}
          placeholder={type === "lucky" ? "Lucky topping" : "Coffee card"}
          defaultValue={program?.name ?? ""}
          className="h-11 rounded-xl"
        />
      </div>

      {type === "stamp" ? (
        <div className="space-y-2">
          <Label htmlFor="stamps_required" className={labelClass}>
            Stamps required
          </Label>
          <Input
            id="stamps_required"
            name="stamps_required"
            type="number"
            required
            min={2}
            max={20}
            placeholder="10"
            defaultValue={program?.stamps_required ?? 10}
            className="h-11 rounded-xl"
          />
        </div>
      ) : (
        <>
          <div className="space-y-2">
            <Label htmlFor="win_percent" className={labelClass}>
              Win chance (%)
            </Label>
            <Input
              id="win_percent"
              name="win_percent"
              type="number"
              required
              min={2}
              max={100}
              placeholder="20"
              defaultValue={
                config.win_probability
                  ? Math.round(config.win_probability * 100)
                  : 20
              }
              className="h-11 rounded-xl"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="pity_ceiling" className={labelClass}>
              Guaranteed win by
            </Label>
            <Input
              id="pity_ceiling"
              name="pity_ceiling"
              type="number"
              required
              min={2}
              max={20}
              placeholder="8"
              defaultValue={config.pity_ceiling ?? 8}
              className="h-11 rounded-xl"
            />
          </div>
        </>
      )}

      <div className="space-y-2">
        <Label htmlFor="reward_text" className={labelClass}>
          Reward
        </Label>
        <Input
          id="reward_text"
          name="reward_text"
          type="text"
          required
          maxLength={80}
          placeholder="Free kopi"
          defaultValue={program?.reward_text ?? config.reward_text ?? ""}
          className="h-11 rounded-xl"
        />
      </div>

      <Button
        type="submit"
        size="lg"
        className="h-12 w-full rounded-xl text-base font-semibold"
      >
        {isEdit ? "Save changes" : "Create card"}
      </Button>
    </form>
  );
}
