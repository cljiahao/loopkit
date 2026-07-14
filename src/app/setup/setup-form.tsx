"use client";

import { useActionState, useState } from "react";
import {
  saveProgramAction,
  changeTypeAction,
  prepProgramAction,
} from "@/app/setup/actions";
import type { Program, ProgramType } from "@/lib/program";
import { TEMPLATES } from "@/lib/templates";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { buildPreviewProgress } from "@/app/setup/preview-state";
import { PreviewCard } from "@/app/setup/preview-card";

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
  replacingId,
  replacingType,
  prepping = false,
}: {
  program: Program | null;
  isEdit: boolean;
  replacingId: string | null;
  replacingType: string | null;
  prepping?: boolean;
}) {
  const [state, formAction, pending] = useActionState(
    replacingId
      ? changeTypeAction
      : prepping
        ? prepProgramAction
        : saveProgramAction,
    {},
  );
  const initialType: ProgramType =
    program?.type === "lucky" ||
    program?.type === "plant" ||
    program?.type === "wheel" ||
    program?.type === "scratch" ||
    program?.type === "streak"
      ? program.type
      : "stamp";
  const [type, setType] = useState<ProgramType>(initialType);
  // "template" shows the curated grid (the default for both plain create and
  // migrate flows); "custom" falls back to today's raw type grid. Only
  // meaningful when !isEdit — isEdit always shows the locked static label.
  const [pickerMode, setPickerMode] = useState<"template" | "custom">(
    "template",
  );
  // Which template tile is selected, or null (custom mode, or no pick yet) —
  // used only to highlight the selected tile. Field values themselves are
  // set directly by pickTemplate/pickCustomType below, not derived from this.
  const [selectedTemplateKey, setSelectedTemplateKey] = useState<string | null>(
    null,
  );

  const config = (program?.config ?? {}) as {
    win_probability?: number;
    pity_ceiling?: number;
    reward_text?: string;
    stages?: { threshold: number }[];
    segments?: { label: string; weight: number; reward_text?: string }[];
    period_days?: number;
    target_streak?: number;
  };

  // Every field below is controlled — the same state drives both form
  // submission and the live preview, updated on every keystroke.
  const [name, setName] = useState(program?.name ?? "");
  const [rewardText, setRewardText] = useState(
    program?.reward_text ?? config.reward_text ?? "",
  );
  const [stampsRequired, setStampsRequired] = useState(
    program?.stamps_required ?? 10,
  );
  const [visitsToBloom, setVisitsToBloom] = useState(
    config.stages?.[config.stages.length - 1]?.threshold ?? 6,
  );
  const [winPercent, setWinPercent] = useState(
    config.win_probability ? Math.round(config.win_probability * 100) : 20,
  );
  const [pityCeiling, setPityCeiling] = useState<number | undefined>(
    config.pity_ceiling,
  );
  const [periodDays, setPeriodDays] = useState(config.period_days ?? 7);
  const [targetStreak, setTargetStreak] = useState(config.target_streak ?? 4);

  const [segments, setSegments] = useState<SegmentInput[]>(
    config.segments?.map((s) => ({
      label: s.label,
      weight: s.weight,
      is_reward: !!s.reward_text,
    })) ?? DEFAULT_SEGMENTS,
  );
  const [headStart, setHeadStart] = useState(program?.head_start ?? false);
  const [carryOverStamps, setCarryOverStamps] = useState(false);
  const showCarryOverOption =
    replacingId !== null && replacingType === "stamp" && type === "stamp";

  const previewProgress = buildPreviewProgress({
    type,
    name,
    rewardText,
    stampsRequired,
    visitsToBloom,
    winPercent,
    pityCeiling,
    periodDays,
    targetStreak,
    segments,
    headStart,
  });

  function pickTemplate(template: (typeof TEMPLATES)[number]) {
    const d = template.defaults;
    setType(template.type);
    setSelectedTemplateKey(template.key);
    setName(d.name);
    setRewardText(d.reward_text);
    if (d.stamps_required !== undefined) setStampsRequired(d.stamps_required);
    if (d.visits_to_bloom !== undefined) setVisitsToBloom(d.visits_to_bloom);
    if (d.win_percent !== undefined) setWinPercent(d.win_percent);
    setPityCeiling(d.pity_ceiling);
    if (d.period_days !== undefined) setPeriodDays(d.period_days);
    if (d.target_streak !== undefined) setTargetStreak(d.target_streak);
  }

  function pickCustomType(value: ProgramType) {
    setType(value);
    setSelectedTemplateKey(null);
    setName("");
    setRewardText("");
    setStampsRequired(10);
    setVisitsToBloom(6);
    setWinPercent(20);
    setPityCeiling(value === "lucky" ? 8 : undefined);
    setPeriodDays(7);
    setTargetStreak(4);
  }

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
    <div className="mt-7 grid grid-cols-1 gap-6 lg:grid-cols-2 lg:items-start">
      <form action={formAction} className="space-y-5">
        {program ? <input type="hidden" name="id" value={program.id} /> : null}
        {replacingId ? (
          <input type="hidden" name="replacing" value={replacingId} />
        ) : null}
        <div className="space-y-2">
          <Label className={labelClass}>Card type</Label>
          {isEdit ? (
            <p className="flex h-11 items-center rounded-xl border bg-muted/40 px-3 text-sm font-semibold text-muted-foreground">
              {typeLabels[type]}
            </p>
          ) : (
            <div className="space-y-3">
              {pickerMode === "template" ? (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    {TEMPLATES.map((template) => (
                      <button
                        key={template.key}
                        type="button"
                        onClick={() => pickTemplate(template)}
                        className={cn(
                          "flex flex-col items-start gap-0.5 rounded-xl border p-3 text-left transition-colors",
                          selectedTemplateKey === template.key
                            ? "border-primary bg-primary/10"
                            : "bg-card hover:bg-muted/50",
                        )}
                      >
                        <span className="text-sm font-semibold">
                          {template.label}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {template.description}
                        </span>
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setPickerMode("custom");
                      setSelectedTemplateKey(null);
                    }}
                    className="h-11 w-full rounded-xl border text-sm font-semibold text-muted-foreground transition-colors hover:bg-muted/50"
                  >
                    Custom — start from scratch
                  </button>
                </>
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
                      onClick={() => pickCustomType(option.value)}
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
            </div>
          )}
          <input type="hidden" name="type" value={type} />
        </div>

        {type === "stamp" ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
                placeholder="Coffee card"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="h-11 rounded-xl"
              />
            </div>
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
                value={stampsRequired}
                onChange={(e) => setStampsRequired(Number(e.target.value))}
                className="h-11 rounded-xl"
              />
            </div>
          </div>
        ) : type === "plant" ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
                placeholder="Grow-a-kopi"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="h-11 rounded-xl"
              />
            </div>
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
                value={visitsToBloom}
                onChange={(e) => setVisitsToBloom(Number(e.target.value))}
                className="h-11 rounded-xl"
              />
            </div>
          </div>
        ) : (
          <>
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
                    : type === "wheel"
                      ? "Spin to win"
                      : type === "scratch"
                        ? "Scratch & win"
                        : "Weekly regular"
                }
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="h-11 rounded-xl"
              />
            </div>

            {type === "streak" ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
                    value={periodDays}
                    onChange={(e) => setPeriodDays(Number(e.target.value))}
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
                    value={targetStreak}
                    onChange={(e) => setTargetStreak(Number(e.target.value))}
                    className="h-11 rounded-xl"
                  />
                </div>
              </div>
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
                            updateSegment(i, {
                              weight: Number(e.target.value),
                            })
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
                    value={pityCeiling ?? ""}
                    onChange={(e) =>
                      setPityCeiling(
                        e.target.value === ""
                          ? undefined
                          : Number(e.target.value),
                      )
                    }
                    className="h-11 rounded-xl"
                  />
                </div>
              </>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
                    value={winPercent}
                    onChange={(e) => setWinPercent(Number(e.target.value))}
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
                    value={pityCeiling ?? 8}
                    onChange={(e) => setPityCeiling(Number(e.target.value))}
                    className="h-11 rounded-xl"
                  />
                </div>
              </div>
            )}
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
            value={rewardText}
            onChange={(e) => setRewardText(e.target.value)}
            className="h-11 rounded-xl"
          />
        </div>

        {(type === "stamp" || type === "plant" || type === "streak") && (
          <div className="flex items-start gap-3 rounded-xl border bg-muted/40 p-3">
            <Switch
              id="head_start_checkbox"
              checked={headStart}
              onCheckedChange={setHeadStart}
              className="mt-0.5"
            />
            <label htmlFor="head_start_checkbox" className="text-sm">
              <span className="font-medium">
                Give new customers a head start
              </span>
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

        {showCarryOverOption && (
          <div className="flex items-start gap-3 rounded-xl border bg-muted/40 p-3">
            <Switch
              id="carry_over_stamps_checkbox"
              checked={carryOverStamps}
              onCheckedChange={setCarryOverStamps}
              className="mt-0.5"
            />
            <label htmlFor="carry_over_stamps_checkbox" className="text-sm">
              <span className="font-medium">
                Carry over customers&apos; current stamp count onto the new card
              </span>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                Left unchecked, everyone starts the new card from zero.
              </span>
            </label>
            <input
              type="hidden"
              name="carry_over_stamps"
              value={carryOverStamps ? "true" : "false"}
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
            their card is regenerated. Leave blank for a card that never
            expires.
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
          {isEdit
            ? "Save changes"
            : replacingId
              ? "Change type"
              : prepping
                ? "Save as draft"
                : "Create card"}
        </Button>
      </form>
      <PreviewCard
        progress={previewProgress}
        name={name}
        rewardText={rewardText}
      />
    </div>
  );
}
