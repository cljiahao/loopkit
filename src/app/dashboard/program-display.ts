export const PROGRAM_TYPE_BADGE: Record<
  string,
  { label: string; variant: "default" | "gold" }
> = {
  stamp: { label: "Stamp", variant: "default" },
  lucky: { label: "Lucky Tap", variant: "default" },
  plant: { label: "Sprout", variant: "gold" },
  wheel: { label: "Wheel", variant: "default" },
  scratch: { label: "Scratch", variant: "default" },
};

type DescribableProgram = {
  type: string;
  stamps_required: number;
  reward_text: string;
  config: unknown;
};

// One-line reward-mechanic blurb per program type, for the dashboard card
// header. Every branch is exercised now that all of a vendor's active
// programs render at once (previously only the single switched-to program
// was visible, so wheel/scratch silently fell through to a generic
// description on dashboard/page.tsx).
export function describeProgram(program: DescribableProgram): string {
  const { type, stamps_required, reward_text, config } = program;
  if (type === "lucky") {
    const winProbability =
      (config as { win_probability?: number })?.win_probability ?? 0;
    return `Every visit has a ${Math.round(winProbability * 100)}% chance to win ${reward_text}`;
  }
  if (type === "plant") {
    return `Water it ${stamps_required} times to bloom ${reward_text}`;
  }
  if (type === "wheel") {
    return `Spin the wheel for a chance to win ${reward_text}`;
  }
  if (type === "scratch") {
    return `Scratch for a chance to win ${reward_text}`;
  }
  return `Buy ${stamps_required}, get 1 ${reward_text}`;
}

type DetailableProgram = {
  expiry_days?: number | null;
  head_start: boolean;
};

// Short supplementary detail line(s) for the dashboard card, below the
// one-line describeProgram() blurb. Pure — built only from fields already
// on the program row, no new query.
export function programDetails(program: DetailableProgram): string[] {
  const details: string[] = [];
  details.push(
    program.expiry_days
      ? `Resets after ${program.expiry_days} days`
      : "Never expires",
  );
  if (program.head_start) {
    details.push("New customers get a head start");
  }
  return details;
}
