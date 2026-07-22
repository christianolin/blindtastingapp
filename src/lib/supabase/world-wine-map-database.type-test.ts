import type {
  Database,
  WineArticleStatus,
  WineBoundaryMethod,
  WineBoundaryQualityStatus,
  WineMapReleaseStatus,
  WinePlaceKind,
  WinePlacePublicationStatus,
  WinePlaceRelationshipType,
  WineReferenceMapStatus,
} from "./database.types";

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends
  (<T>() => T extends B ? 1 : 2) ? true : false;
type Expect<T extends true> = T;

type WinePlace = Database["public"]["Tables"]["wine_places"]["Row"];
type Alias = Database["public"]["Tables"]["wine_place_aliases"]["Row"];
type Relationship =
  Database["public"]["Tables"]["wine_place_relationships"]["Row"];
type Article = Database["public"]["Tables"]["wine_place_articles"]["Row"];
type Source = Database["public"]["Tables"]["wine_boundary_sources"]["Row"];
type Snapshot =
  Database["public"]["Tables"]["wine_boundary_source_snapshots"]["Row"];
type Boundary = Database["public"]["Tables"]["wine_place_boundaries"]["Row"];
type Release = Database["public"]["Tables"]["wine_map_releases"]["Row"];
type Appellation = Database["public"]["Tables"]["appellations"]["Row"];

export type WinePlaceKindContract = Expect<
  Equal<WinePlace["kind"], WinePlaceKind>
>;
export type PublicationStatusContract = Expect<
  Equal<WinePlace["publication_status"], WinePlacePublicationStatus>
>;
export type CanonicalKeyLockContract = Expect<
  Equal<WinePlace["canonical_key_locked_at"], string | null>
>;
export type AliasPlaceContract = Expect<
  Equal<Alias["wine_place_id"], string>
>;
export type RelationshipTypeContract = Expect<
  Equal<Relationship["relationship_type"], WinePlaceRelationshipType>
>;
export type ArticleStatusContract = Expect<
  Equal<Article["editorial_status"], WineArticleStatus>
>;
export type SourceChecksumContract = Expect<
  Equal<Snapshot["normalized_checksum_sha256"], string>
>;
export type SourceFeatureIdentityContract = Expect<
  Equal<Source["source_feature_id"], string>
>;
export type BoundaryMethodContract = Expect<
  Equal<Boundary["boundary_method"], WineBoundaryMethod>
>;
export type BoundaryQualityContract = Expect<
  Equal<Boundary["quality_status"], WineBoundaryQualityStatus>
>;
export type ReleaseStatusContract = Expect<
  Equal<Release["status"], WineMapReleaseStatus>
>;
export type ReferenceStatusContract = Expect<
  Equal<Appellation["map_status"], WineReferenceMapStatus>
>;
export type GeometryAtEdgeContract = Expect<
  Equal<Boundary["display_geometry"], unknown>
>;
export type ReferenceLinkNullableContract = Expect<
  Equal<Appellation["wine_place_id"], string | null>
>;
export type SnapshotInsertContract = Expect<
  Equal<
    Database["public"]["Tables"]["wine_boundary_source_snapshots"]["Insert"]["normalized_artifact_uri"],
    string
  >
>;
export type PlaceUpdateContract = Expect<
  Equal<
    Database["public"]["Tables"]["wine_places"]["Update"]["canonical_key"],
    string | undefined
  >
>;
export type FoundationRelationshipsContract = Expect<
  Equal<
    [
      Database["public"]["Tables"]["wine_places"]["Relationships"],
      Database["public"]["Tables"]["wine_place_aliases"]["Relationships"],
      Database["public"]["Tables"]["wine_place_relationships"]["Relationships"],
      Database["public"]["Tables"]["wine_place_articles"]["Relationships"],
      Database["public"]["Tables"]["wine_boundary_sources"]["Relationships"],
      Database["public"]["Tables"]["wine_boundary_source_snapshots"]["Relationships"],
      Database["public"]["Tables"]["wine_place_boundaries"]["Relationships"],
      Database["public"]["Tables"]["wine_map_releases"]["Relationships"],
    ],
    [[], [], [], [], [], [], [], []]
  >
>;
export type ViewsContract = Expect<
  Equal<Database["public"]["Views"], Record<string, never>>
>;
export type BoundaryMethodValuesContract = Expect<
  Equal<
    WineBoundaryMethod,
    | "OFFICIAL"
    | "GENERALIZED_FROM_OFFICIAL_SOURCE"
    | "DERIVED_FROM_DESCENDANTS"
    | "MANUAL"
  >
>;
export type ClassificationFactsContract = Expect<
  Equal<
    Pick<WinePlace, "is_appellation" | "appellation_system" | "appellation_level">,
    {
      is_appellation: boolean;
      appellation_system: string | null;
      appellation_level: string | null;
    }
  >
>;
export type LegalRelationshipContract = Expect<
  Equal<
    WinePlaceRelationshipType,
    | "OVERLAPS"
    | "ALTERNATE_PARENT"
    | "RELATED"
    | "REPLACES_WITHIN"
    | "DUAL_LABEL"
  >
>;

// Phase 3K knowledge schema contracts.
export type GrapeRoleValuesContract = Expect<
  Equal<
    Database["public"]["Tables"]["wine_place_grapes"]["Row"]["role"],
    "PRINCIPAL" | "ACCESSORY"
  >
>;
export type StyleKindValuesContract = Expect<
  Equal<
    Database["public"]["Tables"]["wine_place_styles"]["Row"]["style"],
    "RED" | "WHITE" | "ROSE" | "SPARKLING" | "SWEET" | "FORTIFIED"
  >
>;
export type KnowledgeEditorialContract = Expect<
  Equal<
    Database["public"]["Tables"]["wine_place_designations"]["Row"]["editorial_status"],
    "PLACEHOLDER" | "DRAFT" | "PUBLISHED"
  >
>;
export type GrapeSkinColorContract = Expect<
  Equal<
    Database["public"]["Tables"]["grapes"]["Row"]["skin_color"],
    string | null
  >
>;
export type ArticleSoilsContract = Expect<
  Equal<
    Database["public"]["Tables"]["wine_place_articles"]["Row"]["soils"],
    string | null
  >
>;
