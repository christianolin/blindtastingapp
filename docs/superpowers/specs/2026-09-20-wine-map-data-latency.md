# Wine map data latency: design

Date 2026-09-20. Base `master` at `a6cfb22` (worktree `blindtastingapp-mapdata`, branch `mapdata`). Owner, verbatim: **"keep improving the performance of the map. It still has some lag issues certain places"**.

This is a **latency-only** note. The panel's rendered content does not change: same sections, same strings, same order, same empty states. No migration, no RPC change, no new column in any select, no Anthropic API call. Nothing here touches `src/app/knowledge/map/tile-wine-map.tsx`, `src/lib/wine-map/basemap.ts` or `src/components/active-tasting-banner.tsx` — a sibling workflow owns those three.

Companion to `2026-09-19-map-dark-mode.md` (the canvas) — that note fixed paint; this one fixes the **data path behind the details panel**.

---

## 1. The measured baseline

Main session, production, one click selecting **Savoie** on the map:

| what | when | how long |
| --- | --- | --- |
| panel first changes | 60 ms | — |
| `rpc/get_wine_place_context` | starts 107 ms | **378 ms** |
| `wine_places?select=id&canonical_key=eq.france.savoie` | starts 107 ms (parallel) | 112 ms |
| `wine_archetype_placements?select=archetype_id,sort_order` | starts **266 ms** (waited for the id) | 98 ms |
| `wine_place_styles?select=style,colour,note` | starts **512 ms** (waited for the context) | 62 ms |
| **panel settles** | **614 ms** | one 83 ms long task |

Four requests, three of them serial behind something else, and **nothing is cached**: clicking back up the breadcrumb to a place already visited pays the whole waterfall again.

### 1.1 Where the 614 ms actually goes (proven live, read-only)

Every query below was run against the live database inside `begin; set transaction read only; … rollback`, as the `authenticated` role (`set local role authenticated` with `request.jwt.claims`). Nothing was written and no migration was applied.

**The database is not the bottleneck.** `get_wine_place_context` server-side, median of 3 warm runs after one cold run:

```
key                                             kind         cold(ms) warm(ms)  payload
france                                          COUNTRY           292      253    4362 B
germany                                         COUNTRY            59       54    4529 B
italy                                           COUNTRY           200      194    4983 B
portugal                                        COUNTRY            52       41    4122 B
spain                                           COUNTRY           277      270    4036 B
france.savoie                                   REGION             41       35    5809 B
france.bordeaux                                 REGION             39       38    4317 B
france.bourgogne                                REGION             40       39    2966 B
france.bordeaux.haut-medoc.pauillac             APPELLATION        42       36    6276 B
france.bourgogne.cote-de-nuits                  SUBREGION          32       31    3227 B
italy.sicilia                                   REGION             35       32    3559 B
…18 further SUBREGION / APPELLATION / SITE keys  29–111 ms
germany.rheinhessen.bingen.st-rochuskapelle.gensingen-goldberge SITE 160  157    2015 B
```

So Savoie costs **35 ms at the database** and **378 ms at the browser**: roughly **340 ms per request is network, TLS, the Supabase edge and PostgREST**, not SQL. That single fact decides the whole design — *the lever is the number of round trips and whether we make them at all*, not query tuning.

Two secondary findings, both worth knowing:

- **"Certain places" is real and it is the country level.** `france` 253 ms, `spain` 270 ms, `italy` 194 ms server-side, against 26–60 ms for almost everything else. Payload size does not explain it (`germany` is a *larger* payload at 53 ms) and neither does child count (france 13 children / 260 ms vs germany 12 children / 53 ms). The indicated cause is the RPC's `nearby_list` CTE: written out on its own it plans as a Nested Loop with `st_dwithin` as a **join filter** over all 3,257 current boundaries with no index (`Rows Removed by Join Filter: 3233`, 2.4 s for Savoie, statement-timeout for France). Inside the function it plans better, but it is the only part of the RPC whose cost scales with the *outline complexity* of the selected place, which is exactly what separates France/Spain/Italy from Germany. **This is a follow-up, not this note's work** — fixing it needs a migration, and the task forbids one. §9 records it.
- **Cold-plan variance is large.** The first `france.savoie` call in a fresh session measured 906 ms against a 38 ms warm median. A client cache removes every repeat call, which is where that variance otherwise keeps showing up.

### 1.2 The archetype waterfall, measured

`fetchArchetypesForPlace` (`src/lib/wset/queries.ts:449`) is three chained requests by itself — `wine_places` id → `wine_archetype_placements` → `wine_archetypes`. Savoie has **0** archetypes so it short-circuits after two (which is what the trace shows); `france.bourgogne` has **5** and pays all three. Server-side, as `authenticated`:

```
chain('france.savoie')      3 round trips (SQL only): 44 ms, archetypes=0
chain('france.bourgogne')   3 round trips (SQL only): 68 ms, archetypes=5
single join ('france.savoie')       med 20 ms  rows=0
single join ('france.bourgogne')    med 20 ms  rows=5
```

At the database the difference is ~25–48 ms. **At the browser it is 1 round trip instead of 2 or 3, i.e. ~110–220 ms of pure latency**, and on a slow link it is 1×RTT instead of 3×RTT.

---

## 2. Decisions

