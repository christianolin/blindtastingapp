# Training room plan — part: pure foundations (Tasks 2, 3, 4)

**Contract notes** (deviations from the plan header, each compatible with every call the header shows; follow these):
1. `noteToPayload`'s `ids.contextKind` is `NoteContextKind | null`, not `NoteContextKind`: `NoteEditor` passes `null` today (a plain Taste & Rate note), and `save_wset_note` reads a null `context_kind` as "keep the note's context" on update and `OPEN` on insert. Forcing a non-null value would rewrite an edited BLIND note's context to OPEN. The room passes `"TRAINING"`.
2. `src/lib/training/types.ts` imports its WSET types from `"../wset/types"` (relative, the repo's pure-module idiom), not `"@/lib/wset/types"`; the types are identical.
3. `clearValue` in `src/lib/safe-storage.ts` is `clearValue(getStorage, key): boolean`, the same shape as that file's `readValue`/`writeValue`/`clearFlag` (the header wrote `clearValue(key)`).
4. `readDraft`, `writeDraft` and `clearDraft` take an optional last argument `getStorage` (default: the browser's `localStorage`) so vitest can pass a fake. `writeDraft` and `clearDraft` return `boolean` (saved / removed) instead of `void`; a caller may ignore the result. `draft.ts` also exports `DRAFT_KEY_PREFIX` and `draftClearedBy(event, userId)` for the room's `storage` listener (spec §7.2).
5. Optional additions, no required parameter changed: `capReasonLine`'s ctx gains `candidateStyle?: WineStyle` (without it "Bubbles noted" / "No bubbles noted" and "Fortified" / "Not fortified" cannot be told apart, because both directions share the reason `"bubbles"` or `"fortified"`); `styleVerdictLine` gains an optional second `ctx` (the same shape) to name a colour cap in full; `explain`'s input gains `noteColour?: WineColour | null`; `attemptRowLine` gains `opts?: { timeZone?: string }`.
6. Copy follows spec §9 over §5.7's short form: the colour cap reads "Looks like a red wine, not a white". Three grammar fixes to the §9 templates: "an orange" (not "a orange"); a BROWN hue, the only hue `colourFromHue` cannot place, reads "Looks like a white or red wine, not a rosé" (BROWN only ever caps a rosé); a pool of exactly one reads "1 typical wine so far".
7. `attemptRowLine` returns the row text without "Reveal now". That is a button the history list renders after the text, with `TRAINING_COPY.revealNow` as its label. `tallyLine` returns `""` while nothing is scored, and the list hides the line.
8. A capped candidate's explanation is always its cap reason, even when nothing that applies has been answered (bubbles: yes on its own). Spec §5.6 says the Unlikely group shows each row "with its reason".
9. **For Task 1 (found while copying the fixtures from production, read-only, 2026-09-25):** two live archetype names differ from spec §4.1's table. The live rows are `A typical Côte de Nuits` (no " red") and `A typical Côte de Beaune`, and that second one is a **WHITE** Chardonnay archetype (`colour = WHITE`, `primary_grape = Chardonnay`), not "(red)". The back-fill must use the live strings. Its regional `Bourgogne AOC` row is still right for it.
10. `candidateToArchetypeView` is not in these tasks; the task list places it in Task 6 (`src/lib/training/archetype-view.ts`).

**Verified before writing:** every file below was built in a scratch copy of this worktree (`src/`, `tsconfig.json`, `vitest.config.mts`, `eslint.config.mjs`, `package.json`, with `node_modules` junctioned in). There, `npx tsc --noEmit` reports 0 errors, `npx eslint` on every touched file is clean, and vitest passes the numbers stated in each step. The fixtures' SAT and aroma data were read read-only from production (`begin read only` … `rollback`) with this query:

```sql
select a.name, a.colour, a.style, a.sat, g1.name as primary_grape, g2.name as secondary_grape,
       (select json_agg(json_build_array(t.term, t.group_name, x.kind) order by x.kind, t.sort_order)
          from wine_archetype_aromas x join wset_aroma_terms t on t.id = x.term_id
         where x.archetype_id = a.id) as aromas
from wine_archetypes a
left join grapes g1 on g1.id = a.primary_grape_id
left join grapes g2 on g2.id = a.secondary_grape_id
order by a.sort_order, a.name;
```

It returned exactly the 15 rows the fixture file below carries. Sauternes had null grapes live, and the fixture gives it the grapes Task 1 back-fills.

---

### Task 2: Pure foundations — types, copy, history tally, device draft

**Files:**
- Create: `src/lib/training/types.ts`
- Create: `src/lib/training/__fixtures__/archetypes.ts` (test fixtures shared by Tasks 2 and 3; not a test file, vitest includes `*.test.ts` only)
- Create: `src/lib/training/copy.ts`
- Test: `src/lib/training/copy.test.ts`
- Create: `src/lib/training/history-math.ts`
- Test: `src/lib/training/history-math.test.ts`
- Modify: `src/lib/safe-storage.ts` (append after line 90, the end of `writeValue`)
- Modify: `src/lib/safe-storage.test.ts` (line 2 import; append after line 139)
- Create: `src/lib/training/draft.ts`
- Test: `src/lib/training/draft.test.ts`

**Interfaces:**
- Consumes: `WineColour`, `WineStyle`, `WsetNoteState` (`src/lib/wset/types.ts`); `LABELS` (`src/lib/wset/vocab.ts`); `emptyNoteState()` (`src/lib/wset/note-state.ts`); `readValue`, `writeValue`, `StorageLike` (`src/lib/safe-storage.ts`).
- Produces (later tasks rely on these exact names):
  - `types.ts`: `Range`, `Named`, `TrainingCandidate`, `MatchExtras`, `CapReason`, `RankedCandidate`, `RankingSnapshot`, `AromaLexicon`, `VintageGuess`, `TrainingDraft`, `PointCategory`, `AttemptRow`, exactly as in the plan header.
  - `copy.ts`: `TRAINING_COPY` with the keys `navLabel`, `previewPill`, `eyebrow`, `title`, `promise`, `coverageEmpty`, `start`, `discard`, `discardArmed`, `footerAction`, `candidatesHeading`, `beforeAnswers`, `nothingFits`, `unlikelyGroup`, `colourDarker`, `colourLighter`, `fitsSoFar`, `capBubbles`, `capNoBubbles`, `capFortified`, `capNotFortified`, `yourCall`, `whichWine`, `somethingElse`, `notInList`, `vintageOptional`, `revealBottle`, `cantFindOut`, `revealEyebrow`, `revealTitle`, `revealRowAction`, `revealPrimary`, `revealEnterHint`, `revealByHandPrimary`, `noPick`, `wherePointed`, `notInPool`, `notRevealed`, `anotherGlass`, `seeNote`, `done`, `markHit`, `markMiss`, `markNotApplicable`, `yourSessions`, `notRevealedShort`, `revealNow`, `showMore`, `noSessions`, `trainingBadge`, `unrevealedBadge`, `unreadableWine`.
  - `copy.ts` also exports `CLOSE_WINDOW` (10), `RESULT_ROW_ORDER: readonly PointCategory[]`, `RESULT_ROW_LABELS: Record<PointCategory, string>`, `resultMark(points: number | null): string`, `SCALE_LABELS: Record<string, string>`, and these functions:
    - `shortName(name: string): string`
    - `coverageLine(countries: readonly { name: string; count: number }[], total: number): string`
    - `stripLine(ranked: readonly RankedCandidate[]): string`
    - `lineageLine(c: TrainingCandidate): string`
    - `resultTotalLine(total: number, possible: number): string`
    - `tallyLine(t: { scored: number; grapeHits: number; appellationHits: number }): string`
    - `shortDate(iso: string, timeZone?: string): string` ("24 Sep")
    - `clockTime(iso: string, timeZone?: string): string` ("20:14")
    - `continueLine(time: string): string`
    - `sheetTitle(time: string): string`
    - `showAllLine(n: number): string`
    - `vintageGuessLabel(v: VintageGuess): string | null`
    - `youSaidLine(pickName: string, vintage: VintageGuess): string`
    - `itWasLine(wine: string | null): string`
    - `attemptRowLine(row: AttemptRow, opts?: { timeZone?: string }): string`
    - `capReasonLine(reason: CapReason, ctx: { noteColour: WineColour | null; candidateColour: WineColour; candidateStyle?: WineStyle }): string`
    - `styleVerdictLine(v: { rank: number; n: number; pct: number | null; capped: CapReason | null } | null, ctx?): string`
    - `hueClearedLine(hue: string, colour: WineColour): string`
    - `scaleLossLine(scale: string, direction: "higher" | "lower"): string`
    - `groupLossLine(group: string): string`
    - `signatureLine(term: string): string`
  - `history-math.ts`: `tally(rows: readonly Pick<AttemptRow, "points" | "total">[]): { scored: number; grapeHits: number; appellationHits: number }`.
  - `safe-storage.ts`: `clearValue(getStorage: () => StorageLike | null, key: string): boolean`.
  - `draft.ts`: `DRAFT_KEY_PREFIX`, `draftKey(userId)`, `newSessionKey()`, `readDraft(userId, getStorage?)`, `writeDraft(d, getStorage?)`, `clearDraft(userId, getStorage?)`, `draftClearedBy(event: { key: string | null; newValue: string | null }, userId): boolean`.
  - Fixtures: `POOL: TrainingCandidate[]` (the 15 live archetypes, then `tannin-free-white` (Austria) and `vintage-port`), `arch(key)`, `tid(group, term)`, `LEXICON: AromaLexicon`.

- [ ] **Step 1: Write the shared types**

Create `src/lib/training/types.ts`:

```ts
// The training room's shared types (spec 2026-09-25-training-room-design.md
// §7.1; plan Interface Contracts). A plain module — no "use server", no React,
// no runtime code — so the server page, the server actions, the pure matcher
// and the client room can all import it. Relative type imports only: vitest
// has no `@/` alias (the imports are erased anyway, but the repo's pure modules
// keep them relative so nobody has to check).
import type { WineColour, WineStyle, WsetNoteState } from "../wset/types";

/** A SAT range on a scale's ladder: [low, high] enum values (spec §4.4). */
export type Range = [string, string];

export type Named = { id: string; name: string };

/** One archetype as the room sees it (spec §4.6): the scoring identity as
    reference FKs with their display names, the SAT ranges and the aromas. */
export type TrainingCandidate = {
  id: string;
  name: string;
  description: string | null;
  colour: WineColour;
  style: WineStyle;
  country: Named;
  region: Named;
  appellation: Named & { isRegional: boolean };
  primaryGrape: Named;
  secondaryGrape: Named | null;
  designations: Named[];
  typicalAge: [number, number] | null;
  sat: Record<string, Range | undefined>;
  aromas: {
    termId: string;
    term: string;
    group: string;
    kind: "NOSE" | "PALATE";
    signature: boolean;
  }[];
  placeCanonicalKey: string | null;
  qualityLow: number | null;
  qualityHigh: number | null;
};

/** Facts the form states beside the SAT scales (D19). null = not answered. */
export type MatchExtras = { bubbles: boolean | null; fortified: boolean | null };

export type CapReason = "colour" | "bubbles" | "fortified";

export type RankedCandidate = {
  candidate: TrainingCandidate;
  /** 0..100; null when nothing answered applies to this candidate. */
  closeness: number | null;
  capped: CapReason | null;
  /** Spec §5.7; null before anything answered applies. */
  explanation: string | null;
  /** The exact signature terms the taster picked (every hit, in the
      candidate's aroma order; only the first two earn the bonus). */
  signatureHits: string[];
};

/** The whole ranking, frozen into the attempt at reveal (spec §5.8). */
export type RankingSnapshot = {
  archetypeId: string;
  name: string;
  closeness: number | null;
  rank: number;
  capped: CapReason | null;
}[];

/** wset_aroma_terms by term id → its term and group_name (spec §5.1). */
export type AromaLexicon = Record<string, { term: string; group: string }>;

export type VintageGuess =
  | { kind: "YEAR"; year: number }
  | { kind: "NV" }
  | { kind: "TAWNY"; years: number }
  | null;

/** An unfinished session, kept on the device only (D13). */
export type TrainingDraft = {
  userId: string;
  sessionKey: string;
  startedAt: string;
  note: WsetNoteState;
  extras: MatchExtras;
  pickedArchetypeId: string | null;
  vintage: VintageGuess;
};

export type PointCategory =
  | "country"
  | "region"
  | "appellation"
  | "primaryGrape"
  | "secondaryGrape"
  | "typeDesignation"
  | "vintage";

/** One row of Your sessions (spec §3.6). */
export type AttemptRow = {
  id: string;
  createdAt: string;
  picked: Named | null;
  vintage: VintageGuess;
  actual: { catalogWineId: string; label: string | null; lineage: string | null } | null;
  actualArchetype: Named | null;
  hueCleared: boolean;
  noteColourHue: string | null;
  points: Record<PointCategory, number | null>;
  total: number | null;
  possible: number | null;
  snapshot: RankingSnapshot;
};
```

- [ ] **Step 2: Write the fixtures (the 15 live archetypes + two synthetic)**

Create `src/lib/training/__fixtures__/archetypes.ts`:

```ts
// Test fixtures for the training room's pure modules: the 15 live archetypes
// as they stood on 2026-09-25 (names, colour, style, grapes, sat ranges and
// the nose/palate aroma links with their wset_aroma_terms group_name — read
// read-only from production; the sat data is the seed migrations'
// 20260829222000/…225000 values, the palate lists 20260829228000's), plus two
// synthetic rows the spec's tests call for (§10): a white with no tannin range
// and no aromas, and a Vintage Port (data/training/archetypes-batch-1.json's
// entry). Country/region/appellation names follow spec §4.1's back-fill table.
// Ids are readable stand-ins, not live uuids; a term id is "{group}/{term}".
//
// Signatures: the live rows carry none yet (the column is new, default false).
// Three are flagged HERE ONLY so the bonus has something to hit — Alsace
// Riesling's petrol, Sancerre's gooseberry, Margaux's cedar.
//
// Not a test file (vitest includes *.test.ts only), so it runs nothing itself.
import type { WineColour, WineStyle } from "../../wset/types";
import type { AromaLexicon, Range, TrainingCandidate } from "../types";

/** "{group}/{term}" — the fixture term id. */
export const tid = (group: string, term: string) => `${group}/${term}`;

type Seed = {
  key: string;
  name: string;
  colour: WineColour;
  style: WineStyle;
  country: string;
  region: string;
  appellation: string;
  regional: boolean;
  grapes: [string, string | null];
  sat: Record<string, Range>;
  nose: [string, string][]; // [term, group]
  palate: [string, string][];
  signatures?: string[]; // terms flagged signature (both kinds)
};

const SEEDS: Seed[] = [
  {
    key: "vosne",
    name: "A typical Vosne-Romanée",
    colour: "RED",
    style: "STILL",
    country: "France",
    region: "Bourgogne",
    appellation: "Vosne-Romanée AOC",
    regional: false,
    grapes: ["Pinot Noir", null],
    sat: {
      appearanceIntensity: ["MEDIUM", "MEDIUM"],
      colourHue: ["RUBY", "GARNET"],
      noseIntensity: ["MEDIUM_PLUS", "PRONOUNCED"],
      development: ["YOUTHFUL", "DEVELOPING"],
      sweetness: ["DRY", "DRY"],
      acidity: ["MEDIUM_PLUS", "HIGH"],
      tannin: ["MEDIUM", "MEDIUM_PLUS"],
      alcohol: ["MEDIUM", "MEDIUM"],
      body: ["MEDIUM", "MEDIUM_PLUS"],
      flavourIntensity: ["MEDIUM_PLUS", "PRONOUNCED"],
      finish: ["LONG", "LONG"],
      clarity: ["CLEAR", "CLEAR"],
    },
    nose: [["rose", "Floral"], ["violet", "Floral"], ["raspberry", "Red fruit"], ["strawberry", "Red fruit"], ["red cherry", "Red fruit"], ["forest floor", "Red wine"]],
    palate: [["red cherry", "Red fruit"], ["red plum", "Red fruit"], ["earth", "Red wine"], ["mushroom", "Red wine"], ["forest floor", "Red wine"], ["savoury", "Red wine"]],
  },
  {
    key: "chablis",
    name: "A typical Chablis",
    colour: "WHITE",
    style: "STILL",
    country: "France",
    region: "Bourgogne",
    appellation: "Chablis AOC",
    regional: false,
    grapes: ["Chardonnay", null],
    sat: {
      appearanceIntensity: ["PALE", "MEDIUM"],
      colourHue: ["LEMON_GREEN", "LEMON"],
      noseIntensity: ["MEDIUM", "MEDIUM_PLUS"],
      development: ["YOUTHFUL", "YOUTHFUL"],
      sweetness: ["DRY", "DRY"],
      acidity: ["MEDIUM_PLUS", "HIGH"],
      tannin: ["LOW", "LOW"],
      alcohol: ["MEDIUM", "MEDIUM"],
      body: ["MEDIUM_MINUS", "MEDIUM"],
      flavourIntensity: ["MEDIUM", "MEDIUM_PLUS"],
      finish: ["MEDIUM_PLUS", "LONG"],
      clarity: ["CLEAR", "CLEAR"],
    },
    nose: [["apple", "Green fruit"], ["grapefruit", "Citrus fruit"], ["lemon", "Citrus fruit"], ["wet stones", "Other"], ["biscuit", "Yeast"]],
    palate: [["apple", "Green fruit"], ["lemon", "Citrus fruit"], ["lime", "Citrus fruit"], ["wet stones", "Other"], ["flint", "Other"]],
  },
  {
    key: "sancerre",
    name: "A typical Sancerre",
    colour: "WHITE",
    style: "STILL",
    country: "France",
    region: "Loire",
    appellation: "Sancerre AOC",
    regional: false,
    grapes: ["Sauvignon Blanc", null],
    sat: {
      appearanceIntensity: ["PALE", "MEDIUM"],
      colourHue: ["LEMON_GREEN", "LEMON"],
      noseIntensity: ["MEDIUM_PLUS", "PRONOUNCED"],
      development: ["YOUTHFUL", "YOUTHFUL"],
      sweetness: ["DRY", "DRY"],
      acidity: ["HIGH", "HIGH"],
      tannin: ["LOW", "LOW"],
      alcohol: ["MEDIUM", "MEDIUM"],
      body: ["MEDIUM_MINUS", "MEDIUM"],
      flavourIntensity: ["MEDIUM_PLUS", "PRONOUNCED"],
      finish: ["MEDIUM", "MEDIUM_PLUS"],
      clarity: ["CLEAR", "CLEAR"],
    },
    nose: [["gooseberry", "Green fruit"], ["grapefruit", "Citrus fruit"], ["lime", "Citrus fruit"], ["grass", "Herbaceous"], ["blackcurrant leaf", "Herbaceous"], ["wet stones", "Other"]],
    palate: [["gooseberry", "Green fruit"], ["grapefruit", "Citrus fruit"], ["lime", "Citrus fruit"], ["wet stones", "Other"], ["flint", "Other"]],
    signatures: ["gooseberry"],
  },
  {
    key: "cdp",
    name: "A typical Châteauneuf-du-Pape",
    colour: "RED",
    style: "STILL",
    country: "France",
    region: "Rhône",
    appellation: "Châteauneuf-du-Pape AOC",
    regional: false,
    grapes: ["Grenache", "Syrah"],
    sat: {
      appearanceIntensity: ["MEDIUM", "DEEP"],
      colourHue: ["RUBY", "GARNET"],
      noseIntensity: ["MEDIUM_PLUS", "PRONOUNCED"],
      development: ["DEVELOPING", "DEVELOPING"],
      sweetness: ["DRY", "DRY"],
      acidity: ["MEDIUM_MINUS", "MEDIUM"],
      tannin: ["MEDIUM", "MEDIUM_PLUS"],
      alcohol: ["MEDIUM", "HIGH"],
      body: ["MEDIUM_PLUS", "FULL"],
      flavourIntensity: ["MEDIUM_PLUS", "PRONOUNCED"],
      finish: ["MEDIUM_PLUS", "LONG"],
      clarity: ["CLEAR", "CLEAR"],
    },
    nose: [["blackberry", "Black fruit"], ["black cherry", "Black fruit"], ["black plum", "Black fruit"], ["dried herbs", "Herbal"], ["black pepper", "Spice"], ["liquorice", "Spice"]],
    palate: [["black cherry", "Black fruit"], ["black plum", "Black fruit"], ["dried herbs", "Herbal"], ["liquorice", "Spice"], ["leather", "Red wine"], ["tar", "Red wine"]],
  },
  {
    key: "cote-rotie",
    name: "A typical Côte-Rôtie",
    colour: "RED",
    style: "STILL",
    country: "France",
    region: "Rhône",
    appellation: "Côte-Rôtie AOC",
    regional: false,
    grapes: ["Syrah", null],
    sat: {
      appearanceIntensity: ["MEDIUM", "DEEP"],
      colourHue: ["PURPLE", "RUBY"],
      noseIntensity: ["MEDIUM_PLUS", "PRONOUNCED"],
      development: ["YOUTHFUL", "DEVELOPING"],
      sweetness: ["DRY", "DRY"],
      acidity: ["MEDIUM", "MEDIUM_PLUS"],
      tannin: ["MEDIUM_PLUS", "HIGH"],
      alcohol: ["MEDIUM", "MEDIUM"],
      body: ["MEDIUM_PLUS", "FULL"],
      flavourIntensity: ["MEDIUM_PLUS", "PRONOUNCED"],
      finish: ["LONG", "LONG"],
      clarity: ["CLEAR", "CLEAR"],
    },
    nose: [["violet", "Floral"], ["blackberry", "Black fruit"], ["black pepper", "Spice"], ["smoke", "Oak"], ["leather", "Red wine"]],
    palate: [["blackberry", "Black fruit"], ["black pepper", "Spice"], ["smoke", "Oak"], ["leather", "Red wine"], ["game", "Red wine"]],
  },
  {
    key: "margaux",
    name: "A typical Margaux",
    colour: "RED",
    style: "STILL",
    country: "France",
    region: "Bordeaux",
    appellation: "Margaux AOC",
    regional: false,
    grapes: ["Cabernet Sauvignon", "Merlot"],
    sat: {
      appearanceIntensity: ["MEDIUM", "DEEP"],
      colourHue: ["RUBY", "GARNET"],
      noseIntensity: ["MEDIUM", "MEDIUM_PLUS"],
      development: ["YOUTHFUL", "DEVELOPING"],
      sweetness: ["DRY", "DRY"],
      acidity: ["MEDIUM", "MEDIUM_PLUS"],
      tannin: ["MEDIUM_PLUS", "HIGH"],
      alcohol: ["MEDIUM", "MEDIUM"],
      body: ["MEDIUM_PLUS", "FULL"],
      flavourIntensity: ["MEDIUM", "MEDIUM_PLUS"],
      finish: ["LONG", "LONG"],
      clarity: ["CLEAR", "CLEAR"],
    },
    nose: [["blackcurrant", "Black fruit"], ["black cherry", "Black fruit"], ["mint", "Herbal"], ["vanilla", "Oak"], ["cedar", "Oak"], ["tobacco", "Red wine"]],
    palate: [["blackcurrant", "Black fruit"], ["black cherry", "Black fruit"], ["cedar", "Oak"], ["leather", "Red wine"], ["tobacco", "Red wine"]],
    signatures: ["cedar"],
  },
  {
    key: "sauternes",
    name: "A typical Sauternes",
    colour: "WHITE",
    style: "SWEET",
    country: "France",
    region: "Bordeaux",
    appellation: "Sauternes AOC",
    regional: false,
    grapes: ["Semillon", "Sauvignon Blanc"],
    sat: {
      appearanceIntensity: ["MEDIUM", "DEEP"],
      colourHue: ["GOLD", "AMBER"],
      noseIntensity: ["PRONOUNCED", "PRONOUNCED"],
      development: ["DEVELOPING", "FULLY_DEVELOPED"],
      sweetness: ["SWEET", "LUSCIOUS"],
      acidity: ["MEDIUM_PLUS", "HIGH"],
      tannin: ["LOW", "LOW"],
      alcohol: ["MEDIUM", "HIGH"],
      body: ["FULL", "FULL"],
      flavourIntensity: ["PRONOUNCED", "PRONOUNCED"],
      finish: ["LONG", "LONG"],
      clarity: ["CLEAR", "CLEAR"],
    },
    nose: [["apricot", "Stone fruit"], ["vanilla", "Oak"], ["orange marmalade", "White wine"], ["ginger", "White wine"], ["honey", "White wine"]],
    palate: [["caramel", "Red wine"], ["dried apricot", "White wine"], ["orange marmalade", "White wine"], ["ginger", "White wine"], ["honey", "White wine"]],
  },
  {
    key: "champagne",
    name: "A typical Champagne",
    colour: "WHITE",
    style: "SPARKLING",
    country: "France",
    region: "Champagne",
    appellation: "Champagne AOC",
    regional: true,
    grapes: ["Chardonnay", "Pinot Noir"],
    sat: {
      appearanceIntensity: ["PALE", "MEDIUM"],
      colourHue: ["LEMON_GREEN", "GOLD"],
      noseIntensity: ["MEDIUM", "MEDIUM_PLUS"],
      development: ["YOUTHFUL", "DEVELOPING"],
      sweetness: ["DRY", "OFF_DRY"],
      acidity: ["HIGH", "HIGH"],
      tannin: ["LOW", "LOW"],
      alcohol: ["MEDIUM", "MEDIUM"],
      body: ["MEDIUM_MINUS", "MEDIUM"],
      flavourIntensity: ["MEDIUM", "MEDIUM_PLUS"],
      finish: ["MEDIUM_PLUS", "LONG"],
      mousse: ["CREAMY", "CREAMY"],
      clarity: ["CLEAR", "CLEAR"],
    },
    nose: [["apple", "Green fruit"], ["lemon", "Citrus fruit"], ["biscuit", "Yeast"], ["bread", "Yeast"], ["brioche", "Yeast"]],
    palate: [["apple", "Green fruit"], ["lemon", "Citrus fruit"], ["toast", "Yeast"], ["brioche", "Yeast"], ["cream", "Malolactic"], ["hazelnut", "White wine"]],
  },
  {
    key: "alsace-riesling",
    name: "A typical Alsace Riesling",
    colour: "WHITE",
    style: "STILL",
    country: "France",
    region: "Alsace",
    appellation: "Alsace AOC",
    regional: true,
    grapes: ["Riesling", null],
    sat: {
      appearanceIntensity: ["PALE", "MEDIUM"],
      colourHue: ["LEMON_GREEN", "LEMON"],
      noseIntensity: ["MEDIUM_PLUS", "PRONOUNCED"],
      development: ["YOUTHFUL", "DEVELOPING"],
      sweetness: ["DRY", "OFF_DRY"],
      acidity: ["HIGH", "HIGH"],
      tannin: ["LOW", "LOW"],
      alcohol: ["MEDIUM", "MEDIUM"],
      body: ["MEDIUM_MINUS", "MEDIUM"],
      flavourIntensity: ["MEDIUM_PLUS", "PRONOUNCED"],
      finish: ["MEDIUM_PLUS", "LONG"],
      clarity: ["CLEAR", "CLEAR"],
    },
    nose: [["apple", "Green fruit"], ["lime", "Citrus fruit"], ["apricot", "Stone fruit"], ["petrol", "White wine"], ["honey", "White wine"]],
    palate: [["apple", "Green fruit"], ["lime", "Citrus fruit"], ["peach", "Stone fruit"], ["wet stones", "Other"], ["petrol", "White wine"]],
    signatures: ["petrol"],
  },
  {
    key: "bandol",
    name: "A typical Bandol",
    colour: "RED",
    style: "STILL",
    country: "France",
    region: "Provence",
    appellation: "Bandol AOC",
    regional: false,
    grapes: ["Mourvèdre", null],
    sat: {
      appearanceIntensity: ["DEEP", "DEEP"],
      colourHue: ["RUBY", "GARNET"],
      noseIntensity: ["MEDIUM_PLUS", "PRONOUNCED"],
      development: ["YOUTHFUL", "DEVELOPING"],
      sweetness: ["DRY", "DRY"],
      acidity: ["MEDIUM", "MEDIUM_PLUS"],
      tannin: ["HIGH", "HIGH"],
      alcohol: ["MEDIUM", "HIGH"],
      body: ["FULL", "FULL"],
      flavourIntensity: ["MEDIUM_PLUS", "PRONOUNCED"],
      finish: ["LONG", "LONG"],
      clarity: ["CLEAR", "CLEAR"],
    },
    nose: [["blackberry", "Black fruit"], ["black cherry", "Black fruit"], ["dried herbs", "Herbal"], ["black pepper", "Spice"], ["liquorice", "Spice"], ["leather", "Red wine"]],
    palate: [["blackberry", "Black fruit"], ["black cherry", "Black fruit"], ["liquorice", "Spice"], ["leather", "Red wine"], ["game", "Red wine"], ["tar", "Red wine"]],
  },
  {
    key: "petit-chablis",
    name: "A typical Petit Chablis",
    colour: "WHITE",
    style: "STILL",
    country: "France",
    region: "Bourgogne",
    appellation: "Petit Chablis AOC",
    regional: false,
    grapes: ["Chardonnay", null],
    sat: {
      appearanceIntensity: ["PALE", "PALE"],
      colourHue: ["LEMON_GREEN", "LEMON"],
      noseIntensity: ["MEDIUM_MINUS", "MEDIUM"],
      development: ["YOUTHFUL", "YOUTHFUL"],
      sweetness: ["DRY", "DRY"],
      acidity: ["MEDIUM_PLUS", "HIGH"],
      tannin: ["LOW", "LOW"],
      alcohol: ["MEDIUM", "MEDIUM"],
      body: ["LIGHT", "MEDIUM_MINUS"],
      flavourIntensity: ["MEDIUM_MINUS", "MEDIUM"],
      finish: ["MEDIUM_MINUS", "MEDIUM"],
      clarity: ["CLEAR", "CLEAR"],
    },
    nose: [["apple", "Green fruit"], ["grapefruit", "Citrus fruit"], ["lemon", "Citrus fruit"], ["wet stones", "Other"]],
    palate: [["apple", "Green fruit"], ["lemon", "Citrus fruit"], ["lime", "Citrus fruit"], ["wet stones", "Other"]],
  },
  {
    key: "cote-de-nuits",
    name: "A typical Côte de Nuits",
    colour: "RED",
    style: "STILL",
    country: "France",
    region: "Bourgogne",
    appellation: "Bourgogne AOC",
    regional: true,
    grapes: ["Pinot Noir", null],
    sat: {
      appearanceIntensity: ["MEDIUM", "MEDIUM"],
      colourHue: ["RUBY", "GARNET"],
      noseIntensity: ["MEDIUM_PLUS", "PRONOUNCED"],
      development: ["YOUTHFUL", "DEVELOPING"],
      sweetness: ["DRY", "DRY"],
      acidity: ["MEDIUM_PLUS", "HIGH"],
      tannin: ["MEDIUM", "MEDIUM_PLUS"],
      alcohol: ["MEDIUM", "MEDIUM"],
      body: ["MEDIUM", "MEDIUM_PLUS"],
      flavourIntensity: ["MEDIUM_PLUS", "PRONOUNCED"],
      finish: ["MEDIUM_PLUS", "LONG"],
      clarity: ["CLEAR", "CLEAR"],
    },
    nose: [["violet", "Floral"], ["raspberry", "Red fruit"], ["red cherry", "Red fruit"], ["black cherry", "Black fruit"], ["forest floor", "Red wine"]],
    palate: [["red cherry", "Red fruit"], ["black cherry", "Black fruit"], ["earth", "Red wine"], ["mushroom", "Red wine"], ["forest floor", "Red wine"], ["savoury", "Red wine"]],
  },
  {
    key: "cote-de-beaune",
    name: "A typical Côte de Beaune",
    colour: "WHITE",
    style: "STILL",
    country: "France",
    region: "Bourgogne",
    appellation: "Bourgogne AOC",
    regional: true,
    grapes: ["Chardonnay", null],
    sat: {
      appearanceIntensity: ["PALE", "MEDIUM"],
      colourHue: ["LEMON", "GOLD"],
      noseIntensity: ["MEDIUM_PLUS", "PRONOUNCED"],
      development: ["YOUTHFUL", "DEVELOPING"],
      sweetness: ["DRY", "DRY"],
      acidity: ["MEDIUM", "MEDIUM_PLUS"],
      tannin: ["LOW", "LOW"],
      alcohol: ["MEDIUM", "MEDIUM"],
      body: ["MEDIUM", "MEDIUM_PLUS"],
      flavourIntensity: ["MEDIUM_PLUS", "PRONOUNCED"],
      finish: ["MEDIUM_PLUS", "LONG"],
      clarity: ["CLEAR", "CLEAR"],
    },
    nose: [["apple", "Green fruit"], ["lemon", "Citrus fruit"], ["biscuit", "Yeast"], ["vanilla", "Oak"], ["honey", "White wine"]],
    palate: [["apple", "Green fruit"], ["lemon", "Citrus fruit"], ["toast", "Yeast"], ["butter", "Malolactic"], ["vanilla", "Oak"], ["hazelnut", "White wine"]],
  },
  {
    key: "maconnais",
    name: "A typical Mâconnais",
    colour: "WHITE",
    style: "STILL",
    country: "France",
    region: "Bourgogne",
    appellation: "Macon AOC",
    regional: false,
    grapes: ["Chardonnay", null],
    sat: {
      appearanceIntensity: ["PALE", "MEDIUM"],
      colourHue: ["LEMON", "GOLD"],
      noseIntensity: ["MEDIUM", "MEDIUM_PLUS"],
      development: ["YOUTHFUL", "YOUTHFUL"],
      sweetness: ["DRY", "DRY"],
      acidity: ["MEDIUM", "MEDIUM_PLUS"],
      tannin: ["LOW", "LOW"],
      alcohol: ["MEDIUM", "MEDIUM"],
      body: ["MEDIUM_MINUS", "MEDIUM"],
      flavourIntensity: ["MEDIUM", "MEDIUM_PLUS"],
      finish: ["MEDIUM", "MEDIUM_PLUS"],
      clarity: ["CLEAR", "CLEAR"],
    },
    nose: [["apple", "Green fruit"], ["lemon", "Citrus fruit"], ["apricot", "Stone fruit"], ["honey", "White wine"]],
    palate: [["apple", "Green fruit"], ["lemon", "Citrus fruit"], ["peach", "Stone fruit"], ["melon", "Tropical fruit"], ["hazelnut", "White wine"]],
  },
  {
    key: "cote-chalonnaise",
    name: "A typical Côte Chalonnaise",
    colour: "RED",
    style: "STILL",
    country: "France",
    region: "Bourgogne",
    appellation: "Cote Chalonnaise AOC",
    regional: false,
    grapes: ["Pinot Noir", null],
    sat: {
      appearanceIntensity: ["MEDIUM", "MEDIUM"],
      colourHue: ["RUBY", "GARNET"],
      noseIntensity: ["MEDIUM", "MEDIUM_PLUS"],
      development: ["YOUTHFUL", "DEVELOPING"],
      sweetness: ["DRY", "DRY"],
      acidity: ["MEDIUM", "MEDIUM_PLUS"],
      tannin: ["MEDIUM", "MEDIUM"],
      alcohol: ["MEDIUM", "MEDIUM"],
      body: ["MEDIUM", "MEDIUM"],
      flavourIntensity: ["MEDIUM", "MEDIUM_PLUS"],
      finish: ["MEDIUM", "MEDIUM_PLUS"],
      clarity: ["CLEAR", "CLEAR"],
    },
    nose: [["raspberry", "Red fruit"], ["strawberry", "Red fruit"], ["red cherry", "Red fruit"], ["dried herbs", "Herbal"]],
    palate: [["strawberry", "Red fruit"], ["red cherry", "Red fruit"], ["red plum", "Red fruit"], ["earth", "Red wine"], ["savoury", "Red wine"]],
  },
  // --- synthetic (spec §10) ---------------------------------------------------
  {
    key: "tannin-free-white",
    name: "A typical Tannin-free White",
    colour: "WHITE",
    style: "STILL",
    country: "Austria",
    region: "Niederösterreich",
    appellation: "Niederösterreich",
    regional: true,
    grapes: ["Grüner Veltliner", null],
    sat: {
      sweetness: ["DRY", "DRY"],
      acidity: ["HIGH", "HIGH"],
      body: ["MEDIUM", "MEDIUM"],
    },
    nose: [],
    palate: [],
  },
  {
    key: "vintage-port",
    name: "A typical Vintage Port",
    colour: "RED",
    style: "FORTIFIED",
    country: "Portugal",
    region: "Porto",
    appellation: "Porto DOC",
    regional: false,
    grapes: ["Touriga Nacional", "Touriga Franca"],
    sat: {
      appearanceIntensity: ["DEEP", "DEEP"],
      colourHue: ["RUBY", "GARNET"],
      noseIntensity: ["MEDIUM_PLUS", "PRONOUNCED"],
      development: ["DEVELOPING", "FULLY_DEVELOPED"],
      sweetness: ["MEDIUM_SWEET", "SWEET"],
      acidity: ["MEDIUM", "MEDIUM_PLUS"],
      tannin: ["MEDIUM_PLUS", "HIGH"],
      // FORTIFIED_ALCOHOL_STOPS, for the reference sheet only (D19)
      alcohol: ["MEDIUM_PLUS", "HIGH"],
      body: ["FULL", "FULL"],
      flavourIntensity: ["PRONOUNCED", "PRONOUNCED"],
      finish: ["LONG", "LONG"],
    },
    nose: [["blackberry", "Black fruit"], ["black plum", "Black fruit"], ["violet", "Floral"], ["liquorice", "Spice"], ["cooked blackberry", "Red wine"]],
    palate: [["blackberry", "Black fruit"], ["black plum", "Black fruit"], ["prune", "Red wine"], ["liquorice", "Spice"], ["chocolate", "Oak"]],
  },
];

function toCandidate(s: Seed): TrainingCandidate {
  const sig = new Set(s.signatures ?? []);
  const link = (kind: "NOSE" | "PALATE") => ([term, group]: [string, string]) => ({
    termId: tid(group, term),
    term,
    group,
    kind,
    signature: sig.has(term),
  });
  return {
    id: `arch-${s.key}`,
    name: s.name,
    description: null,
    colour: s.colour,
    style: s.style,
    country: { id: `country-${s.country}`, name: s.country },
    region: { id: `region-${s.region}`, name: s.region },
    appellation: { id: `app-${s.appellation}`, name: s.appellation, isRegional: s.regional },
    primaryGrape: { id: `grape-${s.grapes[0]}`, name: s.grapes[0] },
    secondaryGrape: s.grapes[1] ? { id: `grape-${s.grapes[1]}`, name: s.grapes[1] } : null,
    designations: [],
    typicalAge: null,
    sat: s.sat,
    aromas: [...s.nose.map(link("NOSE")), ...s.palate.map(link("PALATE"))],
    placeCanonicalKey: null,
    qualityLow: null,
    qualityHigh: null,
  };
}

/** Every fixture candidate: the 15 live archetypes, then the two synthetic. */
export const POOL: TrainingCandidate[] = SEEDS.map(toCandidate);

/** One fixture by its key ("margaux", "vintage-port", …). */
export function arch(key: string): TrainingCandidate {
  const c = POOL.find((p) => p.id === `arch-${key}`);
  if (!c) throw new Error(`no fixture archetype ${key}`);
  return c;
}

// Terms a taster may pick that no fixture archetype links (live
// wset_aroma_terms rows), so group disagreement has something to be.
const EXTRA_TERMS: [string, string][] = [
  ["green bell pepper", "Herbaceous"],
  ["banana", "Tropical fruit"],
  ["coconut", "Oak"],
  ["lavender", "Herbal"],
];

/** term id → { term, group } over every fixture aroma plus EXTRA_TERMS. */
export const LEXICON: AromaLexicon = (() => {
  const out: AromaLexicon = {};
  for (const c of POOL) for (const a of c.aromas) out[a.termId] = { term: a.term, group: a.group };
  for (const [term, group] of EXTRA_TERMS) out[tid(group, term)] = { term, group };
  return out;
})();
```

- [ ] **Step 3: Write the failing copy test**

Create `src/lib/training/copy.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { arch } from "./__fixtures__/archetypes";
import {
  CLOSE_WINDOW,
  RESULT_ROW_LABELS,
  RESULT_ROW_ORDER,
  TRAINING_COPY,
  capReasonLine,
  clockTime,
  continueLine,
  coverageLine,
  groupLossLine,
  hueClearedLine,
  itWasLine,
  lineageLine,
  resultMark,
  resultTotalLine,
  scaleLossLine,
  sheetTitle,
  shortDate,
  shortName,
  showAllLine,
  signatureLine,
  stripLine,
  styleVerdictLine,
  tallyLine,
  vintageGuessLabel,
  youSaidLine,
} from "./copy";
import type { CapReason, RankedCandidate } from "./types";

// Spec 2026-09-25-training-room-design.md §9: every string verbatim.

function rc(key: string, closeness: number | null, capped: CapReason | null = null): RankedCandidate {
  return { candidate: arch(key), closeness, capped, explanation: null, signatureHits: [] };
}

describe("TRAINING_COPY (spec §9, verbatim)", () => {
  it("holds every fixed string", () => {
    expect(TRAINING_COPY).toEqual({
      navLabel: "Training Room",
      previewPill: "Preview",
      eyebrow: "Training room · Preview",
      title: "Taste blind. Then find out.",
      promise:
        "Pour a glass whose label you can't see. Describe it, watch the list tell you what it could be, then reveal the bottle.",
      coverageEmpty: "No typical wines yet — the room opens once the first batch lands.",
      start: "Start a session",
      discard: "Discard",
      discardArmed: "Tap again to discard",
      footerAction: "Your call →",
      candidatesHeading: "What it could be",
      beforeAnswers: "Start describing the wine",
      nothingFits: "Nothing fits yet — check colour and bubbles",
      unlikelyGroup: "Unlikely from what you've said",
      colourDarker: "Colour darker than typical",
      colourLighter: "Colour lighter than typical",
      fitsSoFar: "Fits what you've said so far",
      capBubbles: "Bubbles noted",
      capNoBubbles: "No bubbles noted",
      capFortified: "Fortified",
      capNotFortified: "Not fortified",
      yourCall: "Your call",
      whichWine: "Which wine is it?",
      somethingElse: "Something else…",
      notInList: "It's not in the list",
      vintageOptional: "Vintage (optional)",
      revealBottle: "Reveal the bottle",
      cantFindOut: "I can't find out",
      revealEyebrow: "Reveal the bottle",
      revealTitle: "Which bottle was it?",
      revealRowAction: "This is it",
      revealPrimary: "This is it",
      revealEnterHint: "↵ reveals the first hit",
      revealByHandPrimary: "This is it",
      noPick: "You didn't pick a wine",
      wherePointed: "Where your note pointed",
      notInPool: "This style isn't in the pool yet",
      notRevealed: "Not revealed — your note is kept. Reveal now from Your sessions.",
      anotherGlass: "Another glass",
      seeNote: "See the note",
      done: "Done",
      markHit: "✓",
      markMiss: "✗",
      markNotApplicable: "—",
      yourSessions: "Your sessions",
      notRevealedShort: "Not revealed",
      revealNow: "Reveal now",
      showMore: "Show more",
      noSessions: "No sessions yet",
      trainingBadge: "Training",
      unrevealedBadge: "Training room · not revealed",
      unreadableWine: "a wine you can't see yet",
    });
  });

  it("fills the templated lines", () => {
    expect(continueLine("20:14")).toBe("Continue your session · started 20:14");
    expect(sheetTitle("20:14")).toBe("Unknown wine · started 20:14");
    expect(showAllLine(17)).toBe("Show all 17");
    expect(itWasLine("Château Talbot 2016")).toBe("It was Château Talbot 2016");
    expect(itWasLine(null)).toBe("It was a wine you can't see yet");
    expect(resultTotalLine(14, 22)).toBe("14 of 22");
    expect(scaleLossLine("tannin", "higher")).toBe("Tannin higher than typical");
    expect(scaleLossLine("flavourIntensity", "lower")).toBe("Flavour intensity lower than typical");
    expect(scaleLossLine("colourHue", "higher")).toBe("Colour darker than typical");
    expect(scaleLossLine("colourHue", "lower")).toBe("Colour lighter than typical");
    expect(groupLossLine("Black fruit")).toBe("Black fruit isn't typical");
    expect(signatureLine("petrol")).toBe("✓ petrol — a signature");
  });

  it("labels the seven result rows in order and marks them", () => {
    expect(RESULT_ROW_ORDER.map((c) => RESULT_ROW_LABELS[c])).toEqual([
      "Country",
      "Region",
      "Appellation",
      "Grape",
      "Second grape",
      "Designation",
      "Vintage",
    ]);
    expect(resultMark(8)).toBe("✓");
    expect(resultMark(1)).toBe("✓"); // vintage off by one year
    expect(resultMark(0)).toBe("✗");
    expect(resultMark(null)).toBe("—");
  });
});

describe("shortName", () => {
  it("strips a leading 'A typical ' in any case", () => {
    expect(shortName("A typical Pauillac")).toBe("Pauillac");
    expect(shortName("a Typical Côte de Beaune (red)")).toBe("Côte de Beaune (red)");
  });
  it("leaves any other name alone", () => {
    expect(shortName("Pauillac")).toBe("Pauillac");
    expect(shortName("Typical Pauillac")).toBe("Typical Pauillac");
    expect(shortName("Not a typical Pauillac")).toBe("Not a typical Pauillac");
  });
});

describe("coverageLine", () => {
  it("0 countries: the empty-pool sentence", () => {
    expect(coverageLine([], 0)).toBe("No typical wines yet — the room opens once the first batch lands.");
  });
  it("1 country", () => {
    expect(coverageLine([{ name: "France", count: 15 }], 15)).toBe(
      "15 typical wines so far — France. More each week.",
    );
    expect(coverageLine([{ name: "France", count: 1 }], 1)).toBe("1 typical wine so far — France. More each week.");
  });
  it("4 countries: all named, by count then name, no 'and more'", () => {
    expect(
      coverageLine(
        [
          { name: "Spain", count: 4 },
          { name: "France", count: 20 },
          { name: "Italy", count: 4 },
          { name: "Germany", count: 2 },
        ],
        30,
      ),
    ).toBe("30 typical wines so far — France, Italy, Spain and Germany. More each week.");
  });
  it("6 countries: four named and 'and more'", () => {
    expect(
      coverageLine(
        [
          { name: "Portugal", count: 3 },
          { name: "France", count: 36 },
          { name: "Austria", count: 3 },
          { name: "Italy", count: 16 },
          { name: "Germany", count: 7 },
          { name: "Spain", count: 11 },
        ],
        76,
      ),
    ).toBe("76 typical wines so far — France, Italy, Spain, Germany and more. More each week.");
  });
});

describe("stripLine", () => {
  it("uses a 10-point window", () => {
    expect(CLOSE_WINDOW).toBe(10);
  });
  it("leader plus the other uncapped candidates within 10 points", () => {
    // 91 − 85 = 6 and 91 − 81 = 10 count; 91 − 80 = 11 and the capped one do not.
    const ranked = [
      rc("margaux", 91),
      rc("cote-rotie", 85),
      rc("bandol", 81),
      rc("cdp", 80),
      rc("chablis", 15, "colour"),
    ];
    expect(stripLine(ranked)).toBe("Top match: Margaux 91 % · 2 more close");
  });
  it("k = 1", () => {
    expect(stripLine([rc("margaux", 91), rc("bandol", 81), rc("cdp", 70)])).toBe(
      "Top match: Margaux 91 % · 1 more close",
    );
  });
  it("k = 0: just the leader", () => {
    expect(stripLine([rc("margaux", 20), rc("chablis", 15, "colour")])).toBe("Top match: Margaux 20 %");
  });
  it("a leader with no number: the pre-answer hint", () => {
    expect(stripLine([rc("margaux", null), rc("bandol", null)])).toBe("Start describing the wine");
    expect(stripLine([])).toBe("Start describing the wine");
  });
  it("every candidate capped", () => {
    expect(stripLine([rc("chablis", 15, "colour"), rc("margaux", null, "bubbles")])).toBe(
      "Nothing fits yet — check colour and bubbles",
    );
  });
});

describe("lineageLine", () => {
  it("a specific appellation: appellation · region, country · grapes", () => {
    expect(lineageLine(arch("margaux"))).toBe("Margaux AOC · Bordeaux, France · Cabernet Sauvignon, Merlot");
    expect(lineageLine(arch("chablis"))).toBe("Chablis AOC · Bourgogne, France · Chardonnay");
  });
  it("a regional appellation drops itself", () => {
    expect(lineageLine(arch("cote-de-nuits"))).toBe("Bourgogne, France · Pinot Noir");
    expect(lineageLine(arch("champagne"))).toBe("Champagne, France · Chardonnay, Pinot Noir");
  });
});

describe("tallyLine", () => {
  it("n of m right on the grape · k on the appellation", () => {
    expect(tallyLine({ scored: 9, grapeHits: 6, appellationHits: 4 })).toBe(
      "6 of 9 right on the grape · 4 on the appellation",
    );
  });
  it("is empty before anything is scored", () => {
    expect(tallyLine({ scored: 0, grapeHits: 0, appellationHits: 0 })).toBe("");
  });
});

describe("vintage and 'You said'", () => {
  it("words a guess as the guess ladder does", () => {
    expect(vintageGuessLabel(null)).toBeNull();
    expect(vintageGuessLabel({ kind: "YEAR", year: 2016 })).toBe("2016");
    expect(vintageGuessLabel({ kind: "NV" })).toBe("NV");
    expect(vintageGuessLabel({ kind: "TAWNY", years: 20 })).toBe("20 years tawny");
  });
  it("You said {shortName}{, vintage}", () => {
    expect(youSaidLine("A typical Pauillac", null)).toBe("You said Pauillac");
    expect(youSaidLine("A typical Pauillac", { kind: "YEAR", year: 2016 })).toBe("You said Pauillac, 2016");
    expect(youSaidLine("A typical Champagne", { kind: "NV" })).toBe("You said Champagne, NV");
  });
});

describe("cap reasons", () => {
  it("colour names both colours, with the right article", () => {
    expect(capReasonLine("colour", { noteColour: "RED", candidateColour: "WHITE" })).toBe(
      "Looks like a red wine, not a white",
    );
    expect(capReasonLine("colour", { noteColour: "WHITE", candidateColour: "ROSE" })).toBe(
      "Looks like a white wine, not a rosé",
    );
    expect(capReasonLine("colour", { noteColour: "RED", candidateColour: "ORANGE" })).toBe(
      "Looks like a red wine, not an orange",
    );
    // BROWN names no colour (it caps only a rosé).
    expect(capReasonLine("colour", { noteColour: null, candidateColour: "ROSE" })).toBe(
      "Looks like a white or red wine, not a rosé",
    );
  });
  it("bubbles and fortification read the direction from the candidate's style", () => {
    expect(capReasonLine("bubbles", { noteColour: null, candidateColour: "RED", candidateStyle: "STILL" })).toBe(
      "Bubbles noted",
    );
    expect(
      capReasonLine("bubbles", { noteColour: null, candidateColour: "WHITE", candidateStyle: "SPARKLING" }),
    ).toBe("No bubbles noted");
    expect(capReasonLine("fortified", { noteColour: null, candidateColour: "RED", candidateStyle: "STILL" })).toBe(
      "Fortified",
    );
    expect(
      capReasonLine("fortified", { noteColour: null, candidateColour: "RED", candidateStyle: "FORTIFIED" }),
    ).toBe("Not fortified");
  });
});

describe("styleVerdictLine", () => {
  it("rank of n at pct", () => {
    expect(styleVerdictLine({ rank: 2, n: 17, pct: 92, capped: null })).toBe("Its style was your #2 of 17 at 92 %");
    expect(styleVerdictLine({ rank: 9, n: 17, pct: null, capped: null })).toBe("Its style was your #9 of 17");
  });
  it("ruled out, with the reason", () => {
    expect(
      styleVerdictLine(
        { rank: 16, n: 17, pct: 15, capped: "colour" },
        { noteColour: "RED", candidateColour: "WHITE", candidateStyle: "STILL" },
      ),
    ).toBe("You had ruled its style out (Looks like a red wine, not a white)");
    expect(styleVerdictLine({ rank: 16, n: 17, pct: 15, capped: "bubbles" })).toBe(
      "You had ruled its style out (bubbles)",
    );
  });
  it("not in the pool", () => {
    expect(styleVerdictLine(null)).toBe("This style isn't in the pool yet");
  });
});

describe("hueClearedLine", () => {
  it("names the hue as the sheet words it and the wine's colour", () => {
    expect(hueClearedLine("RUBY", "WHITE")).toBe("Your colour call (ruby) didn't fit — it was a white wine.");
    expect(hueClearedLine("LEMON_GREEN", "ORANGE")).toBe(
      "Your colour call (lemon-green) didn't fit — it was an orange wine.",
    );
  });
});

describe("dates", () => {
  it("24 Sep and 20:14 in the given zone", () => {
    expect(shortDate("2026-09-24T18:14:00.000Z", "UTC")).toBe("24 Sep");
    expect(clockTime("2026-09-24T18:14:00.000Z", "UTC")).toBe("18:14");
    expect(clockTime("2026-09-24T18:14:00.000Z", "Europe/Copenhagen")).toBe("20:14");
    // Just before midnight UTC is the next day in Copenhagen.
    expect(shortDate("2026-09-24T23:30:00.000Z", "Europe/Copenhagen")).toBe("25 Sep");
    expect(clockTime("2026-01-05T07:05:00.000Z", "UTC")).toBe("07:05");
  });
});
```

- [ ] **Step 4: Run it and see it fail**

Run: `cd /c/Users/Public/repos/blindtastingapp-training && npx vitest run src/lib/training/copy.test.ts`
Expected: FAIL. `Failed to resolve import "./copy" from "src/lib/training/copy.test.ts"` (the module does not exist yet).

- [ ] **Step 5: Write `copy.ts`**

Create `src/lib/training/copy.ts`:

```ts
// Every string the training room shows (spec 2026-09-25-training-room-design.md
// §9, English only — D20), and the pure helpers that fill its templates. Pure:
// relative imports only, no React, no DB, no browser globals, so vitest loads it.
import type { WineColour, WineStyle } from "../wset/types";
import { LABELS } from "../wset/vocab";
import type {
  AttemptRow,
  CapReason,
  PointCategory,
  RankedCandidate,
  TrainingCandidate,
  VintageGuess,
} from "./types";

/** The strip's "more close" window: other uncapped candidates within this many
    points of the leader (spec §9, strip). */
export const CLOSE_WINDOW = 10;

/** The fixed strings, verbatim from spec §9. Templated lines are functions below. */
export const TRAINING_COPY = {
  // nav label / pill
  navLabel: "Training Room",
  previewPill: "Preview",
  // landing
  eyebrow: "Training room · Preview",
  title: "Taste blind. Then find out.",
  promise:
    "Pour a glass whose label you can't see. Describe it, watch the list tell you what it could be, then reveal the bottle.",
  coverageEmpty: "No typical wines yet — the room opens once the first batch lands.",
  start: "Start a session",
  discard: "Discard",
  discardArmed: "Tap again to discard",
  // session
  footerAction: "Your call →",
  candidatesHeading: "What it could be",
  beforeAnswers: "Start describing the wine",
  nothingFits: "Nothing fits yet — check colour and bubbles",
  unlikelyGroup: "Unlikely from what you've said",
  // explanation lines without a template
  colourDarker: "Colour darker than typical",
  colourLighter: "Colour lighter than typical",
  fitsSoFar: "Fits what you've said so far",
  // cap reasons without a template
  capBubbles: "Bubbles noted",
  capNoBubbles: "No bubbles noted",
  capFortified: "Fortified",
  capNotFortified: "Not fortified",
  // your call
  yourCall: "Your call",
  whichWine: "Which wine is it?",
  somethingElse: "Something else…",
  notInList: "It's not in the list",
  vintageOptional: "Vintage (optional)",
  revealBottle: "Reveal the bottle",
  cantFindOut: "I can't find out",
  // reveal sheet (the add-wine note matrix, reveal variant)
  revealEyebrow: "Reveal the bottle",
  revealTitle: "Which bottle was it?",
  revealRowAction: "This is it",
  revealPrimary: "This is it",
  revealEnterHint: "↵ reveals the first hit",
  revealByHandPrimary: "This is it",
  // result
  noPick: "You didn't pick a wine",
  wherePointed: "Where your note pointed",
  notInPool: "This style isn't in the pool yet",
  notRevealed: "Not revealed — your note is kept. Reveal now from Your sessions.",
  anotherGlass: "Another glass",
  seeNote: "See the note",
  done: "Done",
  // result rows' marks
  markHit: "✓",
  markMiss: "✗",
  markNotApplicable: "—",
  // history
  yourSessions: "Your sessions",
  notRevealedShort: "Not revealed",
  revealNow: "Reveal now",
  showMore: "Show more",
  noSessions: "No sessions yet",
  // badges
  trainingBadge: "Training",
  unrevealedBadge: "Training room · not revealed",
  // unreadable / gone wine
  unreadableWine: "a wine you can't see yet",
} as const;

/** The result table's seven rows, in order (spec §3.5, §9 "result rows"). */
export const RESULT_ROW_ORDER: readonly PointCategory[] = [
  "country",
  "region",
  "appellation",
  "primaryGrape",
  "secondaryGrape",
  "typeDesignation",
  "vintage",
];

export const RESULT_ROW_LABELS: Record<PointCategory, string> = {
  country: "Country",
  region: "Region",
  appellation: "Appellation",
  primaryGrape: "Grape",
  secondaryGrape: "Second grape",
  typeDesignation: "Designation",
  vintage: "Vintage",
};

/** ✓ when the category earned points, ✗ when it applied and earned none, — when
    it did not apply (null). */
export function resultMark(points: number | null): string {
  if (points === null) return TRAINING_COPY.markNotApplicable;
  return points > 0 ? TRAINING_COPY.markHit : TRAINING_COPY.markMiss;
}

/** The "{Scale}" word of an explanation line, per matched sat key (the admin
    editor's row labels). colourHue has its own darker/lighter lines. */
export const SCALE_LABELS: Record<string, string> = {
  appearanceIntensity: "Appearance intensity",
  colourHue: "Colour",
  noseIntensity: "Nose intensity",
  development: "Development",
  sweetness: "Sweetness",
  acidity: "Acidity",
  tannin: "Tannin",
  alcohol: "Alcohol",
  body: "Body",
  mousse: "Mousse",
  flavourIntensity: "Flavour intensity",
  finish: "Finish",
};

/** Strips a leading "A typical " (any case); otherwise the name unchanged. */
export function shortName(name: string): string {
  const m = /^a typical /i.exec(name);
  return m ? name.slice(m[0].length) : name;
}

// "France" · "France and Italy" · "France, Italy and Spain"
function listAll(names: readonly string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/**
 * The landing's coverage line (spec §3.2, §9). Countries by count desc, then
 * name; four named and "and more" when there are five or more; fewer than
 * five all named, no "and more"; one country "{n} typical wines so far — {c1}.
 * More each week."; an empty pool its own sentence (the room hides Start).
 */
export function coverageLine(
  countries: readonly { name: string; count: number }[],
  total: number,
): string {
  if (total <= 0 || countries.length === 0) return TRAINING_COPY.coverageEmpty;
  const sorted = [...countries].sort(
    (a, b) => b.count - a.count || a.name.localeCompare(b.name, "en"),
  );
  const names = sorted.map((c) => c.name);
  const head = `${total} typical ${total === 1 ? "wine" : "wines"} so far — `;
  if (names.length >= 5) return `${head}${names.slice(0, 4).join(", ")} and more. More each week.`;
  return `${head}${listAll(names)}. More each week.`;
}

/**
 * The phone strip under the sheet's bar (spec §3.3, §9). `ranked` is
 * rankCandidates' output, already in §5.8 order (uncapped numbered first).
 */
export function stripLine(ranked: readonly RankedCandidate[]): string {
  if (ranked.length === 0) return TRAINING_COPY.beforeAnswers;
  const leader = ranked.find((r) => r.capped === null);
  if (!leader) return TRAINING_COPY.nothingFits;
  if (leader.closeness === null) return TRAINING_COPY.beforeAnswers;
  const top = leader.closeness;
  const k = ranked.filter(
    (r) =>
      r !== leader &&
      r.capped === null &&
      r.closeness !== null &&
      top - r.closeness <= CLOSE_WINDOW,
  ).length;
  const head = `Top match: ${shortName(leader.candidate.name)} ${top} %`;
  return k === 0 ? head : `${head} · ${k} more close`;
}

/** "{Appellation} · {Region}, {Country} · {grapes}"; a regional appellation
    drops its own part: "{Region}, {Country} · {grapes}" (D11, §9). */
export function lineageLine(c: TrainingCandidate): string {
  const grapes = [c.primaryGrape.name, c.secondaryGrape?.name]
    .filter((g): g is string => Boolean(g))
    .join(", ");
  const place = `${c.region.name}, ${c.country.name}`;
  const origin = c.appellation.isRegional ? place : `${c.appellation.name} · ${place}`;
  return `${origin} · ${grapes}`;
}

/** "{n} of {m}" */
export function resultTotalLine(total: number, possible: number): string {
  return `${total} of ${possible}`;
}

/**
 * "{n} of {m} right on the grape · {k} on the appellation" — n grape hits, m
 * scored attempts, k appellation hits. Empty when nothing has been scored yet:
 * the history then hides the line (and shows "No sessions yet" only when it
 * has no rows at all).
 */
export function tallyLine(t: { scored: number; grapeHits: number; appellationHits: number }): string {
  if (t.scored === 0) return "";
  return `${t.grapeHits} of ${t.scored} right on the grape · ${t.appellationHits} on the appellation`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function dateParts(iso: string, timeZone: string | undefined) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone,
  }).formatToParts(new Date(iso));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return { day: get("day"), month: Number(get("month")), hour: get("hour"), minute: get("minute") };
}

/** "24 Sep" in the viewer's zone (or `timeZone`). A fixed month table, not
    Intl's short month, which reads "Sept" under en-GB. */
export function shortDate(iso: string, timeZone?: string): string {
  const p = dateParts(iso, timeZone);
  return `${p.day} ${MONTHS[p.month - 1]}`;
}

/** "20:14" in the viewer's zone (or `timeZone`). */
export function clockTime(iso: string, timeZone?: string): string {
  const p = dateParts(iso, timeZone);
  return `${p.hour}:${p.minute}`;
}

/** "Continue your session · started {time}" */
export function continueLine(time: string): string {
  return `Continue your session · started ${time}`;
}

/** "Unknown wine · started {time}" — the session sheet's title. */
export function sheetTitle(time: string): string {
  return `Unknown wine · started ${time}`;
}

/** "Show all {n}" */
export function showAllLine(n: number): string {
  return `Show all ${n}`;
}

/** The guessed vintage as the guess ladder words it: "2016", "NV",
    "20 years tawny"; null when no vintage was guessed. */
export function vintageGuessLabel(v: VintageGuess): string | null {
  if (v === null) return null;
  if (v.kind === "YEAR") return String(v.year);
  if (v.kind === "NV") return "NV";
  return `${v.years} years tawny`;
}

/** "You said {shortName}{, vintage}" */
export function youSaidLine(pickName: string, vintage: VintageGuess): string {
  const v = vintageGuessLabel(vintage);
  return `You said ${shortName(pickName)}${v ? `, ${v}` : ""}`;
}

/** "It was {wine}"; an unreadable wine reads "a wine you can't see yet". */
export function itWasLine(wine: string | null): string {
  return `It was ${wine ?? TRAINING_COPY.unreadableWine}`;
}

/**
 * One history row's text (spec §3.6, §9 "history"):
 * "24 Sep · You said Pauillac · It was Saint-Julien · 14 of 22",
 * "24 Sep · You didn't pick a wine · It was … · 0 of 22",
 * "24 Sep · You said Pauillac · Not revealed". An unrevealed row's
 * "Reveal now" is a button the list renders after this text
 * (TRAINING_COPY.revealNow), so it is not part of the string.
 */
export function attemptRowLine(row: AttemptRow, opts?: { timeZone?: string }): string {
  const parts = [shortDate(row.createdAt, opts?.timeZone)];
  parts.push(row.picked ? `You said ${shortName(row.picked.name)}` : TRAINING_COPY.noPick);
  if (row.actual === null) {
    parts.push(TRAINING_COPY.notRevealedShort);
  } else {
    parts.push(itWasLine(row.actual.label));
    if (row.total !== null && row.possible !== null) {
      parts.push(resultTotalLine(row.total, row.possible));
    }
  }
  return parts.join(" · ");
}

const COLOUR_WORDS: Record<WineColour, string> = {
  WHITE: "white",
  ROSE: "rosé",
  RED: "red",
  ORANGE: "orange",
};

// "a white" · "an orange"
function withArticle(word: string): string {
  return `${/^[aeiou]/i.test(word) ? "an" : "a"} ${word}`;
}

/**
 * A capped candidate's reason (spec §5.6, §9 "cap reasons"). Colour:
 * "Looks like a {note colour} wine, not a {candidate colour}" — the note's
 * colour is `colourFromHue(note.colourHue)`; null only for BROWN, which caps
 * only a rosé, so it reads "a white or red wine". Bubbles and fortification
 * read the direction from the candidate's style: a sparkling candidate is
 * capped because the note said no bubbles, a fortified one because the note
 * said not fortified; without `candidateStyle` the still/unfortified side is
 * assumed.
 */
export function capReasonLine(
  reason: CapReason,
  ctx: { noteColour: WineColour | null; candidateColour: WineColour; candidateStyle?: WineStyle },
): string {
  if (reason === "colour") {
    const said = ctx.noteColour ? COLOUR_WORDS[ctx.noteColour] : "white or red";
    return `Looks like ${withArticle(said)} wine, not ${withArticle(COLOUR_WORDS[ctx.candidateColour])}`;
  }
  if (reason === "bubbles") {
    return ctx.candidateStyle === "SPARKLING" ? TRAINING_COPY.capNoBubbles : TRAINING_COPY.capBubbles;
  }
  return ctx.candidateStyle === "FORTIFIED" ? TRAINING_COPY.capNotFortified : TRAINING_COPY.capFortified;
}

const CAP_WORDS: Record<CapReason, string> = {
  colour: "colour",
  bubbles: "bubbles",
  fortified: "fortification",
};

/**
 * The result's style verdict (spec §3.5, D17). `v` is the real wine's style
 * looked up in the frozen snapshot (null: not in the pool). A capped style
 * names its reason through capReasonLine when `ctx` is given, else one word.
 * A style with no percentage drops "at {pct} %".
 */
export function styleVerdictLine(
  v: { rank: number; n: number; pct: number | null; capped: CapReason | null } | null,
  ctx?: { noteColour: WineColour | null; candidateColour: WineColour; candidateStyle?: WineStyle },
): string {
  if (v === null) return TRAINING_COPY.notInPool;
  if (v.capped !== null) {
    const reason = ctx ? capReasonLine(v.capped, ctx) : CAP_WORDS[v.capped];
    return `You had ruled its style out (${reason})`;
  }
  const at = v.pct === null ? "" : ` at ${v.pct} %`;
  return `Its style was your #${v.rank} of ${v.n}${at}`;
}

/** "Your colour call ({hue}) didn't fit — it was a {colour} wine." */
export function hueClearedLine(hue: string, colour: WineColour): string {
  const word = LABELS[hue] ?? hue.toLowerCase();
  return `Your colour call (${word}) didn't fit — it was ${withArticle(COLOUR_WORDS[colour])} wine.`;
}

/** "{Scale} higher than typical" / "lower"; colour reads darker / lighter
    (the hue ladders run light → dark). */
export function scaleLossLine(scale: string, direction: "higher" | "lower"): string {
  if (scale === "colourHue") {
    return direction === "higher" ? TRAINING_COPY.colourDarker : TRAINING_COPY.colourLighter;
  }
  return `${SCALE_LABELS[scale] ?? scale} ${direction} than typical`;
}

/** "{Group} isn't typical" */
export function groupLossLine(group: string): string {
  return `${group} isn't typical`;
}

/** "✓ {term} — a signature" */
export function signatureLine(term: string): string {
  return `✓ ${term} — a signature`;
}
```

- [ ] **Step 6: Run the copy test and see it pass**

Run: `cd /c/Users/Public/repos/blindtastingapp-training && npx vitest run src/lib/training/copy.test.ts`
Expected: PASS, 1 file, **28 tests**. If the two `dates` assertions for `Europe/Copenhagen` fail, the Node build lacks full ICU. Node 24's official builds ship it, so check `node -p "Intl.DateTimeFormat().resolvedOptions().timeZone"` before changing any code.

- [ ] **Step 7: Write the failing history test**

Create `src/lib/training/history-math.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { TRAINING_COPY, attemptRowLine } from "./copy";
import { tally } from "./history-math";
import type { AttemptRow, PointCategory } from "./types";

// Your sessions (spec §3.6): the tally line's counts and every row's text.

const NO_POINTS: Record<PointCategory, number | null> = {
  country: null,
  region: null,
  appellation: null,
  primaryGrape: null,
  secondaryGrape: null,
  typeDesignation: null,
  vintage: null,
};

function row(patch: Partial<AttemptRow>): AttemptRow {
  return {
    id: "attempt-1",
    createdAt: "2026-09-24T18:14:00.000Z",
    picked: { id: "arch-pauillac", name: "A typical Pauillac" },
    vintage: null,
    actual: null,
    actualArchetype: null,
    hueCleared: false,
    noteColourHue: null,
    points: NO_POINTS,
    total: null,
    possible: null,
    snapshot: [],
    ...patch,
  };
}

const scored = (primaryGrape: number, appellation: number | null, total: number) =>
  row({
    actual: { catalogWineId: "wine-1", label: "Château Talbot 2016", lineage: null },
    points: { ...NO_POINTS, country: 2, region: 3, appellation, primaryGrape, secondaryGrape: 0 },
    total,
    possible: 22,
  });

describe("tally", () => {
  it("counts scored attempts only, and grape/appellation hits among them", () => {
    const rows = [
      scored(8, 5, 18), // grape ✓ appellation ✓
      scored(8, 0, 13), // grape ✓
      scored(0, 5, 10), // appellation ✓
      scored(0, 0, 5), // neither
      row({}), // unrevealed: not scored
      row({ picked: null }), // unrevealed, no pick
    ];
    expect(tally(rows)).toEqual({ scored: 4, grapeHits: 2, appellationHits: 2 });
  });

  it("an appellation that did not apply (null) is not a hit", () => {
    expect(tally([scored(8, null, 13)])).toEqual({ scored: 1, grapeHits: 1, appellationHits: 0 });
  });

  it("nothing yet", () => {
    expect(tally([])).toEqual({ scored: 0, grapeHits: 0, appellationHits: 0 });
    expect(tally([row({})])).toEqual({ scored: 0, grapeHits: 0, appellationHits: 0 });
  });
});

describe("attemptRowLine", () => {
  const utc = { timeZone: "UTC" };

  it("a pick, revealed and scored", () => {
    expect(attemptRowLine(scored(8, 0, 14), utc)).toBe(
      "24 Sep · You said Pauillac · It was Château Talbot 2016 · 14 of 22",
    );
  });

  it("no pick, revealed", () => {
    const r = { ...scored(0, 0, 0), picked: null };
    expect(attemptRowLine(r, utc)).toBe("24 Sep · You didn't pick a wine · It was Château Talbot 2016 · 0 of 22");
  });

  it("a wine the viewer cannot read", () => {
    const r = scored(8, 5, 18);
    r.actual = { catalogWineId: "wine-1", label: null, lineage: null };
    expect(attemptRowLine(r, utc)).toBe("24 Sep · You said Pauillac · It was a wine you can't see yet · 18 of 22");
  });

  it("not revealed: the list adds the Reveal now button after it", () => {
    expect(attemptRowLine(row({}), utc)).toBe("24 Sep · You said Pauillac · Not revealed");
    expect(attemptRowLine(row({ picked: null }), utc)).toBe("24 Sep · You didn't pick a wine · Not revealed");
    expect(TRAINING_COPY.revealNow).toBe("Reveal now");
  });
});
```

- [ ] **Step 8: Run it and see it fail**

Run: `cd /c/Users/Public/repos/blindtastingapp-training && npx vitest run src/lib/training/history-math.test.ts`
Expected: FAIL. `Failed to resolve import "./history-math"`.

- [ ] **Step 9: Write `history-math.ts`**

Create `src/lib/training/history-math.ts`:

```ts
// The history's tally (spec §3.6): over every attempt the viewer has, the
// scored ones, how many named the right grape (primary_grape_points > 0) and
// how many the right appellation (appellation_points > 0). Pure: relative
// imports only.
import type { AttemptRow } from "./types";

export function tally(rows: readonly Pick<AttemptRow, "points" | "total">[]): {
  scored: number;
  grapeHits: number;
  appellationHits: number;
} {
  let scored = 0;
  let grapeHits = 0;
  let appellationHits = 0;
  for (const r of rows) {
    if (r.total === null) continue; // not revealed yet: not scored
    scored += 1;
    if ((r.points.primaryGrape ?? 0) > 0) grapeHits += 1;
    if ((r.points.appellation ?? 0) > 0) appellationHits += 1;
  }
  return { scored, grapeHits, appellationHits };
}
```

- [ ] **Step 10: Run it and see it pass**

Run: `cd /c/Users/Public/repos/blindtastingapp-training && npx vitest run src/lib/training/history-math.test.ts`
Expected: PASS, **7 tests**.

- [ ] **Step 11: Write the failing `clearValue` test**

In `src/lib/safe-storage.test.ts`, replace line 2:

```ts
import { clearFlag, readFlag, readValue, writeFlag, writeValue } from "./safe-storage";
```

with:

```ts
import { clearFlag, clearValue, readFlag, readValue, writeFlag, writeValue } from "./safe-storage";
```

and append after the last line (line 139, the closing `});` of "safe-storage: clearing a flag"):

```ts
// clearValue exists for the training room's device draft (spec
// 2026-09-25-training-room-design.md D13): Discard and a finished session
// remove the stored JSON rather than leave a stale value behind.
describe("safe-storage: clearing a value", () => {
  it("removes a value it wrote, and only that key", () => {
    const store = new Map<string, string>();
    const storage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    };
    writeValue(() => storage, "a", "{\"x\":1}");
    writeValue(() => storage, "b", "keep");
    expect(clearValue(() => storage, "a")).toBe(true);
    expect(readValue(() => storage, "a")).toBeNull();
    expect([...store.keys()]).toEqual(["b"]);
  });

  it("overwrites with an empty string when the storage has no removeItem", () => {
    const store = new Map<string, string>();
    const storage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    };
    writeValue(() => storage, "a", "{\"x\":1}");
    expect(clearValue(() => storage, "a")).toBe(true);
    expect(readValue(() => storage, "a")).toBe("");
  });

  it("is false, not a throw, when storage is missing or blocked", () => {
    expect(clearValue(() => null, "a")).toBe(false);
    expect(clearValue(() => { throw new Error("SecurityError"); }, "a")).toBe(false);
    const hostile = {
      getItem: () => null,
      setItem: () => undefined,
      removeItem: () => { throw new Error("SecurityError"); },
    };
    expect(clearValue(() => hostile, "a")).toBe(false);
  });
});
```

- [ ] **Step 12: Run it and see it fail**

Run: `cd /c/Users/Public/repos/blindtastingapp-training && npx vitest run src/lib/safe-storage.test.ts`
Expected: FAIL. The 3 new tests fail with a TypeError saying `clearValue` is not a function, and the 12 existing tests pass.

- [ ] **Step 13: Add `clearValue`**

Append to `src/lib/safe-storage.ts`, after its last line (line 90, the closing `}` of `writeValue`):

```ts
/**
 * Removes a stored value. False when there is no storage or the removal
 * throws. Overwrites with "" when the storage has no `removeItem`; a caller
 * that parses the value (the training room's draft) treats "" as nothing
 * stored, the same as null.
 */
