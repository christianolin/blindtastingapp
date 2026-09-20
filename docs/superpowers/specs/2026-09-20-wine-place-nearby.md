# `get_wine_place_context`: the `nearby` list is the whole cost

Date 2026-09-20. Worktree `blindtastingapp-mapnear`, branch `mapnear`, base `master` at `429173e`
(`origin/master` has since moved to `930e16a`, the `mapperf` merge — canvas work only, no overlap).
Owner, verbatim: **"keep improving the performance of the map. It still has some lag issues certain
places"**.

**Diagnose-only.** This note writes no source file and no migration. It states the proven cause,
pastes the plans, measures every candidate fix against the live catalogue, recommends one, sets out
how equivalence is proven, and sketches the migration for the owner to approve.

Companion to `2026-09-20-wine-map-data-latency.md`, which fixed the *client* waterfall and recorded
this as its §9 follow-up ("Fixing it needs a migration … **The task forbids applying a migration, so
nothing here does.** It should be its own note"). This is that note.

**In one paragraph.** One CTE, `nearby_list`, is 92–99.5% of everything `get_wine_place_context`
costs — strip it and every key in the catalogue answers in 1.5 ms. It is slow because it computes
exact PostGIS distances against each neighbour's **full** outline, on every request, for data that
only changes when a migration publishes places: 224 of France's 240 ms is four polygons of
6,500–9,500 points being measured, and the worst key in the catalogue is not a country at all but a
Mosel Einzellage at **558 ms**, where 94 neighbours are each measured twice. The GiST index is
neither missing nor accidentally unused — forcing the plan that would use it is 3–10× *slower*,
measured. The fix is three clauses: a deterministic tie-break (because half the catalogue's list is
currently ordered by an accident of the query plan — proven in §3.2, and not previously known), an
`ST_Intersects` short-circuit that is exactly equivalent and takes a country from 242 ms to 56 ms,
and a precomputed neighbour table that takes every key to ~0.7 ms. Only the first is visible to a
user, and it is the only thing the owner has to decide.

---

## 0. Method

Everything below was measured against the live database.

- **Reads** ran inside `begin read only; set local statement_timeout = …; … rollback`, as the
  `authenticated` role (`set local role authenticated`) unless a line says otherwise — that is the
  role the app's RPC actually runs as, and every table involved is RLS-gated for it.
- **Write probes** (creating `probe_old` / `probe_new` / a probe table) ran inside a plain
  transaction that **always rolls back**, and always under *new* names, so the live
  `get_wine_place_context` was never locked, replaced or dropped for even an instant.
- **No migration was applied.** Nothing was committed. No Anthropic API call was made.
- Probe scripts live in `.superpowers/mapnear/probes/` (gitignored) — `ro.mjs` (read-only runner),
  `sweep.mjs` (whole-catalogue server-side timing), `time-body.mjs` (times a function *body* as a
  prepared statement), `explain-body.mjs` / `explain-generic.mjs` (EXPLAIN the body, custom and
  generic plan), `split.mjs` (network vs plan vs execution), `standalone.sql` (the naive
  extracted-CTE query, §2.3), `compare.mjs` (byte-equality + timing over the whole catalogue, in a
  rolled-back transaction) and `compare2.mjs` (the same comparison aggregated server-side, with the
  optimisation fences §5 describes).
- Body variants live in `.superpowers/mapnear/bodies/` — `live.sql` is the live definition pulled
  with `pg_get_functiondef`, every `v*.sql` is a spliced copy of it.

Two measurement conventions, used consistently:

- **round-trip** — `select <body>($1)` from this machine through the Supabase pooler. The pooler
  round-trip from here is **18.6 ms median** (20× `select 1`), so a round-trip number is roughly
  *server time + 18.6 ms*. Numbers from a Vercel function in the same region will be lower.
- **server** — `clock_timestamp()` around the call inside a plpgsql loop, so the plan is reused
  and no network is included. This is the honest "what the database costs" number.

---

## 1. The baseline, reproduced

`get_wine_place_context(p_place_key)` is `LANGUAGE sql`, `STABLE`, `SECURITY INVOKER`,
`SET search_path TO 'public'`. Its ACL is
`{postgres=X/postgres, authenticated=X/postgres, service_role=X/postgres}` — `anon` and `PUBLIC`
hold nothing. Live body = migration
`20260917100000_wine_place_context_country_neighbours.sql`, byte-for-byte (checked with
`pg_get_functiondef`).

Round-trip, as `authenticated`, median of 5:

```
france                                         med=   261.9  min=   253.0  max=   280.3
spain                                          med=   269.5  min=   267.8  max=   279.3
italy                                          med=   196.6  min=   193.7  max=   198.1
germany                                        med=    58.7  min=    54.0  max=    67.1
france.savoie                                  med=    38.1  min=    35.8  max=    39.7
france.bordeaux                                med=    39.4  min=    38.4  max=    43.8
```

which matches the numbers in the task and in the sibling note to within a millisecond. (A
fourth-segment `france.bordeaux.pauillac` does not exist — the key is
`france.bordeaux.haut-medoc.pauillac`; a miss returns `null` in ~8 ms of server time, which is the
27 ms round-trip the task's list shows for that spelling.)

### 1.1 The whole catalogue, not a sample

3,309 places, of which **3,257 have a current boundary** (`wine_place_boundaries.is_current`), all
`publication_status = 'VERIFIED'`, all `quality_status = 'VALIDATED'`. The other 52 —
`italy.lazio.castelli-romani`, `portugal.alentejo.reguengos`,
`italy.sardegna.vermentino-di-sardegna` and the like — have no geometry, so their `nearby` is `[]`
and costs nothing; an unknown key returns SQL `null`. Server-side sweep over every one of the 3,257
keys that do have a boundary:

```
n=3257 total=147863ms  median=33.01  p75=50.02  p90=86.35  p99=255.54  worst=558.5
--- worst 25 ---
    558.5  germany.mosel.bernkastel.sankt-michael.leiwen-klostergarten
    526.3  germany.pfalz.suedl-weinstrasse.koenigsgarten.landau-i-d-pfalz-ranschbach-seligmacher
    490.5  germany.mosel.bernkastel.sankt-michael.poelich-held
    485.7  germany.pfalz.suedl-weinstrasse.kloster-liebfrauenberg.goecklingen-heuchelheim-klingen-herrenpfad
    469.0  spain.extremadura.ribera-del-guadiana
    467.5  germany.pfalz.suedl-weinstrasse.guttenberg.oberotterbach-schweigen-rechtenbach-schweighofen-sonnenberg
    455.1  germany.mosel.bernkastel.probstberg.schweich-burgmauer
    441.7  germany.pfalz.suedl-weinstrasse.bischofskreuz.gleisweiler-hoelle
    426.9  germany.pfalz.suedl-weinstrasse.schloss-ludwigshoehe.sankt-martin-baron
    393.3  germany.pfalz.suedl-weinstrasse.ordensgut.edesheim-rosengarten
    382.0  germany.pfalz.suedl-weinstrasse.bischofskreuz.boechingen-rosenkranz
    359.0  germany.mosel.bernkastel.sankt-michael.kloeerath-bruderschaft
    356.2  germany.pfalz.suedl-weinstrasse.koenigsgarten.albersweiler-latt
    348.5  germany.mosel.burg-cochem.schwarze-katz.zell-mosel-rosenborn
    346.7  germany.pfalz.suedl-weinstrasse.koenigsgarten.landau-i-d-pfalz-muenzberg
    339.3  germany.mosel.bernkastel.michelsberg.trittenheim-altaerchen
    329.9  germany.mosel.burg-cochem.schwarze-katz.zell-mosel-roemerquelle
    318.4  germany.pfalz.mittelhaardt-dt-weinstrasse.hofstueck.niederkirchen-b-deid-klostergarten
    312.8  germany.pfalz.suedl-weinstrasse.guttenberg.bad-bergzabern-doerrenbach-wonneberg
    302.9  germany.pfalz.suedl-weinstrasse.herrlich.landau-i-d-pfalz-muetterle
    297.1  germany.pfalz.suedl-weinstrasse.trappenberg.grossfischlingen-kleinfischlingen-kirchberg
    295.6  france.bordeaux.cadillac
    295.4  italy.veneto.prosecco
    290.0  germany.pfalz.suedl-weinstrasse.bischofskreuz.roschbach-rosenkraenzel
    277.1  germany.pfalz.suedl-weinstrasse.bischofskreuz.walsheim-silberberg
```

Same sweep, the keys the task names: `france` 240.97, `spain` 244.90, `italy` 167.49,
`germany` 28.82, `france.savoie` 10.71, `france.bordeaux` 13.03, `france.bourgogne` 15.86,
`germany.baden` 36.72.

**This changes the shape of the problem.** The countries are *not* the worst keys — the worst are
tier-4/tier-5 German Einzellagen, up to **558 ms**, and `spain.extremadura.ribera-del-guadiana`,
`france.bordeaux.cadillac` and `italy.veneto.prosecco` sit with them. The countries are simply the
slow keys everybody clicks first. Any fix must be judged on both ends of that distribution.

### 1.2 Network, planning and execution, separated

```
network round-trip median 18.61 ms
key                                                            roundtrip      exec  plan+net
france                                                             253.0     235.8      17.2
spain                                                              269.7     245.4      24.3
italy                                                              193.3     170.3      23.0
germany                                                             52.8      29.4      23.4
france.savoie                                                       35.5      11.9      23.6
france.bordeaux                                                     38.7      14.4      24.3
france.bourgogne                                                    39.0      17.7      21.3
germany.baden                                                       64.2      47.7      16.5
italy.veneto.prosecco                                              323.1     298.2      24.9
germany.mosel…leiwen-klostergarten                                 470.3     446.1      24.1
```

`plan+net` is flat at 17–25 ms against an 18.6 ms network floor, so **re-planning the function body
costs roughly 0–6 ms per call** and is not worth chasing. (A `LANGUAGE sql` function's body is
planned per call site rather than cached across statements; at this body size that is a few
milliseconds, not the tens I first suspected.)

---

## 2. The proven cause

### 2.1 `nearby_list` is ~100% of the variable cost

The strongest single measurement in this note. Take the live body, change one line —
`'nearby', (select items from nearby_list)` becomes `'nearby', '[]'::jsonb` — and time it:

```
france                                                             20.6
spain                                                              20.3
italy                                                              20.3
germany                                                            20.1
france.savoie                                                      20.3
france.bordeaux                                                    19.9
germany.baden                                                      20.1
italy.veneto.prosecco                                              20.8
germany.mosel…leiwen-klostergarten                                 19.9
```

Round-trip, against an 18.6 ms network floor: **every key, from a 5-part country outline to a
tier-5 Einzellage, costs 1.3–2.2 ms at the database once `nearby` is gone.** The other eleven CTEs
— ancestors, children, article, boundary, grapes, styles, designations, dual labels, classified
members — are index lookups on small tables and are collectively free.

So this is not "the RPC is slow". It is "one CTE is slow", and it is 92–99.5% of the work for every
key that is slow at all.

### 2.2 The plan, three shapes

The function is not inlined by the planner (`explain select get_wine_place_context('france.savoie')`
shows an opaque `Result` node), so the plans below come from EXPLAINing the body with the argument
as `$1` under `plan_cache_mode = force_generic_plan` — which is exactly how a `LANGUAGE sql` body is
planned. The custom (literal-substituted) plan is identical in shape; the parameter appears only in
`canonical_key = $1`.

**(a) A tier-1 region — `france.savoie`, 9.8 ms.** Small candidate set, small geometries.

```
CTE nearby_candidates
  ->  Nested Loop (actual time=0.376..4.218 rows=2 loops=1)
        Buffers: shared hit=791
        InitPlan 11
          ->  CTE Scan on target_geom target_geom_1 (actual time=0.012..0.013 rows=1 loops=1)
        ->  Nested Loop (actual time=0.069..0.218 rows=66 loops=1)
              ->  CTE Scan on target t_2 (actual time=0.027..0.028 rows=1 loops=1)
              ->  Index Scan using wine_places_publication_tier_idx on wine_places p2 (actual time=0.038..0.173 rows=66 loops=1)
                    Index Cond: ((publication_status = 'VERIFIED'::wine_place_publication_status) AND (display_tier >= LEAST((t_2.display_tier)::integer, 1)) AND (display_tier <= t_2.display_tier))
                    Filter: ((id <> t_2.id) AND (primary_parent_id IS DISTINCT FROM t_2.id) AND (NOT (ANY (id = (hashed SubPlan 10).col1))) AND (canonical_key !~~ (t_2.canonical_key || '.%'::text)) AND (t_2.canonical_key !~~ (canonical_key || '.%'::text)))
                    Rows Removed by Filter: 1
        ->  Index Scan using wine_place_boundaries_one_current_idx on wine_place_boundaries b2 (actual time=0.060..0.060 rows=0 loops=66)
              Index Cond: (wine_place_id = p2.id)
              Filter: ((quality_status = 'VALIDATED'::wine_boundary_quality_status) AND EXISTS(SubPlan 12) AND (display_geometry && st_expand((InitPlan 11).col1, '0.1'::double precision)))
              Rows Removed by Filter: 1
              Buffers: shared hit=753
              SubPlan 12
                ->  Index Scan using wine_places_pkey on wine_places p_3 (actual time=0.003..0.003 rows=1 loops=66)
                      Index Cond: (id = b2.wine_place_id)
                      Filter: ((publication_status = 'VERIFIED'::…) AND (publication_status = 'VERIFIED'::…))
->  Limit (actual time=9.699..9.700 rows=0 loops=1)
      ->  Sort (actual time=9.660..9.660 rows=0 loops=1)
            Sort Key: (st_distance(nc.g, (InitPlan 15).col1))
            ->  CTE Scan on nearby_candidates nc (actual time=9.655..9.655 rows=0 loops=1)
                  Filter: st_dwithin(CASE WHEN ((InitPlan 16).col1 = 0) THEN st_simplifypreservetopology(g, '0.02'::double precision) ELSE g END, (InitPlan 17).col1, '0.1'::double precision)
                  Rows Removed by Filter: 2
Execution Time: 9.831 ms
```

**(b) A country — `france`, 273 ms.** Three candidates; 99% of the time is the exact geometry work.

```
CTE nearby_candidates
  ->  Nested Loop (actual time=0.750..2.749 rows=3 loops=1)
        Buffers: shared hit=105
        ->  Nested Loop (actual time=0.083..0.138 rows=4 loops=1)
              ->  Index Scan using wine_places_publication_tier_idx on wine_places p2 (actual time=0.051..0.102 rows=4 loops=1)
                    Index Cond: (… AND (display_tier >= LEAST((t_2.display_tier)::integer, 1)) AND (display_tier <= t_2.display_tier))
        ->  Index Scan using wine_place_boundaries_one_current_idx on wine_place_boundaries b2 (actual time=0.645..0.648 rows=1 loops=4)
              Filter: (… AND (display_geometry && st_expand((InitPlan 11).col1, '0.1'::double precision)))
->  Limit (actual time=272.819..272.822 rows=3 loops=1)
      InitPlan 17
        ->  CTE Scan on target_simple target_simple_1 (actual time=13.433..13.435 rows=1 loops=1)
      ->  Sort (actual time=272.817..272.818 rows=3 loops=1)
            Sort Key: (st_distance(nc.g, (InitPlan 15).col1))
            ->  CTE Scan on nearby_candidates nc (actual time=67.104..272.799 rows=3 loops=1)
                  Filter: st_dwithin(CASE WHEN ((InitPlan 16).col1 = 0) THEN st_simplifypreservetopology(g, '0.02'::double precision) ELSE g END, (InitPlan 17).col1, '0.1'::double precision)
Execution Time: 273.218 ms
```

Candidate enumeration: **2.7 ms**. Everything else — 270 ms — is `ST_SimplifyPreserveTopology`,
`ST_DWithin` and `ST_Distance` on four polygons of 6,571–9,571 points.

**(c) A tier-5 Einzellage — `germany.mosel.bernkastel.sankt-michael.leiwen-klostergarten`, 446 ms.**
Both halves are expensive.

```
CTE nearby_candidates
  ->  Nested Loop (actual time=11.738..86.503 rows=91 loops=1)
        Buffers: shared hit=38221
        ->  Nested Loop (actual time=0.097..4.496 rows=2645 loops=1)
              ->  Index Scan using wine_places_publication_tier_idx on wine_places p2 (actual time=0.067..3.872 rows=2645 loops=1)
                    Index Cond: (… AND (display_tier >= LEAST((t_2.display_tier)::integer, 1)) AND (display_tier <= t_2.display_tier))
        ->  Index Scan using wine_place_boundaries_one_current_idx on wine_place_boundaries b2 (actual time=0.030..0.030 rows=0 loops=2645)
              Index Cond: (wine_place_id = p2.id)
              Filter: ((quality_status = 'VALIDATED'::…) AND EXISTS(SubPlan 12) AND (display_geometry && st_expand((InitPlan 11).col1, '0.1'::double precision)))
              Rows Removed by Filter: 1
              Buffers: shared hit=37990
              SubPlan 12
                ->  Index Scan using wine_places_pkey on wine_places p_3 (actual time=0.002..0.002 rows=1 loops=2593)
                      Buffers: shared hit=7779
->  Limit (actual time=445.590..445.593 rows=5 loops=1)
      ->  Sort (actual time=445.588..445.589 rows=5 loops=1)
            Sort Method: top-N heapsort  Memory: 26kB
            ->  CTE Scan on nearby_candidates nc (actual time=39.810..445.484 rows=68 loops=1)
                  Filter: st_dwithin(CASE WHEN ((InitPlan 16).col1 = 0) THEN st_simplifypreservetopology(g, '0.02'::double precision) ELSE g END, (InitPlan 17).col1, '0.1'::double precision)
                  Rows Removed by Filter: 23
Execution Time: 445.886 ms
```

Read that top to bottom: `display_tier between least(5,1) and 5` is **tiers 1..5 — 2,645 places** —
and for every one of them the plan does an index lookup into `wine_place_boundaries`, reads the
row, re-checks the boundary policy's `EXISTS` sub-plan (2,593 extra index scans, 7,779 buffers) and
only then applies the bounding-box test as a **`Filter`**. 38,221 buffers, 86 ms. Then the 91
survivors pay the exact `ST_DWithin` / `ST_Distance`: **360 ms**.

### 2.3 Why the GiST index is not used — the cause, proven

There *is* a GiST index and it is the right one:

```
CREATE INDEX wine_place_boundaries_geometry_idx ON public.wine_place_boundaries USING gist (display_geometry)
CREATE UNIQUE INDEX wine_place_boundaries_one_current_idx ON public.wine_place_boundaries USING btree (wine_place_id) WHERE is_current
CREATE INDEX wine_places_publication_tier_idx ON public.wine_places USING btree (publication_status, display_tier)
```

The `&&` predicate is written correctly for it — schema-qualified operator, the target geometry
hoisted into a `MATERIALIZED` CTE so it reaches the plan as an `InitPlan` constant. **None of the
guesses in the task's list is the cause.** There is no function wrapper on the indexed column, no
SRID or geography/geometry mismatch, no per-row distance in the index predicate, and the
`MATERIALIZED` barrier is deliberate and is what makes the constant available.

**First, the plan the task quotes is not the function's plan.** Lifting the CTE out and writing it
"standalone" drops the `MATERIALIZED` fences, and that is what produces the seq-scan-with-join-filter
shape. Reproduced here for `france.savoie`, as `authenticated`:

```
Limit (actual time=9654.422..9654.487 rows=5 loops=1)
  Buffers: shared hit=35520
  ->  Sort (actual time=9654.420..9654.422 rows=5 loops=1)
        Sort Key: (st_distance(b2.display_geometry, st_simplifypreservetopology((InitPlan 4).col1, '0.005'::double precision)))
        ->  Nested Loop (actual time=31.169..9653.568 rows=24 loops=1)
              ->  Seq Scan on wine_places p2 (actual time=0.060..18.408 rows=3309 loops=1)
                    Filter: (publication_status = 'VERIFIED'::wine_place_publication_status)
              ->  Index Scan using wine_place_boundaries_one_current_idx on wine_place_boundaries b2 (actual time=2.763..2.763 rows=0 loops=3309)
                    Index Cond: (wine_place_id = p2.id)
                    Filter: (… AND st_dwithin(display_geometry, st_simplifypreservetopology((InitPlan 5).col1, '0.005'::double precision), '0.1'::double precision))
                    Rows Removed by Filter: 1
                    Buffers: shared hit=35268
Execution Time: 9206.416 ms
```

**9.2 seconds for Savoie**, against 9.8 ms inside the function — and the reason is visible in the
`Filter` line: `st_simplifypreservetopology(…, 0.005)` sits *inside* it, so the target outline is
re-simplified **once per candidate row**, 3,257 times. That is precisely what
`20260917090000`'s `MATERIALIZED` fences exist to prevent, and it is why "the isolated form plans
as a join filter over all 3,257 boundaries" describes the extraction, not the deployed function.
Any conclusion drawn from the standalone shape — including "it needs an index" — has to be
re-derived from the real plan.

The real cause is **join order**. The planner has two ways in and picks the one driven by
`wine_places_publication_tier_idx`:

- **places-first** (what it picks): walk the tier range, then for each place look its boundary up by
  `wine_place_id` and apply `&&` as a filter. Cost scales with the number of *places in the tier
  range* — 3 for a country, 66 for a tier-1 region, 2,645 for a tier-5 site.
- **boundaries-first** (what the migration comment assumes): an index scan on the GiST index with
  `&&` as the `Index Cond`, then join to `wine_places`. Cost scales with the *area of the padded
  envelope*.

It prefers places-first because the tier range plus five filters looks far more selective than a
bounding box, and — for a country — it is right: 3 candidates versus a bbox over most of Western
Europe.

**Forcing boundaries-first is dramatically worse, measured, not assumed.** Splitting the bbox test
into its own `MATERIALIZED` CTE over `wine_place_boundaries` (which does make it an `Index Cond` on
the GiST index) gives:

```
key                                        live      GiST-forced
france                                    260.7          2542.5
spain                                     263.4           719.6
italy                                     187.9           562.6
germany                                    48.0           454.6
france.savoie                              29.9           358.2
france.bordeaux                            32.2           381.1
germany.baden                              64.0           335.2
italy.veneto.prosecco                     325.8           617.8
france.bordeaux.cadillac                  ~314            1463.9
germany.mosel…leiwen-klostergarten        466.1           887.2
```

(round-trip, 3 reps; "GiST-forced" is `.superpowers/mapnear/bodies/v2-gist.sql`.) Every key is
worse, France by 10×. The reason is that the forced CTE has to **materialise the matching boundary
geometries** — for France's envelope that is thousands of rows and megabytes of detoasted
multipolygon copied into a tuplestore, when the tier filter would have thrown all but three away.
The existing plan is the better of the two. **"Add an index / make the predicate sargable" is not
the fix here, and this is the evidence.**

### 2.4 Where the milliseconds actually are

PostGIS operation costs, measured directly on the real geometries (5 reps each, `authenticated`,
read-only):

```
simplify(france,0.02)                                   11.61 ms   pts 6961 -> 665
  simplify(spain,0.02)                                  14.27 ms
  ST_Distance(spain FULL,    france_simple)            130.83 ms   d=0
  ST_Distance(spain SIMPLE,  france_simple)              7.37 ms   d=0
  ST_DWithin (spain FULL,    france_simple, 0.1)       130.30 ms   = true
  ST_DWithin (spain SIMPLE,  france_simple, 0.1)         7.35 ms   = true
  ST_Intersects(spain FULL,  france_simple)              1.00 ms   = true
  ST_Intersects(spain SIMPLE,france_simple)              0.17 ms   = true
  simplify(italy,0.02)                                  11.84 ms
  ST_Distance(italy FULL,    france_simple)             32.26 ms   d=0
  ST_DWithin (italy FULL,    france_simple, 0.1)        32.01 ms   = true
  ST_Intersects(italy FULL,  france_simple)              0.49 ms   = true
  simplify(germany,0.02)                                11.79 ms
  ST_Distance(germany FULL,  france_simple)              0.84 ms   d=0
  ST_Intersects(germany FULL,france_simple)              0.36 ms   = true
  simplify(portugal,0.02)                                0.35 ms
  ST_Distance(portugal FULL, france_simple)              0.15 ms   d=4.7856…
```

France's 240 ms is now fully accounted for: `11.6` (simplify the target) + Spain
`14.3 + 7.4 + 130.8` + Italy `11.8 + 2.7 + 32.3` + Germany `11.8 + 0.2 + 0.8` ≈ **224 ms**.

Two things jump out.

1. **The `ORDER BY` uses the unsimplified candidate.** `20260917100000` simplified the candidate
   inside `ST_DWithin` when the target is a country but left `ST_Distance(nc.g, …)` on the full
   geometry. `ST_Distance(spain FULL, france_simple)` alone is **131 ms** — more than half of
   France's total — and it exists only to order three neighbours that are all at distance 0.
2. **`ST_Intersects` is 130× cheaper than `ST_Distance` on the same pair**, because it short-circuits
   on the first intersecting segment (and PostGIS caches a prepared geometry for the repeated
   argument) while `ST_Distance` must finish. And `ST_Distance` returns **exactly 0** whenever the
   geometries intersect. That equivalence is the lever.

For the other end of the distribution — `leiwen-klostergarten`, per candidate, all 94 of them:

```
target pts 2841->236
  …kurfuerstlay.burgen-kirchberg            tier=4 pts=789  intersects=0.03ms dwithin= 3.97ms distance= 4.08ms d=0.0975
  …probstberg.fell-maximiner-burgberg       tier=4 pts=2134 intersects=0.05ms dwithin=12.25ms distance=12.10ms d=0.0790
  …michelsberg.trittenheim-altaerchen       tier=4 pts=1645 intersects=0.20ms dwithin= 0.71ms distance=10.46ms d=0.0024
  …sankt-michael.kloeerath-bruderschaft     tier=4 pts=2556 intersects=0.06ms dwithin=15.11ms distance=15.16ms d=0.0068
  … (27 rows over 8 ms shown; 94 rows total)
candidates=94  SUM intersects=20.8ms dwithin=263.3ms distance=278.8ms
```

Here **nothing intersects** — the distances are 0.005–0.12 degrees — so the intersects
short-circuit cannot fire, and the cost is simply ~5 ms per 1,000 points of *unsimplified candidate*
geometry, twice (once for `ST_DWithin`, once for `ST_Distance`). 94 candidates × ~1,300 points ≈
540 ms of exact geometry work for one click.

### 2.5 The cause, stated plainly

> `nearby_list` computes exact PostGIS distances between the selected place and every peer whose
> padded bounding box touches it, using the candidate's **full** outline on both the filter and the
> ordering, and it does that work **on every request** for data that only ever changes when a
> migration publishes new places. For a country that is four polygons of 6,500–9,500 points
> (240 ms); for a tier-5 Einzellage it is 94 polygons of ~1,300 points, each measured twice, on top
> of a 2,645-row candidate walk (446 ms).

The GiST index is not the problem, and forcing it makes everything 3–10× worse (§2.3).

**Ruled out, each by a specific observation rather than by elimination:**

| candidate cause | verdict | evidence |
| --- | --- | --- |
| no index at all | **no** | `wine_place_boundaries_geometry_idx` is a GiST on `display_geometry` (§2.3) |
| a function wrapper around the indexed column | **no** | the predicate is `b2.display_geometry && ST_Expand(<const>, 0.1)` — the column is bare |
| SRID / type / geography-vs-geometry mismatch | **no** | both sides are `geometry`; `&&` resolves and is applied, just as a `Filter` |
| a CTE materialisation barrier hiding the constant | **no** | `MATERIALIZED` is what *creates* the `InitPlan` constant; removing it costs 9.2 s (§2.3) |
| a distance computed per row inside the index predicate | **no in the function, yes in the standalone form** | the deployed `Filter` is the bare `&&`; the standalone one re-simplifies per row (§2.3) |
| a row-count estimate that makes the planner prefer the loop | **yes, and correctly** | the tier range is genuinely 3 rows for a country; the alternative plan is measurably worse |
| exact PostGIS distance on full outlines, every request | **this is it** | §2.4: 224 of France's 240 ms, 540 ms of the Einzellage's 558 ms |

---

## 3. Candidate fixes, measured

All round-trip, `authenticated`, 3 reps, same session, against an 18.6 ms network floor. Bodies in
`.superpowers/mapnear/bodies/`.

| key | live | **A** intersects | B one-distance | C tier-0 only | D bbox-guarded | E GiST-forced |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `france` | 260.7 | **74.7** | 100.8 | 81.4 | 74.3 | 2542.5 |
| `spain` | 263.4 | **47.1** | 59.4 | 49.0 | 48.7 | 719.6 |
| `italy` | 187.9 | **44.4** | 55.6 | 46.3 | 45.8 | 562.6 |
| `germany` | 48.0 | 43.5 | 54.9 | 45.2 | 46.5 | 454.6 |
| `portugal` | — | — | — | 36.9 | 36.2 | — |
| `france.savoie` | 29.9 | 28.9 | 34.3 | 30.6 | 30.7 | 358.2 |
| `france.bordeaux` | 32.2 | 26.3 | 30.6 | 33.1 | 28.2 | 381.1 |
| `germany.baden` | 64.0 | **44.0** | 53.0 | 56.4 | 70.7 | 335.2 |
| `italy.veneto.prosecco` | 325.8 | **234.7** | 253.2 | 317.5 | 273.8 | 617.8 |
| `france.bordeaux.cadillac` | ~314 | — | 405.6 | 313.0 | 320.8 | 1463.9 |
| `germany.mosel…leiwen` | 466.1 | *528.6* | **419.9** | 465.3 | 475.3 | 887.2 |

- **A — `ST_Intersects` short-circuit** (`v1-intersects.sql`). Filter becomes
  `ST_Intersects(X, ts) or ST_DWithin(X, ts, 0.1)`; the distance becomes
  `case when ST_Intersects(g, ts) then 0 else ST_Distance(g, ts) end`. Both rewrites are *exactly*
  equivalent: intersection implies distance 0, which is ≤ 0.1 and is the literal value
  `ST_Distance` returns. Wins wherever neighbours touch (countries −77 to −88% of server time,
  Baden −44%, Prosecco −30%), **loses 14% on the deepest German sites**, where nothing touches and
  the extra `ST_Intersects` is pure overhead.
- **B — one distance instead of two** (`v6-onedist.sql`). For a non-country target the `ST_DWithin`
  filter and the `ST_Distance` ordering take *identical* operands, so `dist <= 0.1` can replace the
  filter and the distance is computed once. Helps the deepest sites (−10%), but **`ST_Distance`
  cannot short-circuit the way `ST_DWithin` can**, so places with many close neighbours get worse
  (Cadillac 314 → 406).
- **C — A, gated to tier 0** (`v7-tier0.sql`). Keeps the country win, changes literally nothing for
  the other 3,252 keys. Smallest blast radius of all.
- **D — A with a bounding-box guard on the short-circuit** (`v9-gop.sql`). Intended to get A's win
  without A's regression; in practice it lands between the two and adds a third geometry expression
  to keep straight.
- **E — force the GiST index** (`v2-gist.sql`). §2.3. Rejected.

**None of these touches the real ceiling.** Even the best column above leaves the worst key at
~420 ms and `france` at ~56 ms of server time, because all of them still compute exact PostGIS
distances on every request.

### 3.1 Precomputing the list

`nearby` is a pure function of `wine_places` + `wine_place_boundaries`. Both change only when a data
migration or the tile pipeline publishes places — never through an app write path (the only client
policies on either table are `SELECT`). And it is **caller-invariant**: every policy involved is
content-level (`publication_status = 'VERIFIED'`, `quality_status = 'VALIDATED'`), none references
`auth.uid()`, so every signed-in viewer gets the same five neighbours. (The sibling note proves the
same property for its client cache, §6.1.)

So the list can be stored, and the request path becomes an index lookup.

**Measured, whole catalogue, in a rolled-back transaction.** A probe table
`(wine_place_id, position, neighbour_place_id)` was filled from the live function's own output for
all 3,257 keys, and a body variant was built that (a) guards `target_geom` and `nearby_candidates`
with `not (select ok from cache_state)` so the geometry work is skipped entirely on a hit, (b)
renders the list by joining the stored ids back through `wine_places` — so RLS still filters them —
and (c) falls back to the live computation when the cache is not fresh. Server-side sweep, as
`authenticated`:

```
live   n=3257 med= 32.18  p90= 81.28  p99=252.99  worst=531.35  total=142569 ms
cached n=3257 med=  0.69  p90=  0.78  p99=  1.52  worst= 20.47  total=  2427 ms
```

(A second sweep of the live function, taken back-to-back with the cached one inside the same
transaction so the two are directly comparable; it lands within 5% of §1.1's independent run, which
is the run-to-run noise on this database.)

```
key                                                            live    cached
france                                                       442.49*    20.47*
spain                                                        245.56      1.63
italy                                                        170.85      1.73
germany                                                       38.13      5.20
france.savoie                                                  11.29     1.02
germany.baden                                                  47.84     0.86
italy.veneto.prosecco                                        297.60      0.69
france.bordeaux.cadillac                                     310.29      0.77
spain.extremadura.ribera-del-guadiana                        460.67      0.71
germany.mosel…leiwen-klostergarten                           445.95      0.67
```

`*` the sweep runs in `display_tier, canonical_key` order, so `france` is its very first key and
carries the first-touch cost on both sides (`germany`, second, shows the tail of it at 5.2 ms).
Warm, `france` measures 240.97 ms live and ~1 ms cached.

**59× less total work across the catalogue, and the worst key goes from 531 ms to under 2 ms.**
Every key lands at or below the ~1.5 ms floor §2.1 established for "the RPC without `nearby`" —
which is the point: on a hit the geometry work does not run at all, so the RPC costs what its
other eleven CTEs cost and nothing more.

### 3.2 The finding that decides how any of this is proven

The full-catalogue diff of the cached variant did **not** come back clean the first time. It
reported differences like this one (`france.alsace.ribeauville`):

```
old nearby: Riquewihr, Bergheim, Zellenberg, Hunawihr, Rodern
new nearby: Hunawihr, Riquewihr, Bergheim, Zellenberg, Rodern
```

Same five places, different order — and the "new" side was simply the *live function's own output*,
copied into the table. Chased down:

```
as postgres      Hunawihr, Riquewihr, Bergheim, Zellenberg, Rodern   (twice, identical)
as authenticated Riquewihr, Bergheim, Zellenberg, Hunawihr, Rodern   (three times, identical)
```

**`get_wine_place_context` returns a different `nearby` order depending on the role that calls it.**
It is deterministic *within* a role, but the Alsace communes all touch, so every one of them is at
`ST_Distance = 0`, `order by n.dist` has nothing to break the tie with, and the order that falls out
is whatever order the executor's sort received its rows in — which depends on the plan, which
depends on whether the RLS `EXISTS` sub-plans are present. The probe table had been filled as
`postgres` and read back as `authenticated`.

Consequences, and they are the important part of this note:

1. **"Byte-identical for every key" is not a property today's function has of itself.** Any tie
   group in `nearby` is ordered by an accident of the plan. A future planner upgrade, an
   `ANALYZE`, a new index or a policy change can permute those chips with no code change at all.
2. **It is also the one thing that can make an otherwise-equivalent rewrite fail the proof.** It is
   why candidate E (§2.3) would have to be re-proven rather than reasoned about, and why A, B, C and
   D — which leave `nearby_candidates` alone — pass.
3. **Any precomputed list has to agree with the reader's order**, and "fill it through the same
   plan" is not a guarantee anyone can hold on to.

The clean fix is one clause: `order by n.dist, n.canonical_key`. The list then becomes a function of
the data alone. §4 measures what that changes, because it does change something: it reorders tie
groups once, and where more than five neighbours tie it can change *which* five are shown.

---

## 4. Recommendation

**One migration, three clauses, in this order.**

### R1 — a deterministic tie-break: `order by n.dist, n.canonical_key`

Not a performance change; it is what makes every other claim in this note provable and keeps it
provable. §3.2 showed that half the catalogue's `nearby` list is currently ordered by an accident of
the query plan. With this clause the list becomes a function of the data: the same five places, in
the same order, for every role, every plan and every rebuild.

**Measured, whole catalogue.** Live versus live + R1 + R2 — and since §5 step 1 proved R2 is an
identity, every difference below is R1's:

```
compared=3257  differ=1619  reorder_only=1339  membership=280  outside_nearby=0
by_tier {"0":1, "1":26, "2":165, "3":326, "4":775, "5":326}

  france (tier 0)
     old  italy, spain, germany
     new  germany, italy, spain
  germany.rheingau (tier 1)
     old  rheinhessen, mittelrhein, nahe
     new  mittelrhein, rheinhessen, nahe
  italy.basilicata (tier 1)
     old  campania, puglia, calabria
     new  calabria, campania, puglia
  italy.emilia-romagna (tier 1)
     old  toscana, piemonte, veneto, lombardia, marche
     new  liguria, lombardia, marche, piemonte, toscana
  italy.lazio (tier 1)
     old  toscana, campania, umbria, abruzzo, marche
     new  abruzzo, campania, marche, molise, toscana
```

**1,619 of 3,257 places change; 1,339 of those are a pure reorder and 280 show a different five.**
`outside_nearby = 0` — nothing but the `nearby` array moves, in any key. The membership changes are
all of the `emilia-romagna` shape: Emilia-Romagna touches Piemonte, Lombardia, Veneto, Liguria,
Toscana **and** Marche — six neighbours, every one at distance 0 — so which five survived `limit 5`
was already arbitrary. It is now simply the first five by key. Nothing in the geometry decides it
either way; only a tie-break can.

This is a **visible change** — the only one in this note. No place becomes "wrong": every entry that
moves is at exactly the same distance (0) as the entry it swapped with, and `outside_nearby = 0`
says nothing else in the payload moves at all. But the chips under "Nearby" will be in a different
order for 1,619 places on the day it ships, and for 280 of them a different five will be shown.
**The owner has to say yes to that.**

**If the answer is no**, R2 still ships on its own, and R3 is still possible but weaker: the refresh
would have to be `SECURITY INVOKER` and be called with `set local role authenticated` so the fill
runs under the reader's plan, the proof would hold only for that plan, and the first planner change,
`ANALYZE` or new index would silently drift the cache away from what a live computation returns.
That is a real option, not a blocker — it just trades a one-time visible reorder for a standing
fragility, and this note recommends the other way round.

### R2 — the `ST_Intersects` short-circuit

```sql
-- the ordering distance: ST_Distance is exactly 0 whenever the geometries intersect
case when extensions.ST_Intersects(nc.g, (select g from target_simple))
     then 0::float8
     else extensions.ST_Distance(nc.g, (select g from target_simple))
end as dist
-- the filter: intersection implies distance 0, which is <= 0.1
where extensions.ST_Intersects(<operand>, (select g from target_simple))
   or extensions.ST_DWithin (<operand>, (select g from target_simple), 0.1)
```

Two rewrites of the same identity, no new table, no new index, no schema change. Proven
byte-identical over all 3,257 keys (§5). Server time (round-trip minus the 18.6 ms network floor):

```
france     242 -> 56   (-77%)
spain      245 -> 28   (-88%)
italy      169 -> 26   (-85%)
baden       45 -> 25   (-44%)
prosecco   307 -> 216  (-30%)
leiwen     448 -> 510  (+14%)   <- the one regression
```

It costs the deepest German sites about 14%, because there the neighbours do not touch, the
short-circuit never fires, and the extra `ST_Intersects` is pure overhead. With R3 in place that
regression is only ever paid on the fallback path — i.e. in the window between a catalogue write and
the refresh that follows it — and in exchange the refresh itself runs in ~60 s instead of ~143 s.
Without R3 it is a real, if small, regression on about forty tier-4/5 German keys, and the owner
should know that before saying yes to R2 alone.

It is worth shipping **even if R3 is deferred**: it is the whole of the country cliff, it is four
lines, and it is the only candidate in §3 that is both large and provably identical.

### R3 — precompute the list

§3.1: a `wine_place_neighbours` table, a one-row freshness flag, two statement-level triggers that
set it false on any write to `wine_places` / `wine_place_boundaries`, a
`refresh_wine_place_neighbours()` that rebuilds it from the function's own live branch, and a
`case` in the function that reads the table when fresh and computes live when not.

```
             median   p90     p99    worst   total over 3,257 keys
live          32.2    81.3   253.0   531.4      142.6 s
cache hit      0.7     0.8     1.5     ~2         2.4 s
```

(The cached row was measured with the cache sitting on top of the *live* body. A hit never reaches
the geometry at all, so R1 and R2 cannot change it — they only decide what the refresh writes and
how fast the fallback is.)

**Every key on the ~1.5 ms floor**, including the ones this note found to be worse than the
countries. Correctness does not depend on anyone remembering to refresh: the trigger makes a stale
cache *fall back to the live computation*, so forgetting is slow, never wrong.

And it is **proven identical to what it replaces** — §5.1 step 3, all 3,309 places, `0 differ`,
with the fill run as `postgres` and the read as `authenticated`.

### Why not the alternatives

- **An index.** There is already the right GiST index. The plan that would use it is 3–10× slower
  than the one running today (§2.3, measured). No index is added by this note.
- **A sargable rewrite / KNN `<->`.** Same problem: any plan that drives from the boundary geometry
  has to carry big multipolygons through a materialisation before the tier filter can throw them
  away.
- **Restricting candidates** (same parent, same country, sibling set). Would change which places
  are shown — a product decision, not a performance fix — and does not help a country, whose
  candidate set is already three rows.
- **A stored simplified geometry to measure against.** Would cut the deep-tier cost roughly 10×,
  but 0.005° is ~500 m and the neighbours of an Einzellage sit 0.005–0.12° away, so it would change
  real distances and real answers. R3 gets the same speed with no change to the maths.
- **Moving `nearby` into its own request.** Makes the panel *appear* faster while still burning
  450 ms of database time per click, and needs a client change. R3 removes the work instead.
- **A `nearby_cache jsonb` column on `wine_places` instead of R3's table.** Tempting — the function
  already has the target row, so it would be a single column read with no join at all. Rejected for
  two reasons: the stored JSON would carry the neighbours' names and keys straight to the caller,
  **bypassing the per-row RLS that decides today whether each neighbour is visible** (harmless while
  every place is `VERIFIED`, but it hard-codes that), and a staleness trigger on `wine_places` would
  have to write `wine_places`. The separate table keeps the RLS join and keeps the trigger off the
  table it watches.

### Follow-up this unlocks (not part of the change)

Once the list is precomputed, the tie-break can become something better than alphabetical without
costing the request path anything: order places tied at distance 0 by **shared border length
descending**, so "Nearby" leads with the neighbour you share most boundary with. That is an
editorial improvement to make deliberately, after R1–R3, with its own before/after.

---

## 5. How equivalence is proven

Not asserted — **executed**, for the whole catalogue, in a rolled-back transaction
(`.superpowers/mapnear/probes/compare.mjs`):

```sql
create function probe_old(p_place_key text) returns jsonb … as $$ <live body> $$;
create function probe_new(p_place_key text) returns jsonb … as $$ <candidate body> $$;
grant execute on function probe_old(text), probe_new(text) to authenticated;
set local role authenticated;

select p.canonical_key, x.a::text, x.b::text
  from wine_places p
  join wine_place_boundaries bb on bb.wine_place_id = p.id and bb.is_current
  cross join lateral (select probe_old(p.canonical_key) a, probe_new(p.canonical_key) b) x
 where x.a::text is distinct from x.b::text;
```

This compares the **whole JSON document**, not just `nearby`, as the role the app uses, and it is a
`::text` comparison so key order, number formatting and array order all count. Both functions are
created under new names, so the live function is never touched.

**Cover all 3,309 places, not the 3,257 with a boundary.** The 52 places with no current boundary
are the ones where `target_geom` is empty and every geometry expression sees `null`; they are
exactly where a rewrite is most likely to turn `[]` into something else, and they are the ones a
"keys that have a boundary" filter silently skips. Add the nonexistent-key case too — the function
must still return SQL `null`, not `{}`.

Result for candidate **A** (R2), against the live definition, both sides as `authenticated`:

```
compared 3257 keys, 0 differ
```

A leaner variant (`compare2.mjs`) aggregates the same comparison server-side and reports counts
plus a bounded sample, which is what the remaining runs use — the full-row form ships ~13 MB back
to the client and is only needed when you want to read the diffs.

**One trap when re-running this.** The lateral `(select probe_old(k) a, probe_new(k) b)` gets
pulled up by the planner and its output columns substituted back into every place they are
referenced, so each extra mention of `a` or `b` calls the function *again*. With six mentions the
comparison takes six times as long as it should. Put an `offset 0` fence in the lateral and mark
the CTEs `as materialized` (`compare2.mjs` does both) or the run takes fifteen minutes instead of
four.

### 5.1 The decomposition that makes each clause provable on its own

Comparing today's function against all three clauses at once would only say "something changed". So
the proof is three diffs, each isolating one clause:

| # | old | new | required result |
| --- | --- | --- | --- |
| 1 | live | live **+ R2** | **0 differ** — R2 is an identity, nothing about the answer moves |
| 2 | live | live + R1 + R2 | differences are R1's, and **only** tie groups: `outside_nearby = 0`, and every differing key has the same neighbour *set* or a set that differs only among entries at the same distance |
| 3 | live + R1 + R2 | live + R1 + R2 + **R3** | **0 differ** — the cache must reproduce its own source exactly, *including* when the fill runs as `postgres` and the read as `authenticated` (that is the whole point of R1) |

Because step 1 comes back clean, step 2's differences are attributable to R1 alone, which is what
makes the count in §4 an honest answer to "how many places change".

Results as run here:

```
step 1  live            vs live+R2         compared 3257 keys, 0 differ
step 2  live            vs live+R1+R2      compared=3257 differ=1619
                                           reorder_only=1339 membership=280 outside_nearby=0
step 3  live+R1+R2      vs live+R1+R2+R3   compared=3309 differ=0
                                           reorder_only=0 membership=0 outside_nearby=0
```

Step 3 is the one that matters most and it is the one that failed before R1 existed (§3.2). It was
run the hard way on purpose: the neighbour table was filled by a function running as **`postgres`**,
and then read back as **`authenticated`** — the exact cross-role case that produced 1,619
differences when the order was left to the plan. With the tie-break in place it is **0 across all
3,309 places**, boundary-less ones included.

**The one risk this catches and nothing else would.** Neighbours that touch are all at distance 0,
so the `ORDER BY dist` has genuine ties, and the order among them is whatever the executor's sort
happens to produce for the row order it was fed. Any change that alters the *candidate* order —
E does, and so would any re-ordering of `nearby_candidates` — can silently permute a tie group and
change the JSON without changing the answer. That is exactly why the proof is a full-catalogue
`::text` diff rather than a set comparison, and why candidates that leave `nearby_candidates`
untouched (A, B, C, D) are the safe ones.

**How big that tie problem is, measured.** Running the *live function against itself* under two
different roles — `postgres` (RLS bypassed, so the policy `EXISTS` sub-plans vanish and the plan
changes) and `authenticated` — and diffing all 3,257 keys:

```
total=1619  reorder-only=1286  membership-change=333  outside-nearby=0
by tier: {"0":2, "1":13, "2":164, "3":332, "4":773, "5":335}
```

**Half the catalogue's `nearby` list is a plan artefact.** 1,286 keys return the same five places in
a different order, and 333 return a *different set* — because more than five neighbours are tied at
distance 0 and the cut at `limit 5` falls in a different place. (The near-identical totals against
the deterministic order in §4 — 1,619 keys, 1,339/280 — are the same phenomenon counted against a
fixed reference instead of a second plan.) Examples:

```
reorder     france                     italy, spain, germany  ->  germany, spain, italy
reorder     germany.rheingau           rheinhessen, mittelrhein, nahe  ->  mittelrhein, rheinhessen, nahe
MEMBERSHIP  italy.emilia-romagna       toscana, piemonte, veneto, lombardia, marche
                                    -> marche, liguria, veneto, piemonte, toscana
MEMBERSHIP  france.provence.coteaux-daix-en-provence
                                       …, cotes-de-provence, france.rhone,        france.rhone.meridional
                                    -> …, cotes-de-provence, france.rhone.luberon, france.rhone.meridional
```

Nothing is *wrong* in either list — every entry really is at distance 0 — but it means the current
output is not a stable function of the data, and `order by n.dist` alone can never make it one.

---

## 6. Migration sketch

**Version `20260920090000`** — verified absent from live `supabase_migrations.schema_migrations`
(latest recorded is `20260919223200_rule1_older_leaks`), absent from `origin/master`, and absent
from every `supabase/migrations` under `C:\Users\ChristianDahlOlin\source\repos\blindtastingapp-*`
(18 worktrees checked) and from every branch in the shared object store. Per CLAUDE.md's
shared-migration-version rule, re-check immediately before applying — the wine-map stream shares
this number space.

Style follows `supabase/migrations/20260919213300_rule1_usage_and_main_photo.sql`: fail-closed
`DO` blocks before and after, pinning what is replaced by md5 with CR stripped.

**The one CTE that changes (R1 + R2), in full**, replacing today's `nearby_list` verbatim — this is
the exact text that was measured and proven, so paste it rather than re-deriving it:

```sql
  nearby_list as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object('id', n.id, 'key', n.canonical_key, 'name', n.name, 'kind', n.kind)
        order by n.dist, n.canonical_key
      ),
      '[]'::jsonb
    ) as items
    from (
      select nc.id, nc.canonical_key, nc.name, nc.kind,
             -- ST_Distance returns exactly 0 when the geometries intersect, and
             -- ST_Intersects reaches that answer ~130x faster on a large pair.
             case when extensions.ST_Intersects(nc.g, (select g from target_simple))
                  then 0::float8
                  else extensions.ST_Distance(nc.g, (select g from target_simple))
             end as dist
        from nearby_candidates nc
       -- intersection implies distance 0, which is <= 0.1, so the OR is an
       -- identity: it only lets the cheap test answer first when it can.
       where extensions.ST_Intersects(
               case when (select display_tier from target) = 0
                    then extensions.ST_SimplifyPreserveTopology(nc.g, 0.02)
                    else nc.g end,
               (select g from target_simple))
          or extensions.ST_DWithin(
               case when (select display_tier from target) = 0
                    then extensions.ST_SimplifyPreserveTopology(nc.g, 0.02)
                    else nc.g end,
               (select g from target_simple), 0.1)
       order by dist, nc.canonical_key
       limit 5
    ) n
  ),
```

```sql
begin;

-- ---------------------------------------------------------------- pre-state
do $$
declare v_md5 text;
begin
  select md5(replace(pg_get_functiondef('public.get_wine_place_context(text)'::regprocedure), chr(13), ''))
    into v_md5;
  if v_md5 <> '8079a6f1d560a0cb93fdb5364786a39e' then
    raise exception 'get_wine_place_context is not the definition this migration replaces (md5 %)', v_md5;
  end if;

  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'public' and p.proname = 'get_wine_place_context'
                    and p.prosecdef = false) then
    raise exception 'get_wine_place_context must be SECURITY INVOKER before this migration';
  end if;

  if has_function_privilege('anon', 'public.get_wine_place_context(text)', 'execute')
     or has_function_privilege('public', 'public.get_wine_place_context(text)', 'execute') then
    raise exception 'get_wine_place_context is already granted to anon/PUBLIC';
  end if;
  if not has_function_privilege('authenticated', 'public.get_wine_place_context(text)', 'execute')
     or not has_function_privilege('service_role', 'public.get_wine_place_context(text)', 'execute') then
    raise exception 'get_wine_place_context is missing an EXECUTE grant this migration expects';
  end if;
end $$;

-- ---------------------------------------------------------------- the change
-- (§4 R1 + R2 always; R3 adds the block in §6.1)
-- The body is the live one with ONE CTE replaced. Splice, do not retype: every
-- other CTE must stay byte-identical, the way 20260917090000 did it.

create or replace function public.get_wine_place_context(p_place_key text) …;

-- --------------------------------------------------------------- post-state
do $$
declare v_def text;
begin
  select pg_get_functiondef('public.get_wine_place_context(text)'::regprocedure) into v_def;

  if v_def not like '%ST_Intersects%'                        -- R2
     or v_def not like '%order by n.dist, n.canonical_key%'  -- R1
     or v_def not like '%order by dist, nc.canonical_key%'   -- R1
  then
    raise exception 'the new body is not the one this migration installs';
  end if;

  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.proname = 'get_wine_place_context'
                and (p.prosecdef or p.proconfig is distinct from array['search_path=public'])) then
    raise exception 'get_wine_place_context must stay SECURITY INVOKER with search_path=public';
  end if;

  if not has_function_privilege('authenticated', 'public.get_wine_place_context(text)', 'execute')
     or not has_function_privilege('service_role', 'public.get_wine_place_context(text)', 'execute') then
    raise exception 'get_wine_place_context lost an EXECUTE grant (authenticated / service_role)';
  end if;
  if has_function_privilege('anon', 'public.get_wine_place_context(text)', 'execute')
     or has_function_privilege('public', 'public.get_wine_place_context(text)', 'execute') then
    raise exception 'anon/PUBLIC must not hold EXECUTE on get_wine_place_context';
  end if;
end $$;

commit;
```

**No index is created.** §2.3 measured the boundaries-first plan the GiST index would drive and it
is 3–10× *slower* than what runs today; the index that exists is already the right one and is
already used everywhere it pays. So there is no `CREATE INDEX` in this migration, no
`CONCURRENTLY` question, and no lock to reason about.

### 6.1 If the precomputed list is approved, the rest of the migration

```sql
-- the list itself: place ids only, nothing geometric, nothing per-user
create table public.wine_place_neighbours (
  wine_place_id      uuid     not null references public.wine_places(id) on delete cascade,
  position           smallint not null check (position between 1 and 5),
  neighbour_place_id uuid     not null references public.wine_places(id) on delete cascade,
  primary key (wine_place_id, position)
);
alter table public.wine_place_neighbours enable row level security;

-- same two-sided VERIFIED check the wine_place_relationships policy uses
create policy "wine place neighbours verified read"
  on public.wine_place_neighbours for select to authenticated
  using (
    exists (select 1 from public.wine_places p
             where p.id = wine_place_id and p.publication_status = 'VERIFIED')
    and exists (select 1 from public.wine_places p
                 where p.id = neighbour_place_id and p.publication_status = 'VERIFIED')
  );
revoke all on public.wine_place_neighbours from anon;
grant select on public.wine_place_neighbours to authenticated;
-- no INSERT/UPDATE/DELETE grant to any client role: only the refresh function writes it

-- one-row freshness flag; the function falls back to the live computation when false
create table public.wine_place_neighbours_state (
  only_row boolean primary key default true check (only_row),
  fresh    boolean not null default false,
  built_at timestamptz
);
insert into public.wine_place_neighbours_state (only_row, fresh) values (true, false);
alter table public.wine_place_neighbours_state enable row level security;
create policy "wine place neighbours state read"
  on public.wine_place_neighbours_state for select to authenticated using (true);

-- any write to the catalogue invalidates the whole cache. Statement-level, so a
-- 3,000-row data migration pays it once. Correct rather than clever: a new place
-- changes OTHER places' neighbours, so a partial invalidation would be wrong.
create or replace function public.wine_place_neighbours_mark_stale()
  returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  update public.wine_place_neighbours_state set fresh = false where only_row;
  return null;
end $$;

create trigger wine_places_stale_neighbours
  after insert or update or delete or truncate on public.wine_places
  for each statement execute function public.wine_place_neighbours_mark_stale();
create trigger wine_place_boundaries_stale_neighbours
  after insert or update or delete or truncate on public.wine_place_boundaries
  for each statement execute function public.wine_place_neighbours_mark_stale();

-- rebuild, from the function's own live branch, so the two can never disagree
create or replace function public.refresh_wine_place_neighbours()
  returns integer language plpgsql security definer set search_path to 'public' as $$
declare v_rows integer;
begin
  update public.wine_place_neighbours_state set fresh = false where only_row;
  delete from public.wine_place_neighbours;
  insert into public.wine_place_neighbours (wine_place_id, position, neighbour_place_id)
  select p.id, o.ord::smallint, (o.e ->> 'id')::uuid
    from public.wine_places p
    join public.wine_place_boundaries b
      on b.wine_place_id = p.id and b.is_current and b.quality_status = 'VALIDATED'
   cross join lateral jsonb_array_elements(
     coalesce(public.get_wine_place_context(p.canonical_key) -> 'nearby', '[]'::jsonb)
   ) with ordinality as o(e, ord)
   where p.publication_status = 'VERIFIED';
  get diagnostics v_rows = row_count;
  update public.wine_place_neighbours_state set fresh = true, built_at = now() where only_row;
  return v_rows;
end $$;
revoke execute on function public.refresh_wine_place_neighbours() from public, anon, authenticated;

select public.refresh_wine_place_neighbours();
```

and in the function body, three inserts:

```sql
  cache_state as materialized (
    select coalesce((select fresh from wine_place_neighbours_state where only_row), false) as ok
  ),
  target_geom as materialized (
    select b.display_geometry as g
      from target t
      join wine_place_boundaries b on b.wine_place_id = t.id and b.is_current
     where not (select ok from cache_state)          -- <= skip all geometry on a hit
  ),
  …
  nearby_candidates as materialized (
    …
     where not (select ok from cache_state)          -- <= One-Time Filter, costs nothing
       and p2.display_tier between least(t.display_tier, 1) and t.display_tier
    …
  ),
  nearby_live as ( … today's list, unchanged … ),
  nearby_cached as (
    select coalesce(jsonb_agg(
             jsonb_build_object('id', np.id, 'key', np.canonical_key,
                                'name', np.name, 'kind', np.kind)
             order by n.position), '[]'::jsonb) as items
      from wine_place_neighbours n
      join target t on n.wine_place_id = t.id
      join wine_places np on np.id = n.neighbour_place_id   -- <= RLS still filters
  ),
  nearby_list as (
    select case when (select ok from cache_state)
                then (select items from nearby_cached)
                else (select items from nearby_live) end as items
  ),
```

Post-state assertions for this half: the table and both policies exist, `anon` holds nothing on
either table, no client role holds INSERT/UPDATE/DELETE on `wine_place_neighbours`, both triggers
exist and are enabled, `refresh_wine_place_neighbours` has no EXECUTE for `public`/`anon`/
`authenticated`, `wine_place_neighbours_state.fresh` is true, and
`select count(distinct wine_place_id) from wine_place_neighbours` is within one of the number of
VERIFIED places that have at least one neighbour — asserted by recomputing it, not hard-coded.

**Cost and locking.** `refresh_wine_place_neighbours()` runs `get_wine_place_context` once per
place. Today that is **143 s** for 3,257 keys; with candidate A in the same migration it is
roughly **60 s**. It runs inside the migration's own transaction (the applier sets
`statement_timeout = 600000`), takes no lock on anything the app reads except its own new table,
and is the only slow step. A later data migration that adds places must call it again — the trigger
has already set `fresh = false` by then, so **forgetting is slow, never wrong**.

**Operational rule this adds**, and it belongs in CLAUDE.md if the owner approves: *any migration
or pipeline step that inserts, updates or deletes `wine_places` or `wine_place_boundaries` must end
with `select public.refresh_wine_place_neighbours();`, **in the same transaction as the write**.
Until it does, the map computes the list live and the panel is slow but correct.*

The "same transaction" half matters: the trigger sets `fresh = false` when the write happens and
the refresh sets it back to true when it finishes. If a catalogue write landed *between* those two
points in a different transaction, the flag would end up true over a list that no longer matches.
Catalogue writes are serial migrations today, so this is a rule to write down rather than a race to
engineer around — but if it ever stops being true, the refresh should take
`lock table public.wine_places, public.wine_place_boundaries in share mode` first, which blocks
writers for its duration and makes the window impossible.

**Dry-run gate.** `node --env-file=.env.local scripts/scratch-apply.mjs --file supabase/migrations/20260920090000_….sql --mode dry`
must print `DRY-OK 20260920090000 …`, and the three-step equivalence decomposition in §5.1 must
come back as stated, before the owner is asked for a live apply.

---

## 7. Rule 1, RLS and grants

Nothing here moves a boundary.

- `get_wine_place_context` stays `LANGUAGE sql`, `STABLE`, **`SECURITY INVOKER`**,
  `SET search_path TO 'public'`, with EXECUTE for `authenticated` and `service_role` and none for
  `anon` or `PUBLIC` — the exact ACL it has today, asserted both before and after.
- The neighbour candidates keep coming from `wine_places` and `wine_place_boundaries` **read as the
  caller**, so `wine places verified read` (`publication_status = 'VERIFIED'`) and
  `wine place boundaries validated read` (`is_current AND quality_status = 'VALIDATED'` AND the
  place is `VERIFIED`) still decide what a caller may see. No place can appear in `nearby` that the
  caller could not already read.
- The rewrite in candidate A changes **only** the geometry predicate's shape. It adds no table, no
  column to any select, no join to anything not already joined.
- Rule 1 (nothing on this path names an unrevealed wine) is not in play at all: `wine_places`,
  `wine_place_boundaries` and everything else this function touches are the editorial place
  catalogue. There is no wine, no glass and no tasting anywhere in it.
- R1 (the tie-break) is an `ORDER BY` clause. It cannot admit a row the filter did not already
  admit, and it reads no column the function did not already read.
- If the owner approves the precomputed table (§3.1), that table stores **place ids only**, is
  `SELECT`-only for `authenticated`, carries the same two-sided `VERIFIED` check as
  `wine_place_relationships verified read`, and the function still joins `wine_places` when it
  renders the list — so RLS filters the cached rows exactly as it filters the computed ones.
- The freshness table holds one boolean and a timestamp, nothing else, and is readable by
  `authenticated`; the function `coalesce`s a failed read to `false`, so a caller who somehow
  cannot read it falls back to computing the list live rather than getting an empty one.
- The two new functions are `SECURITY DEFINER` and both are locked down: the trigger function
  takes no argument and writes only the one-row state table;
  `refresh_wine_place_neighbours()` has `EXECUTE` revoked from `public`, `anon` and
  `authenticated`, so only the owner (`postgres`, i.e. a migration) can run it.

---

## 8. What to ask the owner

Three questions, in order. Nothing is applied until they are answered.

1. **"Nearby" chip order will change once for 1,619 of 3,257 places. Yes?** (R1.) 1,339 of them
   show the same five names in a different order; 280 show a different five. They are all equally
   close — every entry that moves is at distance 0 from the selected place, so nothing becomes
   *wrong* — and nothing outside the `nearby` array moves in any key. In exchange the list stops
   depending on the query plan, which is what makes everything else here provable and keeps it
   proven. **This is the only user-visible change in the note.**
2. **May migration `20260920090000` be applied live?** It is `CREATE OR REPLACE FUNCTION` on
   `get_wine_place_context` (+ the table, policies, triggers and refresh function if R3 is in),
   with fail-closed pre- and post-state `DO` blocks, the live body pinned by md5, and the
   `SECURITY INVOKER` / `search_path=public` / exact-ACL assertions re-run afterwards. No index
   is created, so there is no `CONCURRENTLY` question and no lock to schedule around. The one slow
   step is the initial `refresh_wine_place_neighbours()` (~60 s with R2 in the same migration),
   inside the migration's own transaction, locking nothing the app reads.
3. **R3 adds one standing rule — accept it?** Any future migration or pipeline step that writes
   `wine_places` or `wine_place_boundaries` ends with
   `select public.refresh_wine_place_neighbours();`. Forgetting is slow, never wrong. If R3 is
   declined, R1 + R2 alone still ship and still fix the country click; the tier-4/5 German sites
   stay at 300–530 ms.

**The headline number to quote.** A country click costs **~242 ms of database time today**; with
R2 it is **~56 ms**, and with R3 it is **~1 ms**. The worst key in the whole catalogue —
`germany.mosel.bernkastel.sankt-michael.leiwen-klostergarten` — goes from **558 ms to under 2 ms**.
The client-side work that already shipped (`2026-09-20-wine-map-data-latency.md`) removes the
repeat requests; this removes the cost of the first one.

---

## 9. Order of work for the session that implements this

1. **Re-check the migration version** against live `supabase_migrations.schema_migrations`,
   `origin/master` and every `blindtastingapp-*` worktree. The wine-map stream shares this number
   space (CLAUDE.md).
2. **Re-pin the md5.** `select md5(replace(pg_get_functiondef('public.get_wine_place_context(text)'::regprocedure), chr(13), ''))`
   was `8079a6f1d560a0cb93fdb5364786a39e` when this note was written. If it has moved, the live
   function has changed and every measurement here needs re-taking before anything is written.
3. **Write the migration** (§6 / §6.1), then `scripts/scratch-apply.mjs --mode dry` until it prints
   `DRY-OK`.
4. **Re-run the equivalence decomposition** (§5.1) against the exact bodies the migration installs
   — three diffs, over all 3,309 places, not only the 3,257 with a boundary.
5. **Re-run the timing sweep** on the same body and put the before/after distribution in the
   migration's header comment, the way `20260917090000` does.
6. **Ask the owner** the three questions in §8 — and only then `--mode live`.
7. **Add the standing refresh rule to CLAUDE.md** if R3 ships.
8. No `database.types.ts` change is needed for R1 or R2. R3 adds two tables; they are never read
   from `src/`, so the generated types only need them if something in the app ever selects from
   them — nothing in this design does.

---

## 10. Implemented: `20260920090000_wine_place_neighbours.sql`

Written 2026-09-20, same worktree, **dry-run only — nothing applied, nothing committed**. The
migration carries R1, R2 and R3 together, as §4 recommends. Everything below was executed against
the live database inside transactions that always rolled back.

```
DRY-OK 20260920090000 wine_place_neighbours
```

The version was re-checked immediately before writing: absent from live
`supabase_migrations.schema_migrations` (newest recorded `20260919223200`), from `origin/master`,
and from every `supabase/migrations` under `blindtastingapp-*`. The live body's md5 with CR
stripped is still `8079a6f1d560a0cb93fdb5364786a39e`, so §1–§5's measurements stand and that is
the value the pre-state pins.

### 10.1 What the file does

- The new body is **spliced**, not retyped: `.superpowers/mapnear/build/make-bodies.mjs` applies
  four exact hunks to the live definition and fails if any of them matches other than once. The
  R1+R2 result is byte-identical to `v13-stable-intersects.sql` — the body §4 measured — apart
  from two added comments.
- `wine_place_neighbours` (`wine_place_id`, `position` 1..5, `neighbour_place_id`), RLS on, the
  two-sided VERIFIED read policy, `authenticated` holds `SELECT` and nothing else, `anon` holds
  nothing.
- `wine_place_neighbours_state` — one row, `fresh`, `built_at`.
- Four statement-level triggers (the row-level events and TRUNCATE take separate triggers; a
  TRUNCATE event may not share one with `insert or update or delete`), which clear `fresh` only
  when it is currently true.
- `refresh_wine_place_neighbours()` clears `fresh`, rebuilds from the function's own live branch,
  and **refuses to publish** the cache if any stored neighbour is one the reader's policies would
  filter — it returns `-1` and leaves the map computing live. That is the fail-closed answer to
  "the fill runs as the owner, the read runs as `authenticated`", and it means a future
  non-`VERIFIED` place makes the map slow rather than wrong.
- Post-state assertion 8 **proves the claim at apply time on the real data** rather than asserting
  it: it reads **every place with a current `VALIDATED` boundary** — all 3,257 — with the cache on,
  switches the cache off, reads them all again through the live geometry branch, and aborts the
  migration naming the offenders if any of them differ (§10.7).

### 10.2 Equivalence, executed

`.superpowers/mapnear/probes/verify-migration.mjs`, all as `authenticated`, whole-document
`::text` comparison, **all 3,309 places** (not only the 3,257 with a boundary) plus the
nonexistent-key case.

| # | old | new | result |
| --- | --- | --- | --- |
| 1 | live | live + R2 | `compared=3309 differ=0` |
| 2 | live | live + R1 + R2 | `compared=3309 differ=1619 reorder_only=1339 membership=280 outside_nearby=0` |
| 3 | live + R1 + R2 | **the migration**, cache fresh | `compared=3309 differ=0` |
| 4 | live + R1 + R2 | **the migration**, cache forced stale | `compared=3309 differ=0` |

`no.such.place` returns SQL `null` on both sides of every step.

Step 2 reproduces §4's counts exactly — 1,619 / 1,339 / 280, `outside_nearby = 0`, by tier
`{0:1, 1:26, 2:165, 3:326, 4:775, 5:326}` — so the visible change is the one the owner is being
asked about and nothing more.

Step 3 is the one §3.2 showed can fail: the cache is **filled by the migration as `postgres`** and
**read back as `authenticated`**, the exact cross-role case that produced 1,619 differences before
R1 existed. Step 4 adds what §5.1 did not cover: with `fresh` forced false the function must be
*exactly* R1+R2 again, which is what makes "forgetting to refresh is slow, never wrong" a measured
statement rather than a design intention.

### 10.3 Timing, whole catalogue, server-side

`--step 5`, every one of the 3,257 keys with a boundary, `authenticated`, plan warmed:

```
                 n    median     p75     p90     p99    worst     total
  before      3257     32.06   47.39   80.68  243.32   525.81    140.8 s
  after       3257      0.76    0.80    0.86    1.24     8.53      2.6 s

  keys slower after: 0 / 3257
```

```
  key                                                          before    after
  france                                                      243.32     8.53
  spain                                                       242.91     1.10
  italy                                                       167.12     1.27
  germany                                                      28.12     1.26
  germany.baden                                                35.63     1.08
  italy.veneto.prosecco                                       296.15     0.76
  france.bordeaux.cadillac                                    293.56     0.81
  spain.extremadura.ribera-del-guadiana                       443.77     0.71
  germany.mosel...leiwen-klostergarten                        488.61     0.70
```

France's 8.53 ms is first-touch on the new index pages (it is the sweep's first key); every other
key lands under 3 ms. **54x less database work across the catalogue, and not one key is slower.**

