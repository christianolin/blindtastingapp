#!/usr/bin/env node
// Demo people (demo.*@blindr.invalid) and two fully revealed, closed demo
// tastings, so the People directory and profile stats have real content.
// Persistent seed data (CLAUDE.md): this script never deletes a row it did not
// create in the same run.
//
// Usage, from the repo root:
//   node --env-file=.env.local scripts/seed-demo-people.mjs --plan   resolve and print; writes nothing
//   node --env-file=.env.local scripts/seed-demo-people.mjs          resolve, then write
// Needs NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY.
//
// 1. Resolve (both modes, read-only). Every reference is found by EXACT name
//    inside its parent: the country; the region within that country; the
//    appellation within that region (live names carry their designation suffix,
//    e.g. "Pauillac AOC"); the producer by exact name, which must be linked to
//    that region (find_producer_by_folded_name only feeds the error hint); grapes
//    and type designations (active ones) by exact name. Each seed wine must be complete by the rule in
//    src/lib/wine-identity/complete.ts, and then either matches a live catalog
//    wine on the catalog_wines_identity_key columns (and must agree with it on
//    country, region, grapes, style and type designation; the seed never edits an
//    existing catalog row) or is marked "to create". Any problem
//    aborts the run before a single write.
// 2. Write (default mode):
//    a. People. An auth user is created only when no user has the email (no
//       password; handle_new_user makes the profiles row). An existing person is
//       never recreated or overwritten: only public profile fields that are still
//       null get the seed value. phone is private and never seeded.
//    b. Catalog wines "to create", written AS THE HOST through
//       find_or_create_catalog_wine, the RPC upsertCatalogWine calls
//       (src/lib/wine-identity/server/write.ts). The RPC sets created_by =
//       auth.uid(); the catalog_wines_seed_grapes trigger writes the blend rows.
//    c. Each tasting not already present by name + host: inserted IN_PROGRESS
//       (reveal_wine refuses CLOSED tastings), participants JOINED, glasses whose
//       wine_answers are copied from the linked catalog wine with catalog_wine_id
//       set (as insertGlassFromCatalogWine does; wine_answers_one_identity), locked
//       guesses through the service role (a HOST_PROVIDES host never guesses),
//       every glass revealed by the HOST through reveal_wine while signed in with
//       a magic link + verifyOtp (never a password), then CLOSED. started_at,
//       finished_at and revealed_at are trigger-owned and never written. If
//       anything fails once the tasting row exists, that tasting (only that one,
//       created in this run) is deleted before rethrowing, so a rerun never skips
//       a half-made tasting.
import { createClient } from "@supabase/supabase-js";

const args = process.argv.slice(2);
const PLAN_ONLY = args.includes("--plan");
const strayArgs = args.filter((arg) => arg !== "--plan");
if (strayArgs.length > 0) {
  console.error(`Unknown argument(s): ${strayArgs.join(" ")}. Pass --plan, or nothing to write.`);
  process.exit(2);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !anonKey || !serviceRole) {
  console.error(
    "Set NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY (node --env-file=.env.local).",
  );
  process.exit(1);
}