- **D1 A per-page-load, per-key client cache**, module level, for the place context, the archetype list and the style rows. Bounded LRU, 50 entries each. No TTL. Re-selecting a visited place makes **no request at all**.
- **D2 One request for the archetypes**, not three: a PostgREST embedded filter on `wine_archetype_placements`. `ArchetypeListItem[]` and its order are byte-identical to today's.
- **D3 The styles query moves up and starts in parallel** with the context RPC, keyed by the canonical key instead of the place id, so it no longer waits 512 ms for something it never needed.
- **D4 Prefetch on intent, desktop only**: a ~120 ms hover/focus dwell on a tree row or a "Nearby"/"Labelling" chip warms that key's cache. Never on touch. At most 2 places in flight.
- **D5 A cache hit is applied synchronously**, so a revisit never flashes "Loading…". The cache exposes a `peek` alongside the async load.
- **D6 Nothing here is per-user, and that is proven, not assumed** (§6.1). The cache is still cleared when the signed-in user changes, as a guard against a future policy that *is* per-user.
- **D7 Nothing cached is an error or an absence.** A thrown request and a `null` context are never stored. An **empty** archetype or style list *is* real data and *is* stored.
- **D8 The four changes are independent** and land as four commits, each revertible on its own (§10).

---

## 3. What the code does today (verified at `a6cfb22`)

**Call sites — all of them.**

| symbol | defined | callers |
| --- | --- | --- |
| `fetchWinePlaceContext` | `src/lib/wine-map/context.ts:104` | exactly one: `src/app/knowledge/map/tile-wine-map-explorer.tsx:262` |
| `fetchArchetypesForPlace` | `src/lib/wset/queries.ts:449` | exactly one: `src/app/knowledge/map/tile-wine-map-explorer.tsx:289` |
| `fetchWinePlaceTree` | `src/lib/wine-map/tree.ts:57` | exactly one: `tile-wine-map-explorer.tsx:156` (once per page load — not touched here) |
| the styles query | inline at `src/app/knowledge/map/knowledge-sections.tsx:266-286` | `KnowledgeSections`, rendered only from `tile-wine-map-explorer.tsx:779` |

`grep -rn "fetchArchetypesForPlace" src/ scripts/` returns the definition and that one caller. **The signature is safe to change**; this note keeps it anyway (§4.2) so the diff stays one function body.

**The two effects that matter** (`tile-wine-map-explorer.tsx`):

- 259-274: on `selectedKey`, `fetchWinePlaceContext` → `setContext` / `setContextState("ready" | "missing")`, `catch` → `"error"`. Guarded by a `cancelled` flag.
- 286-299: on `selectedKey`, `fetchArchetypesForPlace` → `setArchetypeData({ key, rows })`; a `catch` stores `{ key, rows: [] }`. Read back at 300-301 **only when `archetypeData.key === selectedKey`**, so a stale set can never flash under a new place. That tagging pattern is reused for styles in §4.3.

`select()` (309-326) early-returns on the same key, sets `contextState("loading")` and calls `setSelectedKey`. The deep-link branch (359-370) does the same two writes. Both are D5's insertion points.

**`get_wine_place_context` already returns** `place` (with `id`), `ancestors`, `children`, `article`, `boundary`, `grapes`, `styles`, `designations`, `nearby`, `dual_labels`, `classified_members` (`src/lib/wine-map/context.ts:58-78`; live definition `supabase/migrations/20260829263400_wine_place_context_classified_members.sql`).

**Why the styles are re-fetched at all.** The RPC's `style_list` CTE builds `jsonb_build_object('style', s.style, 'note', s.note)` — it does **not** carry `colour`, and the panel needs it to render "White sparkling" / "Rosé sparkling" (`knowledge-sections.tsx:88-97`). Verified live:

```
france.savoie    context.styles = [{"note":null,"style":"WHITE"},
                                   {"note":"Mondeuse, Gamay, Pinot Noir","style":"RED"},
                                   {"note":null,"style":"ROSE"}]
france.savoie    wine_place_styles = [{"style":"WHITE","colour":null,"note":null,"sort_order":0},
                                      {"style":"RED","colour":null,"note":"Mondeuse, Gamay, Pinot Noir","sort_order":1},
                                      {"style":"ROSE","colour":null,"note":null,"sort_order":2}]
```

So the extra query is **genuinely needed** (the RPC would have to change to remove it, which is out of scope). `colour` is sparse — `select count(*) n, count(colour) with_colour from wine_place_styles` → `{"n":"2444","with_colour":"100"}` — but sparse is not absent, and there is no way to know which places have one without asking. §4.3 therefore keeps the query and only moves *when* it starts.

---

## 4. The four changes

### 4.1 Per-key client cache — `src/lib/wine-map/place-cache.ts` (new) over `src/lib/wine-map/lru.ts` (new)

**Contract.**

| | |
| --- | --- |
| **Key** | the place's `canonical_key`, verbatim (`"france.savoie"`). Nothing else is in the key. |
| **Stores** | three independent maps: `context` (`WinePlaceContext`), `archetypes` (`ArchetypeListItem[]`), `styles` (`StyleRow[]`). |
| **Size** | 50 entries each, `MAX_CACHE_ENTRIES`. Measured payloads are 1.5–6.3 KB, so the context map peaks near **300 KB**; the other two are an order of magnitude smaller. |
| **Eviction** | least-recently-*used*, insertion-ordered `Map`: a hit `delete`s then `set`s the key to move it to the end; a `set` past capacity deletes the first key. |
| **Freshness** | **no TTL.** These are editorial/catalog rows (`wine_places`, `wine_place_articles`, `wine_place_styles`, `wine_place_grapes`, `wine_designations`, `wine_archetypes`) that only ever change by a data migration and a redeploy. A page load is the refresh boundary and that is the right one: the module lives in the browser bundle, so a reload — which every deploy forces anyway — empties it. |
| **Never cached** | (a) a rejected request: the entry is deleted in the promise's `catch`, so the next selection retries; (b) a `null` context ("that place isn't on the map yet"), because a `null` can also mean *RLS hid it*, which is not a stable fact, and it is a rare path worth nothing to cache. |
| **Always cached** | an **empty** `ArchetypeListItem[]` or `StyleRow[]`. Most places have no archetypes (24 placements across 3,309 places) and an empty list is the true answer, not a miss. This distinction is a test. |
| **In-flight sharing** | the map stores the **promise**, so a prefetch already in flight for a key is reused by the click that follows instead of firing a second request. |
| **Reset** | `clearWinePlaceCaches()`, called when the signed-in user changes (D6/§6.1). |

