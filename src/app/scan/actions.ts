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
    const rows = (data ?? []) as Array<{
      id: string;
      wine_name: string;
      producer: string;
      appellation: string;
      colour: string;
      vintage_kind: string;
      vintage_year: number | null;
      vintage_tawny_years: number | null;
    }>;
    // A label scan must only offer a match that is really the SAME bottle.
    // search_catalog_wines ranks purely on producer/name text, so for a
    // many-cuvee producer it would otherwise return a different colour or
    // vintage (e.g. El Enemigo 2018 Chardonnay for a 2019 Cabernet Franc).
    // Require the colour and (when we read it) the vintage to line up.
    const vintageMatches = (w: {
      vintage_kind: string;
      vintage_year: number | null;
    }) =>
      extracted.vintageKind === "YEAR"
        ? extracted.vintageYear == null ||
          (w.vintage_kind === "YEAR" && w.vintage_year === extracted.vintageYear)
        : w.vintage_kind === extracted.vintageKind;
    matches = rows
      .filter(
        (w) =>
          (!extracted.colour || w.colour === extracted.colour) &&
          vintageMatches(w),
      )
      .map((w) => {
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

// Drop the quality-scheme suffix so a label's EU term matches the catalog's
// traditional one: Italian bottles print IGP/DOP for what the catalog (and
// every wine list) calls IGT/DOC/DOCG, so "Puglia IGP" must find "Puglia IGT".
function stripClassSuffix(folded: string): string {
  return folded
    .replace(
      /\b(a\.?o\.?c\.?|aop|d\.?o\.?c\.?g\.?|d\.?o\.?c\.?|docg|doca|dop|do|i\.?g\.?t\.?|i\.?g\.?p\.?|pdo|pgi|ava|g\.?i\.?)\b/g,
      " ",
    )
    .replace(/\s+/g, " ")
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
    // Compare with the quality-scheme suffix removed on both sides, so the
    // label's term and the catalog's spelling of the same denomination agree.
    const bases = needles.map(stripClassSuffix).filter(Boolean);
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
        bases.some((b) => stripClassSuffix(fold(a.name)) === b),
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

  // Last resort for the appellation: a wine sold under a regional PGI prints
  // only the region's name ("PUGLIA · Indicazione Geografica Protetta"), which
  // reads as a region rather than a denomination. If the region resolved but
  // the appellation didn't, take that region's own regional appellation when
  // one exists ("Puglia" -> "Puglia IGT"), rather than leaving the field blank
  // and blocking the save.
  if (!appellationId && regionId) {
    const { data: regionApps } = await supabase
      .from("appellations")
      .select("id, name")
      .eq("region_id", regionId);
    const { data: regRow } = await supabase
      .from("regions")
      .select("name")
      .eq("id", regionId)
      .maybeSingle();
    const regionBase = regRow?.name ? fold(regRow.name) : "";
    if (regionBase) {
      const selfNamed = (regionApps ?? []).find(
        (a) => stripClassSuffix(fold(a.name)) === regionBase,
      );
      if (selfNamed) appellationId = selfNamed.id;
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

  // Wine with no geographic indication at all (Vin de France, Vino d'Italia,
  // Deutscher Wein): the label names a country and nothing else. Point it at
  // that country's sentinel "None" region/appellation so it can actually be
  // saved. Only when the read named no region either — a region we merely
  // failed to match must stay blank for the user to pick, not be recorded as
  // "None".
  if (countryId && !regionId && !extracted.region && !extracted.appellation) {
    const { data: noneRegion } = await supabase
      .from("regions")
      .select("id")
      .eq("country_id", countryId)
      .eq("name", "None")
      .maybeSingle();
    if (noneRegion) {
      regionId = noneRegion.id;
      const { data: noneApp } = await supabase
        .from("appellations")
        .select("id")
        .eq("region_id", noneRegion.id)
        .eq("name", "None")
        .maybeSingle();
      if (noneApp) appellationId = noneApp.id;
    }
  }

  // Designation ("Gran Reserva", "Kabinett", "Brut Nature"…) → the reference
  // row the form's picker uses. Exact accent-insensitive name match only — a
  // fuzzy hit here would quietly relabel the wine's legal tier. A row scoped to
  // the wine's country beats a global one ("Reserva" exists for several
  // countries with different rules).
  let typeDesignationId = "";
  if (extracted.designation) {
    const { data: tds } = await supabase
      .from("type_designations")
      .select("id, name, country_id")
      .eq("is_active", true);
    const needle = fold(extracted.designation);
    const hits = (tds ?? []).filter((t) => fold(t.name) === needle);
    const pick =
      (countryId && hits.find((t) => t.country_id === countryId)) ||
      hits.find((t) => !t.country_id) ||
      (hits.length === 1 ? hits[0] : undefined);
    if (pick) typeDesignationId = pick.id;
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
    typeDesignationId,
    colour: extracted.colour,
    style: extracted.style,
    wineName: extracted.wineName ?? "",
    description: extracted.description,
    estimatedPrice:
      extracted.estimatedPriceDkk != null ? String(extracted.estimatedPriceDkk) : "",
    vintageKind: extracted.vintageKind,
    vintageYear: extracted.vintageYear != null ? String(extracted.vintageYear) : "",
    tawnyYears: "",
    imageUrl: null,
    appellations,
  };
}
