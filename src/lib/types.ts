export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

// Not part of the loopkit schema — this is the shape of the shared
// merqo.vendor_profile.social_links JSONB column (see
// src/lib/merqo-vendor-profile.ts), which loopkit reads/writes but doesn't
// own. Same 4 keys as qkit's identically-named type, since both kits read
// the same column.
export type SocialLinks = {
  website?: string;
  instagram?: string;
  facebook?: string;
  tiktok?: string;
};

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
          reward_expiry_days: number | null;
          head_start: boolean;
          replaced_by: string | null;
          carry_over_stamps: boolean;
          head_start_percent: number;
          scheduled_deactivate_at: string | null;
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
          reward_expiry_days?: number | null;
          head_start?: boolean;
          replaced_by?: string | null;
          carry_over_stamps?: boolean;
          head_start_percent?: number;
          scheduled_deactivate_at?: string | null;
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
          reward_expiry_days?: number | null;
          head_start?: boolean;
          replaced_by?: string | null;
          carry_over_stamps?: boolean;
          head_start_percent?: number;
          scheduled_deactivate_at?: string | null;
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
          customer_name: string | null;
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
          customer_name?: string | null;
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
          customer_name?: string | null;
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
      reward_vouchers: {
        Row: {
          id: string;
          card_id: string;
          program_id: string;
          reward_text: string;
          earned_at: string;
          expires_at: string | null;
          redeemed_at: string | null;
          status: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          card_id: string;
          program_id: string;
          reward_text: string;
          earned_at?: string;
          expires_at?: string | null;
          redeemed_at?: string | null;
          status?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          card_id?: string;
          program_id?: string;
          reward_text?: string;
          earned_at?: string;
          expires_at?: string | null;
          redeemed_at?: string | null;
          status?: string;
          updated_at?: string;
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
      vendors: {
        Row: {
          vendor_id: string;
          name: string | null;
          phone: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          vendor_id: string;
          name?: string | null;
          phone?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          vendor_id?: string;
          name?: string | null;
          phone?: string | null;
          created_at?: string;
          updated_at?: string;
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
      qkit_earn_config: {
        Row: {
          vendor_id: string;
          program_id: string;
          enabled: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          vendor_id: string;
          program_id: string;
          enabled?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          vendor_id?: string;
          program_id?: string;
          enabled?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      qkit_earn_events: {
        Row: {
          order_id: string;
          vendor_id: string;
          card_id: string;
          created_at: string;
        };
        Insert: {
          order_id: string;
          vendor_id: string;
          card_id: string;
          created_at?: string;
        };
        Update: {
          order_id?: string;
          vendor_id?: string;
          card_id?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      customers: {
        Row: {
          vendor_id: string;
          phone: string;
          name: string | null;
          first_seen_at: string;
          last_seen_at: string;
        };
        Insert: {
          vendor_id: string;
          phone: string;
          name?: string | null;
          first_seen_at?: string;
          last_seen_at?: string;
        };
        Update: {
          vendor_id?: string;
          phone?: string;
          name?: string | null;
          first_seen_at?: string;
          last_seen_at?: string;
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
          p_carry_over_stamps?: boolean;
          p_active?: boolean;
          p_head_start_percent?: number;
        };
        Returns: string;
      };
      activate_program: {
        Args: { p_program: string };
        Returns: Database["loopkit"]["Tables"]["programs"]["Row"];
      };
      schedule_retirement: {
        Args: {
          p_program: string;
          p_successor: string;
          p_date: string;
        };
        Returns: Database["loopkit"]["Tables"]["programs"]["Row"];
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
          replaced_by_stamp_count: number | null;
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
      qkit_earn_lookup: {
        Args: { p_order_id: string; p_phone: string };
        Returns: {
          vendor_id: string;
          program_id: string;
          program_type: string;
          program_config: Json;
          stamps_required: number;
          reward_text: string;
          already_claimed: boolean;
          card_state: Json;
          card_stamp_count: number;
          card_reward_count: number;
        }[];
      };
      qkit_earn_commit: {
        Args: {
          p_order_id: string;
          p_phone: string;
          p_name: string | null;
          p_stamp_count: number;
          p_state: Json;
        };
        Returns: Database["loopkit"]["Tables"]["cards"]["Row"];
      };
      expire_stale_vouchers: {
        Args: { p_card: string };
        Returns: number;
      };
      grant_reward_voucher: {
        Args: {
          p_card: string;
          p_reward_text: string;
          p_expiry_days: number | null;
          p_count?: number;
          p_immediate?: boolean;
        };
        Returns: void;
      };
      redeem_oldest_voucher: {
        Args: { p_card: string };
        Returns: void;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
