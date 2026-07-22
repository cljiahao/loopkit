"use client";

import { useActionState, useState } from "react";
import {
  saveProgramAction,
  changeTypeAction,
  prepProgramAction,
} from "@/app/setup/actions";
import type { Program, ProgramType } from "@/lib/program";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { usePreviewAnimation } from "@/app/setup/preview-animation";
import { PreviewCard } from "@/app/setup/preview-card";
import { Section } from "@/components/section";
import { InfoTooltip } from "@/components/info-tooltip";
import { Tag, SlidersHorizontal } from "lucide-react";
import {
  FAMILIES,
  familyOf,
  isSingleStyleFamily,
  resolveFamilyAndStyle,
  styleToTypeAndVariant,
  type FamilyKey,
  type StyleKey,
} from "@/app/setup/card-type-picker";

type SegmentInput = { label: string; weight: number; is_reward: boolean };

const labelClass =
  "text-xs font-semibold uppercase tracking-wider text-muted-foreground";

type TypeOptionValue =
  | "stamp"
  | "flame"
  | "points"
  | "lucky"
  | "plant"
  | "cup"
  | "wheel"
  | "scratch";

const typeLabels: Record<TypeOptionValue, string> = {
  stamp: "Stamp card",
  flame: "Flame Club",
  points: "Points Club",
  lucky: "Lucky Tap",
  plant: "Sprout",
  cup: "Fill the Cup",
  wheel: "Spin the Wheel",
  scratch: "Scratch Card",
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
    program?.type === "scratch"
      ? program.type
      : "stamp";
  const [type, setType] = useState<ProgramType>(initialType);

  const config = (program?.config ?? {}) as {
    win_probability?: number;
    pity_ceiling?: number;
    reward_text?: string;
    stages?: { threshold: number }[];
    segments?: { label: string; weight: number; reward_text?: string }[];
    variant?: string;
  };

  const [variant, setVariant] = useState<
    "dots" | "flame" | "points" | "plant" | "cup"
  >(() => {
    if (config.variant === "flame") return "flame";
    if (config.variant === "points") return "points";
    if (config.variant === "cup") return "cup";
    return initialType === "plant" ? "plant" : "dots";
  });
  const selectedOptionKey: TypeOptionValue =
    type === "stamp" && variant === "flame"
      ? "flame"
      : type === "stamp" && variant === "points"
        ? "points"
        : type === "plant" && variant === "cup"
          ? "cup"
          : (type as TypeOptionValue);

  // Step 1 shows the 4 family tiles; picking a multi-style family switches
  // to that family's style tiles (Step 2). "family" means Step 1 is showing.
  const [familyStep, setFamilyStep] = useState<"family" | FamilyKey>("family");
  const currentFamilyAndStyle = resolveFamilyAndStyle(type, variant);

  // Every field below is controlled — the same state drives both form
  // submission and the live preview, updated on every keystroke.
  const [name, setName] = useState(program?.name ?? "");
  const [rewardText, setRewardText] = useState(
    program?.reward_text ?? config.reward_text ?? "",
  );
  const [stampsRequired, setStampsRequired] = useState(
    program?.stamps_required ?? 10,
  );
  const [pointsPerVisit, setPointsPerVisit] = useState(
    (config as { points_per_visit?: number }).points_per_visit ?? 10,
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

  const [segments, setSegments] = useState<SegmentInput[]>(
    config.segments?.map((s) => ({
      label: s.label,
      weight: s.weight,
      is_reward: !!s.reward_text,
    })) ?? DEFAULT_SEGMENTS,
  );
  const [headStart, setHeadStart] = useState(program?.head_start ?? false);
  const [headStartPercent, setHeadStartPercent] = useState(
    program?.head_start_percent ?? 20,
  );
  const [carryOverStamps, setCarryOverStamps] = useState(false);
  const showCarryOverOption =
    replacingId !== null && replacingType === "stamp" && type === "stamp";

  const {
    progress: previewProgress,
    celebrating,
    lastChanceResult,
  } = usePreviewAnimation({
    type,
    name,
    rewardText,
    stampsRequired,
    visitsToBloom,
    winPercent,
    pityCeiling,
    segments,
    headStart,
    headStartPercent,
    variant,
    pointsPerVisit,
  });

  // Sets the type plus its sensible numeric defaults, and always resets
  // name/rewardText to blank — the vendor types both themselves, no
  // suggested copy is ever prefilled on the create flow. Delegates the
  // style -> type/variant mapping to card-type-picker.ts so this file
  // doesn't duplicate it.
  function pickStyle(style: StyleKey) {
    const { type: nextType, variant: nextVariant } =
      styleToTypeAndVariant(style);
    setType(nextType);
    setVariant(nextVariant ?? "dots");
    setName("");
    setRewardText("");
    setStampsRequired(style === "points" ? 500 : 10);
    setVisitsToBloom(6);
    setWinPercent(20);
    setPityCeiling(style === "lucky" ? 8 : undefined);
    setHeadStartPercent(20);
    setPointsPerVisit(10);
  }

  // Clicking a family either completes the pick immediately (Lucky Tap has
  // exactly one style, so there's nothing to choose) or opens that
  // family's style tiles (Step 2).
  function pickFamily(family: FamilyKey) {
    if (isSingleStyleFamily(family)) {
      pickStyle(familyOf(family).styles[0].key);
      return;
    }
    setFamilyStep(family);
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

  // Rendered twice below (mobile inline, desktop sticky) rather than
  // repositioned via CSS alone — sticky positioning only makes sense once
  // the preview is in its own grid column (lg+), so below that breakpoint
  // it renders inline right after the type picker instead, same effective
  // position it had before this task.
  const preview = (
    <PreviewCard
      progress={previewProgress}
      name={name}
      rewardText={rewardText}
      celebrating={celebrating}
      lastChanceResult={lastChanceResult}
    />
  );

  const typePicker = isEdit ? (
    <p className="flex h-11 items-center rounded-xl border bg-muted/40 px-3 text-sm font-semibold text-muted-foreground">
      {typeLabels[selectedOptionKey]}
    </p>
  ) : familyStep === "family" ? (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {FAMILIES.map((family) => (
        <button
          key={family.key}
          type="button"
          aria-label={family.label}
          onClick={() => pickFamily(family.key)}
          className={cn(
            "flex flex-col items-start gap-0.5 rounded-xl border p-3 text-left transition-colors",
            currentFamilyAndStyle.family === family.key
              ? "border-primary bg-primary/10"
              : "bg-card hover:bg-muted/50",
          )}
        >
          <span className="text-sm font-semibold">{family.label}</span>
          <span className="text-xs text-muted-foreground">
            {family.description}
          </span>
          {family.styles.length > 1 ? (
            <span className="mt-1 text-[0.65rem] font-medium uppercase tracking-wider text-muted-foreground/70">
              {family.styles.length} styles
            </span>
          ) : null}
        </button>
      ))}
    </div>
  ) : (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => setFamilyStep("family")}
        className="text-xs font-medium text-primary hover:underline"
      >
        ← Back
      </button>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {familyOf(familyStep).styles.map((style) => (
          <button
            key={style.key}
            type="button"
            aria-label={style.label}
            onClick={() => pickStyle(style.key)}
            className={cn(
              "flex flex-col items-start gap-0.5 rounded-xl border p-3 text-left transition-colors",
              currentFamilyAndStyle.style === style.key
                ? "border-primary bg-primary/10"
                : "bg-card hover:bg-muted/50",
            )}
          >
            <span className="text-sm font-semibold">{style.label}</span>
            <span className="text-xs text-muted-foreground">
              {style.description}
            </span>
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <div className="mt-7 grid grid-cols-1 gap-6 lg:grid-cols-[1.4fr_1fr] lg:items-start">
      <form action={formAction} className="space-y-6">
        {program ? <input type="hidden" name="id" value={program.id} /> : null}
        {replacingId ? (
          <input type="hidden" name="replacing" value={replacingId} />
        ) : null}
        <input type="hidden" name="type" value={type} />
        {type === "stamp" || type === "plant" ? (
          <input type="hidden" name="variant" value={variant} />
        ) : null}

        <Section
          icon={<Tag className="size-4" />}
          eyebrow="Every card needs this"
          title="Choose a card type"
          description="Pick a family, then a style."
        >
          {typePicker}
          <div className="lg:hidden">{preview}</div>
        </Section>

        <Section
          icon={<Tag className="size-4" />}
          eyebrow="Every card needs this"
          title="Basics"
          description="The name and reward customers see."
        >
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
                  {variant === "flame"
                    ? "Visits for full blaze"
                    : variant === "points"
                      ? "Points required"
                      : "Stamps required"}
                </Label>
                <Input
                  id="stamps_required"
                  name="stamps_required"
                  type="number"
                  required
                  min={2}
                  max={variant === "points" ? 100000 : 20}
                  placeholder={variant === "points" ? "500" : "10"}
                  value={stampsRequired}
                  onChange={(e) => setStampsRequired(Number(e.target.value))}
                  className="h-11 rounded-xl"
                />
                <div className="flex gap-1.5">
                  {(variant === "points" ? [100, 500, 1000] : [5, 10, 15]).map(
                    (n) => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => setStampsRequired(n)}
                        className={cn(
                          "h-7 rounded-lg border px-2.5 text-xs font-semibold transition-colors",
                          stampsRequired === n
                            ? "border-primary bg-primary/10 text-primary"
                            : "bg-card text-muted-foreground hover:bg-muted/50",
                        )}
                      >
                        {n}
                      </button>
                    ),
                  )}
                </div>
              </div>
              {variant === "points" && (
                <div className="space-y-2">
                  <Label htmlFor="points_per_visit" className={labelClass}>
                    Points per visit
                  </Label>
                  <Input
                    id="points_per_visit"
                    name="points_per_visit"
                    type="number"
                    required
                    min={1}
                    max={1000}
                    placeholder="10"
                    value={pointsPerVisit}
                    onChange={(e) => setPointsPerVisit(Number(e.target.value))}
                    className="h-11 rounded-xl"
                  />
                </div>
              )}
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
                  {variant === "cup" ? "Visits to fill" : "Visits to bloom"}
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
                        : "Scratch & win"
                  }
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="h-11 rounded-xl"
                />
              </div>

              {type === "wheel" || type === "scratch" ? (
                <>
                  <div className="space-y-2">
                    <div className="flex items-center gap-1.5">
                      <Label className={labelClass}>
                        {type === "wheel" ? "Wheel segments" : "Scratch prizes"}
                      </Label>
                      <InfoTooltip label="What the number next to each prize means">
                        That&apos;s the odds weight — higher numbers land more
                        often relative to the other prizes.
                      </InfoTooltip>
                    </div>
                    <div className="space-y-2">
                      {segments.map((segment, i) => (
                        <div
                          key={i}
                          className="flex flex-wrap items-center gap-2"
                        >
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
                            aria-label="Odds weight"
                            className="h-11 w-20 rounded-xl"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              updateSegment(i, {
                                is_reward: !segment.is_reward,
                              })
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
        </Section>

        <Section
          icon={<SlidersHorizontal className="size-4" />}
          eyebrow="How it works"
          title="Rules"
          description="Head start, carry-over, and how long a card lasts."
        >
          {(type === "stamp" || type === "plant") && (
            <div className="flex items-start gap-3 rounded-xl border bg-muted/40 p-3">
              <Switch
                id="head_start_checkbox"
                checked={headStart}
                onCheckedChange={setHeadStart}
                className="mt-0.5"
              />
              <div className="flex-1 space-y-2">
                <div className="flex items-center gap-1.5">
                  <label
                    htmlFor="head_start_checkbox"
                    className="text-sm font-medium"
                  >
                    Give new customers a head start
                  </label>
                  <InfoTooltip label="Why give a head start?">
                    New signups start with a small amount of free progress
                    toward their first reward — shown to measurably increase
                    completion.
                  </InfoTooltip>
                </div>
                {headStart && (type === "stamp" || type === "plant") && (
                  <div className="flex items-center gap-2">
                    <Label
                      htmlFor="head_start_percent"
                      className="text-xs font-semibold text-muted-foreground"
                    >
                      Head start amount
                    </Label>
                    <Input
                      id="head_start_percent"
                      type="number"
                      min={5}
                      max={50}
                      value={headStartPercent}
                      onChange={(e) =>
                        setHeadStartPercent(Number(e.target.value))
                      }
                      className="h-9 w-20 rounded-lg"
                    />
                    <span className="text-xs text-muted-foreground">%</span>
                  </div>
                )}
              </div>
              <input
                type="hidden"
                name="head_start"
                value={headStart ? "true" : "false"}
              />
              {headStart && (type === "stamp" || type === "plant") && (
                <input
                  type="hidden"
                  name="head_start_percent"
                  value={headStartPercent}
                />
              )}
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
                  Carry over customers&apos; current stamp count onto the new
                  card
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
            <div className="flex items-center gap-1.5">
              <Label htmlFor="expiry_days" className={labelClass}>
                Card expires after (days, optional)
              </Label>
              <InfoTooltip label="How card expiry is counted">
                Counted from each customer&apos;s current cycle — resets
                whenever their card is regenerated.
              </InfoTooltip>
            </div>
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
              Leave blank for a card that never expires.
            </p>
          </div>

          {(type === "stamp" || type === "plant") && (
            <div className="space-y-2">
              <div className="flex items-center gap-1.5">
                <Label htmlFor="reward_expiry_days" className={labelClass}>
                  Reward expires after (days, optional)
                </Label>
                <InfoTooltip label="How reward expiry differs from card expiry">
                  Counted from the moment a customer earns the reward — separate
                  from the card-expiry setting above, which resets a whole
                  card&apos;s progress after inactivity.
                </InfoTooltip>
              </div>
              <Input
                id="reward_expiry_days"
                name="reward_expiry_days"
                type="number"
                min={1}
                max={3650}
                placeholder="Never expires"
                defaultValue={program?.reward_expiry_days ?? ""}
                className="h-11 rounded-xl"
              />
              <p className="text-xs text-muted-foreground">
                Leave blank so an earned reward never expires.
              </p>
            </div>
          )}

          {state.error ? (
            <p className="text-sm font-medium text-destructive">
              {state.error}
            </p>
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
        </Section>
      </form>

      <div className="hidden lg:sticky lg:top-6 lg:block lg:self-start">
        {preview}
      </div>
    </div>
  );
}
