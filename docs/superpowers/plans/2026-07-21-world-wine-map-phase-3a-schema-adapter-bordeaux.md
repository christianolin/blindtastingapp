# World Wine Map Phase 3A — Classification Schema, INAO Adapter, Corrected Bordeaux, Bourgogne Pilot

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the classification/legal-relationship schema, build the first real INAO source adapter (raw retention in Storage), correct the full Bordeaux tree with five new sourced appellations and two legal edges, and ship Bourgogne as the pilot region — all visible on the live map at the end.

**Architecture:** One transactional schema migration recreates the relationship enum (ADD VALUE cannot be used in the same transaction; recreation is fully transactional) and adds flat classification columns. The adapter fetches INAO parcels per denomination membership (comma-combination semantics, split on comma-not-followed-by-space), retains raw pages in Supabase Storage with checksums, and dissolves/generalizes in PostGIS (union → closing buffer → topology-preserving simplify → component filter) with parameters recorded. Catalog changes are seed migrations that reparent by `primary_parent_id` only (keys immutable), stage boundaries `DRAFT`, and flip to `VALIDATED`/current at review steps. Publication is the existing one-click workflow.

**Tech Stack:** Supabase Postgres 17 + PostGIS 3.3, Node ESM scripts (`pg`, built-in test runner), Supabase Storage, existing Wine Map Tiles CI workflow.

**Spec:** `docs/superpowers/specs/2026-07-21-world-wine-map-phase-3-france-design.md` and the classification addendum `2026-07-21-wine-place-classification-design.md`.

## Global Constraints

- Scoring is untouchable: `countries`/`regions`/`appellations`/`wine_answers`/`guesses` UUIDs, names, and scoring functions stay byte-identical (digest checks per the Phase 1 pattern). Reference rows change only in their `map_*` review columns via exact-name review.
- Canonical keys are immutable: corrections move `primary_parent_id` only. New places get fresh keys under the addendum's opacity rule.
- Denomination names come only from `data/wine-map/inao-denomination-membership.json` — exact strings, never fuzzy. The comma-in-name case (`Côtes de Bourg, Bourg et Bourgeais`) must round-trip every tool.
- Raw WFS responses are retained unmodified in Storage bucket `wine-map-sources` (private) with SHA-256 checksums before any processing; `raw_snapshot_uri` points at the object. No raw artifact, no boundary.
- All DB work through the pooler env pattern; `DB_PASSWORD`/`SUPABASE_SERVICE_ROLE_KEY` process-env only, never committed or printed.
- Migrations are dry-run tested in a rollback-only transaction before live apply (harness pattern); live apply via scratch applier; every applied version recorded in `supabase_migrations.schema_migrations`.
- New boundaries stage as `DRAFT` and become current `VALIDATED` only in an explicit review step with a rendered preview.
- Verification per task: relevant `node --test` suites, `npx tsc --noEmit`, targeted eslint, `npm run build` when app code changes, `$LASTEXITCODE` checked after every native command.
- Owner gate at the end: publish, then the owner judges on the live map before Phase 3B proceeds.

---

## File Structure

- `supabase/migrations/20260801090000_wine_place_classification.sql` — enum recreation + classification columns + constraint + backfill of the existing 14 places.
- `supabase/migrations/20260801093000_wine_map_sources_bucket.sql` — private raw-artifact bucket.
- `scripts/wine-map-sources/inao-lib.mjs` — combo split/membership matching, WFS paging, checksums, storage upload, pg helpers (pure parts unit-tested).
- `scripts/wine-map-sources/inao-lib.test.mjs` — unit tests (split rule, membership filter, paging determinism, allowlist round-trip).
- `scripts/wine-map-sources/fetch-inao-denomination.mjs` — fetch + raw retention + staged parcel load; emits a fetch manifest per run.
- `scripts/wine-map-sources/build-boundary.mjs` — PostGIS dissolve/generalize into a `DRAFT` `wine_place_boundaries` row + SVG preview.
- `supabase/migrations/20260802090000_bordeaux_tree_correction.sql` — groupings, reparenting, five new appellations, legal edges, classification facts, reference links.
- `supabase/migrations/20260802093000_bourgogne_region.sql` — Bourgogne place + classification.
- `supabase/migrations/20260803090000_phase3a_boundary_review.sql` — reviewed boundary flips + place publication.
- `supabase/migrations/20260803093000_phase3a_reference_links.sql` — exact-name scoring-reference links.
- `scripts/world-wine-map-foundation.test.mjs` — expectation updates (place counts, hierarchy, classification).
- `scripts/wine-place-context.test.mjs` — corrected-tree expectations (Graves children, Margaux ancestors).
- `src/lib/supabase/database.types.ts` + `src/lib/supabase/world-wine-map-database.type-test.ts` — enum union + new columns.
- `CLAUDE.md` — Phase 3A domain rules.

Tasks: 1 schema, 2 adapter library, 3 fetch/build tooling, 4 Bordeaux correction, 5 Bourgogne pilot, 6 review+flip boundaries, 7 reference links + docs + final verification, 8 publish + owner map gate.

### Task 1: Classification Schema Migration

**Files:**
- Create: `supabase/migrations/20260801090000_wine_place_classification.sql`
- Modify: `scripts/world-wine-map-foundation.test.mjs` (append one test)
- Modify: `src/lib/supabase/database.types.ts`, `src/lib/supabase/world-wine-map-database.type-test.ts`
- Scratch, then delete: `scripts/scratch-apply-phase3.mjs` (byte-identical to the Phase 2B applier from plan 2B Task 1 Step 5)

**Interfaces:**
- Produces `wine_place_relationship_type` with values `OVERLAPS, ALTERNATE_PARENT, RELATED, REPLACES_WITHIN, DUAL_LABEL` and `wine_places` columns `is_appellation boolean not null default false`, `appellation_system text`, `appellation_level text` with the coupling constraint.
- Backfills the existing 14 places: France not an appellation; Bordeaux + 12 appellations get `AOC/AOP` facts.

- [ ] **Step 1: Append the failing test to the foundation suite**

Append to `scripts/world-wine-map-foundation.test.mjs` (end of file):

```js
test("classification facts and legal relationship types", async () => {
  const enumValues = await client.query(
    `select e.enumlabel
       from pg_enum e
       join pg_type t on t.oid = e.enumtypid
      where t.typname = 'wine_place_relationship_type'
      order by e.enumsortorder`,
  );
  assert.deepEqual(
    enumValues.rows.map(({ enumlabel }) => enumlabel),
    ["OVERLAPS", "ALTERNATE_PARENT", "RELATED", "REPLACES_WITHIN", "DUAL_LABEL"],
  );

  const facts = await client.query(
    `select count(*) filter (where is_appellation)::int appellations,
            count(*) filter (where is_appellation and appellation_system = 'AOC/AOP')::int aoc,
            count(*) filter (where is_appellation and appellation_level is null)::int missing_level,
            count(*) filter (where not is_appellation and canonical_key = 'france')::int france_plain
       from wine_places`,
  );
  assert.deepEqual(facts.rows[0], {
    appellations: 13,
    aoc: 13,
    missing_level: 0,
    france_plain: 1,
  });

  // One failing statement per rollback scope: after a rejected statement
  // the (sub)transaction is aborted and a second probe would only see
  // "current transaction is aborted".
  await withRollback(async () => {
    await assert.rejects(
      client.query(
        `update wine_places set is_appellation = true where canonical_key = 'france'`,
      ),
      /classification_coupling/i,
    );
  });
  await withRollback(async () => {
    await assert.rejects(
      client.query(
        `update wine_places set appellation_level = 'village-ish'
          where canonical_key = 'france.bordeaux'`,
      ),
      /appellation_level/i,
    );
  });
});
```