export function clearValue(getStorage: () => StorageLike | null, key: string): boolean {
  try {
    const storage = getStorage();
    if (!storage) return false;
    if (storage.removeItem) storage.removeItem(key);
    else storage.setItem(key, "");
    return true;
  } catch {
    return false;
  }
}
```

- [ ] **Step 14: Run it and see it pass**

Run: `cd /c/Users/Public/repos/blindtastingapp-training && npx vitest run src/lib/safe-storage.test.ts`
Expected: PASS, **15 tests**.

- [ ] **Step 15: Write the failing draft test**

Create `src/lib/training/draft.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { emptyNoteState } from "../wset/note-state";
import {
  DRAFT_KEY_PREFIX,
  clearDraft,
  draftClearedBy,
  draftKey,
  newSessionKey,
  readDraft,
  writeDraft,
} from "./draft";
import type { TrainingDraft } from "./types";

// The device draft (spec D13): one JSON value per user, never on the server.

function fakeStorage() {
  const store = new Map<string, string>();
  const storage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  };
  return { store, get: () => storage };
}

const USER = "11111111-2222-4333-8444-555555555555";

function draft(patch: Partial<TrainingDraft> = {}): TrainingDraft {
  return {
    userId: USER,
    sessionKey: "0f8fad5b-d9cb-469f-a165-70867728950e",
    startedAt: "2026-09-24T18:14:00.000Z",
    note: { ...emptyNoteState(), tannin: "HIGH", noseTermIds: ["t1"] },
    extras: { bubbles: false, fortified: null },
    pickedArchetypeId: "arch-margaux",
    vintage: { kind: "YEAR", year: 2016 },
    ...patch,
  };
}

