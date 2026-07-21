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
export type GrapeColor = "RED" | "WHITE";
export type WinePlaceKind =
  | "COUNTRY"
  | "MACRO_REGION"
  | "REGION"
  | "SUBREGION"
  | "APPELLATION"
  | "SITE"
  | "VINEYARD";
export type WinePlacePublicationStatus = "DRAFT" | "VERIFIED" | "EXCLUDED";
export type WinePlaceRelationshipType =
  | "OVERLAPS"
  | "ALTERNATE_PARENT"
  | "RELATED"
  | "REPLACES_WITHIN"
  | "DUAL_LABEL";
export type WineArticleStatus = "PLACEHOLDER" | "DRAFT" | "PUBLISHED";
export type WineReferenceMapStatus =
  | "PENDING"
  | "VERIFIED"
  | "SYNTHETIC"
  | "DUPLICATE"
  | "INVALID"
  | "NOT_GEOGRAPHIC";
export type WineBoundaryMethod =
  | "OFFICIAL"
  | "GENERALIZED_FROM_OFFICIAL_SOURCE"
  | "DERIVED_FROM_DESCENDANTS"
  | "MANUAL";
export type WineBoundaryQualityStatus = "DRAFT" | "VALIDATED" | "REJECTED";
export type WineMapReleaseStatus =
  | "BUILDING"
  | "VALIDATED"
  | "ACTIVE"
  | "RETIRED"
  | "FAILED";

type ReferenceMapFields = {
  wine_place_id: string | null;
  map_status: WineReferenceMapStatus;
  map_match_method: string | null;
  map_match_confidence: number | null;
  map_reviewed_by: string | null;
  map_reviewed_at: string | null;
  map_review_note: string | null;
};

type ReferenceMapInsertFields = {
  wine_place_id?: string | null;
  map_status?: WineReferenceMapStatus;
  map_match_method?: string | null;
  map_match_confidence?: number | null;
  map_reviewed_by?: string | null;
  map_reviewed_at?: string | null;
  map_review_note?: string | null;
};

type ReferenceTable = {
  Row: { id: string; name: string } & ReferenceMapFields;
  Insert: { id?: string; name: string } & ReferenceMapInsertFields;
  Update: Partial<{ id: string; name: string } & ReferenceMapFields>;
  Relationships: [];
};

type ScopedReferenceTable<ParentKey extends string> = {
  Row: { id: string; name: string } & Record<ParentKey, string> & ReferenceMapFields;
  Insert: { id?: string; name: string } & Record<ParentKey, string> &
    ReferenceMapInsertFields;
  Update: Partial<
    { id: string; name: string } & Record<ParentKey, string> & ReferenceMapFields
  >;
  Relationships: [];
};