**The fallback path**, which is what runs between a catalogue write and the refresh that follows it
(`--step 6`, cache forced stale, so this is R1+R2 against today):

```
                 n    median     p75     p90     p99    worst     total
  before      3257     36.35   50.09   84.25  241.76   524.20    147.9 s
  after       3257     32.48   47.28   78.47  235.31   517.41    138.5 s

  france 236 -> 88   spain 244 -> 34   italy 168 -> 35   prosecco 297 -> 215
  ribera-del-guadiana 448 -> 110
  keys slower after: 2407 / 3257 - of those, median +0.73 ms, +2.4 s total
  worst regression +43.3 ms (36%) germany.pfalz...weisenheim-a-sand-halde
```

So even with the cache switched off the change is a net −9.4 s across the catalogue and takes the
country click from 236 ms to 88 ms; R2's known cost on sites whose neighbours do not touch is
sub-millisecond for most of them and at worst 43 ms on a handful of deep German keys.

### 10.4 Security, executed

`.superpowers/mapnear/probes/verify-security.mjs`, migration applied in a rolled-back
transaction — **17 passed, 0 failed**:

- a `service_role` UPDATE of `wine_places`, and of `wine_place_boundaries`, each flips `fresh` to
  false — so the trigger fires even though no client role holds EXECUTE on the trigger function
  (PostgreSQL does not check EXECUTE when firing a trigger);