describe("draftKey", () => {
  it("is blindr-training-draft:<userId>", () => {
    expect(DRAFT_KEY_PREFIX).toBe("blindr-training-draft:");
    expect(draftKey(USER)).toBe(`blindr-training-draft:${USER}`);
  });
});

describe("write, read, clear", () => {
  it("round-trips a draft", () => {
    const s = fakeStorage();
    expect(writeDraft(draft(), s.get)).toBe(true);
    expect(readDraft(USER, s.get)).toEqual(draft());
  });

  it("keeps NV, tawny and no vintage, and no pick", () => {
    const s = fakeStorage();
    for (const vintage of [{ kind: "NV" } as const, { kind: "TAWNY", years: 20 } as const, null]) {
      writeDraft(draft({ vintage, pickedArchetypeId: null }), s.get);
      expect(readDraft(USER, s.get)?.vintage).toEqual(vintage);
      expect(readDraft(USER, s.get)?.pickedArchetypeId).toBeNull();
    }
  });

  it("clears only this user's draft", () => {
    const s = fakeStorage();
    writeDraft(draft(), s.get);
    writeDraft(draft({ userId: "other" }), s.get);
    expect(clearDraft(USER, s.get)).toBe(true);
    expect(readDraft(USER, s.get)).toBeNull();
    expect([...s.store.keys()]).toEqual(["blindr-training-draft:other"]);
  });

  it("reads null when there is no draft or no storage", () => {
    expect(readDraft(USER, fakeStorage().get)).toBeNull();
    expect(readDraft(USER, () => null)).toBeNull();
    expect(readDraft(USER, () => { throw new Error("SecurityError"); })).toBeNull();
    expect(writeDraft(draft(), () => null)).toBe(false);
  });

  it("fills a note saved by an older build from the empty note", () => {
    const s = fakeStorage();
    const old = draft();
    const olderNote: Record<string, unknown> = { ...old.note };
    delete olderNote.mousse;
    delete olderNote.tanninNature;
    s.get().setItem(draftKey(USER), JSON.stringify({ ...old, note: olderNote }));
    const read = readDraft(USER, s.get);
    expect(read?.note.mousse).toBeNull();
    expect(read?.note.tanninNature).toEqual([]);
    expect(read?.note.tannin).toBe("HIGH");
  });

  it("refuses a malformed draft", () => {
    const s = fakeStorage();
    const put = (v: unknown) => s.get().setItem(draftKey(USER), typeof v === "string" ? v : JSON.stringify(v));
    const bad: unknown[] = [
      "not json",
      "",
      "null",
      draft({ userId: "someone-else" }),
      draft({ sessionKey: "not-a-uuid" }),
      draft({ startedAt: "yesterday" }),
      { ...draft(), note: null },
      { ...draft(), note: { ...draft().note, noseTermIds: "t1" } },
      { ...draft(), extras: { bubbles: "yes", fortified: null } },
      { ...draft(), pickedArchetypeId: 42 },
      { ...draft(), vintage: { kind: "YEAR" } },
      { ...draft(), vintage: { kind: "MAGNUM" } },
    ];
    for (const v of bad) {
      put(v);
      expect(readDraft(USER, s.get)).toBeNull();
    }
  });
});