const admin = createClient(url, serviceRole, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ---------------------------------------------------------------------------
// Seed list
// ---------------------------------------------------------------------------

/** profiles.favorite_wine_type stores a FAVORITE_WINE_TYPE_ITEMS key (src/lib/wine-types.ts). */
const FAVORITE_WINE_TYPES = new Set(["RED", "WHITE", "ROSE", "SPARKLING", "ORANGE", "FORTIFIED", "DESSERT"]);
const WINE_COLOURS = new Set(["RED", "WHITE", "ROSE", "ORANGE"]);
const WINE_STYLES = new Set(["STILL", "SPARKLING", "SWEET", "FORTIFIED"]);
const DEMO_EMAIL = /^demo\.[a-z]+@blindr\.invalid$/;
const PUBLIC_PROFILE_FIELDS = ["display_name", "bio", "location", "favorite_wine_type"];

/** Public profile fields only. phone is private (CLAUDE.md) and never seeded. */
const PEOPLE = [
  {
    key: "isabelle",
    email: "demo.isabelle@blindr.invalid",
    display_name: "Isabelle Moreau",
    bio: "Burgundy obsessive. Mediocre at guessing vintages.",
    location: "Beaune, France",
    favorite_wine_type: "RED",
  },
  {
    key: "marcus",
    email: "demo.marcus@blindr.invalid",
    display_name: "Marcus Chen",
    bio: "New World enthusiast — can smell an oaked Chardonnay across the room.",
    location: "San Francisco, USA",
    favorite_wine_type: "WHITE",
  },
  {
    key: "sofia",
    email: "demo.sofia@blindr.invalid",
    display_name: "Sofia Andersen",
    bio: "Here for the cheese, staying for the wine.",
    location: "Copenhagen, Denmark",
    favorite_wine_type: "SPARKLING",
  },
  {
    key: "diego",
    email: "demo.diego@blindr.invalid",
    display_name: "Diego Fernandez",
    bio: "Rioja or nothing.",
    location: "Logroño, Spain",
    favorite_wine_type: "RED",
  },
  {
    key: "priya",
    email: "demo.priya@blindr.invalid",
    display_name: "Priya Sharma",
    bio: "Still learning to spit instead of swallow.",
    location: "London, United Kingdom",
    favorite_wine_type: "ROSE",
  },
];

// Every name is the exact live spelling (checked read-only on 2026-09-13).
// `grapes` is the blend in order: primary, then secondary, i.e. the two largest
// shares of that vintage's published blend. `typeDesignation` is REQUIRED on
// every wine: an exact live type_designations name, or null for none. It is part
// of the answer key (2 pts when the wine has one) and a matched catalog wine
// must carry the same one. The live vocabulary's "Grand Cru Classé" is an estate
// classified under a Bordeaux classification (its description names 1855);
// "Premier Grand Cru Classé" is Saint-Émilion's top rank only; Pomerol has no
// classification. `vintage` is a year, or { kind: "NV" } / { kind: "TAWNY", years }.
const WINES = {
  // 1855 second growth. 2016: 85% Cabernet Sauvignon, 15% Merlot.
  pichonBaron2016: {
    country: "France", region: "Bordeaux", appellation: "Pauillac AOC",
    producer: "Chateau Pichon Baron", wineName: null, typeDesignation: "Grand Cru Classé",
    grapes: ["Cabernet Sauvignon", "Merlot"], vintage: 2016, colour: "RED", style: "STILL",
  },
  // Unclassified Pomerol. Links the existing catalog wine (no designation).
  laFleurPetrus2009: {
    country: "France", region: "Bordeaux", appellation: "Pomerol AOC",
    producer: "Chateau La Fleur-Petrus", wineName: null, typeDesignation: null,
    grapes: ["Merlot", "Cabernet Franc"], vintage: 2009, colour: "RED", style: "STILL",
  },
  // 1855 second growth. 2018: 56% Cabernet Sauvignon, 40% Merlot, 2% Petit Verdot, 2% Cabernet Franc.
  rauzanSegla2018: {
    country: "France", region: "Bordeaux", appellation: "Margaux AOC",
    producer: "Chateau Rauzan-Segla", wineName: null, typeDesignation: "Grand Cru Classé",
    grapes: ["Cabernet Sauvignon", "Merlot"], vintage: 2018, colour: "RED", style: "STILL",
  },
  // 1855 Sauternes first growth. 2015: 94% Sémillon, 6% Sauvignon Blanc.
  suduiraut2015: {
    country: "France", region: "Bordeaux", appellation: "Sauternes AOC",
    producer: "Chateau Suduiraut", wineName: null, typeDesignation: "Grand Cru Classé",
    grapes: ["Semillon", "Sauvignon Blanc"], vintage: 2015, colour: "WHITE", style: "SWEET",
  },
  // 2017: 80% Cabernet Sauvignon, 9% Petit Verdot, 5% Cabernet Franc, 5% Merlot, 1% Malbec.
  opusOne2017: {
    country: "United States", region: "California", appellation: "Napa Valley AVA",
    producer: "Opus One", wineName: null, typeDesignation: null,
    grapes: ["Cabernet Sauvignon", "Petit Verdot"], vintage: 2017, colour: "RED", style: "STILL",
  },
  // 100% Shiraz (live grape name Syrah).
  torbreckTheFactor2017: {
    country: "Australia", region: "South Australia", appellation: "Barossa Valley GI",
    producer: "Torbreck", wineName: "The Factor", typeDesignation: null,
    grapes: ["Syrah"], vintage: 2017, colour: "RED", style: "STILL",
  },
  // 100% Sauvignon Blanc.
  cloudyBay2022: {
    country: "New Zealand", region: "Marlborough", appellation: "Marlborough GI",
    producer: "Cloudy Bay", wineName: "Sauvignon Blanc", typeDesignation: null,
    grapes: ["Sauvignon Blanc"], vintage: 2022, colour: "WHITE", style: "STILL",
  },
  // WO Simonsberg-Stellenbosch, the ward on the label (not the Stellenbosch
  // district). 2015: 70% Cabernet Sauvignon, 15% Merlot, 15% Cabernet Franc.
  kanonkopPaulSauer2015: {
    country: "South Africa", region: "Coastal Region", appellation: "Simonsberg-Stellenbosch WO",
    producer: "Kanonkop", wineName: "Paul Sauer", typeDesignation: null,
    grapes: ["Cabernet Sauvignon", "Cabernet Franc"], vintage: 2015, colour: "RED", style: "STILL",
  },
};

/** One guess, read like a table row. Pass null for a field left blank (every
    guess field is optional). `grapes` holds at most a primary and a secondary;
    `designation` is an exact live type_designations name, or left out. */
function guess(country, region, appellation, producer, grapes, vintage, designation = null) {
  return { country, region, appellation, producer, grapes, vintage, designation };
}

const TASTINGS = [
  {
    name: "Bordeaux Classics",
    description: "A Pauillac, a Pomerol, a Margaux and a Sauternes to finish, poured blind.",
    host: "isabelle",
    guests: ["marcus", "diego", "sofia"],
    timingMode: "ASYNC",
    wineSource: "HOST_PROVIDES",
    revealMode: "BLIND",
    glasses: [
      {
        wine: WINES.pichonBaron2016,
        guesses: {
          marcus: guess("France", "Bordeaux", "Pauillac AOC", "Chateau Pontet-Canet", ["Cabernet Sauvignon", "Merlot"], 2015, "Grand Cru Classé"),
          diego: guess("France", "Bordeaux", "Saint-Julien AOC", "Chateau Leoville Barton", ["Cabernet Sauvignon"], 2014, "Grand Cru Classé"),
          sofia: guess("France", "Bordeaux", "Margaux AOC", null, ["Merlot", "Cabernet Sauvignon"], 2016),
        },
      },
      {
        wine: WINES.laFleurPetrus2009,
        guesses: {
          marcus: guess("France", "Bordeaux", "Saint-Émilion Grand Cru AOC", "Chateau Pavie", ["Merlot", "Cabernet Franc"], 2010),
          diego: guess("France", "Bordeaux", "Pomerol AOC", "Petrus", ["Merlot"], 2009),
          sofia: guess("Spain", "Rioja", null, null, ["Tempranillo"], 2009),
        },
      },
      {
        wine: WINES.rauzanSegla2018,
        guesses: {
          marcus: guess("United States", "California", "Napa Valley AVA", "Opus One", ["Cabernet Sauvignon", "Merlot"], 2018),
          diego: guess("France", "Bordeaux", "Margaux AOC", "Chateau Rauzan-Segla", ["Cabernet Sauvignon", "Merlot"], 2016, "Grand Cru Classé"),
          sofia: guess("France", "Bordeaux", "Haut-Médoc AOC", null, ["Cabernet Sauvignon"], 2017),
        },
      },
      {
        wine: WINES.suduiraut2015,
        guesses: {
          marcus: guess("France", "Bordeaux", "Sauternes AOC", "Chateau Guiraud", ["Semillon", "Sauvignon Blanc"], 2015, "Grand Cru Classé"),
          diego: guess("France", "Bordeaux", "Barsac AOC", null, ["Semillon"], 2011),
          sofia: guess("France", "Bordeaux", "Sauternes AOC", "Chateau Suduiraut", ["Semillon", "Sauvignon Blanc"], 2014, "Grand Cru Classé"),
        },
      },
    ],
  },
  {
    name: "New World Nights",
    description: "Napa, Barossa, Marlborough and Stellenbosch, poured blind.",
    host: "marcus",
    guests: ["isabelle", "diego", "priya"],
    timingMode: "ASYNC",
    wineSource: "HOST_PROVIDES",
    revealMode: "BLIND",
    glasses: [
      {
        wine: WINES.opusOne2017,
        guesses: {
          isabelle: guess("United States", "California", "Napa Valley AVA", "Opus One", ["Cabernet Sauvignon", "Petit Verdot"], 2016),
          diego: guess("United States", "California", "Napa Valley AVA", "Stag's Leap Wine Cellars", ["Cabernet Sauvignon"], 2017),
          priya: guess("France", "Bordeaux", "Pauillac AOC", null, ["Cabernet Sauvignon", "Merlot"], 2015),
        },
      },
      {
        wine: WINES.torbreckTheFactor2017,
        guesses: {
          isabelle: guess("Australia", "South Australia", "Barossa Valley GI", "Penfolds", ["Syrah"], 2017),
          diego: guess("France", "Rhône", null, null, ["Syrah"], 2018),
          priya: guess("Australia", "South Australia", "McLaren Vale GI", "Two Hands", ["Syrah", "Grenache"], 2019),
        },
      },
      {
        wine: WINES.cloudyBay2022,
        guesses: {
          isabelle: guess("New Zealand", "Marlborough", "Marlborough GI", "Cloudy Bay", ["Sauvignon Blanc"], 2022),
          diego: guess("France", "Bordeaux", "Entre-Deux-Mers AOC", null, ["Sauvignon Blanc", "Semillon"], 2021),
          priya: guess("New Zealand", "Marlborough", "Marlborough GI", null, ["Sauvignon Blanc"], 2020),
        },
      },
      {
        wine: WINES.kanonkopPaulSauer2015,
        guesses: {
          isabelle: guess("South Africa", "Coastal Region", "Simonsberg-Stellenbosch WO", null, ["Cabernet Sauvignon", "Merlot"], 2014),
          diego: guess("Argentina", "Mendoza", "Mendoza", "Catena Zapata", ["Malbec"], 2015),
          priya: guess("South Africa", "Coastal Region", "Stellenbosch WO", "Kanonkop", ["Cabernet Sauvignon", "Cabernet Franc"], 2016),
        },
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const problems = [];
const memoised = new Map();

function memo(key, load) {
  if (!memoised.has(key)) memoised.set(key, load());
  return memoised.get(key);
}

function check(error, what) {
  if (error) throw new Error(`${what} failed: ${error.message}`);
}

async function rowsWhere(table, columns, filters, what) {
  let query = admin.from(table).select(columns);
  for (const [column, value] of Object.entries(filters)) query = query.eq(column, value);
  const { data, error } = await query.limit(2);
  check(error, what);
  return data ?? [];
}

const VINTAGE_YEAR_MIN = 1900;
const VINTAGE_YEAR_MAX = new Date().getUTCFullYear() + 1;

/** The seed's vintage as the CompleteVintage shape, or null when it is not a valid one. */
function toVintage(value) {
  if (typeof value === "number") {
    return Number.isInteger(value) && value >= VINTAGE_YEAR_MIN && value <= VINTAGE_YEAR_MAX
      ? { kind: "YEAR", year: value, tawnyYears: null }
      : null;
  }
  if (value?.kind === "NV") return { kind: "NV", year: null, tawnyYears: null };
  if (value?.kind === "TAWNY") {
    return Number.isInteger(value.years) && value.years >= 1 && value.years <= 100
      ? { kind: "TAWNY", year: null, tawnyYears: value.years }
      : null;
  }
  return null;
}

function vintageText(vintage) {
  if (!vintage) return "-";
  if (vintage.kind === "YEAR") return String(vintage.year);
  if (vintage.kind === "NV") return "NV";
  return `${vintage.tawnyYears}-year tawny`;
}

/** coalesce(lower(btrim(wine_name)), ''), the name half of catalog_wines_identity_key. */
function identityName(name) {
  return (name ?? "").replace(/^ +| +$/g, "").toLowerCase();
}

function ref(row) {
  return row ? `${row.name} [${row.id}]` : "?";
}

function pad(text, width) {
  return String(text).padEnd(width);
}

// ---------------------------------------------------------------------------
// Exact reference lookups (read-only)
// ---------------------------------------------------------------------------

const countryNamed = (name) =>
  memo(`country:${name}`, async () => {
    const rows = await rowsWhere("countries", "id, name", { name }, `country "${name}"`);
    return rows.length === 1 ? { row: rows[0] } : { problem: `country "${name}" does not exist (exact name)` };
  });

const regionNamed = (country, name) =>
  memo(`region:${country.id}:${name}`, async () => {
    const rows = await rowsWhere("regions", "id, name, country_id", { country_id: country.id, name }, `region "${name}"`);
    return rows.length === 1
      ? { row: rows[0] }
      : { problem: `region "${name}" does not exist in ${country.name} (exact name)` };
  });

const appellationNamed = (region, name) =>
  memo(`appellation:${region.id}:${name}`, async () => {
    const rows = await rowsWhere("appellations", "id, name, region_id", { region_id: region.id, name }, `appellation "${name}"`);
    return rows.length === 1
      ? { row: rows[0] }
      : { problem: `appellation "${name}" does not exist in region ${region.name} (exact name, designation suffix included)` };
  });

const grapeNamed = (name) =>
  memo(`grape:${name}`, async () => {
    const rows = await rowsWhere("grapes", "id, name", { name }, `grape "${name}"`);
    return rows.length === 1 ? { row: rows[0] } : { problem: `grape "${name}" does not exist (exact name)` };
  });

/** type_designations.name is unique. Only active rows count: the answer-key and
    guess pickers offer `is_active` designations only. */
const typeDesignationNamed = (name) =>
  memo(`designation:${name}`, async () => {
    const rows = await rowsWhere(
      "type_designations", "id, name, country_id, region_id, is_active", { name }, `type designation "${name}"`,
    );
    if (rows.length !== 1) return { problem: `type designation "${name}" does not exist (exact name)` };
    if (!rows[0].is_active) return { problem: `type designation "${name}" is inactive; the pickers offer active ones only` };
    return { row: rows[0] };
  });

const designationLabel = (id) =>
  memo(`designationLabel:${id}`, async () => {
    if (!id) return "none";
    const [row] = await rowsWhere("type_designations", "id, name", { id }, "type designation label");
    return row ? `"${row.name}"` : `unknown designation ${id}`;
  });

const regionLabel = (regionId) =>
  memo(`regionLabel:${regionId}`, async () => {
    if (!regionId) return "no region";
    const { data, error } = await admin.from("regions").select("name, countries(name)").eq("id", regionId).maybeSingle();
    check(error, "region label");
    return data ? `${data.name} (${data.countries?.name ?? "?"})` : `region ${regionId}`;
  });

/** producers.name is unique, so the exact read finds at most one row; it must be
    linked to the region. find_producer_by_folded_name only feeds the error hint:
    its row is never used, because a row whose name is exactly the one asked for
    and whose region matches is what the exact read already looked for. */
const producerNamed = (region, name) =>
  memo(`producer:${region.id}:${name}`, async () => {
    const rows = await rowsWhere("producers", "id, name, region_id", { name }, `producer "${name}"`);
    if (rows.length === 1 && rows[0].region_id === region.id) return { row: rows[0] };
    if (rows.length === 1) {
      return {
        problem: `producer "${name}" exists but is linked to ${await regionLabel(rows[0].region_id)}, not ${region.name}`,
      };
    }
    const { data: nearId, error } = await admin.rpc("find_producer_by_folded_name", {
      p_name: name,
      p_region_id: region.id,
    });
    check(error, "find_producer_by_folded_name");
    let hint = "";
    if (nearId) {
      const [near] = await rowsWhere("producers", "id, name, region_id", { id: nearId }, "producer hint");
      if (near) hint = `; the closest folded spelling is "${near.name}" in ${await regionLabel(near.region_id)}`;
    }
    return { problem: `producer "${name}" does not exist in ${region.name} (exact name)${hint}` };
  });

async function resolvePlace(spec, where) {
  const place = { country: null, region: null, appellation: null, producer: null };
  const take = async (lookup, field) => {
    const found = await lookup;
    if (found.problem) problems.push(`${where}: ${found.problem}`);
    else place[field] = found.row;
  };
  if (spec.country) await take(countryNamed(spec.country), "country");
  if (spec.region) {
    if (!spec.country) problems.push(`${where}: region "${spec.region}" is given without its country`);
    else if (place.country) await take(regionNamed(place.country, spec.region), "region");
  }
  if (spec.appellation) {
    if (!spec.region) problems.push(`${where}: appellation "${spec.appellation}" is given without its region`);
    else if (place.region) await take(appellationNamed(place.region, spec.appellation), "appellation");
  }
  if (spec.producer) {
    if (!spec.region) problems.push(`${where}: producer "${spec.producer}" is given without a region to find it in`);
    else if (place.region) await take(producerNamed(place.region, spec.producer), "producer");
  }
  return place;
}

async function resolveGrapes(names, where, max = Infinity) {
  const list = names ?? [];
  if (list.length > max) problems.push(`${where}: ${list.length} grapes given; a guess holds a primary and a secondary only`);
  const grapes = [];
  for (const name of list.slice(0, max)) {
    const found = await grapeNamed(name);
    if (found.problem) {
      problems.push(`${where}: ${found.problem}`);
    } else if (grapes.some((grape) => grape.id === found.row.id)) {
      problems.push(`${where}: grape "${name}" is listed twice`);
    } else {
      grapes.push(found.row);
    }
  }
  return grapes;
}

// ---------------------------------------------------------------------------
// Catalog identity (read-only)
// ---------------------------------------------------------------------------

const CATALOG_COLUMNS =
  "id, wine_name, country_id, region_id, appellation_id, primary_grape_id, secondary_grape_id, producer_id, " +
  "type_designation_id, vintage_kind, vintage_year, vintage_tawny_years, colour, style, image_url, created_by, merged_into";

/** The live rows holding this identity: the columns find_or_create_catalog_wine
    matches on (catalog_wines_identity_key), merged-away rows excluded. */
async function catalogIdentityRows(wine) {
  let query = admin
    .from("catalog_wines")
    .select(CATALOG_COLUMNS)
    .eq("producer_id", wine.producer.id)
    .eq("appellation_id", wine.appellation.id)
    .eq("colour", wine.colour)
    .eq("vintage_kind", wine.vintage.kind)
    .is("merged_into", null);
  query = wine.vintage.year === null ? query.is("vintage_year", null) : query.eq("vintage_year", wine.vintage.year);
  query = wine.vintage.tawnyYears === null
    ? query.is("vintage_tawny_years", null)
    : query.eq("vintage_tawny_years", wine.vintage.tawnyYears);
  const { data, error } = await query;
  check(error, `catalog identity lookup for ${wine.label}`);
  return (data ?? []).filter((row) => identityName(row.wine_name) === identityName(wine.wineName));
}

function catalogDiffs(row, wine) {
  const diffs = [];
  if (row.merged_into !== null) diffs.push("merged_into (it was merged away)");
  if (row.producer_id !== wine.producer.id) diffs.push("producer");
  if (row.appellation_id !== wine.appellation.id) diffs.push("appellation");
  if (row.country_id !== wine.country.id) diffs.push("country");
  if (row.region_id !== wine.region.id) diffs.push("region");
  if (row.primary_grape_id !== wine.primaryGrape.id) diffs.push("primary grape");
  if ((row.secondary_grape_id ?? null) !== (wine.secondaryGrape?.id ?? null)) diffs.push("secondary grape");
  if ((row.type_designation_id ?? null) !== (wine.typeDesignation?.id ?? null)) diffs.push("type designation");
  if (row.colour !== wine.colour) diffs.push("colour");
  if (row.style !== wine.style) diffs.push("style");
  if (
    row.vintage_kind !== wine.vintage.kind
    || (row.vintage_year ?? null) !== wine.vintage.year
    || (row.vintage_tawny_years ?? null) !== wine.vintage.tawnyYears
  ) diffs.push("vintage");
  if (identityName(row.wine_name) !== identityName(wine.wineName)) diffs.push("wine name");
  return diffs;
}

async function catalogRow(id) {
  const { data, error } = await admin.from("catalog_wines").select(CATALOG_COLUMNS).eq("id", id).maybeSingle();
  check(error, `catalog wine ${id} read`);
  if (!data) throw new Error(`catalog wine ${id} does not exist`);
  return data;
}

async function catalogBlend(catalogWineId) {
  const { data, error } = await admin
    .from("catalog_wine_grapes")
    .select("grape_id, percentage, sort_order, grapes(name)")
    .eq("catalog_wine_id", catalogWineId)
    .order("sort_order")
    .order("grape_id");
  check(error, `catalog wine ${catalogWineId} blend read`);
  return (data ?? []).map((row) => ({
    grapeId: row.grape_id,
    percentage: row.percentage === null ? null : Number(row.percentage),
    name: row.grapes?.name ?? row.grape_id,
  }));
}

function identityKey(wine) {
  return [
    wine.producer.id, identityName(wine.wineName), wine.appellation.id, wine.colour,
    wine.vintage.kind, wine.vintage.year ?? -1, wine.vintage.tawnyYears ?? -1,
  ].join("|");
}

// ---------------------------------------------------------------------------
// Resolve
// ---------------------------------------------------------------------------

async function resolveWine(spec, where) {
  const vintage = toVintage(spec.vintage);
  const style = vintage?.kind === "TAWNY" ? "FORTIFIED" : spec.style;
  const wineName = typeof spec.wineName === "string" && spec.wineName.trim() !== "" ? spec.wineName.trim() : null;
  const label = `${spec.producer ?? "?"}${wineName ? ` ${wineName}` : ""} ${vintageText(vintage)}`;

  // COMPLETE_WINE_FIELDS (src/lib/wine-identity/complete.ts): all required.
  const missing = [];
  if (!spec.producer?.trim()) missing.push("producer");
  if (!vintage) missing.push("vintage");
  if (!WINE_COLOURS.has(spec.colour)) missing.push("colour");
  if (!WINE_STYLES.has(style)) missing.push("style");
  if (!spec.country) missing.push("country");
  if (!spec.region) missing.push("region");
  if (!spec.appellation) missing.push("appellation");
  if (!spec.grapes?.length) missing.push("primaryGrape");
  if (missing.length > 0) problems.push(`${where} (${label}): not a complete wine, missing ${missing.join(", ")}`);

  const place = await resolvePlace(spec, `${where} (${label})`);
  const blend = await resolveGrapes(spec.grapes, `${where} (${label})`);

  // Every seed wine states its designation explicitly (null = none), so a catalog
  // row carrying a different one can never be linked by omission.
  let typeDesignation = null;
  let designationResolved = true;
  if (!Object.hasOwn(spec, "typeDesignation") || spec.typeDesignation === undefined) {
    problems.push(`${where} (${label}): typeDesignation must be given explicitly (an exact live name, or null for none)`);
    designationResolved = false;
  } else if (spec.typeDesignation !== null) {
    const found = await typeDesignationNamed(spec.typeDesignation);
    if (found.problem) {
      problems.push(`${where} (${label}): ${found.problem}`);
      designationResolved = false;
    } else {
      typeDesignation = found.row;
      if (typeDesignation.country_id && place.country && typeDesignation.country_id !== place.country.id) {
        problems.push(`${where} (${label}): type designation "${typeDesignation.name}" is scoped to another country`);
      }
      if (typeDesignation.region_id && place.region && typeDesignation.region_id !== place.region.id) {
        problems.push(`${where} (${label}): type designation "${typeDesignation.name}" is scoped to another region`);
      }
    }
  }

  const wine = {
    label, wineName, vintage, colour: spec.colour, style, ...place, blend, typeDesignation,
    primaryGrape: blend[0] ?? null, secondaryGrape: blend[1] ?? null,
    catalog: null, addedVia: null,
  };
  const resolved = missing.length === 0 && wine.country && wine.region && wine.appellation && wine.producer
    && wine.primaryGrape && blend.length === spec.grapes.length && designationResolved;
  if (!resolved) return wine;

  // prepareCompleteWine step 2: the appellation sits in the region, the region in the country.
  if (wine.appellation.region_id !== wine.region.id) problems.push(`${where} (${label}): the appellation is not in the region`);
  if (wine.region.country_id !== wine.country.id) problems.push(`${where} (${label}): the region is not in the country`);

  const matches = await catalogIdentityRows(wine);
  if (matches.length > 1) {
    problems.push(`${where} (${label}): ${matches.length} live catalog wines hold this identity (${matches.map((m) => m.id).join(", ")})`);
    return wine;
  }
  if (matches.length === 1) {
    const row = matches[0];
    const diffs = catalogDiffs(row, wine);
    if (diffs.length > 0) {
      const detail = diffs.includes("type designation")
        ? ` (catalog ${await designationLabel(row.type_designation_id)}, seed ${await designationLabel(wine.typeDesignation?.id ?? null)})`
        : "";
      problems.push(
        `${where} (${label}): catalog wine ${row.id} holds this identity but has a different ${diffs.join(", ")}${detail}; ` +
          "the seed never edits an existing catalog row, so correct that row in the app or seed another wine",
      );
    }
    let rowDesignation = null;
    if (row.type_designation_id) {
      [rowDesignation] = await rowsWhere("type_designations", "id, name", { id: row.type_designation_id }, "type designation");
    }
    wine.catalog = { status: "exists", row, blend: await catalogBlend(row.id), typeDesignation: rowDesignation };
    wine.addedVia = "CATALOG";
  } else {
    wine.catalog = { status: "create" };
    wine.addedVia = "BY_HAND";
  }
  return wine;
}

function guessColumns(g) {
  return {
    country_id: g.country?.id ?? null,
    region_id: g.region?.id ?? null,
    appellation_id: g.appellation?.id ?? null,
    primary_grape_id: g.grapes[0]?.id ?? null,
    secondary_grape_id: g.grapes[1]?.id ?? null,
    producer_id: g.producer?.id ?? null,
    type_designation_id: g.typeDesignation?.id ?? null,
    vintage_kind: g.vintage?.kind ?? null,
    vintage_year: g.vintage?.year ?? null,
    vintage_tawny_years: g.vintage?.tawnyYears ?? null,
  };
}

async function resolveGuess(spec, where) {
  const place = await resolvePlace(spec, where);
  const grapes = await resolveGrapes(spec.grapes, where, 2);
  let vintage = null;
  if (spec.vintage !== null && spec.vintage !== undefined) {
    vintage = toVintage(spec.vintage);
    if (!vintage) problems.push(`${where}: ${JSON.stringify(spec.vintage)} is not a valid vintage`);
  }
  let typeDesignation = null;
  if (spec.designation !== null && spec.designation !== undefined) {
    const found = await typeDesignationNamed(spec.designation);
    if (found.problem) problems.push(`${where}: ${found.problem}`);
    else typeDesignation = found.row;
  }
  const resolved = { ...place, grapes, vintage, typeDesignation };
  return { ...resolved, columns: guessColumns(resolved) };
}

async function authUsersByEmail() {
  const byEmail = new Map();
  const perPage = 1000;
  for (let page = 1; ; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    check(error, "auth.admin.listUsers");
    for (const user of data.users) if (user.email) byEmail.set(user.email.toLowerCase(), user);
    if (data.users.length < perPage) return byEmail;
  }
}

async function resolvePeople() {
  const users = await authUsersByEmail();
  const plans = [];
  for (const person of PEOPLE) {
    const where = `person ${person.email}`;
    if (!DEMO_EMAIL.test(person.email)) problems.push(`${where}: not a demo.<name>@blindr.invalid address`);
    if (!person.display_name?.trim()) problems.push(`${where}: display_name is required`);
    if (person.favorite_wine_type !== null && !FAVORITE_WINE_TYPES.has(person.favorite_wine_type)) {
      problems.push(`${where}: favorite_wine_type "${person.favorite_wine_type}" is not a FAVORITE_WINE_TYPE_ITEMS key`);
    }
    if ("phone" in person) problems.push(`${where}: phone is private and must not be seeded`);

    const user = users.get(person.email.toLowerCase()) ?? null;
    let profile = null;
    if (user) {
      const { data, error } = await admin
        .from("profiles")
        .select("id, email, display_name, bio, location, favorite_wine_type")
        .eq("id", user.id)
        .maybeSingle();
      check(error, `${where} profile read`);
      profile = data;
    }
    const fill = {};
    if (profile) {
      for (const field of PUBLIC_PROFILE_FIELDS) {
        if (person[field] !== null && person[field] !== undefined && profile[field] === null) fill[field] = person[field];
      }
    }
    plans.push({ person, userId: user?.id ?? null, action: user ? "exists" : "create", profile, fill });
  }
  return plans;
}

async function resolveTastings(peoplePlans) {
  const personByKey = new Map(peoplePlans.map((plan) => [plan.person.key, plan]));
  const plans = [];
  for (const tasting of TASTINGS) {
    const where = `tasting "${tasting.name}"`;
    const host = personByKey.get(tasting.host) ?? null;
    if (!host) problems.push(`${where}: host "${tasting.host}" is not in PEOPLE`);
    const guests = tasting.guests.map((key) => {
      const guest = personByKey.get(key);
      if (!guest) problems.push(`${where}: guest "${key}" is not in PEOPLE`);
      return guest ?? null;
    });
    if (tasting.guests.includes(tasting.host)) problems.push(`${where}: the host is listed as a guest; a HOST_PROVIDES host never guesses`);
    if (new Set(tasting.guests).size !== tasting.guests.length) problems.push(`${where}: a guest is listed twice`);
    if (tasting.wineSource !== "HOST_PROVIDES" || tasting.revealMode !== "BLIND") {
      problems.push(`${where}: this script seeds BLIND, HOST_PROVIDES tastings only`);
    }
    if (!["LIVE", "ASYNC"].includes(tasting.timingMode)) problems.push(`${where}: timing mode must be LIVE or ASYNC`);

    let existing = [];
    if (host?.userId) {
      const { data, error } = await admin
        .from("tastings")
        .select("id, status, created_at")
        .eq("name", tasting.name)
        .eq("host_id", host.userId);
      check(error, `${where} lookup`);
      existing = data ?? [];
    }

    const glasses = [];
    for (const [index, glass] of tasting.glasses.entries()) {
      const glassWhere = `${where}, glass ${index + 1}`;
      const wine = await resolveWine(glass.wine, glassWhere);
      for (const key of Object.keys(glass.guesses)) {
        if (!tasting.guests.includes(key)) problems.push(`${glassWhere}: a guess for "${key}", who is not a guest`);
      }
      const guesses = [];
      for (const [i, key] of tasting.guests.entries()) {
        const spec = glass.guesses[key];
        if (!spec) {
          problems.push(`${glassWhere}: no guess for guest "${key}"`);
          continue;
        }
        const name = guests[i]?.person.display_name ?? key;
        guesses.push({ guest: guests[i], name, ...(await resolveGuess(spec, `${glassWhere}, ${name}'s guess`)) });
      }
      glasses.push({ position: index + 1, wine, guesses });
    }
    plans.push({ tasting, host, guests, existing, action: existing.length > 0 ? "skip" : "create", glasses });
  }

  // One identity used twice must describe the same wine both times.
  const seen = new Map();
  for (const plan of plans) {
    for (const { wine } of plan.glasses) {
      if (!wine.catalog) continue;
      const key = identityKey(wine);
      const first = seen.get(key);
      if (!first) {
        seen.set(key, wine);
        continue;
      }
      const same = first.country.id === wine.country.id && first.region.id === wine.region.id
        && first.style === wine.style && first.blend.map((g) => g.id).join() === wine.blend.map((g) => g.id).join()
        && (first.typeDesignation?.id ?? null) === (wine.typeDesignation?.id ?? null);
      if (!same) problems.push(`${plan.tasting.name}: ${wine.label} shares its catalog identity with another seed wine that differs`);
    }
  }
  return plans;
}

// ---------------------------------------------------------------------------
// Scoring mirror (plan display and post-reveal check only; reveal_wine scores)
// ---------------------------------------------------------------------------

/** The answer key a glass gets: copied from the catalog wine, as
    insertGlassFromCatalogWine does. Before a "to create" wine exists, the
    resolved ids stand in for the row the RPC will insert. */
function answerFor(wine) {
  // The row re-read in the write phase wins over the one read while resolving.
  const row = wine.catalogRow ?? (wine.catalog?.status === "exists" ? wine.catalog.row : null);
  if (row) {
    return {
      country_id: row.country_id,
      region_id: row.region_id,
      appellation_id: row.appellation_id,
      primary_grape_id: row.primary_grape_id,
      secondary_grape_id: row.secondary_grape_id,
      producer_id: row.producer_id,
      type_designation_id: row.type_designation_id,
      vintage_kind: row.vintage_kind,
      vintage_year: row.vintage_year,
      vintage_tawny_years: row.vintage_tawny_years,
      image_url: row.image_url,
      catalog_wine_id: row.id,
    };
  }
  return {
    country_id: wine.country?.id ?? null,
    region_id: wine.region?.id ?? null,
    appellation_id: wine.appellation?.id ?? null,
    primary_grape_id: wine.primaryGrape?.id ?? null,
    secondary_grape_id: wine.secondaryGrape?.id ?? null,
    producer_id: wine.producer?.id ?? null,
    type_designation_id: wine.typeDesignation?.id ?? null,
    vintage_kind: wine.vintage?.kind ?? null,
    vintage_year: wine.vintage?.year ?? null,
    vintage_tawny_years: wine.vintage?.tawnyYears ?? null,
    image_url: null,
    catalog_wine_id: null,
  };
}

/** reveal_wine's BLIND scoring (live definition, 2026-09-13). null = not applicable. */
function expectedPoints(answer, g) {
  const match = (guessed, actual, points) => (guessed !== null && guessed === actual ? points : 0);
  const ifAnswered = (guessed, actual, points) => (actual === null ? null : match(guessed, actual, points));
  let vintage = 0;
  if (g.vintage_kind !== null && g.vintage_kind === answer.vintage_kind) {
    if (g.vintage_kind === "NV") vintage = 2;
    else if (g.vintage_kind === "TAWNY") vintage = g.vintage_tawny_years === answer.vintage_tawny_years ? 2 : 0;
    else if (g.vintage_year === answer.vintage_year) vintage = 2;
    else if (g.vintage_year !== null && Math.abs(g.vintage_year - answer.vintage_year) === 1) vintage = 1;
  }
  const parts = {
    country: match(g.country_id, answer.country_id, 2),
    region: match(g.region_id, answer.region_id, 3),
    appellation: ifAnswered(g.appellation_id, answer.appellation_id, 5),
    primary: match(g.primary_grape_id, answer.primary_grape_id, 8),
    secondary: ifAnswered(g.secondary_grape_id, answer.secondary_grape_id, 2),
    producer: match(g.producer_id, answer.producer_id, 6),
    designation: ifAnswered(g.type_designation_id, answer.type_designation_id, 2),
    vintage,
  };
  const total = Object.values(parts).reduce((sum, points) => sum + (points ?? 0), 0);
  return { parts, total };
}

// ---------------------------------------------------------------------------
// Plan output
// ---------------------------------------------------------------------------

function printPlan(peoplePlans, tastingPlans) {
  console.log(`Demo seed plan${PLAN_ONLY ? " (--plan: read-only, nothing is written)" : ""}  ${new Date().toISOString()}`);

  console.log("\nPeople");
  for (const plan of peoplePlans) {
    const { person } = plan;
    const fields = Object.entries(plan.fill).map(([field, value]) => `${field}=${JSON.stringify(value)}`).join(", ");
    if (plan.action === "create") {
      console.log(`  create  ${pad(person.email, 30)} ${person.display_name}: new auth user (no password); profile gets its public fields`);
    } else if (!plan.profile) {
      console.log(`  exists  ${pad(person.email, 30)} ${plan.userId}: profiles row MISSING, will insert it with the public fields`);
    } else {
      console.log(
        `  exists  ${pad(person.email, 30)} ${pad(plan.profile.display_name, 16)} ${plan.userId}  ${fields ? `fill null fields: ${fields}` : "nothing to fill"}`,
      );
    }
  }

  console.log("\nTastings");
  for (const plan of tastingPlans) {
    const { tasting } = plan;
    const hostName = plan.host?.person.display_name ?? tasting.host;
    const guestNames = plan.guests.map((guest, i) => guest?.person.display_name ?? tasting.guests[i]).join(", ");
    if (plan.action === "skip") {
      const rows = plan.existing.map((row) => `${row.id} ${row.status}`).join(", ");
      console.log(`\n  skip    "${tasting.name}" hosted by ${hostName}: already exists (${rows}); its glasses are resolved below only as a check`);
    } else {
      console.log(
        `\n  create  "${tasting.name}" hosted by ${hostName}; guests ${guestNames}\n` +
          `          ${tasting.timingMode} / ${tasting.wineSource} / ${tasting.revealMode}: insert IN_PROGRESS, participants JOINED, ` +
          `locked guesses, reveal_wine for every glass as ${hostName}, then CLOSED`,
      );
    }

    const totals = new Map();
    for (const glass of plan.glasses) {
      const { wine } = glass;
      console.log(`    glass ${glass.position}  ${wine.label}  (${wine.colour} ${wine.style})`);
      console.log(`      country      ${ref(wine.country)}`);
      console.log(`      region       ${ref(wine.region)}`);
      console.log(`      appellation  ${ref(wine.appellation)}`);
      console.log(`      producer     ${ref(wine.producer)}`);
      console.log(`      grapes       ${wine.blend.map(ref).join(", ") || "?"}`);
      console.log(`      vintage      ${wine.vintage ? `${wine.vintage.kind} ${vintageText(wine.vintage)}` : "?"}`);
      console.log(`      designation  ${wine.typeDesignation ? ref(wine.typeDesignation) : "none"}`);
      if (!wine.catalog) {
        console.log("      catalog      not looked up (unresolved references)");
      } else if (wine.catalog.status === "exists") {
        const { row, blend, typeDesignation } = wine.catalog;
        const blendText = blend.map((g) => (g.percentage === null ? g.name : `${g.name} ${g.percentage}%`)).join(", ");
        console.log(
          `      catalog      EXISTS ${row.id}${row.wine_name ? ` "${row.wine_name}"` : ""}; blend ${blendText}; ` +
            `type designation ${typeDesignation?.name ?? "none"}; image ${row.image_url ? "yes" : "none"}; linked, added_via CATALOG`,
        );
      } else {
        console.log(
          `      catalog      no live row holds this identity: ${plan.action === "skip" ? "(tasting skipped, nothing created)" : `WILL BE CREATED by ${hostName} through find_or_create_catalog_wine, added_via BY_HAND`}`,
        );
      }

      const answer = answerFor(wine);
      for (const g of glass.guesses) {
        const score = expectedPoints(answer, g.columns);
        totals.set(g.name, (totals.get(g.name) ?? 0) + score.total);
        const said = [
          g.country?.name ?? "-", g.region?.name ?? "-", g.appellation?.name ?? "-", g.producer?.name ?? "-",
          g.grapes.map((grape) => grape.name).join(" + ") || "-", vintageText(g.vintage),
          ...(g.typeDesignation ? [g.typeDesignation.name] : []),
        ].join(" / ");
        const parts = Object.entries(score.parts).map(([key, points]) => `${key} ${points ?? "n/a"}`).join(", ");
        console.log(`      guess  ${pad(g.name, 16)} ${pad(`${score.total} pts`, 7)} ${said}`);
        console.log(`             ${pad("", 16)} ${pad("", 7)} ${parts}`);
      }
    }
    console.log(`    expected totals: ${[...totals].map(([name, total]) => `${name} ${total}`).join(", ")}`);
  }
}

// ---------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------

function publicFields(person) {
  return Object.fromEntries(PUBLIC_PROFILE_FIELDS.map((field) => [field, person[field] ?? null]));
}

async function writePeople(peoplePlans) {
  const lines = [];
  for (const plan of peoplePlans) {
    const { person } = plan;
    if (plan.action === "create") {
      const { data, error } = await admin.auth.admin.createUser({
        email: person.email,
        email_confirm: true,
        user_metadata: { display_name: person.display_name },
      });
      check(error, `creating the auth user ${person.email}`);
      plan.userId = data.user.id;
      const { data: profile, error: readError } = await admin.from("profiles").select("id").eq("id", plan.userId).maybeSingle();
      check(readError, `${person.email} profile read`);
      const { error: writeError } = profile
        ? await admin.from("profiles").update(publicFields(person)).eq("id", plan.userId)
        : await admin.from("profiles").insert({ id: plan.userId, email: person.email, ...publicFields(person) });
      check(writeError, `${person.email} profile write`);
      lines.push(`created ${person.email} (${plan.userId})`);
    } else if (!plan.profile) {
      const { error } = await admin.from("profiles").insert({ id: plan.userId, email: person.email, ...publicFields(person) });
      check(error, `${person.email} profile insert`);
      lines.push(`inserted the missing profiles row for ${person.email}`);
    } else {
      const filled = [];
      // One field at a time, and only while it is still null, so nothing set in
      // the meantime is overwritten.
      for (const [field, value] of Object.entries(plan.fill)) {
        const { data, error } = await admin
          .from("profiles")
          .update({ [field]: value })
          .eq("id", plan.userId)
          .is(field, null)
          .select("id");
        check(error, `${person.email} ${field} fill`);
        if (data?.length) filled.push(field);
      }
      lines.push(`kept ${person.email}${filled.length ? `; filled ${filled.join(", ")}` : ""}`);
    }
  }
  return lines;
}

/** A host session minted as .superpowers/demo-session.mjs does: an admin magic
    link verified with verifyOtp. No password is used. */
async function signInAs(plan) {
  const { data: link, error } = await admin.auth.admin.generateLink({ type: "magiclink", email: plan.person.email });
  check(error, `magic link for ${plan.person.email}`);
  const client = createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { error: verifyError } = await client.auth.verifyOtp({ token_hash: link.properties.hashed_token, type: "magiclink" });
  check(verifyError, `verifyOtp for ${plan.person.email}`);
  const { data: me, error: meError } = await client.auth.getUser();
  check(meError, `session check for ${plan.person.email}`);
  if (me.user?.id !== plan.userId) {
    throw new Error(`signed in as ${me.user?.id ?? "nobody"}, expected ${plan.person.email} (${plan.userId})`);
  }
  return client;
}

/** fillCatalogWine's blend half: replace the stored blend only while it is still
    the insert trigger's seed and the seed wine's blend differs. The blend must
    then hold exactly the seed wine's grapes, primary first. */
async function settleBlend(client, row, wine) {
  const incoming = wine.blend.map((grape) => grape.id);
  const seed = [row.primary_grape_id];
  if (row.secondary_grape_id && row.secondary_grape_id !== row.primary_grape_id) seed.push(row.secondary_grape_id);
  const stored = await catalogBlend(row.id);
  const storedIsSeed = stored.length === seed.length
    && stored.every((g) => g.percentage === null && seed.includes(g.grapeId))
    && new Set(stored.map((g) => g.grapeId)).size === seed.length;
  if (storedIsSeed && incoming.join() !== seed.join()) {
    const { error: upsertError } = await client.from("catalog_wine_grapes").upsert(
      incoming.map((grapeId, index) => ({ catalog_wine_id: row.id, grape_id: grapeId, percentage: null, sort_order: index })),
      { onConflict: "catalog_wine_id,grape_id" },
    );
    check(upsertError, `catalog wine ${row.id} blend write`);
    const { error: trimError } = await client
      .from("catalog_wine_grapes")
      .delete()
      .eq("catalog_wine_id", row.id)
      .not("grape_id", "in", `(${incoming.join(",")})`);
    check(trimError, `catalog wine ${row.id} blend trim`);
  }
  const after = await catalogBlend(row.id);
  const afterIds = after.map((g) => g.grapeId);
  if (afterIds.length !== incoming.length || !incoming.every((id) => afterIds.includes(id))) {
    throw new Error(`catalog wine ${row.id} blend is [${after.map((g) => g.name).join(", ")}], expected [${wine.blend.map((g) => g.name).join(", ")}]`);
  }
}

async function writeCatalogWines(tastingPlans, sessions) {
  const lines = [];
  const settled = new Map();
  for (const plan of tastingPlans) {
    for (const { wine } of plan.glasses) {
      const key = identityKey(wine);
      if (settled.has(key)) {
        wine.catalogRow = settled.get(key);
        continue;
      }
      if (wine.catalog.status === "exists") {
        const row = await catalogRow(wine.catalog.row.id);
        const diffs = catalogDiffs(row, wine);
        if (diffs.length > 0) throw new Error(`catalog wine ${row.id} for ${wine.label} changed since the resolve: ${diffs.join(", ")}`);
        wine.catalogRow = row;
        lines.push(`linked ${wine.label} to catalog wine ${row.id}`);
      } else {
        const client = sessions.get(plan.host.userId);
        const payload = {
          country_id: wine.country.id,
          region_id: wine.region.id,
          appellation_id: wine.appellation.id,
          primary_grape_id: wine.primaryGrape.id,
          secondary_grape_id: wine.secondaryGrape?.id ?? null,
          producer_id: wine.producer.id,
          type_designation_id: wine.typeDesignation?.id ?? null,
          vintage_kind: wine.vintage.kind,
          vintage_year: wine.vintage.year,
          vintage_tawny_years: wine.vintage.tawnyYears,
          wine_name: wine.wineName,
          colour: wine.colour,
          style: wine.style,
        };
        let response = await client.rpc("find_or_create_catalog_wine", { p: payload });
        if (response.error?.code === "23505") response = await client.rpc("find_or_create_catalog_wine", { p: payload });
        if (response.error || !response.data) {
          throw new Error(`find_or_create_catalog_wine for ${wine.label} failed: ${response.error?.message ?? "no id returned"}`);
        }
        const row = await catalogRow(response.data);
        const diffs = catalogDiffs(row, wine);
        if (diffs.length > 0) throw new Error(`catalog wine ${row.id} for ${wine.label} has a different ${diffs.join(", ")}`);
        if (row.created_by === plan.host.userId) {
          await settleBlend(client, row, wine);
          lines.push(`created catalog wine ${row.id} ${wine.label} (created_by ${plan.host.person.display_name})`);
        } else {
          lines.push(`linked ${wine.label} to catalog wine ${row.id}, which appeared since the resolve`);
        }
        wine.catalogRow = row;
      }
      settled.set(key, wine.catalogRow);
    }
  }
  return lines;
}

async function deleteTastingCreatedThisRun(tastingId, name) {
  const { data, error } = await admin.from("tastings").delete().eq("id", tastingId).select("id");
  if (error || !data?.length) {
    console.error(
      `!! Could not delete the half-made tasting "${name}" (${tastingId}) created in this run: ${error?.message ?? "no row deleted"}. Delete it by hand before rerunning.`,
    );
  } else {
    console.error(`Deleted the half-made tasting "${name}" (${tastingId}) created in this run.`);
  }
}

async function writeTasting(plan, client) {
  const { tasting, host } = plan;
  const { data: again, error: againError } = await admin
    .from("tastings")
    .select("id")
    .eq("name", tasting.name)
    .eq("host_id", host.userId)
    .limit(1);
  check(againError, `"${tasting.name}" re-check`);
  if (again.length > 0) return [`skipped "${tasting.name}": it appeared since the resolve (${again[0].id})`];

  // started_at / finished_at / revealed_at are trigger-owned: never sent.
  const { data: inserted, error: insertError } = await admin
    .from("tastings")
    .insert({
      name: tasting.name,
      description: tasting.description,
      host_id: host.userId,
      timing_mode: tasting.timingMode,
      wine_source: tasting.wineSource,
      reveal_mode: tasting.revealMode,
      status: "IN_PROGRESS",
    })
    .select("id")
    .single();
  check(insertError, `"${tasting.name}" insert`);
  const tastingId = inserted.id;

  try {
    const joinedAt = new Date().toISOString();
    const members = [host, ...plan.guests];
    const { data: participants, error: participantsError } = await admin
      .from("tasting_participants")
      .insert(members.map((member) => ({ tasting_id: tastingId, user_id: member.userId, status: "JOINED", joined_at: joinedAt })))
      .select("id, user_id");
    check(participantsError, `"${tasting.name}" participants insert`);
    const participantOf = new Map(participants.map((row) => [row.user_id, row.id]));

    const { data: wines, error: winesError } = await admin
      .from("wines")
      .insert(plan.glasses.map((glass) => ({ tasting_id: tastingId, position: glass.position, added_via: glass.wine.addedVia })))
      .select("id, position");
    check(winesError, `"${tasting.name}" glasses insert`);
    const wineAt = new Map(wines.map((row) => [row.position, row.id]));

    const answers = plan.glasses.map((glass) => ({ wine_id: wineAt.get(glass.position), ...answerFor(glass.wine) }));
    for (const answer of answers) {
      if (!answer.catalog_wine_id || !answer.producer_id || !answer.vintage_kind) {
        throw new Error(`"${tasting.name}": an answer key lacks catalog_wine_id, producer_id or vintage_kind`);
      }
    }
    const { error: answersError } = await admin.from("wine_answers").insert(answers);
    check(answersError, `"${tasting.name}" answer keys insert`);

    const lockedAt = new Date().toISOString();
    const guessRows = [];
    const expected = new Map();
    for (const glass of plan.glasses) {
      const answer = answerFor(glass.wine);
      for (const g of glass.guesses) {
        const wineId = wineAt.get(glass.position);
        const participantId = participantOf.get(g.guest.userId);
        guessRows.push({ wine_id: wineId, participant_id: participantId, ...g.columns, locked_at: lockedAt });
        expected.set(`${wineId}|${participantId}`, { name: g.name, glass: glass.position, total: expectedPoints(answer, g.columns).total });
      }
    }
    const { error: guessesError } = await admin.from("guesses").insert(guessRows);
    check(guessesError, `"${tasting.name}" guesses insert`);

    for (const glass of plan.glasses) {
      const { error } = await client.rpc("reveal_wine", { p_wine_id: wineAt.get(glass.position) });
      if (error) throw new Error(`reveal_wine failed for "${tasting.name}" glass ${glass.position} (${glass.wine.label}): ${error.message}`);
    }

    const { data: revealed, error: revealedError } = await admin.from("wines").select("id, position, is_revealed").eq("tasting_id", tastingId);
    check(revealedError, `"${tasting.name}" reveal read-back`);
    const hidden = revealed.filter((row) => !row.is_revealed);
    if (revealed.length !== plan.glasses.length || hidden.length > 0) {
      throw new Error(`"${tasting.name}": ${hidden.length} of ${revealed.length} glasses are still hidden after reveal_wine`);
    }
    const { data: scored, error: scoredError } = await admin
      .from("guesses")
      .select("wine_id, participant_id, total_points, scored_at")
      .in("wine_id", [...wineAt.values()]);
    check(scoredError, `"${tasting.name}" guesses read-back`);
    if (scored.length !== guessRows.length || scored.some((row) => row.scored_at === null)) {
      throw new Error(`"${tasting.name}": ${scored.filter((row) => row.scored_at === null).length} guesses unscored after the reveal`);
    }
    const warnings = [];
    for (const row of scored) {
      const want = expected.get(`${row.wine_id}|${row.participant_id}`);
      if (want && want.total !== row.total_points) {
        warnings.push(`WARNING "${tasting.name}" glass ${want.glass}, ${want.name}: reveal_wine gave ${row.total_points} pts, the plan expected ${want.total}`);
      }
    }

    const { data: board, error: boardError } = await client.rpc("get_tasting_leaderboard", { p_tasting_id: tastingId });
    check(boardError, `"${tasting.name}" get_tasting_leaderboard`);
    const nameOf = new Map([host, ...plan.guests].map((member) => [participantOf.get(member.userId), member.person.display_name]));
    const standings = [...(board ?? [])]
      .sort((a, b) => b.total - a.total)
      .map((row) => `${nameOf.get(row.participant_id) ?? row.participant_id} ${row.total} (${row.wines_scored} glasses)`)
      .join(", ");

    const { data: closed, error: closeError } = await admin
      .from("tastings")
      .update({ status: "CLOSED" })
      .eq("id", tastingId)
      .select("id, status");
    check(closeError, `"${tasting.name}" close`);
    if (closed?.[0]?.status !== "CLOSED") throw new Error(`"${tasting.name}" did not close`);

    return [
      `created "${tasting.name}" (${tastingId}) CLOSED: ${plan.glasses.length} glasses revealed by ${host.person.display_name}, ${guessRows.length} locked guesses scored`,
      `  leaderboard: ${standings}`,
      ...warnings,
    ];
  } catch (error) {
    await deleteTastingCreatedThisRun(tastingId, tasting.name);
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const peoplePlans = await resolvePeople();
const tastingPlans = await resolveTastings(peoplePlans);
printPlan(peoplePlans, tastingPlans);

if (problems.length > 0) {
  console.error(`\nAborted before any write: ${problems.length} problem(s).`);
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}
if (PLAN_ONLY) {
  console.log("\n--plan: every reference resolved exactly; nothing was written.");
  process.exit(0);
}

console.log("\nWriting.");
const summary = await writePeople(peoplePlans);
const toCreate = tastingPlans.filter((plan) => plan.action === "create");
const sessions = new Map();
try {
  for (const plan of toCreate) {
    if (!sessions.has(plan.host.userId)) sessions.set(plan.host.userId, await signInAs(plan.host));
  }
  summary.push(...(await writeCatalogWines(toCreate, sessions)));
  for (const plan of toCreate) summary.push(...(await writeTasting(plan, sessions.get(plan.host.userId))));
} finally {
  for (const client of sessions.values()) await client.auth.signOut({ scope: "local" });
}
for (const plan of tastingPlans.filter((p) => p.action === "skip")) {
  summary.push(`skipped "${plan.tasting.name}": already exists (${plan.existing.map((row) => row.id).join(", ")})`);
}

console.log("\nSummary");
for (const line of summary) console.log(`  ${line}`);