export type Database = {
  public: {
    Tables: {
      countries: ReferenceTable;
      regions: ScopedReferenceTable<"country_id">;
      appellations: ScopedReferenceTable<"region_id">;
      grapes: {
        Row: {
          id: string;
          name: string;
          color: GrapeColor | null;
          description: string | null;
          typical_aromas: string | null;
          typical_acidity: string | null;
          typical_tannin: string | null;
          typical_body: string | null;
          typical_alcohol: string | null;
          main_regions: string | null;
        };
        Insert: {
          id?: string;
          name: string;
          color?: GrapeColor | null;
          description?: string | null;
          typical_aromas?: string | null;
          typical_acidity?: string | null;
          typical_tannin?: string | null;
          typical_body?: string | null;
          typical_alcohol?: string | null;
          main_regions?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["grapes"]["Insert"]>;
        Relationships: [];
      };
      producers: {
        Row: { id: string; name: string; region_id: string | null };
        Insert: { id?: string; name: string; region_id?: string | null };
        Update: Partial<{ id: string; name: string; region_id: string | null }>;
        Relationships: [];
      };
      type_designations: {
        Row: {
          id: string;
          name: string;
          category: string | null;
          country_id: string | null;
          region_id: string | null;
          sort_order: number;
          is_active: boolean;
          description: string | null;
        };
        Insert: {
          id?: string;
          name: string;
          category?: string | null;
          country_id?: string | null;
          region_id?: string | null;
          sort_order?: number;
          is_active?: boolean;
          description?: string | null;
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

      wine_places: {
        Row: {
          id: string;
          primary_parent_id: string | null;
          kind: WinePlaceKind;
          canonical_key: string;
          canonical_key_locked_at: string | null;
          name: string;
          slug: string;
          display_tier: number;
          min_zoom: number;
          label_min_zoom: number;
    publication_status: WinePlacePublicationStatus;
    is_appellation: boolean;
    appellation_system: string | null;
    appellation_level: string | null;
    sort_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          primary_parent_id?: string | null;
          kind: WinePlaceKind;
          canonical_key: string;
          canonical_key_locked_at?: string | null;
          name: string;
          slug: string;
          display_tier: number;
          min_zoom: number;
          label_min_zoom: number;
    publication_status?: WinePlacePublicationStatus;
    is_appellation?: boolean;
    appellation_system?: string | null;
    appellation_level?: string | null;
    sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["wine_places"]["Insert"]>;
        Relationships: [];
      };
      wine_place_aliases: {
        Row: {
          id: string;
          wine_place_id: string;
          name: string;
          normalized_name: string;
          language_code: string;
          alias_type: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          wine_place_id: string;
          name: string;
          normalized_name: string;
          language_code?: string;
          alias_type: string;
          created_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["wine_place_aliases"]["Insert"]
        >;
        Relationships: [];
      };
      wine_place_relationships: {
        Row: {
          source_place_id: string;
          target_place_id: string;
          relationship_type: WinePlaceRelationshipType;
          note: string | null;
          created_at: string;
        };
        Insert: {
          source_place_id: string;
          target_place_id: string;
          relationship_type: WinePlaceRelationshipType;
          note?: string | null;
          created_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["wine_place_relationships"]["Insert"]
        >;
        Relationships: [];
      };
      wine_place_articles: {
        Row: {
          wine_place_id: string;
          description: string | null;
          climate: string | null;
          grape_varieties: string | null;
          wine_styles: string | null;
          key_facts: string[] | null;
          editorial_status: WineArticleStatus;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          wine_place_id: string;
          description?: string | null;
          climate?: string | null;
          grape_varieties?: string | null;
          wine_styles?: string | null;
          key_facts?: string[] | null;
          editorial_status?: WineArticleStatus;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["wine_place_articles"]["Insert"]
        >;
        Relationships: [];
      };
      wine_boundary_sources: {
        Row: {
          id: string;
          source_namespace: string;
          source_feature_id: string;
          authority: string;
          jurisdiction: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          source_namespace: string;
          source_feature_id: string;
          authority: string;
          jurisdiction: string;
          created_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["wine_boundary_sources"]["Insert"]
        >;
        Relationships: [];
      };
      wine_boundary_source_snapshots: {
        Row: {
          id: string;
          source_id: string;
          source_revision: string;
          retrieved_at: string | null;
          source_url: string | null;
          licence: string;
          raw_snapshot_uri: string | null;
          raw_checksum_sha256: string | null;
          normalized_artifact_uri: string;
          normalized_checksum_sha256: string;
          provenance_note: string | null;
          importer_version: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          source_id: string;
          source_revision: string;
          retrieved_at?: string | null;
          source_url?: string | null;
          licence: string;
          raw_snapshot_uri?: string | null;
          raw_checksum_sha256?: string | null;
          normalized_artifact_uri: string;
          normalized_checksum_sha256: string;
          provenance_note?: string | null;
          importer_version: string;
          created_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["wine_boundary_source_snapshots"]["Insert"]
        >;
        Relationships: [];
      };
      wine_place_boundaries: {
        Row: {
          id: string;
          wine_place_id: string;
          source_snapshot_id: string;
          boundary_method: WineBoundaryMethod;
          quality_status: WineBoundaryQualityStatus;
          display_geometry: unknown;
          label_point: unknown;
          bbox: number[];
          source_feature_refs: unknown;
          generation_parameters: unknown;
          revision: string;
          is_current: boolean;
          reviewed_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          wine_place_id: string;
          source_snapshot_id: string;
          boundary_method: WineBoundaryMethod;
          quality_status?: WineBoundaryQualityStatus;
          display_geometry: unknown;
          label_point: unknown;
          bbox: number[];
          source_feature_refs?: unknown;
          generation_parameters?: unknown;
          revision: string;
          is_current?: boolean;
          reviewed_at?: string | null;
          created_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["wine_place_boundaries"]["Insert"]
        >;
        Relationships: [];
      };
      wine_map_releases: {
        Row: {
          id: string;
          version: string;
          status: WineMapReleaseStatus;
          manifest_url: string | null;
          manifest_checksum_sha256: string | null;
          tile_checksums: unknown;
          feature_counts: unknown;
          build_inputs: unknown;
          validation_report: unknown;
          promoted_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          version: string;
          status?: WineMapReleaseStatus;
          manifest_url?: string | null;
          manifest_checksum_sha256?: string | null;
          tile_checksums?: unknown;
          feature_counts?: unknown;
          build_inputs?: unknown;
          validation_report?: unknown;
          promoted_at?: string | null;
          created_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["wine_map_releases"]["Insert"]
        >;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      get_wine_place_context: {
        Args: { p_place_key: string };
        Returns: unknown;
      };
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
        Args: { p_query: string; p_region_id?: string };
        Returns: { id: string; name: string; in_region: boolean }[];
      };
      tasting_guess_status: {
        Args: { p_tasting_id: string };
        Returns: { wine_id: string; participant_id: string }[];
      };
    };
  };
};