describe("newSessionKey", () => {
  it("mints a v4 uuid, different each time", () => {
    const a = newSessionKey();
    const b = newSessionKey();
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(a).not.toBe(b);
  });
});

describe("draftClearedBy (the storage listener)", () => {
  it("is true when another tab removed this user's draft or cleared storage", () => {
    expect(draftClearedBy({ key: draftKey(USER), newValue: null }, USER)).toBe(true);
    expect(draftClearedBy({ key: draftKey(USER), newValue: "" }, USER)).toBe(true);
    expect(draftClearedBy({ key: null, newValue: null }, USER)).toBe(true);
  });
  it("is false for a write to the draft or another key", () => {
    expect(draftClearedBy({ key: draftKey(USER), newValue: "{}" }, USER)).toBe(false);
    expect(draftClearedBy({ key: draftKey("other"), newValue: null }, USER)).toBe(false);
    expect(draftClearedBy({ key: "blindr-theme", newValue: null }, USER)).toBe(false);
  });
});
```

- [ ] **Step 16: Run it and see it fail**

Run: `cd /c/Users/Public/repos/blindtastingapp-training && npx vitest run src/lib/training/draft.test.ts`
Expected: FAIL. `Failed to resolve import "./draft"`.

- [ ] **Step 17: Write `draft.ts`**

Create `src/lib/training/draft.ts`:

```ts
// The unfinished training session, kept on the device only (spec
// 2026-09-25-training-room-design.md D13, §7.2): nothing is on the server
// before the reveal. One JSON value per user under
// `blindr-training-draft:<userId>`, read and written through safe-storage's
// try/catch, so a blocked or full store means "no draft" / "not saved", never
// a crash. Every function takes an optional storage getter (default: the
// browser's localStorage) so vitest can pass a fake; no browser global is
// touched at module level.
import { clearValue, readValue, writeValue, type StorageLike } from "../safe-storage";
import { emptyNoteState } from "../wset/note-state";
import type { MatchExtras, TrainingDraft, VintageGuess } from "./types";

