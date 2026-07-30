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
export type WineLeaderboardReveal = "PER_ATTRIBUTE" | "PER_WINE";
export type VintageKind = "YEAR" | "NV" | "TAWNY";
export type CellarConsumptionReason = "DRANK" | "GIFTED" | "LOST" | "OTHER";
export type CellarVisibility = "PRIVATE" | "FRIENDS" | "PUBLIC";
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
export type WineGrapeRole = "PRINCIPAL" | "ACCESSORY";
export type WineStyleKind =
  | "RED"
  | "WHITE"
  | "ROSE"
  | "SPARKLING"
  | "SWEET"
  | "FORTIFIED";
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

// --- Cellar catalog + WSET tasting-note enums --------------------------------
export type WineColour = "WHITE" | "ROSE" | "RED" | "ORANGE";
export type WineStyle = "STILL" | "SPARKLING" | "FORTIFIED" | "SWEET";
export type UserRole = "ADMIN" | "CONTRIBUTOR" | "MEMBER";
export type WsetClarity = "CLEAR" | "HAZY";
export type WsetCondition = "CLEAN" | "UNCLEAN";
export type WsetAppearanceIntensity =
  | "PALE"
  | "MEDIUM_MINUS"
  | "MEDIUM"
  | "MEDIUM_PLUS"
  | "DEEP";
export type WsetIntensity =
  | "LIGHT"
  | "MEDIUM_MINUS"
  | "MEDIUM"
  | "MEDIUM_PLUS"
  | "PRONOUNCED";
export type WsetDevelopment =
  | "YOUTHFUL"
  | "DEVELOPING"
  | "FULLY_DEVELOPED"
  | "TIRED_PAST_BEST";
export type WsetSweetness =
  | "DRY"
  | "OFF_DRY"
  | "MEDIUM_DRY"
  | "MEDIUM"
  | "MEDIUM_SWEET"
  | "SWEET"
  | "LUSCIOUS";
export type WsetLevel =
  | "LOW"
  | "MEDIUM_MINUS"
  | "MEDIUM"
  | "MEDIUM_PLUS"
  | "HIGH";
export type WsetBody =
  | "LIGHT"
  | "MEDIUM_MINUS"
  | "MEDIUM"
  | "MEDIUM_PLUS"
  | "FULL";
export type WsetFinish =
  | "SHORT"
  | "MEDIUM_MINUS"
  | "MEDIUM"
  | "MEDIUM_PLUS"
  | "LONG";
export type WsetMousse = "DELICATE" | "CREAMY" | "AGGRESSIVE";
export type WsetColourHue =
  | "LEMON_GREEN"
  | "LEMON"
  | "GOLD"
  | "AMBER"
  | "BROWN"
  | "PINK"
  | "SALMON"
  | "ORANGE"
  | "PURPLE"
  | "RUBY"
  | "GARNET"
  | "TAWNY";
export type WsetObservation =
  | "LEGS_TEARS"
  | "DEPOSIT"
  | "PETILLANCE"
  | "RIM_VARIATION"
  | "TINTS_HIGHLIGHTS";
export type WsetFault =
  | "OXIDISED"
  | "OUT_OF_CONDITION"
  | "CORK_TAINT"
  | "OTHER";
export type WsetPriceCategory =
  | "INEXPENSIVE"
  | "MID_PRICED"
  | "HIGH_PRICED"
  | "PREMIUM"
  | "DONT_KNOW";
export type WsetReadiness =
  | "NEEDS_TIME"
  | "READY_CAN_IMPROVE"
  | "READY_WONT_IMPROVE"
  | "TOO_OLD";
export type WsetAromaFamily =
  | "FRUIT"
  | "FLORAL"
  | "SPICE"
  | "VEGETAL_OAK"
  | "OTHER";
