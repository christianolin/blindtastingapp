# Add-wine v2 — Sonnet 5 label reader, one complete wine, the universal add-wine sheet, flow fixes

Design spec · 2026-09-12 · base `master` at `9258219`

At 9258219 the working tree differs from the commit by one unrelated
`package-lock.json` diff: 42 deleted `libc` lines. That diff is not part of this
work (F.3).

---

## 1. Purpose, sources and the owner's instructions

### 1.1 Purpose

This is one design for four pieces of work. They are built together so that no
part undoes another.

- **Part A — the label reader.** Claude Sonnet 5 replaces FastCork, so every read
  carries a structured appellation.
- **Part B — one complete wine.** One module defines "complete". One resolver turns
  a read into a draft, one rule decides a confident catalog match, and one server
  write path writes. Every client check and every server write calls it.
- **Part C — the universal add-wine sheet.** The Claude Design handoff across every
  entry point:
  - the matrix and `canScan`;
  - read-and-confirm, and partial reads;
  - search, the cellar source, and by hand;
  - the laptop layouts;
  - the cellar, note and catalog destinations;
  - scanning with no destination.
- **Part D — flow fixes outside the sheet.** The confirmed audit defects listed in
  the ledger's D14.
- **Parts E–G.** E is the schema, F is what is left for the owner plus open
  questions, and G is verification.

### 1.2 Sources and precedence

| Source | Path | Role |
|---|---|---|
| Decision ledger (binding) | `.superpowers/add-wine-v2/decisions.md` | D1–D15 and the migrations list |
| Add-wine handoff | `.superpowers/add-wine-v2/handoff-README.md`, `handoff-canvas-text.txt`, `handoff-canvas.dc.html` | The sheet's interaction, copy and visuals across every entry point |
| Flow audit | `.superpowers/add-wine-v2/audit-findings.json` | 55 confirmed findings (`scan-*`, `sources-*`, `byhand-*`, `create-*`, `play-*`, `reveal-*`, `entry-*`) |
| Scan diagnosis | `.superpowers/add-wine-v2/scan-diagnosis.json` | Root causes RC1–RC12, module design, test plan |
| FastCork sample | `.superpowers/add-wine-v2/fastcork-response-sample.json` | Historical only |
| Label test set | `.superpowers/add-wine-v2/label-test-set.json` | 15 real staging label photos, each with the expected producer, country, region, appellation, grape, vintage, colour and style. The live verification set (G.5). |
| Pre-FastCork extractor | `git show 16e5bd6^:src/lib/label-scan/extract.ts` | Field set and field descriptions for D1 |
| Repo rules | `CLAUDE.md`, `AGENTS.md` | Domain rules, the RLS recursion rule, Base UI rules, Anthropic cost rules |

When sources disagree, precedence is (the ledger's order, verbatim):

1. The owner's instructions.
2. One definition of a complete wine, plus the domain rules in CLAUDE.md.
3. The add-wine handoff.
4. The confirmed audit findings and the scan diagnosis.
5. Round-1 code on master (9258219): touch-only camera, the rate destination,
   identical row buttons, producer home region only, the cover photo, the merged
   Taste Blind nav. It stays unless 1–4 say otherwise.

Two reading notes:

- **The scan diagnosis predates Sonnet 5.** D1 supersedes its FastCork-specific
  advice:
  - `splitRegion` / `parseFastCork`;
  - appellation hints mined from `full_wine_name`;
  - `mapWineType`;
  - `persistLabelProfile`;
  - the USD→DKK price.

  Its resolver, completeness, state and write-side causes still apply. Those are
  RC3–RC8, RC10, RC12, and the blend half of RC11.
- **The audit's and diagnosis's line numbers are stale.** They are 15–50 lines off
  at 9258219. Every `file:line` in this spec has been re-anchored to the 9258219
  tree.

### 1.3 The owner's instructions (2026-09-12, verbatim)

- "Let's not use FastCork then, let's use Sonnet 5 since I want appellation all the
  time. But fix all the other scan bugs."
- "We really need this to work and be consistent in its method — a single
  definition of a complete wine is a must."
- "We still have the Anthropic API key locally and on Vercel."
- "Combine this [handoff] with the fixes you have identified and make sure we don't
  do stuff that counters other changes. Make a combined plan and start
  implementing."

These cost rules bind this work. They come from AGENTS.md and from D1's record of the owner's development approval:

- The Anthropic key serves runtime features only; the label scanner is one of them.
- No batch or maintenance work goes through the API: no backfills, and no re-reading the catalog's photos.
- AGENTS.md asks for a cost statement and explicit approval before any programmatic call. D1 holds both for development: about $0.01 per read, and the owner's "it's fine to test anthropic calls. I still have credits available" (2026-09-12).
- Live reads during development belong to the main session only. They verify the reader and the resolver end to end on the label test set, stay within a cap of 30 reads in total, and log every call's token usage (G.5).
- Coding agents make no API calls. vitest and repeated UI checks replay recorded reads through the fixture switch (A.6).

### 1.4 Decision index

| Decision | Subject | Lands in |
|---|---|---|
| D1 | Sonnet 5 label reader; FastCork removed; live test reads | Part A; E.1; G.5 |
| D2 | One definition of a complete wine | B.1–B.4, B.9; the pin test in G.1 |
| D3 | Wine name stays optional | §2.1 row 1; B.3; C.5 A7 |
| D4 | The matrix is one lookup; rate → note | C.2; C.5 C1/C2 |
| D5 | `canScan` | C.3 |
| D6 | One read-and-confirm component; confident match; failed reads | B.6; C.4; C.5 A3/D2b |
| D7 | Partial reads and "Leave it for later" | C.8; E.3 |
| D8 | By hand | B.7; B.8; C.5 A7 |
| D9 | Laptop layouts | C.5 A8, B1–B3, C1, D1 |
| D10 | Search, the cellar source, the in-flight knowledge rule | C.5 A5/A6; C.9 |
| D11 | The cellar draw-down happens at the pour | C.7; E.4 |
| D12 | No destination | C.5 E1/E1b; D.4 |
| D13 | Flight page and entry points | C.5 A1; C.6 |
| D14 | Flow fixes outside the sheet | Part D |
| D15 | Left for the owner | F.1 |

---

## 2. Deviations from the handoff, and why

### 2.1 Deviations

| # | The source says | This spec does | Reason |
|---|---|---|---|
| 1 | A7 marks **Wine name** "required"; the README lists "producer, wine name, vintage, colour" as required. | Wine name is optional everywhere, with the hint "Leave blank if the label has no cuvée name". | **D3.** Migration `20260829215000_wine_name_optional` made the column nullable on purpose. 34 of 101 catalog wines have no name, and many bottles have no cuvée name. Flipping it is one constant, `COMPLETE_WINE_FIELDS` (B.3). |
| 2 | A6 and "What this replaces": "No new backend … writes a movement {quantity: 1, reason: DRANK}", at add time. | Adding a glass to a DRAFT flight records the intent, and Start draws the bottle down. Adding a glass to a running flight draws it down immediately. The checkbox and its copy stay. | **D11.** The copy promises "when we pour it". The add-time draw-down was never given back when a glass was removed or a draft deleted (scan-5, sources-1, create-5, entry-1). This needs an owner-only intent table, `wine_pour_intents`, and two functions (E.4). |
| 3 | The README requires "producer, wine name, vintage, colour"; Style sits in More detail. | Required = `COMPLETE_WINE_FIELDS`: producer, vintage, colour, style, country, region, appellation, primary grape. Colour and Style sit side by side, visible, after Wine name. | **D2 / D8.** These are the `catalog_wines` NOT NULL columns. With Style hidden, sparkling and fortified wines were silently saved as still (byhand-2). |
| 4 | A4b folds Colour into More detail ("Colour, second grape, designation, alcohol, a photo") and labels Grape "confirm". | The form and field order match A7 on every device. Colour and Style sit above the fold, the More detail subline is "Second grape, designation, alcohol, a photo", and the Grape chip reads "you confirm". | **D8:** "same form and order on every device". |
| 5 | The A3 caption: "the near-misses are one tap away. A certain read plus a single match can auto-add". | One match card, no alternates list, an explicit confirm. | **D6.** Handoff decision 1, auto-add, is left to the owner (D15). |
| 6 | E1 and E1b draw no recovery buttons. | E1 and E1b keep "Wrong bottle? Rescan · Search · By hand" above "Where does it go?". | **D6** makes read-and-confirm a single component. RC12 found the chooser had fewer ways out than the confirm panel. |
| 7 | A7 shows the appellation list ordered by region, with "Nothing is selected for you." | Same list and hint, plus an explicit first option: "Just the region", meaning the region's self-named appellation. | **D8.** RC7: appellation is NOT NULL, yet both forms presented it as optional. |
| 8 | "`wine-form.tsx` … becomes this branch. `wines/new/actions.ts` keeps doing the writing." | Delete `wine-form.tsx` and its FormData actions `addWine` / `updateWine`. `/tastings/[id]/wines/new` and the edit page open the sheet's by-hand form. All writes go through the unified path (B.9), which `add-wine/actions.ts` and `tasting-wine-writes.ts` call. | **D2:** "No other 'is it complete' logic may exist". **D13:** one by-hand form everywhere. |
| 9 | A3 and D2b draw only the "READ OK" chip. | A complete read that the model rated low-confidence shows the round-1 chip "CHECK THE READ". | D6 defines only two states: a complete confident read and a partial read. A complete but low-confidence read still needs a signal, and that string already ships (scan-copy.ts:11-18). |
| 10 | D1 lists three additions to the pre-FastCork schema. | Two more fields: `isWineLabel`, and `alcoholPercent` (as printed on the label). | `isWineLabel` turns a photo of something else into D6's failed row, not an empty confirm screen. `alcoholPercent` belongs to D2's draft, to By hand's More detail and to `catalog_wines.alcohol_percent`. FastCork was its only automatic source. |
| 11 | The ledger's migrations list names seven files, and D11 places the intent in `wines.cellar_lot_id`, `wines.consume_on_start` and `wines.cellar_consumption_id`. | Five objects go into two of the listed files; no new file is created. `20260912102000` gets `wines.added_via`, `is_wine_adder()` and `tasting_incomplete_glasses()`. `20260912103000` gets `pour_cellar_lot_into_glass()`, and holds D11's three intent fields in an owner-only table, `wine_pour_intents`, instead of on `wines`. | D13's identity line ends "scanned \| from the catalog \| by hand", which needs a stored source. D7's Start and reveal gates must see incomplete glasses the host does not own, but drafts are owner-only. A bring-your-own contributor cannot update `wines` under the host-only update policy (init_schema.sql:389-391), so pouring into a running flight needs a SECURITY DEFINER function. The intent cannot live on `wines`. Every host and participant reads every `wines` column (init_schema.sql:370-378), and `cellar_lots` is readable through `can_view_cellar` for a PUBLIC or FRIENDS cellar (20260829243000:21-44; friendships are one-way). A lot id on a hidden glass would name the wine before the reveal (E.4). |
| 12 | D1's copy carries designer cross-references: "Producer, name, vintage, colour · see A7" and "…what you want to do with it — D3." | UI copy drops the cross-references. | They point at canvas screen ids. |
| 13 | D1's row metas read "Already in the catalog · different vintage / different wine". | Those metas are used when rows are compared against a draft (an uploaded read, or the by-hand form). A row found by typed text alone reads "Already in the catalog · {vintage}". | Typed text has no identity to compare against. |
| 14 | D4 quotes the laptop note line as "Scanning lives on your phone and tablet, where the camera faces the bottle." | Use the full canvas C1 text: "Scanning lives on your phone and tablet, where the camera faces the bottle. It is not offered here." | The ledger asks for the handoff's copy, and the canvas has the full sentence. |
| 15 | A1's Wines card subtitle reads "3 of 6 · only you can see them". | The host of a host-provides tasting sees "{n} wines · only you can see them". Nobody else gets a subtitle. | No planned flight size is stored, so "of 6" has no source. In bring-your-own each contributor sees only their own bottles' identities, so "only you can see them" would be wrong for them. |
| 16 | A7 carries the note "Producers do not always carry that link, and there is no address in the data — when it is missing, both fields stay empty and you pick them. They are never guessed from the wine name." | The rule is built (B.4, C.5 A7); the sentence is not shown. | It explains the rule to the builder, not to the person adding a wine. The empty Country and Region fields and their "required" chips already say what to do. |
| 17 | The legacy unidentified-bottle note (wine-form.tsx:246-251; not handoff copy) says "Only country, region and grape are required." | The note reads "Only vintage, country, region and grape are required." | `UNIDENTIFIED_WINE_FIELDS` requires a vintage (B.3). The old sentence would be followed by the refusal "This wine needs a vintage." |

### 2.2 Round-1 behaviour this spec replaces (precedence 5)

- **Touch-only camera routing** (`isTouchPrimary`, use-camera.ts:29-95) → `canScan`
  (D5, C.3).
- **`{ kind: "rate" }` and "Rate this wine"** → `{ kind: "note" }` and "Start the
  note" (D4).
- **The laptop's per-row "keep it in the cellar" toggle** (desktop-view.tsx:184-195,
  311-336) → the footer checkbox (D9).
- **The year/NV Fix strip** (`pending-fix.tsx`) → the prefilled by-hand form (D7).
- **The by-hand form's required Wine name** (by-hand-logic.ts:202, 225;
  by-hand-form.tsx:393) → optional (D3).

Round 1's identical result-row buttons, producer-home-region-only prefill, cover
photo and merged nav are kept.

---

## 3. Part A — The label reader (D1)

### A.1 Files and dependencies

**Dependencies**
- Run `npm install @anthropic-ai/sdk zod` to add both as direct dependencies.
  - zod 4.4.3 already resolves transitively (package-lock.json:12504-12511).
  - Keep whichever zod major `@anthropic-ai/sdk/helpers/zod` accepts. `npx tsc --noEmit` right after the install confirms it.
- The main session runs the install before any coding agent starts (plan P0), so no agent's test or type-check run races a rewrite of `node_modules`.
- Commit only the lockfile changes these two packages produce. The pre-existing `libc` deletions stay out of the commit, and stay in the working tree exactly as the owner left them (F.3). The commit stages a copy of the installed lockfile with HEAD's `libc` lines restored; the working-tree file is never rewritten.

**New files**
- `src/lib/label-scan/label-read-schema.ts`
  - Pure: imports `zod` only, no `server-only`, relative imports, so vitest can load it.
  - Exports `LabelReadSchema`, `type LabelRead`, `LABEL_READ_PROMPT` and `coerceLabelRead`.
- `src/lib/label-scan/fixture.ts`
  - `import "server-only"`.
  - Exports `labelReadFixture` (A.6).
- `src/lib/label-scan/guards.ts`
  - Pure, with a vitest file. Exports `isOwnStagingPath(path, userId)` (A.5 step 2) and `fixtureAllowed(env)` (A.6), so the cost and security rules are tested predicates.
- `src/lib/label-scan/__fixtures__/*.json` (A.6).

**Rewritten files**
- `src/lib/label-scan/extract.ts`
  - `import "server-only"`.
  - Exports `LABEL_READ_MODEL`, `LabelReadUsage`, `LabelReadFailure`, `LabelReadOutcome` and `readLabel`.
- `src/app/scan/actions.ts` becomes one server action, `readLabelPhoto` (A.5).

**Kept**
- `grape-canonical.ts` (`canonicalGrapeName`).
- `region-canonical.ts` (`canonicalCountryName`, `canonicalRegionName`). Its synonyms are extended in B.5.

**Deleted**
- `src/lib/label-scan/fx.ts` (A.8).

### A.2 The Sonnet 5 call

This follows the claude-api skill's TypeScript "Structured Outputs" section: `client.messages.parse` with `zodOutputFormat`, and typed error classes checked most specific first.

```ts
// src/lib/label-scan/extract.ts
import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import {
  LABEL_READ_PROMPT,
  LabelReadSchema,
  coerceLabelRead,
  type LabelRead,
} from "./label-read-schema";
import { labelReadFixture } from "./fixture";

export const LABEL_READ_MODEL = "claude-sonnet-5";

export type LabelReadUsage = { input_tokens: number; output_tokens: number };
export type LabelReadFailure = "not-read" | "busy" | "network" | "rejected" | "service";
export type LabelReadOutcome =
  | { ok: true; read: LabelRead; model: string; usage: LabelReadUsage }
  | { ok: false; reason: "not-a-label"; read: LabelRead; model: string; usage: LabelReadUsage }
  // usage is non-null whenever the API returned a billed response: a refusal, a max_tokens
  // stop or an unparsed output (not-read). readLabelPhoto records those too (A.5).
  | { ok: false; reason: LabelReadFailure; model: string; usage: LabelReadUsage | null };

let client: Anthropic | null = null;

export async function readLabel(imageUrl: string): Promise<LabelReadOutcome> {
  const fixture = await labelReadFixture(); // development only; checked before any SDK use
  if (fixture) return fixture;

  const fail = (reason: LabelReadFailure, usage: LabelReadUsage | null = null): LabelReadOutcome => ({
    ok: false,
    reason,
    model: LABEL_READ_MODEL,
    usage,
  });

  try {
    client ??= new Anthropic({ maxRetries: 1, timeout: 60_000 });
    const response = await client.messages.parse({
      model: LABEL_READ_MODEL,
      max_tokens: 16000,
      output_config: { effort: "low", format: zodOutputFormat(LabelReadSchema) },
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "url", url: imageUrl } },
            { type: "text", text: LABEL_READ_PROMPT },
          ],
        },
      ],
    });
    const usage = {
      input_tokens: response.usage.input_tokens,
      output_tokens: response.usage.output_tokens,
    };
    if (
      response.stop_reason === "refusal" ||
      response.stop_reason === "max_tokens" ||
      !response.parsed_output
    ) {
      return fail("not-read", usage);
    }
    const read = coerceLabelRead(response.parsed_output);
    return read.isWineLabel
      ? { ok: true, read, model: LABEL_READ_MODEL, usage }
      : { ok: false, reason: "not-a-label", read, model: LABEL_READ_MODEL, usage };
  } catch (error) {
    // Most specific first. In the TS SDK, APIConnectionError is a subclass of APIError.
    if (error instanceof Anthropic.RateLimitError) return fail("busy");
    if (error instanceof Anthropic.InternalServerError) return fail("busy");
    if (error instanceof Anthropic.APIConnectionError) return fail("network");
    if (error instanceof Anthropic.BadRequestError) return fail("rejected");
    if (error instanceof Anthropic.APIError) return fail("service");
    throw error;
  }
}
```

