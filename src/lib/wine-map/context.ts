import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

export type WinePlaceSummary = {
  id: string;
  key: string;
  name: string;
  kind: string;
};

export type WinePlaceChild = WinePlaceSummary & { min_zoom: number };

export type WinePlaceArticle = {
  description: string | null;
  climate: string | null;
  soils: string | null;
  grape_varieties: string | null;
  wine_styles: string | null;
  key_facts: string[];
  editorial_status: string;
};

export type WinePlaceGrape = {
  id: string;
  name: string;
  color: string | null;
  skin_color: string | null;
  role: "PRINCIPAL" | "ACCESSORY";
  permitted: boolean;
  share_pct: number | null;
  local_note: string | null;
};

export type WinePlaceStyle = { style: string; note: string | null };

export type WinePlaceDesignation = {
  key: string;
  name: string;
  appellation_system: string | null;
  description: string;
  local_note: string | null;
};

export type WineDualLabel = WinePlaceSummary & {
  direction: "MAY_BE_SOLD_AS" | "ALSO_SOLD_AS_THIS";
  note: string | null;
};

export type WinePlaceContext = {
  place: WinePlaceSummary & {
    tier: number;
    min_zoom: number;
    label_min_zoom: number;
  };
  ancestors: WinePlaceSummary[];
  children: WinePlaceChild[];
  article: WinePlaceArticle | null;
  boundary: {
    bbox: [number, number, number, number];
    label_lon: number;
    label_lat: number;
  } | null;
  grapes: WinePlaceGrape[];
  styles: WinePlaceStyle[];
  designations: WinePlaceDesignation[];
  nearby: WinePlaceSummary[];
  dual_labels: WineDualLabel[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

// The RPC builds this shape server-side with jsonb_build_object; the guard
// checks the load-bearing fields rather than re-validating every leaf.
function isContext(value: unknown): value is WinePlaceContext {
  if (!isRecord(value)) return false;
  const place = value.place;
  return (
    isRecord(place) &&
    typeof place.key === "string" &&
    typeof place.name === "string" &&
    typeof place.tier === "number" &&
    Array.isArray(value.ancestors) &&
    Array.isArray(value.children) &&
    (value.boundary === null ||
      value.boundary === undefined ||
      (isRecord(value.boundary) &&
        Array.isArray(value.boundary.bbox) &&
        value.boundary.bbox.length === 4))
  );
}

export async function fetchWinePlaceContext(
  supabase: SupabaseClient<Database>,
  placeKey: string,
): Promise<WinePlaceContext | null> {
  const { data, error } = await supabase.rpc("get_wine_place_context", {
    p_place_key: placeKey,
  });
  if (error) {
    throw new Error(`get_wine_place_context failed: ${error.message}`);
  }
  if (data === null) return null;
  if (!isContext(data)) {
    throw new Error("Unrecognized wine place context shape");
  }
  // v2 keys default to empty so a stale function (or cached response)
  // degrades to the v1 experience instead of crashing sections.
  return {
    ...data,
    grapes: data.grapes ?? [],
    styles: data.styles ?? [],
    designations: data.designations ?? [],
    nearby: data.nearby ?? [],
    dual_labels: data.dual_labels ?? [],
  };
}
