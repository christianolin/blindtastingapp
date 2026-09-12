"use server";

import { createClient } from "@/lib/supabase/server";
import { extractLabel, type ExtractedLabel } from "@/lib/label-scan/extract";
import { usdToDkk } from "@/lib/label-scan/fx";
import {
  createCatalogWine,
  createGrape,
  createProducer,
} from "@/app/catalog/new/actions";
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

type CatalogSearchRow = {
  id: string;
  wine_name: string;
  producer: string;
  appellation: string;
  colour: string;
  vintage_kind: string;
  vintage_year: number | null;
  vintage_tawny_years: number | null;
};

async function searchRows(
  supabase: Awaited<ReturnType<typeof createClient>>,
  query: string,
  limit: number,
): Promise<CatalogSearchRow[]> {
  const { data } = await supabase.rpc("search_catalog_wines", {
    p_query: query,
    p_limit: limit,
  });
  return (data ?? []) as CatalogSearchRow[];
}

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

  // Dedup matching, deliberately NOT a plain text search.
  //
  // `search_catalog_wines` requires EVERY query token to match (bool_and), which
  // is right for a user typing a search but wrong for a label read: the scanner
  // returns a richer name than the catalog stores ("Vintage Brut" vs "Vintage"),
  // and one extra word made the whole match fail — so a wine already in the
  // catalog was offered as new. Instead, anchor on the strong identity
  // (producer + vintage + colour) and use the remaining words only to RANK.
  const anchor = (extracted.producer ?? "").trim();
  const query = anchor
    ? anchor
    : [extracted.wineName, extracted.appellation]
        .filter(Boolean)
        .join(" ")
        .trim();

  let matches: ScanMatch[] = [];
  if (query.length >= 2) {
    // Broad fetch: every wine by this producer. Colour/vintage narrow it right
    // back down below, so the cap is never the limiting factor in practice.
    let rows = await searchRows(supabase, query, anchor ? 50 : 5);
    // A label may print a longer producer name than the catalog holds ("Veuve
    // Clicquot Ponsardin" vs "Veuve Clicquot"); every-token-must-match would
    // return nothing. Retry on the leading words before giving up.
    if (rows.length === 0 && anchor) {
      const words = anchor.split(/\s+/).filter(Boolean);
      for (let take = words.length - 1; take >= 1 && rows.length === 0; take--) {
        rows = await searchRows(supabase, words.slice(0, take).join(" "), 50);
      }
    }
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
    // The words the anchor didn't consume ("Vintage Brut", "Champagne") decide
    // the ORDER of the surviving candidates, never whether they survive — that
    // is the whole point of the change.
    const hintTokens = [extracted.wineName, extracted.appellation]
      .filter(Boolean)
      .join(" ")
      .split(/[^\p{L}\p{N}]+/u)
      .map(fold)
      .filter((t) => t.length > 2);
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
        const haystack = fold(
          [w.wine_name, w.appellation, w.producer].filter(Boolean).join(" "),
        );
        const score = hintTokens.filter((t) => haystack.includes(t)).length;
        return { id: w.id, name: name || "Untitled wine", score };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map(({ id, name }) => ({ id, name }));
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
// Auto-accept a scanned wine: create it exactly as the add-wine form would —
// same find-or-create producer/grape actions, same payload — or return null
// when anything needs human review (missing geography, colour/style, an
// unread vintage) so the caller falls back to the form.
export async function createScannedWine(
  prefill: WineFormInitial,
): Promise<{ id: string } | null> {
  const b0 = prefill.blend[0];
  if (
    !prefill.countryId ||
    !prefill.regionId ||
    !prefill.appellationId ||
    !prefill.colour ||
    !prefill.style ||
    !(b0 && (b0.grapeId || b0.pendingName?.trim())) ||
    !(prefill.producerId || prefill.producerLabel?.trim()) ||
    prefill.vintagePrompt ||
    (prefill.vintageKind === "YEAR" && !prefill.vintageYear)
  ) {
    return null;
  }
  let producerId = prefill.producerId;
  if (!producerId && prefill.producerLabel) {
    producerId = (
      await createProducer(prefill.producerLabel.trim(), prefill.regionId || null)
    ).id;
  }
  const rows: { grapeId: string; percentage: number | null }[] = [];
  for (const r of prefill.blend) {
    let grapeId = r.grapeId;
    if (!grapeId && r.pendingName?.trim()) {
      grapeId = (await createGrape(r.pendingName.trim())).id;
    }
    if (grapeId) {
      rows.push({
        grapeId,
        percentage: r.percentage.trim() ? Number(r.percentage) : null,
      });
    }
  }
  if (rows.length === 0) return null;
  const { id } = await createCatalogWine({
    countryId: prefill.countryId,
    regionId: prefill.regionId,
    appellationId: prefill.appellationId,
    primaryGrapeId: rows[0].grapeId,
    secondaryGrapeId: rows[1]?.grapeId ?? null,
    grapes: rows,
    producerId,
    typeDesignationId: prefill.typeDesignationId || null,
    colour: prefill.colour,
    style: prefill.style,
    wineName: prefill.wineName.trim() || null,
    description: prefill.description?.trim() || null,
    vintageKind: prefill.vintageKind,
    vintageYear:
      prefill.vintageKind === "YEAR" ? Number(prefill.vintageYear) : null,
    vintageTawnyYears:
      prefill.vintageKind === "TAWNY" && prefill.tawnyYears
        ? Number(prefill.tawnyYears)
        : null,
    imageUrl: prefill.imageUrl,
    // FastCork reports a typical US RETAIL price (newer wines only) rather than
    // a market valuation. The catalog stores prices in DKK, so it's converted at
    // the current USD/DKK rate — never stored as a USD number labelled DKK.
    estimatedPrice: await usdToDkk(prefill.retailPriceUsd ?? null),
    profile: prefill.profile ?? null,
  });
  return { id };
}

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
    // The free-text blurb is no longer composed from the read — FastCork's
    // prose is carried as the structured profile below instead, so the catalog
    // shows the same sections for every scanned wine.
    description: null,
    profile: {
      wineryDescription: extracted.wineryDescription,
      aroma: extracted.aroma,
      tastingNotes: extracted.tastingNotes,
      foodPairing: extracted.foodPairing,
      servingTempC: extracted.servingTempC,
      decantMinutes: extracted.decantMinutes,
      alcoholPercent: extracted.alcoholPercent,
    },
    // Deliberately blank: the web-search price lookup made every scan ~15 s
    // slower and ~$0.15 dearer. Prices are curated instead (backfill script /
    // contributor edit); the scan itself stays a fast, cheap extraction.
    // The DKK form field stays blank — FastCork's figure is US retail, carried
    // separately in retailPriceUsd and converted to DKK when the wine is saved.
    estimatedPrice: "",
    retailPriceUsd: extracted.retailPriceUsd,
    // An unread vintage prefills as YEAR-with-empty-field plus a prompt — NV
    // is a claim about the wine, not a fallback for "couldn't see the year".
    vintageKind: extracted.vintageRead ? extracted.vintageKind : "YEAR",
    vintageYear: extracted.vintageYear != null ? String(extracted.vintageYear) : "",
    vintagePrompt: !extracted.vintageRead,
    tawnyYears: "",
    imageUrl: null,
    appellations,
  };
}