**Request shape**
- Each photo is exactly one request. It carries an image content block, passed by URL (the staging object's public URL), followed by the prompt text.
- It has no `system`, no `tools`, no web search and no batch.

**Output settings**
- `output_config` is `{ effort: "low", format: zodOutputFormat(LabelReadSchema) }`.
- There is no `thinking` parameter:
  - Sonnet 5 runs adaptive thinking by default, and `effort: "low"` keeps it short.
  - Any thinking tokens are billed as output and recorded (A.7).
- `max_tokens: 16000` is the skill's non-streaming default. It is a ceiling, not a spend. Hitting it returns `stop_reason: "max_tokens"`, which maps to `not-read`.

**Retries and timeout**
- The client sets `maxRetries: 1`. The SDK retries 408, 409, 429, 5xx and connection errors, which covers D1's "one retry on 429/5xx".
- `timeout` is 60,000 ms per attempt.

**Failure mapping**
- A `stop_reason` of `"refusal"` or `"max_tokens"`, and a null `parsed_output`, all map to `not-read` and carry the response's billed `usage`. The raw `content` is never read.
- `busy`, `network`, `rejected` and `service` come from thrown errors and carry no usage, because no billed response came back.

**API key**
- The key comes from `ANTHROPIC_API_KEY`: `.env.local` locally, the Vercel environment in production.
- The client is created lazily, after the fixture check.
- A missing key throws a non-API error. `readLabelPhoto` logs it and maps it to `service` (A.5).

**Logging**
- Log `console.error("label read failed", { reason, status })`.
- Never log the key or the read JSON.

### A.3 The zod schema, field by field

**Starting point.** The schema is based on the pre-FastCork `record_wine_label` tool schema (16e5bd6^ extract.ts:35-139).
- Descriptions marked `(pre)` are copied verbatim from that schema.
- Tool descriptions do not exist in structured outputs, so the tool's own description moved into `LABEL_READ_PROMPT`.
- The additions are D1's three (tawny age, the official-name instruction, the no-GI flag) and the two fields from §2.1 row 10.

**Constraints.** `.describe()` becomes the JSON-schema description, so the schema is the prompt: each field carries its own extraction rule. The schema has no numeric `.min()`/`.max()` constraints; `coerceLabelRead` sanitises the transport (rule 3).

```ts
// src/lib/label-scan/label-read-schema.ts
import { z } from "zod";

export const LABEL_READ_PROMPT =
  "Read this wine bottle label, photographed for a cellar app, and fill in the record. " +
  "Fill every field from the label where printed, and from well-established knowledge of the wine, " +
  "producer or appellation where not. Null means 'genuinely unknown', never 'lazy'. " +
  "You are compiling reference data for a wine enthusiast's cellar, not writing marketing. " +
  "Give every name as it is officially used in the wine's own country.";

export const LabelReadSchema = z.object({
  // §2.1 row 10
  isWineLabel: z.boolean().describe(
    "True when the photo shows a wine bottle label, front or back. False for anything else; " +
      "then leave every other field null or empty and set confidence to low.",
  ),
  // (pre), extended with the title word
  producer: z.string().nullable().describe(
    "Winery / producer name as printed, including a title word that is part of the name " +
      "(Château, Domaine, Weingut, Tenuta…), or null.",
  ),
  // (pre)
  wineName: z.string().nullable().describe(
    "The cuvée / special bottling name — not the producer, not the appellation — or null.",
  ),
  // (pre) plus D1's official-name instruction
  appellation: z.string().nullable().describe(
    "The wine's geographic denomination under its official name as used in the wine's own country, " +
      "with its designation — AOC/AOP, DOC/DOCG, DO/DOCa, IGT/IGP, PDO/PGI, AVA, etc. " +
      '("Barbaresco DOCG", "Saint-Émilion Grand Cru AOC", "Rioja DOCa"). ' +
      'A regional PGI counts: a label printing "PUGLIA — Indicazione Geografica Protetta" IS the appellation "Puglia IGT". ' +
      "Italian labels print the EU term (IGP/DOP) for what wine lists still call IGT/DOC/DOCG — " +
      'return the traditional form ("Puglia IGT", not "Puglia IGP"). ' +
      "Keep Grand Cru / Premier Cru when it is part of the official name. " +
      'Repeat the name even when it equals the region ("Bourgogne AOC"). ' +
      "Null when noGeographicIndication is true, or when you genuinely cannot tell.",
  ),
  // D1
  noGeographicIndication: z.boolean().describe(
    "True ONLY when the wine legally carries no geographic indication: Vin de France, Vino d'Italia, " +
      "Deutscher Wein, Vino de España, a plain table wine. Appellation is then null. " +
      "False otherwise — including when the appellation simply could not be read.",
  ),
  // (pre)
  region: z.string().nullable().describe(
    "The wine region — infer it from the appellation or producer even when not printed " +
      "(Amarone della Valpolicella → Veneto), or null.",
  ),
  // (pre), "in English" added
  country: z.string().nullable().describe("The country, in English — infer it too (→ Italy), or null."),
  // (pre)
  designation: z.string().nullable().describe(
    "The label's legal quality, ageing or style term, in its canonical form: " +
      '"Gran Reserva", "Reserva", "Crianza", "Riserva", "Gran Selezione", "Kabinett", "Spätlese", "Auslese", ' +
      '"Grosses Gewächs", "Grand Cru", "Premier Cru", "Brut", "Brut Nature", "Extra Dry", "Vintage", "LBV", ' +
      '"Colheita", "Fino", "Amontillado", "VORS"… Return the term itself, not a sentence. ' +
      "Null when the label carries none. Do NOT put grape names or fantasy names here.",
  ),
  // (pre), tawny example added
  vintageKind: z.enum(["YEAR", "NV", "TAWNY"]).describe(
    '"YEAR" if a vintage year is shown, "NV" for non-vintage, "TAWNY" for an "X years" tawny ("20 Years Old").',
  ),
  // (pre)
  vintageYear: z.number().int().nullable().describe("The 4-digit vintage year, or null."),
  // D1
  vintageTawnyYears: z.number().int().nullable().describe(
    "For TAWNY only: the stated age in years (10, 20, 30, 40). Null otherwise.",
  ),
  // pre-FastCork derived this in coerce(); now asked for, and still checked in coerceLabelRead
  vintageRead: z.boolean().describe(
    "True only when the vintage year, the NV statement or the tawny age is actually visible in this photo. " +
      "False when you inferred it or could not find it — most still wines carry a vintage somewhere, " +
      "often only on the back label.",
  ),
  // (pre)
  colour: z.enum(["WHITE", "ROSE", "RED", "ORANGE"]).nullable().describe("Null if unclear."),
  // (pre)
  style: z.enum(["STILL", "SPARKLING", "SWEET", "FORTIFIED"]).nullable().describe(
    '"STILL" for normal reds/whites including Amarone; "SPARKLING" for Champagne, Prosecco, Cava…; ' +
      '"SWEET" for dessert / late-harvest (Sauternes, Tokaji); "FORTIFIED" for Port, Sherry, Madeira, VDN — ' +
      "Port is FORTIFIED, not SWEET. Null if unclear.",
  ),
  // (pre)
  grapes: z
    .array(z.object({ name: z.string(), percentage: z.number().nullable() }))
    .describe(
      "ALL major grapes in the blend, not just the primary. Canonical international variety names — " +
        "never a local synonym, clone or translation, no parenthetical qualifiers " +
        '("Sangiovese" not "Brunello"/"Prugnolo Gentile"; "Grenache" not "Garnacha"/"Cannonau"; ' +
        '"Syrah" not "Shiraz"; "Pinot Noir" not "Pinot Nero"/"Spätburgunder"). ' +
        "Percentages from the label; else the proportions well-known for this wine or appellation; else null.",
    ),
  // §2.1 row 10
  alcoholPercent: z.number().nullable().describe(
    "Alcohol by volume exactly as printed on the label (13.5), or null. Never inferred.",
  ),
  // (pre)
  description: z.string().nullable().describe(
    "2-4 sentences of REFERENCE NOTES for a wine enthusiast's cellar — the register of an encyclopedia entry, " +
      "not a shop shelf-talker. Include only verifiable facts you are confident of: terroir and soils, " +
      "the appellation's production rules as they apply to this wine (ageing minimums, yields, permitted varieties), " +
      "élevage (vessel, months), production scale, the estate's founding or ownership where notable, stated neutrally. " +
      "FORBIDDEN: describing the bottle, label or packaging; praise and promotional adjectives " +
      "(legendary, prestigious, stunning, exceptional, iconic, renowned) unless part of an official classification's name; " +
      "food pairings; 'perfect for' anything; every form of sales tone. " +
      "A wine about which little is known gets a SHORT description — two dry sentences beat four glowing ones. " +
      "Facts you cannot stand behind are omitted, not hedged. " +
      "Null when you cannot say anything factual beyond what other fields already carry.",
  ),
  // (pre)
  confidence: z.enum(["high", "medium", "low"]).describe("How clearly the label could be read."),
  // (pre), shortened to bound output tokens
  rawText: z.string().describe(
    "The label's text verbatim, at most about 500 characters. " +
      "If the image is not a wine label, say so briefly here.",
  ),
});

export type LabelRead = z.infer<typeof LabelReadSchema>;
export function coerceLabelRead(raw: unknown): LabelRead;
```

`coerceLabelRead` normalises the parsed output, because the code must not trust the transport either. Its rules:

1. **Strings.** Trim every string; an empty string becomes null. `rawText` keeps at most 2,000 characters.
2. **Not a label.** When `isWineLabel` is false:
   - every identity field becomes null and `grapes` becomes `[]`;
   - `noGeographicIndication` and `vintageRead` become false;
   - `confidence` becomes `"low"`.
3. **Vintage values (transport sanitising only).**
   - `vintageYear` becomes null unless it is an integer from 1900 to 2100. `vintageTawnyYears` becomes null unless it is an integer from 1 to 100 on a TAWNY read. These bounds only reject values no label can carry.
   - Whether a vintage is complete, and which years are valid, is decided in one place: `missingWineFields` (B.3). The reader adds no rule of its own to that decision.
4. **Vintage read.** `vintageRead` is forced false when the read carries no year for YEAR or no age for TAWNY, so an empty shape never shows "read from the label". Completeness is still decided only by `missingWineFields`.
5. **No geographic indication.** When `noGeographicIndication` is true, `appellation` becomes null.
6. **Grapes.**
   - Names are trimmed and empty names dropped.
   - A `percentage` is kept only if it is in (0, 100].
   - Duplicates by `foldName` (B.5) are dropped; the first one wins.
7. **Alcohol.** `alcoholPercent` is kept only in (0, 100) and rounded to one decimal. That matches `catalog_wines_alcohol_percent_ck` and `numeric(4,1)` (20260902100000:21, 65-66).
8. **Out-of-schema values** (defensive only).
   - An unknown colour or style becomes null.
   - An unknown confidence becomes `"low"`.
   - An unknown `vintageKind` becomes YEAR when a year is present, otherwise NV.

### A.4 Client-side downscale

**New file.** `src/components/add-wine/downscale-image.ts`:

```ts
export const READ_MAX_SIDE = 1600;          // use-camera.ts:8 MAX_SIDE imports this
export class ImageDecodeError extends Error {}
export async function downscaleForRead(file: Blob): Promise<Blob>;
```

**How it works.**
- It decodes with `createImageBitmap(file, { imageOrientation: "from-image" })`.
- It scales so the long edge is at most 1600 px and draws onto a canvas.
- It returns `canvas.toBlob("image/jpeg", 0.85)` and calls `bitmap.close()`.
- It always re-encodes to JPEG. That also converts HEIC, HEIF, AVIF, GIF and WebP picks into a format the API accepts.

**When decoding fails** (for example HEIC in a browser that cannot decode it), it throws `ImageDecodeError`. The item becomes the inline failed row (C.4), never a modal.

**Where it runs.** The shell calls it for every source before uploading.
- Camera captures are already at most 1600 px (use-camera.ts:186-201), so this is a cheap pass.
- Library picks (camera-view.tsx:136-147) and laptop uploads (desktop-view.tsx:217-229) are uploaded unscaled today.
- `pickImageFiles` (desktop-format.ts:187-217) keeps its 5 MB pre-check and its copy.

**Upload path.** Uploads go to `catalog/staging/<userId>/scan-<Date.now()>-<rand>.jpg` with `contentType: "image/jpeg"`. Today, add-wine-sheet.tsx:274-285 takes the extension and the MIME type from the file.

### A.5 The server action and retention

```ts
// src/app/scan/actions.ts
"use server";

export type LabelPhotoFailure =
  | "signed-out" | "image" | "not-a-label" | "not-read" | "busy" | "network" | "rejected" | "service";

export type LabelPhotoRead = {
  ok: true;
  readId: string | null;            // label_reads.id
  draft: WineIdentityDraft;         // resolveLabelRead (B.5)
  missing: WineFieldKey[];          // missingWineFields(draft) (B.3)
  match: CatalogMatch | null;       // findConfidentMatch (B.6)
  display: { title: string; meta: string; newProducer: boolean };
  confidence: "high" | "medium" | "low";
};

export async function readLabelPhoto(input: {
  imagePath: string;
}): Promise<LabelPhotoRead | { ok: false; reason: LabelPhotoFailure }>;
```

Steps:

1. **Sign-in.** Call `supabase.auth.getUser()`. With no user, return `signed-out`.
2. **Path check.** `isOwnStagingPath(imagePath, user.id)` (guards.ts) must be true, otherwise return `image`. It matches `^catalog/staging/<user.id>/scan-[A-Za-z0-9._-]+\.jpg$`, with the user id escaped.
   - The server never accepts a URL from the client.
   - Today `identifyWineFromLabel` accepts any string (scan/actions.ts:51-60), so any signed-in caller could spend tokens on arbitrary URLs.
3. **Image URL.** `imageUrl` is `supabase.storage.from("wine-images").getPublicUrl(imagePath).data.publicUrl`.
4. **Read.** Call `outcome = await readLabel(imageUrl)`. An unexpected throw is logged and returns `service`.
5. **Retention.** Whenever the outcome carries `usage` — every billed call: `ok`, `not-a-label`, and a `not-read` refusal, `max_tokens` stop or unparsed output:
   - insert a `label_reads` row `{ user_id, image_path: imagePath, outcome, read, model, input_tokens, output_tokens }` and keep its id. `outcome` is `ok`, `not-a-label` or `not-read`; `read` is null for `not-read`;
   - if the insert fails, log it; the scan continues with `readId: null`.
   - No image bytes are stored (D1).
   - The expensive failures are counted like any other read. A runaway read at `max_tokens` costs about $0.17 (A.7).
6. **Failures.** A failed outcome returns `{ ok: false, reason }`.
7. **Success.** Run, in order:
   - `draft = await resolveLabelRead(outcome.read, serverLookup(supabase), { imageUrl })`;
   - `match = await findConfidentMatch(supabase, draft)`;
   - `display = readDisplay(draft, names)`, where the names come from the same lookups.

This one round trip replaces the two actions the client calls today (add-wine-sheet.tsx:287-291). The resolver now runs behind this action's sign-in check; `resolveWinePrefill` had none (scan/actions.ts:249-252).

`display` (built by `readDisplay`, in `src/lib/wine-identity/describe.ts`):

- **`title`** is `"{producer}, {wine name, or the appellation name without its designation} {vintage}"`, for example "Produttori del Barbaresco, Barbaresco 2018". Parts with no value are left out.
- **`meta`** is `"{appellation} · {region} · {country} · {primary grape}"` using the resolved names, for example "Barbaresco DOCG · Piedmont · Italy · Nebbiolo". It never uses raw read text for a field that did not resolve (scan-3).
- **`newProducer`** is true when the producer is pending. The confirm screen then shows "{name} · new producer".

**Retry.** Retrying a failed row calls `readLabelPhoto` again with the same `imagePath` once the upload has succeeded, or uploads again first if it has not. Every retry is a new read: about $0.01 and a new `label_reads` row.

### A.6 The `LABEL_READ_FIXTURE` dev switch

```ts
// src/lib/label-scan/fixture.ts
import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fixtureAllowed } from "./guards";
import { coerceLabelRead } from "./label-read-schema";
import type { LabelReadOutcome } from "./extract";

export async function labelReadFixture(): Promise<LabelReadOutcome | null> {
  // fixtureAllowed(env) = env.NODE_ENV !== "production" && Boolean(env.LABEL_READ_FIXTURE)
  if (!fixtureAllowed(process.env)) return null;
  const file = process.env.LABEL_READ_FIXTURE!;
  const read = coerceLabelRead(JSON.parse(await readFile(path.resolve(process.cwd(), file), "utf8")));
  const usage = { input_tokens: 0, output_tokens: 0 };
  return read.isWineLabel
    ? { ok: true, read, model: "fixture", usage }
    : { ok: false, reason: "not-a-label", read, model: "fixture", usage };
}
```

**Rules**
- **When it applies.**
  - It runs before the SDK client is constructed.
  - It never runs in production.
  - If the variable points at a missing file, it throws. That is loud, and only possible in development.
- **Fixture format.** A fixture file is exactly a `LabelRead`, the same JSON stored in `label_reads.read`. To replay any stored read, copy that column into a file.
- **Stored rows.** Fixture reads are stored in `label_reads` with `model = "fixture"`, zero tokens and the replayed read's outcome. That exercises the retention path in development, and fixture rows stay distinguishable.
- **Documentation.** `.env.example` documents the variable commented out (A.8).

The committed fixtures below are hand-written in Sonnet's output shape. They are not API output. The recorded live reads from G.5 are committed separately, under `__fixtures__/live/`.

| File | The read | Exercises |
|---|---|---|
| `produttori-barbaresco-2018.json` | Produttori del Barbaresco · "Barbaresco" · Barbaresco DOCG · Piedmont · Italy · 2018 (read) · RED · STILL · Nebbiolo 100 | a complete read; a confident match when the catalog holds that wine |
| `cigliuti-barbaresco-no-vintage.json` | Cigliuti · Barbaresco DOCG · `vintageRead: false` | a partial read (A4, A4b) |
| `vin-de-france.json` | `noGeographicIndication: true` · France · RED | France's no-geographic-indication rows, Vin de France (B.5) |
| `saint-emilion-grand-cru.json` | "Saint-Émilion Grand Cru AOC" · Bordeaux · France · 2016 | the cru kept, not stripped |
| `tawny-port-20.json` | `TAWNY` · `vintageTawnyYears: 20` · FORTIFIED · Portugal | the tawny age carried through; TAWNY → FORTIFIED |
| `bourgogne-aligote.json` | "Bourgogne Aligoté AOC" · Bourgogne · France | accent and suffix folding against the LWIN spelling "Bourgogne Aligote AOC" |
| `rioja-spain.json` | "Rioja DOCa" · La Rioja · Spain | country scoping (never Argentina's La Rioja) |
| `domaine-leflaive-puligny.json` | "Domaine Leflaive" · Puligny-Montrachet AOC · 2019 · WHITE | no bare-"Domaine" match (scan-1) |
| `not-a-label.json` | `isWineLabel: false` | the failed row |

### A.7 Cost statement

- **Estimate.** About $0.01 per scan, using D1's figures.
  - Input: about 2.6k image tokens (for an image at most 1,600 px on its long edge) plus about 1.2k prompt and schema tokens, at $2 per million, ≈ $0.0076.
  - Output: about 400 tokens at $10 per million ≈ $0.004.
- **Use.** Owner-approved runtime use only: one read per photo a user takes or uploads.
  - No web search, no tools and no batch.
  - No background re-reads. The admin "Re-read profile" action is removed with FastCork.
- **Ceiling.** `max_tokens: 16000` caps a runaway read at about $0.17. Thinking tokens (adaptive, kept short by `effort: "low"`) are billed as output and included in the recorded `usage.output_tokens`.
- **Checking real cost.** Every billed call records its tokens, failed reads included (A.5 step 5). Real cost is a single query:
  `select outcome, count(*), sum(input_tokens) * 2 / 1e6 + sum(output_tokens) * 10 / 1e6 as usd from label_reads where model = 'claude-sonnet-5' group by outcome`.
- **Development.** The owner approved live test reads for development (D1). Only the main session makes them: the label test set, then one read through the UI. That is at most 30 reads in total, with each call's usage logged (G.5). No `count_tokens`, no batch, no maintenance loops. Coding agents make no calls.

### A.8 FastCork removal list

Code:
- **`src/lib/label-scan/extract.ts`.** Rewrite it (A.2). That removes:
  - the fastcork.com POST and `FASTCORK_API_KEY`;
  - `splitRegion`, `mapType`, `stripProducerPrefix` and `deriveConfidence`;
  - the 402 "out of credits" message;
  - the `ExtractedLabel` type.
- **`src/lib/label-scan/fx.ts`.** Delete it. `usdToDkk` and `usdToDkkRate` were only used by the scan prefill and `createScannedWine`.
- **`src/app/scan/actions.ts`.** Delete `searchRows`, `identifyWineFromLabel`, `stripCruQualifier`, `stripClassSuffix`, `createScannedWine` and `resolveWinePrefill`, together with the `ScanMatch`/`ScanResult` types. `readLabelPhoto` (A.5) and `src/lib/wine-identity/` (Part B) replace them.
- **`src/app/catalog/[wineId]/refresh-profile-action.ts`.** Delete it.
- **`src/app/catalog/[wineId]/wine-admin-controls.tsx`.**
  - Remove the "Re-read profile" (Sparkles) button, its state and its handler (:5, :17, :44, :63-73, :95-104).
  - Keep the shared error display the delete dialog uses (:115-119, :136).
  - The stored profile columns stay editable in Manage wine (edit-wine-modal.tsx:50, 103-119).
- **The USD price that only the scan prefill set.**
  - Remove `retailPriceUsd` from `WineFormInitial` (new-wine-form.tsx:55-58).
  - Remove the USD handling in catalog/new/actions.ts:97-101.
  - Manual price entry stays.

Config and comments:
- **`.env.example`.** Remove the `FASTCORK_API_KEY` line and its "one FastCork credit per scan" comment. Add:
  - `ANTHROPIC_API_KEY=`, commented "label scans only — about $0.01 per scan; see AGENTS.md";
  - `# LABEL_READ_FIXTURE=src/lib/label-scan/__fixtures__/produttori-barbaresco-2018.json`, commented "development only; never read in production";
  - `# NEXT_PUBLIC_FORCE_CAN_SCAN=1`, commented "development only" (C.3).
- **Code comments that name FastCork.** Reword them to describe the Sonnet 5 read, or drop the vendor name:
  - add-wine-sheet.tsx:286, 330;
  - camera-view.tsx:24;
  - desktop-format.ts:199;
  - desktop-view.tsx:56, 219;
  - types.ts:230;
  - globals.css:364;
  - src/lib/wset/queries.ts:28;
  - new-wine-form.tsx:55;
  - catalog/new/actions.ts:100, 108.
- **Docs.**
  - The CLAUDE.md add-wine-sheet note that calls `identifyWineFromLabel` "FastCork — one credit per photo, NOT the Anthropic API" is rewritten (G.6).
  - `docs/superpowers/specs/2026-09-12-add-wine-sheet-and-tasting-flow-design.md:207` and `docs/superpowers/plans/2026-09-12-add-wine-sheet-and-tasting-flow.md:9, 20` each get a one-line pointer to this spec. Applied history is not rewritten.

Kept on purpose:
- `scripts/backfill-fastcork-profile.mjs`: in place and unused (D1).
- Migration `20260902100000_catalog_wine_fastcork_fields.sql`: its applied column comments stay, along with the profile columns, which stay manual.
- `FASTCORK_API_KEY` in the Vercel environment is the owner's to delete (F.3).
---

## 4. Part B — One complete wine (D2)

### B.1 Module layout

| File | Kind | Exports |
|---|---|---|
| `src/lib/wine-identity/types.ts` | pure | `WineFieldKey`, `FieldProvenance`, `ProvenanceKey`, `RefChoice`, `VintageKind`, `WineColour`, `WineStyle`, `BlendRow`, `WineIdentityDraft`, `CompleteVintage`, `CompleteWine`, `UnidentifiedWine` |
| `src/lib/wine-identity/complete.ts` | pure | `COMPLETE_WINE_FIELDS`, `UNIDENTIFIED_WINE_FIELDS`, `VINTAGE_YEAR_MIN`, `vintageYearMax`, `emptyDraft`, `normaliseDraft`, `missingWineFields`, `toCompleteWine`, `toUnidentifiedWine` |
| `src/lib/wine-identity/describe.ts` | pure | `describeMissing`, `describeUnread`, `vintageLabel`, `readDisplay` |
| `src/lib/wine-identity/fold.ts` | pure | `foldName`, `foldWords`, `normaliseCru`, `stripDesignationSuffix`, `DESIGNATION_SUFFIXES`, `TITLE_WORDS`, `isTitleOnly` |
| `src/lib/wine-identity/resolve.ts` | pure | `RefLookup`, `resolveLabelRead`, `appellationSearchPattern`, `NATIONAL_TIER_REGION_NAMES` |
| `src/lib/wine-identity/match.ts` | pure | `CatalogCandidate`, `CatalogMatch`, `pickConfidentMatch` |
| `src/lib/wine-identity/grape-suggestion.ts` | pure | `pickGrapeSuggestion` |
| `src/lib/wine-identity/from-sources.ts` | pure | `draftFromCatalogWine`, `draftFromAnswerKey`, `parseStoredDraft` |
| `src/lib/wine-identity/server/lookup.ts` | `server-only` | `serverLookup(supabase): RefLookup` |
| `src/lib/wine-identity/server/match.ts` | `server-only` | `findConfidentMatch` |
| `src/lib/wine-identity/server/write.ts` | `server-only` | `resolveProducer`, `findOrCreateGrapeFolded`, `prepareCompleteWine`, `prepareUnidentifiedWine`, `upsertCatalogWine`, `fillCatalogWine` |

Pure files follow three rules:

- They use relative imports only, because vitest has no `@` alias (vitest.config.mts:3-10).
- They never import `server-only` or Supabase.
- Their only outside import is `src/lib/wine-blend.ts` (`orderedBlend`, :9), which is itself pure.

`parseStoredDraft(json: unknown): WineIdentityDraft | null` validates a `wine_identity_drafts.draft` value field by field. Anything malformed becomes `null`, and the caller treats that as a draft with every field missing.

### B.2 Types

```ts
// src/lib/wine-identity/types.ts
export type WineFieldKey =
  | "producer" | "vintage" | "colour" | "style"
  | "country" | "region" | "appellation" | "primaryGrape";

export type FieldProvenance =
  | "label" | "catalog-match" | "producer-region" | "appellation-suggestion" | "manual" | "none";

export type ProvenanceKey =
  | WineFieldKey | "wineName" | "blend" | "typeDesignation" | "alcohol" | "description" | "imageUrl";

/** An existing reference row, or a name that is created only on the explicit add. */
export type RefChoice =
  | { kind: "existing"; id: string; name: string }
  | { kind: "pending"; name: string };

export type VintageKind = "YEAR" | "NV" | "TAWNY";
export type WineColour = "RED" | "WHITE" | "ROSE" | "ORANGE";
export type WineStyle = "STILL" | "SPARKLING" | "SWEET" | "FORTIFIED";
export type BlendRow = { grape: RefChoice; percentage: number | null };

export type WineIdentityDraft = {
  producer: RefChoice | null;
  wineName: string | null;
  /** `read` is true only when the vintage came off a label read with vintageRead;
      it drives the "did not read" chip and never affects completeness. */
  vintage: { kind: VintageKind | null; year: number | null; tawnyYears: number | null; read: boolean };
  colour: WineColour | null;
  style: WineStyle | null;
  countryId: string | null;
  regionId: string | null;
  appellationId: string | null;
  blend: BlendRow[];
  typeDesignationId: string | null;
  alcohol: number | null;
  description: string | null;
  imageUrl: string | null;
  provenance: Partial<Record<ProvenanceKey, FieldProvenance>>;
};

export type CompleteVintage =
  | { kind: "YEAR"; year: number; tawnyYears: null }
  | { kind: "NV"; year: null; tawnyYears: null }
  | { kind: "TAWNY"; year: null; tawnyYears: number };

export type CompleteWine = {
  producer: RefChoice;
  wineName: string | null;          // blank → null (D3)
  vintage: CompleteVintage;
  colour: WineColour;
  style: WineStyle;                 // always FORTIFIED when vintage.kind is TAWNY
  countryId: string;
  regionId: string;
  appellationId: string;
  blend: BlendRow[];                // at least one row, in orderedBlend order
  primaryGrape: RefChoice;          // blend[0]
  secondaryGrape: RefChoice | null; // blend[1] ?? null
  typeDesignationId: string | null;
  alcohol: number | null;
  description: string | null;
  imageUrl: string | null;
};

/** The flight-only "I can't identify this bottle" shape (byhand-7). */
export type UnidentifiedWine = Omit<CompleteWine, "producer" | "colour" | "style" | "appellationId"> & {
  producer: RefChoice | null;
  colour: WineColour | null;
  style: WineStyle | null;
  appellationId: string | null;
};
```

### B.3 The completeness contract

```ts
// src/lib/wine-identity/complete.ts
export const COMPLETE_WINE_FIELDS = [
  "producer", "vintage", "colour", "style",
  "country", "region", "appellation", "primaryGrape",
] as const satisfies readonly WineFieldKey[];

/** byhand-7: an unidentified flight glass needs only these — the wine_answers
    NOT NULL columns (country, region, primary grape) plus a vintage. */
export const UNIDENTIFIED_WINE_FIELDS = [
  "vintage", "country", "region", "primaryGrape",
] as const satisfies readonly WineFieldKey[];

export const VINTAGE_YEAR_MIN = 1900;
export function vintageYearMax(now: Date = new Date()): number;       // now.getUTCFullYear() + 1

export function emptyDraft(): WineIdentityDraft;
export function normaliseDraft(draft: WineIdentityDraft): WineIdentityDraft;
export function missingWineFields(
  draft: WineIdentityDraft,
  opts?: { unidentified?: boolean; now?: Date },
): WineFieldKey[];
export function toCompleteWine(
  draft: WineIdentityDraft,
  opts?: { now?: Date },
): { wine: CompleteWine } | { missing: WineFieldKey[] };
export function toUnidentifiedWine(
  draft: WineIdentityDraft,
  opts?: { now?: Date },
): { wine: UnidentifiedWine } | { missing: WineFieldKey[] };

// src/lib/wine-identity/describe.ts
export function describeMissing(fields: readonly WineFieldKey[]): string;
export function describeUnread(fields: readonly WineFieldKey[]): string;
```

A field counts as present when:

| Field | Present when |
|---|---|
| producer | `kind: "existing"`, or `kind: "pending"` with a name whose `foldName` is not empty |
| vintage | YEAR with an integer year between `VINTAGE_YEAR_MIN` and `vintageYearMax(now)`, inclusive · NV · TAWNY with an integer `tawnyYears` from 1 to 100 |
| colour, style | a non-null enum value |
| country, region, appellation | a non-empty id |
| primaryGrape | at least one blend row whose grape is `existing`, or `pending` with a non-empty folded name |

This single vintage range replaces the three that exist today:

- `parseVintageYear`: 1900 to next year (scan-copy.ts:101-107).
- `parseYear`: 1900–2100 (by-hand-logic.ts:178-183).
- The HTML limits in wine-identity-fields.tsx:386-387.

`normaliseDraft` does the following:

- **Text.** Trims `wineName` and `description`; a blank value becomes null.
- **Vintage shape.** YEAR clears `tawnyYears`. NV clears `year` and `tawnyYears`. TAWNY clears `year`.
- **Style.** TAWNY forces `style = "FORTIFIED"` (D8).
- **Blend.**
  - Drops rows whose pending name is empty.
  - Dedupes by existing id, then by folded pending name; the first row wins.
  - Orders the rows with `orderedBlend`, the same primary/secondary rule the `catalog_wine_grapes` trigger uses.
- **Alcohol.** Kept only when it is between 0 and 100 (exclusive), rounded to one decimal.

`missingWineFields` normalises first, then returns the missing keys:

- in `COMPLETE_WINE_FIELDS` order by default;
- in `UNIDENTIFIED_WINE_FIELDS` order with `unidentified: true`.

`toCompleteWine` returns `{ wine }` only when that list is empty.

This is the only place the wording is built:

| Fields | `describeMissing` | `describeUnread` |
|---|---|---|
| `[]` | `""` | `""` |
| `["vintage"]` | "needs a vintage" | "no vintage read" |
| `["vintage", "primaryGrape"]` | "needs a vintage and a grape" | "no vintage or grape read" |
| `["producer", "vintage", "primaryGrape"]` | "needs a producer, a vintage and a grape" | "no producer, vintage or grape read" |

The nouns are: producer "a producer", vintage "a vintage", colour "a colour", style "a style", country "a country", region "a region", appellation "an appellation", primaryGrape "a grape". `describeUnread` uses the bare noun, such as "grape".

Where the phrases appear:

| Surface | Copy |
|---|---|
| Server refusal (every write in B.9) | `{ error: "This wine needs a vintage.", missing: ["vintage"] }` |
| Read chip (uppercase), pending row, multi stack row | "no vintage read"; row: "Cigliuti, Barbaresco · no vintage read" |
| Flight page row, seen by the adder | "needs a vintage — tap Edit to finish" |
| Start refusal | "Glass 3 needs a vintage"; several glasses are joined with " · " |
| E1 chooser line, by-hand refusal line | "needs a vintage" |

The pin test (D2), in `src/lib/wine-identity/complete.test.ts`:

- It holds the map `producer → producer_id`, `vintage → vintage_kind`, `colour → colour`, `style → style`, `country → country_id`, `region → region_id`, `appellation → appellation_id`, `primaryGrape → primary_grape_id`.
- It reads two migrations with `fs.readFileSync(path.join(process.cwd(), "supabase/migrations", …))`.
- From `20260829211000_catalog_wines_strict.sql` it builds a column set:
  - every column matched by `/alter column\s+(\w+)\s+set not null/g`, minus `wine_name`;
  - plus the three columns named in the file's comment `-- country_id, primary_grape_id, producer_id are already NOT NULL.` The test asserts that comment line is present.
- That set must equal the map's values exactly.
- It asserts `20260829215000_wine_name_optional.sql` contains `alter column wine_name drop not null`, and that `wine_name` is not among the map's values (D3).

Flipping D3 means adding `"wineName"` to the constant and to `WineFieldKey`, and changing this one test. No SQL lists field keys. `wine_identity_drafts.missing` only has to be non-empty, and `tasting_incomplete_glasses` returns an empty list for a glass with no draft (E.3). F3's test pins that the migration holds no literal key array.

### B.4 Provenance and field chips

Whoever fills a field sets its provenance, and provenance is read only for copy. `fieldChip(field, draft, ctx)` in `src/components/add-wine/by-hand-logic.ts` picks each chip or note:

| Field | State | Chip or note |
|---|---|---|
| Producer | `existing` (from a read, a match or a pick) | "matched", plus " · {region name}" when the producer has a region link. A7 draws "matched · Neive, Piedmont", but the data holds only the region. |
| Producer | `pending` | "new producer" |
| Producer | empty | "required" |
| Vintage | `vintage.read` | "read from the label" |
| Vintage | missing after a read | "did not read" |
| Vintage | empty, no read | "required" |
| Wine name | provenance `label` | "read from the label" |
| Wine name | otherwise | no chip; the hint "Leave blank if the label has no cuvée name" |
| Colour, Style | provenance `label` | "read from the label" |
| Colour, Style | empty | "required" |
| Country and region | provenance `producer-region` | the note "Filled from {producer}'s region link. Change either if the bottle disagrees." |
| Country and region | provenance `label` | "read from the label" |
| Country and region | empty | "required" |
| Appellation | provenance `label` | "read from the label" |
| Appellation | missing after a read | "did not read" |
| Appellation | otherwise | "you choose" |
| Grape | provenance `label` | "read from the label" |
| Grape | otherwise | "you confirm"; the suggestion chip "suggested" (B.8) |
| Any required field | missing, and focused by Fix | "did not read — required" |

A value read by a scan is "read from the label", not an inference (D8). A by-hand draft built from a matched catalog wine carries provenance `catalog-match` on every field; its producer shows "matched" and its other fields show no chip.

### B.5 The read resolver

`resolveLabelRead(read: LabelRead, lookup: RefLookup, opts: { imageUrl: string | null }): Promise<WineIdentityDraft>` is pure. The server adapter `serverLookup(supabase)` implements the lookup.

```ts
export interface RefLookup {
  countries(): Promise<{ id: string; name: string }[]>;                                // small table
  regionsInCountry(countryId: string): Promise<{ id: string; name: string }[]>;
  /** search_appellations RPC (20260716160000:27-43): f_unaccent(name) ilike '%' || f_unaccent(p_query) || '%',
      ordered by name, limit 25. `words` is foldWords form; the adapter sends appellationSearchPattern(words). */
  searchAppellations(words: string, regionId?: string): Promise<{ id: string; name: string }[]>;
  appellationsByIds(ids: string[]): Promise<{ id: string; name: string; regionId: string; countryId: string }[]>;
  /** the country's no-geographic-indication region and its same-named appellation: a national-tier region
      named in NATIONAL_TIER_REGION_NAMES when the country has one (France: "Vin de France", 20260829212000),
      otherwise the per-country "None" pair (20260829263700) */
  noGeographicIndication(countryId: string): Promise<{ regionId: string; appellationId: string } | null>;
  /** find_producer_by_folded_name (E.2) */
  producerByFoldedName(name: string, regionId: string | null): Promise<{ id: string; name: string; regionId: string | null } | null>;
  regionById(id: string): Promise<{ id: string; name: string; countryId: string } | null>;
  grapes(): Promise<{ id: string; name: string }[]>;                                   // small table
  typeDesignations(): Promise<{ id: string; name: string; countryId: string | null }[]>; // ~50 rows, is_active
}
```

Two data-access rules:

- No lookup reads a whole `appellations` or `producers` table (CLAUDE.md).
- Nothing depends on an unpaged read of a large region (RC5). The unpaged self-named lookup at scan/actions.ts:340-357 is deleted.

Folding helpers (`fold.ts`):

- `foldName(s)`: the TypeScript twin of SQL `f_search_norm` (20260829260000:13-20), which is `f_unaccent(lower(s))` with every run outside `[a-z0-9]` removed. In order:
  1. lowercase;
  2. map ß→ss, æ→ae, œ→oe, ø→o, đ→d, ł→l, as the `unaccent` dictionary does;
  3. Unicode NFD, with combining marks removed;
  4. remove every character outside `[a-z0-9]`.

  Examples: "Château La Fleur-Pétrus" → "chateaulafleurpetrus"; "Weißburgunder" → "weissburgunder".
- `foldWords(s)`: the same folding, but keeps single spaces between words. The suffix and cru logic works on this form.
- `normaliseCru(s)`: in `foldWords` form, rewrites `1er cru` to `premier cru`.
- `stripDesignationSuffix(s)`: removes one trailing designation word.
  - `DESIGNATION_SUFFIXES` combines the geographic allowlist in `scripts/add-appellation-designations.mjs` with the EU forms: `aoc aop ac doc docg doca dop do igt igp ig ava dac vqa wo gi pdo pgi`.
  - German quality tiers (Qualitätswein, Prädikatswein, Landwein) and table-wine markers are never suffixes (CLAUDE.md's allowlist rule).
- Suffix equivalence, used only for tie-breaks: `aoc ≡ aop`, `igt ≡ igp`, `doc ≡ dop`.
- `TITLE_WORDS`: domaine, chateau, bodega, bodegas, weingut, tenuta, maison, cantina, clos, castello, quinta, casa, schloss, azienda, agricola.
- `isTitleOnly(name)`: true when every `foldWords` word is in `TITLE_WORDS`.
- `appellationSearchPattern(words)` (resolve.ts): the words joined with `%`. For example, "saint emilion grand cru" becomes "saint%emilion%grand%cru".
  - `search_appellations` folds accents but never punctuation, and it does not escape `%`. Each `%` therefore matches whatever the stored name really has there: a hyphen, an apostrophe or a space.
  - So the pattern above finds "Saint-Émilion Grand Cru AOC", and "coteaux%d%aix%en%provence" finds "Coteaux d'Aix-en-Provence AOC". A plain `foldWords` query would miss every hyphenated or apostrophe name.
  - The pattern still uses the trigram index. The server adapter and the test snapshot lookup both call this one helper.

The resolution steps, in order:

1. **Country.** Folded equality of `canonicalCountryName(read.country)` against `countries()`, provenance `label`. No match → null; the country is never guessed.
2. **No geographic indication.** When `read.noGeographicIndication` is set and the country resolved:
   - region and appellation come from `noGeographicIndication(countryId)`, provenance `label`;
   - steps 3–5 are skipped.

   With no country, both stay null. The flag replaces today's rule (scan/actions.ts:374), which only fired when the read had no region and no appellation text at all.

   **France has two no-GI representations; the resolver picks one.**
   - The national-tier "Vin de France" region and appellation (20260829212000) are what real catalog rows use. The label test set's L'Envolee bottle expects them.
   - The per-country "None" pair (20260829263700) exists too.
   - Scoring is a plain FK comparison. An answer key on None would score 0 against guesses and catalog rows on Vin de France, and would fork the catalog.
   - The rule: take the country's national-tier region where one exists, and None everywhere else. `NATIONAL_TIER_REGION_NAMES` lists only names that exist as regions today: `["Vin de France"]`.
   - A read that names "Vin de France" as its appellation instead reaches the same rows through step 4.
   - Merging France's None rows into Vin de France would need a data migration the ledger does not list (F.3).
3. **Region candidate.** When the country resolved and `read.region` is set: folded equality of `canonicalRegionName(read.region, country)` against `regionsInCountry(countryId)`. The result is kept as a candidate; it is not a value yet.
4. **Appellation.** Only when `read.appellation` is set.
   1. `q = normaliseCru(read.appellation)` and `base = stripDesignationSuffix(q)`.
   2. `hits = searchAppellations(base)`, which sends `appellationSearchPattern(base)`. If exactly 25 rows come back (the RPC's limit, so the list may be truncated) and a region candidate exists, use `searchAppellations(base, candidate.id)` instead.
   3. `rows = appellationsByIds(hits)`. `agreeing` = the rows where `foldName(stripDesignationSuffix(normaliseCru(name)))` equals `foldName(base)`.
   4. If the country is known, keep only the agreeing rows in that country.
   5. If more than one is left and a region candidate exists, keep only the rows in that region.
   6. If more than one is still left, prefer rows whose suffix is equivalent to the read's suffix. Still more than one → no pick.
   7. If none agree and `base` ends with "grand cru" or "premier cru": remove that trailing qualifier and repeat 2–6 once.
      - Nothing else is ever stripped, and never from the middle; the greedy `.*$` at scan/actions.ts:154-159 is gone.
      - "Saint-Émilion Grand Cru AOC" therefore resolves to Saint-Émilion Grand Cru, not Saint-Émilion.
   8. Exactly one row → it sets `appellationId`, and its `regionId` and `countryId` fill the draft. All three get provenance `label`.
   9. Otherwise `appellationId` stays null. **There is no first-hit fallback**: scan/actions.ts:296 is deleted (RC4, scan-3).
5. **Region from the read.** If the region is still empty and a candidate exists, the region becomes the candidate, provenance `label`.
   - A region-level read never silently becomes the region's self-named appellation.
   - The model already repeats "Bourgogne AOC" as the appellation (A.3).
   - A read without an appellation is a partial read; the user fixes it with "Just the region" (C.5 A7).
6. **Producer.** Only when `read.producer` is set and not `isTitleOnly`:
   - `producerByFoldedName(read.producer, regionId)`. A hit is `existing`, provenance `label`.
   - Otherwise the producer is `pending` with the read name, provenance `label`, and the confirm screen shows "new producer" (D6, scan-3).
   - A title-only name ("Domaine") becomes `pending` without a lookup.
7. **Region from the producer link.** Only when the region is still empty and the producer is `existing` with a region link whose country equals `countryId` (or `countryId` is null):
   - `regionId` becomes that region; `countryId` becomes its country if still empty;
   - provenance `producer-region`;
   - it never sets the appellation and never sets a grape (owner rule, RC10).
8. **Designation.** Folded equality of `read.designation` against `typeDesignations()`. Prefer a row whose `countryId` equals the draft's country, then a row with no country; otherwise leave it null.
9. **Grapes.** Each read grape name goes through `canonicalGrapeName`, then folded equality against `grapes()`: `existing` on a match, otherwise `pending` with the canonical name. Percentages are kept, and the blend gets provenance `label`.
10. **Vintage.**
    - With `read.vintageRead`: `{ kind, year, tawnyYears, read: true }`, provenance `label`.
    - Otherwise: `{ kind: null, year: null, tawnyYears: null, read: false }`, which makes the vintage missing.
    - There is no `vintagePrompt` flag any more.
11. **Remaining fields.** Colour, style, wine name, alcohol and description come from the read, provenance `label`. `imageUrl` is `opts.imageUrl`.
12. **Return** `normaliseDraft(draft)`, which turns TAWNY into FORTIFIED.

`region-canonical.ts` covers the English and sub-regional names the diagnosis found resolving to the country only (RC3). Each maps to the region name as stored:

- **Already mapped at 9258219** (region-canonical.ts:34-37): Burgundy → Bourgogne, Piedmont → Piemonte, Tuscany → Toscana.
- **New.** The map's keys are only lowercased, so each new synonym is added with and without its accent:
  - Southern Rhône and Northern Rhône → Rhône (France);
  - Douro Valley → Douro (Portugal);
  - Mosel-Saar-Ruwer → Mosel (Germany).

Every target name is checked against the reference snapshot (G.2), which therefore includes Germany's regions. A synonym whose target does not exist is not added. resolve.test.ts asserts that every synonym on the map resolves to its stored region.

### B.6 Confident catalog match (D6; scan-1, scan-2)

`findConfidentMatch(supabase, draft): Promise<CatalogMatch | null>` lives in `src/lib/wine-identity/server/match.ts`. The decision itself is the pure `pickConfidentMatch(draft, candidates)` in `match.ts`.

```ts
export type CatalogCandidate = {
  id: string;
  wineName: string | null;
  appellationId: string;
  colour: WineColour;
  vintageKind: VintageKind;
  vintageYear: number | null;
  vintageTawnyYears: number | null;
};
export type CatalogMatch = {
  catalogWineId: string;
  title: string;   // "{appellation name} {vintage}" — "Barbaresco DOCG 2018"
  meta: string;    // "★ 91 · 14 notes · in 6 cellars"
};
```

**Candidates.**
- Candidates exist only when `draft.producer` is `existing`, i.e. an existing producer folded-equal to the read. A bare title word can never anchor a match.
- The producer-text search and its leading-word retry (scan/actions.ts:51-146) are deleted.
- Candidates are the `catalog_wines` rows with `producer_id = draft.producer.id`, `merged_into is null` and `blind_pending = false`, ordered by `id`, limit 200. Hidden blind wines are never candidates (scan-2).

**Decision.** `pickConfidentMatch` returns a match only when all four conditions hold; otherwise it returns null.
1. **Vintage.** The draft's vintage is complete and was read (`vintage.read`). Candidates keep the same kind and:
   - for YEAR, the same year;
   - for TAWNY, the same `vintageTawnyYears`, so the tawny age is compared.

   An unread vintage is never a wildcard.
2. **Colour.** When `draft.colour` is set, the candidate's colour equals it.
3. **Several wines from one producer.** This applies when the producer has more than one wine identity among all its candidates. An identity is the distinct pair of `foldName(wineName ?? "")` and `appellationId`, across any vintage. Then both must hold:
   - `foldName(candidate.wineName ?? "")` equals `foldName(draft.wineName ?? "")`;
   - when `draft.appellationId` is set, the appellation ids are equal.
4. **Uniqueness.** Exactly one candidate survives.

**Match card meta.** Parts are joined with " · ":
- `★ {round(avg_score)}` when `catalog_wine_ratings.avg_score` is not null;
- `{note_count} note(s)` when that count is above 0;
- `in {holders} cellar(s)` from `catalog_wine_holdings([id])` (20260829255000) when above 0.

**No match.** The confirm screen shows the "Not in the catalog yet" branch, and Search lists near matches (C.5 A3).

**Other catalog searches** stop offering hidden wines too:
- A shared `withoutBlindPending(supabase, rows)` in the new `src/lib/catalog-visibility.ts` follows the `searchAddWine` pattern (add-wine/actions.ts:131-136).
- It filters `searchCellarCatalog` (cellar/new/actions.ts:208-243) and `searchCatalogForResolve` (catalog/unidentified/actions.ts:10).
- `searchCatalogWines` (wines/new/actions.ts:384-411) is deleted along with `wine-form.tsx`.

### B.7 Producer folded lookup (D6, D8; byhand-1, scan-3)

**SQL.** `find_producer_by_folded_name(p_name, p_region_id)` and `find_or_create_producer(p_name, p_region_id)` (E.2).
- Both sides are folded with `f_search_norm`.
- Ties go first to the given region, then to any producer with a region link, then by name and id.

**Server.** `resolveProducer(supabase, choice: RefChoice, regionId: string | null): Promise<string>` lives in `server/write.ts`.
- An `existing` choice is verified by id.
- A `pending` choice goes through `rpc("find_or_create_producer")`.

It replaces:
- `findOrCreateProducer` (tasting-wine-writes.ts:63-79);
- `createProducer` in catalog/new/actions.ts:60-78. Its callers, NewWineForm and CellarLotForm, now pass a pending name to the write instead of creating first;
- `createProducer` in wines/new/actions.ts:41, which WineIdentityFields uses for its inline create.

**By-hand form.**
- **Folded-equal hit.** When a typed name folds equal to a search hit (`foldName(hit.name) === foldName(typed)`), the form adopts that producer immediately and shows "matched". No duplicate is ever created.
- **Other hits.** A hit that is not folded-equal is offered as its own row, "Did you mean {name}? · Use". It is never shown as the chosen producer.
- **No folded-equal hit.** The name stays pending, with the hint "New producer — we'll add it when you save."

**`SearchableCombobox`** (src/components/searchable-combobox.tsx) hides its Add row when a hit folds equal to the query.

### B.8 Grape suggestion from the appellation (D8)

The server action is `suggestGrapeForAppellation(appellationId): Promise<{ grape: { id: string; name: string }; source: "place" | "catalog" } | null>`, in `src/components/add-wine/actions.ts`. The decision is the pure `pickGrapeSuggestion(placeGrapes, catalogCounts)`.

1. **Load the place's grapes.** Follow `appellations.wine_place_id` to the `wine_place_grapes` rows with `role = 'PRINCIPAL'` and `permitted`. RLS already limits reads to PUBLISHED rows on VERIFIED places (20260808090000:75-84).
2. **Suggest from the place:**
   - exactly one principal grape → suggest it (`source: "place"`);
   - several principal grapes, exactly one with `share_pct ≥ 60` → suggest that grape;
   - otherwise, continue to step 3.
3. **Fall back to the catalog.** Count `catalog_wines` rows with this `appellation_id`, `merged_into is null` and `blind_pending = false` (limit 500), grouped by `primary_grape_id`. If there are at least 3 wines and the top grape is at least 60% of them, suggest it (`source: "catalog"`).
4. **Otherwise**, no suggestion.

In the UI:

- The Grape field shows a "suggested" chip with the grape's name. Tapping it fills the grape, with provenance `appellation-suggestion`. It is never selected automatically.
- The note under the field depends on the source:
  - `place`: "{Appellation} is {Grape} by law — that is the appellation talking, not the producer. Change it if the bottle disagrees." (canvas A7)
  - `catalog`: "Most {Appellation} wines in the catalog are {Grape}. Change it if the bottle disagrees."

### B.9 The unified server write path

```ts
// src/lib/wine-identity/server/write.ts
import "server-only";

export type WriteRefusal = { error: string; missing?: WineFieldKey[] };

export type ResolvedWine = Omit<CompleteWine, "producer" | "blend" | "primaryGrape" | "secondaryGrape"> & {
  producerId: string;
  blend: { grapeId: string; percentage: number | null }[];
  primaryGrapeId: string;
  secondaryGrapeId: string | null;
};
export type ResolvedUnidentifiedWine = Omit<ResolvedWine, "producerId" | "colour" | "style" | "appellationId"> & {
  producerId: string | null;
  colour: WineColour | null;
  style: WineStyle | null;
  appellationId: string | null;
};

export async function resolveProducer(supabase: Db, choice: RefChoice, regionId: string | null): Promise<string>;
export async function findOrCreateGrapeFolded(supabase: Db, name: string): Promise<string>;
export async function prepareCompleteWine(supabase: Db, draft: WineIdentityDraft): Promise<{ wine: ResolvedWine } | WriteRefusal>;
export async function prepareUnidentifiedWine(supabase: Db, draft: WineIdentityDraft): Promise<{ wine: ResolvedUnidentifiedWine } | WriteRefusal>;
export async function upsertCatalogWine(supabase: Db, userId: string, wine: ResolvedWine): Promise<{ catalogWineId: string; written: boolean } | WriteRefusal>;
export async function fillCatalogWine(supabase: Db, userId: string, catalogWineId: string, wine: ResolvedWine): Promise<void>;
```

`prepareCompleteWine` runs these steps:

1. **Completeness.** Call `toCompleteWine(draft)`. If fields are missing, return `{ error: "This wine " + describeMissing(missing) + ".", missing }`.
2. **Consistency.**
   - The appellation's `region_id` must equal `regionId`. Otherwise return `{ error: "The appellation is not in the chosen region.", missing: ["appellation"] }`.
   - The region's `country_id` must equal `countryId`. Otherwise return `{ error: "The region is not in the chosen country.", missing: ["region"] }`.
3. **Producer.** Resolve it with `resolveProducer`, passing `regionId` as the region for a new producer.
4. **Grapes.** Existing ids are verified. Pending names go through `findOrCreateGrapeFolded`: folded equality over `grapes`, an insert on a miss, and one retry on 23505.
5. **Result.** It returns ids only.

`prepareUnidentifiedWine` does the same, but calls `toUnidentifiedWine` in step 1.

`upsertCatalogWine` runs three steps:
1. It looks the identity up, which sets `written`: true when no row existed.
2. It calls `rpc("find_or_create_catalog_wine", p)`, with `wine_name` null when blank.
3. It calls `fillCatalogWine`.

`fillCatalogWine` is one rule for every writer. It only touches a row whose `created_by` is the caller:

- **Image and description.** `image_url` and `description` are written only when empty, and `alcohol_percent` only when null. Today `addCellarLot` overwrites image and description unconditionally (cellar/new/actions.ts:98-120).
- **Blend.**
  - It is replaced only when both hold:
    - the stored `catalog_wine_grapes` rows still equal what the insert trigger seeds: the primary grape plus an optional secondary, all with null percentages;
    - the incoming blend differs.
  - So a curated blend is never overwritten. Today `syncCatalogWine` replaces it on every dedupe hit (tasting-wine-writes.ts:125-137).
  - When written, the full blend is written with its percentages (byhand-4, byhand-6).

These server writes MUST call the path:

| Write | Where | Change |
|---|---|---|
| Flight add from an identity | `insertTastingWineFromIdentity` (tasting-wine-writes.ts:287-351), called by `addToFlight` (add-wine/actions.ts:356-403) | Uses `prepareCompleteWine` + `upsertCatalogWine`. Its own required checks (:293-317) and the two-grape blend (:328-331) go. |
| Flight add, unidentified | new `insertTastingWineUnidentified`, which takes over the body of `addWineUnidentified` (wines/new/actions.ts:488-616) | Uses `prepareUnidentifiedWine`. Inserts the `wines` row first, then the unidentified row, then the answer. No cleanup relies on a delete that RLS forbids. `catalog_wines_unidentified` has no delete policy (20260829210000:45-58), so today's cleanup at :612 deletes nothing, and only the host may delete `wines` (init_schema.sql:392-393). When a later insert fails, a host's glass row is deleted. A contributor's glass stays, and reads as an incomplete glass they finish with Edit (C.8). |
| Flight add, incomplete | new `insertIncompleteGlass` (C.8) | `missingWineFields` must be non-empty. Stores the normalised draft. Refused for OPEN tastings (C.8). |
| Finish, edit or re-save a glass | new `saveFlightGlass` (C.8), replacing `updateWine` (wines/new/actions.ts:219-378) | Uses `prepareCompleteWine` or `prepareUnidentifiedWine`. `wine_answers_one_identity` requires exactly one identity column (20260829210000:67-68), so the swap happens in one statement. A glass that becomes identified clears `unidentified_wine_id`; today it is left set. A glass that becomes unidentified clears `catalog_wine_id`. |
| Cellar add from an identity | `addToCellar` (add-wine/actions.ts:405-484) | Uses `prepareCompleteWine` + `upsertCatalogWine`, then `add_cellar_lot` with `catalog_wine_id` only. |
| Catalog add from an identity | `addToCatalog` (add-wine/actions.ts:486-542) | Same. The catalog-source title lookup moves to `labelFor` (:37). |
| Note pick from an identity | the shell's note branch (today add-wine-sheet.tsx:402-432) | Goes through `addToCatalog`. |
| Catalog page create and Manage wine | `createCatalogWine` / `updateCatalogWine` (catalog/new/actions.ts:132-233) | Create uses `upsertCatalogWine`, so it links to an existing identity instead of raising `catalog_wines_identity_key`. Update uses `prepareCompleteWine`, and a 0-row update returns `{ error: "You can't edit this wine." }`. Both return errors instead of throwing. |
| Cellar page lot create | `addCellarLot` (cellar/new/actions.ts:46-139) | The identity branch uses `prepareCompleteWine` + `upsertCatalogWine` + `fillCatalogWine`. |

**Deleted, because the module replaces them:**

- `identityFromPrefill` (format.ts:77-116).
- `resolveIdentity` and `blendOf` (add-wine/actions.ts:544-594).
- `missingFields`, `buildIdentity`, `vintageOk`, `parseYear` (by-hand-logic.ts:178-251).
- `shouldStackPending`, `parseVintageYear`, `pendingProblemLabel` (scan-copy.ts:65-71, 93-107).
- `createScannedWine`, `resolveWinePrefill`, `identifyWineFromLabel` (scan/actions.ts).
- The required checks inside `addWine`, `updateWine` and `addWineUnidentified` (wines/new/actions.ts:164-191, 256-283, 515-532), together with those actions.
- The `required` HTML attributes on WineIdentityFields (wine-identity-fields.tsx:320, 340, 381-391).

**Client consumers** of `missingWineFields`, `describeMissing` and `describeUnread`:

- `read-confirm.tsx` (today `scan-confirm.tsx`): the chip, the primary action, the E1 chooser.
- `multi-add-stack.tsx` and the laptop pending list in `desktop-view.tsx`: row copy.
- `by-hand-form.tsx`: chips, focus, the refusal line.
- `wine-flight-list.tsx` and `tastings/[id]/page.tsx`: the "needs …" line.
- `flight-step.tsx`, through `listFlight` (tastings/new/actions.ts:364-479).
- `new-wine-form.tsx` `submit` (:160-178) and `cellar-lot-form.tsx` `submit` (:152-200): their required-field checks are replaced by `missingWineFields`, and they show `describeMissing`.

**Server gates** that read incomplete glasses through `tasting_incomplete_glasses` (E.3):

- `startTasting`
- `revealWine`
- `revealNextCategory`
- `revealFull`
- `maybeAutoRevealWine`
- `lockGuess`
- `lockGuesses`
- the host console page

The details are in C.8.

The legacy string "Country, region, appellation, grape, producer, colour and style are required." disappears. Every refusal now names its fields.
---

## 5. Part C — The add-wine sheet (handoff; D4–D13)

### C.1 Contracts (`src/components/add-wine/types.ts`)

types.ts:3-7 says to change the spec first. So the contracts block is replaced below, and the 2026-09-12 flows spec's "Contracts" section gets a one-line pointer here.

```ts
export type AddWineDestination =
  | {
      kind: "flight";
      tastingId: string;
      tastingName: string;
      revealMode: RevealMode;
      wineSource: WineSourceMode;
      position: number;            // existing wine count + 1; re-read after each add
    }
  | { kind: "cellar" }
  | { kind: "catalog" }
  /** Taste & rate: one wine, then its WSET note opens (D4; was "rate"). */
  | { kind: "note" };

export type AddWineStart = "camera" | "search" | "cellar" | "byhand";

export type AddWineOpenOptions = {
  start?: AddWineStart;            // routed by canScan (C.3); cellar and byhand open those views on every device
  multi?: boolean;                 // ignored for note
  onAdded?: (added: AddedWine) => void;
  /** flight only: open the by-hand form on an existing glass (Edit; finishing an incomplete glass) */
  edit?: { wineId: string };
};

/** wines.added_via (E.3) */
export type AddedVia = "SCAN" | "CATALOG" | "CELLAR" | "BY_HAND";

export type AddSource =
  | { kind: "catalog"; catalogWineId: string; via: "scan" | "search" }
  | { kind: "lot"; lotId: string; consume: boolean; catalogWineId?: string }
  | { kind: "plusOne"; lotId: string }                                          // cellar destination, a wine you own (D9)
  | { kind: "identity"; draft: WineIdentityDraft; via: "scan" | "byhand"; readId: string | null }
  | { kind: "unidentified"; draft: WineIdentityDraft }                          // flight only (byhand-7)
  | { kind: "incomplete"; draft: WineIdentityDraft; via: "scan" | "byhand" };   // flight only (D7)

export type AddedWine = {
  label: string;                   // "Produttori del Barbaresco 2018"
  destination: "flight" | "cellar" | "catalog";
  catalogWineId: string | null;    // null for an incomplete or unidentified glass
  glass?: number;                  // flight
  wineId?: string;                 // flight: wines.id
  lotId?: string;                  // cellar
  incomplete?: { missing: WineFieldKey[] };
  written?: boolean;               // catalog: a new row was created (D3's header)
};

export type AddResult =
  | { ok: true; added: AddedWine; warning?: string }
  | { error: string; missing?: WineFieldKey[] };

/** What a note pick hands the provider (was RatePick). */
export type NotePick = { catalogWineId: string; lotId?: string | null; consume?: boolean };

/** The tasting a destination-less add can go to. */
export type FlightHint = {
  tastingId: string;
  tastingName: string;
  position: number;
  phase: "live" | "self-paced" | "next";   // D12 / entry-4; was `live: boolean`
  revealMode: RevealMode;
  wineSource: WineSourceMode;
};
```

This is the final shape. While the chain runs, `phase` lands optional next to a deprecated `live?`. It becomes required once every hint producer passes it (plan F11, S5c).

**`SearchGroups` rows** (types.ts:61-74) change in two ways:
- Catalog and tasted rows gain `producerId: string`, `wineName: string | null`, `appellationId: string` and `vintageLabel: string`, so D1's row metas can compare a row with a draft (C.5 D1). `search_catalog_wines` returns names only (20260901112000:13-26), so `searchAddWine` fills these with one `catalog_wines` select `in("id", …)` after the RPC.
- Tasted rows gain `inFlight: boolean` (sources-8).

**Removed from types.ts**
- The types `PendingScan`, `PendingFix`, `RatePick` and `ByHandIdentity`.
- The `WineFormInitial` imports.
- `SheetContext.isDesktop` and `SheetContext.hasCamera`, replaced by `canScan` and the matrix.
- `MultiAddStackProps.nextGlass`, and the unused `onBack` props (types.ts:195-197, 222).

**`addedVia(source)`** maps a source to `wines.added_via`:

| Source | `added_via` |
|---|---|
| `catalog` from a scan | SCAN |
| `identity` from a scan | SCAN |
| `incomplete` from a scan | SCAN |
| `catalog` from search | CATALOG |
| `lot` | CELLAR |
| `identity` by hand | BY_HAND |
| `incomplete` by hand | BY_HAND |
| `unidentified` | BY_HAND |

**`addToFlight(destination, source)`** dispatches by source kind:

| Source | Handler |
|---|---|
| `catalog` | `insertTastingWineFromCatalogRow` |
| `lot` | `insertTastingWineFromLot` (C.7) |
| `identity` | `insertTastingWineFromIdentity` |
| `unidentified` | `insertTastingWineUnidentified` |
| `incomplete` | `insertIncompleteGlass` (C.8) |

**`addToCellar`** handles `plusOne` with `increaseCellarLotQuantity(lotId, 1)` (cellar/new/actions.ts:175-205).

### C.2 The matrix (`src/components/add-wine/matrix.ts`, D4)

**The lookup.** It takes two inputs: the destination (null is "none") and `canScan`. Every view reads from it.

**What moves into it.** These copy helpers and rules branch on the destination today. They move into the matrix and are deleted from their current homes:
- scan-copy.ts: `primaryAddLabel`, `consumeLabel`, `flightHintSubtitle`, `addedWhere` (:22-38, 79-81).
- desktop-format.ts: `rowActionLabel`, `enterHint`, `footerButtonLabel`, `footerSentence`, `uploadZoneCopy`, `uploadZoneLabels` (:112-162, 220-254).
- by-hand-logic.ts: `actionLabel` (:253-261).
- The header title and eyebrow blocks in add-wine-sheet.tsx:619-656.
- The destination rules in the views:
  - `single` and `showCellar` in camera-view.tsx:46-48;
  - `includeCellar` in desktop-view.tsx:86-93;
  - the cellar-group rules in search-view.tsx:95-104;
  - the cellar modes in cellar-view.tsx:89-102.

**What stays put.** `flightNote` (scan-copy.ts:47-57) stays where it is, because it branches on reveal mode and wine source, not on the destination. The matrix calls it.

**The grep gate (G.1).** No add-wine view may test `destination?.kind ===` or `dest.kind ===`. Only two places branch on the kind:
- the shell's write dispatch: `add-wine-sheet.tsx`, its adds hook `use-sheet-adds.ts`, and the pure dispatch helpers `routeAdd` and `itemRowCopy` in `sheet-state.ts`;
- the server actions.

```ts
export type DestinationKind = "flight" | "cellar" | "note" | "catalog" | "none";

export type SheetMatrix = {
  kind: DestinationKind;
  home: "camera" | "desktop";
  eyebrow: string | null;
  title: (phase: "home" | "read") => string;
  multiTitle: string | null;
  searchPlaceholder: string;
  enterHint: string;
  chips: readonly ("cellar" | "byhand")[];
  showMany: boolean;
  searchGroups: readonly ("cellar" | "catalog" | "tasted")[];
  cellarGroupSubtitle: ((bottles: number) => string) | null;
  row: (r: { source: "lot" | "catalog" | "tasted"; inFlight: boolean; owned: boolean }) => {
    label: string;
    action: "add" | "plusOne" | "open" | "pick" | "choose";
    disabled: boolean;
    affordance: "plus" | "chevron";          // phone; the laptop always draws RowActionButton with `label`
  };
  consumeLabel: string | null;
  inFlightMeta: string;                        // "in flight": the phone row meta; the laptop button reads "In flight"
  cellarSource: boolean;
  upload: { multiple: boolean; title: string; body: string; drop: string; choose: string };
  cellarTileSubtitle: ((summary: CellarSummary | null) => string) | null;
  byHandTileSubtitle: string;
  lotPreviewTile: boolean;
  leadLine: string | null;
  neitherOfThese: boolean;
  resultCount: (n: number) => string;
  footer: { primary: string; secondary: string | null; button: "Done" | "Close"; sentence: (added: number) => string };
  confirm: { eyebrowMatch: string; eyebrowNoMatch: string; primaryMatch: string; primaryNoMatch: string; note: string | null };
  byHand: { eyebrow: string; footerNote: string; primary: (finishing: boolean) => string; unidentifiedToggle: boolean };
  partialRead: { single: "incomplete-glass" | "by-hand"; stacked: "incomplete-glass" | "pending-row" | "by-hand"; skipConfirm: boolean };
  followUps: readonly ("cellar" | "note")[];
};

export function sheetMatrix(destination: AddWineDestination | null, canScan: boolean): SheetMatrix;
```

**How to read the tables below**
- `home` is `"camera"` when `canScan` is true and `"desktop"` otherwise, for every destination.
- `{N}` is `destination.position` and `{tasting}` is its `tastingName`.
- "Scan" marks a cell used when `canScan` is true; "Upload" marks one used when it is false.

**Header, camera, search field**

| Output | flight | cellar | note | catalog | none |
|---|---|---|---|---|---|
| `eyebrow` (Scan) | {tasting} | Cellar | Taste & rate | Catalog | — |
| `eyebrow` (Upload) | {tasting} · blind / semi-blind / open | Cellar | Taste & rate | Catalog | — |
| `title` | Add wine · glass {N} | Add a bottle | Scan: Which wine? · Upload: Which wine are you tasting? | Add a wine | Scan: Scan (home), Scanned (after a read) · Upload: Add wine |
| `multiTitle` | Adding to the flight | Adding to the cellar | — | Adding to the catalog | Adding wines |
| `searchPlaceholder` | Scan: Or search wine catalog · Upload: Search by producer, wine or appellation | same | same | same | same |
| `enterHint` (Upload) | ↵ adds the first hit | ↵ adds the first hit | ↵ opens a note on the first hit | ↵ opens the first hit | ↵ adds the first hit |
| `chips` (Scan) | My cellar · By hand | By hand | My cellar · By hand | By hand | My cellar · By hand |
| `showMany` (Scan) | yes | yes | no | yes | yes |

- The camera always shows Library.
- There is no Catalog chip anywhere, because the search field is the catalog.

**Search and result rows**

| Output | flight | cellar | note | catalog | none |
|---|---|---|---|---|---|
| `searchGroups`, in this order | In your cellar · In the catalog · You have tasted before | In your cellar · In the catalog · You have tasted before | In your cellar · In the catalog · You have tasted before | In the catalog · You have tasted before | In your cellar · In the catalog · You have tasted before |
| `cellarGroupSubtitle` | {n} bottles you can pour tonight | — | — | — | — |
| lot row | "Add as glass {N}", + disc; disabled "in flight" (C.9) | "+1 bottle" (`plusOne` on that lot) | "Start the note", › | not listed | "Add" → chooser |
| catalog / tasted row | "Add as glass {N}", + disc; disabled "in flight" (C.9) | "Add to cellar", + disc | "Start the note", › | "Open" (link to `/catalog/{id}`), › | "Add" → chooser |
| `consumeLabel` | Take it out of the cellar when we pour it (checked) | — | Take a bottle out of the cellar when I save the note (checked) | — | Take it out of the cellar when we pour it (checked; see F.3 Q18) |
| `cellarSource` (tile, chip, A6) | yes | no | yes | no | yes |
| `inFlightMeta` | in flight | in flight | in flight | in flight | in flight |
| `resultCount` | {n} found | {n} found | {n} found | {n} near matches | {n} found |

- A wine you own is listed once, as its lot rows; its catalog row is deduped (`flattenSearchGroups` in desktop-format.ts).
- On the laptop, each row carries the same outlined `RowActionButton` with the label above.
- On the phone, rows use the + disc or the chevron instead.

**Laptop surfaces (Upload)**

| Output | flight | cellar | note | catalog | none |
|---|---|---|---|---|---|
| `upload.multiple` | yes | yes | no | yes | yes |
| `upload.title` | Upload label photos | Upload label photos | Upload a label photo | Upload label photos | Upload label photos |
| `upload.body` | Drop in the photos you took of the bottles — several at once. Each one is read and matched exactly as it is on the phone, and lands in this flight. | Several at once — a delivery of six is one drop. Each lands in your cellar. | Read and matched exactly as it is on the phone, then the note opens. | Read a label and it fills the form below — still checked against the catalog before it is written. | today's `uploadZoneCopy(null)` (desktop-format.ts:220-254), unchanged |
| `upload.drop` · `upload.choose` | Drop photos here · or choose files · JPG, PNG, up to 5MB each | Drop photos here · or choose files | Drop a photo here · or choose a file | Drop photos here · or choose files | unchanged |
| `cellarTileSubtitle` (the "From my cellar" tile) | {n} bottles · {m} ready to drink | — | {n} bottles · rating one you own is the common case | — | {n} bottles · {m} ready to drink |
| `byHandTileSubtitle` (the "Add it by hand" tile) | Producer, name, vintage, colour | Producer, name, vintage, colour | Producer, name, vintage, colour | Producer, name, vintage, colour | Producer, name, vintage, colour |
| `lotPreviewTile` | — | "Then: quantity, rack, price" | — | — | — |
| `leadLine` | — | — | Scanning lives on your phone and tablet, where the camera faces the bottle. It is not offered here. | First, check it is not already here | — |
| `neitherOfThese` | — | — | — | "Neither of these" · "Continue and create a new entry", under the results | — |

**Footers, confirm, by hand, afterwards**

| Output | flight | cellar | note | catalog | none |
|---|---|---|---|---|---|
| `footer.primary` | Add as glass {N} | Add to cellar | Start the note | Add to the catalog | Choose where it goes (opens the E1 chooser) |
| `footer.secondary` (Scan) | Add and scan the next | — | — | — | — |
| `footer.sentence` (Upload) | Glasses 1–{N−1} are set. Adding does not close this — keep going until the flight is full. (plus today's 0- and 1-glass variants, desktop-format.ts:141-162) | Nothing added to your cellar yet. Adding does not close this — keep going. / Added {k} to your cellar so far. Adding does not close this — keep going. | the `leadLine` | Adding here only records the wine. The sheet then asks what you want to do with it. | today's sentence, unchanged |
| `footer.button` (Upload) | Done | Done | Close | Done | Done |
| `confirm.eyebrowMatch` | Matched in the catalog | Matched in the catalog | Matched in the catalog | Already in the catalog · nothing new will be written | Found in the catalog |
| `confirm.eyebrowNoMatch` | Not in the catalog yet | Not in the catalog yet | Not in the catalog yet | Not in the catalog yet | Not in the catalog yet |
| `confirm.primaryMatch` | Add as glass {N} | Add to cellar | Start the note | Yes, that is the wine | the chooser rows |
| `confirm.primaryNoMatch` | Add as glass {N} | Add to cellar | Start the note | Add it | the chooser rows |
| `confirm.note` | `flightNote(destination)`, e.g. "Only you see this until the reveal. Tasters see “glass {N}”." | — | — | Confirming only tells us we have the right wine. What happens to it comes next. | — |
| `byHand.eyebrow` | Add wine · glass {N} · by hand | Cellar · by hand | Taste & rate · by hand | Catalog · by hand | Add wine · by hand |
| `byHand.footerNote` | Only you see this until the reveal. It joins the catalog once this glass is revealed. | Saved to the catalog too, so nobody types it again. | Saved to the catalog too, so nobody types it again. | Saved to the catalog too, so nobody types it again. | Saved to the catalog too, so nobody types it again. |
| `byHand.primary` | new: Add as glass {N} · finishing: Save · glass {N} | Add to cellar | Start the note | Add to the catalog | Choose where it goes |
| `byHand.unidentifiedToggle` | yes | no | no | no | no |
| `partialRead.single` | incomplete-glass (explicit add); by-hand in an OPEN tasting (C.8) | by-hand | by-hand | by-hand | by-hand, after the chooser pick |
| `partialRead.stacked` (Many; several photos picked or dropped at once turn Many on, C.4) | incomplete-glass (explicit add); pending-row in an OPEN tasting | pending-row | by-hand (a note is a single pick) | pending-row | pending-row |
| `partialRead.skipConfirm` | no | no | yes: a partial read opens A7 directly (D7) | no | no |
| `followUps` | terminal | terminal | terminal | Add it to my cellar · Taste & rate it now (D3) | the chosen destination's rule; "save to the catalog only" is terminal |

**After an add**

- **Flight, cellar and note** end there. There is no follow-up.
- **Phone, single add:** the sheet closes. Flight and cellar also refresh the route.
- **Many, or the laptop:** the sheet stays open.
- **Cellar** adds go through the lot step first (C.5 B1/B2).
- **Note:** the sheet closes and opens `NewNoteModal`.
- **Catalog, single add:** goes to D3.
- **Catalog, Many or a laptop queue:** stacks an "Added to the catalog" or "Already in the catalog" row and skips D3.

### C.3 `canScan` (D5)

New `src/components/add-wine/use-can-scan.ts`:

```ts
export async function detectCanScan(env: {
  matchMedia: (query: string) => { matches: boolean };
  mediaDevices: MediaDevices | undefined;
}): Promise<boolean> {
  if (!env.matchMedia("(pointer: coarse)").matches) return false;
  const md = env.mediaDevices;
  if (!md) return false;
  if (typeof md.enumerateDevices === "function") {
    try {
      return (await md.enumerateDevices()).some((d) => d.kind === "videoinput");
    } catch {
      // unavailable → fall through to getUserMedia presence
    }
  }
  return typeof md.getUserMedia === "function";
}

/** null until resolved. Re-runs on a (pointer: coarse) change and on mediaDevices "devicechange". */
export function useCanScan(): boolean | null;
```

**Rule**
- `canScan` is true only with a coarse pointer and a video input device.
- If `enumerateDevices` is unavailable, `getUserMedia` presence stands in for the device check.
- It is never a user-agent sniff.
- When it is false, Upload replaces Scan. The sheet never shows both.

**Caching.** The resolved value is cached in a module variable, so a reopened sheet paints the right view straight away.

**Development override.**
- `process.env.NEXT_PUBLIC_FORCE_CAN_SCAN === "1"` resolves to true, but only when `process.env.NODE_ENV !== "production"`.
- It exists because the Browser pane's phone emulation has no camera (G.4).
- Production never reads it.

**First paint.**
- While `useCanScan()` is `null`, the sheet renders its header and a neutral body (`WineGlassLoader`, no copy).
- It never renders the camera or the laptop view before the value resolves.
- Today the view is chosen synchronously (add-wine-sheet.tsx:174-183).

**Denied camera.** A device that can scan but whose camera is denied or busy keeps today's fallback, "Camera not available — use Library or search" (camera-view.tsx:100-107, 161-167). That is runtime state, not capability.

**What changes in use-camera.ts**
- `isTouchPrimary`, `useTouchPrimary`, `startViewFor`, `homeViewFor` and `viewForDevice` (use-camera.ts:29-95) are replaced by:
  - `startViewFor(start, canScan)`: `cellar` and `byhand` open those views; `camera`, `search` and undefined open the camera when `canScan`, otherwise the laptop view.
  - `homeViewFor(canScan)`.
- `cameraSupported` (use-camera.ts:12-17) stays for the camera hook's own states.
- `useMediaQuery` (use-camera.ts:46) becomes the shared width hook (D14).

**Consumers**

| Consumer | Today | With `canScan` |
|---|---|---|
| The sheet's initial and home view | touch rule (add-wine-sheet.tsx:174-183) | `startViewFor(start, canScan)` |
| Header `ScanButton` | touch aria-label, CSS glyph (scan-button.tsx:22-49) | true: `Camera` icon, label "Scan a label" · false: `ImagePlus` icon (round 1's mouse glyph), label "Upload a label photo" · unresolved: today's CSS `pointer-coarse` glyph, label "Scan or upload a label". A mouse device paints ImagePlus from the server HTML and keeps it. Only a coarse-pointer device with no camera swaps its glyph after hydration. |
| The search view's header Scan pill | `touch && hasCamera` (add-wine-sheet.tsx:787-802) | `canScan` |
| The search view's inline Scan for touch without a camera | search-view.tsx:113 | removed; `canScan` false means the laptop view |
| "Scan instead" on by hand | touch rule | replaced by "Search instead" (C.5 A7) |
| Host console "Add a wine" | width query (console.tsx:166-180) | `start: "camera"`; the sheet routes (D13) |
| Create sheet step 2, first chip | touch rule (flight-step.tsx:167) | `canScan`: "Scan a label" · otherwise "Upload photos" |
| Create sheet `isDesktop` | private `useMediaQuery` (new-tasting-sheet.tsx:45-57) | the shared `useMediaQuery` from use-camera.ts (D14) |

### C.4 The shell and its state

**New file.** `src/components/add-wine/sheet-state.ts` is pure. It holds the reducer, the actions and the selectors, and has vitest coverage.

**The sheet component.**
- `add-wine-sheet.tsx` renders from `useReducer(sheetReducer, initialSheetState(props))`.
- It runs the uploads and the reads.
- The writes live in its adds hook, `use-sheet-adds.ts`: `performAdd`, chooser adoption, follow-ups, edit, by-hand save, "Leave it for later" and close.
- Async handlers read `stateRef.current`, which replaces `destRef` and `multiRef` (add-wine-sheet.tsx:184-201).
- `AddWineProvider` (add-wine-context.tsx:284-296) keys the sheet by an open counter, so every open starts fresh.

```ts
export type SheetView =
  | "resolving" | "camera" | "desktop" | "reading" | "confirm" | "search"
  | "cellar" | "byhand" | "lot" | "choose" | "followup";

export type ScanItem = {
  id: string;
  photoUrl: string;                 // local blob URL for the thumbnail
  blob: Blob | null;                // kept until the read succeeds (Retry)
  imagePath: string | null;         // set once uploaded
  status: "uploading" | "reading" | "failed" | "read" | "pending" | "added" | "incomplete";
  read: LabelPhotoRead | null;      // A.5
  draft: WineIdentityDraft | null;  // owned by the sheet; edits land here
  added: AddedWine | null;
  error: string | null;             // a failed add's server message, kept on the row
};

export type ByHandSession = {
  draft: WineIdentityDraft;
  origin:
    | { kind: "new" }
    | { kind: "item"; itemId: string }                         // Fix / By hand from a read
    | { kind: "match"; itemId: string }                        // By hand from a matched read
    | { kind: "glass"; wineId: string; incomplete: boolean };  // Edit on the flight page
  unidentified: boolean;
  focusField: WineFieldKey | null;
  attempted: boolean;                                          // show the refusal line after a save with gaps
  dirty: boolean;
};

export type SheetState = {
  view: SheetView;
  history: SheetView[];
  requested: AddWineDestination | null;   // from the launcher; never changes
  positionOverride: number | null;        // a flight's next glass after adds (positionAdvanced); currentDestination applies it
  start: AddWineStart | undefined;        // the launcher's start, applied once canScan resolves
  adopted: AddWineDestination | null;     // a chooser pick or a D3 follow-up; reset when that add fails
  canScan: boolean | null;
  multi: boolean;
  items: ScanItem[];
  activeItemId: string | null;
  queue: string[];                        // item ids waiting to upload and read, one at a time
  byHand: ByHandSession | null;
  search: { query: string };
  desktop: { query: string; focusedRow: number; consume: boolean };
  cellar: { filter: CellarFilter; selectedLotId: string | null; consume: boolean };
  lot: { source: AddSource; quantity: number; rack: string; price: string } | null;
  chooseFor: { source: AddSource | null; itemId: string | null; title: string; missing: WineFieldKey[] } | null;
  followUp: { catalogWineId: string; title: string; written: boolean } | null;
  added: AddedWine[];
  addedRowKeys: string[];                 // "lot:<id>" / "wine:<catalogWineId>" poured this session (rule 11)
  lastRack: string | null;                // the B1 preview tile's rack chip
  closeAsk: { unfinished: number } | null;
  closing: boolean;
  error: string | null;
};
```

Rules:

1. **The sheet owns the draft (RC8).**
   - `ByHandForm` is controlled through `session` and `onChange`.
   - Leaving the form keeps `byHand`. That covers ←, "Search instead" and going back to the confirm screen.
   - Re-entering from the same origin reuses that session. The By hand chip reopens an unsaved `new` session.
   - A session ends only on a successful save, on Discard, or when the sheet closes.
   - These also live in state, so they survive navigation:
     - the search query;
     - the laptop query and focused row;
     - the cellar filter, selection and consume choice;
     - the lot-step fields.
   - Today CameraView, CellarView, the lot view and DesktopView reset on every return (add-wine-sheet.tsx:864-948).
2. **Items survive failures.**
   - An item leaves `pending` or `read` only when the server returns `ok`.
   - Fix never removes the row first; today it does (add-wine-sheet.tsx:557).
   - A failed add keeps the item, with the server's message on it.
3. **Reads run one at a time.**
   - Several photos picked or dropped at once (an `enqueue` with more than one item) turn `multi` on. A laptop queue then stacks partial reads as pending rows, exactly as Many does (`stackPartialRead`). A single upload still opens the confirm view.
   - Each queued item goes `downscaleForRead` → upload → `readLabelPhoto` → `read` or `failed`.
   - A failure never clears another row's error or the queue (scan-8; today add-wine-sheet.tsx:268, 304-306).
   - The drain continues after cleanup.
4. **A failed read is a row (D6).**
   - It reads "Couldn't read this photo" · Retry · Remove.
   - It appears in the multi stack and the laptop list; for a single scan it replaces the confirm body.
   - It is never a modal and never dropped.
   - Retry re-reads the uploaded path, or re-uploads the kept blob.
5. **The chooser can be revisited.** A chooser pick sets `adopted`. If that add fails, `adopted` goes back to null and the view returns to `choose` with the error (scan-4).
6. **No silent destination.**
   - A cellar lot picked with no destination goes to the chooser (D12).
   - The silent adoption at add-wine-sheet.tsx:443-447 is deleted.
7. **Closing with unfinished work (D7).**
   - This triggers on ✕ or Done while any item is `pending`, `failed` or `read` but not added, or while the by-hand session is `dirty`.
   - The shell sets `closeAsk`, and the footer reads "{n} wine not added yet" or "{n} wines not added yet", with "Discard" and "Keep going". No modal.
   - Incomplete flight glasses have already been added, so they never count.
8. **One sheet, no nested dialogs.** The sheet stays mounted for the whole interaction.
9. **Synchronous focus (CLAUDE.md combobox rule).**
   - A phone raises its keyboard only when `.focus()` runs synchronously inside the tap, on an input that is already mounted.
   - So the search view and the by-hand form are mounted but hidden from the first paint after `resolving`. The form renders an empty session until a real one exists, so its field refs exist before any tap. Today `ByHandForm` mounts only when it is first needed (add-wine-sheet.tsx:852).
   - "Or search wine catalog", Fix and By hand wrap their state change in `flushSync` and call `.focus()` in the same handler.
   - Fix focuses the missing field. That is the vintage year input, which renders whenever the vintage kind is YEAR or unset, or else the first missing combobox trigger.
   - Opens that start outside the sheet cannot focus inside a gesture. These are Edit on the lobby, which awaits `loadFlightGlassForEdit`, and `?addWine=` / `?editWine=`.
     - On a mouse device they focus the field once it loads.
     - On a touch device they scroll the field into view and flag it; the user's own tap raises the keyboard.
10. **Back.**
    - `history` is a stack, and ← pops it.
    - It skips `reading`, `lot` and `choose`, as today (add-wine-sheet.tsx:244-262).
    - An empty stack goes to the home view.
11. **A wine just added reads "in flight" at once** (sources-2 item 3; the handoff's "Optimism").
    - A successful flight add from a row adds that row's key to `addedRowKeys`. `markAddedInFlight` marks the row in flight in the rendered groups before any refetch.
    - The shell then re-runs `searchAddWine` for the current query with the current tasting id: the flight destination's, or the flight hint's when there is no destination.
    - Enter on a disabled row does nothing, so pressing Enter twice never pours the same wine twice.
    - Rows appear before the server answers. A queued photo's "Reading the label…" row shows at enqueue, and a row's button shows its loader while the add runs. The result then reconciles the row.

`sheet-state.ts` exports:
- `sheetReducer` and `initialSheetState`;
- `currentDestination(state)`: `adopted ?? requested`, with a flight's `position` replaced by `positionOverride` when that is set. `requested` itself never changes;
- `unfinishedCount(state)`;
- the pure dispatch helpers `itemRowCopy(item, destination)` and `routeAdd(state, source)`;
- `stackPartialRead(state, missing, matrix)`, which is `state.multi && missing.length > 0 && matrix.partialRead.stacked === "pending-row"`;
- `markAddedInFlight(groups, addedRowKeys)`;
- `footerCount(state)`.

### C.5 The screens

**Primitives.** Rebuild the canvas from the repo's own components:
- `Button`, `Badge`, `Card`, `Sheet`, `Popover`, `ReferenceCombobox` and `SearchableCombobox`;
- the lucide icons `Camera`, `Upload`, `Search`, `Wine`, `Grape`, `Plus`, `ChevronRight`, `RotateCcw` and `Pencil`.

**Tokens.** Use the tokens in `globals.css`:
- `--primary` and `--gold`;
- `--gold-dark` for small gold text such as "READ OK" and "needs a vintage";
- `--gold-light` for gold on a dark background.

**Styling.** Hover states, radii, shadows and the hatched placeholder follow the handoff's "Design tokens" and "States and behaviour" sections. The desktop hover states are checked in review (plan G2, reviewer 3).
- Touch targets are at least 44 px tall on phones and tablets (handoff: "never below 44px tall for a mobile tap target").
- The laptop's `RowActionButton` keeps round 1's 36 px (desktop-view.tsx:514).
- Nothing is smaller than 10 px.

#### A1 · The flight page

Files: `src/app/tastings/[id]/page.tsx`, `wine-flight-list.tsx`, `tasting-add-wine-button.tsx`.

**The Add button**
- Only the Wines card changes.
- Its title row gets the Add button, with today's label: "Add wine" when `wine_source === "HOST_PROVIDES"`, otherwise "Add a wine".
- The host of a host-provides tasting sees the subtitle "{n} wines · only you can see them", or "1 wine · only you can see them". Nobody else gets a subtitle (§2.1 row 15).
- The button opens `{ kind: "flight", tastingId, tastingName, revealMode, wineSource, position: wines.length + 1 }` with no `start`.

**Who may add** — scan-7, sources-5, entry-2.
- `canAddWine` (page.tsx:120-123) becomes `tasting.status !== "CLOSED" && (wine_source === "HOST_PROVIDES" ? isHost : myStatus === "JOINED")`.
- It gates the Add buttons (page.tsx:246, 500-504, 564-568) and `TastingScanRegistrar` (:417-425).

**Rows**
- Every row keeps "Wine N" or `contributorLabel`, the Hidden / Added / Revealed badge, Edit, and ▲▼ with the optimistic swap (wine-flight-list.tsx:52-135).
- The adder sees two extra lines on their own rows. The adder is the host for a glass with no contributor, or the contributor for their own bottle (the D10 knowledge rule, C.9).
- **Complete glass.**
  - First line: the wine's title, e.g. "Vietti, Barolo Castiglione 2017".
  - Second line: "{appellation} · {region} · {primary grape} · {source}", e.g. "Barolo DOCG · Piedmont · Nebbiolo · scanned".
  - `{source}` comes from `wines.added_via`: SCAN → "scanned", CATALOG → "from the catalog", CELLAR → "from my cellar", BY_HAND → "by hand". A legacy row with null leaves it out.
- **Incomplete glass** (a glass with no answer key).
  - First line: the draft's title, e.g. "Brovia, Barolo Villero".
  - Second line, in dark gold: "{describeMissing} — tap Edit to finish", e.g. "needs a vintage — tap Edit to finish".
  - A glass with neither an answer key nor a draft (a failed second write; B.9, C.8) reads the same way, with every field missing.
- **Data.**
  - These lines replace `hostWineIdentity` (page.tsx:146-195).
  - Names come from `lookupAppellationAndProducerNames`.
  - Drafts come from `wine_identity_drafts` for the tasting's wine ids; the table's RLS limits each user to their own drafts.

**Edit** (adder only)
- A complete glass is editable while the tasting is DRAFT and the wine is unrevealed.
- An incomplete glass is editable whenever the tasting is not CLOSED and the wine is unrevealed.
- Edit opens the sheet on the by-hand form with `edit: { wineId }` (C.8). This replaces the link to `/wines/[wineId]/edit` (wine-flight-list.tsx:97-107).

**No bring-your-own slots**
- In `PARTICIPANT_CONTRIBUTED` tastings, every JOINED participant without a wine gets a row "waiting for {name} to add it".
- These rows show even when the flight is empty.
- They replace the italic "Yet to add a wine:" line (page.tsx:250-267).

**Unchanged:** Start, the cogwheel and the Participants card.

#### A2 · The camera (B2, C2 and D2 use the same view)

File: `camera-view.tsx`.

**Header and search**
- The header holds ✕ plus the eyebrow and title from the matrix, e.g. "Add wine · glass 4".
- The field "Or search wine catalog" sits above the viewfinder. Tapping it opens A5 and focuses the input in the same tap.

**Viewfinder**
- It fills the remaining height, with a 16 px radius and gold corner brackets.
- It shows "Fill the frame with the label", with a "Flash auto" chip at the top left.

**Controls**
- The shutter row has a 74 px shutter, Library on the left and Many on the right. Many follows `showMany`, so it is hidden for a note.
- Full-width source chips sit below, from `matrix.chips`:
  - "My cellar · By hand" for flight, note and none;
  - "By hand" for cellar and catalog.
- The Catalog chip is removed (camera-view.tsx:216-220).

**In Many**
- The multi stack (A4) sits above the viewfinder.
- For a flight it shows "Next bottle · glass N".
- The footer reads "Done · N wines added".

#### A3 / D2b · Read and confirm, one component

Files: `scan-confirm.tsx` becomes `read-confirm.tsx` (`ReadConfirm`). The 7i `Chooser` export moves into it as the no-destination footer (E1).

**States**
- **Reading** (`ReadingView`): the photo, the scanline, `WineGlassLoader` and "Reading the label…".
- **Read**: the layout below.
- **Failed**: the failed row from C.4 rule 4.

**Layout, when read**
- **Photo and panel.** The captured photo stays visible at the top; the lower two-thirds is a light panel.
- **Identity.** `display.title` in Cormorant 21 px, with `display.meta` muted below it, e.g. "Barbaresco DOCG · Piedmont · Italy · Nebbiolo". A pending producer reads "{name} · new producer" (D6, scan-3).
- **Read chip.**
  - Complete, confidence not low: "READ OK", a gold pill with dark-gold text.
  - Complete, confidence low: "CHECK THE READ".
  - Incomplete: `describeUnread(missing)` in uppercase (e.g. "NO VINTAGE READ"), with a bordered "Fix" button beside it.
- **Match card.** At most one, and only for a confident match (B.6):
  - eyebrow `confirm.eyebrowMatch`, gold border, check disc;
  - `match.title`, e.g. "Barbaresco DOCG 2018";
  - `match.meta`, e.g. "★ 91 · 14 notes · in 6 cellars".

  With no match: the eyebrow "Not in the catalog yet" and no card. The alternates list and "Use this" are removed.
- **Recovery.** "Wrong bottle?" followed by three equal outlined buttons with icons: Rescan (`RotateCcw`), Search (`Search`), By hand (`Pencil`). Buttons, not text links.
- **Footer.** The context note (`confirm.note`), then the destination footer.

**Actions**
- **Primary.**
  - Match: adds `{ kind: "catalog", catalogWineId, via: "scan" }`.
  - Complete, no match: adds `{ kind: "identity", draft, via: "scan", readId }`.
  - Incomplete: follows `partialRead.single`.
    - A flight that is not OPEN adds `{ kind: "incomplete", draft, via: "scan" }`.
    - Every other destination opens By hand with the gap focused.
    - A note never reaches this screen with a partial read: `partialRead.skipConfirm` opens A7 straight from the read (D7).
- **Add and scan the next** (flight, Scan only): the same add, then Many turns on and the camera returns. For cellar or catalog in Many, an incomplete read never reaches this screen; it stacks as a pending row instead (`partialRead.stacked`).
- **Fix** and **By hand**: open A7 with `origin: item`, focused on the first missing field. From a matched read the origin is `match`, and the draft comes from `draftFromCatalogWine` plus the read's photo.
- **Search**: opens A5 with the query `"{producer} {wineName}"`, so near matches are listed (D6).
- **Rescan**: back to the camera, or on to the next queued photo.
- **Catalog destination (D2b).**
  - "Yes, that is the wine" goes to D3 with `written: false`.
  - "Add it" runs `addToCatalog(identity)`, then goes to D3 with `written: true`.

#### A4 · Add and keep going

Files: `multi-add-stack.tsx` (dark) and the laptop list in `desktop-view.tsx` (light). Both render the same rows from `itemRowCopy`:

| Item | Row |
|---|---|
| added | gold ✓ · label · "glass N" (flight) |
| incomplete (a flight glass added without every field) | "!" · "{title} · {describeUnread}" · bordered "Fix" |
| pending (cellar or catalog; nothing written) | "!" · "{title} · {describeUnread}" · bordered "Fix" · remove ✕ |
| failed | "Couldn't read this photo" · "Retry" · "Remove" |
| uploading / reading | thumbnail · "Reading the label…" |

- **Header:** "Adding to the flight" (`multiTitle`), with the badge "+N added".
- **Footer:** "Done · N wines added". N counts both added and incomplete flight glasses.
- **Removed:** `pending-fix.tsx` is deleted (D7).

#### A4b · Fixing a partial read

Fix opens the by-hand form (A7) with a finishing header.

**Header**
- ← back.
- Eyebrow: "Glass {n} · already added" for an incomplete flight glass; otherwise the matrix's `byHand.eyebrow`.
- Title: "Finish this wine".
- Badge: "{k} GAP" or "{k} GAPS".

**Body**
- Intro: "Filled in from your scan. Correct anything the camera got wrong."
- Fields hold the values from the read. The failed field is empty, focused and flagged "did not read — required".

**Footer**

| Destination | Primary | Beneath |
|---|---|---|
| Flight | "Save · glass {n}" | "Leave it for later" |
| A pending row: cellar, catalog, or an OPEN flight | `byHand.primary` | "Leave it for later" (keeps the pending row and returns to the stack) |
| Note | "Start the note" | nothing |

This screen replaces `openBulkScan()` and the year/NV strip.

#### A5 · Search

File: `search-view.tsx`.

**Header and query**
- The header holds ✕ plus the matrix's eyebrow and title.
- A trailing "Scan" pill, which returns to the camera, appears only when `canScan`.
- The query lives in state (C.4).
- The count reads `resultCount`, e.g. "31 found".

**The list**
- One list, grouped in `searchGroups` order: "In your cellar", "In the catalog", "You have tasted before".
- For a flight, "In your cellar" carries the subtitle "{n} bottles you can pour tonight".
- Row metas:

  | Group | Meta helper | Example |
  |---|---|---|
  | Cellar | `searchCellarMeta` | "rack B · 2 bottles · drink now" |
  | Catalog | `catalogMeta` | "★ 95 · 22 notes" |
  | Tasted | `tastedMeta` | "you rated it 92 in May" |

**Row actions** — tap follows `matrix.row`:
- the + disc adds straight away, with no detail view;
- "+1 bottle" increments that lot;
- the chevron opens the note or the catalog page.

In-flight rows are disabled and read "in flight" (C.9).

**Footer**
- When the list shows lot rows for a flight, a footer strip carries the checkbox `consumeLabel` ("Take it out of the cellar when we pour it", checked). This replaces the checkbox inside the list (search-view.tsx:239-259).
- Then "Nothing matches?" · "Add it by hand".

**Tasted rows (sources-8)**
- Tasted rows beyond the first page of the catalog RPC are included, each with its own `inFlight`.
- `SearchGroups.tasted` gains `inFlight: boolean`, set in `searchAddWine` (add-wine/actions.ts:138-277).
- Both the phone list and `flattenSearchGroups` read that field.
- The borrowed `inFlightIds` set in search-view.tsx is removed.

#### A6 · From my cellar

File: `cellar-view.tsx`.

**Header**
- ← back, then the matrix title as eyebrow ("Add wine · glass 4").
- Title "From my cellar", with "{n} bottles" trailing.

**Filters and rows**
- Filter chips: "Drink now {n}", "Rack A", "Rack B" and so on.
- Each row shows the title and a meta line, e.g. "rack B · 2 bottles · in its window".
- A lot already in the flight reads "rack B · 2 bottles · already glass 1" and is disabled with "in flight". The glass number shows only when it is known (C.9).

**Selecting and adding**
- Tap a row to select it (✓).
- The footer then shows the checkbox `consumeLabel` (checked) and the primary button:
  - flight: "Add as glass {N}";
  - note: "Start the note";
  - none: the chooser.

**Removed modes.** Cellar and catalog destinations never open this view (`cellarSource: false`). The catalog no-op mode and the disabled `none` mode (cellar-view.tsx:125-168, 207-217) are deleted.

**State.** Selection, filter and consume live in state (C.4).

#### A7 · By hand (same form and order on every device, D8)

**Files**
- `by-hand-form.tsx`, controlled by `ByHandSession`.
- `by-hand-logic.ts`, pure: `fieldChip`, `applyProducerRegion`, `pickProducerAdoption`, `grapeSuggestionNote`, `blendScoredLine`, `byHandHeader`.
- `self-named-appellation.ts`, pure: `justTheRegionOption`, `findSelfNamedAppellation`, `appellationPlaceholder`, `appellationHint`. `WineIdentityFields` shares it (D.4 #8).

**Header**
- New wine: eyebrow `byHand.eyebrow` (e.g. "Add wine · glass 4 · by hand"), title "A wine we have never seen", and a trailing "Search instead" that replaces "Scan instead".
- Finishing a wine: the A4b header.

**"I can't identify this bottle"** (flight only, byhand-7)
- A switch with this label sits above the fields.
- When it is on:
  - the required fields become `UNIDENTIFIED_WINE_FIELDS`;
  - the note below the switch is the legacy copy from wine-form.tsx:246-251, with its list of required fields corrected (§2.1 row 17): "Unidentified wines are kept out of the shared catalog — no community rating, not searchable, excluded from stats. Only vintage, country, region and grape are required. Use this only when the bottle genuinely can't be identified.";
  - the footer note becomes "Kept out of the shared catalog";
  - the add becomes `{ kind: "unidentified", draft }`.

**Fields, in this order**

1. **Producer.**
   - A `SearchableCombobox` over `searchProducers`, grouped under "Specific to {region}" when a region is set.
   - Chip per B.4. Folded-equal adoption, "Did you mean {name}? · Use", and the pending hint "New producer — we'll add it when you save." (B.7).
   - **Region link** (`applyProducerRegion`, provenance `producer-region`). A producer with a region link fills Country and Region. The note reads "Filled from {producer}'s region link. Change either if the bottle disagrees." Round 1's two guards stay (by-hand-logic.ts:150-160):
     - it writes only fields that nobody set, or that a previous producer's link filled — never a manual or label-read value;
     - it changes nothing once an appellation is chosen, so that appellation is never stranded under another region.
   - **No link.** Both stay empty and required. Switching to a producer with no link clears the country and region that the previous producer's link filled.
   - The producer never fills anything from the wine name, and never the appellation or the grape.
2. **Vintage.**
   - Segmented Year · NV · Tawny.
   - Year is a controlled 4-digit numeric input with placeholder "YYYY" (`inputMode="numeric"`).
   - Tawny is a select of 10 · 20 · 30 · 40 years.
   - Choosing Tawny sets Style to Fortified and locks Style while Tawny stays selected.
3. **Wine name.** Optional (D3), with the hint "Leave blank if the label has no cuvée name".
4. **Colour and Style,** side by side, both visible, with no default.
   - Colour: Red · White · Rosé · Other (Other = Orange).
   - Style: Still · Sparkling · Sweet · Fortified.
5. **Country and region.**
   - One pair of `ReferenceCombobox`es, always editable.
   - Region is disabled until a country is chosen, and then lists that country's regions.
   - Changing the country clears any region and appellation that no longer belong.
   - The "None" region displays as "No geographic indication".
   - A hint sits under the pair (byhand-5, adapted to B.5's no-GI rule): "No geographic indication on the label? In France pick Vin de France; elsewhere pick No geographic indication."
6. **Appellation.** Chip "you choose". Required; never selected automatically, and never filled from a producer.
   - **List order, with a region set.** The list's section label reads "{Region} first" (canvas A7: "Piedmont first ▾"):
     1. "Just the region · {self-named appellation}", when one exists;
     2. the region's appellations (`listAppellationsForRegions([regionId])`, paged);
     3. a search over the rest.
   - **How the self-named appellation is found (RC5).**
     - It is the region's appellation whose `foldName(stripDesignationSuffix(name))` equals the region's folded name (`justTheRegionOption`).
     - The server action `regionSelfNamedAppellation(regionId, regionName)` loads its candidates with a targeted query: `appellations` whose `region_id` matches and whose name starts with the region's own name (`ilike`, with `%` and `_` escaped), ordered by name. It reads 1000-row pages until a short page; the pure `findSelfNamedAppellation(region, fetchPage)` in `self-named-appellation.ts` does the paging.
     - The self-named row carries the region's exact name plus at most a designation suffix (20260713180000; scripts/add-appellation-designations.mjs), so the prefix always includes it.
     - There is no limit-25 search, so no crowd of earlier-sorting names can push that row out.
   - **Placeholder:** "Just the region" when that option exists, otherwise "Pick one".
   - **Hint under the field:** "Ordered by the region above when there is one; a plain list when there is not. Nothing is selected for you."
     - A region with no self-named appellation adds: "{Region} has no region-wide appellation — pick the one on the label."
   - **No region:** the field uses `searchAppellations`.
   - **"None" region:** its only appellation displays as "No geographic indication".
7. **Grape.** A `ReferenceCombobox` over grapes (the primary blend row). Chip "you confirm", plus the "suggested" chip and its note (B.8).
8. **More detail.** Collapsed, with the subline "Second grape, designation, alcohol, a photo". Inside:
   - `GrapeBlendEditor` (src/app/catalog/new/grape-blend-editor.tsx:24) for further blend rows, with optional percentages. A line derived from `orderedBlend` reads "Scored as {lead} (primary) · {next} (secondary)".
   - Type designation (`TypeDesignationField`).
   - Alcohol %.
   - Description.
   - Label photo (`ImageUploader`). The folder is the tasting id for a flight, otherwise `catalog/staging/<userId>`.

**Footer**
- `byHand.footerNote` comes first:
  - flight: "Only you see this until the reveal. It joins the catalog once this glass is revealed.";
  - every other destination: "Saved to the catalog too, so nobody types it again."
- Then the primary button `byHand.primary(finishing)`, and "Leave it for later" when finishing.
- Pressing the primary with gaps:
  - sets `attempted`;
  - shows "This wine {describeMissing}." above the button;
  - focuses the first missing field.

  "Still missing: …" is removed (by-hand-form.tsx:293-325).

**Data**
- A read's full blend, with percentages, is preserved through the form and the write (byhand-4, byhand-6).
- Reference lists (countries, regions, grapes, type designations) are fetched once per sheet open and kept in the sheet, not refetched on every form mount (by-hand-form.tsx:125-158).

#### A8 · The flight on a laptop

Files: `desktop-view.tsx`, `desktop-format.ts`.

**Header**
- Eyebrow "{tasting} · blind" (the reveal-mode word), title "Add wine · glass 4", then ✕.

**Search and results**
- Search leads, full width, with the hint "↵ adds the first hit".
- Each result states its source:
  - "In your cellar · rack B · 2 bottles · ★ 91"
  - "Catalog · ★ 95 · 22 notes"
  - "You have tasted it · you rated it 92 in May"
- Every row carries the same outlined `RowActionButton`, labelled by `matrix.row` (e.g. "Add as glass 4").
- In-flight rows are disabled and read "In flight".

**Keyboard**
- ↓ and ↑ move `desktop.focusedRow`, without wrapping.
- The focused row gets a gold border and the "↵" hint.
- Enter acts on the focused row, which by default is the first addable row. Enter on a disabled row does nothing, including a row just added (C.4 rule 11).
- With no destination, Enter on any row opens the chooser. It never pours a lot (sources-2).

**Below the results**
- The upload zone (`matrix.upload`) sits beside two tiles:
  - "From my cellar" ("38 bottles · 6 ready to drink");
  - "Add it by hand" ("Producer, name, vintage, colour").
- When the results include lot rows, the footer carries the checkbox "Take it out of the cellar when we pour it" (checked). It replaces the per-row toggles.
- Added, incomplete, pending and failed rows are listed above the footer, as the A4 rows in the light tone.

**Footer**
- The sentence "Glasses 1–3 are set. Adding does not close this — keep going until the flight is full.", then "Done".
- Adding never closes the sheet.

#### B1 · B2 · B3 · Into the cellar

- **B2 (phone).** A2 with eyebrow "Cellar", title "Add a bottle", the chip "By hand", and Many shown.

- **B1 (laptop).** A8's layout with the cellar matrix.
  - Rows:

    | Row meta | Action |
    |---|---|
    | "Ampelos Pinot Noir 2023" · "Catalog · California AVA · Pinot Noir" | "Add to cellar" |
    | "You rated it 89 in September · ★ 89" | "Add to cellar" |
    | A wine you own: "Already yours · rack C · 2 bottles" | "+1 bottle" |

  - Upload body: "Several at once — a delivery of six is one drop. Each lands in your cellar."
  - Tiles:
    - "Add it by hand".
    - A preview tile, "Then: quantity, rack, price". It is not interactive. Its chips show the lot step's current defaults: "1 bottle", the last rack used this session (or "Rack"), and "Price".
  - Footer: "Nothing added to your cellar yet. Adding does not close this — keep going." · "Done".

- **B3.**
  - Every row carries the same outlined "Add to cellar". Focus is a border and an ↵ hint.
  - The label changes only when the action changes: a lot you own reads "+1 bottle".
  - "+1 bottle" calls `increaseCellarLotQuantity(lotId, 1)` (cellar/new/actions.ts:175-205) and skips the lot step.

- **The lot step** after "Add to cellar."
  - It is today's `DestinationFooter` cellar branch, renamed `CellarLotStep` (destination-footer.tsx:138-344). Its copy is unchanged:
    - "Into your cellar";
    - "How many bottles, and where do they live? Price is optional.";
    - a Bottles stepper and a Rack datalist;
    - "Price per bottle · {currency} (optional)".
  - The merge card is unchanged (sources-6 is left to the owner, D15).
  - Its duplicate check now also runs for identity sources, using the `catalogWineId` the identity write returns.
  - The unreachable flight and catalog/rate branches (destination-footer.tsx:35-98) are deleted.
  - The fields live in `state.lot`.

#### C1 · C2 · Taste & rate (destination `note`)

**Rename `{ kind: "rate" }` to `{ kind: "note" }` everywhere:**
- types.ts:21-23, 37-51
- format.ts:124-154 (`ratePickPlan` → `notePickPlan`)
- scan-copy.ts:22-38
- by-hand-logic.ts:253-261
- add-wine-sheet.tsx:193-196, 329-335, 402-442, 519-523, 619-655
- camera-view.tsx:46
- desktop-format.ts:116-162, 220-254
- add-wine-context.tsx:297-309
- taste-launcher-context.tsx:48

The launcher API stays `openTaste("rate")`, after the product name "Taste & rate".

- **C2 (phone).** A2 with eyebrow "Taste & rate", title "Which wine?", chips "My cellar · By hand", Library shown and Many hidden.

- **C1 (laptop).**
  - Header "Taste & rate" / "Which wine are you tasting?".
  - Search placeholder "Search by producer, wine or appellation", with "↵ opens a note on the first hit".
  - Upload: "Upload a label photo" / "Read and matched exactly as it is on the phone, then the note opens." / "Drop a photo here" / "or choose a file".
  - Tiles: "From my cellar" ("38 bottles · rating one you own is the common case") and "Add it by hand".
  - The line "Scanning lives on your phone and tablet, where the camera faces the bottle. It is not offered here."
  - Footer button "Close".
  - No Scan control appears anywhere on the laptop.

- **One wine.**
  - A pick produces a `NotePick`. The provider opens `NewNoteModal`, passing `cellarConsume` when `consume && lotId`, and the sheet closes.
  - An identity is written to the catalog first (B.9).
  - A partial read goes straight to A7, skipping the confirm screen (`partialRead.skipConfirm`), then to "Start the note" (D7).

#### D1 · D2 · D2b · D3 · Into the catalog

- **D1 (laptop)**
  - Header "Catalog" / "Add a wine", then the lead line "First, check it is not already here".
  - The search shows the count "{n} near matches".
  - Rows carry "Open", never Add. "Open" is `RowActionButton`'s `href` variant: a Next `Link` to `/catalog/{id}` with the button's classes, so every row still carries the same button (round 1).
  - Row metas compare a row's `producerId`, `wineName`, `appellationId` and `vintageLabel` (C.1) with the latest draft:

    | Compared against | Condition | Meta |
    |---|---|---|
    | A draft | Same producer, name and appellation; other vintage | "Already in the catalog · different vintage" |
    | A draft | Same producer; other name or appellation | "Already in the catalog · different wine" |
    | Typed text only | — | "Already in the catalog · {vintage}" (§2.1 row 13) |

  - Under the results: "Neither of these" · "Continue and create a new entry", which opens A7 for the catalog.
  - Upload: "Read a label and it fills the form below — still checked against the catalog before it is written." Reads go through ReadConfirm (D2b).
  - Tile "Add it by hand" · "Producer, name, vintage, colour".
  - Footer: "Adding here only records the wine. The sheet then asks what you want to do with it." with "Add to the catalog". The button is disabled on the search view; it is the by-hand form's submit.
- **D2 (phone).** A2 with eyebrow "Catalog", title "Add a wine", the chip "By hand", and Many shown.
- **D2b.** ReadConfirm with the catalog matrix (A3 above).
- **D3.** A new `follow-up-view.tsx`, shown after a single catalog add or confirm:
  - Header: ✓ "Added to the catalog" when a row was written, "Already in the catalog" when not.
  - The wine's title, e.g. "Cigliuti, Barbaresco Serraboella 2017".
  - "Add it to my cellar" · "Quantity and rack" › adopts `{ kind: "cellar" }` and opens the lot step with `{ kind: "catalog", catalogWineId }`.
  - "Taste & rate it now" · "Opens a note on this bottle" › produces a `NotePick`; the sheet closes.
  - "Done — add another wine" returns to the catalog home view with fresh state.

#### E1 · E1b · No destination (D12)

**When it appears.** This sheet opens from the header camera away from a tasting (`openAddWineSheet(null, { start: "camera" })`, scan-button.tsx:44). It also covers any add made while `currentDestination` is null.

**After a read.** The header title is "Scanned", and ReadConfirm renders its no-destination footer over the photo.

The footer shows, top to bottom:

1. **The identity.**
   - A match: ✓ "Found in the catalog", the match's title, and the meta "{appellation} · {region} · {grape} · ★ 93".
   - No match: "Not in the catalog yet", with the read's title and meta.
   - An incomplete read also gets the line "{describeMissing}" with a "Fix" button.
2. **Recovery:** "Wrong bottle? Rescan · Search · By hand" (§2.1 row 6).
3. **"Where does it go?"** followed by the destination rows.

The destination rows:

1. **Tonight's flight · glass {position}** — gold, the primary row.
   - Subtitle by `flightHint.phase`: "{tastingName}, live now", "…, in progress" (self-paced) or "…, next up".
   - It appears only when a flight hint exists. Hints are registered only for people who may add (D.4), so an option you cannot take is never drawn.
2. **My cellar.**
   - Subtitle if you already hold this wine: "{n} bottle(s) · rack {R} · pick a rack after". Otherwise: "Quantity and rack next · {total} bottles".
   - Gold when row 1 is absent.
   - Hidden when the source is a lot.
3. **Rate it now** — "Opens a WSET note for this bottle".
4. **Just remember it — save to the catalog only** — a text row. Hidden when the source is a lot.

**Picking a row.**
- A pick adopts that destination and runs its add.
- An incomplete draft opens A7 for that destination first.
- If the add fails, the view returns to this chooser (C.4 rule 5).

**Other entry points.** Search, cellar and by-hand picks with no destination reach the same chooser rows in the `choose` view, under the header "Add wine".

#### N1 · The nav merge

**Already on master:**
- The Taste menu reads Taste Blind · Taste & Rate · Training Room (SOON) (nav-links.ts:37-43).
- No `/taste/semi-blind` route exists.
- `/tastings/new?mode=semi-blind` still preselects semi-blind.

**Still to do:** fold About's separate Semi-Blind card into Taste Blind (D.4).

### C.6 Entry points (D13)

| Launcher | File | Today | Target |
|---|---|---|---|
| Lobby Wines card "Add wine" / "Add a wine" | tasting-add-wine-button.tsx:29-47; page.tsx:217-230, 246, 500-504, 564-568 | Flight destination, no `start`. `canAddWine` ignores status. | Same destination. `canAddWine` gains `status !== "CLOSED"` (A1). The sheet routes by `canScan`. |
| Header camera on the lobby | scan-button.tsx:22-46; `TastingScanRegistrar` page.tsx:417-425 | Flight + `start: "camera"`, including on CLOSED tastings. | Registered only when `canAddWine`. The glyph and label follow `canScan` (C.3). The camera stays locked to the flight (entry-5 is left to the owner, D15). |
| Header camera elsewhere | scan-button.tsx:44 | `null` + camera. | Unchanged. The chooser follows E1/E1b. |
| Host console "Add a wine" | host/console.tsx:166-180 | A width query picks `search` or `camera`. | `start: "camera"`; the sheet routes. |
| Create sheet step 2 | flight-step.tsx:58-77, 185-236, 280-332 | Chips "Scan a label" / "Upload photos" chosen by touch, plus "From my cellar" and "Enter manually". The inline laptop search adds cellar hits as catalog adds. | Chips come from the matrix: "Scan a label" (when `canScan`) or "Upload photos" → `start: "camera"`; "My cellar" → `start: "cellar"`; "By hand" → `start: "byhand"`. Inline search rows use `matrix.row`, and lot hits become `{ kind: "lot", consume }` with the footer checkbox (C.7). In-flight markers follow C.9. The caption follows create-6 (D.1). Uses the shared `useMediaQuery`. |
| Overview next-up "Add wine N" | add-wine-banner-button.tsx:28-46; banner.tsx:201-212 | Flight destination, no `start`. | Unchanged. |
| Overview flight hint | banner.tsx:25-56; flight-hint-registrar.tsx | The live tasting is always registered with `live: true`. | Live and next-up tastings are registered only when `canAddWine`, with `phase` (D.4). |
| `/tastings/[id]/wines/new` | wines/new/page.tsx:30-63 | Legacy `WineForm`. | Server page: checks `canAddWine` (CLOSED and JOINED included), then `redirect("/tastings/{id}?addWine=byhand")`. A refusal renders the reason ("This tasting is finished — reopen it to add wines."). |
| `/tastings/[id]/wines/[wineId]/edit` | edit/page.tsx:54-156 | Legacy `WineForm` in edit mode. | Server page: checks the adder rule, then `redirect("/tastings/{id}?editWine={wineId}")`. |
| Lobby query launcher | new `src/app/tastings/[id]/sheet-from-query.tsx` | — | Client component on the lobby. Receives `canAddWine` and the ids of the glasses the viewer may edit. On `?addWine=byhand` it opens the flight sheet with `start: "byhand"`; on `?editWine=` it opens it with `edit`. It opens once, then calls `router.replace` without the parameter. |
| Cellar page header and empty table | cellar/page.tsx:411-417; cellar-bottles-table.tsx:281-287 | "Add a wine". | "Add a bottle" (entry-8). |
| Overview CellarCard | cellar-card.tsx:45-50, 57-61 | "Add a bottle"; the empty tile links to `/cellar`. | The empty tile "Add your first bottle" opens the cellar sheet through `ActionButtonClient`'s `launch="cellar"` path (entry-8). |
| Nav Cellar › | nav-links.ts:62 | "Add a wine". | "Add a bottle". The Catalog child keeps "Add a wine". |
| Catalog page and nav Catalog › | catalog/page.tsx:167-174; nav-links.ts:72 | Catalog destination. | Unchanged. |
| Catalog row "Add to cellar" | catalog-list.tsx:333-340, 467-475 | Lot step. | Unchanged. |
| Catalog row "Rate" | catalog-list.tsx:339, 533-534 | Opens `NewNoteModal` directly. | Unchanged. |
| Taste & rate launchers | taste-launcher-context.tsx:46-52; ratings-card.tsx:44; nav-links.ts:41; start-tasting-menu.tsx:30 | `{ kind: "rate" }`. | `{ kind: "note" }`. |
| Dead context API | add-wine-context.tsx:28-35, 196-241 | `openScan`, `openBulkScan`, `openTastingScan`, `openAddWine("tasting")`, and the options `catalog` / `cellarNew`. None has a caller. | Deleted. |

`wine-form.tsx` is deleted once both legacy routes redirect. So are the `addWine` and `updateWine` FormData actions and `searchCatalogWines` in wines/new/actions.ts.

These stay:
- The reference creators (`createCountry` … `createAppellation`, :20-106). `WineIdentityFields` imports them; its producer create goes through `find_or_create_producer` (B.7).
- `addTastingWineFromCellarLot`, which moves into `insertTastingWineFromLot` (C.7).

### C.7 When cellar bottles are drawn down (D11)

- **Copy is unchanged.** The checkbox reads "Take it out of the cellar when we pour it" and is checked by default. It appears in A5, A6, A8 and step 2 of the create sheet.

- **Adding a lot to a flight.** `addTastingWineFromCellarLot` (wines/new/actions.ts:430-482) becomes `insertTastingWineFromLot` in `tasting-wine-writes.ts`. It runs these steps:
  1. Run `resolveTastingAdder` (D.4) and the lot checks: the lot's owner is the caller, and `quantity ≥ 1`.
  2. Insert the glass from the lot's catalog wine, with `added_via = 'CELLAR'`.
  3. Insert the caller's `wine_pour_intents` row (E.4): `{ wine_id, owner_id: userId, cellar_lot_id: lotId, consume_on_start }`. `consume_on_start` is `consume` for a DRAFT tasting, and false for a running one.
     - This is one INSERT, which the intent table's RLS allows the adder. It is never a follow-up update of `wines`: that policy is host-only (init_schema.sql:389-391), so a contributor's update would silently match 0 rows.
     - If the insert fails, the glass stays and the result carries the warning "Added — but it won't come out of your cellar."
     - Nothing is drawn down for a DRAFT tasting.
  4. If the tasting is running (IN_PROGRESS or OPEN) and `consume` is set, call `rpc("pour_cellar_lot_into_glass", { p_wine_id })` (E.4). If that call fails, the glass stays and the result carries the warning "Added — but the bottle couldn't be taken out of your cellar."

- **Why the intent is not on `wines`.**
  - Every host and participant reads every `wines` column (init_schema.sql:370-378).
  - `cellar_lots` is readable through `can_view_cellar` for a PUBLIC or FRIENDS cellar (20260829243000:21-44). Friendships are one-way, so anyone can add the host as a friend.
  - A `wines.cellar_lot_id` would therefore let a participant read a hidden glass's lot, and then its `catalog_wine_id`, before the reveal. That is exactly what `blind_pending` exists to hide (20260829263100).
  - `wine_pour_intents` is readable only by its owner, and the two pour functions read it as SECURITY DEFINER. Drink history (`cellar_consumptions`) is already private (20260829243000:4).

- **`startTasting`** (tastings/[id]/actions.ts:35-60) runs these steps in order:
  1. Check the caller is the host and the flight has at least one wine, as today.
  2. Call `rpc("tasting_incomplete_glasses")`. If it returns rows, return `{ error: rows.map((r) => "Glass " + r.glass + " " + describeMissing(r.missing)).join(" · ") }`, e.g. "Glass 3 needs a vintage" (D7).
  3. Run `update tastings set status = 'IN_PROGRESS' where id = $1 and status = 'DRAFT'`. If 0 rows change, return `{ error: "This tasting has already started." }`. Today a CLOSED tasting can be started again, which would draw its bottles down a second time.
  4. Call `rpc("draw_down_flight_cellar_lots")`. Every row whose `outcome` is not `drawn` adds the warning "Glass {glass}: the bottle couldn't be taken out of the cellar." The warnings are joined and returned along with the success result.

  Both Start surfaces (host-controls.tsx:93, new-tasting-sheet.tsx:309) show the error or warning inline.

- **Removing and deleting.**
  - Removing a draft glass, or deleting a draft tasting, touches nothing: the intent row cascades with its `wines` row.
  - Removing a glass after Start leaves its consumption in place, because the bottle was poured.

- **Step 2 of the create sheet.** Its inline search adds cellar hits as `{ kind: "lot", lotId, consume }` with the same checkbox (sources-1). Today it adds them as `{ kind: "catalog" }` (flight-step.tsx:58-77).

- **Notes are unchanged.** `NewNoteModal` already draws down when a note is saved (new-note-modal.tsx:119-127), which is the moment of use.

### C.8 Partial reads and "Leave it for later" (D7)

**Flight: adding an incomplete glass.** A partial read's primary add, and "Leave it for later" on A4b or A7, both send `{ kind: "incomplete", draft, via }` to `insertIncompleteGlass(supabase, userId, tastingId, draft, via)`. It runs:

1. `resolveTastingAdder`. The tasting must not be CLOSED, and the caller must be the host, or a JOINED contributor in bring-your-own.
2. The tasting must not be OPEN.
   - An OPEN tasting inserts every glass already revealed (`is_revealed: reveal_mode === "OPEN"`, tasting-wine-writes.ts:214, 405).
   - A revealed glass with no answer key could never be finished: `saveFlightGlass` refuses revealed wines, and a contributor cannot un-reveal it under the host-only update policy.
   - So in an OPEN flight a partial read goes to By hand, and in Many it stacks as a pending row (C.2).
   - The server refuses `{ kind: "incomplete" }` with "Finish this wine's details first — an open tasting shows every glass as soon as it is added."
3. `missing = missingWineFields(draft)`. The list must be non-empty; a complete draft goes the identity path instead.
4. Insert the `wines` row at `count + 1`, with `added_via` and `contributor_participant_id` set as `insertTastingWineCore` sets them. It is never revealed, because step 2 excludes OPEN.
5. Insert `wine_identity_drafts { wine_id, owner_id: userId, draft: normaliseDraft(draft), missing }`. If that insert fails:
   - a host's glass row is deleted;
   - a contributor cannot delete theirs, because `wines` delete is host-only (init_schema.sql:392-393). The glass stays and reads as incomplete with every field missing, until the contributor finishes it with Edit or the host removes it.
6. Nothing else is written: no catalog row, no `wine_answers`, no `blind_pending`.

It returns an `AddedWine` with `incomplete: { missing }` and `catalogWineId: null`.

**Flight: loading a glass to edit.** `loadFlightGlassForEdit(wineId): Promise<{ draft; incomplete; unidentified; glass; canEdit } | { error: string }>` lives in add-wine/actions.ts.
- Only the adder may call it (`is_wine_adder`).
- For a complete glass, the draft is built by `draftFromAnswerKey` from the answer key plus the catalog wine's name, colour, style, description, alcohol and blend.
- A glass is incomplete when it has no answer key. Its draft comes from `parseStoredDraft`; a missing or malformed draft row gives `emptyDraft()`.

**Flight: saving a glass.** `saveFlightGlass({ wineId, draft, unidentified, leaveForLater })` runs from add-wine/actions.ts through tasting-wine-writes.ts.

- **Gates:**
  - the caller is the adder (`is_wine_adder`);
  - the wine is not revealed;
  - a complete glass can be edited only while the tasting is DRAFT (today's rule);
  - an incomplete glass can be finished whenever the tasting is not CLOSED.
- **With `leaveForLater`** (incomplete glasses only), update the draft row with the new draft and its recomputed `missing`. That list must be non-empty; a complete draft is saved as complete instead.
- **Otherwise:**
  1. Run `prepareCompleteWine`, or `prepareUnidentifiedWine` for an unidentified glass.
  2. For an identified glass, run `upsertCatalogWine`.
  3. Insert or update `wine_answers`.
     - Identified: set `catalog_wine_id` and clear `unidentified_wine_id` in the same statement.
     - Unidentified: insert or update the `catalog_wines_unidentified` row. Then set `unidentified_wine_id` and clear `catalog_wine_id` in the same statement, since `wine_answers_one_identity` allows exactly one (20260829210000:67-68). The 104000 trigger then clears the old catalog wine's `blind_pending` (E.5).
  4. The E.3 trigger deletes the draft.
- **After finishing a glass in a running ASYNC tasting,** call `maybeAutoRevealWine(wineId)`.

**Flight: what an incomplete glass allows.**

| Action | Rule |
|---|---|
| Start | Refused while any glass is incomplete (C.7, step 2). |
| Guess | Allowed; `submitGuess` is unchanged. |
| Reveal | Refused with "Finish glass {n}'s details before revealing" (details below). |
| Auto-reveal | `maybeAutoRevealWine` (play/actions.ts:25-69) skips the glass silently. |
| Lock | Allowed. In ASYNC + IMMEDIATE, scoring is deferred (details below). |
| End tasting | The glass counts as unrevealed in the warning (D.1). |

- **Where reveal is refused.**
  - `revealWine` (play/actions.ts:442-473).
  - `revealNextCategory` and `revealFull` (reveal-actions.ts:24-62).
    - Today `revealFull` calls `reveal_wine` with no CLOSED check (entry-2's related gap).
    - It gains the refusal `revealWine` already has: "This tasting is finished — reveals are closed." (play/actions.ts:462-463).
  - The host console. `buildGlass` in host/page.tsx sends no reveal chips for an incomplete glass and shows the refusal sentence instead; "Reveal everything" is disabled for it.

  Each check calls `tasting_incomplete_glasses`. Participants can call it, but it never shows them anyone else's draft.
- **How locking defers scoring in ASYNC + IMMEDIATE.**
  1. `lockGuess` (:232-283) and `lockGuesses` (:328-374) skip `score_own_guess` for an incomplete glass.
  2. The locked-in state (`locked-in.tsx`) reads "Your answer shows once glass {n}'s details are finished."
  3. Once the glass is complete, `play-experience.tsx` passes `needsScoring: true` to `LockedIn` for any locked, unscored guess on it (IMMEDIATE mode only).
  4. `LockedIn` then calls the new server action `scoreLockedGuess(tastingId, wineId)` once, from an effect. The action is idempotent: it calls `score_own_guess` only for the caller's own locked, unscored guess.
  5. `AutoRefresh` picks up the change.

**Cellar and catalog.** A partial read becomes a pending row with Fix (A4). Nothing is written until it is complete. Closing the sheet with pending rows asks first (C.4, rule 7).

**Note.** A note takes a single pick, so a partial read goes straight to A7, then "Start the note".

### C.9 In-flight markers and glass numbers: the knowledge rule (D10)

```ts
// src/components/add-wine/flight-knowledge.ts (pure)
export function callerKnowsWine(
  w: { hostId: string; wineSource: WineSourceMode; isRevealed: boolean; contributorUserId: string | null },
  userId: string,
): boolean {
  return (
    (w.wineSource === "HOST_PROVIDES" && w.hostId === userId) ||
    w.contributorUserId === userId ||
    w.isRevealed
  );
}
```

**The rule.**
- In-flight markers and glass numbers are shown only for wines the caller already knows (D10; sources-3, create-3).
- SEMI_BLIND and OPEN tastings get no exception.
  - The create-3 and sources-3 verifiers suggested flagging every wine in those tastings, but D10 outranks them.
  - OPEN glasses are inserted revealed, so they already count as known.
  - Semi-blind is an open question for the owner (F.3).

**Where it applies.**
- `flightCatalogIds` (add-wine/actions.ts:282-296). It loads `host_id` and `wine_source`, plus each wine's `is_revealed` and its contributor's user id. It keeps a catalog id only when `callerKnowsWine` allows it.
- `flightGlasses` and `listCellarForSheet` (cellar-actions.ts:23-158). The glass-number test becomes `callerKnowsWine`, and a lot is marked "in flight" only under the same rule.
- `listFlight` (tastings/new/actions.ts:364-479).
- The lobby's identity line (A1).

**Effect on a bring-your-own host.** The host gets the same view as any other contributor. The server has no duplicate check, so hiding the marker means a bring-your-own host can add a duplicate of a guest's bottle, just as any guest already can. Duplicate warnings on scan (scan-6) are left to the owner (D15).
---

## 6. Part D — Flow fixes outside the sheet (D14)

### D.0 Where every confirmed finding lands

| Area | Finding → section |
|---|---|
| scan | scan-1 → B.6 · scan-2 → B.6 · scan-3 → B.5, B.7, C.5 A3 (item 3's caveat superseded, F.3) · scan-4 → C.4 rule 5, C.5 E1, D.4 · scan-5 → C.7 · scan-6 → F.1 (D15) · scan-7 → C.5 A1, D.4 · scan-8 → C.4 rules 3–4 |
| sources | sources-1 → C.7 · sources-2 → C.4 rules 6 and 11, C.5 A8, D.4 · sources-3 → C.9 · sources-4 → D.4, E.5 · sources-5 → C.5 A1, D.4 · sources-6 → F.1 (D15) · sources-7 → F.1 (D15) · sources-8 → C.5 A5 |
| byhand | byhand-1 → B.7 · byhand-2 → C.5 A7 · byhand-3 → B.3 (D3) · byhand-4 → B.9, C.5 A7 · byhand-5 → C.5 A7, D.4 · byhand-6 → B.9, C.5 A7 (item 7's origin chip superseded, F.3) · byhand-7 → C.5 A7, B.9 · byhand-8 → C.2 (`byHand.footerNote`) |
| create | create-1 → D.1 · create-2 → D.1 · create-3 → C.9 · create-4 → D.1 · create-5 → C.7 · create-6 → D.1 · create-7 → D.1 · create-8 → D.1 |
| play | play-1 → D.1 · play-2 → D.2 · play-3 → D.2 · play-4 → D.2 · play-5 → D.2 · play-7 → D.2 · play-8 → D.2 |
| reveal | reveal-1 → D.3 · reveal-2 → D.1 · reveal-3 → D.3, E.6 · reveal-4 → D.1 · reveal-5 → D.1 (verifier items 1–2 not built, F.3) · reveal-6 → D.3 · reveal-7 → D.3, E.7 · reveal-8 → F.1 (D15) |
| entry | entry-1 → C.7 · entry-2 → C.5 A1, C.8 (`revealFull`), D.4 · entry-3 → C.4 rule 6, C.5 E1, D.4 (item 4 declined, F.3) · entry-4 → D.4 · entry-5 → F.1 (D15) · entry-6 → D.4 · entry-7 → F.1 (D15) · entry-8 → C.6, D.4 |

### D.1 Create

#### 1. Guided pacing only for LIVE tastings (create-1, play-1, reveal-2)

No "Format and Flow are independent" rule exists anywhere in the repo, docs or handoffs (D14). Guided pacing therefore becomes LIVE-only everywhere.

- **`setupColumns`** (tastings/new/actions.ts:63-73): store `sequential_guessing: f.revealMode === "BLIND" && f.timingMode === "LIVE" && f.flow === "GUIDED"`. This covers both create and `updateTastingSetup`.
- **`new-tasting-form.tsx`** (:249-278): render the Flow select and the "Guided means…" line only for blind LIVE tastings (`timingMode === "LIVE"`).
- **`setup-copy.ts`** (:28-39): `rulesSummary`, `rulesSummaryShort` and `readySummary` add Guided/Free only for LIVE tastings. Update `setup-copy.test.ts` to match.
- **Lobby** (`tastings/[id]/page.tsx`): pass `showSequentialToggle={tasting.reveal_mode === "BLIND" && tasting.timing_mode === "LIVE"}`.
- **`setSequentialGuessing`** (tastings/[id]/actions.ts:231): ignore requests for ASYNC tastings.
- **Play gating:**
  - `play-experience.tsx:328` uses `const sequential = tasting.timing_mode === "LIVE" && tasting.sequential_guessing && !isSemiBlind`.
  - `sequentialOrderError` (play/actions.ts:75) selects `timing_mode` and returns null unless the tasting is LIVE.
  - host/page.tsx:117-118 applies the same rule.
- **Existing ASYNC rows** keep their stored flag, which is ignored on read. No backfill.
- **CLAUDE.md:** the "One wine at a time" note gains "LIVE tastings only" (G.6).

#### 2. The share link in the draft lobby (create-2)

- **Shared component.** Move the step-3 link row — the `getJoinLink` call, the URL text and the Copy button — out of `invite-step.tsx` into a new `src/app/tastings/new/join-link-row.tsx`.
- **Where it renders.** Both `invite-step.tsx` and the draft menu in `host-controls.tsx` use it; in the menu it sits next to "Invite more people".
- **When it shows.** While the tasting is DRAFT. For OPEN tastings it also shows while IN_PROGRESS (`invitesStayOpen`), because `join_tasting_by_code` still accepts them then.
- **Hint.** For non-OPEN tastings, both surfaces add a line under the link: "Works until you start the tasting."
- **No migration.** `ensure_join_code` is host-only and returns the same code every time.

#### 3. Who brings the wines can't switch once wines exist (create-4)

- **Server.** In `updateTastingSetup` (tastings/new/actions.ts:231), check before any write: if the stored `wine_source` differs from `fields.wineSource` and the tasting has at least one wine, return `{ error: "Remove the wines first — who brings the wines can't change once the flight has bottles." }`.
- **Form.** `new-tasting-form.tsx` receives the wine count. It disables the other wine-source option and shows the same sentence as its hint.
- **Unaffected.** Switching blind ↔ semi-blind stays allowed; that is documented behaviour.

#### 4. The invited count includes typed addresses (create-7)

1. **`InviteField`** (invite-field.tsx) gains `onChange?: (emails: string[]) => void`, called whenever an address is added or removed.
2. **`new-tasting-sheet.tsx`** holds `typedEmails` in state.
3. **`collectEmails()`** dedupes `[...selectedEmails, ...typedEmails]` instead of reading the hidden input. Before deduping, each address is trimmed and lowercased; empty entries and the host's own address are dropped.
4. **`readySummary`** takes its invited count from `collectEmails().length`.

"Save as draft" still sends the invitations.

#### 5. The leaderboard setting only for Live + Guided (create-8)

All of the rules below use one condition: `revealMode === "BLIND" && timingMode === "LIVE" && flow === "GUIDED"`.

- **`new-tasting-form.tsx`:**
  - Render the Leaderboard select only under that condition.
  - The collapsed-card hint (:249-255) stops promising "a quieter leaderboard" when the condition does not hold.
- **`setup-copy.ts`:** add the standings part to `rulesSummary`, and "per attribute" / "per wine" to `rulesSummaryShort`, only under that condition. The defaults stay "Guided · standings after each attribute · Danish Championship scoring" and "Guided · per attribute".
- **Lobby:** pass `showLeaderboardToggle={reveal_mode === "BLIND" && timing_mode === "LIVE" && sequential_guessing}`.
- **Unchanged:** the stored value and the leaderboard RPC's reading of it.

#### 6. The bring-your-own flight caption (create-6, caption only)

In flight-step.tsx:256-264 and 389-396:

- Bring-your-own reads "Reorder · tasters see whose bottle each glass is".
- Host-provides keeps "Reorder · tasters only ever see the number".

#### 7. A bring-your-own host lands on the lobby after Start (reveal-5)

- **Routing.** Both Start paths send the host to `/tastings/{id}/host` only when `timing_mode === "LIVE" && reveal_mode === "BLIND" && wine_source === "HOST_PROVIDES"`:
  - new-tasting-sheet.tsx:314-317 (today: `revealMode !== "SEMI_BLIND"`);
  - host-controls.tsx:83-96 (today: `=== "BLIND"`).
- **Way back.** The host console header shows a "Tasting page" link to `/tastings/{id}` while the tasting is running, not only once it has finished (console.tsx). A host who opens the console directly then has a way back.

#### 8. End tasting tells the truth (reveal-4)

- **Confirm text.** `FINISH_CONFIRM` (console.tsx:87-88) and the confirm in host-controls.tsx:311-322 are built from the unrevealed glasses. The lobby passes that list to `HostControls`.
  - With glasses still hidden, for example: "Glass 5 is half revealed and glass 6 hasn't been revealed — their answers stay hidden. You can reopen it from the tasting page."
  - With everything revealed: "End the tasting? You can reopen it from the tasting page."
  - "This can't be undone" is removed from both End confirms. The Delete-tasting confirm keeps it (host-controls.tsx:137-138), because deleting really is irreversible.
- **Console eyebrow.** When a finished tasting still has an unrevealed glass, it reads "Not revealed · glass {n} of {m}" (console.tsx:283-285).

#### 9. The create sheet uses the shared media-query hook

Delete the private `useMediaQuery` in new-tasting-sheet.tsx:45-57. Use `useMediaQuery` from `src/components/add-wine/use-camera.ts` instead.

Step 2 taking its sources from the matrix is covered in C.6.

### D.2 Play

#### 1. Semi-blind matches freeze once any glass is revealed (play-2)

- **Helper.** A new `semiBlindMatchesFrozen(supabase, tastingId)` in play/actions.ts. It is true when `reveal_mode = 'SEMI_BLIND'` and any wine in the tasting has `is_revealed` or `reveal_step > 0`.
- **Server refusals.** While frozen, these return `{ error: "The reveal has started — matches are final." }`:
  - `submitAllMatchGuesses` (:376);
  - `lockGuesses` (:328);
  - `unlockGuess` (:287), for semi-blind tastings.
- **UI.** `play-experience.tsx` computes the same flag and passes it to `MatchLadder`.
  - With locked rows, it renders `LockedIn` without "Change it". This uses a new `canChange` flag on `LockedInData` (locked-in.tsx:100-115).
  - With no locked rows, it shows the line "The reveal has started — matches are closed" instead of the ladder.
- **No tasting-wide trigger.** `reveal_wine` writes to still-hidden glasses' rows, so a trigger would break later reveals.

#### 2. Picking a region sets its country (play-3)

- **`pick()` in guess-ladder.tsx, case `region`:** always set `next = { ...next, country_id: picked.country_id }`. The `!g.country_id` condition and its comment go.
- **`pickerGroups("region")`:** give the "Everything else" options `sub: <country name>`.

#### 3. Self-paced "results at once" lock copy, and a confirm for a blank lock (play-4)

**Props.** `GuessLadderProps` and the semi-blind `MatchLadder` props gain `timingMode` and `asyncRevealPolicy`, passed from `play-experience.tsx`.

**In ASYNC + IMMEDIATE tastings:**

- **Button label:**
  - ladder: "Submit glass {n} and see the answer";
  - match ladder: "Submit all glasses and see the answers".
- **Footer:** "Saved as you go. Submitting scores this glass and shows you the answer — it can't be changed afterwards."
- **Confirm before locking.** `onLock` asks `window.confirm("Submit glass {n}? You'll see the answer, and it can't be changed afterwards.")`. When `pointsAtStake(guess) === 0`, it asks `window.confirm("You haven't answered anything — submit a blank guess for 0 points?")` instead.

**Unchanged:** the copy for LIVE and for ASYNC AFTER_ALL.

#### 4. Ladder copy (play-5)

Replace the note at guess-ladder.tsx:806-819 with: "Secondary grape and type designation only score if the wine has one (2 pts each). They're under More for every glass."

#### 5. No skip in the match ladder (play-7)

- **`FieldPickerProps`** (ladder-types.ts) gains `skipLabel?: string | null`. The default is "Not sure — skip it". `null` hides the button, and "Next" then takes the full width (field-picker.tsx:303-311).
- **match-ladder.tsx** changes three things:
  - pass `skipLabel={null}`;
  - change the unmatched row text "Skip, or pick a wine" (:245) to "Pick a wine";
  - change the footer helper (:278) to "Every glass needs a match — a wrong match just scores 0. Locking saves every match at once and shows the others you are ready."
- **Old spec.** Correct the 2026-09-12 flows spec, line 314, to match.

#### 6. Server guards: no new guess mid-reveal, no guessing your own wine (play-8)

**New helper.** `guessableWineError(supabase, tastingId, wineId, participantId)` selects `is_revealed, reveal_step, contributor_participant_id` from `wines` with `.eq("id", wineId).eq("tasting_id", tastingId)`. It returns:

| Condition | Error |
|---|---|
| No such wine in this tasting | "This glass isn't in this tasting." |
| `is_revealed \|\| reveal_step > 0` | "The reveal for this glass has started — guessing is closed." |
| The contributor is the guesser | "This is your bottle — you don't guess it." |

**Where it is called:**

- `submitGuess` (:150) and `lockGuess` (:232), right after `resolveGuesser`;
- `submitAllMatchGuesses`, for every wine id — any error refuses the whole batch;
- `lockGuesses`, which skips the guesser's own wines.

**App-level only.** A trigger keyed on `reveal_step` would block `reveal_next_category`'s own scoring writes.

#### 7. Incomplete glasses

The lock, scoring and reveal rules for incomplete glasses are in C.8.

### D.3 Reveal

#### 1. A step reveal scores a missing producer or vintage as NULL (reveal-3)

- **SQL:** see E.6.
- **Host console** (console.tsx:379-384): for a step with nothing on record, the note reads "No {label} on record for this glass — this step scores nobody." Also correct the `STEP_LABEL` comment in host/page.tsx.
- **`RevealView`** (play/reveal-view.tsx:201-233):
  - Keep null points as null instead of `?? 0`.
  - When the truth is null, show "Not recorded" with a neutral "not scored" verdict, not the rose miss style.
  - Both the hero verdict and each row's miss check require `points !== null`.

#### 2. One dense-rank helper; the results page ranks competitors and says "Final" only when finished (reveal-6)

- **Helper.** Add `rankRows<T>(rows: T[], score: (r: T) => number): { row: T; rank: number; tied: boolean }[]` to `src/lib/stats-math.ts`. It is dense, like `competitorRank` (:91-101), and gets a vitest case.
- **Where it is used:**
  - host/console.tsx:474-481;
  - play/reveal-view.tsx:235-242 and 377-411;
  - standings-panel.tsx:107-117;
  - play-experience.tsx:470-477;
  - results/page.tsx.
- **Display.** Ties show as "=2" everywhere. The top-row highlight, the crown and the delta pill key on `rank === 1`, never on the list index.
- **Results page totals** (results/page.tsx):
  - Totals come from `getTastingLeaderboard`, the same data the lobby uses.
  - Competitors are filtered as StandingsPanel does: JOINED participants, minus the host when `wine_source` is HOST_PROVIDES.
  - Semi-blind scores show as `total/{wines}`.
  - The per-wine breakdown stays limited to fully revealed wines.
- **Finished-state wording.** "Completed", "Final", the crown and the medals render only when `tasting.status === "CLOSED"`. While the tasting is running, the heading reads "Standings so far" (results/page.tsx:256, 327, 344-371).

#### 3. The leaderboard's round wine is chosen per tasting (reveal-7)

- **SQL:** see E.7.
- **host/page.tsx:341-355.** Under `leaderboard_reveal === "PER_WINE"`, `standingsAfter` reads "after glass {revealedCount}", or "nothing revealed yet", instead of a step label.
- **reveal-view.tsx.**
  - `RevealView` gains the prop `leaderboardReveal: "PER_ATTRIBUTE" | "PER_WINE"`. Today it receives only wineId, glassNumber, myParticipantId, myGuess, names, standings and spectator (play-experience.tsx:946-954).
  - play-experience.tsx passes `tasting.leaderboard_reveal`; it already loads the tasting with `select("*")`.
  - Under PER_WINE, hide the rank delta while a glass is only partly revealed.
- **Kept.** The glass-so-far delta stays, matching handoff screens 6h/6i.
- **Test.** A vitest case for `rankDelta` (guess-ladder-math.ts:136-156), with a contributor whose `last_round_points` is null.

#### 4. The host console hides answer-derived chips from a competing bring-your-own host (reveal-1)

In host/page.tsx:

1. Find the host's participant row: `participants.find((p) => p.user_id === tasting.host_id)`.
2. In `buildGlass`, set `hostGuesses = wine_source !== "HOST_PROVIDES" && reveal_mode !== "SEMI_BLIND" && wine.contributor_participant_id !== hostParticipant?.id`.
3. When `hostGuesses && !wine.is_revealed && revealStep === 0`, send the generic step list `[{ key: "country", label: "Country", missing: false, state: "next" }]`.
   - Never send `[]`: that would drop "Reveal the country".
   - From step 1 on, send the full `inPlaySteps(answer)` list.

`revealStep` and `expected_step` are unchanged.

### D.4 Entry points and data

#### 1. Adds are refused on CLOSED tastings and for contributors who haven't joined (D13; scan-7, sources-5, entry-2)

A new shared guard in `tasting-wine-writes.ts`:

```ts
export async function resolveTastingAdder(
  supabase: Db,
  userId: string,
  tastingId: string,
): Promise<
  | {
      tasting: { id: string; name: string; status: TastingStatus; revealMode: RevealMode; wineSource: WineSourceMode };
      contributorParticipantId: string | null;
    }
  | { error: string }
>;
```

**Refusals:**

| Case | Rule | Error |
|---|---|---|
| Tasting is CLOSED | always refused | "This tasting is finished — reopen it to add wines." |
| `PARTICIPANT_CONTRIBUTED` | the caller's participant row must be JOINED | "Join the tasting to add a wine." |
| `HOST_PROVIDES` | the caller must be the host | — |

**It replaces the three copies of the permission check in:**

- `insertTastingWineCore` (:183-198);
- `insertTastingWineFromCatalogRow` (:370-382);
- `addWineUnidentified` (:534-552).

**It also runs first in:**

- `insertTastingWineFromLot`, before any draw-down;
- `insertIncompleteGlass`;
- `insertTastingWineUnidentified`.

The UI side is A1's `canAddWine`.

#### 2. The Overview's live banner and flight hint (D12; scan-4, sources-2, entry-3, entry-4)

- **Types.** `LiveBanner` in `overview-types.ts` gains `canAddWine: boolean` and `timingMode: TimingMode`.
- **Data.** `overview-data.ts` sets `canAddWine = wine_source === "HOST_PROVIDES" ? host_id === userId : myStatus === "JOINED"`. The tasting not being CLOSED is already guaranteed by `pickLiveTasting`.
- **Registering the hint.** `banner.tsx` renders the live `FlightHintRegistrar` only when `banner.canAddWine`, as it already does for next-up (:26-53).
- **Hint phase.** The registrar passes `phase`: LIVE → "live", ASYNC → "self-paced", next-up → "next". The matrix subtitle reads "live now", "in progress" or "next up" accordingly.
- **`TastingScanRegistrar`** (tasting-scan-registrar.tsx) passes `phase` from the tasting's status and timing. add-wine-context.tsx:245-256 keeps a registered tasting's `phase` instead of forcing `live: false`.
- **Banner copy follows `timingMode`:**
  - LIVE keeps `LiveDot`, "Live now · {host}" and "Back to the table".
  - ASYNC shows a still dot, "In progress · self-paced · {host}" and "Continue guessing".
- **`/taste`, `tasting-card.tsx`:** an IN_PROGRESS tasting shows "Live now" only when `timing_mode === "LIVE"`, otherwise "In progress".

#### 3. The Overview's next-up banner: no bring-your-own slots

The per-participant "Empty" slot lines (overview-data.ts:416-427; banner.tsx:169-190) become "waiting for {name} to add it" rows, as on the lobby. This follows A1 and the handoff's "No BYO slots anywhere".

#### 4. `blind_pending` is cleared when a glass is removed, a draft deleted, or an answer re-linked (sources-4)

This is a SQL trigger plus a backfill (E.5). No app change.

#### 5. Pending invites to CLOSED tastings are hidden and refused (entry-6)

- **Bell.** `getPendingInvites` (src/lib/notifications.ts:23-46) selects the tasting's `status` and skips CLOSED tastings.
- **Lobby** (page.tsx:362-389). When `myStatus === "INVITED" && tasting.status === "CLOSED"`, the card reads "This tasting has finished" with no Accept button. DRAFT and IN_PROGRESS tastings keep Accept and Decline.
- **Server** (`respondToInvite`, tastings/[id]/actions.ts:338-357):
  - For `accept`, read the tasting's status first. If it is CLOSED, return without updating.
  - The action keeps its `Promise<void>` signature. The lobby binds it as a form action (page.tsx:374, 379), and invitation-row.tsx awaits it. The lobby card no longer offers Accept on a CLOSED tasting, so the refusal needs no message.
  - Decline stays allowed.

#### 6. Cellar launchers read "Add a bottle", and the empty tile opens the sheet (entry-8, C.6)

- **Label changes** to "Add a bottle":
  - nav-links.ts:62 (the Cellar child only);
  - cellar/page.tsx:416;
  - cellar-bottles-table.tsx:286.
- **Empty tile.** The dashed empty tile in cellar-card.tsx becomes a client launcher: `ActionButtonClient` with `launch="cellar"` and the tile's classes.

#### 7. About: Taste Semi-Blind folds into Taste Blind

- **Card.** Remove the separate card at about/page.tsx:39-43.
- **Taste Blind body** (:34-35) becomes: "Nothing is known in advance — or, semi-blind, the wines are known and the order is not. Guess country, region, grape, vintage and producer, or match each glass to a candidate; the host reveals field by field and the points land as they go."
- **Heading** (:189-190): "Three ways to taste".
- **Grid:** `xl:grid-cols-4` becomes `xl:grid-cols-3`.

#### 8. New reference rows keep the appellation shape (byhand-5)

- **`WineIdentityFields`** (wine-identity-fields.tsx:186-190, 218-235):
  - The appellation combobox loses `allowClear`.
  - Its placeholder uses the same helpers as A7 (`self-named-appellation.ts` plus the `regionSelfNamedAppellation` action): "Just the region" when the region has a self-named appellation, otherwise "Pick one".
- **`createRegion`** (wines/new/actions.ts:66 and catalog/new/actions.ts) also find-or-creates the region's self-named appellation.
- **`createCountry`** (wines/new/actions.ts:20 and catalog/new/actions.ts) also find-or-creates that country's "None" region and "None" appellation.
- **CLAUDE.md:** the "Appellation is optional" paragraph is rewritten (G.6).
---

## 7. Part E — Schema

### E.0 Conventions for all seven migrations

**Files and apply order**

The files live in `supabase/migrations/`. The implementation writes and dry-runs them; the main session applies them live, in the ledger's order:
1. `20260912100100_label_reads.sql`
2. `20260912101000_producer_folded_lookup.sql`
3. `20260912102000_wine_identity_drafts.sql`
4. `20260912103000_cellar_pour_intent.sql`
5. `20260912104000_blind_pending_unmark_on_delete.sql`
6. `20260912105000_reveal_step_null_scoring.sql`
7. `20260912106000_leaderboard_round_wine.sql`

**Rules for every file**

- **No `begin` / `commit`.** `scripts/scratch-apply.mjs` wraps each file in one transaction. (20260905100000 carried its own; new files must not.)
- **End with assertions.** Each file ends with a `do $$ … $$` block of same-transaction assertions, following the 20260911100000 pattern. Version rows have been seen recorded without their DDL (CLAUDE.md, World Wine Map 3C/3D).
- **New SECURITY DEFINER functions**
  - pin `set search_path = public`;
  - grant `execute … to authenticated`;
  - get an assertion, addressed by full signature via `to_regprocedure`, that `pg_proc.prosecdef` is true and that `proconfig` contains `search_path=public`.
- **Cross-table RLS goes through SECURITY DEFINER helpers** (`is_tasting_host`, `is_tasting_participant`, and the new `is_wine_adder`). Never write a raw subquery on tastings / tasting_participants / wines; see the RLS recursion rule in CLAUDE.md.
- **Behavioural assertions leave no data.** An assertion that exercises a function or a policy builds synthetic rows inside a nested `begin … exception when sqlstate 'SYNRB' then null; end` block.
  - The block copies what it observes into PL/pgSQL variables. It then ends with `raise exception 'synthetic rollback' using errcode = 'SYNRB'`, which rolls back its subtransaction. The outer block asserts on the variables, which are not transactional and so survive the rollback.
  - This behaves the same in `--mode dry` and `--mode live`: a live apply commits no synthetic row. Any other error still fails the migration.
  - An expected refusal inside the block, such as an RLS insert that must fail, runs in its own nested `begin … exception when insufficient_privilege …` block.
  - Synthetic tastings use existing `profiles` ids, because `tastings.host_id` and `tasting_participants.user_id` reference `profiles` (init_schema.sql:88, 101). When too few profiles exist, the block raises a notice and skips.
  - Calls that read `auth.uid()` run after `perform set_config('request.jwt.claims', json_build_object('sub', <uuid>, 'role', 'authenticated')::text, true)`. RLS checks also run `set local role authenticated` inside the block; the rollback restores the role.
- **Dry run.** Run `node scripts/scratch-apply.mjs --file supabase/migrations/<file>.sql --mode dry` (it reads DB_PASSWORD from `.env.local`). It must print `DRY-OK <version> <name>`.
- **Types.** `src/lib/supabase/database.types.ts` changes with each schema change (E.8). Every table keeps `Relationships: []`, and the schema keeps `Views: {}`. jsonb columns are typed `unknown`, as the file already does.

### E.1 `20260912100100_label_reads.sql` (D1)

```sql
create table public.label_reads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  image_path text not null check (image_path like 'catalog/staging/%'),
  outcome text not null check (outcome in ('ok', 'not-a-label', 'not-read')),
  read jsonb,                                  -- null exactly when outcome = 'not-read'
  model text not null,
  input_tokens integer not null default 0 check (input_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  created_at timestamptz not null default now(),
  constraint label_reads_read_matches_outcome check ((read is null) = (outcome = 'not-read'))
);

create index label_reads_user_created_idx on public.label_reads (user_id, created_at desc);

alter table public.label_reads enable row level security;

create policy "label_reads own select" on public.label_reads
  for select to authenticated using (user_id = auth.uid());
create policy "label_reads own insert" on public.label_reads
  for insert to authenticated with check (user_id = auth.uid());
create policy "label_reads own delete" on public.label_reads
  for delete to authenticated using (user_id = auth.uid());
-- No update policy: a read is a record and is never edited.
```

**Design notes**
- **Owner-only.** RLS limits every row to its owner (D1).
- **`user_id` references `auth.users`, not `profiles`.** Seeded demo accounts have no `profiles` row (CLAUDE.md), and they must still be able to exercise scans during verification.
- **No image bytes.** The table stores `image_path` only.
- **Every billed call is a row.** A refusal, a `max_tokens` stop or an unparsed output is billed but has no read. So `read` is nullable, and `outcome` says what happened (A.5 step 5). The A.7 cost query therefore counts real spend, expensive failures included.
- **No helper function.** The policies only look at this table.

**Assertions**
- The table exists and `relrowsecurity` is true.
- Exactly the three policies exist, and none is `UPDATE` or `ALL`.
- No column has type `bytea`.
- The nine columns exist with the nullability shown, together with the `outcome` check and `label_reads_read_matches_outcome`.
- Behavioural (E.0): profile A inserts a row. As profile B, a `select` returns no row, and an `update` changes nothing.

### E.2 `20260912101000_producer_folded_lookup.sql` (D6, D8)

```sql
create index if not exists producers_search_norm_eq_idx
  on public.producers (public.f_search_norm(name));

create or replace function public.find_producer_by_folded_name(p_name text, p_region_id uuid default null)
returns uuid
language sql
stable
security invoker
set search_path = public
as $$
  select p.id
  from producers p
  where public.f_search_norm(p_name) <> ''
    and public.f_search_norm(p.name) = public.f_search_norm(p_name)
  order by (p_region_id is not null and p.region_id = p_region_id) desc,
           (p.region_id is not null) desc,
           p.name,
           p.id
  limit 1
$$;

create or replace function public.find_or_create_producer(p_name text, p_region_id uuid default null)
returns uuid
language plpgsql
volatile
security invoker
set search_path = public
as $$
declare
  v_name text := btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
  v_id uuid;
begin
  if public.f_search_norm(v_name) = '' then
    raise exception 'producer name is empty';
  end if;
  v_id := public.find_producer_by_folded_name(v_name, p_region_id);
  if v_id is not null then
    return v_id;
  end if;
  insert into producers (name, region_id) values (v_name, p_region_id)
  on conflict (name) do nothing
  returning id into v_id;
  return coalesce(v_id, public.find_producer_by_folded_name(v_name, p_region_id));
end $$;

grant execute on function public.find_producer_by_folded_name(text, uuid) to authenticated;
grant execute on function public.find_or_create_producer(text, uuid) to authenticated;
```

**Design notes**
- **SECURITY INVOKER is enough.** Any authenticated user may read and insert `producers` (init_schema.sql:319-320).
- **The index is usable.** `f_search_norm` is IMMUTABLE (20260829260000), so the btree functional index serves the equality lookup.
- **Existing folded collisions are tolerated.** The lookup order is deterministic. The migration `raise notice`s how many there are; it does not merge them.
- **A race is accepted.** Two different spellings that fold equal, inserted at the same moment, can both land, because the plain `unique (name)` constraint does not fold. The next lookup is still deterministic.

**Assertions**
- Both functions exist, addressed by signature.
- The index exists.
- For one existing producer, `find_producer_by_folded_name(upper(name))` returns a producer whose `f_search_norm(name)` equals the original's.
- `find_or_create_producer('  ')` raises. This is checked in a nested `begin … exception when others then … end` block inside the `do`.

### E.3 `20260912102000_wine_identity_drafts.sql` (D7, D13)

```sql
-- 1. How a glass was added (D13's identity line). Null for legacy rows.
alter table public.wines
  add column added_via text
  check (added_via in ('SCAN', 'CATALOG', 'CELLAR', 'BY_HAND'));

-- 2. Who added a glass: the host for a glass with no contributor, else the contributor.
create or replace function public.is_wine_adder(p_wine_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from wines w
    join tastings t on t.id = w.tasting_id
    left join tasting_participants p on p.id = w.contributor_participant_id
    where w.id = p_wine_id
      and (
        (w.contributor_participant_id is null and t.host_id = auth.uid())
        or p.user_id = auth.uid()
      )
  )
$$;
grant execute on function public.is_wine_adder(uuid) to authenticated;

-- 3. An incomplete glass: a wines row and a draft, with no wine_answers until it is complete.
create table public.wine_identity_drafts (
  wine_id uuid primary key references public.wines(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  draft jsonb not null,
  -- Field keys live only in src/lib/wine-identity (D2); SQL checks only that the list is non-empty.
  missing text[] not null check (cardinality(missing) > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.wine_identity_drafts enable row level security;

create policy "wine_identity_drafts own select" on public.wine_identity_drafts
  for select to authenticated using (owner_id = auth.uid());
create policy "wine_identity_drafts own insert" on public.wine_identity_drafts
  for insert to authenticated with check (owner_id = auth.uid() and is_wine_adder(wine_id));
create policy "wine_identity_drafts own update" on public.wine_identity_drafts
  for update to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid() and is_wine_adder(wine_id));
create policy "wine_identity_drafts own delete" on public.wine_identity_drafts
  for delete to authenticated using (owner_id = auth.uid());

-- 4. A glass is never both: an answer key clears its draft, and a draft is refused for an answered glass.
create or replace function public.wine_answers_clear_identity_draft()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from wine_identity_drafts where wine_id = new.wine_id;
  return null;
end $$;

create trigger trg_wine_answers_clear_identity_draft
  after insert on public.wine_answers
  for each row execute function public.wine_answers_clear_identity_draft();

create or replace function public.wine_identity_drafts_refuse_answered()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from wine_answers where wine_id = new.wine_id) then
    raise exception 'glass % already has an answer key', new.wine_id;
  end if;
  return new;
end $$;

create trigger trg_wine_identity_drafts_refuse_answered
  before insert on public.wine_identity_drafts
  for each row execute function public.wine_identity_drafts_refuse_answered();

-- 5. Start / reveal gating: every glass with no answer key, its list-order number, and only its missing field keys.
create or replace function public.tasting_incomplete_glasses(p_tasting_id uuid)
returns table (wine_id uuid, glass integer, missing text[])
language sql
stable
security definer
set search_path = public
as $$
  select g.id,
         g.glass,
         coalesce(d.missing, '{}'::text[])   -- no draft: toIncompleteGlasses expands an empty list to every field
  from (
    select w.id, (row_number() over (order by w.position))::int as glass
    from wines w
    where w.tasting_id = p_tasting_id
  ) g
  left join wine_identity_drafts d on d.wine_id = g.id
  where not exists (select 1 from wine_answers a where a.wine_id = g.id)
    and (is_tasting_host(p_tasting_id) or is_tasting_participant(p_tasting_id))
  order by g.glass
$$;
grant execute on function public.tasting_incomplete_glasses(uuid) to authenticated;
```

**Design notes**
- **Drafts are owner-only.** Only the owner, who is the adder, can read or write a draft (D7).
- **The adder check goes through `is_wine_adder`.** It is SECURITY DEFINER; the policies never use a raw subquery on `wines` or `tasting_participants`.
- **`tasting_incomplete_glasses` returns field keys only, never draft values.** That is why participants may call it: auto-reveal and locking run in their sessions.
- **A glass with neither an answer key nor a draft counts as incomplete,** with every field missing. This covers a failed second write (C.8). The function returns an empty key list, and `toIncompleteGlasses` expands it to every `COMPLETE_WINE_FIELDS` key.
- **No field keys in SQL.** Neither the check constraint nor the function names a field key, so flipping D3 changes no SQL (B.3).
- **Glass numbers follow list order,** matching the app's numbering (CLAUDE.md).

**Assertions**
- `wines.added_via` exists, with its check.
- The table exists, RLS is enabled, and exactly four policies exist.
- No policy qual on `wine_identity_drafts` mentions `tasting_participants` or `from wines`; the helper is used instead.
- Both triggers exist.
- `is_wine_adder(uuid)`, `tasting_incomplete_glasses(uuid)` and both trigger functions are SECURITY DEFINER with `search_path=public`.
- No existing `wines` row has both a draft and an answer key.
- Behavioural (E.0). The scenario is a synthetic DRAFT host-provides tasting with host A, a JOINED participant B, and one glass with no answer key.
  - As A, inserting a draft succeeds.
  - As B, `select` on `wine_identity_drafts` returns no row for that glass.
  - As B, `tasting_incomplete_glasses` returns the glass with its key list only.
  - As B, inserting a draft for that glass is refused by the `is_wine_adder` check.

### E.4 `20260912103000_cellar_pour_intent.sql` (D11)

```sql
-- The adder's intent to pour their own cellar bottle into a glass. Kept off `wines`, which every
-- host and participant can read (init_schema.sql:370-378): a lot id there would name a hidden
-- glass through a PUBLIC or FRIENDS cellar (20260829243000:21-44).
create table public.wine_pour_intents (
  wine_id uuid primary key references public.wines(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  cellar_lot_id uuid references public.cellar_lots(id) on delete set null,
  consume_on_start boolean not null default false,
  cellar_consumption_id uuid references public.cellar_consumptions(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.wine_pour_intents enable row level security;

create policy "wine_pour_intents own select" on public.wine_pour_intents
  for select to authenticated using (owner_id = auth.uid());
create policy "wine_pour_intents own insert" on public.wine_pour_intents
  for insert to authenticated with check (owner_id = auth.uid() and is_wine_adder(wine_id));
create policy "wine_pour_intents own delete" on public.wine_pour_intents
  for delete to authenticated using (owner_id = auth.uid());
-- No update policy: only the two SECURITY DEFINER functions below write cellar_consumption_id.

-- Start: pour every glass whose adder asked, when adding it, to take their bottle out of the cellar.
create or replace function public.draw_down_flight_cellar_lots(p_tasting_id uuid)
returns table (wine_id uuid, glass integer, outcome text)
language plpgsql
volatile
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_tasting tastings%rowtype;
  r record;
  v_lot cellar_lots%rowtype;
  v_consumption uuid;
begin
  if not is_tasting_host(p_tasting_id) then
    raise exception 'only the host can pour the flight';
  end if;
  select * into v_tasting from tastings where id = p_tasting_id;
  if v_tasting.status = 'DRAFT' then
    raise exception 'start the tasting before pouring';
  end if;

  for r in
    select g.id, g.glass, i.cellar_lot_id, i.owner_id,
           coalesce(p.user_id, v_tasting.host_id) as adder_id
    from (
      select id, (row_number() over (order by position))::int as glass
      from wines
      where tasting_id = p_tasting_id
    ) g
    join wines w on w.id = g.id
    join wine_pour_intents i on i.wine_id = g.id
    left join tasting_participants p on p.id = w.contributor_participant_id
    where i.consume_on_start and i.cellar_consumption_id is null
    order by g.glass
  loop
    select * into v_lot from cellar_lots where id = r.cellar_lot_id for update;
    if not found then
      wine_id := r.id; glass := r.glass; outcome := 'lot-missing'; return next; continue;
    end if;
    -- Only the adder's own bottle is ever poured.
    if r.owner_id <> r.adder_id or v_lot.owner_id <> r.owner_id then
      wine_id := r.id; glass := r.glass; outcome := 'not-adders-lot'; return next; continue;
    end if;
    if v_lot.quantity < 1 then
      wine_id := r.id; glass := r.glass; outcome := 'empty'; return next; continue;
    end if;
    update cellar_lots set quantity = quantity - 1 where id = v_lot.id;
    insert into cellar_consumptions (owner_id, lot_id, catalog_wine_id, quantity, reason, consumed_on, occasion)
    values (v_lot.owner_id, v_lot.id, v_lot.catalog_wine_id, 1, 'DRANK',
            (now() at time zone 'utc')::date, v_tasting.name)
    returning id into v_consumption;
    update wine_pour_intents set cellar_consumption_id = v_consumption where wine_id = r.id;
    wine_id := r.id; glass := r.glass; outcome := 'drawn'; return next;
  end loop;
end $$;
grant execute on function public.draw_down_flight_cellar_lots(uuid) to authenticated;

-- Running flight: the adder pours their own bottle into a glass they just added.
create or replace function public.pour_cellar_lot_into_glass(p_wine_id uuid)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_wine wines%rowtype;
  v_tasting tastings%rowtype;
  v_intent wine_pour_intents%rowtype;
  v_lot cellar_lots%rowtype;
  v_id uuid;
begin
  if not is_wine_adder(p_wine_id) then
    raise exception 'only the person who added this glass can pour it';
  end if;
  select * into v_wine from wines where id = p_wine_id;
  select * into v_tasting from tastings where id = v_wine.tasting_id;
  if v_tasting.status = 'DRAFT' then
    raise exception 'a draft flight pours at Start';
  end if;
  select * into v_intent from wine_pour_intents i
   where i.wine_id = p_wine_id and i.owner_id = auth.uid()
   for update;
  if not found then
    raise exception 'no pour intent for this glass';
  end if;
  if v_intent.cellar_consumption_id is not null then
    return v_intent.cellar_consumption_id;
  end if;
  select * into v_lot from cellar_lots where id = v_intent.cellar_lot_id for update;
  if not found or v_lot.owner_id <> auth.uid() then
    raise exception 'not your lot';
  end if;
  if v_lot.quantity < 1 then
    raise exception 'no bottles left in this lot';
  end if;
  update cellar_lots set quantity = quantity - 1 where id = v_lot.id;
  insert into cellar_consumptions (owner_id, lot_id, catalog_wine_id, quantity, reason, consumed_on, occasion)
  values (auth.uid(), v_lot.id, v_lot.catalog_wine_id, 1, 'DRANK',
          (now() at time zone 'utc')::date, v_tasting.name)
  returning id into v_id;
  update wine_pour_intents i set cellar_consumption_id = v_id where i.wine_id = p_wine_id;
  return v_id;
end $$;
grant execute on function public.pour_cellar_lot_into_glass(uuid) to authenticated;
```

**Design notes**
- **The intent is owner-only.** Only its owner may read, insert or delete it, and the owner must be the glass's adder (`is_wine_adder`). Participants never learn which lot a glass came from (C.7).
- **The adder writes the intent in one INSERT** that this table's RLS allows. A bring-your-own contributor cannot update `wines` (init_schema.sql:389-391), so an intent written by updating `wines` would silently be lost for them.
- **`wines` gains only `added_via`** (E.3). Its values say how a glass was added, never which wine it is.
- **Only the adder's own lot is ever consumed.**
  - `draw_down_flight_cellar_lots` consumes a lot only when the intent's owner is the glass's adder and also owns the lot. An intent that points at someone else's lot is reported as `not-adders-lot`.
  - `pour_cellar_lot_into_glass` requires the lot's owner to be the caller.
- **Both functions are idempotent.** An intent whose `cellar_consumption_id` is set is never poured again, so a repeated Start or a retried pour draws nothing twice.
- **No check constraint ties `consume_on_start` to `cellar_lot_id`.** The lot's `on delete set null` would violate one. A lot that has gone missing is reported as the `lot-missing` outcome instead.
- **Removing a DRAFT glass or deleting a DRAFT tasting needs no cleanup.** The intent cascades away with the `wines` row, and nothing had been consumed.

**Assertions**
- The table exists, RLS is enabled, and exactly three policies exist, none of them `UPDATE` or `ALL`. No policy qual mentions `tasting_participants` or `from wines`.
- The foreign keys exist: `wine_id` with `confdeltype = 'c'`; `cellar_lot_id` and `cellar_consumption_id` with `confdeltype = 'n'`. `consume_on_start` is `not null default false`.
- `wines` has no `cellar_lot_id`, `consume_on_start` or `cellar_consumption_id` column.
- Both functions exist, addressed by signature. Each is SECURITY DEFINER, has `search_path=public`, and is executable by `authenticated`.
- Behavioural (E.0). The scenario is a synthetic host-provides tasting with host A and a JOINED participant B.
  - Setup: an existing catalog wine; a 2-bottle lot owned by A and a 2-bottle lot owned by B. Glass 1 carries A's intent on A's lot. Glass 2 carries an intent owned by A that points at B's lot. Both intents set `consume_on_start`, and the tasting is set to IN_PROGRESS.
  - As A, the first `draw_down_flight_cellar_lots` returns `drawn` for glass 1 and `not-adders-lot` for glass 2. A's lot then holds 1 bottle, and B's still holds 2.
  - A second call returns no `drawn` row, and A's lot still holds 1.
  - As B, `select` on `wine_pour_intents` returns no row.

### E.5 `20260912104000_blind_pending_unmark_on_delete.sql` (sources-4)

```sql
create or replace function public.catalog_wine_unmark_blind_on_unlink()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.catalog_wine_id is null then
    return null;
  end if;
  if tg_op = 'UPDATE' and new.catalog_wine_id is not distinct from old.catalog_wine_id then
    return null;
  end if;
  update catalog_wines cw set blind_pending = false
  where cw.id = old.catalog_wine_id
    and cw.blind_pending
    and not exists (
      select 1 from wine_answers wa join wines w on w.id = wa.wine_id
      where wa.catalog_wine_id = cw.id and not w.is_revealed
    );
  return null;
end $$;

drop trigger if exists trg_catalog_wine_unmark_blind_on_unlink on public.wine_answers;
create trigger trg_catalog_wine_unmark_blind_on_unlink
  after delete or update of catalog_wine_id on public.wine_answers
  for each row execute function public.catalog_wine_unmark_blind_on_unlink();

-- Backfill: rows that no unrevealed answer links any more.
update catalog_wines cw set blind_pending = false
where cw.blind_pending
  and not exists (
    select 1 from wine_answers wa join wines w on w.id = wa.wine_id
    where wa.catalog_wine_id = cw.id and not w.is_revealed
  );
```

**Design notes**
- **SECURITY DEFINER is needed** because only a wine's creator or a curator may update `catalog_wines` (20260829203000:41-50).
- **Paths it covers:**
  - `removeWine` and `deleteTasting`, where the FK cascade deletes `wine_answers`;
  - re-linking a wine in `saveFlightGlass`.
- **A wine stays hidden while another unrevealed glass still links to it.** The result does not depend on the order in which cascaded rows are deleted.
- **It completes a set of three triggers:** the insert-time mark (20260829263100), the reveal-time unmark (20260829263200), and this one.

**Assertions**
- The trigger exists on `wine_answers` for DELETE and UPDATE.
- The function is SECURITY DEFINER with `search_path=public`.
- `select count(*) from catalog_wines cw where blind_pending and not exists (…unrevealed answer…)` returns 0.

### E.6 `20260912105000_reveal_step_null_scoring.sql` (reveal-3)

**What stays the same.** Recreate these two functions verbatim:
- `reveal_next_category(uuid, smallint)`, from `20260819094000_reveal_next_category_auth_fix.sql`;
- `reveal_own_next_category(uuid, smallint)`, from `20260819096000_reveal_own_next_category.sql`.

Each keeps its signature, `security definer`, `set search_path = public`, the host / owner gate, the CLOSED refusal, the compare-and-set step and `in_play_steps`.

**What changes.** Two branches in each function, now matching `reveal_wine` (20260807090000):

```sql
  elsif v_next = 'producer' then
    update guesses set producer_points = case
      when v_ans.producer_id is null then null
      when producer_id = v_ans.producer_id then 6
      else 0 end
    where wine_id = p_wine_id;              -- reveal_own_next_category: and participant_id = v_pid
  …
  elsif v_next = 'vintage' then
    update guesses set vintage_points = case
      when v_ans.vintage_kind is null then null
      when vintage_kind is null then 0
      when vintage_kind = v_ans.vintage_kind and vintage_kind = 'NV' then 2
      when vintage_kind = v_ans.vintage_kind and vintage_kind = 'TAWNY' and vintage_tawny_years = v_ans.vintage_tawny_years then 2
      when vintage_kind = v_ans.vintage_kind and vintage_kind = 'YEAR' and vintage_year = v_ans.vintage_year then 2
      when vintage_kind = v_ans.vintage_kind and vintage_kind = 'YEAR' and abs(vintage_year - v_ans.vintage_year) = 1 then 1
      else 0 end
    where wine_id = p_wine_id;              -- reveal_own_next_category: and participant_id = v_pid
```

**`in_play_steps` is unchanged.** `inPlayKeys` in reveal-rows-math.ts assumes only appellation and type designation can be optional when it infers keys from `in_play_count`. Its stale "NOT NULL" comment is corrected in this migration's comments.

**Assertions and backfill.** The migration's single `do $$ … $$` block runs in this order:

1. `select coalesce(sum(total_points), 0) into v_before from guesses;`
2. The guarded backfill. It touches only scored, non-semi-blind guesses whose answer has no producer or no vintage.
   - Most of those guesses sit on fully revealed wines. `guesses_block_after_reveal` (BEFORE INSERT OR UPDATE on `guesses`, init_schema.sql:195-209) raises on any write to a guess whose wine `is_revealed`. That is why `reveal_wine` scores guesses before it sets `is_revealed` (20260807090000:85-155).
   - So the backfill disables that one trigger around its two updates, in the same transaction, and enables it again straight after.
   - `alter table … disable trigger` holds an ACCESS EXCLUSIVE lock on `guesses` until the transaction ends; the transaction is short.
   - `guesses_set_updated_at` stays enabled, so each touched row gets a new `updated_at`.
   ```sql
   alter table public.guesses disable trigger guesses_block_after_reveal;

   update guesses g set producer_points = null
   from wine_answers wa, wines w, tastings t
   where wa.wine_id = g.wine_id and w.id = g.wine_id and t.id = w.tasting_id
     and wa.producer_id is null and g.scored_at is not null and g.producer_points is not null
     and t.reveal_mode <> 'SEMI_BLIND';

   update guesses g set vintage_points = null
   from wine_answers wa, wines w, tastings t
   where wa.wine_id = g.wine_id and w.id = g.wine_id and t.id = w.tasting_id
     and wa.vintage_kind is null and g.scored_at is not null and g.vintage_points is not null
     and t.reveal_mode <> 'SEMI_BLIND';

   alter table public.guesses enable trigger guesses_block_after_reveal;
   ```
3. The assertions:
   - both functions exist by signature, are SECURITY DEFINER, and have `search_path=public`;
   - `pg_get_functiondef` of each contains `v_ans.producer_id is null then null` and `v_ans.vintage_kind is null then null`;
   - `coalesce(sum(total_points), 0)` still equals `v_before`;
   - no scored, non-semi-blind guess on a null-producer answer still has a non-null `producer_points`, and none on a null-vintage answer still has a non-null `vintage_points`;
   - `guesses_block_after_reveal` is enabled again (`pg_trigger.tgenabled = 'O'`).

Why the totals don't move: the old step code could only have written 0 in those rows, since a null answer never compares equal. Nulling them stops `profile-stats.ts`'s per-category accuracy from counting "not applicable" as wrong.

### E.7 `20260912106000_leaderboard_round_wine.sql` (reveal-7)

**What stays the same.** Recreate `get_tasting_leaderboard(p_tasting_id uuid)` with:
- the same signature;
- the same return columns `(participant_id uuid, total integer, wines_scored integer, last_round_points integer)`;
- `language sql stable security definer set search_path to 'public'`;
- the same host / participant guard.

`t` and `countable` stay exactly as in 20260905100000. Only the round wine and `last_round_points` change:

```sql
with
  t as (
    select timing_mode::text as timing_mode,
           coalesce(leaderboard_reveal::text, 'PER_ATTRIBUTE') as leaderboard_reveal
    from tastings where id = p_tasting_id
  ),
  countable as ( … unchanged from 20260905100000 … ),
  -- LIVE: one round wine for the whole tasting.
  live_round as (
    select coalesce(
      (select w.id from wines w cross join t
        where t.timing_mode = 'LIVE' and t.leaderboard_reveal <> 'PER_WINE'
          and w.tasting_id = p_tasting_id and w.reveal_step > 0 and not w.is_revealed
        order by w.position limit 1),
      (select c.wine_id from countable c cross join t
        where t.timing_mode = 'LIVE' and c.scored_at is not null
        order by c.scored_at desc limit 1)
    ) as wine_id
  ),
  -- ASYNC: per participant, as before.
  async_round as (
    select distinct on (c.participant_id) c.participant_id, c.wine_id
    from countable c cross join t
    where t.timing_mode <> 'LIVE' and c.scored_at is not null
    order by c.participant_id, c.scored_at desc
  )
select
  p.id,
  coalesce(sum(c.pts), 0)::int,
  count(c.wine_id)::int,
  case
    when (select timing_mode from t) = 'LIVE' then
      case
        when lr.wine_id is null then null
        when rw.contributor_participant_id = p.id then null
        when not exists (
          select 1 from countable x where x.participant_id = p.id and x.scored_at is not null
        ) then null
        else coalesce(sum(c.pts) filter (where c.wine_id = lr.wine_id), 0)::int
      end
    else
      case
        when ar.wine_id is null then null
        else coalesce(sum(c.pts) filter (where c.wine_id = ar.wine_id), 0)::int
      end
  end
from tasting_participants p
cross join live_round lr
left join wines rw on rw.id = lr.wine_id
left join countable c on c.participant_id = p.id
left join async_round ar on ar.participant_id = p.id
where p.tasting_id = p_tasting_id
  and (is_tasting_host(p_tasting_id) or is_tasting_participant(p_tasting_id))
group by p.id, lr.wine_id, rw.contributor_participant_id, ar.wine_id;
```

**LIVE tastings: which wine is the round wine**
1. The lowest-position wine with `reveal_step > 0` that is not fully revealed. This is skipped under PER_WINE, where partial steps don't count.
2. Otherwise, the wine with the newest `scored_at` among countable guesses. Under PER_WINE, that is the last fully revealed wine.

**LIVE tastings: `last_round_points`**
- Each participant gets their points on the round wine, or 0 if they have no row there.
- It is null for the round wine's contributor.
- It is null for anyone with no scored guess at all. The console then hides "+N", and `rankDelta` already treats null as 0.

**ASYNC tastings** keep the per-participant pick.

**No unrevealed value crosses the boundary.** Only points totals are returned, as in 20260905100000.

**Assertions**
- Copied from 20260905100000:
  - the function exists by signature, is SECURITY DEFINER, and pins `search_path=public`;
  - the `guesses read` policy still gates on `is_revealed`;
  - no permissive SELECT policy on `guesses` references `reveal_step`.
- Behavioural (E.0). The scenario is a synthetic LIVE bring-your-own tasting with three JOINED participants: A (the host), B and C.
  - Glass 1 is A's bottle, fully revealed, with scored guesses by B and C.
  - Glass 2 is also A's bottle, at `reveal_step = 2` and unrevealed. B has a step-scored row on it; C has none. The rows are written so that 20260905100000's `countable` rule counts them.
  - Under PER_ATTRIBUTE the round wine is glass 2:
    - A gets null, as glass 2's contributor;
    - B gets their glass-2 points, a number;
    - C gets 0: a scored guess elsewhere, and no row on glass 2.
  - Under PER_WINE, set on the same synthetic tasting, the round wine is glass 1. A gets null, and B and C get their glass-1 points.

### E.8 `database.types.ts`

```ts
// Tables — wines gains one column (the pour intent is its own table, E.4)
wines: {
  Row: {
    id: string;
    tasting_id: string;
    position: number;
    contributor_participant_id: string | null;
    is_revealed: boolean;
    reveal_step: number;
    created_at: string;
    added_via: "SCAN" | "CATALOG" | "CELLAR" | "BY_HAND" | null;   // E.3
  };
  Insert: {
    id?: string;
    tasting_id: string;
    position: number;
    contributor_participant_id?: string | null;
    is_revealed?: boolean;
    reveal_step?: number;
    created_at?: string;
    added_via?: "SCAN" | "CATALOG" | "CELLAR" | "BY_HAND" | null;
  };
  Update: Partial<Database["public"]["Tables"]["wines"]["Insert"]>;
  Relationships: [];
};

// Tables — new
label_reads: {
  Row: {
    id: string; user_id: string; image_path: string; outcome: "ok" | "not-a-label" | "not-read";
    read: unknown | null; model: string; input_tokens: number; output_tokens: number; created_at: string;
  };
  Insert: {
    id?: string; user_id: string; image_path: string; outcome: "ok" | "not-a-label" | "not-read";
    read?: unknown | null; model: string; input_tokens?: number; output_tokens?: number; created_at?: string;
  };
  Update: Partial<Database["public"]["Tables"]["label_reads"]["Insert"]>;
  Relationships: [];
};
wine_identity_drafts: {
  Row: { wine_id: string; owner_id: string; draft: unknown; missing: string[]; created_at: string; updated_at: string };
  Insert: { wine_id: string; owner_id: string; draft: unknown; missing: string[]; created_at?: string; updated_at?: string };
  Update: Partial<Database["public"]["Tables"]["wine_identity_drafts"]["Insert"]>;
  Relationships: [];
};
wine_pour_intents: {
  Row: {
    wine_id: string; owner_id: string; cellar_lot_id: string | null; consume_on_start: boolean;
    cellar_consumption_id: string | null; created_at: string;
  };
  Insert: {
    wine_id: string; owner_id: string; cellar_lot_id?: string | null; consume_on_start?: boolean;
    cellar_consumption_id?: string | null; created_at?: string;
  };
  Update: Partial<Database["public"]["Tables"]["wine_pour_intents"]["Insert"]>;
  Relationships: [];
};

// Functions — new
// p_region_id accepts null, so resolveProducer passes its nullable regionId straight through (B.7).
// search_producers' existing entry (database.types.ts:1388-1390) keeps `p_region_id?: string`.
find_producer_by_folded_name: { Args: { p_name: string; p_region_id?: string | null }; Returns: string | null };
find_or_create_producer: { Args: { p_name: string; p_region_id?: string | null }; Returns: string };
is_wine_adder: { Args: { p_wine_id: string }; Returns: boolean };
tasting_incomplete_glasses: {
  Args: { p_tasting_id: string };
  Returns: { wine_id: string; glass: number; missing: string[] }[];
};
draw_down_flight_cellar_lots: {
  Args: { p_tasting_id: string };
  Returns: { wine_id: string; glass: number; outcome: string }[];
};
pour_cellar_lot_into_glass: { Args: { p_wine_id: string }; Returns: string };
```

**Unchanged:** the type entries for `get_tasting_leaderboard`, `reveal_next_category` and `reveal_own_next_category`. Their signatures and return shapes do not change.
---

## 8. Part F — Left for the owner, and open questions

### F.1 Left for the owner — do not build (D15)

- **sources-6.** The "already in your cellar" merge card drops a typed rack and price. The B1/B3 "+1 bottle" row avoids typing them, so the merge card stays as it is.
- **sources-7.** Repeat glasses and several bottles per glass. The in-flight marker stays a disabled row.
- **reveal-8.** Live draft consensus in the host console's "This glass" facts.
- **entry-7.** Adding a wine to a running semi-blind tasting.
- **entry-5.** The header camera on the host console. The console still has no `TastingScanRegistrar`, and the lobby camera stays locked to the flight.
- **Handoff decision 1.** Auto-add on a confident single match. The explicit confirm stays.
- **scan-6.** Anything beyond D10's in-flight marking. There is no extra duplicate warning on scan.

### F.2 Built as specified, but flagged to the owner

- **D3 — wine name optional.** To flip it, add one entry to `COMPLETE_WINE_FIELDS` and update its pin test (B.3).
- **D11 — draw-down at the pour.** Built with the owner-only `wine_pour_intents` table and two functions (E.4). To go back to add-time draw-down, `insertTastingWineFromLot` would consume for DRAFT flights too.
- **§2.1 row 6 — E1/E1b keep the recovery buttons.** The canvas does not draw them.
- **§2.1 row 11 — five database objects sit inside listed migrations** rather than new files. D11's intent fields live in the owner-only `wine_pour_intents`, not on `wines`, because a lot id on `wines` would name hidden glasses (C.7, E.4).
- **D1 — `label_reads` gains `outcome`, and `read` is nullable.** A billed read with no parsed output is still recorded and counted (A.5, E.1).
- **B.5 — no geographic indication in France resolves to Vin de France,** the national tier the catalog uses, and to the per-country None pair everywhere else (F.3 Q17).
- **C.8 — an OPEN tasting never holds an incomplete glass.** Its glasses are inserted already revealed, so a partial read goes to By hand or a pending row instead.
- **D8 / B.8 — several principal grapes.** D8 names `wine_place_grapes` as the source but not how to choose among several principal grapes. B.8 suggests one only when exactly one has a share of at least 60% (F.3 Q15).
- **D13 — a fourth source word.** D13's identity line names "scanned | from the catalog | by hand". A glass poured from the cellar (D11) reads "from my cellar" (C.5 A1).
- **Handoff decision 3 — price at add time.** The cellar lot step keeps its optional "Price per bottle" at add time (C.5 B1–B3), and the lot's own page still edits it.

### F.3 Open questions (not built)

1. **Thinking tokens.** Sonnet 5 runs adaptive thinking at `effort: "low"`. If `label_reads` shows output tokens well above D1's ~400, the owner may choose `thinking: { type: "disabled" }`, which Sonnet 5 accepts. That call should be made on real reads only.
2. **A database floor for adds.** `resolveTastingAdder` guards the app, not direct PostgREST writes. A `wines insert` policy refusing CLOSED tastings and non-JOINED contributors, through a SECURITY DEFINER helper, would close that gap (sources-5, entry-2). The ledger lists no migration for it.
3. **Narrowing `wine_answers read` for bring-your-own hosts.** C.9 hides markers in the app, but the host clause still lets a bring-your-own host read guests' answer keys through the API (sources-3, create-3, reveal-1). Narrowing it first needs a spoiler-safe RPC for the host console's facts.
4. **Filtering `search_catalog_wines` in SQL.** Hidden rows are filtered in the app (B.6), but the RPC itself still returns `blind_pending` rows. Filtering in SQL is scan-2's more robust fix.
5. **Semi-blind bring-your-own.** Two items are not built:
   - glass labelling beyond the caption (create-6);
   - opaque candidate ids (play-2, item 5).
6. **"Reveal the rest and end."** End tasting only warns about unrevealed glasses (reveal-4, item 2).
7. **Joining after Start.** Accepting an invite or joining by link after Start is still allowed; only CLOSED tastings are refused (create-2, entry-6).
8. **"Tonight's flight" wording.** It stays even for a next-up draft that isn't tonight (entry-4; sources-2, item 6).
9. **Profile columns after FastCork.** `winery_description`, `aroma`, `tasting_notes`, `food_pairing`, the serving temperatures and decanting become manual-only in Manage wine. A Sonnet read fills only `description` and `alcohol_percent`.
10. **Staging photos.**
    - Scan uploads under `wine-images/catalog/staging/` are never cleaned up.
    - Any authenticated user may overwrite or delete any `catalog/*` object (20260829250000:16-50), so a stored read's photo can change or vanish. That weakens replay.
    - A per-user write policy on `catalog/staging/<uid>/` and a cleanup job are separate decisions.
11. **`FASTCORK_API_KEY` in the Vercel environment.** The owner can delete it.
12. **The unrelated `package-lock.json` diff** (42 deleted `libc` lines) predates this work. This work neither commits it nor rewrites it in the working tree (A.1). Committing, discarding or keeping it is the owner's call.
13. **"+1 bottle" is not atomic.** `increaseCellarLotQuantity` reads, then updates (cellar/new/actions.ts:175-205). That is harmless for one user tapping once; an atomic RPC would need a migration.
14. **Bring-your-own position race.** Adds take `count + 1` with no retry (tasting-wine-writes.ts:200-204), so two contributors adding at the same moment can hit `unique (tasting_id, position)`. This spec does not change that.
15. **Grape suggestion with several principal grapes.** B.8 suggests a grape only when one principal grape has at least a 60% share. The owner may prefer another rule.
16. **The in-flight flag in semi-blind tastings.** D10 shows it only for wines the caller knows (C.9). The create-3 and sources-3 verifiers would flag every candidate, because the candidate list is public. That would also stop a bring-your-own contributor from pouring a candidate twice. It is not built.
17. **France's "None" rows.** No-GI reads in France resolve to Vin de France (B.5), but France's None region and appellation still exist and can still be picked. Merging them into Vin de France, and repointing any answer keys, catalog wines and guesses that use them, needs a data migration the ledger does not list.
18. **The consume checkbox with no destination and no flight hint.**
    - The none column keeps "Take it out of the cellar when we pour it". With no hint, a lot's only chooser row is "Rate it now", where the choice means "draw it down when the note saves".
    - entry-3 item 4 would hide the cellar entry points when there is nowhere to pour. It is declined: the matrix's inputs are the destination and `canScan` (D4), and rating a bottle you own is the common case (C.5 C1).
    - The owner may want different wording.
19. **reveal-5, verifier items 1–2.** The console's "You haven't locked in yet" line and link for a bring-your-own host who is also guessing are not built. After D.1 #7 that host lands on the lobby at Start. If they open the console anyway, its locked-in count still waits on them.
20. **Superseded audit copy.**
    - scan-3 item 3's flight caveat, "Read from the label. Check the appellation if it matters for scoring.", is superseded. The handoff's A3 flight note stands, and the resolver never guesses an appellation (D6), so an unread one shows as a gap rather than a caveat.
    - byhand-6 item 7's origin chip, "the lead grape, with +n", is superseded. The handoff's meta line shows the primary grape, and the full blend lives in More detail with its "Scored as" line.
    - byhand-5's hint is built, adapted to B.5 (C.5 A7).
21. **Cellar quantities at Start.** A PUBLIC or FRIENDS cellar shows lot quantities, which drop at Start or at a running pour. Someone who can view the adder's cellar could infer which wines are in the flight. Drink history stays private.
22. **Model misses in the live reads.** A live read whose appellation or region text is wrong is reported with its tokens (G.5). Fixing it with a prompt or schema change needs new reads within the cap, so that is the owner's call.

---

## 9. Part G — Verification

### G.1 Unit tests (vitest, `npm test`)

**New test files:**

| File | Covers |
|---|---|
| `src/lib/wine-identity/complete.test.ts` | The `COMPLETE_WINE_FIELDS` pin (B.3). A table of drafts → missing fields: null wine name, pending producer, pending grape, null style, blank appellation with a region, TAWNY without an age, a year outside the range (with an injected `now`), NV. The `unidentified: true` mode. `normaliseDraft`: TAWNY → FORTIFIED, blank name → null, blend order via `orderedBlend`, dedupe. |
| `src/lib/wine-identity/describe.test.ts` | `describeMissing` and `describeUnread` for 0, 1, 2 and 3 fields; `readDisplay`. |
| `src/lib/wine-identity/fold.test.ts` | `foldName` matches `f_search_norm` on "Château La Fleur-Pétrus", "Clos du Mont-Olivet" and "Bourgogne Aligoté". `stripDesignationSuffix` never strips a German quality tier. `normaliseCru`. `isTitleOnly`. |
| `src/lib/wine-identity/resolve.test.ts` | The fixture cases in G.2, plus the rules the diagnosis names: every region synonym on the map (RC3); a trailing Premier Cru falling back to the base appellation, hyphen kept; an apostrophe name; France's no-GI read by flag and by text (L'Envolee); a producer linked to another country never setting the region (RC10); designation country preference; grape canonicalisation to an existing grape, with an unknown name left pending. |
| `src/lib/wine-identity/incomplete.test.ts` | Incomplete-glass wording; unknown keys dropped; an empty list expanded to every field; migration `20260912102000` holding no literal field-key array. |
| `src/lib/wine-identity/live-replay.test.ts` | Each recorded live read (G.5), resolved against the reference snapshot, keeps today's resolved fields. |
| `src/lib/wine-identity/match.test.ts` | scan-1 cases. Returns null for: same producer with another vintage; an unread vintage; a colour disagreement; two survivors; a pending producer. Compares the tawny age. With one identity it matches. With several identities it needs the wine name and the appellation. |
| `src/lib/wine-identity/grape-suggestion.test.ts` | One principal grape. Several principals with one at ≥60% share. Several principals without one, falling back to the catalog. The catalog rule at 60% of ≥3 wines. No suggestion from only 2 wines, or at 59%. |
| `src/lib/wine-identity/from-sources.test.ts` | `parseStoredDraft` rejects malformed JSON. Provenance from `draftFromAnswerKey` and `draftFromCatalogWine`. |
| `src/lib/label-scan/label-read-schema.test.ts` | Every committed fixture passes `LabelReadSchema.parse`. `coerceLabelRead` rules 1–8 (A.3). |
| `src/lib/label-scan/guards.test.ts` | `isOwnStagingPath`: the caller's own `scan-*.jpg` passes; another user's folder, a `..` traversal, a non-jpg, a regex-special id and a full URL fail. `fixtureAllowed`: false in production even with the variable set, and false without the variable. |
| `src/components/add-wine/matrix.test.ts` | Every string in the C.2 tables, for each destination (flight, cellar, note, catalog, none) with `canScan` true and false, including `partialRead.skipConfirm` and an OPEN flight's partial-read rule. |
| `src/components/add-wine/self-named-appellation.test.ts` | `justTheRegionOption`. The RC5 page-cap cases: 1000-row unordered pages for a 1364-row region with the self-named row after row 1000, and more than 25 earlier-sorting names, both still find it. `appellationPlaceholder` and `appellationHint`. |
| `src/components/add-wine/sheet-state.test.ts` | Edits survive navigation (RC8): scan → by hand → edit region, appellation and name → back → confirm → by hand still has them. Fix keeps the item when the add fails. A failed chooser add resets `adopted` and returns to `choose`. A failed queued read keeps its row while the next read runs (scan-8). Done with pending rows sets `closeAsk`. A lot with no destination goes to `choose`. A laptop queue of two partial cellar reads stacks both as pending rows. `itemRowCopy` for every tone, and `footerCount` counting incomplete flight glasses. A row just added to the flight is disabled at once (`markAddedInFlight`). `positionAdvanced` moves the flight position without changing `requested`. |
| `src/components/add-wine/use-can-scan.test.ts` | `detectCanScan` with fakes: coarse pointer + a videoinput → true; coarse with no videoinput → false; fine pointer → false; no `enumerateDevices`, or one that throws → falls back to whether `getUserMedia` exists. |
| `src/components/add-wine/flight-knowledge.test.ts` | `callerKnowsWine` for: a host-provides host; a bring-your-own host (a guest's wine is hidden, their own is known); a contributor; a revealed wine; a hidden semi-blind candidate (not known — no exception, C.9). |
| `src/lib/stats-math.test.ts` (extended) | `rankRows` dense ranks and ties (reveal-6). |

**Existing tests rewritten or extended** (their assertions pin copy and rules this spec changes):

- **`by-hand-logic.test.ts`**
  - Wine name is no longer required (:253-264).
  - The `actionLabel`, "Rate this wine" and "Choose where it goes" assertions (:392-394) move to `matrix.test.ts`.
  - New cases: `fieldChip`, `pickProducerAdoption` and `applyProducerRegion`. `applyProducerRegion` fills only untouched or link-filled fields, never changes them once an appellation is set, and clears link-filled fields when the new producer has no link.
  - `justTheRegionOption` moves to `self-named-appellation.test.ts`.
- **`scan-copy.test.ts`** — the rate consume label, "live now" / "next up" and `pendingProblemLabel` cases (:50, 68-73, 119-138) move to `matrix.test.ts`, using `phase`.
- **`desktop-format.test.ts`**
  - "↵ picks the first hit", "Close", the rate sentence and the upload copy (:149-150, 175-187, 217-221, 290-320) move to `matrix.test.ts`.
  - `flattenSearchGroups` gains a tasted-only row with its own `inFlight` (sources-8).
- **`format.test.ts`**
  - The `identityFromPrefill` cases (:106-153) are deleted with the function.
  - `notePickPlan` replaces `ratePickPlan`, including the incomplete draft that opens By hand first.
- **`use-camera.test.ts`** — the touch-only `startViewFor` cases (:41-57) become `startViewFor(start, canScan)`.
- **`setup-copy.test.ts`**
  - Guided/Free only for LIVE tastings (create-1).
  - Leaderboard wording only for Live + Guided (create-8).
  - `readySummary` omits guided/free for a self-paced tasting (play-1), and shows the invited count it is given (create-7).
- **The guess-ladder-math tests** — `rankDelta` with a null `last_round_points` (reveal-7).

**Gates** — all must be green before any browser check:

1. `npm test`, `npx tsc --noEmit`, `npm run lint` and `npm run build` pass.
   - `next build` is what Vercel runs.
   - It also catches what tsc cannot: a client bundle importing `server-only` code (`fixture.ts` with `node:fs`, `server/write.ts`), a `"use server"` file exporting anything but async functions, and Next 16 route or config errors.
   - Read `node_modules/next/dist/docs/` before fixing a build failure (AGENTS.md).
2. The old completeness code is gone. This returns nothing:
   `rg -n "identityFromPrefill|resolveIdentity|resolveWinePrefill|createScannedWine|missingFields\(|buildIdentity|vintagePrompt|shouldStackPending|parseVintageYear|Still missing|are required\." src`
3. FastCork is gone. `rg -n -i "fastcork" src .env.example` returns nothing. `scripts/` and applied migrations are exempt.
4. Views don't branch on destination. This returns nothing:
   `rg -n "destination\??\.kind ===|dest\.kind ===" src/components/add-wine --glob '!matrix.ts' --glob '!add-wine-sheet.tsx' --glob '!use-sheet-adds.ts' --glob '!sheet-state.ts' --glob '!actions.ts'`
5. The old rate kind is gone. `rg -n 'kind: "rate"' src` returns nothing.

### G.2 Fixture-based scan tests (no API calls)

**Reference snapshot**

- **File:** `src/lib/wine-identity/__fixtures__/reference-snapshot.json`.
- **How it is made:** exported once, read-only, from the database by a gitignored `.superpowers/export-reference-snapshot.mjs`. The script uses `pg` with DB_PASSWORD from `.env.local` and makes no Anthropic call.
- **What it contains:**
  - all countries;
  - the regions of France, Italy, Spain, Portugal, Argentina and Germany (Germany for the Mosel synonym);
  - the "None" sentinels, and France's "Vin de France" region and appellation;
  - every appellation whose folded name contains barbaresco, saintemilion, bourgogne, rioja, puligny, porto or vindefrance;
  - after G.5, the countries, regions, appellations, producers and grapes that the recorded live reads touch;
  - all grapes and the active type designations;
  - Produttori del Barbaresco and Cigliuti;
  - one "Domaine …" producer with a catalog wine that is not Domaine Leflaive.

**Lookup helper.** `snapshotLookup(snapshot): RefLookup` is a test helper that mirrors the real SQL exactly.
- `searchAppellations(words, regionId?)` builds the pattern `"%" + appellationSearchPattern(words) + "%"`. It matches that ILIKE-style against each accent-folded name, with the name's punctuation kept: `%` matches any run of characters, `_` matches one character, and case is ignored. It then filters by region, orders by name and takes 25.
  - Folding both sides with `foldName` is not allowed: it would hide the hyphen defect the real RPC has (B.5).
- `producerByFoldedName` mirrors `find_producer_by_folded_name`: folded equality, region first.
- `noGeographicIndication` returns the country's `NATIONAL_TIER_REGION_NAMES` region and its same-named appellation when present, otherwise the None pair.

**Expected results.** Every fixture except cigliuti and not-a-label reads producer, vintage, colour, style and at least one grape. Its expected `missing` is therefore `[]`. A producer missing from the snapshot stays pending, which still counts as present.

| Fixture | Expected draft | `missing` |
|---|---|---|
| produttori-barbaresco-2018 | appellation Barbaresco DOCG, with its region and Italy; producer existing; Nebbiolo existing; 2018 read; RED; STILL | `[]` |
| cigliuti-barbaresco-no-vintage | Barbaresco DOCG; producer Cigliuti existing; vintage `{ kind: null, year: null, tawnyYears: null, read: false }` | `["vintage"]` |
| vin-de-france | country France, region Vin de France, appellation Vin de France (B.5) | `[]` |
| saint-emilion-grand-cru | Saint-Émilion Grand Cru, never Saint-Émilion | `[]` |
| tawny-port-20 | vintage TAWNY with `tawnyYears: 20`; style FORTIFIED | `[]` |
| bourgogne-aligote | the LWIN row Bourgogne Aligote AOC, found by accent and suffix folding | `[]` |
| rioja-spain | Rioja in Spain, never an Argentine row | `[]` |
| domaine-leflaive-puligny | producer pending (not in the snapshot); `pickConfidentMatch` returns null and never the other "Domaine …" wine | `[]` |
| not-a-label | `coerceLabelRead` gives `isWineLabel: false` and nulls every identity field | — |

**Two inline reads:**

1. **Region only.** A read with region "Piedmont" and a null appellation resolves to region Piemonte with `appellationId` null, and `missing` includes "appellation". There is no default to a self-named appellation, and no first hit.
2. **Crowded query.** A base query that matches more than 25 snapshot names triggers the region-scoped retry. If two agreeing rows remain, nothing is picked.
3. **Punctuation.** Against a synthetic snapshot holding only "Puligny-Montrachet AOC", a read of "Puligny-Montrachet Premier Cru AOC" resolves to that row through the Premier Cru retry. "Coteaux d'Aix-en-Provence AOC" resolves through the search pattern.
4. **L'Envolee** (label-test-set.json). A France read with `noGeographicIndication: true`, and the same read with the appellation text "Vin de France", both resolve to the Vin de France region and appellation.

**Replay rule.** Every future scan bug report becomes a test:
1. Copy the report's `label_reads.read` into a new fixture.
2. Add the rows it touches to the snapshot.
3. Assert the expected draft.

### G.3 SQL

**Dry runs.**

- Dry-run each migration with `node scripts/scratch-apply.mjs --file supabase/migrations/<file>.sql --mode dry`. Each must print `DRY-OK <version> <name>`.
- These files dry-run independently: `20260912100100`, `101000`, `102000`, `104000`, `105000` and `106000`.
- `20260912103000` calls `is_wine_adder`, which comes from `102000`. Dry-run it after the main session has applied `102000`.

**Live apply.** The main session applies all seven live, in ledger order. For each file it runs a dry run immediately before the live apply.

**After the live apply:**

- The app compiles against the updated `database.types.ts`.
- A read-only check confirms that `to_regprocedure` resolves:
  - `find_producer_by_folded_name(text,uuid)`
  - `find_or_create_producer(text,uuid)`
  - `is_wine_adder(uuid)`
  - `tasting_incomplete_glasses(uuid)`
  - `draw_down_flight_cellar_lots(uuid)`
  - `pour_cellar_lot_into_glass(uuid)`
- The same check confirms that `information_schema.columns` lists `wines.added_via`, `label_reads.outcome` and the three new tables: `label_reads`, `wine_identity_drafts` and `wine_pour_intents`.
- The behavioural assertions (E.0) ran inside each live apply; its `LIVE-APPLIED` line proves they passed.

### G.4 Browser checks

**Setup**

- **Server and env.** Start `npm run dev`. Set these in `.env.local`, and restart the dev server whenever one changes (env is read at start):
  - `LABEL_READ_FIXTURE`;
  - for phone emulation, `NEXT_PUBLIC_FORCE_CAN_SCAN=1`.
- **Sessions.** Mint sessions for the seeded `demo.*@blindr.invalid` people with `.superpowers/demo-session.mjs` (magiclink + `verifyOtp` → `/auth/confirm-hash`). Never type a password. All tabs share one cookie jar, so switching users means minting again.
- **Data**, seeded by a gitignored script using the Supabase admin client (no Anthropic call):
  - A demo host with a DRAFT blind tasting (HOST_PROVIDES).
  - A DRAFT bring-your-own tasting with two JOINED participants.
  - Two cellar lots owned by that host, each holding 2 bottles.
  - The catalog wine Produttori del Barbaresco · Barbaresco DOCG · 2018 · RED, so the confident-match path runs.
  - An IN_PROGRESS LIVE blind HOST_PROVIDES tasting with a JOINED guest. The guest may not add wines.
  - An IN_PROGRESS ASYNC blind HOST_PROVIDES tasting with the IMMEDIATE reveal policy and a JOINED guest.
  - An IN_PROGRESS LIVE semi-blind tasting with two glasses, and a guest whose matches are locked.
  - An IN_PROGRESS LIVE blind bring-your-own tasting where the host and a guest each contributed a glass.
  - An IN_PROGRESS tasting with one fully revealed glass, on which two guests have equal scored totals.
  - A CLOSED tasting, and a second CLOSED tasting where a demo user is still INVITED.
  - A DRAFT self-paced blind tasting.
  - A label photo longer than 1600 px on its long edge.

**Known gotchas (from CLAUDE.md)**

- **The Browser pane is hidden.** When `document.visibilityState === "hidden"` and `innerWidth` is 0, pages stall on their `loading.tsx` text ("Setting the table…") and never hydrate. Clicks do nothing and screenshots time out. Keep the pane visible for interactive checks. If it is hidden, read the page with `read_page` / `get_page_text`, and don't treat the stall as an app bug.
- **The console buffer survives navigations.** A stale "useAddWine must be used within <AddWineProvider>" from an earlier hash login keeps showing up in `onlyErrors`. Log a marker and check message order before treating it as new.
- **Keys.** Send "Enter", not "Return"; "Return" never reaches React `onKeyDown`.
- **Confirms.** Override `window.confirm` in the tab before clicking anything that asks for confirmation (End tasting, a blank lock).
- **Unstyled 404.** A route that 404s unstyled is Turbopack's stale cache. Stop the server, `rm -rf .next`, and start again.
- **Phone emulation.** `resize_window` with the `mobile` preset emulates a touch phone. Reload after switching, and reset to the `desktop` preset afterwards.

**Mouse device (`desktop` preset)**

1. **Search-led add.**
   - In the lobby of the DRAFT blind tasting, "Add wine" in the Wines card title row opens A8, with no Scan anywhere.
   - The hint reads "↵ adds the first hit". ↓/↑ move the border, and Enter adds the focused row.
   - The footer reads "Glasses 1–{n} are set. Adding does not close this — keep going until the flight is full."
2. **Partial read.**
   - With `LABEL_READ_FIXTURE` set to `…cigliuti-barbaresco-no-vintage.json`, upload a photo.
   - ReadConfirm shows "NO VINTAGE READ" with Fix.
   - "Add as glass N" adds an incomplete glass.
   - For the host, the lobby row reads "needs a vintage — tap Edit to finish" in dark gold.
3. **Start gate.**
   - Start is refused with "Glass {n} needs a vintage".
   - Edit opens "Finish this wine". The vintage is flagged "did not read — required" and is focused once the glass loads: a mouse device needs no gesture to focus (C.4 rule 9).
   - "Save · glass {n}" saves; the row's identity line now ends "scanned".
   - Start now succeeds.
4. **Confident match.** With the produttori fixture and the seeded Produttori catalog wine, the screen shows the match card "Barbaresco DOCG 2018" with its meta. With the domaine-leflaive-puligny fixture (a pending producer), it says "Not in the catalog yet".
5. **Cellar draw-down.** Add from "From my cellar" to the DRAFT tasting with the checkbox on.
   - Right after the add, the lot quantity is unchanged.
   - After Start, it is one lower, and a DRANK consumption exists with the tasting's name.
6. **By hand.**
   - A typed producer that folds equal to an existing one is adopted ("matched").
   - Wine name is optional.
   - Tawny locks Style to Fortified.
   - "Just the region" is the first option for a region that has a self-named appellation.
   - The grape "suggested" chip fills only on tap.
   - Going ← and back again keeps every edit.
7. **Cellar page, "Add a bottle".**
   - A wine you own reads "+1 bottle", and tapping it increments the lot.
   - The upload copy reads "Several at once — a delivery of six is one drop. Each lands in your cellar."
8. **Catalog, "Add a wine".**
   - The page reads "First, check it is not already here", and hits show "Open".
   - "Neither of these · Continue and create a new entry" goes to by hand.
   - "Add to the catalog" then leads to D3, "Added to the catalog", with both follow-ups.
9. **Taste & rate.**
   - No Scan, and the hint reads "↵ opens a note on the first hit".
   - The page shows "Scanning lives on your phone and tablet, where the camera faces the bottle. It is not offered here."
   - A pick opens the WSET note.
10. **Failed reads.**
    - The `not-a-label` fixture shows the inline "Couldn't read this photo" row with Retry and Remove.
    - Upload three photos where the second fails: its row stays while the others are read (scan-8).
11. **CLOSED tasting.**
    - There is no Add button and no registered header camera.
    - Opening `/tastings/{id}/wines/new` directly shows "This tasting is finished — reopen it to add wines."
12. **Bring-your-own host.** Search shows no "in flight" marker and no glass number for a guest's hidden bottle.
13. **Create sheet step 2 on a laptop.**
    - The chips read "Upload photos · My cellar · By hand".
    - An inline cellar hit adds a glass, with the "Take it out of the cellar when we pour it" checkbox.
    - In a bring-your-own tasting, the caption reads "Reorder · tasters see whose bottle each glass is".
14. **Self-paced tasting.**
    - The create form shows no Flow select and no Leaderboard select.
    - The lobby shows no sequential toggle.
    - Its play page does not lock glasses in order.
15. **End tasting with a hidden glass.** The confirm names the glass and says "You can reopen it from the tasting page." The console eyebrow reads "Not revealed · glass n of m".
16. **Legacy add route.** `/tastings/{id}/wines/new` on the DRAFT tasting redirects to the lobby and opens "A wine we have never seen".
17. **Legacy edit route.** For the adder, `/tastings/{id}/wines/{wineId}/edit` redirects to the lobby and opens the sheet on that glass's by-hand form. For anyone else, it renders "Only the person who added this glass can edit it."
18. **Enter twice.** On A8, press Enter twice on the focused catalog row. One glass is added, and the row reads "In flight" before the second Enter.
19. **Both kinds of pour.**
    - In the DRAFT host-provides tasting, add the second cellar lot, then remove that glass. The lot's quantity is unchanged, and no intent row remains.
    - In the running LIVE host-provides tasting, add a lot with the checkbox on. The quantity drops by one at the add, and a DRANK consumption carries the tasting's name.
20. **A growing flight.** Add a glass to the running LIVE tasting. After a refresh, the console's glass list and locked-in count, and the guest's ladder, include the new glass.
21. **An incomplete glass in a running tasting.**
    - As the host of the running LIVE tasting, add a partial read (the cigliuti fixture).
    - The lobby refuses the reveal with "Finish glass {n}'s details before revealing". The console shows the same sentence, no reveal chips, and a disabled "Reveal everything" for that glass.
    - The guest can guess the glass and lock the guess.
    - After Edit and "Save · glass {n}", the reveal works.
22. **Deferred scoring (ASYNC + IMMEDIATE).**
    - As the host of the running ASYNC IMMEDIATE tasting, add a partial read.
    - As the guest, override `window.confirm` and lock a guess. The confirm text reads "Submit glass {n}? You'll see the answer, and it can't be changed afterwards." The locked-in state then reads "Your answer shows once glass {n}'s details are finished."
    - As the host, finish the glass. As the guest, the answer appears after one refresh.
    - The guess's `scored_at` is set once, and is unchanged after two more refreshes.
23. **Semi-blind freeze.** In the running semi-blind tasting, the host reveals glass 1. The guest's locked matches then show no "Change it".
24. **A region pick sets its country.** In a guess ladder with Italy picked, picking the region Bourgogne switches the country to France.
25. **A competing bring-your-own host.** On the console of the running bring-your-own tasting, the guest's hidden glass at step 0 offers only "Reveal the country", with no answer-derived chips. Starting a DRAFT bring-your-own tasting lands on the lobby, not the console.
26. **An invite to a CLOSED tasting.** As the INVITED demo user, the lobby card reads "This tasting has finished", with Decline and no Accept. The bell lists no invite for that tasting.
27. **Ties, and "Standings so far".** On the running tied tasting's results page, the tied guests read "=1", the heading reads "Standings so far", and there is no "Final", crown or medal. After End, "Final" appears.
28. **The share link in the draft menu.** The DRAFT blind tasting's host controls show the join link, with Copy and "Works until you start the tasting."
29. **The wine source is locked.** Going back to step 1 of the create sheet, for a tasting that has wines, shows the other wine-source option disabled with "Remove the wines first — who brings the wines can't change once the flight has bottles."
30. **Typed invites count.** In step 3, one friend chip plus two typed addresses reads "3 invited".
31. **Drafts and reads are owner-only.** After item 2, mint a session for another demo user and query `wine_identity_drafts` and `label_reads` from Node with supabase-js. Both return no rows. The adder's own session returns their draft.
32. **Uploads are downscaled.** After uploading the large photo, fetch the staging object's public URL in the tab. Its content type is `image/jpeg`, and `createImageBitmap` reports a long edge of at most 1600 px.

**Phone emulation (`mobile` preset, `NEXT_PUBLIC_FORCE_CAN_SCAN=1`, reload)**

1. **Camera view.**
   - "Add wine" opens the camera view: "Or search wine catalog", "Fill the frame with the label", Library · shutter · Many, and the chips "My cellar · By hand".
   - There is no Catalog chip.
   - The pane has no camera, so the viewfinder shows "Camera not available — use Library or search". Library runs the same read path.
2. **Search.**
   - Tapping "Or search wine catalog" focuses the field in the same tap.
   - Groups appear in the order In your cellar · In the catalog · You have tasted before.
   - The empty state reads "Nothing matches? · Add it by hand".
3. **Scan the next.**
   - A Library pick with the cigliuti fixture goes to ReadConfirm; tap "Add and scan the next".
   - The stack shows "Cigliuti, Barbaresco · no vintage read" with Fix.
   - The header reads "Adding to the flight" with "+N added", and the footer reads "Done · N wines added".
4. **Fix.** Straight after the Fix tap, `document.activeElement` is the year input, because the form was already mounted (C.4 rule 9). "Leave it for later" returns to the stack, with the glass still listed.
5. **Header camera from the Overview.**
   - With no tasting: after a read, the sheet shows "Scanned", no flight row, and "My cellar" in gold.
   - As the host of the running LIVE host-provides tasting: "Tonight's flight · glass N" comes first, with "…, live now".
   - As the host of the running ASYNC tasting: the subtitle reads "…, in progress".
6. **Taste & rate.** The title reads "Which wine?" and Many is hidden.
7. **No scan capability.** With `NEXT_PUBLIC_FORCE_CAN_SCAN` unset and the `mobile` preset, the laptop layout appears: Upload, never Scan. With `canScan` false, the sheet never shows both.
8. **No flight row for a guest who cannot add.** As the JOINED guest of the running LIVE host-provides tasting, open the Overview header camera and read a label. The sheet shows no "Tonight's flight" row, and "My cellar" is gold (scan-4, sources-2, entry-3).
9. **A lot with no destination goes through the chooser.** As the host of the running LIVE tasting, open the Overview header camera, tap "My cellar" and pick a lot. "Where does it go?" opens with "Tonight's flight · glass N", and nothing is poured until a row is picked (D12).
10. **The same lot pick, as that guest,** offers only "Rate it now". "My cellar" and "Just remember it" are hidden for a lot.

### G.5 Live reads (owner-approved; main session only)

**Approval and cap.** D1 records the owner's approval of live Sonnet 5 test calls during development (2026-09-12). Inside this cap no further approval is needed; going past it needs a new one.
- The cap is **30** live reads for the whole of development: L1's 15, any re-reads, and V3's one read through the UI. At about $0.01 each, that is roughly $0.30.
- Every call's `usage` is printed and stored in `label_reads`.
- No batch API, no loops over the catalog's photos, no backfills, no `count_tokens`, and no retries beyond the SDK's single retry.
- Coding agents never make live reads; they replay fixtures.

**When.**
- L1 runs once F7 is committed and M1 has applied `label_reads` and the producer lookup live. That is before the S chain builds on the resolver.
- V3 runs after V2.

**L1 — the label test set.**
- **Harness.** Two gitignored files:
  - `.superpowers/add-wine-v2/vitest.live.config.mts` aliases `server-only` to `node_modules/server-only/empty.js` and `@` to `src`, and loads `.env.local` with `loadEnvConfig` from `@next/env`. It includes only the check below, with a 120-second test timeout.
  - `.superpowers/add-wine-v2/live-label-check.test.ts` is skipped unless `LABEL_LIVE=1`, and refuses to run while `LABEL_READ_FIXTURE` is set.
  - Run it with `LABEL_LIVE=1 npx vitest run --config .superpowers/add-wine-v2/vitest.live.config.mts`.
- **Per entry** in `label-test-set.json`, exactly once:
  1. Call `readLabel(imageUrl)`. The staging photos are public, so nothing is copied.
  2. Insert a `label_reads` row with the service-role client, as `readLabelPhoto` would: `user_id` = the seeded demo host, `image_path` = the URL's `catalog/staging/…` path, plus `outcome`, `read`, `model` and the tokens.
  3. Run `resolveLabelRead(read, serverLookup(supabase), { imageUrl })`, then `missingWineFields` and `findConfidentMatch`.
  4. Diff the draft against `expected`, field by field. Names compare folded, with the designation suffix stripped. An expected value that is not a reference name ("Sangiovese blend") compares by its first word. `wineName` is informational only.
- **Report**, pasted into the session log:
  - a table of every entry and field;
  - hit rates for appellation, region, producer, grape, vintage, colour and style;
  - how often the confident match found the entry's `catalogWineId`;
  - total input and output tokens, and the A.7 cost query.
- **Afterwards.**
  - Copy every stored `read` into `src/lib/label-scan/__fixtures__/live/<slug>.json`, and extend the reference snapshot with the rows those reads touch.
  - Add `src/lib/wine-identity/live-replay.test.ts`. It resolves each recorded read against the snapshot and asserts today's resolved fields, at zero API cost.
  - **Resolver miss:** the read carried the right text, but it did not resolve. Fix it in `resolve.ts` or `region-canonical.ts`, writing the replay assertion first. Every resolver miss is fixed before G1.
  - **Model miss:** the read carried the wrong text. Report it to the owner (F.3 Q22). A prompt or schema change, and the re-reads that check it, count against the cap.

**V3 — one read through the UI.**
1. Unset `LABEL_READ_FIXTURE` and restart the dev server. `ANTHROPIC_API_KEY` comes from `.env.local`.
2. Scan one real bottle, once: either on a phone against the dev server, or with one laptop upload.
3. Check the `label_reads` row:
   - `model = 'claude-sonnet-5'`, with an `outcome`;
   - `input_tokens` and `output_tokens` are recorded;
   - `read` has the `LabelRead` shape;
   - `image_path` is under `catalog/staging/<uid>/`.
4. Report the tokens and the A.7 query's cost, and compare them with D1's estimate.
5. If the read exposed a resolver case, copy the stored `read` into a new live fixture with its replay assertion.

### G.6 Documentation that ships with the code

**CLAUDE.md**

- **The add-wine sheet note**, rewritten to cover:
  - `readLabelPhoto` and Claude Sonnet 5 (`claude-sonnet-5`, structured output, `effort: "low"`, about $0.01 per scan);
  - `label_reads` retention;
  - the `LABEL_READ_FIXTURE` switch;
  - FastCork's removal.
- **The wine-identity module.** It is the only definition of complete (`COMPLETE_WINE_FIELDS`), wine name is optional, and there is one write path.
- **The matrix and `canScan`.** `canScan` means a coarse pointer and a video input.
- **D7 incomplete glasses** (`wine_identity_drafts`, the Start and reveal gates) and **D11 draw-down at Start**.
- **The "Appellation is optional" paragraph**, rewritten (byhand-5):
  - `catalog_wines.region_id` and `appellation_id` are NOT NULL;
  - region-level wines use the region's self-named appellation ("Just the region");
  - wines with no geographic indication use the country's national-tier region and appellation where one exists (France: Vin de France), otherwise the per-country "None" pair (B.5);
  - `wine_answers.appellation_id` stays nullable only for legacy rows.
- **"One wine at a time"** applies to LIVE tastings only (create-1).
- **Legacy form.** `wine-form.tsx` is gone, and `/tastings/[id]/wines/new` and the edit route redirect into the sheet.
- **Rules this work changes, rewritten where CLAUDE.md states them:**
  - "Start lands on the host console for LIVE + BLIND" becomes LIVE + BLIND + HOST_PROVIDES; a bring-your-own host lands on the lobby (D.1 #7).
  - "+N last round": in LIVE tastings the round wine is chosen per tasting — the lowest partly revealed glass, else the newest scored one. It stays per participant in ASYNC tastings (E.7).
  - The lobby's bring-your-own line "Still waiting for {name} to add their wine" becomes "waiting for {name} to add it" (C.5 A1).
  - Round 1's `(pointer: coarse)` routing note and its `rowActionLabel` note are replaced by `canScan` and the matrix (C.2, C.3).
- **D11's note** names `wine_pour_intents`, and why the intent is not on `wines` (C.7).
- **The live reads:** `label_reads.outcome`, the L1 harness, the replay fixtures under `__fixtures__/live/`, and D1's cap (G.5).

**The 2026-09-12 flows spec and plan**

- Each gets a one-line pointer to this spec (A.8).
- Line 314 of the spec is corrected (play-7).