**Shape.**

```ts
// src/lib/wine-map/lru.ts — pure, no browser API, unit-tested.
export function createLru<V>(capacity: number): {
  get(key: string): V | undefined;   // promotes on hit
  peek(key: string): V | undefined;  // does NOT promote
  set(key: string, value: V): void;
  delete(key: string): void;
  clear(): void;
  readonly size: number;
};
```

```ts
// src/lib/wine-map/place-cache.ts — the browser half.
export function loadWinePlaceContext(sb, key): Promise<WinePlaceContext | null>;
export function loadArchetypesForPlace(sb, key): Promise<ArchetypeListItem[]>;
export function loadPlaceStyles(sb, key): Promise<StyleRow[]>;

/** Synchronous, for D5. `undefined` = not cached. Never triggers a request. */
export function peekWinePlaceContext(key): WinePlaceContext | null | undefined;
export function peekArchetypesForPlace(key): ArchetypeListItem[] | undefined;
export function peekPlaceStyles(key): StyleRow[] | undefined;

/** Warms all three for one key, D4. Resolves when all settle; never throws. */
export function prefetchWinePlace(sb, key): Promise<void>;
export function winePlacePrefetchesInFlight(): number;
export function clearWinePlaceCaches(): void;
```

`peek*` returns the **resolved value only** — a key whose promise is still pending peeks as `undefined`, because D5 needs "can I render this right now", not "is a request out".

**Cancellation is unchanged.** `place-cache` never touches React state. Both effects keep their `let cancelled = false` / `if (cancelled) return` guard exactly as written today, so a stale response can still never overwrite a newer selection — the cache only changes *whether a request goes out*, never who wins.

**Identity matters.** A cache hit returns **the same object/array reference** every time, so `setContext(cached)` and `setArchetypeData({ key, rows: cached })` after a synchronous D5 apply are `Object.is`-equal and React bails out of the re-render instead of doing a second pass.

**D5, the synchronous apply.** In `select()` (`tile-wine-map-explorer.tsx:309-326`) and in the deep-link branch (359-370), replace the bare `setContextState("loading")` with:

```ts
const cached = peekWinePlaceContext(key);
if (cached) {
  setContext(cached);
  setContextState("ready");
} else {
  setContextState("loading");
}
```

and the same shape for `peekArchetypesForPlace` / `peekPlaceStyles` into their tagged state. Without this, a cache hit still costs one committed "Loading…" frame, because a resolved promise lands in a microtask *after* the commit. With it, a revisit repaints in a single render.

### 4.2 One request for the archetypes — `src/lib/wset/queries.ts:449`

**The new query, proven against live.** PostgREST validates the select/embed **before** RLS, so an anon-key request is a real syntax proof: a bad embed answers 400/PGRST200, a good one answers 200. Run with the public `NEXT_PUBLIC_SUPABASE_ANON_KEY` via `@supabase/supabase-js` 2.110.2 (the version in `package.json`), against the live project:

```js
// CONTROL — deliberately wrong embed
supabase.from("wine_archetype_placements")
  .select("sort_order, wine_not_a_table!inner(id)")
  .eq("wine_not_a_table.id", "x")
// → status=400  PGRST200 "Could not find a relationship between
//    'wine_archetype_placements' and 'wine_not_a_table' in the schema cache"

// PROPOSED
supabase.from("wine_archetype_placements")
  .select("sort_order, wine_archetypes!inner(id, name, colour, style), wine_places!inner(canonical_key)")
  .eq("wine_places.canonical_key", "france.bourgogne")
  .order("sort_order")
// → status=200, error=none      (rows [] because every policy here is `to authenticated`)

// PROPOSED (styles, §4.3)
supabase.from("wine_place_styles")
  .select("style, colour, note, sort_order, wine_places!inner(canonical_key)")
  .eq("wine_places.canonical_key", "france.savoie")
  .order("sort_order")
// → status=200, error=none

// and, confirming the RPC is authenticated-only (§6.1):
supabase.rpc("get_wine_place_context", { p_place_key: "france.savoie" })
// → status=401, 42501 "permission denied for function get_wine_place_context"
```

**The relationships PostgREST needs all exist** (`pg_constraint`, read-only):

```
wine_archetype_placements_archetype_id_fkey : wine_archetype_placements(archetype_id) -> wine_archetypes(id)
wine_archetype_placements_wine_place_id_fkey: wine_archetype_placements(wine_place_id) -> wine_places(id)
wine_place_styles_wine_place_id_fkey        : wine_place_styles(wine_place_id)        -> wine_places(id)
```

**The rows, proven as `authenticated`** (the SQL the embed compiles to):

```sql
select pl.archetype_id, pl.sort_order, a.id, a.name, a.colour, a.style
from wine_archetype_placements pl
join wine_archetypes a on a.id = pl.archetype_id
join wine_places p     on p.id = pl.wine_place_id
where p.canonical_key = $1
order by pl.sort_order;
-- 'france.bourgogne' -> 5 rows, med 20 ms:
--   {"sort_order":10,"id":"1c324a54-…","name":"A typical Chablis","colour":"WHITE","style":"STILL"}
--   {"sort_order":20,"id":"73235e29-…","name":"A typical Côte de Nuits","colour":"RED","style":"STILL"}
--   … Côte de Beaune (30), Côte Chalonnaise (40), Mâconnais (50)
-- 'france.savoie' -> 0 rows, med 20 ms
```

**The order is provably identical.** There are no ties to break:

