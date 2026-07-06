import { z } from "zod";
import { createServerClient } from "@/lib/supabase/server";

export type Program = {
  id: string;
  name: string;
  stamps_required: number;
  reward_text: string;
  active: boolean;
};

export const programInputSchema = z.object({
  name: z.string().trim().min(1).max(60),
  stamps_required: z.coerce.number().int().min(2).max(20),
  reward_text: z.string().trim().min(1).max(80),
});

// The signed-in vendor's program, or null if they haven't set one up yet.
// RLS (programs_own) scopes the select to auth.uid(), so no vendor_id filter
// is needed here — and a vendor has at most one program (unique vendor_id).
export async function getProgram(): Promise<Program | null> {
  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("programs")
    .select("id,name,stamps_required,reward_text,active")
    .maybeSingle();
  if (error) throw new Error(`getProgram: ${error.message}`);
  return data;
}
