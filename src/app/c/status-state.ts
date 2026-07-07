// Shared client/server state type for the public stamp-check form. A
// "use server" module may only export async functions, so this plain module
// is what both actions.ts and check-form.tsx import.
export type StatusState = {
  status: "idle" | "found" | "none" | "error";
  stamp_count?: number;
  stamps_required?: number;
  reward_text?: string;
  message?: string;
};

export const STATUS_IDLE: StatusState = { status: "idle" };