- [ ] **Step 2: Run RED against live**

```powershell
if (-not $env:DB_PASSWORD) { throw "Set DB_PASSWORD first." }
node --test --test-concurrency=1 scripts/world-wine-map-foundation.test.mjs
$red = $LASTEXITCODE
Remove-Item Env:DB_PASSWORD
if ($red -eq 0) { throw "Expected RED (classification absent) but tests passed." }
```

Expected: only the new test fails (missing enum values / columns); every pre-existing test passes.

- [ ] **Step 3: Create the migration**

Create `supabase/migrations/20260801090000_wine_place_classification.sql`:

```sql
-- Phase 3A classification schema (addendum 2026-07-21): legal relationship
-- types REPLACES_WITHIN/DUAL_LABEL plus flat classification facts on
-- wine_places. The relationship enum is RECREATED rather than extended:
-- ALTER TYPE ... ADD VALUE cannot be used inside the same transaction,
-- which would break the rollback-only dry-run harness; recreation is fully
-- transactional. The table's PK includes relationship_type and rebuilds
-- through the type round-trip.
alter table wine_place_relationships
  alter column relationship_type type text;
drop type wine_place_relationship_type;
create type wine_place_relationship_type as enum (
  'OVERLAPS', 'ALTERNATE_PARENT', 'RELATED', 'REPLACES_WITHIN', 'DUAL_LABEL'
);
alter table wine_place_relationships
  alter column relationship_type type wine_place_relationship_type
  using relationship_type::wine_place_relationship_type;

alter table wine_places
  add column is_appellation boolean not null default false,
  add column appellation_system text,
  add column appellation_level text
    check (appellation_level is null
           or appellation_level in ('regional', 'subregional', 'communal', 'cru')),
  add constraint wine_places_classification_coupling check (
    (is_appellation and appellation_system is not null)
    or (not is_appellation
        and appellation_system is null
        and appellation_level is null)
  );

-- Backfill the pilot catalog. Bordeaux carries the generic Bordeaux AOP
-- role on the same node (duplicates rule); France is not an appellation.
update wine_places set
  is_appellation = true,
  appellation_system = 'AOC/AOP',
  appellation_level = case canonical_key
    when 'france.bordeaux' then 'regional'
    when 'france.bordeaux.medoc' then 'subregional'
    when 'france.bordeaux.haut-medoc' then 'subregional'
    when 'france.bordeaux.graves' then 'subregional'
    when 'france.bordeaux.pessac-leognan' then 'subregional'
    when 'france.bordeaux.saint-emilion' then 'communal'
    when 'france.bordeaux.pomerol' then 'communal'
    when 'france.bordeaux.sauternes' then 'communal'
    when 'france.bordeaux.sauternes.barsac' then 'communal'
    when 'france.bordeaux.haut-medoc.margaux' then 'communal'
    when 'france.bordeaux.haut-medoc.pauillac' then 'communal'
    when 'france.bordeaux.haut-medoc.saint-julien' then 'communal'
    when 'france.bordeaux.haut-medoc.saint-estephe' then 'communal'
  end
where canonical_key like 'france.%';

do $$
declare
  v_count int;
begin
  select count(*) into v_count from wine_places where is_appellation;
  if v_count <> 13 then
    raise exception 'expected 13 appellation-role places, got %', v_count;
  end if;
  select count(*) into v_count
  from wine_places where is_appellation and appellation_level is null;
  if v_count <> 0 then
    raise exception '% appellation places missing a level', v_count;
  end if;
end;
$$;
```

- [ ] **Step 4: Dry-run GREEN, apply live, live GREEN**

```powershell
if (-not $env:DB_PASSWORD) { throw "Set DB_PASSWORD first." }
$env:WORLD_WINE_MAP_MIGRATIONS = "supabase/migrations/20260801090000_wine_place_classification.sql"
node --test --test-concurrency=1 scripts/world-wine-map-foundation.test.mjs
$dry = $LASTEXITCODE
Remove-Item Env:WORLD_WINE_MAP_MIGRATIONS
if ($dry -ne 0) { Remove-Item Env:DB_PASSWORD; throw "dry run failed." }
node scripts/scratch-apply-phase3.mjs supabase/migrations/20260801090000_wine_place_classification.sql
if ($LASTEXITCODE -ne 0) { Remove-Item Env:DB_PASSWORD; throw "live apply failed." }
node --test --test-concurrency=1 scripts/world-wine-map-foundation.test.mjs
$live = $LASTEXITCODE
Remove-Item Env:DB_PASSWORD
if ($live -ne 0) { throw "live tests failed." }
```

Expected: dry-run all pass + concurrency skip; live apply prints `Applied 20260801090000 wine_place_classification.`; live run fully green (concurrency test included).

- [ ] **Step 5: Types**

In `src/lib/supabase/database.types.ts`: extend the union
`WinePlaceRelationshipType` with `| "REPLACES_WITHIN" | "DUAL_LABEL"`; add to
`wine_places` Row `is_appellation: boolean; appellation_system: string | null;
appellation_level: string | null;` and to Insert the optional forms
(`is_appellation?: boolean; appellation_system?: string | null;
appellation_level?: string | null;`). In
`world-wine-map-database.type-test.ts` append:

```ts
export type ClassificationFactsContract = Expect<
  Equal<
    Pick<WinePlace, "is_appellation" | "appellation_system" | "appellation_level">,
    {
      is_appellation: boolean;
      appellation_system: string | null;
      appellation_level: string | null;
    }
  >
>;
export type LegalRelationshipContract = Expect<
  Equal<
    WinePlaceRelationshipType,
    | "OVERLAPS"
    | "ALTERNATE_PARENT"
    | "RELATED"
    | "REPLACES_WITHIN"
    | "DUAL_LABEL"
  >
>;
```

Verify: `npx tsc --noEmit` exits 0; targeted eslint on both files exits 0.

- [ ] **Step 6: Commit Task 1**

```powershell
git add supabase/migrations/20260801090000_wine_place_classification.sql scripts/world-wine-map-foundation.test.mjs src/lib/supabase/database.types.ts src/lib/supabase/world-wine-map-database.type-test.ts
if ($LASTEXITCODE -ne 0) { throw "git add failed." }
git commit -m "feat: add wine place classification schema"
if ($LASTEXITCODE -ne 0) { throw "commit failed." }
Remove-Item scripts/scratch-apply-phase3.mjs -ErrorAction SilentlyContinue
```

### Task 2: INAO Adapter Library (TDD)

**Files:**
- Create: `scripts/wine-map-sources/inao-lib.mjs`
- Create: `scripts/wine-map-sources/inao-lib.test.mjs`

