import type { ProgressView } from "@/lib/engine/types";

// Shared client/server state type for the public card-check form. A
// "use server" module may only export async functions, so this plain module
// is what both actions.ts and check-form.tsx import.
export type CardStatus = {
  programId: string;
  name: string;
  label: string;
  view: ProgressView;
  rewardReady: boolean;
  reward_text: string;
  qr: string;
  expired: boolean;
  active: boolean;
  replacedByName: string | null;
};

export type StatusState = {
  status: "idle" | "found" | "none" | "error";
  cards?: CardStatus[];
  message?: string;
  phone?: string;
};

export const STATUS_IDLE: StatusState = { status: "idle" };