export const DRAFT_KEY_PREFIX = "blindr-training-draft:";

export function draftKey(userId: string): string {
  return `${DRAFT_KEY_PREFIX}${userId}`;
}

function browserStorage(): StorageLike | null {
  return typeof window === "undefined" ? null : window.localStorage;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A fresh session key (training_attempts.session_key, a uuid): v4 from
    crypto.getRandomValues, which — unlike randomUUID — needs no secure context. */
export function newSessionKey(): string {
  const b = new Uint8Array(16);
  globalThis.crypto.getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40; // version 4
  b[8] = (b[8] & 0x3f) | 0x80; // RFC 4122 variant
  const hex = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function isTriState(v: unknown): v is boolean | null {
  return v === null || v === true || v === false;
}

function isExtras(v: unknown): v is MatchExtras {
  if (typeof v !== "object" || v === null) return false;
  const e = v as Record<string, unknown>;
  return isTriState(e.bubbles) && isTriState(e.fortified);
}

function isVintage(v: unknown): v is VintageGuess {
  if (v === null) return true;
  if (typeof v !== "object") return false;
  const g = v as Record<string, unknown>;
  if (g.kind === "NV") return true;
  if (g.kind === "YEAR") return Number.isInteger(g.year);
  if (g.kind === "TAWNY") return Number.isInteger(g.years);
  return false;
}

const NOTE_ARRAYS = ["observations", "faults", "tanninNature", "noseTermIds", "palateTermIds"] as const;

/**
 * This user's draft, or null when there is none, it cannot be read, it is not
 * valid JSON, or its shape is wrong (a draft from another user, a bad session
 * key or timestamp, a malformed pick, extras or vintage). A note saved by an
 * older build is filled up from `emptyNoteState()`, so a field added later
 * starts unrated rather than undefined.
 */
export function readDraft(
  userId: string,
  getStorage: () => StorageLike | null = browserStorage,
): TrainingDraft | null {
  const raw = readValue(getStorage, draftKey(userId));
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const d = parsed as Record<string, unknown>;
  if (d.userId !== userId) return null;
  if (typeof d.sessionKey !== "string" || !UUID_RE.test(d.sessionKey)) return null;
  if (typeof d.startedAt !== "string" || Number.isNaN(Date.parse(d.startedAt))) return null;
  if (typeof d.note !== "object" || d.note === null) return null;
  const note = { ...emptyNoteState(), ...(d.note as object) };
  for (const k of NOTE_ARRAYS) if (!Array.isArray(note[k])) return null;
  if (!isExtras(d.extras)) return null;
  if (d.pickedArchetypeId !== null && typeof d.pickedArchetypeId !== "string") return null;
  if (!isVintage(d.vintage)) return null;
  return {
    userId,
    sessionKey: d.sessionKey,
    startedAt: d.startedAt,
    note,
    extras: { bubbles: d.extras.bubbles, fortified: d.extras.fortified },
    pickedArchetypeId: d.pickedArchetypeId,
    vintage: d.vintage,
  };
}

/** Stores the draft under its user's key. False when it could not be saved. */
export function writeDraft(
  d: TrainingDraft,
  getStorage: () => StorageLike | null = browserStorage,
): boolean {
  return writeValue(getStorage, draftKey(d.userId), JSON.stringify(d));
}

/** Removes this user's draft (Discard, a finished session). */
export function clearDraft(
  userId: string,
  getStorage: () => StorageLike | null = browserStorage,
): boolean {
  return clearValue(getStorage, draftKey(userId));
}

/**
 * Did this `storage` event clear the user's draft in another tab? True for
 * that key removed (or emptied) and for `localStorage.clear()` (key null);
 * the room then returns to the landing (spec §7.2).
 */
export function draftClearedBy(
  event: { key: string | null; newValue: string | null },
  userId: string,
): boolean {
  if (event.key === null) return true;
  return event.key === draftKey(userId) && !event.newValue;
}
```

- [ ] **Step 18: Run the task's tests**

Run: `cd /c/Users/Public/repos/blindtastingapp-training && npx vitest run src/lib/training src/lib/safe-storage.test.ts`
Expected: PASS, 4 files: copy 28, history-math 7, draft 10, safe-storage 15, so **60 tests**.

- [ ] **Step 19: Type-check and lint**

Run: `cd /c/Users/Public/repos/blindtastingapp-training && npx tsc --noEmit && npx eslint src/lib/training src/lib/safe-storage.ts src/lib/safe-storage.test.ts`
Expected: tsc exits 0 with no output, and eslint prints nothing.

- [ ] **Step 20: Commit**

```bash
cd /c/Users/Public/repos/blindtastingapp-training && git add src/lib/training/types.ts src/lib/training/__fixtures__/archetypes.ts src/lib/training/copy.ts src/lib/training/copy.test.ts src/lib/training/history-math.ts src/lib/training/history-math.test.ts src/lib/training/draft.ts src/lib/training/draft.test.ts src/lib/safe-storage.ts src/lib/safe-storage.test.ts && GIT_AUTHOR_NAME=christianolin GIT_AUTHOR_EMAIL=christianolin@users.noreply.github.com GIT_COMMITTER_NAME=christianolin GIT_COMMITTER_EMAIL=christianolin@users.noreply.github.com git commit -m "feat(training): types, copy, history tally and the device draft" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: The matcher

**Files:**
- Create: `src/lib/training/match.ts`
- Test: `src/lib/training/match.test.ts`

**Interfaces:**
- Consumes (from Task 2): the types in `src/lib/training/types.ts`; from `src/lib/training/copy.ts`: `TRAINING_COPY.fitsSoFar`, `capReasonLine`, `groupLossLine`, `scaleLossLine`, `shortName`, `signatureLine`; the fixtures `POOL`, `arch`, `tid`, `LEXICON`. From the repo: `ALCOHOL_STOPS`, `BODY_STOPS`, `DEVELOPMENT_STOPS`, `FINISH_STOPS`, `HUES_BY_COLOUR`, `INTENSITY_STOPS`, `LEVEL_STOPS`, `colourFromHue` (`src/lib/wset/vocab.ts`), and `emptyNoteState` (tests only).
- Produces (Tasks 9, 10, 11 rely on these):
  - `rankCandidates(note: WsetNoteState, extras: MatchExtras, pool: TrainingCandidate[], lexicon: AromaLexicon): RankedCandidate[]`, in §5.8 order. Every candidate is kept.
  - `snapshotRanking(ranked: RankedCandidate[]): RankingSnapshot`, the whole list with 1-based `rank`.
  - `explain(input: { candidate; closeness; capped; signatureHits; losses; aromaLoss; noteColour? }): string | null`
  - `ladderFor(scale: string, candidate: TrainingCandidate): string[] | null`
  - `stepScore(d: number): number`
  - `WEIGHTS`, `CAP_MAX = 15`, `SIGNATURE_BONUS = 1`, `SIGNATURE_MAX_HITS = 2`, `EXPLAIN_THRESHOLD = 0.3`, `MATCHED_SCALES`, `MatchedScale`.
- Rules this file implements (spec §5, read before editing):
  - Answered scales that the candidate carries are scored on their ladder.
  - A scale is skipped, leaving both the numerator and the denominator, when any of these holds: the candidate has no range for it; the answer or a range bound is off the ladder (this includes a hue off the candidate colour's row); it is alcohol and either side is fortified; it is mousse on a candidate that is not sparkling.
  - The aroma term counts only when the taster picked a term the lexicon knows and the candidate has aroma links.
  - The signature bonus is added to the numerator only (never the denominator). At most two hits count, and the result is capped at 100.
  - `null` closeness when the denominator is 0.
  - A capped closeness becomes `min(c, 15)`, and a null closeness stays null.

- [ ] **Step 1: Write the failing matcher test**

Create `src/lib/training/match.test.ts` (every expected number has its arithmetic in the comment beside it):

```ts
import { describe, expect, it } from "vitest";
import { emptyNoteState } from "../wset/note-state";
import type { WsetNoteState } from "../wset/types";
import { LEXICON, POOL, arch, tid } from "./__fixtures__/archetypes";
import {
  CAP_MAX,
  WEIGHTS,
  explain,
  ladderFor,
  rankCandidates,
  snapshotRanking,
  stepScore,
} from "./match";
import type { MatchExtras, RankedCandidate, TrainingCandidate } from "./types";

// The training room's matcher (spec 2026-09-25-training-room-design.md §5).
// Every expected closeness below is worked by hand in the comment beside it:
// closeness = min(100, round(100 · (Σ wᵢ·s(dᵢ) + 2·a + bonus) / (Σ wᵢ + 2·[aromas]))).

const NONE: MatchExtras = { bubbles: null, fortified: null };

function note(partial: Partial<WsetNoteState>): WsetNoteState {
  return { ...emptyNoteState(), ...partial };
}

function rank(
  n: Partial<WsetNoteState>,
  extras: MatchExtras = NONE,
  pool: TrainingCandidate[] = POOL,
): RankedCandidate[] {
  return rankCandidates(note(n), extras, pool, LEXICON);
}

function get(ranked: RankedCandidate[], key: string): RankedCandidate {
  const r = ranked.find((x) => x.candidate.id === `arch-${key}`);
  if (!r) throw new Error(`no ranked ${key}`);
  return r;
}

/** A fixture with some fields replaced (a new id so it never collides). */
function variant(key: string, patch: Partial<TrainingCandidate>, id = `${key}-variant`): TrainingCandidate {
  return { ...arch(key), ...patch, id: `arch-${id}` };
}

describe("stepScore and the constants", () => {
  it("scores in range 1.0, one step 0.6, two 0.2, further 0", () => {
    expect(stepScore(0)).toBe(1);
    expect(stepScore(1)).toBe(0.6);
    expect(stepScore(2)).toBe(0.2);
    expect(stepScore(3)).toBe(0);
    expect(stepScore(6)).toBe(0);
  });

  it("carries the plan header's weights and cap", () => {
    expect(WEIGHTS).toEqual({
      sweetness: 1.5,
      tannin: 1.5,
      acidity: 1.5,
      body: 1.2,
      alcohol: 1.0,
      colourHue: 1.0,
      mousse: 1.0,
      noseIntensity: 0.8,
      flavourIntensity: 0.8,
      finish: 0.8,
      development: 0.6,
      appearanceIntensity: 0.6,
      aromas: 2.0,
    });
    expect(CAP_MAX).toBe(15);
  });
});

describe("ladderFor", () => {
  it("uses the full enum order, not the slider's stops", () => {
    expect(ladderFor("appearanceIntensity", arch("margaux"))).toEqual([
      "PALE",
      "MEDIUM_MINUS",
      "MEDIUM",
      "MEDIUM_PLUS",
      "DEEP",
    ]);
    expect(ladderFor("sweetness", arch("margaux"))).toEqual([
      "DRY",
      "OFF_DRY",
      "MEDIUM_DRY",
      "MEDIUM",
      "MEDIUM_SWEET",
      "SWEET",
      "LUSCIOUS",
    ]);
    expect(ladderFor("tannin", arch("margaux"))).toEqual(["LOW", "MEDIUM_MINUS", "MEDIUM", "MEDIUM_PLUS", "HIGH"]);
    expect(ladderFor("development", arch("margaux"))).toEqual([
      "YOUTHFUL",
      "DEVELOPING",
      "FULLY_DEVELOPED",
      "TIRED_PAST_BEST",
    ]);
  });

  it("takes hue from the candidate's colour row", () => {
    expect(ladderFor("colourHue", arch("margaux"))).toEqual(["PURPLE", "RUBY", "GARNET", "TAWNY", "BROWN"]);
    expect(ladderFor("colourHue", arch("chablis"))).toEqual(["LEMON_GREEN", "LEMON", "GOLD", "AMBER", "BROWN"]);
  });

  it("measures unfortified alcohol on three stops and never a fortified one", () => {
    expect(ladderFor("alcohol", arch("margaux"))).toEqual(["LOW", "MEDIUM", "HIGH"]);
    expect(ladderFor("alcohol", arch("vintage-port"))).toBeNull();
  });

  it("matches mousse on sparkling only, and never clarity", () => {
    expect(ladderFor("mousse", arch("champagne"))).toEqual(["DELICATE", "CREAMY", "AGGRESSIVE"]);
    expect(ladderFor("mousse", arch("margaux"))).toBeNull();
    expect(ladderFor("clarity", arch("margaux"))).toBeNull();
  });
});

describe("distance on a single scale", () => {
  // Margaux tannin [MEDIUM_PLUS, HIGH]; only tannin answered, so
  // closeness = 100 · 1.5·s / 1.5 = 100·s.
  it("in range scores 100", () => {
    expect(get(rank({ tannin: "HIGH" }), "margaux").closeness).toBe(100);
  });
  it("one step below scores 60", () => {
    expect(get(rank({ tannin: "MEDIUM" }), "margaux").closeness).toBe(60);
  });
  it("two steps below scores 20", () => {
    expect(get(rank({ tannin: "MEDIUM_MINUS" }), "margaux").closeness).toBe(20);
  });
  it("three steps below scores 0", () => {
    expect(get(rank({ tannin: "LOW" }), "margaux").closeness).toBe(0);
  });

  it("places a bound the slider cannot produce on the full ladder", () => {
    // Appearance [MEDIUM_PLUS, DEEP] (spec §4.4's example): DEEP 1.0, MEDIUM
    // one step below MEDIUM_PLUS 0.6, PALE three steps below 0.
    const c = variant("margaux", { sat: { appearanceIntensity: ["MEDIUM_PLUS", "DEEP"] } });
    expect(get(rank({ appearanceIntensity: "DEEP" }, NONE, [c]), "margaux-variant").closeness).toBe(100);
    expect(get(rank({ appearanceIntensity: "MEDIUM" }, NONE, [c]), "margaux-variant").closeness).toBe(60);
    expect(get(rank({ appearanceIntensity: "PALE" }, NONE, [c]), "margaux-variant").closeness).toBe(0);
  });

  it("measures sweetness across the enum's MEDIUM the slider skips", () => {
    // Vintage Port sweetness [MEDIUM_SWEET, SWEET]: MEDIUM_DRY is index 2,
    // MEDIUM_SWEET index 4 → d = 2 → 0.2 → 20.
    expect(get(rank({ sweetness: "MEDIUM_DRY" }), "vintage-port").closeness).toBe(20);
  });

  it("measures unfortified alcohol on three stops: medium → high is one step", () => {
    // Margaux alcohol [MEDIUM, MEDIUM]; HIGH is one step on LOW/MEDIUM/HIGH → 60.
    expect(get(rank({ alcohol: "HIGH" }), "margaux").closeness).toBe(60);
  });
});

describe("skipped scales", () => {
  it("skips a scale the candidate does not carry (a white with no tannin range)", () => {
    // tannin HIGH + acidity HIGH.
    const r = rank({ tannin: "HIGH", acidity: "HIGH" });
    // Tannin-free white: tannin skipped; acidity [HIGH, HIGH] in range → 1.5/1.5 = 100.
    expect(get(r, "tannin-free-white").closeness).toBe(100);
    // Chablis: acidity [MEDIUM_PLUS, HIGH] 1.5·1 + tannin [LOW, LOW] d4 1.5·0
    // = 1.5 / 3.0 = 0.5 → 50.
    expect(get(r, "chablis").closeness).toBe(50);
  });

  it("skips a scale whose range bound is off its ladder", () => {
    // acidity ["EXTREME", "HIGH"] is not on the level ladder → skipped; only
    // body counts: [MEDIUM_MINUS, MEDIUM] holds MEDIUM → 1.2/1.2 = 100 (with
    // acidity LOW counted it would have been (0 + 1.2) / 2.7 = 44).
    const c = variant("chablis", { sat: { ...arch("chablis").sat, acidity: ["EXTREME", "HIGH"] } });
    expect(get(rank({ acidity: "LOW", body: "MEDIUM" }, NONE, [c]), "chablis-variant").closeness).toBe(100);
  });

  it("skips an answer that is not on the candidate's ladder", () => {
    // MEDIUM_PLUS is not an unfortified alcohol stop; only tannin counts.
    expect(get(rank({ alcohol: "MEDIUM_PLUS", tannin: "HIGH" }), "margaux").closeness).toBe(100);
  });

  it("skips mousse on a still candidate", () => {
    const r = rank({ mousse: "CREAMY" });
    expect(get(r, "champagne").closeness).toBe(100);
    expect(get(r, "margaux").closeness).toBeNull();
  });

  it("gives null with nothing answered, and with only scales the candidate lacks", () => {
    for (const r of rank({})) expect(r.closeness).toBeNull();
    // Only tannin answered: the tannin-free white carries no tannin → null.
    expect(get(rank({ tannin: "HIGH" }), "tannin-free-white").closeness).toBeNull();
  });

  it("ignores clarity, quality, price and readiness (D18)", () => {
    const r = rank({ clarity: "HAZY", qualityScore: 95, priceCategory: "PREMIUM", readiness: "TOO_OLD" });
    for (const x of r) expect(x.closeness).toBeNull();
  });
});

describe("weights", () => {
  it("weighs each scale by §5.3", () => {
    // Margaux: tannin MEDIUM d1 → 1.5·0.6 = 0.9; finish LONG in range → 0.8;
    // appearance PALE vs [MEDIUM, DEEP] on the full ladder d2 → 0.6·0.2 = 0.12.
    // (0.9 + 0.8 + 0.12) / (1.5 + 0.8 + 0.6) = 1.82 / 2.9 = 0.6276 → 63.
    expect(
      get(rank({ tannin: "MEDIUM", finish: "LONG", appearanceIntensity: "PALE" }), "margaux").closeness,
    ).toBe(63);
  });
});

describe("aromas", () => {
  it("credits the share of the taster's groups the archetype carries", () => {
    // Margaux groups {Black fruit, Herbal, Oak, Red wine}. Picked blackberry
    // (Black fruit), vanilla (Oak), grass (Herbaceous): a = 2/3.
    // 2·(2/3) / 2 = 0.667 → 67 (no signature picked: cedar is Margaux's).
    const r = rank({
      noseTermIds: [tid("Black fruit", "blackberry"), tid("Oak", "vanilla")],
      palateTermIds: [tid("Herbaceous", "grass")],
    });
    expect(get(r, "margaux").closeness).toBe(67);
  });

  it("counts a term picked on nose and palate once", () => {
    const t = tid("Black fruit", "blackberry");
    const r = rank({ noseTermIds: [t, tid("Herbaceous", "grass")], palateTermIds: [t] });
    // groups {Black fruit, Herbaceous}; Margaux carries one → a = 1/2 → 50.
    expect(get(r, "margaux").closeness).toBe(50);
  });

  it("skips the aroma term for a candidate with no aromas", () => {
    // acidity HIGH + blackberry.
    const r = rank({ acidity: "HIGH", noseTermIds: [tid("Black fruit", "blackberry")] });
    // Tannin-free white has no aroma links: acidity alone → 100.
    expect(get(r, "tannin-free-white").closeness).toBe(100);
    // Chablis: acidity 1.5 + aromas 2·0 (no Black fruit) = 1.5 / 3.5 = 0.4286 → 43.
    expect(get(r, "chablis").closeness).toBe(43);
  });

  it("ignores a picked term the lexicon does not know", () => {
    const r = rank({ noseTermIds: ["not-a-term"] });
    for (const x of r) expect(x.closeness).toBeNull();
  });
});

describe("signature bonus", () => {
  const riesling = {
    acidity: "HIGH" as const,
    tannin: "MEDIUM" as const,
    noseTermIds: [tid("White wine", "petrol"), tid("Citrus fruit", "lime"), tid("Tropical fruit", "banana")],
  };

  it("adds a full scale's share per hit", () => {
    // Alsace Riesling: acidity [HIGH, HIGH] 1.5·1 = 1.5; tannin MEDIUM vs
    // [LOW, LOW] d2 1.5·0.2 = 0.3; groups {White wine, Citrus fruit, Tropical
    // fruit} vs {Green fruit, Citrus fruit, Stone fruit, White wine, Other}
    // a = 2/3 → 2·(2/3) = 1.333. den = 1.5 + 1.5 + 2 = 5.
    // base = 3.1333 / 5 = 62.67; petrol is a signature → + 100·1/5 = 20
    // → round(82.67) = 83.
    const r = get(rank(riesling), "alsace-riesling");
    expect(r.closeness).toBe(83);
    expect(r.signatureHits).toEqual(["petrol"]);
  });

  it("never lowers anyone: the same note without the flag scores the base", () => {
    const plain = variant("alsace-riesling", {
      aromas: arch("alsace-riesling").aromas.map((a) => ({ ...a, signature: false })),
    });
    // 62.67 → 63 without the bonus; 83 with it.
    const r = get(rank(riesling, NONE, [plain]), "alsace-riesling-variant");
    expect(r.closeness).toBe(63);
    expect(r.signatureHits).toEqual([]);
  });

  it("a missed signature costs nothing", () => {
    // acidity HIGH + lime, no petrol: flagged and unflagged score the same.
    // acidity 1.5 + aromas 2·1 (Citrus fruit is Riesling's) = 3.5 / 3.5 → 100;
    // add tannin MEDIUM (0.3 of 1.5) so it is not at the ceiling:
    // (1.5 + 0.3 + 2) / 5 = 0.76 → 76 either way.
    const n = { acidity: "HIGH" as const, tannin: "MEDIUM" as const, noseTermIds: [tid("Citrus fruit", "lime")] };
    const plain = variant("alsace-riesling", {
      aromas: arch("alsace-riesling").aromas.map((a) => ({ ...a, signature: false })),
    });
    expect(get(rank(n), "alsace-riesling").closeness).toBe(76);
    expect(get(rank(n, NONE, [plain]), "alsace-riesling-variant").closeness).toBe(76);
  });

  it("counts at most two hits", () => {
    // Sancerre with three signatures (gooseberry, grass, blackcurrant leaf).
    const three = variant("sancerre", {
      aromas: arch("sancerre").aromas.map((a) => ({
        ...a,
        signature: ["gooseberry", "grass", "blackcurrant leaf"].includes(a.term),
      })),
    });
    // acidity LOW vs [HIGH, HIGH] d4 → 0; body FULL vs [MEDIUM_MINUS, MEDIUM]
    // d2 → 1.2·0.2 = 0.24; tannin HIGH vs [LOW, LOW] d4 → 0; sweetness LUSCIOUS
    // vs [DRY, DRY] d6 → 0; groups {Green fruit, Herbaceous} both Sancerre's
    // → a = 1 → 2. den = 1.5 + 1.2 + 1.5 + 1.5 + 2 = 7.7; num = 2.24.
    // base 29.09; two hits count → + 200/7.7 = 25.97 → round(55.06) = 55
    // (all three would have given 68).
    const r = get(
      rank(
        {
          acidity: "LOW",
          body: "FULL",
          tannin: "HIGH",
          sweetness: "LUSCIOUS",
          noseTermIds: [
            tid("Green fruit", "gooseberry"),
            tid("Herbaceous", "grass"),
            tid("Herbaceous", "blackcurrant leaf"),
          ],
        },
        NONE,
        [three],
      ),
      "sancerre-variant",
    );
    expect(r.closeness).toBe(55);
    expect(r.signatureHits).toEqual(["gooseberry", "grass", "blackcurrant leaf"]);
  });

  it("caps closeness at 100", () => {
    // acidity HIGH 1.5 + petrol (White wine) a = 1 → 2: 3.5 / 3.5 = 100;
    // + 100/3.5 = 28.6 → 128.6 → capped at 100.
    const r = get(rank({ acidity: "HIGH", noseTermIds: [tid("White wine", "petrol")] }), "alsace-riesling");
    expect(r.closeness).toBe(100);
  });
});

describe("caps (tri-state)", () => {
  it("null extras and no hue never cap", () => {
    for (const r of rank({ tannin: "HIGH" })) expect(r.capped).toBeNull();
  });

  it("bubbles: yes caps non-sparkling, no caps sparkling", () => {
    const yes = rank({}, { bubbles: true, fortified: null });
    expect(get(yes, "champagne").capped).toBeNull();
    expect(get(yes, "margaux").capped).toBe("bubbles");
    const no = rank({}, { bubbles: false, fortified: null });
    expect(get(no, "champagne").capped).toBe("bubbles");
    expect(get(no, "margaux").capped).toBeNull();
  });

  it("fortified: yes caps unfortified, no caps fortified", () => {
    const yes = rank({}, { bubbles: null, fortified: true });
    expect(get(yes, "vintage-port").capped).toBeNull();
    expect(get(yes, "margaux").capped).toBe("fortified");
    const no = rank({}, { bubbles: null, fortified: false });
    expect(get(no, "vintage-port").capped).toBe("fortified");
    expect(get(no, "margaux").capped).toBeNull();
  });

  it("colour: a hue off the candidate's colour row caps it", () => {
    const r = rank({ colourHue: "RUBY" });
    expect(get(r, "chablis").capped).toBe("colour");
    expect(get(r, "margaux").capped).toBeNull();
  });

  it("an ORANGE candidate is uncapped on GOLD; a red one is capped", () => {
    const orange = variant("tannin-free-white", { colour: "ORANGE" }, "orange");
    const r = rank({ colourHue: "GOLD" }, NONE, [orange, arch("margaux")]);
    expect(get(r, "orange").capped).toBeNull();
    expect(get(r, "margaux").capped).toBe("colour");
  });

  it("BROWN fits white and red, not rosé", () => {
    const rose = variant("tannin-free-white", { colour: "ROSE" }, "rose");
    const r = rank({ colourHue: "BROWN" }, NONE, [arch("chablis"), arch("margaux"), rose]);
    expect(get(r, "chablis").capped).toBeNull();
    expect(get(r, "margaux").capped).toBeNull();
    expect(get(r, "rose").capped).toBe("colour");
  });

  it("caps a number at 15 and keeps a null null", () => {
    // Chablis on RUBY + acidity HIGH: hue skipped (off the white row), acidity
    // in range → 100 → capped at 15.
    expect(get(rank({ colourHue: "RUBY", acidity: "HIGH" }), "chablis").closeness).toBe(15);
    // bubbles only: Margaux capped with nothing answered that applies → null.
    const m = get(rank({}, { bubbles: true, fortified: null }), "margaux");
    expect(m.capped).toBe("bubbles");
    expect(m.closeness).toBeNull();
  });

  it("a capped candidate never outranks an uncapped numbered one", () => {
    // RUBY + tannin LOW: Chablis tannin [LOW, LOW] in range → 100 → capped 15
    // (RUBY is off the white row, so hue is skipped for it). Margaux, uncapped:
    // hue RUBY in [RUBY, GARNET] 1.0 + tannin LOW vs [MEDIUM_PLUS, HIGH] d3 0
    // → 1.0 / 2.5 = 0.4 → 40.
    const r = rank({ colourHue: "RUBY", tannin: "LOW" });
    const ids = r.map((x) => x.candidate.id);
    expect(get(r, "margaux").closeness).toBe(40);
    expect(get(r, "chablis").closeness).toBe(15);
    expect(ids.indexOf("arch-margaux")).toBeLessThan(ids.indexOf("arch-chablis"));
    const firstCapped = r.findIndex((x) => x.capped !== null);
    expect(r.slice(firstCapped).every((x) => x.capped !== null)).toBe(true);
  });
});

describe("fortification skips alcohol both ways (D19)", () => {
  it("a fortified candidate never scores alcohol", () => {
    // Port: alcohol LOW skipped; sweetness SWEET in [MEDIUM_SWEET, SWEET] → 100.
    expect(get(rank({ alcohol: "LOW", sweetness: "SWEET" }), "vintage-port").closeness).toBe(100);
  });

  it("a note that says fortified skips alcohol on every candidate", () => {
    // Margaux, fortified true: alcohol HIGH skipped, tannin HIGH in range →
    // 100 → capped (not fortified) at 15.
    const yes = get(rank({ alcohol: "HIGH", tannin: "HIGH" }, { bubbles: null, fortified: true }), "margaux");
    expect(yes.capped).toBe("fortified");
    expect(yes.closeness).toBe(15);
    // fortified false: alcohol HIGH vs [MEDIUM, MEDIUM] d1 → 0.6; tannin 1.5
    // → (1.5 + 0.6) / 2.5 = 0.84 → 84.
    const no = get(rank({ alcohol: "HIGH", tannin: "HIGH" }, { bubbles: null, fortified: false }), "margaux");
    expect(no.capped).toBeNull();
    expect(no.closeness).toBe(84);
  });
});

describe("explanations (§5.7)", () => {
  it("is null before anything that applies is answered", () => {
    for (const r of rank({})) expect(r.explanation).toBeNull();
  });

  it("explains every cap", () => {
    expect(get(rank({ colourHue: "RUBY" }), "chablis").explanation).toBe("Looks like a red wine, not a white");
    expect(get(rank({}, { bubbles: true, fortified: null }), "margaux").explanation).toBe("Bubbles noted");
    expect(get(rank({}, { bubbles: false, fortified: null }), "champagne").explanation).toBe("No bubbles noted");
    expect(get(rank({}, { bubbles: null, fortified: true }), "margaux").explanation).toBe("Fortified");
    expect(get(rank({}, { bubbles: null, fortified: false }), "vintage-port").explanation).toBe("Not fortified");
    const rose = variant("tannin-free-white", { colour: "ROSE" }, "rose");
    expect(get(rank({ colourHue: "BROWN" }, NONE, [rose]), "rose").explanation).toBe(
      "Looks like a white or red wine, not a rosé",
    );
    const orange = variant("tannin-free-white", { colour: "ORANGE" }, "orange");
    expect(get(rank({ colourHue: "RUBY" }, NONE, [orange]), "orange").explanation).toBe(
      "Looks like a red wine, not an orange",
    );
  });

  it("names the largest scale loss and its direction", () => {
    // Riesling note above: tannin loss 1.5·(1 − 0.2) = 1.2 beats aromas 2·(1/3) = 0.67.
    const r = rank({
      acidity: "HIGH",
      tannin: "MEDIUM",
      noseTermIds: [tid("White wine", "petrol"), tid("Citrus fruit", "lime"), tid("Tropical fruit", "banana")],
    });
    expect(get(r, "alsace-riesling").explanation).toBe("Tannin higher than typical");
    expect(get(rank({ tannin: "LOW" }), "margaux").explanation).toBe("Tannin lower than typical");
  });

  it("words hue as darker or lighter", () => {
    // Margaux [RUBY, GARNET] on the red row: BROWN d2 (loss 0.8) → darker;
    // PURPLE d1 (loss 0.4) → lighter.
    expect(get(rank({ colourHue: "BROWN" }), "margaux").explanation).toBe("Colour darker than typical");
    expect(get(rank({ colourHue: "PURPLE" }), "margaux").explanation).toBe("Colour lighter than typical");
  });

  it("names the taster's missing group with the most picked terms", () => {
    // Margaux: grass + green bell pepper (Herbaceous ×2), banana (Tropical
    // fruit ×1), blackcurrant (Black fruit, Margaux's): a = 1/3, loss 1.33.
    const r = rank({
      noseTermIds: [
        tid("Herbaceous", "grass"),
        tid("Herbaceous", "green bell pepper"),
        tid("Tropical fruit", "banana"),
        tid("Black fruit", "blackcurrant"),
      ],
    });
    expect(get(r, "margaux").explanation).toBe("Herbaceous isn't typical");
  });

  it("below 0.3: a signature hit, else 'Fits what you've said so far'", () => {
    // acidity HIGH + petrol on Riesling: no loss at all, petrol hit.
    expect(
      get(rank({ acidity: "HIGH", noseTermIds: [tid("White wine", "petrol")] }), "alsace-riesling").explanation,
    ).toBe("✓ petrol — a signature");
    expect(get(rank({ tannin: "HIGH" }), "margaux").explanation).toBe("Fits what you've said so far");
    // development FULLY_DEVELOPED vs [YOUTHFUL, DEVELOPING]: d1, loss
    // 0.6·0.4 = 0.24 < 0.3 → still "fits" (closeness 0.36/0.6 = 60).
    const dev = get(rank({ development: "FULLY_DEVELOPED" }), "margaux");
    expect(dev.closeness).toBe(60);
    expect(dev.explanation).toBe("Fits what you've said so far");
    // nose PRONOUNCED vs [MEDIUM, MEDIUM_PLUS]: d1, loss 0.8·0.4 = 0.32 ≥ 0.3.
    expect(get(rank({ noseIntensity: "PRONOUNCED" }), "margaux").explanation).toBe(
      "Nose intensity higher than typical",
    );
  });

  it("explain() is pure over its inputs", () => {
    const c = arch("margaux");
    expect(
      explain({ candidate: c, closeness: null, capped: null, signatureHits: [], losses: [], aromaLoss: null }),
    ).toBeNull();
    expect(
      explain({
        candidate: c,
        closeness: 40,
        capped: null,
        signatureHits: ["cedar"],
        losses: [{ scale: "body", loss: 0.96, direction: "lower" }],
        aromaLoss: { loss: 1.0, group: "Tropical fruit" },
      }),
    ).toBe("Tropical fruit isn't typical");
    // A tie goes to the scale seen first.
    expect(
      explain({
        candidate: c,
        closeness: 40,
        capped: null,
        signatureHits: [],
        losses: [
          { scale: "acidity", loss: 0.6, direction: "higher" },
          { scale: "tannin", loss: 0.6, direction: "lower" },
        ],
        aromaLoss: null,
      }),
    ).toBe("Acidity higher than typical");
    expect(
      explain({
        candidate: c,
        closeness: 90,
        capped: null,
        signatureHits: ["cedar"],
        losses: [{ scale: "body", loss: 0.24, direction: "lower" }],
        aromaLoss: null,
      }),
    ).toBe("✓ cedar — a signature");
  });
});

describe("order (§5.8)", () => {
  it("before any answer: grouped by country, then name", () => {
    const names = rank({}).map((r) => r.candidate.name);
    expect(names[0]).toBe("A typical Tannin-free White"); // Austria
    expect(names[1]).toBe("A typical Alsace Riesling"); // France, first by name
    expect(names[names.length - 2]).toBe("A typical Vosne-Romanée"); // France, last
    expect(names[names.length - 1]).toBe("A typical Vintage Port"); // Portugal
  });

  it("ranks a left-bank claret note: Margaux first, then by closeness", () => {
    // Every scale answered + blackcurrant/cedar/tobacco on the nose and
    // blackcurrant/leather on the palate. Σw over the 11 scales = 11.3,
    // + aromas 2 = 13.3 (Port skips alcohol: 12.3).
    const r = rank({
      appearanceIntensity: "DEEP",
      colourHue: "GARNET",
      noseIntensity: "MEDIUM",
      development: "DEVELOPING",
      sweetness: "DRY",
      acidity: "MEDIUM_PLUS",
      tannin: "HIGH",
      alcohol: "MEDIUM",
      body: "FULL",
      flavourIntensity: "MEDIUM",
      finish: "LONG",
      noseTermIds: [tid("Black fruit", "blackcurrant"), tid("Oak", "cedar"), tid("Red wine", "tobacco")],
      palateTermIds: [tid("Black fruit", "blackcurrant"), tid("Red wine", "leather")],
    });
    // Margaux: every scale in range, groups {Black fruit, Oak, Red wine} all
    // its own → 13.3/13.3 → 100 (+ cedar, capped at 100).
    // Côte-Rôtie: hue GARNET vs [PURPLE, RUBY] d1 (−0.4), nose and flavour
    // MEDIUM vs [MEDIUM_PLUS, …] d1 (−0.32 each), aromas a = 1:
    // (11.3 − 1.04 + 2) / 13.3 = 12.26 / 13.3 = 0.9218 → 92.
    // Bandol: nose, flavour d1 (−0.64), no Oak → a = 2/3:
    // (11.3 − 0.64 + 1.333) / 13.3 = 0.9018 → 90.
    // Châteauneuf: nose, flavour d1 (−0.64), acidity MEDIUM_PLUS vs
    // [MEDIUM_MINUS, MEDIUM] d1 (−0.6), tannin HIGH vs [MEDIUM, MEDIUM_PLUS]
    // d1 (−0.6), a = 2/3: (11.3 − 1.84 + 1.333) / 13.3 = 0.8115 → 81.
    // Vintage Port (alcohol skipped): nose d1 (−0.32), sweetness DRY vs
    // [MEDIUM_SWEET, SWEET] d4 (−1.5), flavour MEDIUM vs [PRONOUNCED] d2
    // (−0.64), a = 1: (10.3 − 2.46 + 2) / 12.3 = 9.84 / 12.3 = 0.8 → 80.
    expect(r.slice(0, 5).map((x) => [x.candidate.name, x.closeness])).toEqual([
      ["A typical Margaux", 100],
      ["A typical Côte-Rôtie", 92],
      ["A typical Bandol", 90],
      ["A typical Châteauneuf-du-Pape", 81],
      ["A typical Vintage Port", 80],
    ]);
    expect(get(r, "cote-rotie").explanation).toBe("Colour darker than typical");
    expect(get(r, "bandol").explanation).toBe("Oak isn't typical");
    expect(get(r, "vintage-port").explanation).toBe("Sweetness lower than typical");
    // GARNET caps every white; they close the list.
    const whites = r.filter((x) => x.candidate.colour === "WHITE");
    expect(whites.every((x) => x.capped === "colour")).toBe(true);
    expect(r.slice(-whites.length).every((x) => x.candidate.colour === "WHITE")).toBe(true);
  });

  it("breaks a tie by short name", () => {
    const beta = variant("margaux", { name: "A typical Beta" }, "beta");
    const alpha = variant("margaux", { name: "A typical Alpha" }, "alpha");
    const r = rank({ tannin: "HIGH" }, NONE, [beta, alpha]);
    expect(r.map((x) => x.candidate.name)).toEqual(["A typical Alpha", "A typical Beta"]);
  });

  it("puts capped nulls after capped numbers", () => {
    // RUBY + acidity HIGH: tannin-free white capped with 100 → 15; a white
    // with no acidity range (Chablis without sat) stays null, capped.
    const bare = variant("chablis", { sat: {} }, "bare");
    const r = rank({ colourHue: "RUBY", acidity: "HIGH" }, NONE, [bare, arch("tannin-free-white")]);
    expect(r.map((x) => [x.candidate.id, x.closeness])).toEqual([
      ["arch-tannin-free-white", 15],
      ["arch-bare", null],
    ]);
  });
});

describe("snapshotRanking", () => {
  it("freezes the whole list with 1-based ranks", () => {
    const r = rank({ colourHue: "RUBY", tannin: "LOW" });
    const s = snapshotRanking(r);
    expect(s).toHaveLength(POOL.length);
    expect(s.map((x) => x.rank)).toEqual(POOL.map((_, i) => i + 1));
    expect(s[0]).toEqual({
      archetypeId: r[0].candidate.id,
      name: r[0].candidate.name,
      closeness: r[0].closeness,
      rank: 1,
      capped: null,
    });
    const chablis = s.find((x) => x.archetypeId === "arch-chablis");
    expect(chablis).toEqual({
      archetypeId: "arch-chablis",
      name: "A typical Chablis",
      closeness: 15,
      rank: s.findIndex((x) => x.archetypeId === "arch-chablis") + 1,
      capped: "colour",
    });
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `cd /c/Users/Public/repos/blindtastingapp-training && npx vitest run src/lib/training/match.test.ts`
Expected: FAIL. `Failed to resolve import "./match" from "src/lib/training/match.test.ts"`.

- [ ] **Step 3: Write `match.ts`**

Create `src/lib/training/match.ts`:

```ts
// The training room's matcher (spec 2026-09-25-training-room-design.md §5):
// every archetype keeps a closeness score over the fields the taster has
// answered so far, and the list is sorted by it — ranking, never filtering
// (D3). Pure: relative imports only, no React, no DB, so vitest loads it and
// the room re-ranks on the device on every change (D6).
import type { WineColour, WsetNoteState } from "../wset/types";
import {
  ALCOHOL_STOPS,
  BODY_STOPS,
  DEVELOPMENT_STOPS,
  FINISH_STOPS,
  HUES_BY_COLOUR,
  INTENSITY_STOPS,
  LEVEL_STOPS,
  colourFromHue,
} from "../wset/vocab";
import {
  TRAINING_COPY,
  capReasonLine,
  groupLossLine,
  scaleLossLine,
  shortName,
  signatureLine,
} from "./copy";
import type {
  AromaLexicon,
  CapReason,
  MatchExtras,
  RankedCandidate,
  RankingSnapshot,
  TrainingCandidate,
} from "./types";

/** The matched sat keys, in the order the explanation's tie-break walks them
    (spec §4.4). clarity is stored on the live rows and never matched (D18). */
export const MATCHED_SCALES = [
  "appearanceIntensity",
  "colourHue",
  "noseIntensity",
  "development",
  "sweetness",
  "acidity",
  "tannin",
  "alcohol",
  "body",
  "mousse",
  "flavourIntensity",
  "finish",
] as const;
export type MatchedScale = (typeof MATCHED_SCALES)[number];

/** Spec §5.3. `aromas` is the group-agreement term. */
export const WEIGHTS: Record<MatchedScale | "aromas", number> = {
  sweetness: 1.5,
  tannin: 1.5,
  acidity: 1.5,
  body: 1.2,
  alcohol: 1.0,
  colourHue: 1.0,
  mousse: 1.0,
  noseIntensity: 0.8,
  flavourIntensity: 0.8,
  finish: 0.8,
  development: 0.6,
  appearanceIntensity: 0.6,
  aromas: 2.0,
};

/** Each exact signature hit adds this, at most SIGNATURE_MAX_HITS times — a
    pure bonus that never enters the denominator (D5). */
export const SIGNATURE_BONUS = 1.0;
export const SIGNATURE_MAX_HITS = 2;

/** A contradicted colour, bubbles or fortification caps closeness here (D3). */
export const CAP_MAX = 15;

/** Below this largest weighted loss the explanation praises instead (§5.7). */
export const EXPLAIN_THRESHOLD = 0.3;

// Full enum orders (spec §4.4, "since the critique"): the note sliders offer
// fewer stops on some scales (appearance: PALE / MEDIUM / DEEP; sweetness has
// no MEDIUM), but a range bound may be any enum value, so distance is taken on
// the whole enum. Kept in lockstep with the string unions in ../wset/types.
const APPEARANCE_LADDER = ["PALE", "MEDIUM_MINUS", "MEDIUM", "MEDIUM_PLUS", "DEEP"];
const SWEETNESS_LADDER = [
  "DRY",
  "OFF_DRY",
  "MEDIUM_DRY",
  "MEDIUM",
  "MEDIUM_SWEET",
  "SWEET",
  "LUSCIOUS",
];
const MOUSSE_LADDER = ["DELICATE", "CREAMY", "AGGRESSIVE"];

/**
 * The ladder a scale is measured on for this candidate, or null when the scale
 * is not matched for it: clarity and unknown keys; alcohol on a FORTIFIED
 * candidate (D19: never a distance); mousse on anything but SPARKLING. Hue is
 * the candidate colour's own hue row; unfortified alcohol is ALCOHOL_STOPS
 * (three steps, so medium → high is one step).
 */
export function ladderFor(scale: string, candidate: TrainingCandidate): string[] | null {
  switch (scale) {
    case "appearanceIntensity":
      return APPEARANCE_LADDER;
    case "colourHue":
      return HUES_BY_COLOUR[candidate.colour];
    case "noseIntensity":
    case "flavourIntensity":
      return INTENSITY_STOPS;
    case "development":
      return DEVELOPMENT_STOPS;
    case "sweetness":
      return SWEETNESS_LADDER;
    case "acidity":
    case "tannin":
      return LEVEL_STOPS;
    case "alcohol":
      return candidate.style === "FORTIFIED" ? null : ALCOHOL_STOPS;
    case "body":
      return BODY_STOPS;
    case "finish":
      return FINISH_STOPS;
    case "mousse":
      return candidate.style === "SPARKLING" ? MOUSSE_LADDER : null;
    default:
      return null;
  }
}

/** s(d): in range 1.0, one step out 0.6, two 0.2, further 0 (D4). */
export function stepScore(d: number): number {
  if (d <= 0) return 1;
  if (d === 1) return 0.6;
  if (d === 2) return 0.2;
  return 0;
}

// Steps from `value` to the nearer bound of [lo, hi] on `ladder`, and which
// bound was exceeded; null when the value or either bound is off the ladder
// (the scale is then skipped for this candidate, spec §4.4).
function distance(
  ladder: readonly string[],
  value: string,
  range: readonly [string, string],
): { d: number; direction: "higher" | "lower" | null } | null {
  const v = ladder.indexOf(value);
  const a = ladder.indexOf(range[0]);
  const b = ladder.indexOf(range[1]);
  if (v < 0 || a < 0 || b < 0) return null;
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  if (v < lo) return { d: lo - v, direction: "lower" };
  if (v > hi) return { d: v - hi, direction: "higher" };
  return { d: 0, direction: null };
}

function capFor(note: WsetNoteState, extras: MatchExtras, c: TrainingCandidate): CapReason | null {
  if (note.colourHue !== null && !HUES_BY_COLOUR[c.colour].includes(note.colourHue)) {
    return "colour";
  }
  if (
    (extras.bubbles === true && c.style !== "SPARKLING") ||
    (extras.bubbles === false && c.style === "SPARKLING")
  ) {
    return "bubbles";
  }
  if (
    (extras.fortified === true && c.style !== "FORTIFIED") ||
    (extras.fortified === false && c.style === "FORTIFIED")
  ) {
    return "fortified";
  }
  return null;
}

/**
 * The one explanation line of a candidate row (spec §5.7). A capped candidate
 * explains its cap. Otherwise null when nothing answered applies; else the
 * largest weighted loss (the first in MATCHED_SCALES order on a tie, aromas
 * after every scale) names a scale direction or the taster's aroma group the
 * archetype lacks; below EXPLAIN_THRESHOLD a signature hit reads
 * "✓ {term} — a signature" and no hit "Fits what you've said so far".
 * `noteColour` is `colourFromHue(note.colourHue)`, for the colour cap line.
 */
export function explain(input: {
  candidate: TrainingCandidate;
  closeness: number | null;
  capped: CapReason | null;
  signatureHits: string[];
  losses: { scale: string; loss: number; direction: "higher" | "lower" | null }[];
  aromaLoss: { loss: number; group: string | null } | null;
  noteColour?: WineColour | null;
}): string | null {
  const { candidate, capped } = input;
  if (capped !== null) {
    return capReasonLine(capped, {
      noteColour: input.noteColour ?? null,
      candidateColour: candidate.colour,
      candidateStyle: candidate.style,
    });
  }
  if (input.losses.length === 0 && input.aromaLoss === null) return null;
  let top: { kind: "scale"; scale: string; loss: number; direction: "higher" | "lower" | null } | {
    kind: "aroma";
    loss: number;
    group: string | null;
  } | null = null;
  for (const l of input.losses) {
    if (top === null || l.loss > top.loss) top = { kind: "scale", ...l };
  }
  if (input.aromaLoss && (top === null || input.aromaLoss.loss > top.loss)) {
    top = { kind: "aroma", ...input.aromaLoss };
  }
  if (top === null || top.loss < EXPLAIN_THRESHOLD) {
    return input.signatureHits.length > 0
      ? signatureLine(input.signatureHits[0])
      : TRAINING_COPY.fitsSoFar;
  }
  if (top.kind === "aroma") {
    return top.group ? groupLossLine(top.group) : TRAINING_COPY.fitsSoFar;
  }
  // A loss ≥ 0.3 always comes from a distance > 0, so direction is set.
  return top.direction ? scaleLossLine(top.scale, top.direction) : TRAINING_COPY.fitsSoFar;
}

function scoreOne(
  note: WsetNoteState,
  extras: MatchExtras,
  c: TrainingCandidate,
  lexicon: AromaLexicon,
  noteTermIds: string[],
): RankedCandidate {
  let num = 0;
  let den = 0;
  const losses: { scale: string; loss: number; direction: "higher" | "lower" | null }[] = [];

  for (const scale of MATCHED_SCALES) {
    const value = note[scale];
    if (value === null) continue;
    // D19: fortification is never a distance — skip alcohol on either side.
    if (scale === "alcohol" && (extras.fortified === true || c.style === "FORTIFIED")) continue;
    const range = c.sat[scale];
    if (!range) continue; // a scale the archetype does not carry leaves both sums
    const ladder = ladderFor(scale, c);
    if (!ladder) continue;
    const dist = distance(ladder, value, range);
    if (!dist) continue; // off-ladder hue, bound or answer: skipped
    const w = WEIGHTS[scale];
    const s = stepScore(dist.d);
    num += w * s;
    den += w;
    losses.push({ scale, loss: w * (1 - s), direction: dist.direction });
  }

  // Aromas (§5.5): the share of the taster's groups the archetype also carries.
  let aromaLoss: { loss: number; group: string | null } | null = null;
  const perGroup = new Map<string, number>();
  for (const id of noteTermIds) {
    const entry = lexicon[id];
    if (entry) perGroup.set(entry.group, (perGroup.get(entry.group) ?? 0) + 1);
  }
  if (perGroup.size > 0 && c.aromas.length > 0) {
    const archGroups = new Set(c.aromas.map((a) => a.group));
    const shared = [...perGroup.keys()].filter((g) => archGroups.has(g)).length;
    const a = shared / perGroup.size;
    num += WEIGHTS.aromas * a;
    den += WEIGHTS.aromas;
    // The taster's group the archetype lacks with the most picked terms;
    // ties by group name.
    const missing = [...perGroup.entries()]
      .filter(([g]) => !archGroups.has(g))
      .sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0], "en"));
    aromaLoss = { loss: WEIGHTS.aromas * (1 - a), group: missing[0]?.[0] ?? null };
  }

  // Signature hits: the taster's exact term ids ∩ the archetype's signature
  // terms, each term once, in the archetype's aroma order.
  const picked = new Set(noteTermIds);
  const hitIds = new Set<string>();
  const signatureHits: string[] = [];
  for (const a of c.aromas) {
    if (a.signature && picked.has(a.termId) && !hitIds.has(a.termId)) {
      hitIds.add(a.termId);
      signatureHits.push(a.term);
    }
  }
  const bonus = SIGNATURE_BONUS * Math.min(signatureHits.length, SIGNATURE_MAX_HITS);

  let closeness: number | null =
    den === 0 ? null : Math.min(100, Math.round((100 * (num + bonus)) / den));
  const capped = capFor(note, extras, c);
  if (capped !== null && closeness !== null) closeness = Math.min(closeness, CAP_MAX);

  const explanation = explain({
    candidate: c,
    closeness,
    capped,
    signatureHits,
    losses,
    aromaLoss,
    noteColour: colourFromHue(note.colourHue),
  });
  return { candidate: c, closeness, capped, explanation, signatureHits };
}