**Interfaces:**
- Consumes: `pgConfig`, `sha256hex`, `releaseVersion` re-used from `scripts/wine-map-tiles/lib.mjs`; the committed membership file.
- Produces: `splitDenominations`, `parcelMatches`, `loadMembership`, `assertKnownDenominations`, `wfsPageUrl`, `rawObjectPath`, `uploadRawObject`, constants (`SOURCE_NAMESPACE`, `RAW_BUCKET`, `PAGE_SIZE`, `WFS_BASE`, `PARCEL_LAYER`, `MEMBERSHIP_FILE`) for Tasks 3–5.

- [ ] **Step 1: Write the failing tests**

Create `scripts/wine-map-sources/inao-lib.test.mjs`:

```js
import assert from "node:assert/strict";
import test from "node:test";
import {
  assertKnownDenominations,
  loadMembership,
  parcelMatches,
  rawObjectPath,
  splitDenominations,
  wfsPageUrl,
  PAGE_SIZE,
  RAW_BUCKET,
  SOURCE_NAMESPACE,
} from "./inao-lib.mjs";

test("splitDenominations honors the comma-not-followed-by-space rule", () => {
  assert.deepEqual(splitDenominations("Barsac,Bordeaux,Bordeaux supérieur"), [
    "Barsac",
    "Bordeaux",
    "Bordeaux supérieur",
  ]);
  assert.deepEqual(splitDenominations("Côtes de Bourg, Bourg et Bourgeais"), [
    "Côtes de Bourg, Bourg et Bourgeais",
  ]);
  assert.deepEqual(
    splitDenominations(
      "Blaye,Bordeaux,Côtes de Bourg, Bourg et Bourgeais,Crémant de Bordeaux",
    ),
    ["Blaye", "Bordeaux", "Côtes de Bourg, Bourg et Bourgeais", "Crémant de Bordeaux"],
  );
  assert.deepEqual(splitDenominations(null), []);
});

test("parcelMatches is exact membership, not substring", () => {
  assert.equal(parcelMatches("Aloxe-Corton,Bourgogne,Crémant de Bourgogne", "Bourgogne"), true);
  assert.equal(parcelMatches("Crémant de Bourgogne", "Bourgogne"), false);
  assert.equal(
    parcelMatches("Blaye,Côtes de Bourg, Bourg et Bourgeais", "Côtes de Bourg, Bourg et Bourgeais"),
    true,
  );
});

test("membership file backs the allowlist", async () => {
  const membership = await loadMembership();
  assert.equal(membership.get("Bourgogne"), 16855);
  assert.equal(membership.get("Fronsac"), 70);
  assert.equal(membership.get("Canon Fronsac"), 20);
  assert.equal(membership.get("Blaye"), 680);
  assert.equal(membership.get("Entre-deux-Mers"), 1199);
  assert.equal(membership.get("Côtes de Bourg, Bourg et Bourgeais"), 147);
  assert.equal(membership.has("Champagne"), false);
  assertKnownDenominations(["Bourgogne", "Fronsac"], membership);
  assert.throws(
    () => assertKnownDenominations(["Champagne"], membership),
    /Unknown denominations: Champagne/,
  );
});

test("wfsPageUrl bounds with LIKE, sorts deterministically, escapes quotes", () => {
  // URLSearchParams form-encodes spaces as "+", which decodeURIComponent
  // does NOT undo — assert on the parsed parameter, not the raw string.
  const url = wfsPageUrl("L'Étoile", 5000);
  const params = new URL(url).searchParams;
  assert.equal(params.get("sortBy"), "gml_id");
  assert.equal(params.get("count"), String(PAGE_SIZE));
  assert.equal(params.get("startIndex"), "5000");
  assert.equal(params.get("cql_filter"), "denom LIKE '%L''Étoile%'");
});

test("raw object paths are namespaced and versioned", () => {
  assert.equal(RAW_BUCKET, "wine-map-sources");
  assert.equal(
    rawObjectPath("20260721T150000Z", "bourgogne", "bourgogne-page-0.json"),
    `${SOURCE_NAMESPACE}/20260721T150000Z/bourgogne/bourgogne-page-0.json`,
  );
});
```

Run RED: `node --test scripts/wine-map-sources/inao-lib.test.mjs` → FAIL with `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 2: Implement `scripts/wine-map-sources/inao-lib.mjs`**

```js
// INAO parcel-source adapter library (namespace IGN_INAO_AOC_VITICOLES).
// Pure denomination/paging helpers are unit-testable without network or
// credentials; storage access mirrors scripts/wine-map-tiles/lib.mjs but
// binds the private wine-map-sources bucket.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL } from "../wine-map-tiles/lib.mjs";

export const WFS_BASE = "https://data.geopf.fr/wfs/ows";
export const PARCEL_LAYER = "AOC-VITICOLES:aire_parcellaire";
export const SOURCE_NAMESPACE = "IGN_INAO_AOC_VITICOLES";
export const RAW_BUCKET = "wine-map-sources";
export const MEMBERSHIP_FILE = "data/wine-map/inao-denomination-membership.json";
export const PAGE_SIZE = 5000;
export const WFS_LICENCE = "Licence Ouverte Etalab";

// denom is a comma-separated combination of every denomination the parcel
// belongs to; separator commas carry no trailing space, while comma+space
// occurs inside denomination names ("Côtes de Bourg, Bourg et Bourgeais").
export function splitDenominations(combo) {
  return String(combo ?? "")
    .split(/,(?! )/)
    .map((name) => name.trim())
    .filter(Boolean);
}

export function parcelMatches(comboString, denomination) {
  return splitDenominations(comboString).includes(denomination);
}

export async function loadMembership() {
  const fileUrl = new URL(`../../${MEMBERSHIP_FILE}`, import.meta.url);
  const parsed = JSON.parse(await readFile(fileUrl, "utf8"));
  return new Map(Object.entries(parsed.membership));
}

export function assertKnownDenominations(names, membership) {
  const unknown = names.filter((name) => !membership.has(name));
  assert.equal(
    unknown.length,
    0,
    `Unknown denominations: ${unknown.join(" | ")}`,
  );
}

// LIKE bounds the server-side transfer (equality would undercount ~35x —
// see the Phase 3 spec); exact membership happens client-side. Single
// quotes double inside CQL string literals.
export function wfsPageUrl(denomination, startIndex) {
  const literal = denomination.replaceAll("'", "''");
  const params = new URLSearchParams({
    SERVICE: "WFS",
    VERSION: "2.0.0",
    REQUEST: "GetFeature",
    TYPENAMES: PARCEL_LAYER,
    outputFormat: "application/json",
    count: String(PAGE_SIZE),
    startIndex: String(startIndex),
    sortBy: "gml_id",
    cql_filter: `denom LIKE '%${literal}%'`,
  });
  return `${WFS_BASE}?${params.toString()}`;
}

export function rawObjectPath(revision, slug, filename) {
  return `${SOURCE_NAMESPACE}/${revision}/${slug}/${filename}`;
}

