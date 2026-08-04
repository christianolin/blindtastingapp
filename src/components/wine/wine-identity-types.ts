// Shared types for the manual wine-identity form (WineIdentityFields) and the
// WinePicker result. Server-safe (no "use client") so server actions can import
// them too. Type-only imports are erased at build, so pulling BlendRow from a
// client module here is fine.
import type { VintageKind } from "@/lib/supabase/database.types";
import type { BlendRow } from "@/app/catalog/new/grape-blend-editor";

// The live form value, before pending producer/grape rows are resolved.
export type WineIdentityInput = {
  countryId: string;
  regionId: string;
  appellationId: string | null;
  blend: BlendRow[];
  producerId: string;
  producerLabel: string | null;
  typeDesignationId: string | null;
  wineName: string;
  colour: string;
  style: string;
  vintageKind: VintageKind;
  vintageYear: string;
  vintageTawnyYears: string;
  imageUrl: string | null;
};

// After resolve(): pending producer/grape find-or-created to real ids, blend
// ordered (primary first). This is what the add / create actions persist.
export type ResolvedWineIdentity = {
  countryId: string;
  regionId: string;
  appellationId: string | null;
  grapes: { grapeId: string; percentage: number | null }[];
  producerId: string;
  typeDesignationId: string | null;
  wineName: string;
  colour: string;
  style: string;
  vintageKind: VintageKind;
  vintageYear: number | null;
  vintageTawnyYears: number | null;
  imageUrl: string | null;
};

// The normalized result every WinePicker source produces.
export type WinePick =
  | {
      kind: "existing";
      catalogWineId: string;
      label: string;
      lotId?: string;
      consumeLot?: boolean;
    }
  | { kind: "new"; identity: ResolvedWineIdentity; imageUrl: string | null };
