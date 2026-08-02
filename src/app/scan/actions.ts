"use server";

import { createClient } from "@/lib/supabase/server";
import { extractLabel, type ExtractedLabel } from "@/lib/label-scan/extract";
import {
  listAppellationsForRegions,
  searchAppellations,
  searchProducers,
} from "@/lib/reference-search";
import type { WineFormInitial } from "@/app/catalog/new/new-wine-form";

export type ScanMatch = { id: string; name: string };
export type ScanResult = { extracted: ExtractedLabel; matches: ScanMatch[] };

// Read a wine label (Claude vision) and find catalog matches for it. The Scan
// popup uploads the photo to storage and passes the resulting public URL here.
export async function identifyWineFromLabel(
  imageUrl: string,
): Promise<ScanResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("You must be signed in to scan a label.");

  const extracted = await extractLabel(imageUrl);

  const query = [extracted.producer, extracted.wineName, extracted.appellation]
    .filter(Boolean)
    .join(" ")
    .trim();

  let matches: ScanMatch[] = [];
  if (query.length >= 2) {
    const { data } = await supabase.rpc("search_catalog_wines", {
      p_query: query,
      p_limit: 5,
    });
    matches = (
      (data ?? []) as Array<{
        id: string;
        wine_name: string;
        producer: string;
        appellation: string;
        vintage_kind: string;
        vintage_year: number | null;
        vintage_tawny_years: number | null;
      }>
    ).map((w) => {
      const vintage =
        w.vintage_kind === "YEAR"
          ? w.vintage_year
            ? String(w.vintage_year)
            : ""
          : w.vintage_kind === "TAWNY"
            ? w.vintage_tawny_years
              ? `${w.vintage_tawny_years}yo`
              : "Tawny"
            : "NV";
      const name = [w.producer, w.wine_name, w.appellation, vintage]
        .filter(Boolean)
        .join(" ");
      return { id: w.id, name: name || "Untitled wine" };
    });
  }

  return { extracted, matches };
}

const fold = (s: string) =>
  s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();

// Best-effort map of a label read to the catalog form's shape, so "Add as new"
// opens pre-populated. Names are matched (accent-insensitively) to existing
// reference rows; anything unmatched stays blank for the user to pick or create
// via the form's own find-or-create. The scan photo is attached by the caller.
export async function resolveWinePrefill(
  extracted: ExtractedLabel,
): Promise<WineFormInitial> {
  const supabase = await createClient();

  let countryId = "";
  let regionId = "";
  let appellationId = "";

  // The appellation is the most specific clue on most labels and pins down the
  // region + country, so resolve it first and backfill upward from it.
  if (extracted.appellation) {
    const hits = await searchAppellations(extracted.appellation);
    const needle = fold(extracted.appellation);
    const pick = hits.find((a) => fold(a.name).startsWith(needle)) ?? hits[0];
    if (pick) {
      appellationId = pick.id;
      const { data: appRow } = await supabase
        .from("appellations")
        .select("region_id")
        .eq("id", pick.id)
        .maybeSingle();
      if (appRow?.region_id) {
        regionId = appRow.region_id;
        const { data: regRow } = await supabase
          .from("regions")
          .select("country_id")
          .eq("id", regionId)
          .maybeSingle();
        if (regRow?.country_id) countryId = regRow.country_id;
      }
    }
  }

  // Fall back to the label's region text when the appellation didn't resolve.
  if (!regionId && extracted.region) {
    const { data } = await supabase.from("regions").select("id, name, country_id");
    const hit = (data ?? []).find((r) => fold(r.name) === fold(extracted.region!));
    if (hit) {
      regionId = hit.id;
      if (!countryId) countryId = hit.country_id;
    }
  }

  // And the country text as a last resort.
  if (!countryId && extracted.country) {
    const { data } = await supabase.from("countries").select("id, name");
    countryId =
      (data ?? []).find((c) => fold(c.name) === fold(extracted.country!))?.id ?? "";
  }

  let producerId = "";
  let producerLabel: string | null = null;
  if (extracted.producer) {
    const hits = await searchProducers(extracted.producer, regionId || undefined);
    const needle = fold(extracted.producer);
    const pick = hits.find((p) => fold(p.name) === needle) ?? hits[0];
    if (pick) {
      producerId = pick.id;
      producerLabel = pick.name;
    }
  }

  const blend: { grapeId: string; percentage: string }[] = [];
  if (extracted.grapes.length > 0) {
    const { data } = await supabase.from("grapes").select("id, name");
    const all = data ?? [];
    for (const g of extracted.grapes) {
      let hit = all.find((x) => fold(x.name) === fold(g.name));
      if (!hit) {
        // Find-or-create so a well-known blend grape the catalog lacks (e.g.
        // Rondinella for Amarone) still prefills instead of being dropped.
        const { data: created } = await supabase
          .from("grapes")
          .insert({ name: g.name })
          .select("id, name")
          .single();
        if (created) {
          hit = created;
          all.push(created);
        }
      }
      if (hit) {
        blend.push({
          grapeId: hit.id,
          percentage: g.percentage != null ? String(g.percentage) : "",
        });
      }
    }
  }

  const appellations = regionId
    ? await listAppellationsForRegions([regionId])
    : [];

  return {
    countryId,
    regionId,
    appellationId,
    blend: blend.length > 0 ? blend : [{ grapeId: "", percentage: "" }],
    producerId,
    producerLabel,
    typeDesignationId: "",
    colour: extracted.colour,
    style: null,
    wineName: extracted.wineName ?? "",
    description: extracted.description,
    vintageKind: extracted.vintageKind,
    vintageYear: extracted.vintageYear != null ? String(extracted.vintageYear) : "",
    tawnyYears: "",
    imageUrl: null,
    appellations,
  };
}
