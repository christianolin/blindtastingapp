// Hand-written to match supabase/migrations/*_init_schema.sql — type
// generation via `supabase gen types` needs either Docker (local postgres-meta
// container) or a logged-in CLI session (Management API), neither available
// here. Regenerate once one of those is available:
// npx supabase gen types typescript --linked > src/lib/supabase/database.types.ts

export type TimingMode = "LIVE" | "ASYNC";
export type WineSourceMode = "HOST_PROVIDES" | "PARTICIPANT_CONTRIBUTED";
export type TastingStatus = "DRAFT" | "OPEN" | "IN_PROGRESS" | "CLOSED";
export type ParticipantStatus = "INVITED" | "JOINED" | "DECLINED";
export type VintageKind = "YEAR" | "NV" | "TAWNY";

type ReferenceTable = {
  Row: { id: string; name: string };
  Insert: { id?: string; name: string };
  Update: { id?: string; name: string };
};

type ScopedReferenceTable<ParentKey extends string> = {
  Row: { id: string; name: string } & Record<ParentKey, string>;
  Insert: { id?: string; name: string } & Record<ParentKey, string>;
  Update: Partial<{ id: string; name: string } & Record<ParentKey, string>>;
};

export type Database = {
  public: {
    Tables: {
      countries: ReferenceTable;
      regions: ScopedReferenceTable<"country_id">;
      appellations: ScopedReferenceTable<"region_id">;
      grapes: ReferenceTable;
      producers: ReferenceTable;
      type_designations: ReferenceTable;

      profiles: {
        Row: {
          id: string;
          display_name: string;
          email: string;
          created_at: string;
        };
        Insert: {
          id: string;
          display_name: string;
          email: string;
          created_at?: string;
        };
        Update: Partial<{
          id: string;
          display_name: string;
          email: string;
          created_at: string;
        }>;
      };

      tastings: {
        Row: {
          id: string;
          name: string;
          host_id: string;
          timing_mode: TimingMode;
          wine_source: WineSourceMode;
          status: TastingStatus;
          current_wine_id: string | null;
          opens_at: string | null;
          closes_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          host_id: string;
          timing_mode: TimingMode;
          wine_source: WineSourceMode;
          status?: TastingStatus;
          current_wine_id?: string | null;
          opens_at?: string | null;
          closes_at?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["tastings"]["Insert"]>;
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
      };

      wine_answers: {
        Row: {
          wine_id: string;
          country_id: string;
          region_id: string;
          appellation_id: string;
          primary_grape_id: string;
          secondary_grape_id: string | null;
          producer_id: string;
          type_designation_id: string | null;
          vintage_kind: VintageKind;
          vintage_year: number | null;
          vintage_tawny_years: number | null;
        };
        Insert: {
          wine_id: string;
          country_id: string;
          region_id: string;
          appellation_id: string;
          primary_grape_id: string;
          secondary_grape_id?: string | null;
          producer_id: string;
          type_designation_id?: string | null;
          vintage_kind: VintageKind;
          vintage_year?: number | null;
          vintage_tawny_years?: number | null;
        };
        Update: Partial<
          Database["public"]["Tables"]["wine_answers"]["Insert"]
        >;
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
          submitted_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["guesses"]["Insert"]>;
      };
    };
    Functions: {
      reveal_wine: {
        Args: { p_wine_id: string };
        Returns: void;
      };
    };
  };
};