```sql
select p.canonical_key, pl.sort_order, count(*)
from wine_archetype_placements pl join wine_places p on p.id = pl.wine_place_id
group by 1,2 having count(*) > 1;
-- → 0 rows.  All 24 placements across 12 places have a unique sort_order within their place.
```

So `.order("sort_order")` alone fully determines the sequence, and adding the join cannot reorder anything. Today's "preserve the placement order" comment and its `ids.map(...)` re-sort become unnecessary — the server does it.

**RLS is unchanged, not merely similar.** Live `pg_policies`:

```
wine_archetype_placements | archetype placements read | SELECT | {authenticated} | true
wine_archetypes           | archetypes read           | SELECT | {authenticated} | true
wine_places               | wine places verified read | SELECT | {authenticated} | publication_status = 'VERIFIED'
wine_place_styles         | wine place styles published read | SELECT | {authenticated} |
        editorial_status = 'PUBLISHED' AND EXISTS (select 1 from wine_places p
        where p.id = wine_place_styles.wine_place_id and p.publication_status = 'VERIFIED')
```

Today's first hop is `wine_places.select("id").eq("canonical_key", …)` under that *same* `VERIFIED` policy and returns nothing for an unverified place, after which the function returns `[]`. `wine_places!inner(...)` drops the row for exactly the same set of places. **No column is widened**: `canonical_key` is the value the caller passed in, and PostgREST requires an embedded resource to appear in `select` before it can be filtered on.

**Typing.** `src/lib/supabase/database.types.ts` is hand-written with `Relationships: []` on every table (CLAUDE.md), so postgrest-js cannot type an embed. The repo already has the answer — widen the select string to `string` and cast the rows, as `src/lib/active-tasting/read.ts:22-26` and `src/lib/wset/queries.ts:94-102` do:

```ts
// Not a literal select type: every table carries `Relationships: []`, so
// postgrest-js cannot type the embed and the rows go through archetypeRows().
const ARCHETYPES_FOR_PLACE_SELECT: string =
  "sort_order, wine_archetypes!inner(id, name, colour, style), wine_places!inner(canonical_key)";

export async function fetchArchetypesForPlace(
  supabase: SupabaseClient<Database>,
  canonicalKey: string,
): Promise<ArchetypeListItem[]> {
  const { data } = await supabase
    .from("wine_archetype_placements")
    .select(ARCHETYPES_FOR_PLACE_SELECT)
    .eq("wine_places.canonical_key", canonicalKey)
    .order("sort_order");
  return archetypeRows(data);
}
```

**Signature unchanged** — same two parameters, same `Promise<ArchetypeListItem[]>` — so its one caller needs no edit for this change.

**`archetypeRows` is pure and lives in `src/lib/wset/archetype-rows.ts`** so vitest can load it without pulling in supabase-js:

```ts
type Embedded = { id: string; name: string; colour: string; style: string };
type Raw = { sort_order: number; wine_archetypes: Embedded | Embedded[] | null };

export function archetypeRows(data: unknown): ArchetypeListItem[];
```

It (a) takes `wine_archetypes` as an object **or** a one-element array **or** null, because PostgREST's to-one embed shape is the one thing that could not be proven over HTTP without an authenticated session — the repo already hedges this exact way at `src/lib/wset/queries.ts:102` (`Array.isArray(g) ? g[0]?.name : g?.name`) and `src/app/catalog/page.tsx:187`; (b) drops a row whose embed is missing, which is what today's `byId.get(id)` + `.filter(Boolean)` already does; (c) preserves the incoming order verbatim and never re-sorts. §8 gives the main session the one browser check that closes the object-vs-array question for good.

### 4.3 Styles: drop the chained round trip, start in parallel — `knowledge-sections.tsx` + `tile-wine-map-explorer.tsx`

The effect at `knowledge-sections.tsx:266-286` cannot start earlier where it is: `KnowledgeSections` is only mounted from `tile-wine-map-explorer.tsx:779`, inside the branch that requires `context` to be ready. That is the whole 512 ms.

**Move it up.** New `src/lib/wine-map/place-styles.ts` exports the `StyleRow` type (moved verbatim from `knowledge-sections.tsx:86`, re-exported from there so nothing else has to change) and:

```ts
const PLACE_STYLES_SELECT: string =
  "style, colour, note, sort_order, wine_places!inner(canonical_key)";

export async function fetchPlaceStyles(sb, canonicalKey: string): Promise<StyleRow[]> {
  const { data } = await sb.from("wine_place_styles")
    .select(PLACE_STYLES_SELECT)
    .eq("wine_places.canonical_key", canonicalKey)
    .order("sort_order");
  return placeStyleRows(data);              // pure, src/lib/wine-map/place-style-rows.ts
}
```

`placeStyleRows` does exactly today's mapping (`knowledge-sections.tsx:275-281`): `style` as string, `colour ?? null`, `note ?? null`, order untouched. Proven live that key-filtered and id-filtered return the same rows in the same order at the same cost (med 20 ms both ways, §3).

In the explorer, a third effect keyed on `selectedKey`, alongside the other two — so all three requests leave together:

```ts
const [styleData, setStyleData] = useState<{ key: string; rows: StyleRow[] } | null>(null);
// …effect on [supabase, selectedKey], cancelled-guarded, catch → { key, rows: [] }
const styleRows = styleData && styleData.key === selectedKey ? styleData.rows : [];
```

— the same key-tagging the archetype state already uses at 279-301, for the same reason. `KnowledgeSections` takes `styleRows: StyleRow[]` as a prop and loses its `useEffect`, its `useState` and its `createClient()`.

**Rendered output is unchanged.** Today `styleRows` starts `[]` and the "Wine styles" block is hidden until the query lands; that stays true, it just lands ~400 ms earlier. There is deliberately **no** fallback to `context.styles` while the query is in flight: for the 100 rows that carry a colour it would paint "Sparkling" and then repaint "White sparkling", and a flicker is a content change.

