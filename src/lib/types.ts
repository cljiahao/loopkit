export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

// Hand-written mirror of supabase/migrations/0001_loopkit_core.sql — no live
// DB/codegen available yet. Keep in sync with the migration; keep the schema
// key in sync with `db.schema` in src/lib/supabase/{client,server}.ts and
// src/lib/supabase/middleware.ts, or supabase-js queries degrade to `never`.
export interface Database {
  loopkit: {
    Tables: {
      programs: {
        Row: {
          id: string;
          vendor_id: string;
          name: string;
          stamps_required: number;
          reward_text: string;
          active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          vendor_id: string;
          name: string;
          stamps_required: number;
          reward_text: string;
          active?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          vendor_id?: string;
          name?: string;
          stamps_required?: number;
          reward_text?: string;
          active?: boolean;
          created_at?: string;
        };
        Relationships: [];
      };
      cards: {
        Row: {
          id: string;
          program_id: string;
          phone: string;
          stamp_count: number;
          reward_count: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          program_id: string;
          phone: string;
          stamp_count?: number;
          reward_count?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          program_id?: string;
          phone?: string;
          stamp_count?: number;
          reward_count?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      stamp_events: {
        Row: {
          id: string;
          card_id: string;
          kind: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          card_id: string;
          kind: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          card_id?: string;
          kind?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      admins: {
        Row: {
          user_id: string;
          created_at: string;
        };
        Insert: {
          user_id: string;
          created_at?: string;
        };
        Update: {
          user_id?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      admin_audit: {
        Row: {
          id: string;
          admin_id: string;
          action: string;
          target_id: string | null;
          detail: Json | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          admin_id: string;
          action: string;
          target_id?: string | null;
          detail?: Json | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          admin_id?: string;
          action?: string;
          target_id?: string | null;
          detail?: Json | null;
          created_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      owns_program: {
        Args: { p_program: string };
        Returns: boolean;
      };
      add_stamp: {
        Args: { p_program: string; p_phone: string };
        Returns: Database["loopkit"]["Tables"]["cards"]["Row"];
      };
      redeem: {
        Args: { p_card: string };
        Returns: Database["loopkit"]["Tables"]["cards"]["Row"];
      };
      card_status: {
        Args: { p_program: string; p_phone: string };
        Returns: {
          name: string;
          stamp_count: number;
          stamps_required: number;
          reward_text: string;
        }[];
      };
      is_admin: {
        Args: { p_uid: string };
        Returns: boolean;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
