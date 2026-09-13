// The one wine-identity draft shape (spec §B.2). Pure types, no runtime imports.
export type WineFieldKey =
  | "producer" | "vintage" | "colour" | "style"
  | "country" | "region" | "appellation" | "primaryGrape";

export type FieldProvenance =
  | "label" | "catalog-match" | "producer-region" | "appellation-suggestion" | "manual" | "none";

export type ProvenanceKey =
  | WineFieldKey | "wineName" | "blend" | "typeDesignation" | "alcohol" | "description" | "imageUrl";

/** An existing reference row, or a name that is created only on the explicit add. */
export type RefChoice =
  | { kind: "existing"; id: string; name: string }
  | { kind: "pending"; name: string };

export type VintageKind = "YEAR" | "NV" | "TAWNY";
export type WineColour = "RED" | "WHITE" | "ROSE" | "ORANGE";
export type WineStyle = "STILL" | "SPARKLING" | "SWEET" | "FORTIFIED";
export type BlendRow = { grape: RefChoice; percentage: number | null };

export type WineIdentityDraft = {
  producer: RefChoice | null;
  wineName: string | null;
  /** `read` is true only when the vintage came off a label read with vintageRead;
      it drives the "did not read" chip and never affects completeness. */
  vintage: { kind: VintageKind | null; year: number | null; tawnyYears: number | null; read: boolean };
  colour: WineColour | null;
  style: WineStyle | null;
  countryId: string | null;
  regionId: string | null;
  appellationId: string | null;
  blend: BlendRow[];
  typeDesignationId: string | null;
  alcohol: number | null;
  description: string | null;
  imageUrl: string | null;
  provenance: Partial<Record<ProvenanceKey, FieldProvenance>>;
};

export type CompleteVintage =
  | { kind: "YEAR"; year: number; tawnyYears: null }
  | { kind: "NV"; year: null; tawnyYears: null }
  | { kind: "TAWNY"; year: null; tawnyYears: number };

export type CompleteWine = {
  producer: RefChoice;
  wineName: string | null;          // blank → null (D3)
  vintage: CompleteVintage;
  colour: WineColour;
  style: WineStyle;                 // always FORTIFIED when vintage.kind is TAWNY
  countryId: string;
  regionId: string;
  appellationId: string;
  blend: BlendRow[];                // at least one row, in orderedBlend order
  primaryGrape: RefChoice;          // blend[0]
  secondaryGrape: RefChoice | null; // blend[1] ?? null
  typeDesignationId: string | null;
  alcohol: number | null;
  description: string | null;
  imageUrl: string | null;
};

/** The flight-only "I can't identify this bottle" shape (byhand-7). */
export type UnidentifiedWine = Omit<CompleteWine, "producer" | "colour" | "style" | "appellationId"> & {
  producer: RefChoice | null;
  colour: WineColour | null;
  style: WineStyle | null;
  appellationId: string | null;
};
