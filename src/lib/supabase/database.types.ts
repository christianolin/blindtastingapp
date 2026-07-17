// Hand-written to match supabase/migrations/*_init_schema.sql — type
// generation via `supabase gen types` needs either Docker (local postgres-meta
// container) or a logged-in CLI session (Management API), neither available
// here. Regenerate once one of those is available:
// npx supabase gen types typescript --linked > src/lib/supabase/database.types.ts
//
// `Relationships: []` on every table and `Views: {}` on the schema aren't
// unused boilerplate — @supabase/postgrest-js's GenericTable/GenericSchema
// types require those exact keys to exist or its generic inference silently
// collapses to `never`.

export type TimingMode = "LIVE" | "ASYNC";
export type WineSourceMode = "HOST_PROVIDES" | "PARTICIPANT_CONTRIBUTED";
export type RevealMode = "BLIND" | "SEMI_BLIND";
export type TastingStatus = "DRAFT" | "OPEN" | "IN_PROGRESS" | "CLOSED";
export type ParticipantStatus = "INVITED" | "JOINED" | "DECLINED";
export type AsyncRevealPolicy = "AFTER_ALL" | "IMMEDIATE";
export type VintageKind = "YEAR" | "NV" | "TAWNY";

type ReferenceTable = {
  Row: { id: string; name: string };
  Insert: { id?: string; name: string };
  Update: { id?: string; name: string };
  Relationships: [];
};

type ScopedReferenceTable<ParentKey extends string> = {
  Row: { id: string; name: string } & Record<ParentKey, string>;
  Insert: { id?: string; name: string } & Record<ParentKey, string>;
  Update: Partial<{ id: string; name: string } & Record<ParentKey, string>>;
  Relationships: [];
};

