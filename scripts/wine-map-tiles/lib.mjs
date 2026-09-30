// Shared constants and pure helpers for the wine map tile pipeline.
// Everything network-facing lives behind small factory functions so the
// pure helpers stay unit-testable without credentials.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

// Shard = 2nd segment of the canonical key. tier 0 (country) -> world only;
// tier 1 (region) -> world AND its own shard; tier >= 2 -> shard only. Region
// coverage grows without touching this rule.
export function shardKeyFor(canonicalKey) {
  const segments = canonicalKey.split(".");
  return segments.length >= 2 ? segments[1] : null;
}

export function archiveForPlace(row) {
  const shard = shardKeyFor(row.canonical_key);
  if (row.display_tier <= 0) return { world: true, shard: null };
  if (row.display_tier === 1) return { world: true, shard };
  return { world: false, shard };
}

// Multi-country export invariants (fail-closed). Routing is country-agnostic
// by construction — country = key segment 0, shard = segment 1 — so France,
// Italy and Spain coexist without special cases. Two silent failure modes
// survive that generality, and this guard turns each into a hard stop at
// export time:
//
//  1. Orphaned country: a place keyed `spain.galicia.rias-baixas` while no
//     `spain` COUNTRY (tier 0) row is present — the region would draw with no
//     country outline beneath it, or the prefix is a typo. Every distinct
//     key-prefix among the rows MUST have a tier-0 row in the same set.
//  2. Cross-country shard collision: shards are keyed by the 2nd segment
//     (a France region / a Spain comunidad). If a French region and a Spanish
//     comunidad ever shared a slug (say both `rioja`) their features would
//     merge into one archive under one colour and bbox. No shard key may be
//     claimed by two different countries.
//
// Decision (locked): keep shard = 2nd segment, un-namespaced — matching
// France's region-level and Italy's — rather than prefixing `country-region`.
// France/Italy/Spain have no colliding second segment today; this guard is the
// tripwire if that ever stops being true, at which point we namespace.
export function assertMultiCountryArchive(rows) {
  const countryOf = (key) => key.split(".")[0];
  const countryOutlines = new Set(
    rows.filter((row) => row.display_tier <= 0).map((row) => row.canonical_key),
  );
  const shardCountries = new Map();
  for (const row of rows) {
    const country = countryOf(row.canonical_key);
    assert.ok(
      countryOutlines.has(country),
      `place ${row.canonical_key} has no ${country} country outline in the archive`,
    );
    const shard = shardKeyFor(row.canonical_key);
    if (shard === null) continue;
    const claimed = shardCountries.get(shard);
    assert.ok(
      claimed === undefined || claimed === country,
      `shard "${shard}" is claimed by two countries (${claimed}, ${country}); namespace shard keys`,
    );
    shardCountries.set(shard, country);
  }
}

// Per-country coverage windows (spec 2026-09-29 D17). validate.mjs used ONE box
// for every archive (-18..19 lon, 32..56 lat); the United States cannot fit in
// it, and widening it to -125 would stop it catching a stray European shard.
// Two checks replace it: each archive's pmtiles header must sit inside the
// union of its own countries' boxes, and every expected label point inside ITS
// OWN country's box (country = first key segment). The second is what still
// catches a Paris label on a united-states.* key once the world archive spans
// -125.5..19. The five European countries keep exactly the old box, so nothing
// tightens. A country with no entry throws: add its window in the same change
// that verifies its first place.
const EUROPE_WINDOW = Object.freeze({ minLon: -18, minLat: 32, maxLon: 19, maxLat: 56 });
export const COVERAGE_BOXES = Object.freeze({
  france: EUROPE_WINDOW,
  italy: EUROPE_WINDOW,
  spain: EUROPE_WINDOW,
  germany: EUROPE_WINDOW,
  portugal: EUROPE_WINDOW,
  // The lower 48, padded. Alaska and Hawaii are out of scope.
  "united-states": Object.freeze({ minLon: -125.5, minLat: 24, maxLon: -66.5, maxLat: 49.5 }),
});

export function countryOfKey(canonicalKey) {
  return canonicalKey.split(".")[0];
}

export function coverageBoxFor(countries) {
  const list = [...countries];
  if (list.length === 0) throw new Error("coverageBoxFor needs at least one country");
  const boxes = list.map((country) => {
    // Object.hasOwn, not COVERAGE_BOXES[country]: "constructor" must not
    // resolve to Object.prototype.constructor and pass as a box.
    if (!Object.hasOwn(COVERAGE_BOXES, country)) {
      throw new Error(
        `No coverage box for country "${country}" (add it to COVERAGE_BOXES in scripts/wine-map-tiles/lib.mjs)`,
      );
    }
    return COVERAGE_BOXES[country];
  });
  return {
    minLon: Math.min(...boxes.map((b) => b.minLon)),
    minLat: Math.min(...boxes.map((b) => b.minLat)),
    maxLon: Math.max(...boxes.map((b) => b.maxLon)),
    maxLat: Math.max(...boxes.map((b) => b.maxLat)),
  };
}

export function boundsInside(bounds, box) {
  return (
    bounds.minLon >= box.minLon && bounds.maxLon <= box.maxLon &&
    bounds.minLat >= box.minLat && bounds.maxLat <= box.maxLat
  );
}

/** The countries an archive holds: first key segments of its expected rows. */
export function archiveCountries(release, ids) {
  return [...new Set(
    release.expected.filter(({ id }) => ids.has(id)).map(({ key }) => countryOfKey(key)),
  )].sort();
}