**Every other section was checked for the same fault.** `grapes`, `designations`, `nearby`, `dual_labels` and `classified_members` all render straight from the context object — no second request. The one remaining fetch in the file is `GrapeModal`'s `grapes` profile lookup (`knowledge-sections.tsx:138-153`); it runs only after a click, needs seven columns the RPC does not carry, and is off the selection path. Left alone.

### 4.4 Prefetch on intent — `src/lib/wine-map/prefetch-rule.ts` (new, pure) + `use-place-prefetch.ts`

**The pure rule.**

```ts
export const PREFETCH_DWELL_MS = 120;
export const MAX_PREFETCH_IN_FLIGHT = 2;

export type PrefetchEnv = {
  key: string | null;     // what is being hovered/focused
  selectedKey: string | null;
  pointerFine: boolean;   // (hover: hover) and (pointer: fine)
  cached: boolean;        // peek already has it
  inFlight: number;       // prefetchWinePlace calls not yet settled
};

/** False for: no key; a coarse/no-hover pointer; the already-selected place;
    an already-cached place; and once MAX_PREFETCH_IN_FLIGHT is reached. */
export function shouldPrefetch(env: PrefetchEnv): boolean;
```

**The browser half**, `useWinePlacePrefetch(supabase)`, returns `{ onEnter(key), onLeave() }`:

- `onEnter` starts one `setTimeout(PREFETCH_DWELL_MS)`; when it fires it re-checks `shouldPrefetch` (state may have moved during the dwell) and calls `prefetchWinePlace`.
- `onLeave` clears the pending timer. A request already in flight is **not** aborted — it is one small GET and its result is worth keeping.
- `pointerFine` comes from `window.matchMedia("(hover: hover) and (pointer: fine)")` behind `useSyncExternalStore`, mirroring `detectCanScan`'s media-query approach in `src/components/add-wine/use-can-scan.ts` — never a user-agent sniff. On a phone it is false and **not one prefetch is ever issued**.
- The handlers are wired as `onMouseEnter` / `onFocus` / `onMouseLeave` / `onBlur`.

**The targets** (there is no breadcrumb or child-pill row in the current explorer — verified: `context.children` is read only by the camera `useMemo` at 377-400, `context.ancestors` only for `selectedParentId` at 567):

1. `WineMapTree`'s place buttons (`wine-map-tree.tsx:243-250`) — the main way people walk the hierarchy. `WineMapTree` gains one optional prop, `onPrefetch?: { onEnter(key): void; onLeave(): void }`; absent, it behaves exactly as today.
2. `KnowledgeSections`' "Nearby" chips (`knowledge-sections.tsx:433-447`) and "Labelling" dual-label buttons (398-432) — the two other one-click jumps. Same optional prop.

The map canvas is **not** a prefetch target: `tile-wine-map.tsx` belongs to the sibling workflow, and a hover-prefetch over a dense polygon layer would fire far more than two.

---

## 5. Tests — written first

All pure, `environment: "node"`, matching `vitest.config.mts`.

**`src/lib/wine-map/lru.test.ts`**
1. under capacity: every key still reads back;
2. one past capacity evicts the **least recently used**, not the oldest inserted — `set a,b,c`, `get(a)`, `set(d)` on capacity 3 ⇒ `b` is gone, `a` survives;
3. `peek` does **not** promote (same sequence with `peek(a)` ⇒ `a` is gone);
4. `set` on an existing key updates in place and promotes, and does not grow `size`;
5. `delete` and `clear` empty as expected; `get` on a missing key is `undefined`, distinct from a stored `undefined`… (so the map stores a wrapper, or `null`/`undefined` values are simply never stored — the test pins whichever).

**`src/lib/wine-map/place-cache.test.ts`** (a fake loader counting calls; no supabase)
1. two sequential loads of one key ⇒ **one** call, and the second resolves to the **same reference**;
2. two *concurrent* loads of one key ⇒ one call (in-flight sharing);
3. a rejected load is not cached: the next load calls again, and the rejection still propagates to the first caller;
4. a `null` context is not cached: the next load calls again;
5. an **empty** archetype array **is** cached: the next load makes no call;
6. 51 distinct keys ⇒ the first is evicted and re-loading it calls again;
7. `peek` on a key whose promise is still pending is `undefined`; after it resolves, `peek` returns the value;
8. `clearWinePlaceCaches()` makes every subsequent load call again;
9. `winePlacePrefetchesInFlight()` rises on `prefetchWinePlace` and falls when it settles, including when it rejects.

**`src/lib/wine-map/prefetch-rule.test.ts`**
1. `PREFETCH_DWELL_MS === 120`, `MAX_PREFETCH_IN_FLIGHT === 2` (pinned, so a future edit is deliberate);
2. false for `key: null`;
3. false when `pointerFine` is false, **even if everything else is ideal** (the touch guarantee);
4. false when `key === selectedKey`;
5. false when `cached`;
6. false at `inFlight === 2`, true at `1`;
7. true for the ordinary case.

**`src/lib/wset/archetype-rows.test.ts`**
1. embed as an **object** → mapped;
2. embed as a **one-element array** → mapped identically;
3. embed `null`/missing → that row is dropped, the rest survive;
4. order is the input order, including a descending `sort_order`, i.e. the mapper never sorts;
5. `colour` and `style` pass through verbatim; `id` and `name` come from the embed, never from the placement;
6. `null`, `undefined` and a non-array `data` → `[]`, never a throw;
7. a regression case built from the live Bourgogne rows (Chablis 10, Côte de Nuits 20, Côte de Beaune 30, Côte Chalonnaise 40, Mâconnais 50) asserting the exact five names in order.

