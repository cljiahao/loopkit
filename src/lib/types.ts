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
          type: string;
          config: Json;
          active: boolean;
          expiry_days: number | null;
          head_start: boolean;
          replaced_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          vendor_id: string;
          name: string;
          stamps_required: number;
          reward_text: string;
          type?: string;
          config?: Json;
          active?: boolean;
          expiry_days?: number | null;
          head_start?: boolean;
          replaced_by?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          vendor_id?: string;
          name?: string;
          stamps_required?: number;
          reward_text?: string;
          type?: string;
          config?: Json;
          active?: boolean;
          expiry_days?: number | null;
          head_start?: boolean;
          replaced_by?: string | null;
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
          state: Json;
          card_token: string;
          last_event_at: string | null;
          cycle_started_at: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          program_id: string;
          phone: string;
          stamp_count?: number;
          reward_count?: number;
          state?: Json;
          card_token?: string;
          last_event_at?: string | null;
          cycle_started_at?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          program_id?: string;
          phone?: string;
          stamp_count?: number;
          reward_count?: number;
          state?: Json;
          card_token?: string;
          last_event_at?: string | null;
          cycle_started_at?: string;
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
          payload: Json | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          card_id: string;
          kind: string;
          payload?: Json | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          card_id?: string;
          kind?: string;
          payload?: Json | null;
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
      vendor_pro: {
        Row: {
          vendor_id: string;
          created_at: string;
        };
        Insert: {
          vendor_id: string;
          created_at?: string;
        };
        Update: {
          vendor_id?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      upgrade_requests: {
        Row: {
          id: string;
          vendor_id: string;
          status: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          vendor_id: string;
          status?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          vendor_id?: string;
          status?: string;
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
      record_visit: {
        Args: {
          p_program: string;
          p_phone: string;
          p_state: Json;
          p_kind: string;
          p_payload: Json;
        };
        Returns: Database["loopkit"]["Tables"]["cards"]["Row"];
      };
      create_program: {
        Args: {
          p_type: string;
          p_name: string;
          p_stamps_required: number;
          p_reward_text: string;
          p_config: Json;
          p_expiry_days?: number | null;
          p_head_start?: boolean;
        };
        Returns: string;
      };
      enroll_card: {
        Args: { p_program: string; p_phone: string };
        Returns: string;
      };
      card_view: {
        Args: { p_program: string; p_phone: string };
        Returns: {
          name: string;
          type: string;
          config: Json;
          state: Json;
          stamp_count: number;
          card_token: string;
          reward_text: string;
          stamps_required: number;
          expiry_days: number | null;
          cycle_started_at: string | null;
        }[];
      };
      vendor_active_programs: {
        Args: {
          p_vendor: string;
        };
        Returns: {
          id: string;
          name: string;
          type: string;
          reward_text: string;
        }[];
      };
      vendor_join: {
        Args: {
          p_vendor: string;
          p_phone: string;
        };
        Returns: {
          program_id: string;
          name: string;
          type: string;
          config: Json;
          state: Json;
          stamp_count: number;
          card_token: string;
          reward_text: string;
          stamps_required: number;
          expiry_days: number | null;
          cycle_started_at: string | null;
          active: boolean;
          replaced_by_name: string | null;
        }[];
      };
      card_by_token: {
        Args: { p_token: string };
        Returns: {
          program_id: string;
          card_id: string;
          phone: string;
        }[];
      };
      regenerate_card: {
        Args: { p_program: string; p_phone: string };
        Returns: Database["loopkit"]["Tables"]["cards"]["Row"];
      };
      is_admin: {
        Args: { p_uid: string };
        Returns: boolean;
      };
      is_pro: {
        Args: { p_uid: string };
        Returns: boolean;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