export type Database = {
  public: {
    Tables: {
      countries: ReferenceTable;
      regions: ScopedReferenceTable<"country_id">;
      appellations: ScopedReferenceTable<"region_id">;
      grapes: ReferenceTable;
      producers: ReferenceTable;
      type_designations: {
        Row: {
          id: string;
          name: string;
          category: string | null;
          country_id: string | null;
          region_id: string | null;
          sort_order: number;
          is_active: boolean;
        };
        Insert: {
          id?: string;
          name: string;
          category?: string | null;
          country_id?: string | null;
          region_id?: string | null;
          sort_order?: number;
          is_active?: boolean;
        };
        Update: Partial<
          Database["public"]["Tables"]["type_designations"]["Insert"]
        >;
        Relationships: [];
      };

      profiles: {
        Row: {
          id: string;
          display_name: string;
          email: string;
          avatar_url: string | null;
          bio: string | null;
          location: string | null;
          phone: string | null;
          favorite_wine_type: string | null;
          created_at: string;
        };
        Insert: {
          id: string;
          display_name: string;
          email: string;
          avatar_url?: string | null;
          bio?: string | null;
          location?: string | null;
          phone?: string | null;
          favorite_wine_type?: string | null;
          created_at?: string;
        };
        Update: Partial<{
          id: string;
          display_name: string;
          email: string;
          avatar_url: string | null;
          bio: string | null;
          location: string | null;
          phone: string | null;
          favorite_wine_type: string | null;
          created_at: string;
        }>;
        Relationships: [];
      };

      friendships: {
        Row: {
          id: string;
          user_id: string;
          friend_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          friend_id: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["friendships"]["Insert"]>;
        Relationships: [];
      };

      tastings: {
        Row: {
          id: string;
          name: string;
          host_id: string;
          timing_mode: TimingMode;
          wine_source: WineSourceMode;
          reveal_mode: RevealMode;
          status: TastingStatus;
          current_wine_id: string | null;
          opens_at: string | null;
          closes_at: string | null;
          scheduled_at: string | null;
          async_reveal_policy: AsyncRevealPolicy;
          sequential_guessing: boolean;
          created_at: string;
          image_url: string | null;
          description: string | null;
        };
        Insert: {
          id?: string;
          name: string;
          host_id: string;
          timing_mode: TimingMode;
          wine_source: WineSourceMode;
          reveal_mode?: RevealMode;
          status?: TastingStatus;
          current_wine_id?: string | null;
          opens_at?: string | null;
          closes_at?: string | null;
          scheduled_at?: string | null;
          async_reveal_policy?: AsyncRevealPolicy;
          sequential_guessing?: boolean;
          created_at?: string;
          image_url?: string | null;
          description?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["tastings"]["Insert"]>;
        Relationships: [];
      };

      tasting_participants: {
        Row: {
          id: string;
          tasting_id: string;
          user_id: string;
          status: ParticipantStatus;
          joined_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          tasting_id: string;
          user_id: string;
          status?: ParticipantStatus;
          joined_at?: string | null;
          created_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["tasting_participants"]["Insert"]
        >;
        Relationships: [];
      };

      wines: {
        Row: {
          id: string;
          tasting_id: string;
          position: number;
          contributor_participant_id: string | null;
          is_revealed: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          tasting_id: string;
          position: number;
          contributor_participant_id?: string | null;
          is_revealed?: boolean;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["wines"]["Insert"]>;
        Relationships: [];
      };

      wine_answers: {
        Row: {
          wine_id: string;
          country_id: string;
          region_id: string;
          appellation_id: string | null;
          primary_grape_id: string;
          secondary_grape_id: string | null;
          producer_id: string;
          type_designation_id: string | null;
          vintage_kind: VintageKind;
          vintage_year: number | null;
          vintage_tawny_years: number | null;
          image_url: string | null;
        };
        Insert: {
          wine_id: string;
          country_id: string;
          region_id: string;
          appellation_id?: string | null;
          primary_grape_id: string;
          secondary_grape_id?: string | null;
          producer_id: string;
          type_designation_id?: string | null;
          vintage_kind: VintageKind;
          vintage_year?: number | null;
          vintage_tawny_years?: number | null;
          image_url?: string | null;
        };
        Update: Partial<
          Database["public"]["Tables"]["wine_answers"]["Insert"]
        >;
        Relationships: [];
      };

      guesses: {
        Row: {
          id: string;
          wine_id: string;
          participant_id: string;
          country_id: string | null;
          region_id: string | null;
          appellation_id: string | null;
          primary_grape_id: string | null;
          secondary_grape_id: string | null;
          producer_id: string | null;
          type_designation_id: string | null;
          vintage_kind: VintageKind | null;
          vintage_year: number | null;
          vintage_tawny_years: number | null;
          guessed_wine_id: string | null;
          country_points: number | null;
          region_points: number | null;
          appellation_points: number | null;
          primary_grape_points: number | null;
          secondary_grape_points: number | null;
          producer_points: number | null;
          type_designation_points: number | null;
          vintage_points: number | null;
          total_points: number | null;
          scored_at: string | null;
          submitted_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          wine_id: string;
          participant_id: string;
          country_id?: string | null;
          region_id?: string | null;
          appellation_id?: string | null;
          primary_grape_id?: string | null;
          secondary_grape_id?: string | null;
          producer_id?: string | null;
          type_designation_id?: string | null;
          vintage_kind?: VintageKind | null;
          vintage_year?: number | null;
          vintage_tawny_years?: number | null;
          guessed_wine_id?: string | null;
          submitted_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["guesses"]["Insert"]>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      reveal_wine: {
        Args: { p_wine_id: string };
        Returns: void;
      };
      score_own_guess: {
        Args: { p_wine_id: string };
        Returns: void;
      };
      search_appellations: {
        Args: { p_query: string; p_region_id?: string };
        Returns: { id: string; name: string }[];
      };
      search_producers: {
        Args: { p_query: string };
        Returns: { id: string; name: string }[];
      };
      tasting_guess_status: {
        Args: { p_tasting_id: string };
        Returns: { wine_id: string; participant_id: string }[];
      };
    };
  };
};
