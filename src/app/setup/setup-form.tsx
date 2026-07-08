"use client";

import { useActionState, useState } from "react";
import { saveProgramAction } from "@/app/setup/actions";
import type { Program } from "@/lib/program";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type ProgramType = "stamp" | "lucky" | "plant";

const labelClass =
  "text-xs font-semibold uppercase tracking-wider text-muted-foreground";

export function SetupForm({
  program,
  isEdit,
}: {
  program: Program | null;
  isEdit: boolean;
}) {
  const [state, formAction, pending] = useActionState(saveProgramAction, {});
  const initialType: ProgramType =
    program?.type === "lucky" || program?.type === "plant"
      ? program.type
      : "stamp";
  const [type, setType] = useState<ProgramType>(initialType);
  const config = (program?.config ?? {}) as {
    win_probability?: number;
    pity_ceiling?: number;
    reward_text?: string;
    stages?: { threshold: number }[];
  };
  const visitsToBloom =
    config.stages?.[config.stages.length - 1]?.threshold ?? 6;

  return (
    <form action={formAction} className="mt-7 space-y-5">
      {program ? <input type="hidden" name="id" value={program.id} /> : null}
      <div className="space-y-2">
        <Label className={labelClass}>Card type</Label>
        <div className="grid grid-cols-3 gap-2">
          {(
            [
              { value: "stamp", label: "Stamp card" },
              { value: "lucky", label: "Lucky Tap" },
              { value: "plant", label: "🌱 Sprout" },
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
          placeholder={
            type === "lucky"
              ? "Lucky topping"
              : type === "plant"
                ? "Grow-a-kopi"
                : "Coffee card"
          }
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
      ) : type === "plant" ? (
        <div className="space-y-2">
          <Label htmlFor="visits_to_bloom" className={labelClass}>
            Visits to bloom
          </Label>
          <Input
            id="visits_to_bloom"
            name="visits_to_bloom"
            type="number"
            required
            min={2}
            max={20}
            placeholder="6"
            defaultValue={visitsToBloom}
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

      {state.error ? (
        <p className="text-sm font-medium text-destructive">{state.error}</p>
      ) : null}

      <Button
        type="submit"
        size="lg"
        disabled={pending}
        className="h-12 w-full rounded-xl text-base font-semibold"
      >
        {isEdit ? "Save changes" : "Create card"}
      </Button>
    </form>
  );
}
