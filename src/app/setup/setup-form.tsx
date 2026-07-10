"use client";

import { useActionState, useState } from "react";
import { saveProgramAction } from "@/app/setup/actions";
import type { Program, ProgramType } from "@/lib/program";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type SegmentInput = { label: string; weight: number; is_reward: boolean };

const labelClass =
  "text-xs font-semibold uppercase tracking-wider text-muted-foreground";

const typeLabels: Record<ProgramType, string> = {
  stamp: "Stamp card",
  lucky: "Lucky Tap",
  plant: "Sprout",
  wheel: "Spin the Wheel",
  scratch: "Scratch Card",
  streak: "Streak Club",
};

const DEFAULT_SEGMENTS: SegmentInput[] = [
  { label: "Try again", weight: 5, is_reward: false },
  { label: "Free item", weight: 1, is_reward: true },
];

export function SetupForm({
  program,
  isEdit,
}: {
  program: Program | null;
  isEdit: boolean;
}) {
  const [state, formAction, pending] = useActionState(saveProgramAction, {});
  const initialType: ProgramType =
    program?.type === "lucky" ||
    program?.type === "plant" ||
    program?.type === "wheel" ||
    program?.type === "scratch" ||
    program?.type === "streak"
      ? program.type
      : "stamp";
  const [type, setType] = useState<ProgramType>(initialType);
  const config = (program?.config ?? {}) as {
    win_probability?: number;
    pity_ceiling?: number;
    reward_text?: string;
    stages?: { threshold: number }[];
    segments?: { label: string; weight: number; reward_text?: string }[];
    period_days?: number;
    target_streak?: number;
  };
  const visitsToBloom =
    config.stages?.[config.stages.length - 1]?.threshold ?? 6;
  const [segments, setSegments] = useState<SegmentInput[]>(
    config.segments?.map((s) => ({
      label: s.label,
      weight: s.weight,
      is_reward: !!s.reward_text,
    })) ?? DEFAULT_SEGMENTS,
  );
  const [headStart, setHeadStart] = useState(program?.head_start ?? false);

  function updateSegment(index: number, patch: Partial<SegmentInput>) {
    setSegments((prev) =>
      prev.map((s, i) => (i === index ? { ...s, ...patch } : s)),
    );
  }

  function addSegment() {
    setSegments((prev) => [
      ...prev,
      { label: "New prize", weight: 1, is_reward: false },
    ]);
  }

  function removeSegment(index: number) {
    setSegments((prev) => prev.filter((_, i) => i !== index));
  }

  return (
    <form action={formAction} className="mt-7 space-y-5">
      {program ? <input type="hidden" name="id" value={program.id} /> : null}
      <div className="space-y-2">
        <Label className={labelClass}>Card type</Label>
        {isEdit ? (
          <p className="flex h-11 items-center rounded-xl border bg-muted/40 px-3 text-sm font-semibold text-muted-foreground">
            {typeLabels[type]}
          </p>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {(
              [
                { value: "stamp", label: "Stamp card" },
                { value: "lucky", label: "Lucky Tap" },
                { value: "plant", label: "Sprout" },
                { value: "wheel", label: "Spin the Wheel" },
                { value: "scratch", label: "Scratch Card" },
                { value: "streak", label: "Streak Club" },
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
        )}
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
                : type === "wheel"
                  ? "Spin to win"
                  : type === "scratch"
                    ? "Scratch & win"
                    : type === "streak"
                      ? "Weekly regular"
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
            min={4}
            max={20}
            placeholder="6"
            defaultValue={visitsToBloom}
            className="h-11 rounded-xl"
          />
        </div>
      ) : type === "streak" ? (
        <>
          <div className="space-y-2">
            <Label htmlFor="period_days" className={labelClass}>
              Days per streak window
            </Label>
            <Input
              id="period_days"
              name="period_days"
              type="number"
              required
              min={1}
              max={30}
              placeholder="7"
              defaultValue={config.period_days ?? 7}
              className="h-11 rounded-xl"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="target_streak" className={labelClass}>
              Streak length to earn reward
            </Label>
            <Input
              id="target_streak"
              name="target_streak"
              type="number"
              required
              min={2}
              max={20}
              placeholder="4"
              defaultValue={config.target_streak ?? 4}
              className="h-11 rounded-xl"
            />
          </div>
        </>
      ) : type === "wheel" || type === "scratch" ? (
        <>
          <div className="space-y-2">
            <Label className={labelClass}>
              {type === "wheel" ? "Wheel segments" : "Scratch prizes"}
            </Label>
            <div className="space-y-2">
              {segments.map((segment, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input
                    type="text"
                    required
                    maxLength={40}
                    value={segment.label}
                    onChange={(e) =>
                      updateSegment(i, { label: e.target.value })
                    }
                    placeholder="Label"
                    className="h-11 flex-1 rounded-xl"
                  />
                  <Input
                    type="number"
                    required
                    min={1}
                    max={100}
                    value={segment.weight}
                    onChange={(e) =>
                      updateSegment(i, { weight: Number(e.target.value) })
                    }
                    className="h-11 w-20 rounded-xl"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      updateSegment(i, { is_reward: !segment.is_reward })
                    }
                    className={cn(
                      "h-11 shrink-0 rounded-xl border px-3 text-xs font-semibold transition-colors",
                      segment.is_reward
                        ? "border-gold bg-gold/10 text-gold-accent"
                        : "bg-card text-muted-foreground hover:bg-muted/50",
                    )}
                  >
                    {segment.is_reward ? "Reward" : "No win"}
                  </button>
                  <button
                    type="button"
                    onClick={() => removeSegment(i)}
                    disabled={segments.length <= 2}
                    className="h-11 shrink-0 rounded-xl border px-3 text-xs font-semibold text-muted-foreground hover:bg-muted/50 disabled:opacity-40"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={addSegment}
              disabled={segments.length >= 6}
              className="h-11 w-full rounded-xl border text-sm font-semibold text-muted-foreground transition-colors hover:bg-muted/50 disabled:opacity-40"
            >
              Add segment
            </button>
            <input
              type="hidden"
              name="segments"
              value={JSON.stringify(segments)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="pity_ceiling" className={labelClass}>
              Guaranteed win by (optional)
            </Label>
            <Input
              id="pity_ceiling"
              name="pity_ceiling"
              type="number"
              min={2}
              max={20}
              placeholder="No guarantee"
              defaultValue={config.pity_ceiling ?? ""}
              className="h-11 rounded-xl"
            />
          </div>
        </>
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

      {(type === "stamp" || type === "plant" || type === "streak") && (
        <div className="flex items-start gap-3 rounded-xl border bg-muted/40 p-3">
          <input
            type="checkbox"
            id="head_start_checkbox"
            checked={headStart}
            onChange={(e) => setHeadStart(e.target.checked)}
            className="mt-0.5 size-4 rounded border-input"
          />
          <label htmlFor="head_start_checkbox" className="text-sm">
            <span className="font-medium">Give new customers a head start</span>
            <span className="mt-0.5 block text-xs text-muted-foreground">
              New signups start with a small amount of free progress toward
              their first reward — shown to measurably increase completion.
            </span>
          </label>
          <input
            type="hidden"
            name="head_start"
            value={headStart ? "true" : "false"}
          />
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="expiry_days" className={labelClass}>
          Card expires after (days, optional)
        </Label>
        <Input
          id="expiry_days"
          name="expiry_days"
          type="number"
          min={1}
          max={3650}
          placeholder="Never expires"
          defaultValue={program?.expiry_days ?? ""}
          className="h-11 rounded-xl"
        />
        <p className="text-xs text-muted-foreground">
          Counted from each customer&apos;s current cycle — resets whenever
          their card is regenerated. Leave blank for a card that never expires.
        </p>
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