- with the cache stale the function returns the identical answer for `france`;
- `authenticated` may `select` both new tables and may not `insert`, `update` or `delete` either
  (42501), may not call `refresh_wine_place_neighbours()` or the trigger function (42501), and may
  still call `get_wine_place_context`;
- `anon` may not read either table and may not call `get_wine_place_context` (42501);
- **the `wine_places` join in `nearby_cached` is load-bearing, not decorative**: setting one of
  France's cached neighbours to `DRAFT` removes it from the rendered list (`germany, italy, spain`
  becomes `italy, spain`) although the cache row still names it. Per-row RLS filters the cached
  list exactly as it filters the computed one.

The repo's own live contract test passes against the migration as a dry run:

```
WINE_PLACE_CONTEXT_MIGRATIONS=supabase/migrations/20260920090000_wine_place_neighbours.sql \
  node --env-file=.env.local --test scripts/wine-place-context.test.mjs
# tests 8   # pass 8   # fail 0
```

including its own `execute privileges are authenticated-only` and `authenticated role sees
verified content through RLS` cases.

### 10.5 App-side

`npx tsc --noEmit` clean · `npm run lint -- --max-warnings=0` clean · `npm test` 155 files /
3,322 tests passed · `npm run build` compiled successfully (its one Turbopack NFT warning about
`next.config.ts` is pre-existing and unrelated).