function cleanSecret(value) {
  return value?.trim().replace(/^["']|["']$/g, "").trim();
}

function rawBucket() {
  const serviceRoleKey = cleanSecret(process.env.SUPABASE_SERVICE_ROLE_KEY);
  assert.ok(serviceRoleKey, "SUPABASE_SERVICE_ROLE_KEY is required");
  return createClient(SUPABASE_URL, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  }).storage.from(RAW_BUCKET);
}

export async function uploadRawObject(objectPath, body, contentType = "application/json") {
  const { error } = await rawBucket().upload(objectPath, body, {
    contentType,
    cacheControl: "3600",
    upsert: false,
  });
  if (error) throw new Error(`Upload ${objectPath} failed: ${error.message}`);
}
```

Note: `SUPABASE_URL` must be exported from `scripts/wine-map-tiles/lib.mjs` — it already is (Phase 2A). If eslint objects to the cross-directory import, prefer fixing the import path over duplicating the constant.

- [ ] **Step 3: GREEN + commit**

```powershell
node --test scripts/wine-map-sources/inao-lib.test.mjs
if ($LASTEXITCODE -ne 0) { throw "lib tests failed." }
npx eslint scripts/wine-map-sources/inao-lib.mjs scripts/wine-map-sources/inao-lib.test.mjs
if ($LASTEXITCODE -ne 0) { throw "eslint failed." }
git add scripts/wine-map-sources/inao-lib.mjs scripts/wine-map-sources/inao-lib.test.mjs
if ($LASTEXITCODE -ne 0) { throw "git add failed." }
git commit -m "feat: add INAO parcel adapter library"
if ($LASTEXITCODE -ne 0) { throw "commit failed." }
```

---

### Task 3: Fetch And Boundary-Build Tooling + Sources Bucket

**Files:**
- Create: `supabase/migrations/20260801093000_wine_map_sources_bucket.sql`
- Create: `scripts/wine-map-sources/fetch-inao-denomination.mjs`
- Create: `scripts/wine-map-sources/build-boundary.mjs`
- Scratch, then delete: `scripts/scratch-apply-phase3.mjs` (recreate as in Task 1)

**Interfaces:**
- Consumes: Task 2 library; `pgConfig`, `sha256hex`, `releaseVersion` from `scripts/wine-map-tiles/lib.mjs`.
- Produces: `fetch-inao-denomination.mjs --slug <s> --target-key <key> --members "<name>;<name>…"` → raw pages + manifest in Storage, filtered parcels + local manifest under `.tiles-build/sources/`; `build-boundary.mjs --slug <s> --target-key <key> [--closing 0.02] [--tolerance 0.005] [--min-share 0.02]` → source+snapshot rows and one `DRAFT`, non-current `wine_place_boundaries` row, plus an SVG preview under `.superpowers/sdd/`.

- [ ] **Step 1: Bucket migration**

Create `supabase/migrations/20260801093000_wine_map_sources_bucket.sql`:

```sql
-- Private bucket for immutable raw source artifacts (WFS page responses,
-- fetch manifests, normalized dissolve outputs). No storage.objects
-- policies: anon/authenticated cannot read or write; the service role
-- (adapter scripts) bypasses RLS. Public URLs are never handed out —
-- snapshot rows store bucket-relative storage URIs.
insert into storage.buckets (id, name, public)
values ('wine-map-sources', 'wine-map-sources', false)
on conflict (id) do update set public = false;
```

Apply live via the scratch applier (same contingency as 2A: if `storage.buckets` insert is denied, create in the dashboard and still record the migration). Verify with a service-role upload+download round-trip of a tiny probe object, then remove the probe.

- [ ] **Step 2: Implement `fetch-inao-denomination.mjs`**

```js
// Fetch one denomination set from the INAO parcel layer: page the WFS with
// a LIKE bound per member, filter to exact membership client-side, retain
// the UNMODIFIED page bodies in Storage, and write the filtered parcels +
// manifest locally for build-boundary.mjs. Read-only against the WFS; no
// database writes here (source/snapshot rows are created at build time,
// when the normalized artifact exists).
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { releaseVersion, sha256hex } from "../wine-map-tiles/lib.mjs";
import {
  assertKnownDenominations,
  loadMembership,
  parcelMatches,
  rawObjectPath,
  uploadRawObject,
  wfsPageUrl,
  PAGE_SIZE,
  WFS_BASE,
} from "./inao-lib.mjs";

function arg(name, required = true) {
  const index = process.argv.indexOf(`--${name}`);
  const value = index === -1 ? null : process.argv[index + 1];
  if (required) assert.ok(value, `--${name} is required`);
  return value;
}

const slug = arg("slug");
const targetKey = arg("target-key");
const members = arg("members")
  .split(";")
  .map((name) => name.trim())
  .filter(Boolean);
assert.ok(/^[a-z0-9-]+$/.test(slug), "slug must be kebab-case");
assert.ok(members.length > 0, "at least one member denomination");

const membership = await loadMembership();
assertKnownDenominations(members, membership);
const expectedMinimum = Math.max(...members.map((m) => membership.get(m)));

const revision = releaseVersion();
const workDir = path.resolve(".tiles-build", "sources");
await mkdir(workDir, { recursive: true });

const featuresById = new Map();
const pages = [];
for (const member of members) {
  const memberSlug = member
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  let startIndex = 0;
  for (;;) {
    const url = wfsPageUrl(member, startIndex);
    const response = await fetch(url);
    assert.equal(response.status, 200, `WFS ${response.status} for ${member}`);
    const text = await response.text();
    // Raw pages are retained gzipped: regional LIKE bounds pull hundreds of
    // MB of GeoJSON, ~8-10x smaller compressed. The checksum covers the
    // stored (gzipped) bytes; the page is still the unmodified response —
    // gunzip reproduces it exactly.
    const gzipped = gzipSync(Buffer.from(text));
    const objectPath = rawObjectPath(
      revision,
      slug,
      `${memberSlug}-page-${startIndex / PAGE_SIZE}.json.gz`,
    );
    await uploadRawObject(objectPath, gzipped, "application/gzip");
    const page = JSON.parse(text);
    const features = page.features ?? [];
    pages.push({
      member,
      object_path: objectPath,
      content_encoding: "gzip",
      bytes: gzipped.byteLength,
      uncompressed_bytes: Buffer.byteLength(text),
      checksum_sha256: sha256hex(gzipped),
      returned: features.length,
      total_matched: page.totalFeatures ?? page.numberMatched ?? null,
    });
    for (const feature of features) {
      if (!parcelMatches(feature.properties?.denom, member)) continue;
      featuresById.set(feature.id ?? feature.properties?.gml_id, feature);
    }
    startIndex += features.length;
    const totalMatched = page.totalFeatures ?? page.numberMatched ?? null;
    if (features.length === 0) break;
    if (totalMatched !== null && startIndex >= totalMatched) break;
    if (totalMatched === null && features.length < PAGE_SIZE) break;
  }
}

assert.ok(
  featuresById.size >= expectedMinimum,
  `filtered ${featuresById.size} parcels < expected minimum ${expectedMinimum}`,
);

const manifest = {
  source: WFS_BASE,
  slug,
  target_key: targetKey,
  members,
  revision,
  retrieved_at: new Date().toISOString(),
  page_size: PAGE_SIZE,
  pages,
  filtered_parcels: featuresById.size,
};
const manifestBody = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`);
const manifestPath = rawObjectPath(revision, slug, "fetch-manifest.json");
await uploadRawObject(manifestPath, manifestBody);

await writeFile(
  path.join(workDir, `${slug}-fetch-manifest.json`),
  `${JSON.stringify(
    { ...manifest, manifest_object_path: manifestPath, manifest_checksum_sha256: sha256hex(manifestBody) },
    null,
    2,
  )}\n`,
);
await writeFile(
  path.join(workDir, `${slug}-parcels.geojson`),
  `${JSON.stringify({ type: "FeatureCollection", features: [...featuresById.values()] })}\n`,
);
console.log(
  `FETCHED ${slug} members=${members.length} parcels=${featuresById.size} revision=${revision}`,
);
```

- [ ] **Step 3: Implement `build-boundary.mjs`**

```js
// Dissolve fetched parcels into one generalized region footprint using
// PostGIS (union -> closing buffer -> topology-preserving simplify ->
// small-component filter -> 4-decimal quantization), create the
// source/snapshot provenance rows, and stage a DRAFT, non-current
// wine_place_boundaries row. Review (a later task) flips it current.
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { execSync } from "node:child_process";
import pg from "pg";
import { pgConfig, sha256hex } from "../wine-map-tiles/lib.mjs";
import { rawObjectPath, uploadRawObject, SOURCE_NAMESPACE, WFS_LICENCE } from "./inao-lib.mjs";

function arg(name, fallback = null) {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? fallback : process.argv[index + 1];
}
const slug = arg("slug");
const targetKey = arg("target-key");
assert.ok(slug && targetKey, "--slug and --target-key are required");
const closing = Number(arg("closing", "0.02"));
const tolerance = Number(arg("tolerance", "0.005"));
const minShare = Number(arg("min-share", "0.02"));

const workDir = path.resolve(".tiles-build", "sources");
const parcels = JSON.parse(
  await readFile(path.join(workDir, `${slug}-parcels.geojson`), "utf8"),
);
const fetchManifest = JSON.parse(
  await readFile(path.join(workDir, `${slug}-fetch-manifest.json`), "utf8"),
);
assert.equal(fetchManifest.slug, slug);
assert.equal(fetchManifest.target_key, targetKey);
assert.ok(parcels.features.length > 0, "no parcels to dissolve");

const client = new pg.Client(pgConfig());
await client.connect();
try {
  await client.query("begin");
  await client.query(
    "create temporary table _parcels (geom extensions.geometry) on commit drop",
  );
  const batchSize = 200;
  for (let i = 0; i < parcels.features.length; i += batchSize) {
    const batch = parcels.features.slice(i, i + batchSize);
    const values = batch.map((_, j) =>
      `(extensions.ST_SetSRID(extensions.ST_GeomFromGeoJSON($${j + 1}), 4326))`,
    );
    await client.query(
      `insert into _parcels (geom) values ${values.join(", ")}`,
      batch.map((feature) => JSON.stringify(feature.geometry)),
    );
  }

  const dissolved = await client.query(
    `with u as (select extensions.ST_Union(geom) g from _parcels),
     closed as (
       select extensions.ST_MakeValid(
         extensions.ST_Buffer(extensions.ST_Buffer(g, $1), -$1)
       ) g from u
     ),
     simplified as (
       select extensions.ST_MakeValid(
         extensions.ST_SimplifyPreserveTopology(g, $2)
       ) g from closed
     ),
     parts as (
       select (extensions.ST_Dump(extensions.ST_Multi(g))).geom part
       from simplified
     ),
     measured as (
       select part, extensions.ST_Area(part) area,
              sum(extensions.ST_Area(part)) over () total
       from parts
     ),
     kept as (
       select extensions.ST_Multi(extensions.ST_Collect(part)) g
       from measured where area / total >= $3
     )
     select extensions.ST_AsGeoJSON(
       extensions.ST_MakeValid(g), 4
     ) geojson from kept`,
    [closing, tolerance, minShare],
  );
  const geojson = dissolved.rows[0]?.geojson;
  assert.ok(geojson, "dissolve produced no geometry");

  const normalizedFeature = {
    type: "Feature",
    properties: {
      target_key: targetKey,
      members: fetchManifest.members,
      generation: { closing_buffer: closing, simplify_tolerance: tolerance, min_component_area_share: minShare, coordinate_precision: 4 },
    },
    geometry: JSON.parse(geojson),
  };
  const normalizedBody = Buffer.from(`${JSON.stringify(normalizedFeature)}\n`);
  const normalizedPath = rawObjectPath(fetchManifest.revision, slug, "normalized.geojson");
  await uploadRawObject(normalizedPath, normalizedBody);

  const result = await client.query(
    `with place as (
       select id from wine_places where canonical_key = $1
     ),
     source as (
       insert into wine_boundary_sources (source_namespace, source_feature_id, authority, jurisdiction)
       values ($2, $3, 'IGN / INAO', 'France')
       on conflict (source_namespace, source_feature_id) do update set authority = excluded.authority
       returning id
     ),
     snapshot as (
       insert into wine_boundary_source_snapshots (
         source_id, source_revision, retrieved_at, source_url, licence,
         raw_snapshot_uri, raw_checksum_sha256,
         normalized_artifact_uri, normalized_checksum_sha256,
         provenance_note, importer_version
       )
       select source.id, $4, $5, $6, $7,
              $8, $9, $10, $11,
              'Raw artifacts are the unmodified WFS page responses listed in the fetch manifest.',
              $12
       from source
       returning id
     ),
     geom as (
       select extensions.ST_Multi(extensions.ST_MakeValid(
         extensions.ST_SetSRID(extensions.ST_GeomFromGeoJSON($13), 4326)
       )) g
     )
     insert into wine_place_boundaries (
       wine_place_id, source_snapshot_id, boundary_method, quality_status,
       display_geometry, label_point, bbox, source_feature_refs,
       generation_parameters, revision, is_current, reviewed_at
     )
     select place.id, snapshot.id, 'GENERALIZED_FROM_OFFICIAL_SOURCE', 'DRAFT',
            geom.g, extensions.ST_PointOnSurface(geom.g),
            array[
              extensions.ST_XMin(extensions.Box3D(geom.g)),
              extensions.ST_YMin(extensions.Box3D(geom.g)),
              extensions.ST_XMax(extensions.Box3D(geom.g)),
              extensions.ST_YMax(extensions.Box3D(geom.g))
            ]::double precision[],
            jsonb_build_object('dataset', 'AOC-VITICOLES:aire_parcellaire', 'members', $14::jsonb, 'filtered_parcels', $15::int),
            jsonb_build_object('closing_buffer', $16::numeric, 'simplify_tolerance', $17::numeric, 'min_component_area_share', $18::numeric, 'coordinate_precision', 4),
            $4, false, null
     from place, source, snapshot, geom
     returning id`,
    [
      targetKey,
      SOURCE_NAMESPACE,
      `denomset:${slug}`,
      fetchManifest.revision,
      fetchManifest.retrieved_at,
      "https://data.geopf.fr/wfs/ows",
      WFS_LICENCE,
      `storage://wine-map-sources/${fetchManifest.manifest_object_path}`,
      fetchManifest.manifest_checksum_sha256,
      `storage://wine-map-sources/${normalizedPath}`,
      sha256hex(normalizedBody),
      `scripts/wine-map-sources/build-boundary.mjs@${process.env.GITHUB_SHA ?? execSync("git rev-parse HEAD").toString().trim()}`,
      geojson,
      JSON.stringify(fetchManifest.members),
      parcels.features.length,
      closing,
      tolerance,
      minShare,
    ],
  );
  assert.equal(result.rows.length, 1, "expected one staged boundary row");

  // Preview renders BEFORE commit: a preview failure rolls the staged row
  // back rather than leaving an unreviewable DRAFT behind.
  const geometry = JSON.parse(geojson);
  const rings = geometry.coordinates.flat(1);
  const all = rings.flat(1);
  const xs = all.map(([x]) => x);
  const ys = all.map(([, y]) => y);
  const [minX, maxX] = [Math.min(...xs), Math.max(...xs)];
  const [minY, maxY] = [Math.min(...ys), Math.max(...ys)];
  const scale = 800 / Math.max(maxX - minX, maxY - minY);
  const paths = geometry.coordinates
    .map((poly) =>
      poly
        .map(
          (ring) =>
            `M${ring
              .map(([x, y]) => `${((x - minX) * scale).toFixed(1)},${((maxY - y) * scale).toFixed(1)}`)
              .join("L")}Z`,
        )
        .join(""),
    )
    .join("");
  await writeFile(
    `.superpowers/sdd/preview-${slug}.svg`,
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${((maxX - minX) * scale).toFixed(0)} ${((maxY - minY) * scale).toFixed(0)}"><path d="${paths}" fill="#5C1A2B" fill-opacity="0.35" stroke="#5C1A2B"/></svg>\n`,
  );
  await client.query("commit");
  console.log(
    `BOUNDARY-STAGED ${slug} -> ${targetKey} boundary=${result.rows[0].id} vertices=${all.length} components=${geometry.coordinates.length}`,
  );
} catch (error) {
  await client.query("rollback").catch(() => undefined);
  throw error;
} finally {
  await client.end();
}
```

- [ ] **Step 4: Verify and commit Task 3**

```powershell
node --check scripts/wine-map-sources/fetch-inao-denomination.mjs
if ($LASTEXITCODE -ne 0) { throw "fetch syntax failed." }
node --check scripts/wine-map-sources/build-boundary.mjs
if ($LASTEXITCODE -ne 0) { throw "build syntax failed." }
node --test scripts/wine-map-sources/inao-lib.test.mjs
if ($LASTEXITCODE -ne 0) { throw "lib tests failed." }
npx eslint scripts/wine-map-sources/fetch-inao-denomination.mjs scripts/wine-map-sources/build-boundary.mjs
if ($LASTEXITCODE -ne 0) { throw "eslint failed." }
git add supabase/migrations/20260801093000_wine_map_sources_bucket.sql scripts/wine-map-sources/fetch-inao-denomination.mjs scripts/wine-map-sources/build-boundary.mjs
if ($LASTEXITCODE -ne 0) { throw "git add failed." }
git commit -m "feat: add INAO fetch and boundary build tooling"
if ($LASTEXITCODE -ne 0) { throw "commit failed." }
```

Execution of the tooling happens in Tasks 4–5 (per target), not here. The
`storage://` URI scheme is deliberate: raw artifacts live in a private
bucket, so public URLs would be dishonest — consumers resolve via the
service role.