**`src/lib/wine-map/place-style-rows.test.ts`**
1. `colour` absent / `null` → `null`; present → verbatim;
2. `note` likewise;
3. order preserved; no sort;
4. non-array input → `[]`.

Existing suites that must stay green untouched: `deep-link.test.ts`, `fill-palette.test.ts`, `map-palette.test.ts`, `map-chrome.test.ts`.

---

## 6. Rule 1 and privacy

Nothing on this path touches `wines`, `wine_answers`, `guesses`, `cellar_lots` or `catalog_wines`. The wine map is the reference catalogue; no glass, flight or bottle is involved. Rule 1 is unaffected.

### 6.1 Why a shared, un-keyed client cache is safe here

Every policy behind the cached data is content-level, not identity-level — live `pg_policies`, quoted in full in §4.2: `wine_places` = `publication_status = 'VERIFIED'`; `wine_place_styles` = `PUBLISHED` **and** the place `VERIFIED`; `wine_archetypes` and `wine_archetype_placements` = `true`. **Not one of them references `auth.uid()`.** `get_wine_place_context` is `language sql stable` and **`prosecdef = false`** (verified against `pg_proc`), i.e. SECURITY INVOKER, so it reads those same tables under those same policies. Two different signed-in users therefore receive byte-identical payloads for a given key, and there is no per-user content to leak between them.

It is also authenticated-only — proven, not assumed: as `anon` the RPC answers `401 / 42501 permission denied for function get_wine_place_context`, and `src/app/knowledge/map/page.tsx:29-31` redirects a signed-out visitor to `/login` before the explorer mounts.

Two guards regardless:

- **D6.** The explorer subscribes to `supabase.auth.onAuthStateChange` and calls `clearWinePlaceCaches()` whenever the user id changes or the session ends. It costs ~8 lines and it means a future policy that *does* key on `auth.uid()` cannot turn this cache into a leak without someone also having to delete that guard.
- The module is browser-only and per page load; it is never imported by a server component and never reaches `cache()`/`fetch` on the server.

---

## 7. Expected timings

Against the 614 ms baseline of §1. The DB side of every number is measured (§1.1); the network side is the main session's own trace.

**First visit to a place** (nothing cached, nothing prefetched):

| | today | after |
| --- | --- | --- |
| requests fired | 4, three of them chained | **3, all starting together at ~107 ms** |
| archetypes done | 364 ms (2 requests; 3 for a place that has any) | **~215 ms** |
| styles done | 574 ms | **~170 ms** |
| context done | 485 ms | 485 ms (unchanged — it is the critical path) |
| **panel settles** | **614 ms** | **≈ 500–520 ms** |