No `src/` **behaviour** changes: the RPC's return shape is untouched and nothing in the app reads
either new table. `database.types.ts` does gain both of them anyway — `wine_place_neighbours` and
`wine_place_neighbours_state`, each with `Relationships: []` — because that file is the repo's
hand-written schema mirror and already carries tables no client selects from
(`wine_place_boundaries`, `wine_map_releases`). Leaving them out would be drift, and CLAUDE.md's
own warning applies: the first `supabase.from("wine_place_neighbours")` would collapse to `never`
with no clear error.

### 10.6 Cost and locking at apply time

The migration's own `refresh_wine_place_neighbours()` took **63–75 s** across eight dry runs (it
writes 15,217 rows over 3,216 places; 41 of the 3,257 places with a boundary have no neighbours at
all). The post-state's whole-catalogue comparison (§10.7) repeats that work once more to check it,
so the **whole transaction is ~135 s**, measured end to end:

```
-- everything up to the post-state:                    70.3 s
-- post-state (whole-catalogue comparison):            65.1 s
-- WHOLE MIGRATION:                                   135.3 s
```

It runs inside the migration's transaction, which the applier opens with
`statement_timeout = 600000`, and the file sets `lock_timeout = '10s'`. **No index is created on
any existing table** (§2.3), so there is no `CONCURRENTLY` question.

