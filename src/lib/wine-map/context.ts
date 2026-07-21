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
  grape_varieties: string | null;
  wine_styles: string | null;
  key_facts: string[];
  editorial_status: string;
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
  return data;
}