/** Every expected row whose label point lies outside its own country's box. */
export function featureOutsideCoverage(release) {
  return release.expected.filter(({ key, label_lon: lon, label_lat: lat }) =>
    !boundsInside(
      { minLon: lon, maxLon: lon, minLat: lat, maxLat: lat },
      coverageBoxFor([countryOfKey(key)]),
    ));
}

export const WORLD_TARGET = { minZoom: 0, maxZoom: 7 };
export const SHARD_TARGET = { minZoom: 4, maxZoom: 16 };
export const BUCKET = "wine-map-tiles";
export const WORK_DIR = path.resolve(".tiles-build");
export const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://eqzwmkpeysqiihuojmuj.supabase.co";

export const ATTRIBUTION = {
  BLINDR_MANUAL: { key: "blindr", text: "© Blindr" },
  IGN_INAO_AOC_VITICOLES_LEGACY: {
    key: "ign-inao",
    text: "Contains data © IGN / INAO, Licence Ouverte Etalab",
  },
  // Phase 3A adapter namespace (no _LEGACY suffix); same public credit as the
  // legacy import, so attributionDisplayMap collapses both to one entry.
  IGN_INAO_AOC_VITICOLES: {
    key: "ign-inao",
    text: "Contains data © IGN / INAO, Licence Ouverte Etalab",
  },
  // Champagne (and future no-parcel regions): commune-union from IGN Admin
  // Express filtered by the INAO official commune list. IGN geometry + INAO
  // membership, so it collapses to the same public credit as the parcel source.
  IGN_ADMIN_EXPRESS: {
    key: "ign-inao",
    text: "Contains data © IGN / INAO, Licence Ouverte Etalab",
  },
  NATURAL_EARTH: { key: "natural-earth", text: "Made with Natural Earth" },
  // Piedmont pilot (Barolo/Barbaresco/Piemonte): ISTAT comuni dissolve.
  // See scripts/wine-map-sources/stage-piedmont-boundaries.mjs (NAMESPACE).
  ISTAT_CONFINI: {
    key: "istat",
    text: "© ISTAT — Confini delle unità amministrative a fini statistici (CC BY 4.0)",
  },
  // Official Regione Piemonte DOC/DOCG delimited-area polygons (Langhe
  // expansion pilot). See scripts/wine-map-sources/stage-piemonte-official.mjs
  // (NAMESPACE). Supersedes ISTAT_CONFINI for Barolo/Barbaresco.
  PIEMONTE_DOC_DOCG: {
    key: "piemonte",
    text: "© Regione Piemonte — Aree di produzione dei vini DOC e DOCG (CC BY 4.0)",
  },
  // Official Regione Toscana wine-production-area polygons (GEOscopio "Zone di
  // produzione dei vini"). See scripts/wine-map-sources/stage-toscana-official.mjs.
  TOSCANA_DOC_DOCG: {
    key: "toscana",
    text: "© Regione Toscana — Zone di produzione dei vini (CC BY 4.0)",
  },
  // Spanish DO/DOCa outlines: whole-municipality union from the OpenDataSoft
  // georef-spain-municipio layer (IGN/CNIG-derived) filtered by each DO's
  // official municipality list. The Spanish analogue of IGN_ADMIN_EXPRESS —
  // official municipal polygons + a pliego membership list, dissolved.
  IGN_CNIG_SPAIN: {
    key: "ign-cnig-spain",
    text: "Contains data © IGN/CNIG España",
  },
  // Official Provincia Autonoma di Bolzano "Zone DOC e IGT" (GeoKatalog).
  // See scripts/wine-map-sources/stage-altoadige-official.mjs.
  ALTOADIGE_DOC_IGT: {
    key: "trentino-alto-adige",
    text: "© Autonome Provinz Bozen-Südtirol / Provincia Autonoma di Bolzano — Zone DOC e IGT (CC BY 4.0)",
  },
  // Official Regione del Veneto DOC/DOCG wine zones (IDT2 GeoServer).
  // See scripts/wine-map-sources/stage-veneto-official.mjs.
  VENETO_DOC_DOCG: {
    key: "veneto",
    text: "© Regione del Veneto — Zone DOC e DOCG viticole (CC BY 4.0)",
  },
  // Sicily has no official delimited-zone GIS: footprints are ISTAT comune
  // boundaries dissolved per the MASAF disciplinare comune lists (comune-level
  // approximation). See scripts/wine-map-sources/stage-sicily-official.mjs.
  SICILY_COMUNI: {
    key: "sicilia",
    text: "© ISTAT — confini comunali; delimitazione da disciplinari MASAF (CC BY 4.0)",
  },
  // Lombardy: no official delimited-zone GIS — ISTAT comuni dissolved per the
  // MASAF disciplinare comune lists. See stage-lombardia-official.mjs.
  LOMBARDIA_COMUNI: {
    key: "lombardia",
    text: "© ISTAT — confini comunali; delimitazione da disciplinari MASAF (CC BY 4.0)",
  },
  // Friuli: no official delimited-zone GIS — ISTAT comuni dissolved per the
  // MASAF disciplinare comune lists. See stage-friuli-official.mjs.
  FRIULI_COMUNI: {
    key: "friuli",
    text: "© ISTAT — confini comunali; delimitazione da disciplinari MASAF (CC BY 4.0)",
  },
  // Wave-5 Italian regions: no official delimited-zone GIS — ISTAT comuni
  // dissolved per the MASAF disciplinare comune lists (comune-level
  // approximation). See scripts/wine-map-sources/stage-<region>-official.mjs.
  EMILIAROMAGNA_COMUNI: {
    key: "emilia-romagna",
    text: "© ISTAT — confini comunali; delimitazione da disciplinari MASAF (CC BY 4.0)",
  },
  CAMPANIA_COMUNI: {
    key: "campania",
    text: "© ISTAT — confini comunali; delimitazione da disciplinari MASAF (CC BY 4.0)",
  },
  PUGLIA_COMUNI: {
    key: "puglia",
    text: "© ISTAT — confini comunali; delimitazione da disciplinari MASAF (CC BY 4.0)",
  },
  UMBRIA_COMUNI: {
    key: "umbria",
    text: "© ISTAT — confini comunali; delimitazione da disciplinari MASAF (CC BY 4.0)",
  },
  ABRUZZO_COMUNI: {
    key: "abruzzo",
    text: "© ISTAT — confini comunali; delimitazione da disciplinari MASAF (CC BY 4.0)",
  },
  // Wave-6 Italian regions (comune-union from ISTAT + MASAF disciplinari) —
  // completing the Italian mainland + islands. See stage-wave6-region.mjs.
  MARCHE_COMUNI:      { key: "marche",        text: "© ISTAT — confini comunali; delimitazione da disciplinari MASAF (CC BY 4.0)" },
  LAZIO_COMUNI:       { key: "lazio",         text: "© ISTAT — confini comunali; delimitazione da disciplinari MASAF (CC BY 4.0)" },
  SARDEGNA_COMUNI:    { key: "sardegna",      text: "© ISTAT — confini comunali; delimitazione da disciplinari MASAF (CC BY 4.0)" },
  LIGURIA_COMUNI:     { key: "liguria",       text: "© ISTAT — confini comunali; delimitazione da disciplinari MASAF (CC BY 4.0)" },
  CALABRIA_COMUNI:    { key: "calabria",      text: "© ISTAT — confini comunali; delimitazione da disciplinari MASAF (CC BY 4.0)" },
  BASILICATA_COMUNI:  { key: "basilicata",    text: "© ISTAT — confini comunali; delimitazione da disciplinari MASAF (CC BY 4.0)" },
  VALLEDAOSTA_COMUNI: { key: "valle-d-aosta", text: "© ISTAT — confini comunali; delimitazione da disciplinari MASAF (CC BY 4.0)" },
  MOLISE_COMUNI:      { key: "molise",        text: "© ISTAT — confini comunali; delimitazione da disciplinari MASAF (CC BY 4.0)" },
  // Germany national outline: dissolve of the 16 Bundesländer (BKG VG250 via
  // OpenDataSoft georef-germany-land). Same data family as the Spain/Italy
  // dissolves. See scripts/wine-map-sources/build-germany-country-outline.mjs.
  BKG_VG250: {
    key: "bkg",
    text: "© GeoBasis-DE / BKG (VG250), dl-de/by-2.0",
  },
  // German vineyard sites: the LEGAL Weinbergsrolle boundaries (Anbaugebiet /
  // Bereich / Großlage / Einzellage) published by the Landwirtschaftskammer
  // Rheinland-Pfalz via LGB. Every German tier is a dissolve of this one layer.
  // See scripts/wine-map-sources/fetch-rlp-weinlagen.mjs.
  LWK_RLP_WEINLAGEN: {
    key: "lwk-rlp",
    text: "© LGB-RLP, dl-de/by-2.0 — Weinbergsrolle der Landwirtschaftskammer Rheinland-Pfalz",
  },
  // Portugal: no authority publishes open DO boundaries, so every Portuguese
  // footprint is a concelho-union of CAOP 2025 (DGT) driven by the legal area
  // definitions published by the IVV / IVDP / regional CVRs — the same method
  // Italy uses over ISTAT comuni. Mainland and Madeira are separate CAOP
  // datasets, hence two namespaces sharing one public credit.
  CAOP_CONCELHOS: {
    key: "dgt-caop",
    text: "© Direção-Geral do Território — CAOP 2025 (CC BY 4.0); delimitação segundo os diplomas do IVV/IVDP",
  },
  CAOP_RAM: {
    key: "dgt-caop",
    text: "© Direção-Geral do Território — CAOP 2025 (CC BY 4.0); delimitação segundo os diplomas do IVV/IVDP",
  },
  // Sub-regions delimited by freguesia lists rather than whole concelhos —
  // the Douro's three (DL 173/2009) and the two Alentejo ones that Portaria
  // 296/2010 defines administratively. Same dataset family, same credit.
  CAOP_FREGUESIAS: {
    key: "dgt-caop",
    text: "© Direção-Geral do Território — CAOP 2025 (CC BY 4.0); delimitação segundo os diplomas do IVV/IVDP",
  },
  // Hessen: the only German state outside Rheinland-Pfalz whose wine regions can
  // be built from open data, and not from a Weinbergsrolle — Hessen does not
  // publish one. Two authorities contribute and both are credited, because
  // neither result stands without the other: the Weinbauamt names WHICH
  // Gemeinden carry the Rebflächen, ATKIS says WHICH LAND inside them is
  // vineyard. See scripts/wine-map-sources/fetch-hessen-atkis.mjs.
  HESSEN_ATKIS_WEINBAU: {
    key: "hvbg-atkis",
    text: "© HVBG — ATKIS Basis-DLM (§ 24 HVGG); Abgrenzung nach dem Verzeichnis des "
      + "Regierungspräsidiums Darmstadt, Dezernat Weinbau Eltville",
  },
  // The German regions delimited by their EU product specification rather than
  // by a state Weinbergsrolle. One namespace, not one per state, because the
  // membership half is the same source for all of them and the geometry half is
  // whichever state's survey data the region sits in -- Bavaria for Franken,
  // and three states at once for Saale-Unstrut, with Baden-Württemberg to
  // follow. Both contributing halves are credited: neither result stands
  // without the other.
  //
  // EVERY survey authority is named, not just the first. Bavaria publishes
  // under CC BY 4.0 and the other three under Datenlizenz Deutschland —
  // Namensnennung 2.0, and naming the source is what both licences require in
  // exchange for the data. A region whose authority is missing here is being
  // shown in breach of the licence it was obtained under, which is why this
  // string grows with each state rather than staying generic.
  DE_SPEC_ATKIS_WEINBAU: {
    key: "de-spec-atkis",
    text: "© Landesvermessung: Bayerische Vermessungsverwaltung (ATKIS Basis-DLM, CC BY 4.0); "
      + "GeoBasis-DE / LVermGeo Sachsen-Anhalt, GDI-Th / TLBG Thüringen, "
      + "LGB Brandenburg, LGL Baden-Württemberg (ATKIS Basis-DLM und ALKIS, dl-de/by-2-0); "
      + "Abgrenzung nach der Produktspezifikation im EU-Register eAmbrosia, "
      + "für Baden und Württemberg nach GBl. BW 1983 Nr. 23",
  },
  // United States AVAs (spec 2026-09-29 §5.5, D9). The UC Davis Library
  // digitization of 27 CFR Part 9 (CC0) is traced by hand from the USGS maps the
  // CFR names: an approximation, and the credit says so. TTB's own Map Explorer
  // outlines fill the 2026 AVAs UC Davis lacks (US-5). Provisional copy until
  // the owner approves it (spec §18).
  UCD_TTB_AVA: {
    key: "ucd-ava",
    text: "AVA outlines: American Viticultural Areas Digitizing Project, UC Davis Library et al. (CC0) — a generalized digitization of 27 CFR Part 9, not TTB's legal boundary",
  },
  TTB_AVA_MAP: {
    key: "ttb-ava",
    text: "AVA outlines: TTB AVA Map Explorer (public domain) — generalized, not the legal boundary",
  },
};