≈ **100–130 ms** saved, and the 512 ms styles tail disappears entirely. For a place that *has* archetypes (Bourgogne, Chablis, Champagne, Pauillac's neighbours) the chain is three requests today, so the saving is larger there; on a slow or high-latency link it scales with RTT rather than being a fixed 100 ms.

**Second visit to the same place** — the case the owner actually feels, clicking around and back up the tree:

| | today | after |
| --- | --- | --- |
| requests | 4 | **0** |
| panel settles | **614 ms** | **< 30 ms — one render, no "Loading…" frame** |

**After a ~120 ms hover on a tree row, then a click:** the same as a second visit if the prefetch finished (it needs ~500 ms in flight, which a row being read usually gets); if it is still in flight the click shares the in-flight promise and pays only the remainder — never a second request.

**Still slow after this, and expected to be:** the *first* click on **France, Spain or Italy**. Those cost 194–270 ms inside the RPC on their own (§1.1), so a first visit will land near ~600 ms however few round trips we make. The cache makes the second click on them instant; making the *first* one fast needs the `nearby_list` follow-up in §9.

---

## 8. What the main session should re-measure

In production, with the network panel open, signed in:

1. **Baseline repeat.** Click **Savoie** on a fresh page load. Confirm 4 requests and ~614 ms, so the comparison is like for like.
2. **First visit, after.** Same click. Expect **3 requests, all starting within ~10 ms of each other**, no request whose start time is after another's end, and settle ≈ 500–520 ms. Check specifically that `wine_place_styles` no longer starts at ~512 ms.
3. **Revisit.** Click **Bourgogne**, then **Savoie**, then **Bourgogne** again. The third click must issue **zero** requests and must not show "Loading…" for a frame. This is the headline result.
4. **The embed shape** — the one thing §4.2 could not prove without an authenticated session. Select **Bourgogne** and confirm the "Typical wine" list reads, top to bottom: *A typical Chablis, A typical Côte de Nuits, A typical Côte de Beaune, A typical Côte Chalonnaise, A typical Mâconnais*, with the glass icons red/white as before. Five entries in that exact order means the to-one embed came back in the shape `archetypeRows` maps and the order survived the join. **Also select Savoie** and confirm the "Typical wine" block is absent (0 placements), not an empty heading.
5. **Colour still renders.** Select **Bourgogne** and confirm the styles row still reads *"White sparkling"* for Crémant (that is one of the 100 rows carrying a `colour`), not bare "Sparkling" — this proves the moved query kept the column.
6. **Prefetch, desktop.** Hover a tree row for a second without clicking: exactly **three** requests appear for that key and nothing renders. Then click it: **no further request**, instant panel. Move the mouse across several rows quickly: never more than **two** places in flight.
7. **Prefetch, phone.** In the phone emulation (or a real phone), scroll and tap through the tree: **no prefetch requests at all**, and every tap behaves as before.
8. **The slow places.** Click **France**, then **Spain**, then **Italy**, then back to **France**. The first click on each is still ~600 ms (expected, §7); the return to France must be instant. If the *first* click is what still reads as lag to the owner, that is §9, not this change.
9. **No content drift.** On Savoie, Bourgogne, Pauillac and one Burgundy climat, compare the panel against the current production build section by section — same sections, same order, same text, same empty states.

---

## 9. Follow-up, explicitly out of scope here

`get_wine_place_context`'s `nearby_list` CTE is the only part whose cost tracks the selected place's outline complexity, and country-level places pay 194–270 ms for it (§1.1). Fixing it needs a migration — a `ST_DWithin` that can use the GIST index on `wine_place_boundaries.display_geometry` (the isolated form plans as a join filter over all 3,257 boundaries), or a simplified geometry column to measure against, or `nearby` moved out of the RPC into its own lazily-fetched request. **The task forbids applying a migration, so nothing here does.** It should be its own note, with a same-transaction-asserted migration, per CLAUDE.md's shared-migration-version rule.

Second, smaller: `fetchWinePlaceTree` pulls the whole 3,309-place hierarchy once per page load. It is off the click path (it resolves during the map's own boot) and is untouched here, but it is the next thing to look at if page *entry* rather than *selection* reads as slow.

---

## 10. Rollback

Four independent commits, each revertible alone:

| commit | files | reverting it |
| --- | --- | --- |
| 1. cache | `lru.ts`, `place-cache.ts` + tests, and the three call sites in `tile-wine-map-explorer.tsx` | drops back to a direct `fetchWinePlaceContext` / `fetchArchetypesForPlace` / `fetchPlaceStyles` call; the panel behaves as today, just slower |
| 2. archetypes | `src/lib/wset/queries.ts`, `src/lib/wset/archetype-rows.ts` + test | the function's signature and return type are unchanged, so reverting the body alone restores the three-request chain with no caller edit |
| 3. styles | `src/lib/wine-map/place-styles.ts`, `place-style-rows.ts` + test, `knowledge-sections.tsx`, `tile-wine-map-explorer.tsx` | the only one that moves state between components; revert restores the `useEffect` inside `KnowledgeSections` verbatim |
| 4. prefetch | `prefetch-rule.ts`, `use-place-prefetch.ts` + test, the optional props on `wine-map-tree.tsx` and `knowledge-sections.tsx` | the props are optional and additive; dropping them leaves both components exactly as they are today |

Nothing in any of the four is a migration, an RLS change, a grant, or a change to a select's column list, so there is no database state to roll back and no deploy ordering to respect.

---

## 11. Verification run on this note's base

`a6cfb22`, worktree clean, before any change: `npx tsc --noEmit` clean; `npm run lint -- --max-warnings=0` clean; `npm test` **142 files, 3,212 tests passed**; `npm run build` exit 0. The same four must pass after each of the four commits.

---

## 12. Independent verification pass (2026-09-20, second session)

Everything below was measured against the live database read-only — every
statement inside `begin; set transaction read only; … rollback`, as the
`authenticated` role (`set local request.jwt.claims` + `set local role
authenticated`). Nothing was written and no migration was applied.

### 12.1 The embedded filter is proven, not assumed

Two independent proofs, because neither alone is enough:

**The wire format** — `src/lib/wine-map/place-query-wire.test.ts` (new) builds
both queries with the REAL `@supabase/supabase-js` 2.110.2 in `package.json`
and reads the URL its builder produced. It pins that
`.eq("wine_places.canonical_key", …)` serialises as the *embedded* filter
`wine_places.canonical_key=eq.…`, and that `.order("sort_order")` stays a
TOP-LEVEL `order=sort_order.asc` rather than `wine_places.order=`. Nothing is
awaited, so no request is made. A supabase-js upgrade that changed either would
leave every stub test passing and quietly break the panel; this one fails.

**The rows** — the old three-hop chain and the new single join were run
side by side, as the `authenticated` role, over:

| comparison | places | mismatches |
| --- | --- | --- |
| archetypes: chain vs join, exact list AND order | all **18** places that carry placements, plus a place with none and a key that does not exist | **0** |
| styles: `.eq(wine_place_id)` vs the `canonical_key` join, exact list and order | all **1 584** places that carry styles | **0** |

Supporting facts, all checked live: `wine_archetype_placements` has FKs to both
`wine_archetypes` and `wine_places` (so the embeds resolve unambiguously);
`(wine_place_id, sort_order)` is unique in both `wine_archetype_placements` and
`wine_place_styles`, so `.order("sort_order")` fully determines the order and
`archetypeRows`/`placeStyleRows` are right never to re-sort; the SELECT policies
are `wine places verified read` (`publication_status = 'VERIFIED'`) and
`wine place styles published read` (`PUBLISHED` **and** a VERIFIED parent), which
is exactly what `wine_places!inner` reproduces — the same gate the old first hop
applied. All four policies are `{authenticated}` only.

`wine_place_styles.colour` is non-null on **100 of 2 444** rows, so the separate
styles request genuinely earns its keep: `get_wine_place_context`'s `style_list`
is `{style, note}` and cannot express "White sparkling".

### 12.2 Server-side cost of each query (median of 7, database time only)

| | before | after |
| --- | --- | --- |
| archetypes, Bourgogne | 54.9 ms (3 statements) | **18.7 ms** (1) |
| archetypes, Savoie (empty) | 36.6 ms (2) | **18.7 ms** (1) |
| styles, Savoie | 36.7 ms (2) | **17.2 ms** (1) |

Network is on top of each of those and dominates: the production trace shows
~340 ms of round trip against ~20–40 ms of database time, which is why removing
a *request* is worth far more than shaving a query.

### 12.3 `nearby_list` is the whole story for the slow places

§9 named it; this pass measured it. The `nearby` block was lifted verbatim out
of the live function and timed on its own against the whole RPC:

| place | whole RPC | `nearby` alone | own outline (points) |
| --- | --- | --- | --- |
| `spain.extremadura` | 283 ms | **278 ms** | 719 |
| `spain` | 269 ms | **263 ms** | 9 571 |
| `france` | 253 ms | **248 ms** | 6 961 |
| `spain.andalucia` | 231 ms | **244 ms** | 1 079 |
| `italy` | 194 ms | **188 ms** | 7 531 |
| `france.savoie` | 37 ms | **31 ms** | 820 |
| `france.bourgogne.cote-de-nuits` | 32 ms | **27 ms** | 209 |

`nearby` is 75–98 % of the RPC for **every** place, fast or slow. Everything
else in the function — ancestors, children, article, grapes, styles,
designations, dual labels, classified members — costs about 5 ms together.

**A candidate fix was tested and must be REJECTED.** Simplifying each
neighbour candidate once (at the tolerance the target already uses) before the
`ST_DWithin`/`ST_Distance`, rather than only when the target is a country, was
run against the live function's own query over 132 places:

- it helps the big ones a lot — France 249 → 95 ms, Spain 264 → 86 ms,
  Extremadura 279 → 121 ms;
- it **hurts** deep German sites, where simplifying many small candidates costs
  more than measuring them — Nierstein-Oelberg 108 → 142 ms,
  Neustadt-Schlössel 98 → 155 ms; mean over the sample 56 → 62 ms;
- and, fatally, it **changes the answer**: the same five neighbours came back
  for only **113 of 132** places, and the same *order* for only **96 of 132**.
  A different neighbour list is a content change, which this work forbids.

So the right fix is not a cheaper distance — it is not computing one per
request. A precomputed neighbours table, filled once per boundary release and
read by key, keeps today's exact answers and takes `nearby` to a lookup. That
is a migration plus a backfill, so it belongs in its own note with
same-transaction assertions, per CLAUDE.md's shared-migration-version rule.

### 12.4 A fifth change, on the mount path: `grape-filter.ts` + the mount cache

§9's second follow-up turned out to be worth doing here, because it is pure
latency with no behaviour change at all.

`fetchPlaceGrapeLinks` walked `wine_place_grapes` (**2 964** rows, measured
live) one 1 000-row page at a time, **each page waiting for the one before it** —
three requests in series on *every* map load, for a grape filter most visits
never touch. At ~340 ms of round trip each, that is ~0.7 s of the map's mount
spent waiting, competing with the tile fetches.

Rows are a contiguous range, so nothing can follow a short page. `page-plan.ts`
(new, pure, 16 tests) therefore asks for **four pages at once** and stops at the
first short one: the whole table arrives in **one** round trip today, with room
to grow to 4 000 rows before a second round is needed, at a cost of at most one
request that comes back empty. Three serial round trips became one.

The three answers the map asks for once on mount — `get_wine_place_tree()`
(**811 KB**, 128 ms of database time), the grape list, the grape links — now go
through the same module-level cache as a place selection
(`loadWinePlaceTree` / `loadGrapeOptions` / `loadPlaceGrapeLinks` in
`place-cache.ts`). They are the same answer for every viewer and change only by
migration, so the page load is the right refresh boundary, exactly as in §6.1.
A second mount of the explorer in one page view makes no request, two mounts
racing share one request, and a rejection is still never cached.
`clearWinePlaceCaches()` empties these too.

### 12.5 Gate

`npx tsc --noEmit` exit 0 · `npm run lint -- --max-warnings=0` exit 0 ·
`npm test` exit 0, **154 files, 3 307 tests** · `npm run build` exit 0.

### 12.6 Two more things for the main session to measure

Additions to §8:

10. **Map entry.** Load `/knowledge/map` and watch `wine_place_grapes` in the
    network panel: **four requests starting together**, not three one after
    another, and the last of them empty. Then navigate away to another page and
    back to the map: the tree, the grape list and the grape links should issue
    **no requests at all** the second time, and the hierarchy sidebar should
    appear immediately rather than after a beat.
11. **The grape filter still filters.** Pick a grape in the filter bar and
    confirm the badge and the map narrow exactly as before — the paging change
    must not lose a page of links. Chardonnay and Pinot Noir are good probes.

### 12.7 Two more round trips removed on the click path

**The selection starts from the click, not from the effect.**
`warmWinePlace(supabase, key)` (`place-cache.ts`) is called inside `select()`,
so the three requests leave in the click handler rather than waiting for React
to flush the passive effects that ask for them — effects that run only after
this commit has repainted the map as well as the panel. On the production trace
the panel first changed at 60 ms while the first request left at 107 ms; that
~45 ms gap is what this closes. It is not a second code path: each cache hands
back the in-flight promise, so the effects a moment later JOIN the request the
click started (pinned by "the effects that follow JOIN those requests instead of
doubling them"). It deliberately does not consume a prefetch slot — that counter
bounds speculative hover work and must never ration a real selection.

**`fetchArchetype` opens the typical-wine sheet in two rounds, not three.**
The sheet behind "A typical Chablis" cost three serial rounds: the archetype
row, then the place/grapes/aroma-links trio, then the aroma terms. But the aroma
links are keyed by the id the FUNCTION WAS CALLED WITH, not by anything on the
row — they never needed to wait. Starting them first lets the terms, which do
depend on them, resolve in round two. No query text changes and no column
changes; only the order of `await`. It moved to `src/lib/wset/archetype-detail.ts`
(type-only `@/` imports) so vitest can load it, and `queries.ts` re-exports it —
the same split `archetype-query.ts` already uses. Five tests pin the wait shape,
the unchanged view, the no-aromas case and the unknown-id case.

Verification for §8: open a **typical wine** from Bourgogne's list and confirm
`wine_archetype_aromas` starts **alongside** `wine_archetypes`, not after it,
and that the sheet's aromas, flavours, place name and grape line read exactly as
they do in production today.
