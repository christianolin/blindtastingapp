// The checks rehearse-us3.mjs (one rolled-back transaction) and
// check-us3-live.mjs (read only) share, so each sitting checks exactly what
// its rehearsal proved. Every function writes nothing.
import { asAuthenticated } from "./us2-checks.mjs";
import { CA_KEY } from "./us3-wave.mjs";

const C = `${CA_KEY}.`;
const k = (tail) => C + tail;
const CA = (a) => `(${a}.canonical_key = '${CA_KEY}' or ${a}.canonical_key like '${CA_KEY}.%')`;

// §8.7: the nearby lists the main session accepts, per batch.
export const NEARBY_KEYS = Object.freeze({
  core: ["north-coast.northern-sonoma.russian-river-valley", "north-coast.los-carneros", "north-coast.napa-valley.oakville",
    "north-coast.northern-sonoma.russian-river-valley.green-valley-of-russian-river-valley",
    "central-coast.santa-ynez-valley.sta-rita-hills", "central-coast.paso-robles.paso-robles-willow-creek-district",
    "central-coast.monterey.santa-lucia-highlands", "central-valley.lodi"].map(k),
  rest: ["north-coast.cole-ranch", "central-coast.san-benito.cienega-valley", "central-valley.clarksburg", "cucamonga-valley"].map(k),
});
// §15 US-3: a click on these selects them, not a container (smallest area wins).
export const CLICK_KEYS = Object.freeze({
  core: ["north-coast.napa-valley.oakville", "north-coast.napa-valley.rutherford",
    "north-coast.napa-valley.stags-leap-district", "north-coast.los-carneros"].map(k),
  rest: ["north-coast.cole-ranch", "central-coast.san-benito.cienega-valley.lime-kiln-valley"].map(k),
});
// Children the details panel lists (VERIFIED only) after each batch.
export const CHILDREN = Object.freeze({
  core: { [k("north-coast")]: 13, [k("north-coast.napa-valley")]: 15, [k("central-coast.paso-robles")]: 11,
    [k("central-valley.lodi")]: 7, [k("central-coast.santa-ynez-valley")]: 4, [k("central-valley")]: 1 },
  rest: { [k("north-coast")]: 22, [k("central-valley")]: 11, [k("central-coast.monterey")]: 5, [k("central-valley.clarksburg")]: 1 },
});
// The relationships §15 US-3 names (plan decision 3 for Russian River Valley).
export const EXPECTED_EDGES = Object.freeze({
  core: [
    { type: "OVERLAPS", source: k("north-coast.northern-sonoma.russian-river-valley"), target: k("north-coast.sonoma-coast") },
    { type: "ALTERNATE_PARENT", source: k("north-coast.northern-sonoma.russian-river-valley.green-valley-of-russian-river-valley"), target: k("north-coast.sonoma-coast") },
    { type: "ALTERNATE_PARENT", source: k("el-dorado.fair-play"), target: k("sierra-foothills") },
    { type: "OVERLAPS", source: k("north-coast.los-carneros"), target: k("north-coast.napa-valley") },
    { type: "OVERLAPS", source: k("north-coast.los-carneros"), target: k("north-coast.sonoma-coast") },
    { type: "OVERLAPS", source: k("north-coast.los-carneros"), target: k("north-coast.sonoma-valley") },
  ],
  rest: [
    { type: "OVERLAPS", source: k("north-coast.wild-horse-valley"), target: k("north-coast.solano-county-green-valley") },
  ],
});

/** get_wine_place_context per key, as a signed-in reader. */
export async function placeDetails(client, keys) {
  return asAuthenticated(client, async () => {
    const out = {};
    for (const key of keys) {
      const ctx = (await client.query("select public.get_wine_place_context($1) ctx", [key])).rows[0].ctx;
      out[key] = ctx === null ? null : {
        article: Boolean(ctx.article && ctx.article.description),
        grapes: (ctx.grapes ?? []).length,
        styles: (ctx.styles ?? []).length,
        children: (ctx.children ?? []).length,
        ancestors: (ctx.ancestors ?? []).map((a) => a.key),
        nearby: (ctx.nearby ?? []).map((x) => x.key),
      };
    }
    return out;
  });
}

/** Every relationship with an endpoint under California. */
export async function caRelationships(client) {
  return (await client.query(
    `select r.relationship_type::text type, s.canonical_key source, t.canonical_key target
       from public.wine_place_relationships r
       join public.wine_places s on s.id = r.source_place_id join public.wine_places t on t.id = r.target_place_id
      where ${CA("s")} or ${CA("t")} order by 2, 3, 1`)).rows;
}

/** For each key: the smallest-area current VERIFIED shape covering its label point (the map's click rule). */
export async function clickResolution(client, keys) {
  return (await client.query(
    `select k.key,
            (select p2.canonical_key from public.wine_places p2
               join public.wine_place_boundaries b2 on b2.wine_place_id = p2.id and b2.is_current
              where p2.publication_status = 'VERIFIED' and extensions.ST_Covers(b2.display_geometry, b.label_point)
              order by extensions.ST_Area(b2.display_geometry) limit 1) resolved
       from unnest($1::text[]) k(key)
       join public.wine_places p on p.canonical_key = k.key
       join public.wine_place_boundaries b on b.wine_place_id = p.id and b.is_current
      order by k.key`, [keys])).rows;
}

/** The batch's state, and California's. */
export async function batchFacts(client, wave) {
  const keys = wave.places.map((p) => p.key);
  const n = async (sql, params = []) => Number((await client.query(sql, params)).rows[0].n);
  const onKeys = "from public.wine_place_boundaries b join public.wine_places p on p.id = b.wine_place_id where p.canonical_key = any($1::text[])";
  return {
    places: await n("select count(*) n from public.wine_places where canonical_key = any($1::text[])", [keys]),
    verified: await n("select count(*) n from public.wine_places where canonical_key = any($1::text[]) and publication_status = 'VERIFIED'", [keys]),
    locked: await n("select count(*) n from public.wine_places where canonical_key = any($1::text[]) and canonical_key_locked_at is not null", [keys]),
    current_validated: await n(`select count(*) n ${onKeys} and b.is_current and b.quality_status = 'VALIDATED'`, [keys]),
    draft_boundaries: await n(`select count(*) n ${onKeys} and b.quality_status = 'DRAFT'`, [keys]),
    ca_live: await n(`select count(*) n from public.wine_places p join public.wine_place_boundaries b on b.wine_place_id = p.id
      where ${CA("p")} and p.publication_status = 'VERIFIED' and b.is_current and b.quality_status = 'VALIDATED'`),
    ca_relationships: await n(`select count(*) n from public.wine_place_relationships r
      join public.wine_places s on s.id = r.source_place_id join public.wine_places t on t.id = r.target_place_id
      where ${CA("s")} or ${CA("t")}`),
    us_outline: await n(`select count(*) n from public.wine_place_boundaries b join public.wine_places p on p.id = b.wine_place_id
      where (p.canonical_key = 'united-states' or p.canonical_key like 'united-states.%')
        and b.is_current and b.generation_parameters->>'display' = 'outline'`),
    fresh: (await client.query("select fresh from public.wine_place_neighbours_state")).rows[0].fresh,
  };
}

/** The promoted state each batch must reach (rehearsal and live check alike). */
export const promotedFacts = (wave) => ({
  places: wave.places.length, verified: wave.places.length, locked: wave.places.length,
  current_validated: wave.places.length, draft_boundaries: 0,
  ca_live: wave.after.caPlaces, ca_relationships: wave.after.caEdges, us_outline: 11, fresh: true,
});