export type WsetAromaOrigin = "PRIMARY" | "SECONDARY" | "TERTIARY";
export type WsetTanninNature =
  | "RIPE"
  | "SOFT"
  | "SMOOTH"
  | "UNRIPE"
  | "GREEN"
  | "COARSE"
  | "STALKY"
  | "CHALKY"
  | "FINE_GRAINED";

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
          skin_color: string | null;
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
          skin_color?: string | null;
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
          is_curator: boolean;
          role: UserRole;
          preferred_currency: string;
          cellar_visibility: CellarVisibility;
          last_seen_at: string | null;
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
          is_curator?: boolean;
          role?: UserRole;
          preferred_currency?: string;
          cellar_visibility?: CellarVisibility;
          last_seen_at?: string | null;
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
          is_curator: boolean;
          role: UserRole;
          preferred_currency: string;
          cellar_visibility: CellarVisibility;
          last_seen_at: string | null;
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
          leaderboard_reveal: WineLeaderboardReveal;
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
          leaderboard_reveal?: WineLeaderboardReveal;
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
          reveal_step: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          tasting_id: string;
          position: number;
          contributor_participant_id?: string | null;
          is_revealed?: boolean;
          reveal_step?: number;
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
          producer_id: string | null;
          type_designation_id: string | null;
          vintage_kind: VintageKind | null;
          vintage_year: number | null;
          vintage_tawny_years: number | null;
          image_url: string | null;
          catalog_wine_id: string | null;
          unidentified_wine_id: string | null;
        };
        Insert: {
          wine_id: string;
          country_id: string;
          region_id: string;
          appellation_id?: string | null;
          primary_grape_id: string;
          secondary_grape_id?: string | null;
          producer_id?: string | null;
          type_designation_id?: string | null;
          vintage_kind?: VintageKind | null;
          vintage_year?: number | null;
          vintage_tawny_years?: number | null;
          image_url?: string | null;
          catalog_wine_id?: string | null;
          unidentified_wine_id?: string | null;
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
          reveal_step: number;
          submitted_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          wine_id: string;
          participant_id: string;
          reveal_step?: number;
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
          soils: string | null;
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
          soils?: string | null;
          editorial_status?: WineArticleStatus;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["wine_place_articles"]["Insert"]
        >;
        Relationships: [];
      };
      wine_place_grapes: {
        Row: {
          id: string;
          wine_place_id: string;
          grape_id: string;
          role: WineGrapeRole;
          permitted: boolean;
          share_pct: number | null;
          local_note: string | null;
          editorial_status: WineArticleStatus;
          created_at: string;
        };
        Insert: {
          id?: string;
          wine_place_id: string;
          grape_id: string;
          role: WineGrapeRole;
          permitted?: boolean;
          share_pct?: number | null;
          local_note?: string | null;
          editorial_status?: WineArticleStatus;
          created_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["wine_place_grapes"]["Insert"]
        >;
        Relationships: [];
      };
      wine_place_styles: {
        Row: {
          id: string;
          wine_place_id: string;
          style: WineStyleKind;
          colour: WineColour | null;
          note: string | null;
          sort_order: number;
          editorial_status: WineArticleStatus;
          created_at: string;
        };
        Insert: {
          id?: string;
          wine_place_id: string;
          style: WineStyleKind;
          colour?: WineColour | null;
          note?: string | null;
          sort_order?: number;
          editorial_status?: WineArticleStatus;
          created_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["wine_place_styles"]["Insert"]
        >;
        Relationships: [];
      };
      wine_designations: {
        Row: {
          id: string;
          key: string;
          name: string;
          appellation_system: string | null;
          description: string;
          display_group: string | null;
          type_designation_id: string | null;
          sort_order: number;
          editorial_status: WineArticleStatus;
          created_at: string;
        };
        Insert: {
          id?: string;
          key: string;
          name: string;
          appellation_system?: string | null;
          description: string;
          display_group?: string | null;
          type_designation_id?: string | null;
          sort_order?: number;
          editorial_status?: WineArticleStatus;
          created_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["wine_designations"]["Insert"]
        >;
        Relationships: [];
      };
      wine_designation_members: {
        Row: {
          id: string;
          designation_id: string;
          member_kind: "ESTATE" | "SITE";
          name: string;
          tier: string | null;
          tier_rank: number;
          commune: string | null;
          sort_order: number;
          producer_id: string | null;
          wine_place_id: string | null;
          local_note: string | null;
          editorial_status: WineArticleStatus;
          created_at: string;
        };
        Insert: {
          id?: string;
          designation_id: string;
          member_kind: "ESTATE" | "SITE";
          name: string;
          tier?: string | null;
          tier_rank?: number;
          commune?: string | null;
          sort_order?: number;
          producer_id?: string | null;
          wine_place_id?: string | null;
          local_note?: string | null;
          editorial_status?: WineArticleStatus;
          created_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["wine_designation_members"]["Insert"]
        >;
        Relationships: [];
      };
      wine_place_designations: {
        Row: {
          id: string;
          wine_place_id: string;
          designation_id: string;
          local_note: string | null;
          editorial_status: WineArticleStatus;
          created_at: string;
        };
        Insert: {
          id?: string;
          wine_place_id: string;
          designation_id: string;
          local_note?: string | null;
          editorial_status?: WineArticleStatus;
          created_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["wine_place_designations"]["Insert"]
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

      catalog_wines: {
        Row: {
          id: string;
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
          colour: WineColour;
          style: WineStyle;
          wine_name: string | null;
          image_url: string | null;
          bottle_size_ml: number;
          created_by: string;
          created_at: string;
        };
        Insert: {
          id?: string;
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
          colour: WineColour;
          style: WineStyle;
          wine_name?: string | null;
          image_url?: string | null;
          bottle_size_ml?: number;
          created_by: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["catalog_wines"]["Insert"]>;
        Relationships: [];
      };

      catalog_wines_unidentified: {
        Row: {
          id: string;
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
          colour: WineColour | null;
          style: WineStyle | null;
          wine_name: string | null;
          bottle_size_ml: number;
          reason: string | null;
          created_by: string;
          resolved_into_catalog_wine_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
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
          colour?: WineColour | null;
          style?: WineStyle | null;
          wine_name?: string | null;
          bottle_size_ml?: number;
          reason?: string | null;
          created_by: string;
          resolved_into_catalog_wine_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["catalog_wines_unidentified"]["Insert"]
        >;
        Relationships: [];
      };

      wine_archetypes: {
        Row: {
          id: string;
          wine_place_id: string;
          name: string;
          colour: WineColour;
          style: WineStyle;
          primary_grape_id: string | null;
          secondary_grape_id: string | null;
          description: string | null;
          sat: { [key: string]: [string, string] };
          quality_low: number | null;
          quality_high: number | null;
          sort_order: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          wine_place_id: string;
          name: string;
          colour: WineColour;
          style?: WineStyle;
          primary_grape_id?: string | null;
          secondary_grape_id?: string | null;
          description?: string | null;
          sat?: { [key: string]: [string, string] };
          quality_low?: number | null;
          quality_high?: number | null;
          sort_order?: number;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["wine_archetypes"]["Insert"]>;
        Relationships: [];
      };

      wine_archetype_aromas: {
        Row: {
          archetype_id: string;
          term_id: string;
          kind: "NOSE" | "PALATE";
        };
        Insert: {
          archetype_id: string;
          term_id: string;
          kind?: "NOSE" | "PALATE";
        };
        Update: Partial<
          Database["public"]["Tables"]["wine_archetype_aromas"]["Insert"]
        >;
        Relationships: [];
      };

      wine_archetype_placements: {
        Row: {
          id: string;
          archetype_id: string;
          wine_place_id: string;
          sort_order: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          archetype_id: string;
          wine_place_id: string;
          sort_order?: number;
          created_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["wine_archetype_placements"]["Insert"]
        >;
        Relationships: [];
      };

      wset_notes: {
        Row: {
          id: string;
          catalog_wine_id: string;
          context_kind: "OPEN" | "BLIND" | "TRAINING";
          tasting_wine_id: string | null;
          author_id: string;
          tasted_on: string;
          clarity: WsetClarity | null;
          appearance_intensity: WsetAppearanceIntensity | null;
          colour_hue: WsetColourHue | null;
          observations: WsetObservation[];
          condition: WsetCondition | null;
          faults: WsetFault[];
          nose_intensity: WsetIntensity | null;
          development: WsetDevelopment | null;
          sweetness: WsetSweetness | null;
          acidity: WsetLevel | null;
          tannin: WsetLevel | null;
          tannin_nature: WsetTanninNature[];
          alcohol: WsetLevel | null;
          body: WsetBody | null;
          mousse: WsetMousse | null;
          flavour_intensity: WsetIntensity | null;
          finish: WsetFinish | null;
          quality_score: number | null;
          price_category: WsetPriceCategory | null;
          readiness: WsetReadiness | null;
          taster_notes: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          catalog_wine_id: string;
          context_kind?: "OPEN" | "BLIND" | "TRAINING";
          tasting_wine_id?: string | null;
          author_id: string;
          tasted_on?: string;
          clarity?: WsetClarity | null;
          appearance_intensity?: WsetAppearanceIntensity | null;
          colour_hue?: WsetColourHue | null;
          observations?: WsetObservation[];
          condition?: WsetCondition | null;
          faults?: WsetFault[];
          nose_intensity?: WsetIntensity | null;
          development?: WsetDevelopment | null;
          sweetness?: WsetSweetness | null;
          acidity?: WsetLevel | null;
          tannin?: WsetLevel | null;
          tannin_nature?: WsetTanninNature[];
          alcohol?: WsetLevel | null;
          body?: WsetBody | null;
          mousse?: WsetMousse | null;
          flavour_intensity?: WsetIntensity | null;
          finish?: WsetFinish | null;
          quality_score?: number | null;
          price_category?: WsetPriceCategory | null;
          readiness?: WsetReadiness | null;
          taster_notes?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["wset_notes"]["Insert"]>;
        Relationships: [];
      };

      wset_note_aromas: {
        Row: {
          note_id: string;
          term_id: string;
          sensed_on_nose: boolean;
          sensed_on_palate: boolean;
        };
        Insert: {
          note_id: string;
          term_id: string;
          sensed_on_nose?: boolean;
          sensed_on_palate?: boolean;
        };
        Update: Partial<
          Database["public"]["Tables"]["wset_note_aromas"]["Insert"]
        >;
        Relationships: [];
      };

      wset_aroma_terms: {
        Row: {
          id: string;
          family: WsetAromaFamily;
          origin: WsetAromaOrigin;
          group_name: string;
          term: string;
          sort_order: number;
        };
        Insert: {
          id?: string;
          family: WsetAromaFamily;
          origin: WsetAromaOrigin;
          group_name: string;
          term: string;
          sort_order: number;
        };
        Update: Partial<
          Database["public"]["Tables"]["wset_aroma_terms"]["Insert"]
        >;
        Relationships: [];
      };
      cellar_lots: {
        Row: {
          id: string;
          owner_id: string;
          catalog_wine_id: string;
          bottle_size_ml: number;
          quantity: number;
          purchased_quantity: number;
          price_per_bottle: number | null;
          currency: string;
          purchased_on: string | null;
          purchase_source: string | null;
          drink_from: number | null;
          drink_to: number | null;
          storage_location: string | null;
          lot_note: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          owner_id: string;
          catalog_wine_id: string;
          bottle_size_ml?: number;
          quantity: number;
          purchased_quantity: number;
          price_per_bottle?: number | null;
          currency?: string;
          purchased_on?: string | null;
          purchase_source?: string | null;
          drink_from?: number | null;
          drink_to?: number | null;
          storage_location?: string | null;
          lot_note?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["cellar_lots"]["Insert"]>;
        Relationships: [];
      };
      cellar_consumptions: {
        Row: {
          id: string;
          owner_id: string;
          lot_id: string | null;
          catalog_wine_id: string;
          quantity: number;
          reason: CellarConsumptionReason;
          consumed_on: string;
          occasion: string | null;
          wset_note_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          owner_id: string;
          lot_id?: string | null;
          catalog_wine_id: string;
          quantity: number;
          reason?: CellarConsumptionReason;
          consumed_on?: string;
          occasion?: string | null;
          wset_note_id?: string | null;
          created_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["cellar_consumptions"]["Insert"]
        >;
        Relationships: [];
      };
      catalog_wine_grapes: {
        Row: {
          id: string;
          catalog_wine_id: string;
          grape_id: string;
          percentage: number | null;
          sort_order: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          catalog_wine_id: string;
          grape_id: string;
          percentage?: number | null;
          sort_order?: number;
          created_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["catalog_wine_grapes"]["Insert"]
        >;
        Relationships: [];
      };
    };
    Views: {
      catalog_wine_ratings: {
        Row: {
          catalog_wine_id: string | null;
          avg_score: number | null;
          note_count: number | null;
        };
        Relationships: [];
      };
      catalog_wine_descriptors: {
        Row: {
          catalog_wine_id: string | null;
          term_id: string | null;
          term: string | null;
          origin: string | null;
          mentions: number | null;
        };
        Relationships: [];
      };
    };
    Functions: {
      admin_set_user_role: {
        Args: { p_user_id: string; p_role: UserRole };
        Returns: void;
      };
      get_wine_place_context: {
        Args: { p_place_key: string };
        Returns: unknown;
      };
      get_wine_place_tree: {
        Args: Record<string, never>;
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
      reveal_next_category: {
        Args: { p_wine_id: string; p_expected_step: number };
        Returns: number;
      };
      reveal_own_next_category: {
        Args: { p_wine_id: string; p_expected_step: number };
        Returns: number;
      };
      get_wine_reveal: {
        Args: { p_wine_id: string };
        Returns: unknown;
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
      save_wset_note: {
        Args: { p_note: unknown; p_aromas: unknown };
        Returns: string;
      };
      find_or_create_catalog_wine: {
        Args: { p: unknown };
        Returns: string;
      };
      search_catalog_wines: {
        Args: { p_query: string; p_limit?: number };
        Returns: {
          id: string;
          wine_name: string;
          producer: string;
          appellation: string;
          region: string;
          country: string;
          colour: string;
          style: string;
          vintage_kind: string;
          vintage_year: number | null;
          vintage_tawny_years: number | null;
        }[];
      };
      resolve_unidentified_wine: {
        Args: { p_unidentified_id: string; p_catalog_wine_id: string };
        Returns: void;
      };
      catalog_wine_guess_stats: {
        Args: { p_catalog_wine_id: string };
        Returns: {
          appearances: number;
          guess_count: number;
          country_correct: number;
          region_correct: number;
          appellation_correct: number;
          primary_grape_correct: number;
          secondary_grape_correct: number;
          producer_correct: number;
          type_designation_correct: number;
          vintage_correct: number;
        }[];
      };
      add_cellar_lot: {
        Args: { p: unknown };
        Returns: string;
      };
      consume_cellar_lot: {
        Args: { p: unknown };
        Returns: string;
      };
      can_view_cellar: {
        Args: { p_owner: string };
        Returns: boolean;
      };
      import_cellar_lot: {
        Args: { p: unknown };
        Returns: string;
      };
      import_cellar_lots: {
        Args: { rows: unknown };
        Returns: unknown;
      };
    };
  };
};