**What it locks, and the retry to expect.** Readers are never blocked — a `SELECT` takes
`ACCESS SHARE`, which conflicts with nothing this file does — and no app write path touches either
table. But that is the *function's* guarantee, and the *migration's* is different: the two
`references public.wine_places(id)` declarations and the four `CREATE TRIGGER`s take
`SHARE ROW EXCLUSIVE` on **both** `wine_places` and `wine_place_boundaries` and hold it for the
whole ~135 s transaction, so the pipeline scripts of §10.8 would block behind it. Measured rather
than reasoned (`.superpowers/mapnear/probes/fix-locks.mjs` reads `pg_locks` for its own backend
mid-apply, then rolls back):

```
wine_places              ShareRowExclusiveLock granted=true      (2432 kB)
wine_place_boundaries    ShareRowExclusiveLock granted=true      (26 MB)
```

No `ACCESS EXCLUSIVE` anywhere — an earlier draft of this section said there was, wrongly. With
`lock_timeout = '10s'`, a conflicting lock aborts the whole apply: autovacuum or autoanalyze on the
26 MB `wine_place_boundaries` table takes `SHARE UPDATE EXCLUSIVE`, which conflicts with
`SHARE ROW EXCLUSIVE`. A dry run of this file hit exactly that — `canceling statement due to lock
timeout` at 10.5 s, immediate retry clean. **That message is the intended fail-closed outcome, not
a sign the migration is wrong**; the transaction is atomic, so the fix is to run it again. Tell the
owner to expect a possible retry.