### Task 4: Corrected Bordeaux Tree

**Files:**
- Create: `supabase/migrations/20260802090000_bordeaux_tree_correction.sql`
- Modify: `scripts/world-wine-map-foundation.test.mjs`, `scripts/wine-place-context.test.mjs` (expectations)
- Live tooling runs (no committed output beyond Storage + staged DRAFT rows)

**Interfaces:**
- Consumes Tasks 1–3. Produces: 5 new `DRAFT` places, corrected `primary_parent_id` tree, 2 legal edges, 7 staged `DRAFT` boundaries (5 new appellations + widened Graves and Médoc grouping footprints).

**Execution order within this task (checkbox numbering is by artifact, not sequence):** (1) write the Step 2 migration and stage the classification expectations (13 → 18), (2) dry-run + live apply it — the tooling needs the new target keys to exist, (3) run Step 1's tooling list, (4) apply Step 3's boundary/provenance and context expectations, run both suites live, commit.

- [ ] **Step 1: Stage the seven boundaries (live tooling runs, after the migration is applied)**

With `DB_PASSWORD` + `SUPABASE_SERVICE_ROLE_KEY` set for the process (removed after), run per target — `$LASTEXITCODE` checked after every command; expected `FETCHED …` then `BOUNDARY-STAGED …`. The five appellations use tighter generalization (`--closing 0.01 --tolerance 0.002`); the two groupings use defaults:

```powershell
node scripts/wine-map-sources/fetch-inao-denomination.mjs --slug fronsac --target-key france.bordeaux.fronsac --members "Fronsac"
node scripts/wine-map-sources/build-boundary.mjs --slug fronsac --target-key france.bordeaux.fronsac --closing 0.01 --tolerance 0.002
node scripts/wine-map-sources/fetch-inao-denomination.mjs --slug canon-fronsac --target-key france.bordeaux.canon-fronsac --members "Canon Fronsac"
node scripts/wine-map-sources/build-boundary.mjs --slug canon-fronsac --target-key france.bordeaux.canon-fronsac --closing 0.01 --tolerance 0.002
node scripts/wine-map-sources/fetch-inao-denomination.mjs --slug blaye --target-key france.bordeaux.blaye --members "Blaye"
node scripts/wine-map-sources/build-boundary.mjs --slug blaye --target-key france.bordeaux.blaye --closing 0.01 --tolerance 0.002
node scripts/wine-map-sources/fetch-inao-denomination.mjs --slug cotes-de-bourg --target-key france.bordeaux.cotes-de-bourg --members "Côtes de Bourg, Bourg et Bourgeais"
node scripts/wine-map-sources/build-boundary.mjs --slug cotes-de-bourg --target-key france.bordeaux.cotes-de-bourg --closing 0.01 --tolerance 0.002
node scripts/wine-map-sources/fetch-inao-denomination.mjs --slug entre-deux-mers --target-key france.bordeaux.entre-deux-mers --members "Entre-deux-Mers"
node scripts/wine-map-sources/build-boundary.mjs --slug entre-deux-mers --target-key france.bordeaux.entre-deux-mers --closing 0.01 --tolerance 0.002
node scripts/wine-map-sources/fetch-inao-denomination.mjs --slug graves-grouping --target-key france.bordeaux.graves --members "Graves;Pessac-Léognan;Sauternes;Barsac"
node scripts/wine-map-sources/build-boundary.mjs --slug graves-grouping --target-key france.bordeaux.graves
node scripts/wine-map-sources/fetch-inao-denomination.mjs --slug medoc-grouping --target-key france.bordeaux.medoc --members "Médoc;Haut-Médoc"
node scripts/wine-map-sources/build-boundary.mjs --slug medoc-grouping --target-key france.bordeaux.medoc
```

- [ ] **Step 2: The correction migration**

Create `supabase/migrations/20260802090000_bordeaux_tree_correction.sql`:

```sql
-- Phase 3A Bordeaux correction (owner-approved target tree, addendum
-- 2026-07-21): Graves and Médoc become dual-role grouping nodes (one-node
-- duplicates rule), Pessac-Léognan + Sauternes reparent under Graves,
-- Haut-Médoc under Médoc; five new appellations enter as DRAFT places;
-- two sourced legal edges are recorded. Canonical keys never change.
do $$
declare
  v_bordeaux uuid;
  v_graves uuid;
  v_medoc uuid;
  v_count int;
begin
  select id into v_bordeaux from wine_places where canonical_key = 'france.bordeaux';
  select id into v_graves from wine_places where canonical_key = 'france.bordeaux.graves';
  select id into v_medoc from wine_places where canonical_key = 'france.bordeaux.medoc';
  if v_bordeaux is null or v_graves is null or v_medoc is null then
    raise exception 'expected bordeaux/graves/medoc places to exist';
  end if;

  insert into wine_places (
    primary_parent_id, kind, canonical_key, name, slug, display_tier,
    min_zoom, label_min_zoom, publication_status, sort_order,
    is_appellation, appellation_system, appellation_level
  ) values
    (v_bordeaux, 'APPELLATION', 'france.bordeaux.fronsac', 'Fronsac', 'fronsac', 2, 7, 7, 'DRAFT', 60, true, 'AOC/AOP', 'communal'),
    (v_bordeaux, 'APPELLATION', 'france.bordeaux.canon-fronsac', 'Canon-Fronsac', 'canon-fronsac', 2, 7, 7, 'DRAFT', 61, true, 'AOC/AOP', 'communal'),
    (v_bordeaux, 'APPELLATION', 'france.bordeaux.blaye', 'Blaye', 'blaye', 2, 7, 7, 'DRAFT', 62, true, 'AOC/AOP', 'subregional'),
    (v_bordeaux, 'APPELLATION', 'france.bordeaux.cotes-de-bourg', 'Côtes de Bourg', 'cotes-de-bourg', 2, 7, 7, 'DRAFT', 63, true, 'AOC/AOP', 'subregional'),
    (v_bordeaux, 'APPELLATION', 'france.bordeaux.entre-deux-mers', 'Entre-deux-Mers', 'entre-deux-mers', 2, 7, 7, 'DRAFT', 64, true, 'AOC/AOP', 'subregional');
  get diagnostics v_count = row_count;
  if v_count <> 5 then raise exception 'expected 5 new places, got %', v_count; end if;

  update wine_places set primary_parent_id = v_graves
  where canonical_key in ('france.bordeaux.pessac-leognan', 'france.bordeaux.sauternes');
  get diagnostics v_count = row_count;
  if v_count <> 2 then raise exception 'expected 2 reparents under graves, got %', v_count; end if;

  update wine_places set primary_parent_id = v_medoc
  where canonical_key = 'france.bordeaux.haut-medoc';
  get diagnostics v_count = row_count;
  if v_count <> 1 then raise exception 'expected haut-medoc reparent, got %', v_count; end if;

  insert into wine_place_relationships (source_place_id, target_place_id, relationship_type, note)
  select s.id, t.id, 'REPLACES_WITHIN',
         'Pessac-Léognan AOC (1987) replaces Graves AOC within its boundaries; producers inside cannot label Graves. Source: INAO cahier des charges Pessac-Léognan.'
  from wine_places s, wine_places t
  where s.canonical_key = 'france.bordeaux.pessac-leognan'
    and t.canonical_key = 'france.bordeaux.graves';

  insert into wine_place_relationships (source_place_id, target_place_id, relationship_type, note)
  select s.id, t.id, 'DUAL_LABEL',
         'Barsac producers may label Barsac AOC or Sauternes AOC; other Sauternes communes cannot use Barsac. Source: INAO cahiers des charges Barsac / Sauternes.'
  from wine_places s, wine_places t
  where s.canonical_key = 'france.bordeaux.sauternes.barsac'
    and t.canonical_key = 'france.bordeaux.sauternes';

  select count(*) into v_count from wine_place_relationships
  where relationship_type in ('REPLACES_WITHIN', 'DUAL_LABEL');
  if v_count <> 2 then raise exception 'expected 2 legal edges, got %', v_count; end if;

  select count(*) into v_count from wine_places where canonical_key like 'france%';
  if v_count <> 19 then raise exception 'expected 19 france places, got %', v_count; end if;
end;
$$;
```

- [ ] **Step 3: Dry-run, live apply, tooling, expectations, commit**

Stage the expectation updates around the dry-run — a single state cannot satisfy both the dry-run (boundaries still at the live 15 rows) and the post-tooling live suite (22): FIRST update the Task 1 classification test's counts (`appellations` and `aoc` both 13 → 18), THEN dry-run this migration through the foundation harness, live apply via the scratch applier, run Step 1's tooling, and only then apply the boundary/provenance expectation updates below. Update expectations:

- `scripts/wine-place-context.test.mjs`: the suite's default connection is the table-owning pooler role, which RLS does NOT filter — Bordeaux children become **9 immediately** (4 VERIFIED + 5 DRAFT); assert `length === 9` there. DRAFT-hiding is asserted where RLS actually applies: inside the existing `set local role authenticated` test, assert Bordeaux children `length === 4` (Task 6 flips that assertion to 9 when the places publish). Margaux ancestors become `["france","france.bordeaux","france.bordeaux.medoc","france.bordeaux.haut-medoc"]`; Graves children keys `["france.bordeaux.pessac-leognan","france.bordeaux.sauternes"]`.
- `scripts/world-wine-map-foundation.test.mjs`: boundary counts `total: 22, validated: 15, current: 14, valid: 22, labelled: 22, manual: 2, generalized: 20, reproducible: 13`; provenance `sources: 22, snapshots: 22, identities: 22, linked_boundaries: 22`; classification appellation count `13 → 18`.

Both suites live green, then:

```powershell
git add supabase/migrations/20260802090000_bordeaux_tree_correction.sql scripts/world-wine-map-foundation.test.mjs scripts/wine-place-context.test.mjs
if ($LASTEXITCODE -ne 0) { throw "git add failed." }
git commit -m "feat: correct bordeaux tree with new sourced appellations"
if ($LASTEXITCODE -ne 0) { throw "commit failed." }
```

---

### Task 5: Bourgogne Pilot Region

**Files:**
- Create: `supabase/migrations/20260802093000_bourgogne_region.sql`
- Modify: `scripts/world-wine-map-foundation.test.mjs` (counts)

Migration:

```sql
-- Bourgogne pilot region: dual-role node (region == Bourgogne AOC,
-- duplicates rule), French display name, tier-1 zooms matching Bordeaux.
insert into wine_places (
  primary_parent_id, kind, canonical_key, name, slug, display_tier,
  min_zoom, label_min_zoom, publication_status, sort_order,
  is_appellation, appellation_system, appellation_level
)
select p.id, 'REGION', 'france.bourgogne', 'Bourgogne', 'bourgogne', 1, 4, 4,
       'DRAFT', 10, true, 'AOC/AOP', 'regional'
from wine_places p where p.canonical_key = 'france';

do $$
declare v int;
begin
  select count(*) into v from wine_places where canonical_key = 'france.bourgogne';
  if v <> 1 then raise exception 'bourgogne place missing'; end if;
end;
$$;
```

Steps: update the classification expectation first (`appellations`/`aoc` 18 → 19) → dry-run → live apply → tooling:

```powershell
node scripts/wine-map-sources/fetch-inao-denomination.mjs --slug bourgogne --target-key france.bourgogne --members "Bourgogne"
node scripts/wine-map-sources/build-boundary.mjs --slug bourgogne --target-key france.bourgogne
```