function byName(a: TrainingCandidate, b: TrainingCandidate): number {
  return shortName(a.name).localeCompare(shortName(b.name), "en") || a.id.localeCompare(b.id);
}

// §5.8: uncapped with a number (closeness desc), then uncapped nulls
// (country, then name), then capped (closeness desc, nulls last); ties by
// shortName, then id so the order is total.
function bucket(r: RankedCandidate): number {
  if (r.capped !== null) return 2;
  return r.closeness === null ? 1 : 0;
}

function compareRanked(x: RankedCandidate, y: RankedCandidate): number {
  const bx = bucket(x);
  const by = bucket(y);
  if (bx !== by) return bx - by;
  if (bx === 1) {
    return (
      x.candidate.country.name.localeCompare(y.candidate.country.name, "en") ||
      byName(x.candidate, y.candidate)
    );
  }
  if (x.closeness !== y.closeness) {
    if (x.closeness === null) return 1;
    if (y.closeness === null) return -1;
    return y.closeness - x.closeness;
  }
  return byName(x.candidate, y.candidate);
}

/** Every candidate, scored and sorted (spec §5). Nothing is removed (D3). */
export function rankCandidates(
  note: WsetNoteState,
  extras: MatchExtras,
  pool: TrainingCandidate[],
  lexicon: AromaLexicon,
): RankedCandidate[] {
  const noteTermIds = [...new Set([...note.noseTermIds, ...note.palateTermIds])];
  return pool
    .map((c) => scoreOne(note, extras, c, lexicon, noteTermIds))
    .sort(compareRanked);
}