### 10.7 Post-state check 8 covers the whole catalogue, and check 6 no longer pretends to

The first version of this file made a claim it could not back. Check 8 sampled **45 keys** (the
four alphabetically first and last per `display_tier`), and check 6 was supposed to cover the rest
by recounting coverage — but check 6 ran while `fresh` was still true, so its right-hand side,
`jsonb_array_length(get_wine_place_context(key) -> 'nearby') > 0`, *read the cache*: the same thing
its left-hand side counted. Both sides moved together by construction. Demonstrated live: deleting
the cache rows for 400 non-sampled places (12% of the catalogue), which then render `nearby: []`,
**passed** the whole post-state.

The fix is not a bigger sample. Check 6 no longer recounts anything — it asserts only that the
cache was published and is not empty — and **check 8 now compares every place that has a current
`VALIDATED` boundary**, all 3,257 of them: read them all with the cache on, set `fresh = false`,
read them all again through the live geometry branch, require every one to be identical, and name
the first offenders if not. Omission and truncation are both caught, because a missing cache row
renders `[]` against a live list.

Order is load-bearing and is called out in the file: the **cached** pass has to come first, while
`fresh` is still true. Turning the cache off before collecting the sample would make both passes
live — the same trap in the other direction.

Executed against live, migration applied in rolled-back transactions
(`.superpowers/mapnear/probes/fix-verify.mjs`):

