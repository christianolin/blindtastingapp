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

// A jsonb value (the `supabase gen types` shape). jsonb RPC results are typed
// Json and narrowed by a local type at the call site.
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type TimingMode = "LIVE" | "ASYNC";
export type WineSourceMode = "HOST_PROVIDES" | "PARTICIPANT_CONTRIBUTED";
export type RevealMode = "BLIND" | "SEMI_BLIND" | "OPEN";
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
// 20260918130500 (platform-invites spec §4, D9): a platform invite link's
// validity as get_platform_invite_preview reports it; "expired" wins when a
// link is both past its expiry and used up. An unknown code returns no row.
export type PlatformInviteState = "ok" | "expired" | "exhausted";
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
      // 20260914131500: curated fallback for the guess ladder's grape
      // shortlist, for a scoring region the wine map catalog doesn't cover.
      // Read-only from the client (see grapes/region_id below).
      region_grapes: {
        Row: {
          region_id: string;
          grape_id: string;
          role: WineGrapeRole;
        };
        Insert: {
          region_id: string;
          grape_id: string;
          role: WineGrapeRole;
        };
        Update: Partial<
          Database["public"]["Tables"]["region_grapes"]["Insert"]
        >;
        Relationships: [];
      };
      // 20260914113500: curated alternative producer names. alias_folded is
      // GENERATED ALWAYS AS (f_search_norm(alias)) STORED — never writable.
      producer_aliases: {
        Row: {
          id: string;
          producer_id: string;
          alias: string;
          alias_folded: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          producer_id: string;
          alias: string;
          alias_folded?: never;
          created_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["producer_aliases"]["Insert"]
        >;
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
          // First-run tour (20260925010000, spec 2026-09-25 D1): null = show
          // the tour. Stamped by markTourSeen, cleared by resetTour
          // (src/lib/first-run/actions.ts); in the client UPDATE grant.
          tour_seen_at: string | null;
          created_at: string;
          // Account deletion (20260919101300): stamped once by
          // scrub_deleted_account, never cleared. Row only on purpose (D18):
          // no client writes it (column grant + profiles_deleted_guard), so a
          // write from app code is a compile error too.
          deleted_at: string | null;
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
          tour_seen_at?: string | null;
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
          tour_seen_at: string | null;
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
      // 20260925003000 (friend-requests spec §2.1): a pending friend
      // request, at most one per direction. The requester and the recipient
      // read it (RLS); no client inserts, updates or deletes it — every write
      // is one of the five friend-request RPCs below. friendships keeps
      // meaning "accepted, mutual" (rows in pairs once 20260925004000 runs).
      friend_requests: {
        Row: {
          id: string;
          requester_id: string;
          recipient_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          requester_id: string;
          recipient_id: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["friend_requests"]["Insert"]>;
        Relationships: [];
      };
      // 20260919141700 (profile-favourites spec §3, D2-D4): a person's
      // favourite regions and producers, position 1..10 in the order they
      // chose (at most 10 per table, enforced by the position range + a
      // per-person unique, with a guard for the friendly message). Every
      // signed-in viewer reads them; only the owner writes (RLS by
      // profile_id = auth.uid()). The client INSERT grant covers profile_id,
      // region_id|producer_id and position only (never created_at), and
      // UPDATE covers position only. The app replaces a whole set through
      // set_profile_favourites, below. A deleted profile has no rows.
      profile_favourite_regions: {
        Row: { profile_id: string; region_id: string; position: number; created_at: string };
        Insert: { profile_id: string; region_id: string; position: number; created_at?: never };
        Update: { position?: number };
        Relationships: [];
      };
      profile_favourite_producers: {
        Row: { profile_id: string; producer_id: string; position: number; created_at: string };
        Insert: { profile_id: string; producer_id: string; position: number; created_at?: never };
        Update: { position?: number };
        Relationships: [];
      };
      // 20260918130500 (platform-invites spec §4, D4, D7, D8): a personal
      // "join Blindr" link. The inviter reads and inserts their own rows (RLS
      // by inviter_id = auth.uid()); no client UPDATE or DELETE, and the
      // INSERT grant covers only inviter_id, invitee_email, invitee_name,
      // max_uses and expires_at — the code is minted by the column default
      // (generate_join_code()) and uses is written only by
      // accept_platform_invite. invitee_email is selected only inside
      // src/app/invite/actions.ts and never leaves the server (D9).
      platform_invites: {
        Row: {
          id: string;
          code: string;
          inviter_id: string;
          invitee_email: string | null;
          invitee_name: string | null;
          max_uses: number;
          uses: number;
          expires_at: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          code?: string;
          inviter_id: string;
          invitee_email?: string | null;
          invitee_name?: string | null;
          max_uses?: number;
          uses?: number;
          expires_at?: string;
          created_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["platform_invites"]["Insert"]
        >;
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
          join_code: string | null;
          // 20260914092500 (blind-tasting spec §11.4, §5.4): server-owned
          // lifecycle stamps. A BEFORE INSERT OR UPDATE trigger replaces any
          // client-sent value: `started_at` on an insert as IN_PROGRESS or OPEN
          // or on the DRAFT → IN_PROGRESS flip (a restart keeps the first);
          // `finished_at` on CLOSED, cleared on reopen. Null on tastings from
          // before the migration (no backfill).
          started_at: string | null;
          finished_at: string | null;
          // 20260914100500 (blind-tasting spec §7.4, B6, Q1): set by the host
          // to pause a LIVE tasting; while set, the database refuses every
          // reveal write on its glasses. A trigger clears it on any tasting that
          // is not LIVE and IN_PROGRESS (so End tasting clears it too).
          paused_at: string | null;
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
          join_code?: string | null;
          started_at?: string | null;
          finished_at?: string | null;
          paused_at?: string | null;
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
          // 20260914093500 (blind-tasting spec §4.4, §5.3): server-owned. A
          // BEFORE INSERT OR UPDATE trigger replaces any client-sent value:
          // now() the first time a row becomes JOINED (insert, accept, link); a
          // later flip to JOINED keeps it; null for a row that never joined.
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

      // 20260914091500 (blind-tasting spec §13.4, B12): a tasting's private
      // place, outside `tastings` because a tasting row goes public once a wine
      // is revealed. Readable by the host and JOINED and INVITED participants
      // only; written by the host only. `place` is 1–200 characters with no
      // surrounding spaces; the BEFORE UPDATE trigger owns `updated_at`.
      tasting_places: {
        Row: {
          tasting_id: string;
          place: string;
          updated_at: string;
        };
        Insert: {
          tasting_id: string;
          place: string;
          updated_at?: string;
        };
        Update: {
          tasting_id?: string;
          place?: string;
          updated_at?: string;
        };
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
          // 20260912102000 (spec §E.3): how a glass was added (D13). Null for
          // legacy rows. The pour intent is its own table, never a wines column.
          added_via: "SCAN" | "CATALOG" | "CELLAR" | "BY_HAND" | null;
          // 20260914092500 (blind-tasting spec §11.4, §5.4): when the glass was
          // revealed. Server-owned: a BEFORE INSERT OR UPDATE trigger stamps it
          // on the reveal flip (or an insert already revealed), clears it when
          // is_revealed goes back to false, and replaces any client-sent value.
          // Null on glasses revealed before the migration (no backfill), which
          // are never "joined after" (glass-eligibility.ts).
          revealed_at: string | null;
          // 20260914095500 (blind-tasting spec §3.4, B2): who added the glass,
          // fixed at insert — true when it was inserted with no contributor.
          // Trigger-owned (wines_pin_adder): an insert's value is replaced, and
          // an update never changes it, so nulling or deleting a contributor
          // never turns their glass into a host-added one. is_wine_adder keys
          // on it. Clients update only `position` and `added_via` (M6).
          added_by_host: boolean;
        };
        Insert: {
          id?: string;
          tasting_id: string;
          position: number;
          contributor_participant_id?: string | null;
          is_revealed?: boolean;
          reveal_step?: number;
          created_at?: string;
          added_via?: "SCAN" | "CATALOG" | "CELLAR" | "BY_HAND" | null;
          revealed_at?: string | null;
          added_by_host?: boolean;
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
          locked_at: string | null;
          reveal_step: number;
          submitted_at: string;
          updated_at: string;
        };
        // Clients may write only the guess fields and locked_at; the scoring
        // columns, reveal_step and the timestamps are server-written (migration
        // 20260912093000 revokes the column privileges). The table's
        // picked-wine column is in none of these types: migration
        // 20260914103500 takes it out of the client roles (no SELECT, INSERT or
        // UPDATE), because a semi-blind pick is a wine id and wine ids map to pour
        // positions. Picks go through assign_semi_blind_match and
        // clear_semi_blind_match and read back as candidate keys
        // (get_semi_blind_board, get_semi_blind_revealed_picks).
        Insert: {
          wine_id: string;
          participant_id: string;
          locked_at?: string | null;
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
          appellation_wine_place_id: string | null;
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
          appellation_wine_place_id?: string | null;
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
      // The map's precomputed "nearby" chips (migration 20260920090000).
      // get_wine_place_context reads these server-side; no client selects them
      // today, but they are typed here so the first one that does gets a real
      // row type instead of postgrest-js collapsing to never.
      wine_place_neighbours: {
        Row: {
          wine_place_id: string;
          position: number;
          neighbour_place_id: string;
        };
        Insert: {
          wine_place_id: string;
          position: number;
          neighbour_place_id: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["wine_place_neighbours"]["Insert"]
        >;
        Relationships: [];
      };
      wine_place_neighbours_state: {
        Row: {
          only_row: boolean;
          fresh: boolean;
          built_at: string | null;
        };
        Insert: {
          only_row?: boolean;
          fresh?: boolean;
          built_at?: string | null;
        };
        Update: Partial<
          Database["public"]["Tables"]["wine_place_neighbours_state"]["Insert"]
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
          description: string | null;
          winery_description: string | null;
          aroma: string | null;
          tasting_notes: string | null;
          food_pairing: string | null;
          serving_temp_min_c: number | null;
          serving_temp_max_c: number | null;
          decant_minutes: number | null;
          alcohol_percent: number | null;
          image_url: string | null;
          bottle_size_ml: number;
          estimated_price: number | null;
          estimated_price_currency: string;
          created_by: string;
          created_at: string;
          blind_pending: boolean;
          merged_into: string | null; // 20260829203000_catalog_curation.sql
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
          description?: string | null;
          winery_description?: string | null;
          aroma?: string | null;
          tasting_notes?: string | null;
          food_pairing?: string | null;
          serving_temp_min_c?: number | null;
          serving_temp_max_c?: number | null;
          decant_minutes?: number | null;
          alcohol_percent?: number | null;
          image_url?: string | null;
          bottle_size_ml?: number;
          estimated_price?: number | null;
          estimated_price_currency?: string;
          created_by: string;
          created_at?: string;
          blind_pending?: boolean;
          merged_into?: string | null; // 20260829203000_catalog_curation.sql
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
          // Both nullable live (BT-N1; blind-tasting B8): a note on a still-
          // hidden tasting glass carries neither identity until the glass is
          // revealed (M5's wset_notes_one_identity: exactly one of the two,
          // or neither alongside a BLIND context_kind + tasting_wine_id).
          catalog_wine_id: string | null;
          unidentified_wine_id: string | null;
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
          catalog_wine_id?: string | null;
          unidentified_wine_id?: string | null;
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
      // 20260912100100 (spec §E.1): owner-only retention of every label read.
      // `read` is null exactly when `outcome` is "not-read".
      label_reads: {
        Row: {
          id: string;
          user_id: string;
          image_path: string;
          outcome: "ok" | "not-a-label" | "not-read";
          read: unknown | null;
          model: string;
          input_tokens: number;
          output_tokens: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          image_path: string;
          outcome: "ok" | "not-a-label" | "not-read";
          read?: unknown | null;
          model: string;
          input_tokens?: number;
          output_tokens?: number;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["label_reads"]["Insert"]>;
        Relationships: [];
      };
      // 20260919214700 (owner fix C, 2026-09-19): every billed follow-up lookup of a
      // scan, owner-only and append-only (select + insert only), one per label_reads
      // row (ON DELETE CASCADE). `answer` is present exactly for "answer" and
      // "discarded"; `appellation_id` only for "answer". Never counted by the quota.
      label_lookups: {
        Row: {
          id: string;
          label_read_id: string;
          user_id: string;
          region_id: string | null;
          candidates: number;
          outcome: "answer" | "no-answer" | "discarded" | "not-read";
          answer: string | null;
          appellation_id: string | null;
          model: string;
          input_tokens: number;
          output_tokens: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          label_read_id: string;
          user_id: string;
          region_id?: string | null;
          candidates: number;
          outcome: "answer" | "no-answer" | "discarded" | "not-read";
          answer?: string | null;
          appellation_id?: string | null;
          model: string;
          input_tokens?: number;
          output_tokens?: number;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["label_lookups"]["Insert"]>;
        Relationships: [];
      };
      // 20260912102000 (spec §E.3): an incomplete glass's owner-only draft. The
      // glass has no wine_answers row until it is complete; `missing` holds only
      // field keys from src/lib/wine-identity and is never empty.
      wine_identity_drafts: {
        Row: {
          wine_id: string;
          owner_id: string;
          draft: unknown;
          missing: string[];
          created_at: string;
          updated_at: string;
        };
        Insert: {
          wine_id: string;
          owner_id: string;
          draft: unknown;
          missing: string[];
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["wine_identity_drafts"]["Insert"]
        >;
        Relationships: [];
      };
      // 20260912103000 (spec §E.4): the adder's owner-only intent to pour their
      // own cellar lot into a glass. There is no update policy; only the pour
      // functions write cellar_consumption_id.
      wine_pour_intents: {
        Row: {
          wine_id: string;
          owner_id: string;
          cellar_lot_id: string | null;
          consume_on_start: boolean;
          cellar_consumption_id: string | null;
          created_at: string;
        };
        Insert: {
          wine_id: string;
          owner_id: string;
          cellar_lot_id?: string | null;
          consume_on_start?: boolean;
          cellar_consumption_id?: string | null;
          created_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["wine_pour_intents"]["Insert"]
        >;
        Relationships: [];
      };
      // 20260919183100 (scan-photos spec §6): a catalog wine's extra photos (the
      // wine page's "More photos" strip); catalog_wines.image_url stays the main
      // photo. image_path is the object name in wine-images, never a URL. via is
      // 'upload' | 'catalog' | 'cellar' | 'note' (PhotoVia in
      // src/lib/catalog-photos/types.ts); a 'cellar' row is read only by its
      // photographer and whoever can see their cellar (can_view_cellar).
      // rows are written only by attach_catalog_wine_photo; label_read_id is not
      // client-readable (authenticated holds SELECT on the other six columns and
      // DELETE of its own rows only).
      catalog_wine_photos: {
        Row: {
          id: string;
          catalog_wine_id: string;
          image_path: string;
          via: string;
          added_by: string;
          label_read_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          catalog_wine_id: string;
          image_path: string;
          via?: string;
          added_by: string;
          label_read_id?: string | null;
          created_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["catalog_wine_photos"]["Insert"]
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
      get_app_stats: {
        Args: Record<string, never>;
        Returns: {
          members: number;
          tastings: number;
          wines_catalogued: number;
          notes_created: number;
        }[];
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
      get_tasting_leaderboard: {
        Args: { p_tasting_id: string };
        Returns: {
          participant_id: string;
          total: number;
          wines_scored: number;
          last_round_points: number | null;
        }[];
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
      // 20260912101000 (spec §E.2): the folded producer lookup. p_region_id
      // accepts null, so a nullable regionId passes straight through (spec §B.7).
      find_producer_by_folded_name: {
        Args: { p_name: string; p_region_id?: string | null };
        Returns: string | null;
      };
      find_or_create_producer: {
        Args: { p_name: string; p_region_id?: string | null };
        Returns: string;
      };
      // 20260912102000 (spec §E.3): the adder check, and every glass with no
      // answer key yet with its list-order number and only its missing field
      // keys (an empty list when the glass has no draft row).
      is_wine_adder: {
        Args: { p_wine_id: string };
        Returns: boolean;
      };
      tasting_incomplete_glasses: {
        Args: { p_tasting_id: string };
        Returns: { wine_id: string; glass: number; missing: string[] }[];
      };
      // 20260912103000 (spec §E.4): Start pours the flight's intents; a running
      // flight pours one glass at once. Both are idempotent.
      draw_down_flight_cellar_lots: {
        Args: { p_tasting_id: string };
        Returns: { wine_id: string; glass: number; outcome: string }[];
      };
      pour_cellar_lot_into_glass: {
        Args: { p_wine_id: string };
        Returns: string;
      };
      tasting_guess_status: {
        Args: { p_tasting_id: string };
        Returns: { wine_id: string; participant_id: string; locked: boolean }[];
      };
      ensure_join_code: {
        Args: { p_tasting_id: string };
        Returns: string;
      };
      // 20260914093500 (blind-tasting spec §5.4): refuses only a CLOSED tasting,
      // so people can join by link after Start (B4).
      join_tasting_by_code: {
        Args: { p_code: string };
        Returns: string;
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
      search_all: {
        Args: { p_query: string; p_limit?: number };
        Returns: {
          kind: string;
          id: string;
          label: string;
          sublabel: string | null;
          href_key: string;
        }[];
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
      catalog_wine_structure: {
        Args: { p_catalog_wine_id: string };
        Returns: {
          dimension: string;
          avg_index: number;
          max_index: number;
          n: number;
        }[];
      };
      catalog_wine_usage: {
        Args: { p_id: string };
        Returns: {
          holders: number;
          bottles: number;
          lot_count: number;
          note_count: number;
          appearance_count: number;
          consumption_count: number;
        }[];
      };
      delete_catalog_wine: {
        Args: { p_id: string };
        Returns: undefined;
      };
      catalog_wine_appearances: {
        Args: { p_ids: string[] };
        Returns: {
          catalog_wine_id: string;
          appearances: number;
        }[];
      };
      catalog_wine_holdings: {
        Args: { p_ids: string[] };
        Returns: {
          catalog_wine_id: string;
          holders: number;
          bottles: number;
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
      // 20260919223100 (spec 2026-09-19-rule1-older-leaks D10): someone's cellar
      // as another person may see it — the owner, or can_view_cellar. A bottle
      // poured into a glass that is not revealed yet still counts in its lot, and
      // updated_at reads as created_at. The one read of another person's lots
      // ("cellar own select" admits the owner alone after 20260919223200).
      // Returns cellar_lots rows, so `.select(...)` embeds the catalog wine.
      shared_cellar_lots: {
        Args: { p_owner: string };
        Returns: Database["public"]["Tables"]["cellar_lots"]["Row"][];
        SetofOptions: { from: "*"; to: "cellar_lots"; isOneToOne: false; isSetofReturn: true };
      };
      import_cellar_lot: {
        Args: { p: unknown };
        Returns: string;
      };
      import_cellar_lots: {
        Args: { rows: unknown };
        Returns: unknown;
      };
      // 20260914091500 (blind-tasting spec §13.4): the `tasting places read`
      // helper — true for the host and JOINED or INVITED participants.
      is_tasting_member: {
        Args: { p_tasting_id: string };
        Returns: boolean;
      };
      // 20260914093500 (blind-tasting spec §4.4): a host's record — how many
      // tastings they have started or closed. Authenticated only.
      host_tastings_count: {
        Args: { p_user_id: string };
        Returns: number;
      };
      // 20260914093500 (blind-tasting spec §4.4, Q3): the share-link preview,
      // callable by anon. Never the place, description, cover or any wine
      // beyond a count; an OPEN-mode tasting's code returns no row.
      get_join_preview: {
        Args: { p_code: string };
        Returns: {
          name: string;
          host_name: string | null;
          host_avatar_url: string | null;
          scheduled_at: string | null;
          reveal_mode: RevealMode;
          timing_mode: TimingMode;
          sequential_guessing: boolean;
          glass_count: number;
          status: TastingStatus;
          // Only for the host and JOINED or INVITED rows (a DECLINED guest gets null).
          viewer_tasting_id: string | null;
          host_id: string | null; // signed-in callers only
          joined_names: string[] | null; // signed-in callers only
        }[];
      };
      // 20260914094500 (blind-tasting spec §9.4, B8): may the caller attach a
      // note to this tasting glass? True for its tasting's host and JOINED
      // participants. Authenticated only.
      can_note_tasting_wine: {
        Args: { p_wine_id: string };
        Returns: boolean;
      };
      // 20260914094500 (spec §9.4): whether a tasting glass is revealed (false
      // for an unknown id). Authenticated only.
      is_tasting_wine_revealed: {
        Args: { p_wine_id: string };
        Returns: boolean;
      };
      // 20260914094500 (spec §9.4): the hue-to-colour mapping
      // wset_notes_check_hue enforces. A null hue or colour, and an ORANGE
      // wine, fit anything.
      wset_hue_fits_colour: {
        Args: { p_hue: WsetColourHue | null; p_colour: WineColour | null };
        Returns: boolean;
      };
      // 20260914095500 (blind-tasting spec §3.4, B2): the adder's edit window —
      // the glass's adder (wines.added_by_host), while the tasting is not
      // CLOSED and the glass is unrevealed at reveal_step 0; on an OPEN board
      // while not CLOSED. The `wine_answers` insert/update policies use it.
      can_edit_flight_glass: {
        Args: { p_wine_id: string };
        Returns: boolean;
      };
      // 20260914095500 (spec §3.4): Remove — the edit window, or the host for
      // any glass while DRAFT; never a semi-blind glass after Start, never
      // while a later glass is revealed or has started its reveal (OPEN exempt).
      can_remove_flight_glass: {
        Args: { p_wine_id: string };
        Returns: boolean;
      };
      // 20260914095500 (spec §3.4): a direct `wines` delete (`wines delete
      // adder`) — Remove's rule, and the host in DRAFT or the adder's last glass.
      can_delete_flight_glass_row: {
        Args: { p_wine_id: string };
        Returns: boolean;
      };
      // 20260914095500 (spec §3.4): reorder atomically to the 1-based
      // p_to_index. Host only; refused on a CLOSED tasting and whenever a glass
      // the table has seen would change its number.
      move_flight_glass: {
        Args: { p_wine_id: string; p_to_index: number };
        Returns: undefined;
      };
      // 20260914095500 (spec §3.4): delete a glass and close the gap in one
      // transaction, whoever the adder is (can_remove_flight_glass).
      remove_flight_glass: {
        Args: { p_wine_id: string };
        Returns: undefined;
      };
      // 20260914095500 (spec §3.4): Swap's provenance write (a contributor
      // holds no UPDATE on `wines` rows). Edit's window; never a semi-blind
      // glass after Start. p_added_via is one of SCAN, CATALOG, CELLAR, BY_HAND.
      set_flight_glass_added_via: {
        Args: { p_wine_id: string; p_added_via: string };
        Returns: undefined;
      };
      // 20260914095500 (spec §3.4, §16.1 row 6): what a removal takes with it —
      // counts only, one row to whoever may remove the glass, no row otherwise.
      // private_notes counts identity-less (hidden) notes on the glass.
      glass_removal_impact: {
        Args: { p_wine_id: string };
        Returns: { guesses: number; private_notes: number }[];
      };
      // 20260914102500 (blind-tasting spec §10.4 b, B9): may the caller see the
      // semi-blind list — the host or a JOINED participant of a SEMI_BLIND
      // tasting. Authenticated only. (semi_blind_candidate_keys and
      // ensure_semi_blind_keys are not typed: no client can reach them.)
      can_see_semi_blind_list: {
        Args: { p_tasting_id: string };
        Returns: boolean;
      };
      // 20260914102500 (spec §10.4 b, §16.1 row 19): { cards: [{ key, producer,
      // wine_name, vintage_kind, vintage_year, vintage_tawny_years, appellation,
      // grape, revealed_glass }], pending } ordered by the random key, or null.
      // DRAFT callers see their own cards (the glasses they added), and pending
      // only the host. From Start pending goes to every caller, and every card
      // once nothing is pending; until then only the cards of glasses they
      // added. Narrow at the call site.
      get_semi_blind_candidates: {
        Args: { p_tasting_id: string };
        Returns: Json;
      };
      // 20260914102500 (spec §10.4 b, §16.1 row 20): { mine, revealed, split,
      // own_bottles, known } in candidate keys, or null. Narrow at the call site.
      get_semi_blind_board: {
        Args: { p_tasting_id: string };
        Returns: Json;
      };
      // 20260914102500 (spec §10.4 b, §16.1 row 21): per revealed glass, who
      // picked which key; pick_label only when the picked wine is revealed or the
      // caller is the host or a JOINED participant.
      get_semi_blind_revealed_picks: {
        Args: { p_tasting_id: string };
        Returns: {
          glass_wine_id: string;
          participant_id: string;
          correct: boolean;
          pick_key: string | null;
          pick_label: string | null;
        }[];
      };
      // 20260914102500 (spec §10.4 c, B9): assign a candidate to the caller's
      // glass (swaps with an open holder) → { glass, swapped_with }. Refusals:
      // "matching is closed", "you cannot match this glass", "that wine is not in
      // your pool", "this glass is locked in", "glass locked" (detail = the
      // holder's glass id).
      assign_semi_blind_match: {
        Args: { p_wine_id: string; p_candidate_key: string };
        Returns: Json;
      };
      // 20260914102500 (spec §10.4 c): the caller's open row on this glass loses
      // its candidate; refuses a locked row ("this glass is locked in").
      clear_semi_blind_match: {
        Args: { p_wine_id: string };
        Returns: undefined;
      };
      // 20260914104500 (blind-tasting spec §12.4, B11, Q4): the host of a DRAFT
      // tasting hands hosting to a JOINED participant; the former host stays
      // JOINED. Authenticated only. Refusals (handHostingRefusal maps them):
      // "only the host can hand hosting over", "hosting can only change before
      // the tasting starts", "only someone who has joined can host", "remove the
      // glasses you added first" (any added_by_host glass), "finish or remove
      // your unfinished glasses and cellar bottles first" (a draft or pour
      // intent the host owns in the tasting).
      transfer_tasting_host: {
        Args: { p_tasting_id: string; p_new_host_user_id: string };
        Returns: undefined;
      };
      // 20260918130500 (platform-invites spec §4, D9): the /invite/[code]
      // landing preview, callable by anon. Only the validity state and the
      // inviter's directory-public display name and avatar — never
      // invitee_email or invitee_name; no row means an unknown code.
      get_platform_invite_preview: {
        Args: { p_code: string };
        Returns: {
          state: PlatformInviteState;
          inviter_name: string;
          inviter_avatar_url: string | null;
          inviter_id: string | null; // signed-in callers only
        }[];
      };
      // 20260918130500 (platform-invites spec §4, D10): the signed-in caller
      // becomes the inviter's friend both ways (two friendships rows,
      // idempotent), one use is counted per account, and the inviter id is
      // returned. Since 20260925003000 it also deletes any pending friend
      // request between the two, either way (friend-requests spec D5). Authenticated only — EXECUTE revoked from PUBLIC, anon and
      // service_role. Refusals (friendlyAcceptError maps them; plan copy):
      // "not signed in", "no invite has that code", "that is your own invite
      // link", "that invite link has expired", "that invite link has been
      // used up".
      accept_platform_invite: {
        Args: { p_code: string };
        Returns: string;
      };
      // 20260925003000 (friend-requests spec §2.3): the only client path to
      // friend_requests and friendships. SECURITY DEFINER; EXECUTE for
      // authenticated only (revoked from PUBLIC, anon and service_role).
      // Refusals, verbatim: "not signed in" (42501), "you cannot be your own
      // friend" (22023), "that account has been deleted" (42501); accept
      // also "no request to accept" (42501). send returns 'requested',
      // 'accepted' (the other person had already asked: now friends) or
      // 'friends' (already friends). cancel, decline and remove are no-ops
      // when there is nothing to remove.
      send_friend_request: {
        Args: { p_to: string };
        Returns: string;
      };
      cancel_friend_request: {
        Args: { p_to: string };
        Returns: undefined;
      };
      accept_friend_request: {
        Args: { p_from: string };
        Returns: undefined;
      };
      decline_friend_request: {
        Args: { p_from: string };
        Returns: undefined;
      };
      remove_friend: {
        Args: { p_other: string };
        Returns: undefined;
      };
      // 20260919141700 (profile-favourites spec §3.5, D6): replaces the
      // caller's favourite regions and producers in one go, position = list
      // order; empty arrays clear a set. SECURITY INVOKER (RLS, the grants
      // and the guards stay the floor); EXECUTE for authenticated only.
      // Refusals come back verbatim: "not signed in", "favourites must be two
      // lists of ids", "you can pick up to 10 favourite regions" /
      // "producers", "each region can be picked once" / "each producer can
      // be picked once", "that region cannot be a favourite", "this account
      // has been deleted".
      set_profile_favourites: {
        Args: { p_region_ids: string[]; p_producer_ids: string[] };
        Returns: void;
      };
      // 20260919183100 (scan-photos spec §6.3): attaches the caller's own object
      // in wine-images (their catalog/staging/<uid>/scan-*.jpg, or an upload in
      // catalog/<wineId>/) to a catalog wine. p_via is where a scan's add landed
      // ('catalog' | 'cellar' | 'note', else bad-path); an upload is always
      // stored as 'upload'. Authenticated only. Never raises for
      // a refusal; returns one status word (AttachPhotoStatus in
      // src/lib/catalog-photos/types.ts minus "error"): attached,
      // already-attached, signed-out, deleted-account, bad-path, no-object,
      // not-an-image, too-large, no-wine, flight-photo, unrevealed-glass, limit.
      attach_catalog_wine_photo: {
        Args: { p_catalog_wine_id: string; p_image_path: string; p_via: string };
        Returns: string;
      };
    };
  };
};
