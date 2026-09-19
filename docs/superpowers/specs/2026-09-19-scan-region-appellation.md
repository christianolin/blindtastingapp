# Scan: region and appellation for common wines — design

Date 2026-09-19. Base `master` at `8f800ce` (worktree `blindtastingapp-scanfix`, branch `scanfix`). It amends the resolver rules of `2026-09-12-add-wine-v2-scan-and-flow-fixes-design.md` §B.5 and supersedes owner approval 3, but only for unprinted regions (§4).

One migration, `20260919214700_label_lookups.sql`: one owner-only table and no function changes. Its core DDL and the behavioural block in §7 passed a dry run on 2026-09-19 (`DRY-OK`, rolled back). It must be applied **before** the app deploy (§7.4).

Amended the same day after review (§14): an unprinted guess that the producer's link confirms is marked `producer-region` (§4.4), and step 7.6 never overrides appellation text the read carried unless that text names the siblings' appellation (§5.4).

No test or agent calls the Anthropic API. Reads use `LABEL_READ_FIXTURE` and follow-ups use the new `LABEL_LOOKUP_FIXTURE` or injected fakes. Live follow-up calls are for the main session only, with owner approval (§6.8).

## 1. Goal

What the owner said on 2026-09-19:

> "the Tridente wine that was just added to the catalog earlier wasnt scanned correctly - or it was correct but the scanner didnt find region and appellation. Can you look into that? Its really important that we get region and appellation in common wines like this one. Only the most obscure its okay. 9999/10000 bottles should scan perfectly."

The owner approved exactly three fixes:

- **(A) Trust our producer data.** Sometimes the read names a region the label does not print. When the producer the read resolved to links to another region of the same country, the link wins. A region the label does print still wins over the link. Nothing is blanked any more.
- **(B) Reuse other vintages.** Take the appellation when the catalog already holds this wine in other vintages and they all name the same appellation. Never take it from the producer alone.
- **(C) Second lookup if missing.** When the appellation is still missing, make one cheap text-only Claude call. It picks one name from our own list of that region's appellations.

The "scan the back label" button was not approved and is not part of this work.

These stay as they are:

- nothing is added automatically;
- the confirm screen and By hand still show every field, and the user can change any of them;
- `src/lib/wine-identity/complete.ts` is still the one definition of a complete wine.

## 2. Facts (read-only, live, 2026-09-19)

**The three Tridente reads.** Every read's `rawText` is a brand and a grape. The model's region is a guess from memory, and it is wrong.

| `label_reads.id` | Date | `rawText` | `region` read | `appellation` read | Vintage |
|---|---|---|---|---|---|
| `b0c61af8-724b-47a5-a7da-67a1bfff9946` | 09-12 | `TRIDENTE TEMPRANILLO` | Castilla-La Mancha | null | NV, not read |
| `06c355b5-2e23-43e1-8b81-c3a918000ff6` | 09-13 | `TRIDENTE / TEMPRANILLO` | Castilla-La Mancha | null | NV, not read |
| `a9e27e42-2557-486d-843f-e7c57e2e5484` | 09-19 | `TRIDENTE 2020 TEMPRANILLO` | Castilla-La Mancha | null | 2020, read |

In all three reads:

- producer `Tridente`, wine name `Tridente`;
- country Spain, RED, STILL, Tempranillo 100;
- `noGeographicIndication` false, confidence `medium`.

**How the resolver handles them today:**

1. The country is Spain.
2. The region candidate is Castilla La Mancha, through `REGION_SYNONYMS`.
3. There is no appellation text, so step 5 takes Castilla La Mancha as the region.
4. The producer lookup misses on the name "Tridente" and finds Bodegas Tridente through the alias "Tridente" (`20260914113500`). The producer row is `7f46bd24-f237-48e2-a151-ea52e66c2d09`, and it links to **Castilla y Leon** (region `eecc95bf-0f6f-48cf-a50a-66119f5e771e`).
5. Step 7 sees another region of the same country and blanks the region (owner approval 3).
6. Step 7.5 needs `provenance.region === "label"`, so it does not fire.

The region and the appellation both had to be typed by hand.

**The catalog already knew the answer.** Bodegas Tridente has two catalog rows, neither merged nor `blind_pending`:

| id | vintage | wine name | colour / style | primary grape | appellation |
|---|---|---|---|---|---|
| `c4e1429e-06e2-45e6-a790-62a54b4cb426` | 2018 | Tridente | RED / STILL | Tempranillo `673f5db6-fb6c-4888-adb5-a8ad0ec4dbe1` | Castilla y Leon `5dd53734-87be-4998-8c19-46853f509fbb` (the region's self-named row, i.e. VdlT de Castilla y León) |
| `32809359-da38-4021-8a95-8e597a5b4c57` | 2020 | Tridente | RED / STILL | Tempranillo | the same (corrected by hand today) |

**The other ok reads with no appellation text.** There are 36 `ok` reads in total; 10 have no appellation text, and Tridente is the only pattern that fails:

- Three are correctly no-GI: El Enemigo round 1, L'Envolée (Vin de France), and Félix Solís "Mucho Más", which is a Vino de España.
- Changyu round 1 and the three L.A. Cetto reads are filled by step 7.5.
- The three Tridente reads fail.

**Appellations per region** (427 regions):

- p50 1, p90 15, p99 62.
- Bourgogne 1,364, Piemonte 254, California 138. Every other region has 70 or fewer.
- Spain: Castilla La Mancha 25, Castilla y Leon 17.
- Average name length 16 characters; the longest is 46.

**Catalog shape:**

- 119 live wines under 95 producers, at most 9 per producer. 41 wines have no wine name.
- Grouping by (producer, folded wine name, colour, primary grape) gives 73 groups. 5 hold more than one row, and none of the 5 disagrees on appellation.
- `catalog_wines_identity_key` leads with `producer_id` (partial `where merged_into is null`), so a producer-scoped read needs no new index.
- `"catalog read"` is `(NOT blind_pending) OR created_by = auth.uid() OR can_read_blind_pending_catalog_wine(id)`.
- 32,116 of 33,771 producers (95 %) have a region link.

**Who reads `label_reads` today:**

- `scrub_deleted_account`, which runs `delete from label_reads where user_id = p_user_id`.
- `attach_catalog_wine_photo` step 10. It picks the row by `(user_id, image_path)`, ordered by `outcome = 'ok'`. Its body md5 is pinned in `20260919183100`.
- The scan quota (`quota.ts`, which counts every row from the last 24 h).
- The replay fixtures: each `live/*.json` is exactly one stored `LabelRead`.

**Cost and SDK:**

- Claude Sonnet 5 costs $2 per million input tokens and $10 per million output tokens (claude-api skill, cached 2026-06-24).
- The average `ok` read is 7,003 input and 439 output tokens; downscaled camera reads are about 4.6k input.
- `@anthropic-ai/sdk` is 0.125.0. `messages.parse(params, options)` takes `RequestOptions { timeout, maxRetries, signal }`. `Anthropic.APIConnectionTimeoutError` and `Anthropic.APIUserAbortError` are static exports.

**Migration version `20260919214700` is free:**

- The newest live version is `20260919183100`.
- Every local branch and remote-tracking ref (`origin/master` = `8f800ce`, not re-fetched: this work makes no git writes) and every `blindtastingapp-*` worktree ends at `20260919183100` or earlier.

## 3. Decisions

| # | Decision |
|---|---|
| D1 | Fix A supersedes owner approval 3 in resolver step 7, for unprinted regions only. A region counts as **printed** when the label's `rawText` contains it as whole words: the read's own region text, the stored region name, or a curated `REGION_SYNONYMS` spelling of that stored name. The check uses the step 7.5 helpers `wordBoundaryFold`/`containsWholeWords`. An unprinted region that the existing producer's link agrees with keeps its value and is marked `producer-region`, like one the link replaced (§4.4). |
| D2 | Fix B is a new resolver step 7.6 with one new `RefLookup` method, `catalogWinesOfProducer`. It reads the same set `findConfidentMatch` reads: the caller's RLS, never merged away, never `blind_pending`, at most 200 rows. A failed or capped read fills nothing. Appellation text the read carried but step 4 could not place blocks it, unless that text names the siblings' appellation as whole words (`appellationTextNames`, §5.4). |
| D3 | Fix C runs in `readLabelPhoto` after the resolver: one billed, text-only `claude-sonnet-5` call through `messages.parse` with zod output, at `effort: "low"`. `max_tokens` is 1,024, the timeout 8 s, with no retries, no tools and no web search. The answer must fold-equal exactly one entry of our list, or it is discarded. |
| D4 | Fix C runs only inside a region we trust: one the label prints, or one from the producer's link (including an unprinted guess that link agrees with, which step 7 marks `producer-region`). It never runs inside a region nothing but the model named; see §6.2 and owner decision O1. |
| D5 | Follow-up billing records go in a **separate owner-only table**, `label_lookups`, with one row per `label_reads` row and `ON DELETE CASCADE`. No deployed function changes (§7). |
| D6 | Two new `FieldProvenance` values: `"catalog-sibling"` (B) and `"lookup"` (C). By hand shows a quiet chip for each. The confirm screen adds one muted line when the appellation has either source, and a looked-up appellation turns the READ OK chip into CHECK THE READ (§8). |
| D7 | The step 7.5 gate is unchanged. It still needs `provenance.region === "label"` and the **stored** region name in `rawText`. |

## 4. Fix A — resolver step 7 (`src/lib/wine-identity/resolve.ts`)

### 4.1 `region-canonical.ts`: one new export

```ts
/** Every curated spelling (a REGION_SYNONYMS key of `country`) that maps to the
    stored region name `storedRegion`, e.g. ("Bourgogne", "France") → ["burgundy"],
    ("Castilla La Mancha", "Spain") → ["castile-la mancha", "castilla-la mancha"].
    Own keys only; [] for an unknown country or region. */
export function regionSynonymsOf(storedRegion: string, country: string): string[]
```

### 4.2 `resolve.ts`: one new exported pure helper

```ts
/** Owner fix A (2026-09-19): whether the label's own rawText names the region —
    the read's region text, the stored region name, or a curated synonym of it —
    as a run of whole words. "Bourgogne" printed counts for a read of "Burgundy",
    and "BURGUNDY" printed counts for the stored "Bourgogne". */
export function regionNamedOnLabel(
  rawText: string, readRegion: string | null, storedRegion: string, countryName: string,
): boolean {
  const haystack = wordBoundaryFold(rawText);
  return [readRegion ?? "", storedRegion, ...regionSynonymsOf(storedRegion, countryName)]
    .some((spelling) => containsWholeWords(haystack, foldWords(spelling)));
}
```

### 4.3 Step 5 records the flag

This is the only place a region comes from the read's region field.

```ts
let regionOnLabel = false;                       // declared before step 2
...
if (draft.regionId === null && regionCandidate !== null) {
  draft.regionId = regionCandidate.id;
  provenance.region = "label";
  // regionCandidate implies a resolved country (step 3).
  regionOnLabel = regionNamedOnLabel(read.rawText, read.region, regionCandidate.name, country!.name);
}
```

### 4.4 Step 7 replaces owner approval 3's blanking

```ts
const regionReadAlone = !read.noGeographicIndication && read.appellation === null && draft.regionId !== null;
const guessedRegion = regionReadAlone && !regionOnLabel;
// Review fix (§14): the link agrees with the unprinted region. The value stays,
// but our data now vouches for it, so it is marked like a region the link replaced.
if (hit !== null && guessedRegion && hit.regionId !== null && hit.regionId === draft.regionId) {
  provenance.region = "producer-region";
}
const linked =
  hit !== null && hit.regionId !== null && hit.regionId !== draft.regionId &&
  (draft.regionId === null || guessedRegion)
    ? await lookup.regionById(hit.regionId)
    : null;
if (linked !== null && draft.regionId !== null) {
  // Owner fix A (2026-09-19), superseding owner approval 3 for guessed regions: a
  // region the read named but the label does not print is the model's memory, and
  // the producer's region link, in the same country, is our data. It wins.
  // A printed region never reaches here: the label wins over the link.
  if (draft.countryId === linked.countryId) {
    draft.regionId = linked.id;
    provenance.region = "producer-region";
  }
} else if (linked !== null && (draft.countryId === null || draft.countryId === linked.countryId)) {
  // unchanged: an empty region takes the link
}
```

Every other path is unchanged:

- A read with appellation text keeps its region, whether that region came from the resolved appellation or from the read when no row agreed.
- A no-GI read keeps its tier pair.
- A link to another country never moves the region.
- An empty region still takes the link.

The two approval 3 cases, and the agreeing-link case the review added, now behave like this:

| Case | Before | After |
|---|---|---|
| Unprinted region, conflicting link | region blanked, listed missing | the link's region, `producer-region` |
| Printed region, conflicting link | region blanked | the label's region stays (`label`), so step 7.5 may then take its self-named row |
| Unprinted region, link that agrees | the region, `label` | the same region, `producer-region` |

Why the third row: fix C's gate (§6.2 rule 4) trusts a `producer-region` region but never an unprinted `label` one. Left `label`, a guess that our own producer data confirms would count for less than a guess it contradicts. With the Tridente read, a wrong "Castilla-La Mancha" would get the lookup while a correct "Castilla y Leon" would not, and would go to Fix. Step 7.5 loses nothing here: if the region is unprinted, the stored region name is not in rawText either, so step 7.5 could not have fired. Step 7.6 does not change either: an unprinted `label` region already gives way to the siblings' region. In By hand, the region shows the producer-link note, and switching producer re-derives it from the new producer's link (`applyProducerRegion`). That is the same as for any `producer-region` value.

### 4.5 Step 7.5 stays as it is (D7)

Step 7.5 still requires `provenance.region === "label"` and still checks only the **stored** region name in `rawText`. A region filled from the producer link, or later from siblings, never reaches it.

## 5. Fix B — step 7.6, "reuse other vintages"

### 5.1 New order inside `resolveLabelRead`

```
1 → 2/3/4/5 → 6 → 7 (fix A) → 7.5 → 9 (moved up) → 7.6 (fix B) → 8 → 10 → 11 → 12
```

- Step 9 (grapes) runs earlier. Its only inputs are the read and `lookup.grapes()`, so its output and provenance do not change.
- Step 7.6 needs the resolved primary grape, which is why it runs after step 9.
- Step 8 (designation) now runs after 7.6, so a country that 7.6 filled reaches the designation lookup.

### 5.2 `RefLookup` gains one method

```ts
export const CATALOG_SIBLING_LIMIT = 200;
export type CatalogSiblingRow = {
  id: string; wineName: string | null; colour: WineColour; style: WineStyle;
  primaryGrapeId: string; appellationId: string;
};
/** Step 7.6 (owner fix B, 2026-09-19): one existing producer's catalog wines as the
    caller may read them — never merged away, never blind_pending — the candidate
    set findConfidentMatch reads (server/match.ts). At most CATALOG_SIBLING_LIMIT
    rows. `complete` is false when there were more, or when the read failed: this
    method never throws, and step 7.6 then fills nothing. */
catalogWinesOfProducer(producerId: string): Promise<{ rows: CatalogSiblingRow[]; complete: boolean }>;
```

### 5.3 Server adapter (`server/lookup.ts`, memoised like the rest)

```ts
catalogWinesOfProducer: (producerId) =>
  memo(`catalogWinesOfProducer:${producerId}`, async () => {
    const { data, error } = await supabase
      .from("catalog_wines")
      .select("id, wine_name, colour, style, primary_grape_id, appellation_id")
      .eq("producer_id", producerId)
      .eq("blind_pending", false)
      .is("merged_into", null)
      .order("id")
      .limit(CATALOG_SIBLING_LIMIT + 1);
    if (error) {
      console.error("catalog siblings not read", { code: error.code, message: error.message });
      return { rows: [], complete: false };
    }
    const rows = (data ?? []).map((row) => ({
      id: row.id, wineName: row.wine_name, colour: row.colour, style: row.style,
      primaryGrapeId: row.primary_grape_id, appellationId: row.appellation_id,
    }));
    return { rows: rows.slice(0, CATALOG_SIBLING_LIMIT), complete: rows.length <= CATALOG_SIBLING_LIMIT };
  }),
```

The same read as SQL, run under the caller's JWT so RLS `"catalog read"` also applies:

```sql
select id, wine_name, colour, style, primary_grape_id, appellation_id
from public.catalog_wines
where producer_id = $1 and blind_pending = false and merged_into is null
order by id
limit 201;
```

`catalog_wines_identity_key (producer_id, …) where merged_into is null` serves the filter.

This is **stricter than RLS on purpose** (owner decision O3). The explicit `blind_pending = false` drops even a hidden-glass row the caller could read, such as their own. That keeps step 7.6's candidates identical to the confident-match candidates, and no hidden-glass identity can ever flow into a draft.

### 5.4 The step

It runs only when all of these hold:

- the read is not no-GI;
- `draft.appellationId === null`;
- `draft.producer?.kind === "existing"`.

When the read carried appellation text that step 4 could not place (`read.appellation !== null`), the siblings' appellation is taken only if that text itself names it (review fix, §14). The check is `appellationTextNames(read.appellation, sibling.name)`: the stored name, minus one designation suffix and with its cru spelling normalised, must appear as a run of whole words in `normaliseCru(read.appellation)`.

- "D.O. Toro" names "Toro DO".
- "Vino de la Tierra de Castilla y León" names "Castilla y Leon".
- "Toro DO" does not name "Castilla y Leon".
- "Vino de la Tierra de Castilla" does not name "Castilla y Leon".

Otherwise the read keeps the attempt that found nothing. RC4 applies here as it does at step 7.5: a failed resolution is never replaced by a guess. The appellation goes on to fix C, whose facts carry the label text, or to Fix. Without this check, a label printing "Toro DO", which is missing from our table, would take the siblings' "Castilla y Leon" and, with an unprinted region, their region too. That is a complete-looking wrong wine, and the confirm screen would still show READ OK.

```ts
export function appellationTextNames(text: string, appellationName: string): boolean {
  return containsWholeWords(` ${normaliseCru(text)} `, stripDesignationSuffix(normaliseCru(appellationName)));
}
```

```ts
async function siblingAppellation(read: LabelRead, producerId: string, blend: BlendRow[], lookup: RefLookup) {
  const name = foldName(read.wineName ?? "");
  if (name === "" || read.colour === null) return null;         // a named, coloured wine only
  const { rows, complete } = await lookup.catalogWinesOfProducer(producerId);
  if (!complete) return null;                                    // a capped or failed list proves nothing
  const style = read.vintageKind === "TAWNY" ? "FORTIFIED" : read.style;
  const primary = normaliseDraft({ ...emptyDraft(), blend }).blend[0]?.grape ?? null;
  const siblings = rows.filter((row) =>
    foldName(row.wineName ?? "") === name
    && row.colour === read.colour
    && (style === null || row.style === style)
    && (primary?.kind !== "existing" || row.primaryGrapeId === primary.id));
  const ids = new Set(siblings.map((row) => row.appellationId));
  if (ids.size !== 1) return null;                               // none, or they disagree
  return (await lookup.appellationsByIds([...ids]))[0] ?? null;  // { id, name, regionId, countryId }
}

// 7.6 — owner fix B
const labelRegion = provenance.region === "label" && regionOnLabel;   // printed on the label
const sib = await siblingAppellation(read, draft.producer.id, draft.blend, lookup);
if (sib !== null
    && (read.appellation === null || appellationTextNames(read.appellation, sib.name))   // review fix (§14)
    && (draft.countryId === null || draft.countryId === sib.countryId)
    && (draft.regionId === null || draft.regionId === sib.regionId || !labelRegion)) {
  draft.appellationId = sib.id;
  provenance.appellation = "catalog-sibling";
  if (draft.regionId !== sib.regionId) { draft.regionId = sib.regionId; provenance.region = "catalog-sibling"; }
  if (draft.countryId === null) { draft.countryId = sib.countryId; provenance.country = "catalog-sibling"; }
}
```

The rules behind that code:

- **Same wine.** A sibling has the same resolved existing producer, the same non-empty folded wine name and the same colour. It also has the same style whenever the read gives one; the style check is a stricter addition (owner decision O2). When the read's primary grape resolved to an existing grape row, the sibling's primary grape must match. A pending or empty grape is not compared. Any vintage counts.
- **Unanimous or nothing.** Every sibling must name one appellation id. With no siblings, or with siblings that disagree, nothing is filled.
- **Never over the read's own appellation text.** A read with appellation text that step 4 could not place gets the siblings' appellation only when that text names it (`appellationTextNames`).
- **Never from the producer alone.** A null or empty wine name, or a pending producer, never calls the method.
- **Consistency.**
  - The sibling's country must equal the draft's country, or the draft's country must be empty.
  - A region the label prints (`label` + printed) must equal the sibling's region, or nothing is filled.
  - A region from the producer link, an unprinted guessed region, or an empty region yields to the sibling's region.
- **Provenance.** The appellation becomes `catalog-sibling`. Region and country are re-stamped only when step 7.6 changes their value. In the Tridente case the region stays `producer-region`, because the sibling's region equals the linked one.
- **Match.** `findConfidentMatch` later sees the filled appellation. A same-vintage sibling agrees with it by construction, so a real repeat bottle still gets its match card.

### 5.5 The test twin

`__fixtures__/snapshot-lookup.ts` mirrors the server read:

```ts
catalog_wines?: { id: string; producer_id: string; wine_name: string | null; colour: WineColour; style: WineStyle;
  primary_grape_id: string; appellation_id: string; blind_pending: boolean; merged_into: string | null }[];
// absent means none, so every existing synthetic snapshot and the old export still load
catalogWinesOfProducer: async (producerId) => {
  const rows = (snapshot.catalog_wines ?? [])
    .filter((w) => w.producer_id === producerId && !w.blind_pending && w.merged_into === null)
    .sort((a, b) => a.id.localeCompare(b.id));
  return { rows: rows.slice(0, 200).map(toSiblingRow), complete: rows.length <= 200 };
},
```

Add `catalog_wines` to `reference-snapshot.json`: exactly the two live Bodegas Tridente rows from §2, all nine columns, taken with a targeted read-only query. Their appellation `5dd53734…` and grape `673f5db6…` are already in the snapshot. **Do not re-export the rest of the snapshot:** that would move unrelated pins.

## 6. Fix C — the follow-up lookup

### 6.1 Modules

| File | Kind | Holds |
|---|---|---|
| `src/lib/label-scan/appellation-lookup-schema.ts` | pure (zod + relative imports) | `APPELLATION_LOOKUP_PROMPT`, `AppellationLookupSchema`, `AppellationLookupFacts`, `appellationLookupText(facts)`, `coerceLookupAnswer(raw)`, `APPELLATION_LOOKUP_LIST_CAP = 300`, `AppellationLookupOutcome`/`LookupUsage` types |
| `src/lib/label-scan/lookup-fixture.ts` | `server-only` | `labelLookupFixture()` — the `LABEL_LOOKUP_FIXTURE` dev switch |
| `src/lib/label-scan/appellation-lookup.ts` | `server-only` | `lookupAppellation(facts)`: fixture check, then the SDK call |
| `src/lib/label-scan/guards.ts` | pure | `+ lookupFixtureAllowed(env)`, `+ labelLookupRow(outcome, request, picked)`, `+ LabelLookupRow` |
| `src/lib/wine-identity/appellation-follow-up.ts` | pure (relative imports) | `appellationLookupRequest(read, draft, lookup)`, `pickListedAppellation(answer, rows)`, `applyAppellationLookup(draft, row)`, `followUpAppellation({...call, keep})` |
| `src/app/scan/actions.ts` | `"use server"` | step 8b: wires `followUpAppellation` with the real `lookupAppellation` and a non-exported `keepLookup` |

### 6.2 The gate: `appellationLookupRequest`, pure and async over `RefLookup`

It returns null, meaning no call and no cost, unless **every** one of these holds:

1. `read.isWineLabel` and `!read.noGeographicIndication`.
2. `draft.appellationId === null`: resolver steps 4, 7.5 and 7.6 all found nothing.
3. `draft.regionId !== null` and `draft.countryId !== null`.
4. **The region is ours or the label's, never a bare guess (D4).** `provenance.region` is `"producer-region"` or `"catalog-sibling"`, or it is `"label"` and `regionNamedOnLabel(read.rawText, read.region, regionName, countryName)`.
   - An unprinted region that nothing but the model named is skipped. That covers a pending producer, an unlinked producer, and a producer linked to another country.
   - An unprinted guess that the existing producer's link agrees with is **not** skipped. Step 7 marks it `producer-region` (§4.4), so a guess our data confirms asks exactly as a guess it contradicts does. The gate itself has no special case for it.
   - A lookup scoped to a guessed region can only confirm the guess. Tridente with an unknown producer would have come back "Castilla La Mancha + Castilla La Mancha": a complete-looking wrong wine, which is the case approval 3 existed to prevent.
   - The owner can relax this rule (O1).
5. `draft.producer !== null` or `foldName(read.wineName ?? "") !== ""`: there is something to look up.
6. `rows = await lookup.appellationsInRegion(draft.regionId)`, the existing paged and memoised method, satisfies `1 ≤ rows.length ≤ APPELLATION_LOOKUP_LIST_CAP` (300).

**Past the cap, no call.** Today only Bourgogne (1,364) is over it; the next largest, Piemonte, has 254.

- A truncated list could leave out the right answer while the prompt forces a pick from the list.
- Burgundy labels print their AOC by law, so a gap there is a read miss that a text lookup cannot cure.
- The full Bourgogne list would be about 9k tokens (about $0.02).

It returns:

```ts
type AppellationLookupRequest = {
  regionId: string;
  rows: { id: string; name: string }[];              // appellationsInRegion order (name, id)
  facts: AppellationLookupFacts;
};
type AppellationLookupFacts = {
  producer: string | null;        // draft.producer?.name (our row's name when existing)
  wineName: string | null;        // read.wineName
  grapes: string[];               // normalised draft.blend grape names, blend order
  colour: WineColour | null;      // read.colour
  style: WineStyle | null;        // read.style (FORTIFIED for TAWNY)
  country: string;                // resolved country name
  region: string;                 // resolved region name
  labelText: string;              // read.rawText (≤ 2,000 chars after coerceLabelRead)
  appellations: string[];         // rows' names
};
```

### 6.3 Prompt and schema (`appellation-lookup-schema.ts`)

One user text block with no system prompt, the same as the label reader. The data comes first and the instruction last, because the list can be long:

```ts
export function appellationLookupText(facts: AppellationLookupFacts): string {
  return `Facts (JSON):\n${JSON.stringify(facts)}\n\n${APPELLATION_LOOKUP_PROMPT}`;
}

export const APPELLATION_LOOKUP_PROMPT =
  "The JSON above describes one wine bottle photographed for a cellar app: what its label reader resolved, " +
  "and the label's own text. The label printed no appellation the app could match. " +
  "Name the one appellation from `appellations` — every appellation the app holds for this wine's region — " +
  "that this specific wine is sold under, using what you know about this producer and this wine. " +
  "A wine sold under a regional classification with no narrower denomination (a Vino de la Tierra, an IGP or IGT, " +
  "a regional GI) takes the entry named like the region itself. " +
  "Copy the name exactly as the list spells it. " +
  "Return null unless you are confident this wine carries that appellation: what the producer's other wines carry, " +
  "or what is common in the region or for the grape, is not enough.";

export const AppellationLookupSchema = z.object({
  appellation: z.string().nullable().describe(
    "One name copied exactly from the appellations list, or null when you are not confident this wine carries it.",
  ),
});
```

`JSON.stringify(facts)` is built from a literal with a fixed key order, so the text is deterministic and can be pinned in a test.

`coerceLookupAnswer(raw)`:

- It returns the trimmed string when `raw.appellation` is a non-blank string.
- It returns `null` for null or blank.
- It never throws.

The format wrapper copies `labelReadFormat`: `{ ...zodOutputFormat(AppellationLookupSchema), parse }`. Its `parse` never throws. It hands on a JSON object whose `appellation` is a string or null, and anything else parses to null, which becomes `not-read`.

`rawText` is text from a photo. At worst it steers the model to a wrong entry from our own list for the user's own scan: the output is only ever a list entry or null.

### 6.4 The call (`appellation-lookup.ts`)

```ts
export const LABEL_LOOKUP_MODEL = LABEL_READ_MODEL;   // "claude-sonnet-5"
export const LOOKUP_TIMEOUT_MS = 8_000;
export const LOOKUP_MAX_TOKENS = 1_024;

export async function lookupAppellation(facts: AppellationLookupFacts): Promise<AppellationLookupOutcome> {
  // 1. Dev replay, checked before any SDK client exists (mirrors fixture.ts).
  const fixture = await labelLookupFixture();
  if (fixture) return fixture;
  // 2. A replayed read never buys a real follow-up: with LABEL_READ_FIXTURE on and no
  //    LABEL_LOOKUP_FIXTURE, nothing is called (AGENTS.md cost rules).
  if (fixtureAllowed(process.env)) return { ok: false, reason: "skipped", model: null, usage: null };
  try {
    client ??= new Anthropic({ maxRetries: 0, timeout: LOOKUP_TIMEOUT_MS });
    const response = await client.messages.parse(
      {
        model: LABEL_LOOKUP_MODEL,
        max_tokens: LOOKUP_MAX_TOKENS,
        output_config: { effort: "low", format: lookupFormat },
        messages: [{ role: "user", content: appellationLookupText(facts) }],
      },
      { timeout: LOOKUP_TIMEOUT_MS, maxRetries: 0, signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS) },
    );
    const usage = { input_tokens: response.usage.input_tokens, output_tokens: response.usage.output_tokens };
    if (response.stop_reason === "refusal" || response.stop_reason === "max_tokens" || !response.parsed_output) {
      return { ok: false, reason: "not-read", model: LABEL_LOOKUP_MODEL, usage };
    }
    return { ok: true, answer: coerceLookupAnswer(response.parsed_output), model: LABEL_LOOKUP_MODEL, usage };
  } catch (error) {
    // Most specific first. Timeout ⊂ APIConnectionError ⊂ APIError; user abort ⊂ APIError.
    if (error instanceof Anthropic.APIConnectionTimeoutError || error instanceof Anthropic.APIUserAbortError) return fail("timeout");
    if (error instanceof Anthropic.RateLimitError || error instanceof Anthropic.InternalServerError) return fail("busy");
    if (error instanceof Anthropic.APIConnectionError) return fail("network");
    if (error instanceof Anthropic.BadRequestError) return fail("rejected");
    if (error instanceof Anthropic.APIError) return fail("service");
    throw error;   // not an API error: readLabelPhoto's catch turns it into "no answer"
  }
}
```

`fail(reason)` logs `{ reason, status }`: never the key, never the facts. It returns `{ ok: false, reason, model: LABEL_LOOKUP_MODEL, usage: null }`.

The outcome type:

```ts
export type LookupUsage = { input_tokens: number; output_tokens: number };
export type AppellationLookupOutcome =
  | { ok: true; answer: string | null; model: string; usage: LookupUsage }                    // billed, parsed
  | { ok: false; reason: "not-read"; model: string; usage: LookupUsage }                      // billed: refusal / max_tokens / unparsed
  | { ok: false; reason: "timeout" | "busy" | "network" | "rejected" | "service"; model: string; usage: null } // thrown
  | { ok: false; reason: "skipped"; model: null; usage: null };                               // replayed read, no lookup fixture
```

How the settings were chosen:

- **Effort.** `effort: "low"`, with `thinking` left out so it runs adaptive, exactly like `extract.ts`. Nothing measured argues for another setting.
- **`max_tokens`.** 1,024. The answer itself is about 15 tokens, and the rest is headroom for low-effort adaptive thinking. A `max_tokens` stop is `not-read`: billed, recorded, and no answer.
- **No prompt caching.** The list changes with the region and calls are rare, so there is no reusable prefix.

### 6.5 The fixture switch (`lookup-fixture.ts` + `guards.ts`)

```ts
// guards.ts
export function lookupFixtureAllowed(env: { NODE_ENV?: string; LABEL_LOOKUP_FIXTURE?: string }): boolean {
  return env.NODE_ENV !== "production" && Boolean(env.LABEL_LOOKUP_FIXTURE);
}
// lookup-fixture.ts (server-only)
export async function labelLookupFixture(): Promise<AppellationLookupOutcome | null> {
  if (!lookupFixtureAllowed(process.env)) return null;
  const raw = JSON.parse(await readFile(path.resolve(process.cwd(), process.env.LABEL_LOOKUP_FIXTURE!), "utf8"));
  return { ok: true, answer: coerceLookupAnswer(raw), model: "fixture", usage: { input_tokens: 0, output_tokens: 0 } };
}
```

- A fixture file is exactly a parsed structured output, `{ "appellation": "Castilla y Leon" }` or `{ "appellation": null }`.
- Commit one sample fixture, `src/lib/label-scan/__fixtures__/lookup/castilla-y-leon.json`. It sits outside `live/`, which `live-replay.test.ts` pins.
- A missing file throws, which is loud and can only happen in development.
- A fixture replay is kept in `label_lookups` under model `"fixture"` with zero tokens, as a replayed read is.

### 6.6 Orchestration: `followUpAppellation`, pure, with injected `call` and `keep`

```ts
export async function followUpAppellation(input: {
  read: LabelRead; draft: WineIdentityDraft; lookup: RefLookup; readId: string | null;
  call: (facts: AppellationLookupFacts) => Promise<AppellationLookupOutcome>;
  keep: (row: LabelLookupRow & { label_read_id: string }) => Promise<void>;
}): Promise<{ draft: WineIdentityDraft; failure: unknown }> {
  try {
    if (input.readId === null) return { draft: input.draft, failure: null };  // no record possible → no call
    const request = await appellationLookupRequest(input.read, input.draft, input.lookup);
    if (request === null) return { draft: input.draft, failure: null };
    const outcome = await input.call(request.facts);
    const picked = outcome.ok && outcome.answer !== null ? pickListedAppellation(outcome.answer, request.rows) : null;
    const row = labelLookupRow(outcome, request, picked);
    if (row !== null) await input.keep({ label_read_id: input.readId, ...row }).catch(() => undefined);
    return { draft: picked ? applyAppellationLookup(input.draft, picked) : input.draft, failure: null };
  } catch (failure) {
    return { draft: input.draft, failure };   // the scan never fails because the follow-up failed
  }
}
```

- **`pickListedAppellation(answer, rows)`** takes `foldName(answer)`. It returns the one row whose `foldName(name)` equals it, or null. It returns null for an empty fold, for no match, and for two or more matches. There is no suffix stripping and no fuzzy match.
- **`applyAppellationLookup(draft, row)`** sets `appellationId` and `provenance.appellation = "lookup"`. Region and country stay as they are, because the row came from `draft.regionId`'s own list.
- **`labelLookupRow`** maps an outcome to a row:

  | Outcome | `outcome` | `answer` | `appellation_id` |
  |---|---|---|---|
  | `ok`, answer null | `no-answer` | null | — |
  | `ok`, answer picked | `answer` | the answer, truncated to 200 | the picked row's id |
  | `ok`, answer not picked | `discarded` | the answer, truncated to 200 | — |
  | `not-read` | `not-read` | null | — |
  | anything else | no row | | |

  Every row also carries `region_id: request.regionId`, `candidates: request.rows.length`, `model` and the two token counts.

### 6.7 Where it is called (`readLabelPhoto`, step 8)

```ts
// 8. Resolve, follow up a missing appellation (fix C), name what is missing, match, describe.
try {
  const lookup = serverLookup(supabase);
  const resolved = await resolveLabelRead(outcome.read, lookup, { imageUrl });
  const followUp = await followUpAppellation({
    read: outcome.read, draft: resolved, lookup, readId,
    call: lookupAppellation,
    keep: (row) => keepLookup(supabase, user.id, row),   // insert into label_lookups; a failed insert is logged, never thrown (hence §7.4's deploy order)
  });
  if (followUp.failure) logFailure("label lookup failed", followUp.failure);
  const draft = followUp.draft;
  const missing = missingWineFields(draft);
  const match = await findConfidentMatch(supabase, draft);
  const display = readDisplay(draft, await displayNames(draft, lookup));
  return { ok: true, readId, draft, missing, match, display, confidence: outcome.read.confidence };
} catch (error) { ... unchanged ... }
```

`LabelPhotoRead` does not change: the draft's provenance carries the source.

### 6.8 Cost and latency

**Typical call.** The instruction is about 150 tokens, the facts and `rawText` about 250, and the list about 6.5 tokens per name. Castilla y Leon (17 names) comes to about 500 input tokens, or $0.001. The output is about 15 tokens plus 0–200 of thinking, at most $0.002. **That is about $0.001–0.003 per call.**

**Worst case.** Piemonte's 254 names bring the input to about 2k tokens ($0.004), and a full 1,024-token output costs $0.010. **That is about $0.015.**

**Frequency.** The lookup only runs when the resolver left the appellation missing inside a trusted region. Of today's 36 reads, only the Tridente ones qualify, and step 7.6 fills those first once the catalog has a sibling. Spend is bounded by the scan quota: at most one lookup per kept read, and 150 reads per day.

**Latency.**

- It adds nothing to a read the resolver completed.
- Otherwise it adds about 1–3 s (to be measured) and at most 8 s. The call has no retries, the SDK timeout, and an `AbortSignal` with the same bound.
- A timed-out call may still be billed without a usage figure. It is logged, not recorded, which matches thrown label reads.

**Live verification.** It happens in the main session only, after owner approval: at most 3 real calls (under $0.02) on the Tridente photo with the Tridente catalog rows temporarily out of scope. For example, the owner scans a new brand-only bottle. Agents never make a real call.

## 7. Storage: `label_lookups` (migration `20260919214700_label_lookups.sql`)

### 7.1 Why a separate table, not a purpose column on `label_reads`

A purpose column would have to reach every current consumer of `label_reads`:

- **The photo attach.** `attach_catalog_wine_photo` step 10 picks a read by `(user_id, image_path)`. A lookup row for the same photo could become a photo's `label_read_id`, so the deployed function, whose body md5 is pinned in `20260919183100`, would have to be recreated with a filter.
- **The quota.** It counts every `label_reads` row from the last 24 h, so each lookup would use up a scan.
- **The `read` constraint.** `label_reads_read_matches_outcome` ties `read` to a `LabelRead`.
- **The replay tooling.** The replay fixtures assume every stored `read` is a `LabelRead`.

A separate table changes **no deployed function and no existing table**:

- **Account deletion is still covered.** `scrub_deleted_account` runs `delete from label_reads where user_id = …`, and `ON DELETE CASCADE` on `label_read_id` removes the lookups with it. A hard delete of `auth.users` cascades through `user_id` as well. The scrub is not recreated (the `profile-favourites-migration.test.ts` rule).
- **Nothing else reads it.** The quota, the photo attach and the fixtures never see it.

### 7.2 DDL (the core passed a dry run on 2026-09-19 with `scripts/scratch-apply.mjs --mode dry`)

```sql
create table public.label_lookups (
  id uuid primary key default gen_random_uuid(),
  label_read_id uuid not null unique references public.label_reads(id) on delete cascade,  -- one follow-up per read
  user_id uuid not null references auth.users(id) on delete cascade,
  region_id uuid,                -- recorded as it was; deliberately no FK to reference tables
  candidates integer not null check (candidates between 1 and 300),
  outcome text not null check (outcome in ('answer', 'no-answer', 'discarded', 'not-read')),
  answer text check (char_length(answer) <= 200),
  appellation_id uuid,           -- recorded as it was; no FK (catalog curation must never trip on an audit row)
  model text not null,
  input_tokens integer not null default 0 check (input_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  created_at timestamptz not null default now(),
  constraint label_lookups_answer_matches_outcome check ((answer is not null) = (outcome in ('answer', 'discarded'))),
  constraint label_lookups_appellation_only_on_answer check (appellation_id is null or outcome = 'answer')
);
create index label_lookups_user_created_idx on public.label_lookups (user_id, created_at desc);
alter table public.label_lookups enable row level security;
create policy "label_lookups own select" on public.label_lookups
  for select to authenticated using (user_id = auth.uid());
create policy "label_lookups own insert" on public.label_lookups
  for insert to authenticated with check (
    user_id = auth.uid()
    and exists (select 1 from public.label_reads lr where lr.id = label_read_id and lr.user_id = auth.uid()));
-- No UPDATE and no DELETE policy: append-only, like label_reads since 20260914150000.
revoke all on table public.label_lookups from public, anon, authenticated;
grant select, insert on table public.label_lookups to authenticated;
```

### 7.3 Assertions the shipped file adds (the repo's same-transaction pattern)

**Pre-state:**

- `label_reads` has a PK on `id` and a `user_id` that cascades from `auth.users`;
- the table does not exist yet;
- `scrub_deleted_account`'s body still contains `delete from label_reads where user_id = p_user_id`.

**Post-state:**

- the 12 columns, with their types and nullability;
- exactly the two policies, and no `w` or `*` policy;
- privileges: `authenticated` holds SELECT and INSERT only, `anon` holds nothing;
- both FKs have `confdeltype = 'c'`, and the unique index is on `label_read_id`;
- the `SYNRB` behavioural block from the dry run:
  - the owner inserts and sees the row;
  - the owner can neither update nor delete it;
  - a second lookup for the same read is refused (`unique_violation`);
  - user B neither sees the row nor forges one against A's read;
  - deleting the `label_reads` row cascades.

**Static vitest on the SQL text**, like `profile-favourites-migration.test.ts`: the file never recreates `scrub_deleted_account` or `attach_catalog_wine_photo`, and never alters `label_reads`.

### 7.4 Other changes that go with the migration

- **Types.** `database.types.ts` gains `label_lookups` (Row/Insert/Update, `Relationships: []`).
- **Cost query.** Sum the tokens of `label_reads` and `label_lookups`.
- **Deploy order: the migration first, then the app.** `keepLookup` logs a failed insert and never throws, so the scan carries on. If the app shipped before the table existed, every follow-up in that window would be billed, applied to the draft and never recorded (42P01), which breaks "every billed call is kept". Applying the migration first is safe, because nothing in the deployed app touches the table. The migration's header says the same. A runtime probe that skips the call when the table is missing was considered and not built: it would add a round trip to every gated scan to guard against a one-time ordering mistake.

## 8. Provenance values and UI copy

**Types.** `types.ts` adds two members: `FieldProvenance |= "catalog-sibling" | "lookup"`.

**Stored drafts.** `from-sources.ts` `PROVENANCES` gains both values. The type forces this, and without it `parseStoredDraft` would reject a stored incomplete-glass draft that carries them. A deploy is atomic, so no old server ever parses a new value.

**By hand (`by-hand-logic.ts` `fieldChip`).**

| Field | Provenance | Chip | Note |
|---|---|---|---|
| appellation | `catalog-sibling` | "from other vintages" | — |
| appellation | `lookup` | "looked up" | "Not on the label — looked up for this wine. Change it if the bottle says otherwise." |
| region, country | `catalog-sibling` | "from other vintages" | — |
| region, country | `producer-region` | unchanged: no chip | "Filled from {producer}'s region link. Change either if the bottle disagrees." |

Without the new cases, the appellation would fall through to "you choose".

**Staleness on a producer switch.** `applyProducerRegion` already returns early once an appellation is set, so a `catalog-sibling` region is not re-derived when the user switches producer in By hand. Owner decision O5.

**The confirm screen (`read-confirm.tsx`).** Both layouts render one muted line under `meta`, from `appellationSourceNote(draft)` in `scan-copy.ts`. It reads the sheet's `draft` (`item.draft ?? read.draft`), so an edit drops it.

- `catalog-sibling` → "Appellation from other vintages of this wine"
- `lookup` → "Appellation looked up — it is not on the label"
- anything else → nothing

**The READ OK chip.** `readOkChip` moves to `scan-copy.ts` as `readOkChip(confidence, draft)`. It returns "CHECK THE READ" when the confidence is `low` **or** `draft.provenance.appellation === "lookup"`, and "READ OK" otherwise. A sibling-filled appellation keeps "READ OK", because it is our own data and unanimous.

**Confirm title and meta.** These do not change. `readDisplay` already uses the resolved names.

## 9. Tests to write first (red before green)

### 9.1 Resolver: `resolve.test.ts`, new describe "owner fixes A and B (2026-09-19)"

The new describe uses its own synthetic snapshot:

```ts
const tri = (): ReferenceSnapshot => ({
  countries: [{ id: "es", name: "Spain" }, { id: "pt", name: "Portugal" }],
  regions: [
    { id: "clm", name: "Castilla La Mancha", country_id: "es" }, { id: "cyl", name: "Castilla y Leon", country_id: "es" },
    { id: "es-none", name: "None", country_id: "es" }, { id: "dou", name: "Douro", country_id: "pt" },
  ],
  appellations: [
    { id: "clm-a", name: "Castilla La Mancha", region_id: "clm" }, { id: "cyl-a", name: "Castilla y Leon", region_id: "cyl" },
    { id: "rib", name: "Ribera del Duero DO", region_id: "cyl" }, { id: "es-none-a", name: "None", region_id: "es-none" },
  ],
  none: [{ country_id: "es", region_id: "es-none", appellation_id: "es-none-a" }],
  producers: [
    { id: "p-tri", name: "Bodegas Tridente", region_id: "cyl" }, { id: "p-unlinked", name: "Bodegas Sin Enlace", region_id: null },
  ],
  aliases: [{ id: "a-tri", producer_id: "p-tri", alias: "Tridente" }],
  grapes: [{ id: "tem", name: "Tempranillo" }, { id: "gar", name: "Garnacha" }],
  type_designations: [],
  catalog_wines: [{ id: "cw-2018", producer_id: "p-tri", wine_name: "Tridente", colour: "RED", style: "STILL",
    primary_grape_id: "tem", appellation_id: "cyl-a", blind_pending: false, merged_into: null }],
});
const TRIDENTE = { noGeographicIndication: false, country: "Spain", region: "Castilla-La Mancha", appellation: null,
  producer: "Tridente", wineName: "Tridente", colour: "RED", style: "STILL", designation: null,
  grapes: [{ name: "Tempranillo", percentage: 100 }], rawText: "TRIDENTE TEMPRANILLO",
  vintageKind: "NV", vintageRead: false, vintageYear: null };
```

**Fix A**

1. **Tridente, brand-only label, no siblings** (`catalog_wines: []`). Producer `p-tri`; region `cyl` with `producer-region`; appellation null; missing `["vintage", "appellation"]`. Not blanked.
2. **A printed region still beats the producer.** With `rawText: "TRIDENTE · CASTILLA-LA MANCHA · TEMPRANILLO"`, the region is `clm` (`label`). Step 7.5 then takes `clm-a` (`label`), missing `["vintage"]`, and `catalogWinesOfProducer` is never called (spy).
3. **A printed synonym counts** (`regionNamedOnLabel`).
   - read region "Castilla-La Mancha" with `rawText` "… CASTILE-LA MANCHA …" → `clm` kept (`label`).
   - Step 7.5 does not fire, because the stored name is not in the text (D7).
   - The sibling `cw-2018` sits in `cyl`, which contradicts the printed region, so appellation null.
   - Plus a pure `regionNamedOnLabel` table: "Burgundy"/"BOURGOGNE", "Bourgogne"/"BURGUNDY", "Castilla-La Mancha"/"TRIDENTE TEMPRANILLO" → true, true, false.
4. **Step 7.5 is not loosened.** Take the fix-A region (`producer-region`) with a `rawText` that names "CASTILLA Y LEON" and no siblings. The appellation stays null, because 7.5 needs `label`.
5. **Unchanged paths.** Re-run §4.4's list: a link to another country keeps the read's region; appellation text keeps its region; no-GI keeps the tier pair; an empty region takes the link.
5b. **A correct unprinted guess that the link confirms** (review fix, §14). Read region "Castilla y Leon" with no siblings gives region `cyl` with `producer-region`, missing `["vintage", "appellation"]`. That is identical to test 1's wrong guess. With the 2018 sibling, `cyl-a` fills (`catalog-sibling`). Printed ("… CASTILLA Y LEON …"), the region stays `label` and step 7.5 takes `cyl-a`.

**Fix B**

6. **Tridente with the 2018 sibling.** Region `cyl` (`producer-region`), appellation `cyl-a` (`catalog-sibling`), country `es` (`label`), missing `["vintage"]`. With a read 2020 vintage, missing `[]`.
7. **Siblings that disagree fill nothing.** Add `cw-2019` → `rib`. The appellation is null and the region stays `cyl`.
8. **Not a sibling:**
   - a different folded name ("Tridente Reserva");
   - colour WHITE;
   - style SPARKLING;
   - primary grape `gar` when the read resolved Tempranillo.

   Each fills nothing. With `grapes: []`, or a pending grape, the grape is not compared and `cyl-a` fills.
9. **No lookup when the wine is unnamed or the producer is pending.**
   - `wineName: null` → `catalogWinesOfProducer` never called (spy).
   - `producer: "Bodegas Desconocidas"` (pending) → never called; the region stays `clm` (`label`, unprinted); appellation null.
10. **Region and country consistency.**
    - An empty region yields: producer `p-unlinked`, a sibling of `p-unlinked` in `cyl`, read region "Atlantis" → region `cyl` and appellation `cyl-a`, both `catalog-sibling`.
    - A country conflict fills nothing: `country: "Portugal"`, `region: null`, and the sibling in Spain.
11. **A no-GI read never triggers B.** `noGeographicIndication: true` → the `es-none` pair, and `catalogWinesOfProducer` is never called.
12. **An appellation already placed skips B.** A read with appellation "Ribera del Duero DO" never calls it.
12b. **Appellation text that step 4 could not place blocks the siblings unless it names them** (review fix, §14).
    - "Toro DO" with rawText "TRIDENTE · TORO DO · TEMPRANILLO" leaves region `clm` (`label`), appellation null, missing `["vintage", "appellation"]`. It never becomes `cyl-a`.
    - "Vino de la Tierra de Castilla" leaves the appellation null.
    - "D.O. Toro" with no region read gives region `cyl` (`producer-region`) and appellation null.
    - "Vino de la Tierra de Castilla y León" takes `cyl-a`, with region `cyl`, both `catalog-sibling`.
    - "D.O. Toro" beside siblings that all name "Toro DO" takes Toro DO.
    - A pure `appellationTextNames` table covers the same pairs, plus "Puligny-Montrachet 1er Cru" naming "… Premier Cru AOC", and "Torontel" not naming "Toro DO".
13. **An incomplete sibling list fills nothing.** A lookup returning `{ rows: [cw-2018], complete: false }` → appellation null.
14. **The snapshot twin mirrors the server filter.** `snapshotLookup` drops a `blind_pending` row and a merged row, and caps at 200 with `complete: false`.

**Rewrites in the approval 3 describe (§10.2)**

15. Rewrite the existing approval 3 describe, `resolve.test.ts:606-706`, per §10.2.

**`region-canonical.ts`**

16. `regionSynonymsOf("Bourgogne","France")` → `["burgundy"]`.
17. `regionSynonymsOf("Castilla La Mancha","Spain")` → `["castile-la mancha","castilla-la mancha"]`.
18. An unknown country → `[]`.

### 9.2 Follow-up: `appellation-follow-up.test.ts` (pure, fake `call`/`keep`, `tri()` snapshot with `catalog_wines: []`)

**The gate**

1. **Tridente sends one request.** Exactly one request inside `cyl`, with `rows` = `[cyl-a, rib]` in (name, id) order. `facts` pinned field by field:
   - producer "Bodegas Tridente", wineName "Tridente", grapes `["Tempranillo"]`;
   - RED, STILL, Spain, "Castilla y Leon";
   - labelText "TRIDENTE TEMPRANILLO";
   - appellations `["Castilla y Leon", "Ribera del Duero DO"]`.

   1b. **A correct unprinted guess confirmed by the link asks the same way** (review fix, §14). Read region "Castilla y Leon" resolves to `producer-region`, and the request equals the wrong guess's request.

   1c. **Unplaced appellation text goes to the lookup, not to the siblings** (review fix, §14). With the 2018 sibling present, "D.O. Toro" and no region read leave the appellation null. The request is made inside `cyl`, with labelText "TRIDENTE · D.O. TORO".
2. **A no-GI read triggers neither B nor C.** The gate returns null and `call` is never invoked.
3. The gate returns null for each of these:
   - the appellation is already set;
   - the region is null;
   - an unprinted `label` region (pending producer, D4);
   - both producer and wine name are null;
   - 0 rows in the region;
   - 301 rows in the region, the cap;
   - `readId: null` (followUp skips the gate).

   `call` is never invoked in any of them.

**`pickListedAppellation`**

4. "Castilla y León", "castilla y leon" and "CASTILLA-Y-LEON" → `cyl-a`.
5. **An answer outside the list is discarded:** "Castilla y Leon VdlT", "Rioja DOCa" and "" → null. Two rows that fold alike → null.

**`followUpAppellation`**

6. **Answer in the list.** An `ok` answer "Castilla y Leon" → the draft appellation is `cyl-a` with `lookup`; region and country unchanged. `keep` receives `{ outcome: "answer", appellation_id: "cyl-a", candidates: 2, region_id: "cyl" }`.
7. **Answer outside the list.** `ok` "Toro DO" → draft unchanged; `keep` gets `discarded` with answer "Toro DO".
8. **Null answer.** `ok` null → `no-answer`; draft unchanged.
9. **Not read.** `not-read` with usage → kept; draft unchanged.
10. **Timeout and skip.** Neither is kept, and the draft is unchanged.
11. **Failures never fail the scan.**
    - A `call` that throws → `{ draft: unchanged, failure: error }`, and nothing is thrown.
    - A `keep` that rejects → the answer is still applied.

**Across the live fixtures**

12. For every live fixture, the gate returns null against the committed snapshot, **except** #15 (both rounds) and #17 when the snapshot's `catalog_wines` is removed. Each of those then asks inside Castilla y Leon. This is the cost pin: no other recorded read would buy a follow-up.

### 9.3 Schema, guards and call

**`appellation-lookup-schema.test.ts`**

- The pinned `APPELLATION_LOOKUP_PROMPT`, and `appellationLookupText(tridenteFacts)` byte for byte: facts first, instruction last, every list name exactly once.
- `coerceLookupAnswer` handles:
  - a missing key;
  - a number;
  - a blank string;
  - `"  Toro DO "` → "Toro DO".
- The format's `parse` never throws on "", `{`, `[]`, `{"appellation":5}` or refusal text, and returns null for each.

**`guards.test.ts`**

- `lookupFixtureAllowed` is false in production and when the variable is unset.
- `labelLookupRow`: the 4 billed outcomes map to their rows, and every thrown or skipped outcome to null. The answer is truncated to 200.

**`appellation-lookup.test.ts`** (`vi.mock("server-only", () => ({}))`, `vi.mock("@anthropic-ai/sdk", …)` with a constructor that records its calls)

- With `LABEL_LOOKUP_FIXTURE` set, the fixture answer comes back with model "fixture" and zero tokens, **and the SDK constructor is never called**.
- With only `LABEL_READ_FIXTURE` set, the outcome is `skipped` and the constructor is never called.
- `parse` is called with `{ timeout: 8000, maxRetries: 0, signal }`, `max_tokens: 1024` and `output_config.effort: "low"`. The request has no image block and no tools.
- `refusal` and `max_tokens` → `not-read` with usage.
- `APIConnectionTimeoutError`/`APIUserAbortError` → `timeout`, 429 → `busy`, and 400 → `rejected`.

**Migration SQL static test (`label-lookups-migration.test.ts`)**

- The file never recreates `scrub_deleted_account` or `attach_catalog_wine_photo`, and never alters `label_reads`.
- It creates exactly one table.

### 9.4 UI copy

**`by-hand-logic.test.ts`**

- **Appellation.** `catalog-sibling` → chip "from other vintages", and `lookup` → chip "looked up" plus its note. Neither reads "you choose".
- **Region and country.** `catalog-sibling` → chip "from other vintages".

**`scan-copy.test.ts`**

- **`appellationSourceNote`.** The two sentences for the two sources, and null for `label`, `producer-region`, `manual` and an absent value.
- **`readOkChip`.** `lookup` turns "READ OK" into "CHECK THE READ", and `catalog-sibling` keeps "READ OK".

**`from-sources.test.ts`**

- `parseStoredDraft` accepts both new values.

## 10. Existing pins that change, and why

### 10.1 `src/lib/wine-identity/live-replay.test.ts`

1. **#15 `tridente-vintage-unread.json`** (`b0c61af8…`):
   - region null → "Castilla y Leon";
   - appellation null → "Castilla y Leon";
   - missing `["vintage", "region", "appellation"]` → `["vintage"]`.

   The new `why`: fix A means the label (`TRIDENTE TEMPRANILLO`) does not print Castilla-La Mancha, so Bodegas Tridente's link to Castilla y Leon wins. Fix B means the catalog's 2018 and 2020 Tridente rows (RED, STILL, Tempranillo) both name Castilla y Leon's self-named appellation, so step 7.6 takes it. The region model error is still reported, and the vintage is still by-design (D7).
2. **#15 `r2/tridente-vintage-unread.json`** (`06c355b5…`): the same change, for the same reasons.
3. **New pin #17 `tridente-2020.json`** (`a9e27e42-2557-486d-843f-e7c57e2e5484`, the owner's 2026-09-19 report).
   - Copy the stored `label_reads.read` verbatim, with a read-only query.
   - Resolved: Spain / Castilla y Leon / Castilla y Leon, `existing(7f46bd24…, "Bodegas Tridente")`, `[["existing","Tempranillo",100]]`, `year(2020)`, RED, STILL, designation null, missing `[]`.
   - The "round 1 covers the 15 test-set entries plus the Sassicaia live-bug pin (#16)" test becomes "…plus the live-bug pins #16 and #17" and expects `[1…15, 16, 17]`.
4. **"what the live misses turn on" → the first case.** The #4 half does not change. Rewrite the #15 half:
   - Both rounds now resolve region Castilla y Leon (`producer-region`) and appellation Castilla y Leon (`catalog-sibling`).
   - With `{ ...snap, catalog_wines: [] }`, the appellation stays null and missing is `["vintage", "appellation"]`. Step 7.5 still never fires for a producer-link region (D7).
5. **"#15 under owner approval 3 …" → rename to "#15 under fix A …".**
   - The `unlinked` sub-check does not change: with `producer: null`, the read's region Castilla La Mancha stays `label`.
   - The linked read now expects `regionId` = Castilla y Leon with `producer-region`, not `null`/`undefined`.
   - Add the printed control: `{ ...read(file), rawText: "TRIDENTE · CASTILLA-LA MANCHA" }` keeps Castilla La Mancha (`label`), and step 7.5 then takes its self-named "Castilla La Mancha".
6. **The file header comment.** Add "the 2026-09-19 owner fixes A/B (region from the producer link when unprinted; the appellation of other vintages)" to the list of later owner-approved resolver rules that can move a row.
7. **No change.** The fixture/case bijection, `coerceLabelRead` round trips and the near-miss producer test. Every other replay row is unchanged: none of them reaches step 7.6 with a missing appellation, and fix A only acts on an unprinted region with a conflicting link. The review fixes (§14) change no replay row either. This was checked on 2026-09-19 by resolving all 22 fixtures against the committed snapshot, with and without `catalog_wines`. No region-only read has an unprinted region that its producer's link agrees with, and every read that carries appellation text places it at step 4, so step 7.6's new text check never comes into play.

### 10.2 `src/lib/wine-identity/resolve.test.ts`, approval 3 describe (lines 606-706)

- **Retitle and re-comment it** as "owner approval 3, narrowed by fix A (2026-09-19)".
- **Line 649, "the read's region is dropped …".** It now expects region `cyl`, `producer-region`, missing `["appellation"]`. The rawText of `vin-de-france.json` does not name Castilla-La Mancha, and `es()` has no `catalog_wines`.
- **Line 662, "the self-named fallback does not refill the region owner approval 3 blanked …".** It becomes "a printed region beats the producer link, and step 7.5 then takes its self-named row". Expected: region `clm`, appellation `clm-a`, `label`, missing `[]`.
- **Unchanged:** lines 673-705, except the one case below.
- **"a producer linked to the read's own region keeps the read's region, as today"** (review fix, §14). Bodegas Sur links to Castilla La Mancha, and the read's region is unprinted. The case leaves the `it.each` and gets its own test: region `clm` with `producer-region`. A printed control stays `label` and takes `clm-a`.
- **Outside this describe: "the no-GI, region-only … steps mark provenance too"** (review fix, §14). The region-only Produttori read keeps `label` only with `producer: null`. With its own producer, whose link is Piemonte and agrees with the unprinted "Piedmont", it is `producer-region`.

### 10.3 Unchanged

`producer-aliases.test.ts` pins producers only, and `producer-lookup-order.test.ts` does not depend on these steps.

## 11. Files

| Change | Files |
|---|---|
| New | `supabase/migrations/20260919214700_label_lookups.sql` |
| New | `src/lib/label-scan/appellation-lookup-schema.ts`, `src/lib/label-scan/appellation-lookup.ts`, `src/lib/label-scan/lookup-fixture.ts` |
| New | `src/lib/label-scan/__fixtures__/lookup/castilla-y-leon.json`, `src/lib/label-scan/__fixtures__/live/tridente-2020.json` |
| New | `src/lib/wine-identity/appellation-follow-up.ts` |
| New tests | `src/lib/wine-identity/appellation-follow-up.test.ts`, `src/lib/label-scan/appellation-lookup-schema.test.ts`, `src/lib/label-scan/appellation-lookup.test.ts`, `src/lib/label-lookups-migration.test.ts` |
| Changed | `src/lib/wine-identity/resolve.ts` (A, B, header comment), `src/lib/wine-identity/types.ts`, `src/lib/wine-identity/from-sources.ts` |
| Changed | `src/lib/wine-identity/server/lookup.ts`, `src/lib/wine-identity/__fixtures__/snapshot-lookup.ts`, `src/lib/wine-identity/__fixtures__/reference-snapshot.json` (`catalog_wines` only) |
| Changed | `src/lib/label-scan/region-canonical.ts`, `src/lib/label-scan/guards.ts`, `src/app/scan/actions.ts`, `src/lib/supabase/database.types.ts` |
| Changed | `src/components/add-wine/by-hand-logic.ts`, `src/components/add-wine/scan-copy.ts`, `src/components/add-wine/read-confirm.tsx` |
| Changed tests | `resolve.test.ts`, `live-replay.test.ts`, `guards.test.ts`, `by-hand-logic.test.ts`, `scan-copy.test.ts`, `from-sources.test.ts` |
| Untouched | `complete.ts` (the one definition of complete), `extract.ts`, `label-read-schema.ts` (no prompt change), `server/match.ts`, `quota.ts`, every deployed SQL function |

## 12. CLAUDE.md bullet

This bullet replaces the existing "Resolver: region-conflict blank, curated appellation synonyms" bullet:

- **Resolver: an unprinted region yields to the producer link; other vintages, then one follow-up lookup, fill the appellation** (`src/lib/wine-identity/resolve.ts`, `src/lib/wine-identity/appellation-follow-up.ts`; owner fixes A/B/C 2026-09-19, spec `docs/superpowers/specs/2026-09-19-scan-region-appellation.md`; supersedes owner approval 3's blanking). **A.** A read with no appellation text takes its region from its region field (step 5). That region counts as *printed* only when the label's own rawText names it as whole words: the read's text, the stored name, or a `REGION_SYNONYMS` spelling of it (`regionNamedOnLabel`, `regionSynonymsOf`). When the producer it resolved to links to another region of the same country, an unprinted region is replaced by the link (`producer-region`); a printed one is kept. An unprinted region the link agrees with keeps its value but is marked `producer-region` too, so a guess our data confirms never counts for less than one it contradicts. Nothing is blanked any more. Step 7.5's self-named appellation still needs `provenance.region === "label"` and the stored region name in rawText. **B.** Step 7.6 runs only when the appellation is still missing, the producer is an existing row, and the read has a wine name and a colour. Appellation text the read carried but step 4 could not place blocks it, unless that text names the siblings' appellation as whole words (`appellationTextNames`: "D.O. Toro" names "Toro DO", "Toro DO" never names "Castilla y Leon"). It reads the producer's catalog wines through `catalogWinesOfProducer` (the caller's RLS, never merged, never `blind_pending`, 200 at most; a capped or failed read fills nothing). The wines with the same folded name, colour, style (when read) and resolved primary grape (when read) must ALL name one appellation. It is taken, with its region and country, as `catalog-sibling`, unless it contradicts a printed region or the draft's country. Never from the producer alone. **C.** `readLabelPhoto` then makes at most ONE billed text-only follow-up (`lookupAppellation`: claude-sonnet-5, effort low, max_tokens 1024, 8 s timeout plus an AbortSignal, no retries, no tools; ~$0.001–0.003, worst ~$0.015). It runs only when the appellation is still missing, the read is not no-GI, the region is printed or from the producer link (never one the model only guessed), there is a producer or a wine name, the region holds 1–300 appellations (Bourgogne's 1,364 skip it), and the read was kept (`readId`). It must pick one NAME from our own list for that region. An answer that folds to no entry, or to more than one, is discarded. Provenance is `lookup`. The confirm screen adds a muted "Appellation looked up — it is not on the label" line, READ OK becomes CHECK THE READ, and By hand shows "looked up" / "from other vintages" chips. Any follow-up failure leaves the draft as the resolver made it; the scan never fails because of it. Every billed follow-up is kept in the owner-only, append-only `label_lookups` (`20260919214700`, which must be applied BEFORE the app deploy: `keepLookup` only logs a failed insert, so a missing table would mean billed, unrecorded lookups): one row per `label_reads` row, `ON DELETE CASCADE`, so the account scrub's `delete from label_reads` removes it with no function change. The scan quota, `attach_catalog_wine_photo` and the replay fixtures never see it. `LABEL_LOOKUP_FIXTURE` (dev only; a `{ "appellation": … }` file) is checked before any SDK client exists. With `LABEL_READ_FIXTURE` set and no lookup fixture, no follow-up is made at all. A curated appellation synonym (`APPELLATION_SYNONYMS` / `curatedAppellationName` in `src/lib/label-scan/region-canonical.ts`, owner approval 4) is tried only when no reference row agreed with the read's own appellation text, and only inside the region the read itself named. For example, three Ningxia spellings map to the "Ningxia" appellation. It is a curated lookup table, never a heuristic.

## 13. Owner decisions (defaults chosen here) and risks

**Owner decisions**

- **O1. Fix C's region gate (D4).**
  - **Default:** no lookup inside a region the model only guessed.
  - **Why:** the approved text said only "the draft HAS a region". But a lookup scoped to a guessed region can only confirm the guess, and Tridente's guess was wrong. Relaxing it means deleting gate rule 4 (§6.2) and pin 9.2-3's "unprinted" case.
  - **Cost of the default:** a brand-only label from an unknown or unlinked producer, or from a producer linked to another country, keeps its guessed region with a missing appellation, and goes to Fix. A guess that the existing producer's link agrees with is not affected: it is `producer-region` and gets the lookup (§4.4).
- **O2. Style is part of "same wine" in fix B.** This is stricter than approved. Drop it by deleting one filter line.
- **O3. Fix B ignores `blind_pending` rows even when RLS would show them to the caller.** This is stricter than approved, and keeps the candidate set identical to the confident match's.
- **O4. A region with exactly one appellation still pays for the lookup.** There is no zero-cost "only choice" shortcut, because that would be a fourth, unapproved rule.
- **O5. A `catalog-sibling` region or appellation is not cleared when the user switches producer in By hand.** A `label` appellation behaves the same way.
- **O6. By hand still labels an unprinted `label` region "read from the label".** This predates this work, and the new `regionNamedOnLabel` could fix it later.

**Risks**

- **A wrong producer now drags the region with it.** An alias or fold that picks the wrong producer used to blank the region; now the producer's region comes along. The producer is shown in the confirm title and By hand names it in the region note.
- **A wrong catalog row propagates.** The unanimity rule and the four "same wine" filters limit this. Today 5 groups hold more than one row, and none disagrees.
- **A looked-up appellation can be wrong.** The answer can only be one of our own list entries. It gets the "looked up" hint and the CHECK THE READ chip, and the user confirms before anything is added.
- **Latency.** Reads that reach fix C wait about 1–3 s longer (8 s at most). Vercel's function duration is not wired up yet: when it is, the scan action's limit must cover a 60 s read plus the 8 s lookup.
- **A timed-out call can be billed without a record**, as a thrown label read already is.
- **Deploy order.** Shipping the app before `20260919214700` would leave every follow-up billed and unrecorded until the table exists. The migration goes first (§7.4).
- **Step 7.6's text check is a whole-word containment, not an equality.** A printed name that contains the siblings' appellation name as words passes, even if the printed name is a narrower denomination missing from our table (e.g. an unlisted "Rioja Alavesa" beside siblings that all name "Rioja DOCa"). It only applies when step 4 placed nothing, when the siblings are the same wine and unanimous, and when the region is consistent. The user still confirms the result.

## 14. Review fixes (2026-09-19)

Three confirmed review findings, fixed in the same worktree:

1. **Fix C skipped a correct guess that our own producer link confirms** (major). If the model named an unprinted region and the producer's link pointed to that same region, step 7 left it `label`. The gate then dropped it as a bare guess, while a wrong guess got the lookup through `producer-region`. **Fix:** step 7 marks that region `producer-region` (§4.4). The gate is unchanged. Pins: resolve 5b, follow-up 1b, plus the two rewritten cases in §10.2.
2. **Step 7.6 overrode appellation text that step 4 could not place** (major). A label printing "Toro DO", which is missing from our table, took the siblings' "Castilla y Leon" and their region, and kept READ OK. **Fix:** with `read.appellation !== null`, the siblings' appellation is taken only if that text names it (`appellationTextNames`, §5.4). Otherwise the attempt stands and fix C or Fix handles it. Pins: resolve 12b plus the `appellationTextNames` table, and follow-up 1c.
3. **The migration header allowed either deploy order** (minor). **Fix:** the header, §7.4, §12 and `keepLookup`'s comment now require the migration **before** the app deploy. The migration is otherwise unchanged; its SQL is identical, and it gave `DRY-OK` again on 2026-09-19.