| sabotage | old check | new check |
| --- | --- | --- |
| none (the real fill) | pass, `45 differ=0` | pass, *all 3,257 render the same cached as live* |
| delete the cache rows of **400 non-sampled** places (1,902 rows) | **pass** | **abort** — `first offenders: italy.piemonte, italy.umbria, portugal.dao, …` |
| truncate **one non-sampled** place from 5 entries to 1 | **pass** | **abort** — `first offenders: france.alsace.bennwihr` |
| delete the **45 sampled** places' rows | abort | abort |

The price is the second live pass: 65.1 s, taking the apply from ~70 s to ~135 s (§10.6). That is
what the guarantee costs, and the guarantee is the reason the migration exists in the form it does.

### 10.8 The catalogue's writers are not only migrations

The first version of this file said "catalogue writes are serial migrations today" and derived the
same-transaction refresh rule from it. That premise is **false**, and it matters, because it is the
one sentence that would have made someone go looking: **28 scripts under `scripts/wine-map-sources/`
commit to `wine_places` / `wine_place_boundaries` directly against live, outside any migration** —
`build-germany-einzellagen` (which also flips `is_current` and promotes to `VERIFIED`),
`build-germany-anbaugebiete` / `bereiche` / `grosslagen`, the three `build-*-country-outline`,
`build-spain-comunidad-boundaries`, `build-boundary`, `derive-boundary`,
`fetch-alsace/champagne/vacqueyras-communes`, `run-spain-dos`, the `stage-*-official` and
`stage-wave*` family, `trim-sibling-overlaps`. Each fires the staleness trigger; none of them can
honour the same-transaction rule — `build-germany-einzellagen.mjs` commits **once per place**, and
a 65 s rebuild inside each of 3,216 transactions is not a thing to ask for.

