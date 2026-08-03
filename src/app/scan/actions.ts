"use server";

import { createClient } from "@/lib/supabase/server";
import { extractLabel, type ExtractedLabel } from "@/lib/label-scan/extract";
import { canonicalGrapeName } from "@/lib/label-scan/grape-canonical";
import {
  canonicalCountryName,
  canonicalRegionName,
} from "@/lib/label-scan/region-canonical";
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

// Burgundy/Alsace labels print "<name> Grand Cru" / "<name> Premier Cru", but
// the catalog stores the base AOC ("Corton Grand Cru" -> "Corton AOC"). Strip a
// trailing cru qualifier so the search can fall back to the base appellation.
function stripCruQualifier(name: string): string {
  return name
    .replace(/\b(grand|premier|1\s*er|1\s*ère|1\s*re)\s+crus?\b.*$/i, "")
    .replace(/[\s,;·-]+$/u, "")
    .trim();
}

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
    // Search the label's appellation; if that finds nothing (Grand/Premier Cru
    // labels rarely match the base AOC by trigram), retry with the cru
    // qualifier stripped ("Corton Grand Cru" -> "Corton" -> "Corton AOC").
    const stripped = stripCruQualifier(extracted.appellation);
    let hits = await searchAppellations(extracted.appellation);
    if (
      hits.length === 0 &&
      stripped &&
      fold(stripped) !== fold(extracted.appellation)
    ) {
      hits = await searchAppellations(stripped);
    }
    const needles = [fold(extracted.appellation), fold(stripped)].filter(Boolean);
    const pick =
      hits.find((a) =>
        needles.some(
          (n) =>
            fold(a.name) === n ||
            fold(a.name) === `${n} aoc` ||
            fold(a.name) === `${n} aop`,
        ),
      ) ??
      hits.find((a) =>
        needles.some(
          (n) =>
            fold(a.name).startsWith(`${n} `) || fold(a.name).startsWith(`${n}-`),
        ),
      ) ??
      hits.find((a) => needles.some((n) => fold(a.name).startsWith(n))) ??
      hits[0];
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
    // The scanner names regions in English ("Burgundy"), the catalog stores
    // canonical names ("Bourgogne") — map through the synonym table, then match
    // accent-insensitively (the raw name is kept as a fallback).
    const canonicalCountry = extracted.country
      ? canonicalCountryName(extracted.country)
      : undefined;
    const canonical = canonicalRegionName(extracted.region, canonicalCountry);
    const wanted = [fold(canonical), fold(extracted.region)];
    const { data } = await supabase.from("regions").select("id, name, country_id");
    const hit = (data ?? []).find((r) => wanted.includes(fold(r.name)));
    if (hit) {
      regionId = hit.id;
      if (!countryId) countryId = hit.country_id;
    }
  }

  // And the country text as a last resort (canonicalising "USA" ->
  // "United States", etc.).
  if (!countryId && extracted.country) {
    const canonical = canonicalCountryName(extracted.country);
    const wanted = [fold(canonical), fold(extracted.country)];
    const { data } = await supabase.from("countries").select("id, name");
    countryId = (data ?? []).find((c) => wanted.includes(fold(c.name)))?.id ?? "";
  }

  let producerId = "";
  let producerLabel: string | null = null;
  if (extracted.producer) {
    const hits = await searchProducers(extracted.producer, regionId || undefined);
    const needle = fold(extracted.producer);
    const exact = hits.find((p) => fold(p.name) === needle);
    if (exact) {
      producerId = exact.id;
      producerLabel = exact.name;
    } else {
      // No exact match: surface the scanned name as a PENDING producer (label
      // set, id empty). We never auto-pick a fuzzy hit or silently create a
      // possibly-misread winery — the user reviews it and it's created only on
      // save. The form still lets them pick an existing near-match instead.
      producerLabel = extracted.producer;
    }
  }

  const blend: { grapeId: string; percentage: string; pendingName?: string }[] =
    [];
  if (extracted.grapes.length > 0) {
    const { data } = await supabase.from("grapes").select("id, name");
    const all = data ?? [];
    for (const g of extracted.grapes) {
      // Canonicalise the scanned name — strip clone/qualifier parentheticals
      // and map well-known local names (Brunello, Garnacha, Shiraz…) to the
      // canonical variety — so a match is found instead of proposing a
      // duplicate. Fall back to the raw name for an exact match too.
      const canonical = canonicalGrapeName(g.name);
      const needle = fold(canonical);
      const hit =
        all.find((x) => fold(x.name) === needle) ??
        all.find((x) => fold(x.name) === fold(g.name));
      const percentage = g.percentage != null ? String(g.percentage) : "";
      if (hit) {
        blend.push({ grapeId: hit.id, percentage });
      } else {
        // No match even after canonicalising: keep it as a PENDING row (created
        // only on save) under the cleaned canonical name, mirroring the producer
        // handling — a misread never spawns a stray grape just from scanning.
        blend.push({ grapeId: "", percentage, pendingName: canonical });
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
    style: extracted.style,
    wineName: extracted.wineName ?? "",
    description: extracted.description,
    vintageKind: extracted.vintageKind,
    vintageYear: extracted.vintageYear != null ? String(extracted.vintageYear) : "",
    tawnyYears: "",
    imageUrl: null,
    appellations,
  };
}