/** The whole ranking, frozen for the attempt (spec §5.8): rank is 1-based. */
export function snapshotRanking(ranked: RankedCandidate[]): RankingSnapshot {
  return ranked.map((r, i) => ({
    archetypeId: r.candidate.id,
    name: r.candidate.name,
    closeness: r.closeness,
    rank: i + 1,
    capped: r.capped,
  }));
}
```

- [ ] **Step 4: Run it and see it pass**

Run: `cd /c/Users/Public/repos/blindtastingapp-training && npx vitest run src/lib/training/match.test.ts`
Expected: PASS, **51 tests**. If one of the worked numbers is off, recompute it by hand from the comment before touching `match.ts`: the comment is the spec's arithmetic.

- [ ] **Step 5: Run every training test, type-check and lint**

Run: `cd /c/Users/Public/repos/blindtastingapp-training && npx vitest run src/lib/training && npx tsc --noEmit && npx eslint src/lib/training`
Expected: 4 files, **96 tests** pass (copy 28, history-math 7, draft 10, match 51). tsc exits 0, and eslint prints nothing.

- [ ] **Step 6: Commit**

```bash
cd /c/Users/Public/repos/blindtastingapp-training && git add src/lib/training/match.ts src/lib/training/match.test.ts && GIT_AUTHOR_NAME=christianolin GIT_AUTHOR_EMAIL=christianolin@users.noreply.github.com GIT_COMMITTER_NAME=christianolin GIT_COMMITTER_EMAIL=christianolin@users.noreply.github.com git commit -m "feat(training): the matcher — ladders, weights, caps, explanations and the ranking snapshot" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: The note payload builders, extracted from NoteEditor