So the rule is stated in two shapes, and the file says which applies to whom:

- **A migration** that writes either table ends with `select public.refresh_wine_place_neighbours();`
  **in the same transaction**. Strong form; always available to a migration.
- **A pipeline run** does **one** refresh as the **last step of the batch**, in its own transaction:
  `node --env-file=.env.local scripts/wine-map-sources/refresh-neighbour-cache.mjs`. Between the
  batch's first write and that call the map is slow and correct — an accepted, documented window,
  not an oversight.

Three things now make that rule hard to forget, none of which relies on reading this document:

1. **`scripts/wine-map-sources/neighbour-cache.mjs`** — `warnIfNeighbourCacheStale(client)` is
   called right after the commit in all 28 committing scripts. One indexed single-row read, latched
   to print once per process, silent on a database where the migration is not applied. It prints a
   banner naming the exact command. `refreshNeighbourCache(client)` is the repair, a no-op while
   the cache is already fresh, so it is safe to end any run with — it deliberately issues no
   `begin`/`commit` of its own, so it cannot end a caller's transaction.
2. **The trigger raises a `NOTICE`** on the `fresh → stale` transition — once per transition, not
   once per statement, so a 3,216-transaction batch says it on the first write and then stays
   quiet. Verified: three catalogue writes, one notice.
3. **`scripts/wine-place-context.test.mjs` asserts the cache is fresh** (and non-empty). A stale
   cache is *correct*, so nothing else in the app or the suite would ever go red over it — the only
   symptom is the latency this whole migration exists to remove. Now the repo's own database
   contract test fails instead. It skips itself on a database where the migration is not applied,
   so it keeps passing against live until the apply happens.

`scripts/wine-map-sources/run-targets.mjs`, the one batch orchestrator, ends with the refresh
itself and never fails the run over it (the targets really were built; stale is slow, not wrong).

The helper was exercised end to end against live inside a rolled-back transaction
(`.superpowers/mapnear/probes/fix-helper.mjs`, **13 pass / 0 fail**): silent before the migration;
silent while fresh; banner exactly once after a catalogue write and not again; `refreshNeighbourCache`
rebuilds 15,217 rows in 63.5 s and sets `fresh`; the second call is a no-op; and the whole
catalogue still renders the same list cached as live after that helper-driven rebuild.

### 10.9 Owner-only means owner-only, `service_role` included

Both new functions are described as callable "by nobody but the owner", and the first version of
the file did not make that true: the revokes named `public, anon, authenticated` only, and this
database's default ACL for a new function in `public` is
`{postgres, anon, authenticated, service_role}` — so `service_role` kept EXECUTE. Verified live:
`has_function_privilege('service_role', 'public.refresh_wine_place_neighbours()', 'EXECUTE')` was
true, and `set local role service_role; select refresh_wine_place_neighbours()` actually ran.
Post-state check 5 tested three roles and described a fourth, so it passed without noticing.

The security impact was small — `service_role` already bypasses RLS, and the function refuses
(`-1`) rather than publishing a wrong cache — but this repo has hit the same Supabase default
before and handles it explicitly (CLAUDE.md, `transfer_tasting_host` / owner decision OD-1: the
migration "explicitly revokes it there too"). A file whose whole discipline is *assert what you
claim* should not claim owner-only and mean something else.

Both revokes now name `service_role`, and check 5 asserts the **exact ACL** rather than probing a
list of roles:

```
public.refresh_wine_place_neighbours()
  acl={postgres=X/postgres} service_role=false authenticated=false anon=false public=false
public.wine_place_neighbours_mark_stale()
  acl={postgres=X/postgres} service_role=false authenticated=false anon=false public=false
service_role call refused: permission denied for function refresh_wine_place_neighbours
get_wine_place_context acl= {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
```

`get_wine_place_context`'s own ACL is untouched, as before and after both assert. The pipeline
scripts connect as `postgres`, so nothing that needs to call the refresh loses the ability to.

### 10.10 Still to do, and it is not this session's to do

1. **Ask the owner §8's three questions.** Nothing has been applied.
2. `--mode live` only after that — and tell the owner a `canceling statement due to lock timeout`
   on the first attempt is expected behaviour, not a failure (§10.6). Re-run.
3. The standing refresh rule is now in **CLAUDE.md**, in the wine-map section, worded "once
   20260920090000 is live". It landed with the migration rather than after the apply on purpose:
   migration versions are shared with a concurrent wine-map data stream, and the window in which
   the rule exists only inside one unapplied file is exactly the window in which that stream's next
   batch could land without it.

---

## 11. Independent re-verification, 2026-09-20 (second session, worktree `mapnear`)

Everything in §10 was re-measured from scratch by a second session that did not reuse the probes
above, against the same live database, read-only or in transactions that always rolled back. Probes:
`.superpowers/mapnear/probes/iv-*.mjs` (gitignored). **Every structural claim reproduced. One
headline number did not, and §10.3 is corrected below.**

### 11.1 What reproduced exactly

| claim | how it was re-checked | result |
| --- | --- | --- |
| live body is what the migration pins | `md5(replace(pg_get_functiondef(...), chr(13), ''))` | `8079a6f1d560a0cb93fdb5364786a39e` — matches |
| the live `nearby` list is **not a function of the data** | read the whole catalogue as `authenticated` twice, as `postgres`, and with `enable_seqscan`/`enable_hashagg` off | same role twice: **0 of 3,257 differ**; `authenticated` vs `postgres`: **1,619 differ** (1,286 reordered, 333 a different five) |
| R1 makes the list role-independent | new function, cache on, `authenticated` vs `postgres`, whole catalogue | **0 of 3,257 differ** |
| R3 cache == live branch **under RLS** | new function cache-on vs cache-off, both as `authenticated`, whole catalogue | **0 of 3,257 differ** (stronger than post-state check 8, which runs as owner) |
| nothing outside `nearby` moves | full `jsonb` minus `'nearby'`, old vs new, whole catalogue | **unchanged for all 3,257 keys** — so `bbox`, ancestors, children, article, grapes, styles, designations and dual-label edges are byte-identical, confirming the `cache_ready` gate on `target_geom` is safe (`bbox` comes from `boundary_row`, which is not gated) |
| user-visible delta | old vs new, `authenticated`, whole catalogue | **1,619 keys differ, 1,339 the same five reordered, 280 a different five** — matches §8 |
| grants and RLS do not move | 16 behavioural checks (not just ACL reads) with the migration applied in a rolled-back transaction | **16/16**: `anon` cannot call the RPC or read either table; `authenticated` reads both but cannot insert, update or delete; `refresh_wine_place_neighbours()` and `wine_place_neighbours_mark_stale()` refuse `anon`, `authenticated` **and `service_role`**; 0 cached rows name a place the reader cannot see |
| "add an index / make it sargable" is not the fix | wrote the boundaries-first form by hand and timed it | `france.savoie` 2.81 s vs 0.20 s today; `spain` 105 s vs 0.31 s; **`france` hit the 300 s statement timeout**. The planner still refused the GiST index and drove places-first off `wine_place_boundaries_one_current_idx` with `st_dwithin` as a `Filter` — reproducing the exact "Rows Removed by Filter" shape the task brief quoted, which confirms §2.3: that plan belongs to the *extraction*, not to the deployed function |
| the refresh script's timeout survives the pooler | ran its exact `SET` + next-statement sequence on 6543 and 5432 | the `SET` persists on both, and the default is **2 min** anyway, above the ~65 s refresh — not a bug |

### 11.2 §10.3's "after" number is corrected: ~8 ms server-side, not 0.76 ms

Measured with ONE method for both sides (server-side `clock_timestamp()` around the call, as
`authenticated`, warmed, median of 5 — `iv-baseline.mjs` and `iv-after.mjs`):

```
key                                    before   after (cache fresh)   fallback (cache stale)
france                                  232.4          8.0                    62.0
spain                                   248.5          7.8                    35.9
italy                                   172.6          7.9                    33.1
germany                                  33.8          7.8                    32.4
spain.extremadura                       262.8          7.7                    98.4
france.savoie                            16.3          7.9                    17.9
france.bordeaux.haut-medoc.pauillac      16.3          8.0                    18.1
italy.veneto.prosecco                       —          7.7                   222.9
france.bordeaux.cadillac                    —          7.7                   299.7
germany.mosel…leiwen-klostergarten          —          7.7                   453.1
```

The shape of §10.3 is right — every key converges on one flat number and none is slower — but that
number is **~7.8 ms, not 0.76 ms**, and the difference is not caused by this change:

- The freshness read costs **0.014 ms**; the cached `nearby` render adds **~1.1 ms**.
- The live body with `nearby` stubbed to `'[]'`, **with no migration applied at all**, already costs
  **6.4 ms** (france) / 6.1 ms (germany) — so §2.1's "strip it and every key answers in 1.3–2.2 ms"
  is the *execution-only* number from a warm prepared plan, not what a call costs.
- `EXPLAIN (ANALYZE)` of that stub: **Planning Time 5.167 ms, Execution Time 1.151 ms**. The floor is
  overwhelmingly **planning the 13-CTE statement**, and 5.2 + 1.2 ≈ 6.4 matches the measurement.

Neither figure is wrong; they measure different things, and which one production pays depends on
whether PostgREST's prepared statements survive Supavisor's transaction pooling. **Quote the
conservative one.** The improvement is large either way:

> A country click costs **232 ms of database time today**. After this change it is **8 ms** — or
> ~2 ms if the plan is cached. The worst keys in the catalogue (`leiwen-klostergarten`,
> `cadillac`, `prosecco`) go from **300–560 ms to 7.7 ms**.

An `ANALYZE` of the new table was tested and is **not needed**: the plan and the timing are identical
with and without it (the cached lookup is an index scan on `wine_place_neighbours_pkey`, 0.16 ms
either way), so the migration is correct as written.

### 11.3 The follow-up this now exposes

Once `nearby` is cached, **~5 ms of the remaining ~8 ms is planning time** for the function's other
twelve CTEs, and ~1.2 ms is executing them. Planning is now the single largest component of a place
click. That is the next thing to attack if the owner wants more, and it is a different change from
this one (fewer/simpler CTEs, or making sure the plan is reused). Nothing in this note touches it.
