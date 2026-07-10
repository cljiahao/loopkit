import type { ProgramType } from "@/lib/program";

export type Template = {
  key: string;
  label: string;
  description: string;
  type: ProgramType;
  defaults: {
    name: string;
    reward_text: string;
    stamps_required?: number;
    visits_to_bloom?: number;
    win_percent?: number;
    pity_ceiling?: number;
    period_days?: number;
    target_streak?: number;
  };
};

// Curated presets — each just prefills SetupForm's existing fields for a
// given engine type; nothing here is persisted. A vendor can edit any field
// before saving, exactly as if they'd picked the type manually. Every
// template's defaults are validated against saveProgramSchema in
// test/lib/templates.test.ts, so a schema change that breaks a template is
// caught at test time, not at first vendor use.
export const TEMPLATES: Template[] = [
  {
    key: "cafe-regulars",
    label: "Cafe Regulars",
    description: "10 visits, free coffee",
    type: "stamp",
    defaults: {
      name: "Coffee card",
      stamps_required: 10,
      reward_text: "Free coffee",
    },
  },
  {
    key: "bakery-loaf-club",
    label: "Bakery Loaf Club",
    description: "8 visits, free loaf",
    type: "stamp",
    defaults: {
      name: "Loaf club",
      stamps_required: 8,
      reward_text: "Free loaf of bread",
    },
  },
  {
    key: "salon-vip",
    label: "Salon VIP",
    description: "6 visits, free treatment",
    type: "stamp",
    defaults: {
      name: "Salon VIP card",
      stamps_required: 6,
      reward_text: "Free treatment",
    },
  },
  {
    key: "weekly-regular",
    label: "Weekly Regular",
    description: "Visit weekly, reward after a 4-week streak",
    type: "streak",
    defaults: {
      name: "Weekly regular",
      period_days: 7,
      target_streak: 4,
      reward_text: "Free item",
    },
  },
  {
    key: "grow-a-kopi",
    label: "Grow-a-Kopi",
    description: "6 visits to bloom",
    type: "plant",
    defaults: {
      name: "Grow-a-kopi",
      visits_to_bloom: 6,
      reward_text: "Free kopi",
    },
  },
  {
    key: "lucky-tap",
    label: "Lucky Tap",
    description: "20% win chance every visit",
    type: "lucky",
    defaults: {
      name: "Lucky tap",
      win_percent: 20,
      pity_ceiling: 8,
      reward_text: "Free item",
    },
  },
  {
    key: "spin-the-wheel",
    label: "Spin the Wheel",
    description: "Spin for a prize on every visit",
    type: "wheel",
    defaults: { name: "Spin to win", reward_text: "Free item" },
  },
  {
    key: "scratch-and-win",
    label: "Scratch & Win",
    description: "Scratch for a prize on every visit",
    type: "scratch",
    defaults: { name: "Scratch & win", reward_text: "Free item" },
  },
];