**Files:**
- Modify: `src/lib/wset/note-state.ts` (import after line 2; append after line 67, the end of `noteStateFromRow`)
- Test: `src/lib/wset/note-state.test.ts` (new)
- Modify: `src/app/catalog/[wineId]/notes/note-editor.tsx` (imports after line 7; replace lines 62–95)

**Interfaces:**
- Consumes: `WsetNoteState` (`src/lib/wset/types.ts`), `NoteContextKind` (`src/lib/wset/queries.ts`, a type-only import; `queries.ts` already imports `note-state.ts`, and the cycle is erased at runtime).
- Produces (Tasks 9 and 10 build `FinishInput.note` / `.aromas` with these):
  - `noteToPayload(state: WsetNoteState, ids: { catalogWineId: string | null; unidentifiedWineId?: string | null; contextKind: NoteContextKind | null; tastingWineId: string | null }): Record<string, unknown>` returns exactly the 27 keys `save_wset_note` reads.
  - `aromasToPayload(state: WsetNoteState): { term_id: string; sensed_on_nose: boolean; sensed_on_palate: boolean }[]`
- Behaviour kept: NoteEditor sends the same values as before. The one new key, `unidentified_wine_id: null`, is read by the RPC exactly as an absent key: `(p_note->>'unidentified_wine_id')::uuid` is null either way.

- [ ] **Step 1: Write the failing payload test**

Create `src/lib/wset/note-state.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { aromasToPayload, emptyNoteState, noteToPayload } from "./note-state";
import type { WsetNoteState } from "./types";

// The keys save_wset_note reads from p_note (its live body, recreated in
// supabase/migrations/20260914094500_hidden_glass_notes.sql: every
// `p_note->>'…'` / `p_note->'…'`), which record_training_attempt passes on.
// A key the client spells differently is silently dropped by the RPC, so the
// set must match exactly.
const RPC_NOTE_KEYS = [
  "id",
  "catalog_wine_id",
  "unidentified_wine_id",
  "context_kind",
  "tasting_wine_id",
  "tasted_on",
  "clarity",
  "appearance_intensity",
  "colour_hue",
  "observations",
  "condition",
  "faults",
  "nose_intensity",
  "development",
  "sweetness",
  "acidity",
  "tannin",
  "tannin_nature",
  "alcohol",
  "body",
  "mousse",
  "flavour_intensity",
  "finish",
  "quality_score",
  "price_category",
  "readiness",
  "taster_notes",
];

const RATED: WsetNoteState = {
  id: "note-1",
  tastedOn: "2026-09-24",
  clarity: "CLEAR",
  appearanceIntensity: "DEEP",
  colourHue: "GARNET",
  observations: ["LEGS_TEARS"],
  condition: "CLEAN",
  faults: [],
  noseIntensity: "MEDIUM_PLUS",
  development: "DEVELOPING",
  sweetness: "DRY",
  acidity: "MEDIUM_PLUS",
  tannin: "HIGH",
  tanninNature: ["FINE_GRAINED"],
  alcohol: "MEDIUM",
  body: "FULL",
  mousse: null,
  flavourIntensity: "MEDIUM_PLUS",
  finish: "LONG",
  qualityScore: 93,
  priceCategory: "PREMIUM",
  readiness: "NEEDS_TIME",
  tasterNotes: "cedar, pencil shavings",
  noseTermIds: ["t-blackcurrant", "t-cedar"],
  palateTermIds: ["t-cedar", "t-leather"],
};

describe("noteToPayload", () => {
  it("spells exactly the keys save_wset_note reads", () => {
    const p = noteToPayload(emptyNoteState(), { catalogWineId: null, contextKind: "TRAINING", tastingWineId: null });
    expect(Object.keys(p).sort()).toEqual([...RPC_NOTE_KEYS].sort());
  });

  it("maps every sheet field to its column", () => {
    expect(
      noteToPayload(RATED, { catalogWineId: "wine-1", contextKind: "BLIND", tastingWineId: "glass-1" }),
    ).toEqual({
      id: "note-1",
      catalog_wine_id: "wine-1",
      unidentified_wine_id: null,
      context_kind: "BLIND",
      tasting_wine_id: "glass-1",
      tasted_on: "2026-09-24",
      clarity: "CLEAR",
      appearance_intensity: "DEEP",
      colour_hue: "GARNET",
      observations: ["LEGS_TEARS"],
      condition: "CLEAN",
      faults: [],
      nose_intensity: "MEDIUM_PLUS",
      development: "DEVELOPING",
      sweetness: "DRY",
      acidity: "MEDIUM_PLUS",
      tannin: "HIGH",
      tannin_nature: ["FINE_GRAINED"],
      alcohol: "MEDIUM",
      body: "FULL",
      mousse: null,
      flavour_intensity: "MEDIUM_PLUS",
      finish: "LONG",
      quality_score: 93,
      price_category: "PREMIUM",
      readiness: "NEEDS_TIME",
      taster_notes: "cedar, pencil shavings",
    });
  });

  it("passes an unidentified wine and a null context through", () => {
    const p = noteToPayload(RATED, {
      catalogWineId: null,
      unidentifiedWineId: "unid-1",
      contextKind: null,
      tastingWineId: null,
    });
    expect(p.unidentified_wine_id).toBe("unid-1");
    expect(p.context_kind).toBeNull();
    expect(p.catalog_wine_id).toBeNull();
  });
});

describe("aromasToPayload", () => {
  it("unions nose and palate ids, each once, flagged where sensed", () => {
    expect(aromasToPayload(RATED)).toEqual([
      { term_id: "t-blackcurrant", sensed_on_nose: true, sensed_on_palate: false },
      { term_id: "t-cedar", sensed_on_nose: true, sensed_on_palate: true },
      { term_id: "t-leather", sensed_on_nose: false, sensed_on_palate: true },
    ]);
  });

  it("is empty for a note with no aromas", () => {
    expect(aromasToPayload(emptyNoteState())).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `cd /c/Users/Public/repos/blindtastingapp-training && npx vitest run src/lib/wset/note-state.test.ts`
Expected: FAIL, 5 tests, each with a TypeError saying `noteToPayload` (or `aromasToPayload`) is not a function.

- [ ] **Step 3: Add the builders to `note-state.ts`**

In `src/lib/wset/note-state.ts`, replace lines 1–2:

```ts
import type { Database } from "@/lib/supabase/database.types";
import type { WsetNoteState } from "./types";
```

with:

```ts
import type { Database } from "@/lib/supabase/database.types";
import type { NoteContextKind } from "./queries";
import type { WsetNoteState } from "./types";
```

and append after the last line (the closing `}` of `noteStateFromRow`):

```ts
// The p_note payload save_wset_note reads (and record_training_attempt passes
// on), built from sheet state: camelCase state to the RPC's snake_case keys.
// The one place those keys are spelled on the client: NoteEditor and the
// training room both call it (training-room spec §7.2). A null contextKind
// keeps an existing note's context on update and means OPEN on insert (the
// RPC's coalesce); unidentifiedWineId defaults to null, which the RPC reads
// the same as an absent key.
export function noteToPayload(
  state: WsetNoteState,
  ids: {
    catalogWineId: string | null;
    unidentifiedWineId?: string | null;
    contextKind: NoteContextKind | null;
    tastingWineId: string | null;
  },
): Record<string, unknown> {
  return {
    id: state.id,
    catalog_wine_id: ids.catalogWineId,
    unidentified_wine_id: ids.unidentifiedWineId ?? null,
    context_kind: ids.contextKind,
    tasting_wine_id: ids.tastingWineId,
    tasted_on: state.tastedOn,
    clarity: state.clarity,
    appearance_intensity: state.appearanceIntensity,
    colour_hue: state.colourHue,
    observations: state.observations,
    condition: state.condition,
    faults: state.faults,
    nose_intensity: state.noseIntensity,
    development: state.development,
    sweetness: state.sweetness,
    acidity: state.acidity,
    tannin: state.tannin,
    tannin_nature: state.tanninNature,
    alcohol: state.alcohol,
    body: state.body,
    mousse: state.mousse,
    flavour_intensity: state.flavourIntensity,
    finish: state.finish,
    quality_score: state.qualityScore,
    price_category: state.priceCategory,
    readiness: state.readiness,
    taster_notes: state.tasterNotes,
  };
}

// The p_aromas payload: the union of nose and palate term ids (nose order
// first, each id once), each flagged where it was sensed.
export function aromasToPayload(
  state: WsetNoteState,
): { term_id: string; sensed_on_nose: boolean; sensed_on_palate: boolean }[] {
  const ids = [...new Set([...state.noseTermIds, ...state.palateTermIds])];
  return ids.map((termId) => ({
    term_id: termId,
    sensed_on_nose: state.noseTermIds.includes(termId),
    sensed_on_palate: state.palateTermIds.includes(termId),
  }));
}
```

- [ ] **Step 4: Run it and see it pass**

Run: `cd /c/Users/Public/repos/blindtastingapp-training && npx vitest run src/lib/wset/note-state.test.ts`
Expected: PASS, **5 tests**.

- [ ] **Step 5: Make NoteEditor use them**

In `src/app/catalog/[wineId]/notes/note-editor.tsx`, replace line 7:

```ts
import { NOTES_ARCHIVE_HREF } from "@/lib/wset/note-saved";
```

with:

```ts
import { NOTES_ARCHIVE_HREF } from "@/lib/wset/note-saved";
import { aromasToPayload, noteToPayload } from "@/lib/wset/note-state";
import type { NoteContextKind } from "@/lib/wset/queries";
```

Then replace the payload block inside `onSave`. That block runs from `const pNote = {` (originally line 62) through the `}));` that closes `pAromas` (originally line 95):

```ts
      const pNote = {
        id: state.id,
        catalog_wine_id: wineId,
        context_kind: contextKind,
        tasting_wine_id: tastingWineId,
        tasted_on: state.tastedOn,
        clarity: state.clarity,
        appearance_intensity: state.appearanceIntensity,
        colour_hue: state.colourHue,
        observations: state.observations,
        condition: state.condition,
        faults: state.faults,
        nose_intensity: state.noseIntensity,
        development: state.development,
        sweetness: state.sweetness,
        acidity: state.acidity,
        tannin: state.tannin,
        tannin_nature: state.tanninNature,
        alcohol: state.alcohol,
        body: state.body,
        mousse: state.mousse,
        flavour_intensity: state.flavourIntensity,
        finish: state.finish,
        quality_score: state.qualityScore,
        price_category: state.priceCategory,
        readiness: state.readiness,
        taster_notes: state.tasterNotes,
      };
      const ids = [...new Set([...state.noseTermIds, ...state.palateTermIds])];
      const pAromas = ids.map((termId) => ({
        term_id: termId,
        sensed_on_nose: state.noseTermIds.includes(termId),
        sensed_on_palate: state.palateTermIds.includes(termId),
      }));
```

with:

```ts
      // The payload keys live once, in note-state.ts (noteToPayload /
      // aromasToPayload), shared with the training room. contextKind passes
      // through unchanged: null keeps an existing note's context and means
      // OPEN on insert; the database enum refuses anything else.
      const pNote = noteToPayload(state, {
        catalogWineId: wineId,
        contextKind: contextKind as NoteContextKind | null,
        tastingWineId,
      });
      const pAromas = aromasToPayload(state);
```

Nothing else in the file changes. The 23514 retry below still spreads `{ ...pNote, colour_hue: null }` and tests `pNote.colour_hue !== null`, which works on a `Record<string, unknown>`, and `save_wset_note`'s Args are typed `unknown`.

- [ ] **Step 6: Gates**

Run: `cd /c/Users/Public/repos/blindtastingapp-training && npx vitest run src/lib/wset src/lib/training src/lib/safe-storage.test.ts && npx tsc --noEmit && npx eslint src/lib/wset/note-state.ts src/lib/wset/note-state.test.ts "src/app/catalog/[wineId]/notes/note-editor.tsx"`
Expected: PASS: `src/lib/wset` 10 files / 101 tests (96 existing + the 5 new note-state tests; `aroma-icons.test.ts` reads `public/emoji`, so run it from the worktree root), training 4 files / 96 tests, safe-storage 15, so **212 tests**. tsc exits 0, and eslint prints nothing.

- [ ] **Step 7: Commit**

```bash
cd /c/Users/Public/repos/blindtastingapp-training && git add src/lib/wset/note-state.ts src/lib/wset/note-state.test.ts "src/app/catalog/[wineId]/notes/note-editor.tsx" && GIT_AUTHOR_NAME=christianolin GIT_AUTHOR_EMAIL=christianolin@users.noreply.github.com GIT_COMMITTER_NAME=christianolin GIT_COMMITTER_EMAIL=christianolin@users.noreply.github.com git commit -m "refactor(training): noteToPayload and aromasToPayload shared by NoteEditor and the room" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```