export function attributionKeyFor(namespace) {
  const entry = ATTRIBUTION[namespace];
  if (!entry) throw new Error(`Unknown source namespace: ${namespace}`);
  return entry.key;
}

export function attributionDisplayMap() {
  return Object.fromEntries(
    Object.values(ATTRIBUTION).map(({ key, text }) => [key, text]),
  );
}

export function releaseVersion(date = new Date()) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

export function sha256hex(buffer) {
  return createHash("sha256").update(buffer).digest("hex").toUpperCase();
}

export function releaseObjectPath(version, filename) {
  return `tiles/releases/${version}/${filename}`;
}

export function storagePublicUrl(objectPath) {
  return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${objectPath}`;
}

export function lonLatToTile(lon, lat, z) {
  const n = 2 ** z;
  const x = Math.floor(((lon + 180) / 360) * n);
  const latRad = (lat * Math.PI) / 180;
  const y = Math.floor(
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n,
  );
  return { z, x, y };
}

// Small stable hash -> 0..SHADE_COUNT-1. FNV-1a: cheap, well-distributed, and
// deterministic across Node versions (a place's colour must not move between
// releases).
export const SHADE_COUNT = 6;

export function shadeIndex(key) {
  let h = 0x811c9dc5;
  for (let i = 0; i < String(key).length; i += 1) {
    h ^= String(key).charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h % SHADE_COUNT;
}

function tileProperties(row) {
  return {
    id: row.id,
    key: row.canonical_key,
    name: row.name,
    kind: row.kind,
    tier: row.display_tier,
    parent_id: row.primary_parent_id,
    has_children: row.has_children,
    rank: row.sort_order,
    // Region segment drives per-region map colouring; the country itself
    // falls back to its own key.
    region: shardKeyFor(row.canonical_key) ?? row.canonical_key,
    // Deterministic 0..5 shade index. Every place in a region shares one hue,
    // which is right at region zoom but makes neighbouring vineyard sites
    // indistinguishable when you get close — a wall of identical brown. The
    // frontend varies lightness by this index so adjacent shapes separate
    // visually while still reading as the same family. Hashed from the
    // canonical key so it is stable across rebuilds (a place must not change
    // colour between releases) and uncorrelated between neighbours.
    tint: shadeIndex(row.canonical_key),
    attribution: attributionKeyFor(row.source_namespace),
    min_zoom: Number(row.min_zoom),
    label_min_zoom: Number(row.label_min_zoom),
    // Planar deg² of the footprint: click resolution picks the smallest
    // overlapping shape so enclaves (Canon-Fronsac in Fronsac) stay clickable.
    area: Number(row.area ?? 0),
    // Legal appellation level; null for non-appellations.
    level: row.level ?? null,
    // Classification for the border language on the map: appellation_level
    // where it exists, else derived from échelle provenance so Champagne's
    // rated villages (not appellations) still carry grand/premier cru.
    classification: row.classification ?? row.level ?? null,
    // Third key segment — a region's top-level areas (medoc, graves,
    // pomerol…). District-mode regions colour and legend by it; computed in
    // export.mjs from the full row set (needs the ancestor's display name).
    group: row.group ?? null,
    group_name: row.group_name ?? null,
    // Hue-grouping unit for fills (NOT `area`, which is the numeric
    // footprint size above): the tier-3 ancestor (village) where one exists,
    // else the tier-2 district/sub-region; falls back to the key-segment
    // group for fixture rows.
    area_key: row.area_key ?? row.group ?? null,
    area_name: row.area_name ?? row.group_name ?? null,
    // Outline-only places (spec 2026-09-29 D15: the AVAs of 5,000 km² or more
    // and the Central Valley grouping) draw their line and no fill. The key is
    // ABSENT unless the current boundary's generation_parameters say
    // display 'outline', so every existing feature stays byte-identical.
    ...(row.display === "outline" ? { outline: true } : {}),
  };
}

export function placeFeature(row) {
  return {
    type: "Feature",
    properties: tileProperties(row),
    tippecanoe: { minzoom: Math.max(0, Math.floor(Number(row.min_zoom))) },
    geometry: JSON.parse(row.geometry),
  };
}

// ---------------------------------------------------------------------------
// reveal_area: WHEN a subregion appears on the map (owner, 2026-09-30: "you
// need to zoom further in before smaller places appear"; his decisions the
// same day: 24 px, and "keep ribbons visible": long thin places such as Côte
// de Nuits appear with their region, only compact specks wait). The app draws
// a tier >= 2 feature from the first whole zoom z at which
//     reveal_area * 4^z >= K(N, shard mid-latitude)     (src/lib/wine-map/reveal.ts)
// that is, at which its REVEAL SIDE r is N CSS px: r * 2^z >= N. The side
// needs geometry only the export has, so it is worked out here, in
// Web-Mercator CSS px at z0 (the world is 512 px wide; Mercator is conformal,
// so every length on screen is its z0 length times 2^z, exactly).
//
// Per polygon part q, with area A (px²) and L the long side of the part's
// minimum-area enclosing rectangle:
//     size(q) = max( sqrt(A), min( L / REVEAL_LENGTH_RATIO, REVEAL_THICKNESS_RATIO * A / L ) )
// A part is big enough once the square of its area is N px across (the plain
// rule), OR once it is REVEAL_LENGTH_RATIO * N px long AND N /
// REVEAL_THICKNESS_RATIO px thick on average (A / L is its mean thickness).
// A part at most twice as long as its equal-area square (L <= 2 sqrt(A):
// every compact shape) gets exactly the plain rule; only real ribbons are
// measured by their length (evidence: docs/superpowers/specs/
// 2026-09-30-wine-map-reveal-by-size.md §11: Côte de Nuits is 54 px long and
// 3.7 px thick at the Burgundy view; Rockpile, 40 px and 6.5 px at z7, must
// still wait for z8).
// Per place p:
//     own(p) = max( sqrt(sum of its parts' A), max over its parts of size(q) )
//   The whole footprint still counts as one (a cluster of vineyard parcels),
//   but a length is measured within ONE part, never across a scattered
//   multipart bbox (Mendocino Ridge's 75 fragments are not one long place).
//   SUBREGIONS COME WITH THEIR REGION: the SUBREGION-kind children of one
//   region (tier 1) are a family; one whose own() is at least
//   1/SUBREGION_FAMILY_RATIO of the family's median own() takes max(own,
//   median), so it comes in with the median subregion (Burgundy's compact
//   Grand Auxerrois comes in with its ribbons at the Burgundy view). Nothing
//   else is pulled by a family: a broader family rule brought Cole Ranch,
//   Benmore Valley and Oakville in a zoom early (spec §11.3).
// Per part: the anchor (the part with the largest size) takes the place's
// side; every other part min(place side, PIECE_PX_RATIO * sqrt(A_q)), so a
// small piece of a scattered place waits until its own square is
// N / PIECE_PX_RATIO across and never comes before its place (no confetti). A
// label takes the place's side, so a name comes with its shape.
// Finally reveal_area = (r * 360/512)^2 * cos(shard mid-latitude): the tile's
// own `area` unit (planar deg²) at the latitude the app's K is built for, so
// the app's test is exact. Every step is a ratio of N, so REVEAL_MIN_PX and
// ?revealPx= keep meaning what they say.
//
// EVERY tier >= 2 feature carries reveal_area, since the app fails open on a
// feature without one (every release before this rule), and the release flags
// each shard `reveal_rule: REVEAL_RULE` in its manifest entry, which is what
// turns the rule on for that shard in the app (its filters, the selection
// camera's floor and the status probes). `area`
// stays the whole footprint on every part (click resolution picks the
// smallest place by it). Countries and regions (tier <= 1) are exempt and
// never split, so the world archive is byte-identical.
export const REVEAL_RULE = 1;
export const REVEAL_LENGTH_RATIO = 2;
export const REVEAL_THICKNESS_RATIO = 8;
export const SUBREGION_FAMILY_RATIO = 2;
export const PIECE_PX_RATIO = 3;

/** A lon/lat position in Web-Mercator CSS px at z0 (the world is 512 px). */
export function mercatorPx(lon, lat) {
  const s = Math.sin((lat * Math.PI) / 180);
  return [((lon + 180) / 360) * 512, (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * 512];
}

function shoelace(ring) {
  let sum = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    sum += (ring[j][0] + ring[i][0]) * (ring[j][1] - ring[i][1]);
  }
  return Math.abs(sum) / 2;
}

function turn(o, a, b) {
  return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
}

/** The convex hull of a point set (Andrew's monotone chain), counter-clockwise,
    without repeated or collinear points. */
export function convexHull(points) {
  const sorted = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const pts = sorted.filter((p, i) => i === 0 || p[0] !== sorted[i - 1][0] || p[1] !== sorted[i - 1][1]);
  if (pts.length < 3) return pts;
  const lower = [];
  for (const p of pts) {
    while (lower.length >= 2 && turn(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper = [];
  for (let i = pts.length - 1; i >= 0; i -= 1) {
    while (upper.length >= 2 && turn(upper[upper.length - 2], upper[upper.length - 1], pts[i]) <= 0) upper.pop();
    upper.push(pts[i]);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

/** The minimum-area rectangle round a convex hull: its { long, short } sides.
    One side of it lies along a hull edge, so every edge is tried. */
export function minAreaRectangle(hull) {
  if (hull.length < 2) return { long: 0, short: 0 };
  if (hull.length === 2) {
    return { long: Math.hypot(hull[1][0] - hull[0][0], hull[1][1] - hull[0][1]), short: 0 };
  }
  let best = null;
  for (let i = 0; i < hull.length; i += 1) {
    const a = hull[i];
    const b = hull[(i + 1) % hull.length];
    const edge = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (edge === 0) continue;
    const ux = (b[0] - a[0]) / edge;
    const uy = (b[1] - a[1]) / edge;
    let minU = Infinity;
    let maxU = -Infinity;
    let minV = Infinity;
    let maxV = -Infinity;
    for (const [x, y] of hull) {
      const u = x * ux + y * uy;
      const v = y * ux - x * uy;
      minU = Math.min(minU, u);
      maxU = Math.max(maxU, u);
      minV = Math.min(minV, v);
      maxV = Math.max(maxV, v);
    }
    const w = maxU - minU;
    const h = maxV - minV;
    if (!best || w * h < best.area) best = { area: w * h, long: Math.max(w, h), short: Math.min(w, h) };
  }
  return best ? { long: best.long, short: best.short } : { long: 0, short: 0 };
}

/** One GeoJSON polygon part (lon/lat rings, outer first) in z0 Mercator px:
    its area (outer ring minus holes, px²) and the long side of its
    minimum-area rectangle (px). Measured from the part's first vertex, so
    small parts keep their precision. */
export function partMeasure(polygon) {
  const first = polygon?.[0]?.[0];
  if (!first) return { area: 0, long: 0 };
  const [ox, oy] = mercatorPx(first[0], first[1]);
  const rings = polygon.map((ring) =>
    ring.map(([lon, lat]) => {
      const [x, y] = mercatorPx(lon, lat);
      return [x - ox, y - oy];
    }),
  );
  const area = Math.max(0, rings.reduce((sum, ring, i) => sum + (i === 0 ? shoelace(ring) : -shoelace(ring)), 0));
  return { area, long: minAreaRectangle(convexHull(rings[0])).long };
}

/** A part's size in z0 px (see above): its equal-area side, or, for a long
    thin part, min(length / REVEAL_LENGTH_RATIO, REVEAL_THICKNESS_RATIO x mean
    thickness), whichever is larger. */
export function partSize({ area, long }) {
  const side = Math.sqrt(Math.max(0, area));
  if (!(long > 0) || !(area > 0)) return side;
  return Math.max(side, Math.min(long / REVEAL_LENGTH_RATIO, (REVEAL_THICKNESS_RATIO * area) / long));
}

// Six significant digits: the tiny grands crus are 1e-6 deg², where the
// export's fixed 8 decimals of `area` would leave two.
function roundArea(value) {
  return Number(value.toPrecision(6));
}

/** A reveal side (z0 Mercator px) as reveal_area: planar deg² at the shard's
    mid-latitude, the unit of the tile's `area` and of the app's K. */
export function revealAreaFromSide(side, latitude) {
  return roundArea(((side * 360) / 512) ** 2 * Math.cos((latitude * Math.PI) / 180));
}

function median(values) {
  const sorted = [...values].sort((x, y) => x - y);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** The reveal plan of every tier >= 2 export row (above): id -> { side,
    revealArea, anchor, parts: [{ side, revealArea }] }, sides in z0 px, parts
    in the row's geometry order. `latitudeOf(row)` is the mid-latitude of the
    row's shard bbox, the one the manifest hands the app. Fails closed on a
    value that is not a finite number. */
export function revealPlan(rows, latitudeOf) {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const measured = new Map();
  for (const row of rows) {
    if (row.display_tier < 2) continue;
    const polygons = JSON.parse(row.geometry).coordinates ?? [];
    const parts = polygons.map((polygon) => partMeasure(polygon));
    const sizes = parts.map((part) => partSize(part));
    let anchor = 0;
    sizes.forEach((size, i) => {
      if (size > sizes[anchor] || (size === sizes[anchor] && parts[i].area > parts[anchor].area)) anchor = i;
    });
    const total = Math.sqrt(parts.reduce((sum, part) => sum + part.area, 0));
    measured.set(row.id, { parts, anchor, own: Math.max(total, sizes.length ? sizes[anchor] : 0) });
  }
  // Subregions come with their region: the SUBREGION children of one tier-1 region.
  const families = new Map();
  for (const row of rows) {
    if (!measured.has(row.id) || row.kind !== "SUBREGION") continue;
    const parent = byId.get(row.primary_parent_id);
    if (!parent || parent.display_tier !== 1) continue;
    const family = families.get(parent.id) ?? [];
    family.push(row.id);
    families.set(parent.id, family);
  }
  const placeSide = new Map([...measured].map(([id, m]) => [id, m.own]));
  for (const family of families.values()) {
    if (family.length < 2) continue;
    const m = median(family.map((id) => measured.get(id).own));
    for (const id of family) {
      const own = measured.get(id).own;
      if (own >= m / SUBREGION_FAMILY_RATIO) placeSide.set(id, Math.max(own, m));
    }
  }
  const plan = new Map();
  for (const row of rows) {
    const m = measured.get(row.id);
    if (!m) continue;
    const latitude = latitudeOf(row);
    const side = placeSide.get(row.id);
    const parts = m.parts.map((part, i) => {
      const partSide = i === m.anchor ? side : Math.min(side, PIECE_PX_RATIO * Math.sqrt(part.area));
      return { side: partSide, revealArea: revealAreaFromSide(partSide, latitude) };
    });
    const entry = { side, revealArea: revealAreaFromSide(side, latitude), anchor: m.anchor, parts };
    for (const value of [entry.revealArea, ...parts.map((part) => part.revealArea)]) {
      assert.ok(Number.isFinite(value) && value >= 0, `${row.canonical_key}: reveal_area ${value}`);
    }
    plan.set(row.id, entry);
  }
  return plan;
}

/** A feature with reveal_area set (a new object; the input is left alone). */
export function withRevealArea(feature, revealArea) {
  return { ...feature, properties: { ...feature.properties, reveal_area: revealArea } };
}

/** A place's tile features. A country or region: placeFeature, unchanged. A
    subregion: one feature per polygon part, in geometry order, each with the
    place's properties (`area` still the whole footprint) plus that part's
    reveal_area from `planEntry` (revealPlan's value for the row). */
export function placeFeatures(row, planEntry) {
  const feature = placeFeature(row);
  if (row.display_tier < 2) return [feature];
  assert.ok(planEntry, `${row.canonical_key}: no reveal plan`);
  const polygons = feature.geometry.coordinates;
  assert.equal(polygons.length, planEntry.parts.length, `${row.canonical_key}: reveal plan out of step`);
  return polygons.map((polygon, i) => ({
    ...withRevealArea(feature, planEntry.parts[i].revealArea),
    geometry: { type: "MultiPolygon", coordinates: [polygon] },
  }));
}

// Ranked per-island labels (owner brief: one label per region at everyday
// zooms). Components arrive largest-first ([lon, lat, area] from the export
// SQL); rank 1 — in practice the region's best-known heartland (Côte d'Or
// for Bourgogne, not the Chablis island) — labels from label_min_zoom like
// before. The other islands' labels are baked in SECONDARY_LABEL_ZOOM_OFFSET
// zooms deeper, so "Bourgogne" appears over Chablis only once the camera is
// close enough that the heartland is off-screen. Components under
// MIN_LABEL_COMPONENT_SHARE of the footprint never get a label (slivers).
// Bare [lon, lat] fixtures rank by list order and are all kept. Falls back
// to the canonical label point when the row has no per-component list.
export const SECONDARY_LABEL_ZOOM_OFFSET = 5;
export const MIN_LABEL_COMPONENT_SHARE = 0.02;

export function labelFeatures(row) {
  const properties = tileProperties(row);
  const baseMinzoom = Math.max(0, Math.floor(Number(row.label_min_zoom)));
  if (!Array.isArray(row.component_labels) || row.component_labels.length === 0) {
    return [{
      type: "Feature",
      properties: { ...properties, label_rank: 1 },
      tippecanoe: { minzoom: baseMinzoom },
      geometry: { type: "Point", coordinates: JSON.parse(row.label_point).coordinates },
    }];
  }
  const totalArea = row.component_labels.reduce(
    (sum, entry) => sum + (Number(entry[2]) || 0),
    0,
  );
  return row.component_labels
    .filter((entry, index) => {
      if (index === 0 || totalArea === 0) return true;
      return (Number(entry[2]) || 0) / totalArea >= MIN_LABEL_COMPONENT_SHARE;
    })
    .map(([lon, lat], index) => ({
      type: "Feature",
      properties: { ...properties, label_rank: index + 1 },
      tippecanoe: {
        minzoom: index === 0
          ? baseMinzoom
          : baseMinzoom + SECONDARY_LABEL_ZOOM_OFFSET,
      },
      geometry: { type: "Point", coordinates: [lon, lat] },
    }));
}

export function featureCollection(features) {
  return { type: "FeatureCollection", features };
}

export function buildManifest({ version, generatedAt, world, shards, attribution }) {
  return {
    schema_version: 2,
    release_version: version,
    generated_at: generatedAt,
    world, // { url, checksum_sha256, bytes }
    shards, // { <key>: { url, checksum_sha256, bytes, bbox:[w,s,e,n], min_zoom, max_zoom, reveal_rule? } }
    attribution,
  };
}

/** The manifest that makes a release live: every archive in a
    wine_map_releases row's tile_checksums (publish.mjs), at its public URL.
    promote.mjs uploads it as tiles/manifest.json; the same object built for a
    release that was never promoted is what a local draft check loads. A
    shard's reveal_rule (REVEAL_RULE: its subregions carry reveal_area) passes
    through, and is absent for every release published before it. */
export function manifestForRelease({ version, tileChecksums, generatedAt }) {
  const shards = {};
  for (const [key, entry] of Object.entries(tileChecksums)) {
    if (key === "world") continue;
    shards[key] = {
      url: storagePublicUrl(entry.path),
      checksum_sha256: entry.checksum_sha256,
      bytes: entry.bytes,
      bbox: entry.bbox,
      min_zoom: entry.min_zoom,
      max_zoom: entry.max_zoom,
      ...(entry.reveal_rule !== undefined ? { reveal_rule: entry.reveal_rule } : {}),
    };
  }
  return buildManifest({
    version,
    generatedAt,
    world: {
      url: storagePublicUrl(tileChecksums.world.path),
      checksum_sha256: tileChecksums.world.checksum_sha256,
      bytes: tileChecksums.world.bytes,
    },
    shards,
    attribution: attributionDisplayMap(),
  });
}

// Secrets pasted through dashboard/CI UIs can arrive wrapped in quotes or
// with stray whitespace/newlines; server auth then fails even though the
// underlying credential is correct.
function cleanSecret(value) {
  return value?.trim().replace(/^["']|["']$/g, "").trim();
}

export function pgConfig() {
  const password = cleanSecret(process.env.DB_PASSWORD);
  assert.ok(password, "DB_PASSWORD is required");
  return {
    host: process.env.DB_HOST ?? "aws-0-eu-central-1.pooler.supabase.com",
    port: Number(process.env.DB_PORT ?? 6543),
    user: process.env.DB_USER ?? "postgres.eqzwmkpeysqiihuojmuj",
    database: process.env.DB_NAME ?? "postgres",
    password,
    ssl: { rejectUnauthorized: false },
  };
}

export function storageBucket() {
  const serviceRoleKey = cleanSecret(process.env.SUPABASE_SERVICE_ROLE_KEY);
  assert.ok(serviceRoleKey, "SUPABASE_SERVICE_ROLE_KEY is required");
  return createClient(SUPABASE_URL, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  }).storage.from(BUCKET);
}

// Storage uploads can fail transiently (run #46 died on a bare "Bad Request"
// that succeeded on manual re-run): three attempts with backoff, real HTTP
// status in the error. A retry after a written-but-timed-out attempt surfaces
// as 409 (upsert=false); publish re-validates every archive through the
// public URLs afterwards, so that counts as uploaded.
export async function uploadObject(objectPath, body, { contentType, cacheControlSeconds, upsert = false }) {
  const attempts = 3;
  for (let attempt = 1; ; attempt += 1) {
    const { error } = await storageBucket().upload(objectPath, body, {
      contentType,
      cacheControl: String(cacheControlSeconds),
      upsert,
    });
    if (!error) return;
    const status = error.status ?? error.statusCode ?? "unknown";
    if (attempt > 1 && String(status) === "409") return;
    if (attempt >= attempts) {
      throw new Error(
        `Upload ${objectPath} failed after ${attempts} attempts: ${error.message} (status ${status})`,
      );
    }
    console.warn(
      `Upload ${objectPath} attempt ${attempt} failed: ${error.message} (status ${status}); retrying...`,
    );
    await new Promise((resolve) => setTimeout(resolve, attempt * 2000));
  }
}

// Args are relative paths run with cwd=WORK_DIR so tippecanoe's embedded
// generator_options metadata stays machine-independent (determinism).
// name is "world" or a shard key; spec carries that archive's min/max zoom.
// Zoom-dependent detail, applied uniformly to EVERY country.
//
// The geometry we store is parcel-accurate (German Einzellagen especially), and
// showing that at z4 looked like static — hundreds of hairline slivers. But we
// want the detail when you zoom in. That is exactly what tippecanoe's
// per-zoom Douglas-Peucker pass is for, and we were not using it:
//
//   --simplification=N  multiplies the simplification tolerance at every zoom
//                       BELOW maxzoom. Full source detail survives at maxzoom,
//                       and shapes get progressively cleaner as you zoom out.
//   --detail / -d       tile grid resolution; the default 12 quantises
//                       coordinates enough to shed sub-pixel wobble.
//
// This is deliberately a GENERAL change rather than a Germany patch: France's
// climats and Spain's DOs get the same treatment, so the whole map reads the
// same way. Tune SIMPLIFICATION alone to trade crispness against clutter.
export const SIMPLIFICATION = 6;

export function tippecanoeArgs(name, spec) {
  return [
    "-o", `${name}.pmtiles`, "--force", `-Z${spec.minZoom}`, `-z${spec.maxZoom}`, "-r1",
    `--simplification=${SIMPLIFICATION}`,
    // Keep tiny polygons as polygons rather than letting them collapse to
    // nothing at low zoom — a vineyard that vanishes is worse than a coarse one.
    "--no-tiny-polygon-reduction",
    "--no-progress-indicator",
    "-L", `places:${name}-places.geojson`,
    "-L", `labels:${name}-labels.geojson`,
  ];
}

export function expectedIdSets(release) {
  const world = new Set(release.world.place_ids);
  const shards = {};
  for (const [key, shard] of Object.entries(release.shards)) {
    shards[key] = new Set(shard.place_ids);
  }
  return { world, shards };
}

// Minimal pmtiles Source over a local file (the npm package's own sources
// are fetch/browser oriented).
export class NodeFileSource {
  constructor(filePath) {
    this.filePath = filePath;
  }
  getKey() {
    return this.filePath;
  }
  async getBytes(offset, length) {
    const { open } = await import("node:fs/promises");
    const handle = await open(this.filePath);
    try {
      const buffer = Buffer.alloc(length);
      const { bytesRead } = await handle.read(buffer, 0, length, offset);
      return {
        data: buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + bytesRead),
      };
    } finally {
      await handle.close();
    }
  }
}

export async function decodeTileFeatures(tileData) {
  const { VectorTile } = await import("@mapbox/vector-tile");
  const { PbfReader } = await import("pbf");
  const tile = new VectorTile(new PbfReader(new Uint8Array(tileData)));
  const byLayer = {};
  for (const [layerName, layer] of Object.entries(tile.layers)) {
    byLayer[layerName] = [];
    for (let i = 0; i < layer.length; i += 1) {
      byLayer[layerName].push(layer.feature(i).properties);
    }
  }
  return byLayer;
}