Fetch is the largest of 3A (the LIKE bound matches every combo containing the substring; expect many pages, minutes of runtime, gzipped raw pages in Storage). `FETCHED` must report parcels ≥ 16855. Foundation boundary counts then bump to `total: 23`, `valid/labelled: 23`, `generalized: 21`, provenance 23s (the classification 18 → 19 bump was staged before the dry-run; Bourgogne is dual-role). Live suites green → commit (`feat: add bourgogne pilot region`).

---

### Task 6: Review Gate And Boundary Flips

**Files:**
- Create: `supabase/migrations/20260803090000_phase3a_boundary_review.sql`
- Modify: both test files (final expectations)

**Review first (human-in-the-loop):** inspect every `.superpowers/sdd/preview-<slug>.svg`, vertex/component counts from `BOUNDARY-STAGED` output, and bbox sanity (inside the France window). If any target was re-staged with adjusted parameters, delete the superseded DRAFT row(s) first (`delete from wine_place_boundaries where wine_place_id = <place> and quality_status = 'DRAFT' and id <> <kept-id>` — boundaries carry no immutability trigger; the orphaned snapshot rows are fine and stay). The flip migration fails closed on more than one DRAFT per target. Record approval in the ledger before writing the flip migration.

```sql
-- Flip the eight reviewed Phase 3A boundaries current and publish their
-- places. Fails closed unless each target has exactly one DRAFT candidate.
do $$
declare
  k text;
  v_place uuid;
  v_count int;
begin
  foreach k in array array[
    'france.bordeaux.fronsac', 'france.bordeaux.canon-fronsac',
    'france.bordeaux.blaye', 'france.bordeaux.cotes-de-bourg',
    'france.bordeaux.entre-deux-mers', 'france.bordeaux.graves',
    'france.bordeaux.medoc', 'france.bourgogne'
  ] loop
    select id into v_place from wine_places where canonical_key = k;
    if v_place is null then raise exception 'missing place %', k; end if;
    select count(*) into v_count from wine_place_boundaries
      where wine_place_id = v_place and quality_status = 'DRAFT';
    if v_count <> 1 then
      raise exception 'expected exactly 1 DRAFT boundary for %, got %', k, v_count;
    end if;
    update wine_place_boundaries set is_current = false
      where wine_place_id = v_place and is_current;
    update wine_place_boundaries
      set quality_status = 'VALIDATED', is_current = true, reviewed_at = now()
      where wine_place_id = v_place and quality_status = 'DRAFT';
  end loop;

  update wine_places set publication_status = 'VERIFIED'
  where publication_status = 'DRAFT' and canonical_key like 'france%';
  get diagnostics v_count = row_count;
  if v_count <> 6 then raise exception 'expected 6 places verified, got %', v_count; end if;
end;
$$;
```

Final expectations: boundaries `total: 23, validated: 23, current: 20, valid: 23, labelled: 23, manual: 2, generalized: 21, reproducible: 13`; provenance 23/23/23/23; `EXPECTED_BOUNDARIES` (is_current-only) rewritten to 20 rows — the eight new entries use `denomset:<slug>` source ids with `storage://wine-map-sources/...` raw URIs and non-null raw checksums (take exact values from the snapshot rows at implementation time and pin them). Context tests: the authenticated-role Bordeaux children assertion flips 4 → 9 (the default-role assertion is already 9); Bourgogne context returns `article: null` (UI shows "Profile being curated"). Dry-run → live apply → both suites green → commit (`feat: validate phase 3a boundaries after review`).

---

### Task 7: Pipeline Split Rule, Reference Links, Docs, Full Verification

1. **Tile split becomes tier-based** (`scripts/wine-map-tiles/lib.mjs` + `export.mjs` + `lib.test.mjs`): world archive = places with `display_tier <= 1` (France + every tier-1 region, archive `both` for tier-1 places so shard behavior is unchanged); `EXPECTED_PLACES` 14 → 20; replace the `WORLD_KEYS` constant + its test with the tier rule; update `release.json` archive mapping (`both` for tier-1, `world` only for `france`) and `expectedIdSets` fixtures; update `export.mjs`'s hardcoded shard asserts (`worldRows.length === 2`, `franceRows.length === 13`) and its "14 verified places" header comment to the tier rule. France shard keeps every `france.*` place. **Register the new source namespace or the export crashes at Task 8:** add `IGN_INAO_AOC_VITICOLES: { key: "ign-inao", text: "Contains data © IGN / INAO, Licence Ouverte Etalab" }` to `ATTRIBUTION` (same display text as the legacy namespace — the display map collapses them) and update the `attributionDisplayMap` expectation in `lib.test.mjs`.
2. **Reference links** `supabase/migrations/20260803093000_phase3a_reference_links.sql`: Phase 1 exact-name pattern with review note `'Phase 3A canonical migration'`. Rule stated once: abort only if MULTIPLE candidate rows match a place; if none match, leave `PENDING` with a `raise notice`. Links: the Bourgogne region row (the live seed row is literally named `Bourgogne`; accept `Bourgogne` / `Burgundy`), and the appellation rows accepting `<name>` / `<name> AOP` plus known spelling variants — `Entre-Deux-Mers` (the live row capitalizes Deux) for Entre-deux-Mers, `Côtes de Bourg` for the comma-named place. **Blaye is EXPECTED to end `PENDING`**: the only live row is `Blaye Côtes de Bordeaux`, a different AOC — do not match it. Update `scripts/world-wine-map-foundation.test.mjs` in the SAME commit: the "only exact current Bordeaux references are verified" test gains the new links (region rows become `[Bordeaux, Bourgogne]` with an `order by` added to the query; appellation links 12 → 16: + Fronsac, Canon-Fronsac, Côtes de Bourg, Entre-Deux-Mers) and its reviewed-tally filter accepts both review notes. Dry-run in the FOUNDATION harness (the affected tests live there, not in the context suite), live apply, suites green.
3. **Docs**: CLAUDE.md Phase 3A bullet (classification axes live; INAO adapter with Storage raw retention; corrected Bordeaux; Bourgogne; region waves are data batches through the same pipeline).
4. **Full battery**: both DB suites live, tile lib tests, boundary-generator tests, `npx tsc --noEmit`, targeted eslint, `npm run build`, `git diff --check`, clean tree. Commit (`feat: link phase 3a references and update tile split`).

---

### Task 8: Publish And Owner Map Gate

1. Push all Phase 3A commits (standard guard block: fetch, branch=master, clean tree, no remote-only commits, push, HEAD == origin/master).
2. OWNER ACTION: Actions → Wine Map Tiles → Run workflow, `promote` checked.
3. Verify from the dev machine: manifest release advances; world archive byte-size grows (now carries Bordeaux + Bourgogne region polygons); DB releases show the new version `ACTIVE`.
4. OWNER GATE (the "see it on the map" approval): corrected Bordeaux drill-down (Margaux via Médoc → Haut-Médoc; Graves containing Pessac-Léognan, Sauternes, Barsac), the five new appellations visible at z7+, Bourgogne clickable at z4+ with the curated-placeholder article state. Corrections ride as new staged boundaries plus one more release. Record the verdict in the ledger; Phase 3B (remaining regions) starts only after this gate.
