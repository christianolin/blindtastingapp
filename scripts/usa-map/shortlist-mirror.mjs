// A mirror of src/lib/grape-shortlist.ts compute(), for the spec §10.3
// before/after comparison (plan 2026-09-29-usa-wine-map-us2 Task 13): which
// grapes the guess ladder offers for a scoring region, and whether they come
// from the map or from the curated region_grapes fallback. The app's module is
// a "use server" file that needs a Next request, so it cannot run here; this
// follows it step by step:
//   1. a region linked through regions.wine_place_id uses that place, when a
//      signed-in reader can see it;
//   2. otherwise candidates are places of kind MACRO_REGION/REGION/SUBREGION
//      (never COUNTRY) whose folded name equals the region's, plus alias
//      matches; the match is the first whose COUNTRY ancestor's folded name
//      equals the scoring country's (or has no COUNTRY ancestor);
//   3. the place and its descendants (children by name, level by level, depth < 8);
//   4. published grape links counted per grape, PRINCIPAL before ACCESSORY,
//      most-linked first. THE ONE DIFFERENCE: the mirror breaks count ties by
//      grape name; the app keeps the order the rows arrived in. The owner-review
//      file says so;
//   5. no match, or no grapes: region_grapes, PRINCIPAL first, then name.
// readShortlist reads through RLS exactly as the app does: run it as
// `authenticated` (us2-checks.mjs's asAuthenticated).

const REGION_KINDS = new Set(["COUNTRY", "MACRO_REGION", "REGION", "SUBREGION"]);

// src/lib/deaccent.ts, verbatim in behaviour.
const LIGATURES = { ø: "o", Ø: "O", æ: "ae", Æ: "AE", œ: "oe", Œ: "OE", ß: "ss", đ: "d", Đ: "D", ð: "d", Ð: "D", ł: "l", Ł: "L", þ: "th", Þ: "TH" };
export function deaccent(value) {
  return value.normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/[øØæÆœŒßđĐðÐłŁþÞ]/g, (ch) => LIGATURES[ch] ?? ch);
}
export const fold = (name) => deaccent(String(name ?? "")).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

function countryNameOf(place, byId) {
  let cur = place;
  for (let i = 0; cur && i < 12; i += 1) {
    if (cur.kind === "COUNTRY") return cur.name;
    cur = cur.primary_parent_id ? byId.get(cur.primary_parent_id) : undefined;
  }
  return null;
}

/**
 * Pure. places: every place a reader sees ({id, name, kind, primary_parent_id});
 * aliases: [{wine_place_id, name, normalized_name}]; links: [{grape_id, role,
 * wine_place_id}]; regionGrapes: [{grape_id, role}] of this region;
 * grapeName: Map id -> name. Returns { source, placeName, grapes: names }.
 */
export function shortlistFromRows({
  regionName, countryName, linkedPlaceId = null, places, aliases = [], links, regionGrapes, grapeName,
}) {
  const byId = new Map(places.map((p) => [p.id, p]));
  const nameOf = (id) => grapeName.get(id) ?? id;
  const fallback = () => {
    if (regionGrapes.length === 0) return { source: "none", placeName: null, grapes: [] };
    const ids = [...regionGrapes].sort((a, b) => (a.role === b.role ? 0 : a.role === "PRINCIPAL" ? -1 : 1)
      || nameOf(a.grape_id).localeCompare(nameOf(b.grape_id)));
    return { source: "region_grapes", placeName: regionName, grapes: ids.map((r) => nameOf(r.grape_id)) };
  };

  let match = linkedPlaceId ? byId.get(linkedPlaceId) ?? null : null;
  if (!match) {
    const wanted = fold(regionName);
    const wantedCountry = countryName ? fold(countryName) : null;
    const candidates = new Set();
    for (const p of places) {
      if (REGION_KINDS.has(p.kind) && p.kind !== "COUNTRY" && fold(p.name) === wanted) candidates.add(p.id);
    }
    for (const a of aliases) {
      if (fold(a.name) === wanted || fold(a.normalized_name) === wanted) {
        const p = byId.get(a.wine_place_id);
        if (p && REGION_KINDS.has(p.kind) && p.kind !== "COUNTRY") candidates.add(p.id);
      }
    }
    match = [...candidates].map((id) => byId.get(id)).find((p) => {
      const c = countryNameOf(p, byId);
      return wantedCountry == null || c == null || fold(c) === wantedCountry;
    }) ?? null;
  }
  if (!match) return fallback();

  const childrenOf = new Map();
  for (const p of places) {
    if (!p.primary_parent_id) continue;
    if (!childrenOf.has(p.primary_parent_id)) childrenOf.set(p.primary_parent_id, []);
    childrenOf.get(p.primary_parent_id).push(p);
  }
  const ids = new Set([match.id]);
  let frontier = [match.id];
  for (let depth = 0; depth < 8 && frontier.length > 0; depth += 1) {
    const next = frontier.flatMap((id) => childrenOf.get(id) ?? [])
      .sort((a, b) => a.name.localeCompare(b.name)).map((c) => c.id).filter((id) => !ids.has(id));
    for (const id of next) ids.add(id);
    frontier = next;
  }

  const principal = new Map();
  const accessory = new Map();
  for (const l of links) {
    if (!ids.has(l.wine_place_id)) continue;
    const bucket = l.role === "PRINCIPAL" ? principal : accessory;
    bucket.set(l.grape_id, (bucket.get(l.grape_id) ?? 0) + 1);
  }
  const byCount = (m) => [...m.entries()].sort((a, b) => b[1] - a[1] || nameOf(a[0]).localeCompare(nameOf(b[0])))
    .map(([id]) => id);
  const grapeIds = byCount(principal);
  for (const id of byCount(accessory)) if (!grapeIds.includes(id)) grapeIds.push(id);
  if (grapeIds.length === 0) return fallback();
  return { source: "map", placeName: match.name, grapes: grapeIds.map(nameOf) };
}

/** Read the inputs through RLS (run as authenticated) and compute one region's shortlist. */
export async function readShortlist(client, regionName, countryName = "United States") {
  const { rows: regions } = await client.query(
    `select r.id, r.name, r.wine_place_id, c.name country
       from public.regions r join public.countries c on c.id = r.country_id
      where r.name = $1 and c.name = $2`, [regionName, countryName]);
  if (regions.length !== 1) throw new Error(`${regionName} (${countryName}): ${regions.length} scoring regions`);
  const region = regions[0];
  const { rows: places } = await client.query(
    "select id::text, name, kind::text, primary_parent_id::text from public.wine_places");
  const { rows: aliases } = await client.query(
    "select wine_place_id::text, name, normalized_name from public.wine_place_aliases");
  const { rows: links } = await client.query(
    "select grape_id::text, role::text, wine_place_id::text from public.wine_place_grapes");
  const { rows: regionGrapes } = await client.query(
    "select grape_id::text, role::text from public.region_grapes where region_id = $1", [region.id]);
  const { rows: grapes } = await client.query("select id::text, name from public.grapes");
  return shortlistFromRows({
    regionName: region.name, countryName: region.country, linkedPlaceId: region.wine_place_id,
    places, aliases, links, regionGrapes, grapeName: new Map(grapes.map((g) => [g.id, g.name])),
  });
}
