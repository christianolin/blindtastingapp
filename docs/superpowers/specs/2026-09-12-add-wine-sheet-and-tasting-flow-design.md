# Add-wine sheet + tasting create/play flow — design spec

Implements the Claude Design handoff `design_handoff_blindr_flows` (README +
`Blindr Add Wine.dc.html` screens 7a–7i + `Blindr Tasting Flow.dc.html`
screens 6a–6i). The handoff is the visual source of truth; this spec records
how it maps onto the code, the decisions taken on its open questions, and the
contracts the pieces are built against. Code facts below come from the
subsystem maps in `.superpowers/map-*.md` (addWine, create, play, host,
primitives) — every signature quoted was verified there.

## Decisions on the handoff's open questions

1. **Read-and-confirm stays explicit** (7c as drawn). No auto-add on a
   high-confidence single match; "Add and scan the next" is the fast path.
2. **By hand writes to the shared catalog** — it already does: every flight
   wine goes through `find_or_create_catalog_wine` (blind wines are
   `blind_pending` until reveal), and cellar/catalog destinations are catalog
   rows by definition. The footer note stays.
3. **Locking is optional for the host.** "Lock in" is a readiness signal
   (`guesses.locked_at`); the host may reveal on partial guesses. "Change it"
   unlocks. Scored guesses stay locked by the existing rule.
4. **Semi-blind stays all-at-once**, rendered as the ladder with one row per
   glass; the lock-in button submits the batch (existing
   `submitAllMatchGuesses`).
5. **Cellar footer takes quantity · rack · optional price** (the fields the
   handoff table lists); everything else stays on the lot's own page.

Two more, forced by the code:

6. **No "Pause" and no "Skip to glass N →" on the host console.** There is no
   pause state and the current glass is always the lowest unrevealed position;
   faking either would lie. The console's secondary actions are "Reveal
   everything" and "End tasting" (= `finishTasting`).
7. **"Write a WSET note for this glass" while locked in is not offered** — the
   catalog wine behind a hidden glass is unreadable to participants until
   reveal (that is the whole point), so only "See the standings" remains.

## Schema changes (one migration, `20260911100000_guess_lock_and_join_code.sql`)

- `guesses.locked_at timestamptz null` — readiness marker.
- `tasting_guess_status(p_tasting_id)` now returns `(wine_id, participant_id,
  locked boolean)`.
- `tastings.join_code text` (unique partial index), `ensure_join_code(uuid)`
  (host-only, mints on first call) and `join_tasting_by_code(text) → uuid`
  (SECURITY DEFINER self-join as JOINED, or flips an INVITED row; refused once
  a non-OPEN tasting has started or after CLOSED).
- `wine_answers read` policy regains the `SEMI_BLIND and
  is_tasting_participant(t.id)` clause the 2026-07-16 rewrite dropped — the
  live database confirmed semi-blind participants currently cannot read the
  candidate list.

`database.types.ts` is updated in lockstep (already done).

---

# Part 1 — The universal add-wine sheet

## Files

```
src/components/add-wine/
  types.ts                 destination / result / option contracts (below)
  add-wine-sheet.tsx       "use client" — the sheet shell + state machine
  camera-view.tsx          "use client" — live camera, shutter, Library/Many, source chips
  scan-confirm.tsx         "use client" — 7c read-and-confirm panel (+ 7i chooser)
  multi-add-stack.tsx      "use client" — 7d added rows / fix rows above the camera
  search-view.tsx          "use client" — 7e three-group list, adds on tap
  cellar-view.tsx          "use client" — 7f racks, filter chips, consume checkbox
  by-hand-form.tsx         "use client" — 7g four fields + origin pickers + More detail
  desktop-view.tsx         "use client" — 7h search-leads layout with upload zone
  destination-footer.tsx   "use client" — the per-destination footer (flight / cellar / catalog)
  use-camera.ts            getUserMedia hook with graceful fallback
  actions.ts               "use server" — search, the producer's home region, and the three non-redirecting writes
src/components/add-wine-context.tsx   rewired provider (same exported API + openAddWineSheet)
```

Deleted (replaced): `catalog-add-wine-modal.tsx`, `cellar-add-wine-modal.tsx`,
`scan/scan-modal.tsx`, `scan/bulk-scan-modal.tsx`, `scan/bulk-import-flow.tsx`,
`app/tastings/[id]/tasting-add-wine-modal.tsx`. Kept: `wine-form.tsx` (the
`/wines/new` and `/wines/[wineId]/edit` routes — its "Scan the label instead"
button now opens the sheet with the flight destination), `new-wine-form.tsx`
and `cellar-lot-form.tsx` (the `/catalog/new`, `/cellar/new` routes and
`EditWineModal`), `scan-button.tsx`,
`tasting-scan-registrar.tsx`, `add-wine-button.tsx`, `app/scan/actions.ts`
(`identifyWineFromLabel`, `resolveWinePrefill`, `createScannedWine` — unchanged
signatures; the sheet reuses them).

Also deleted (owner feedback, 2026-09-12): `rate-wine-modal.tsx`
(`RateWineModal`) and `cellar-lot-picker.tsx`, which only it used — Taste &
rate is now the sheet's `rate` destination (see "Rate destination" below).

## Contracts (`src/components/add-wine/types.ts`)

```ts
import type { RevealMode, WineSourceMode } from "@/lib/supabase/database.types";

export type AddWineDestination =
  | {
      kind: "flight";
      tastingId: string;
      tastingName: string;
      revealMode: RevealMode;
      wineSource: WineSourceMode;
      /** Next glass number = existing wine count + 1; re-read after each add. */
      position: number;
    }
  | { kind: "cellar" }
  | { kind: "catalog" }
  | { kind: "rate" };          // Taste & rate: one pick, then its WSET note (2026-09-12)

export type AddWineStart = "camera" | "search" | "cellar" | "byhand";

export type AddWineOpenOptions = {
  start?: AddWineStart;        // default: camera on touch devices, the desktop view on a mouse / trackpad
  multi?: boolean;             // open straight into the 7d stacked mode (bulk); ignored for rate
  /** Called after every successful add (the sheet stays open in multi mode). */
  onAdded?: (added: AddedWine) => void;
};

export type AddedWine = {
  catalogWineId: string;
  label: string;               // "Produttori del Barbaresco 2018"
  destination: Exclude<AddWineDestination["kind"], "rate">; // a rate pick is not an add
  glass?: number;              // flight
  lotId?: string;              // cellar
  wineId?: string;             // flight: wines.id
};

/** A rate pick → the provider's NewNoteModal (cellarConsume when consume && lotId). */
export type RatePick = { catalogWineId: string; lotId?: string | null; consume?: boolean };

/** A scanned bottle waiting for a fix before it can be added (7d "Fix"). */
export type PendingScan = {
  id: string;                  // client uuid
  imageUrl: string;
  prefill: import("@/app/catalog/new/new-wine-form").WineFormInitial;
  problem: "no-vintage" | "incomplete";
};

export type SearchGroups = {
  cellar: {
    lotId: string; catalogWineId: string; title: string; imageUrl: string | null;
    rack: string | null; quantity: number; drinkNow: boolean; inFlight: boolean;
  }[];
  catalog: {
    catalogWineId: string; title: string; subtitle: string | null; imageUrl: string | null;
    avgScore: number | null; noteCount: number; inFlight: boolean;
  }[];
  tasted: {
    catalogWineId: string; title: string; imageUrl: string | null;
    myScore: number | null; tastedOn: string;
  }[];
};

export type ByHandIdentity = {
  producerId: string | null; producerName: string;    // pending producer when id is null
  wineName: string | null;
  vintageKind: "YEAR" | "NV" | "TAWNY"; vintageYear: number | null; vintageTawnyYears: number | null;
  colour: "RED" | "WHITE" | "ROSE" | "ORANGE"; style: "STILL" | "SPARKLING" | "SWEET" | "FORTIFIED";
  countryId: string; regionId: string; appellationId: string;
  primaryGrapeId: string; secondaryGrapeId: string | null; typeDesignationId: string | null;
  imageUrl: string | null; description: string | null;
  alcoholPercent: number | null;
};

export type AddSource =
  | { kind: "catalog"; catalogWineId: string }
  | { kind: "lot"; lotId: string; consume: boolean; catalogWineId?: string } // wine carried from the row for a rate pick; writes ignore it
  | { kind: "identity"; identity: ByHandIdentity };

export type AddResult =
  | { ok: true; added: AddedWine; warning?: string }
  | { error: string };
```

## Server actions (`src/components/add-wine/actions.ts`, `"use server"`)

- `searchAddWine(query: string, opts: { tastingId?: string }): Promise<SearchGroups>` — one call, three groups in the handoff's order:
  1. **cellar**: my `cellar_lots` (quantity > 0) whose catalog wine matches; match with `search_catalog_wines` ids ∩ my lots (or a client-side fold filter over `listMyCellarLots` when the query is short). `drinkNow` = the lot's window contains the current year; `inFlight` = the wine is already in the flight (`wine_answers.catalog_wine_id` of that tasting) when `tastingId` is given. `rack` = `storage_location`.
  2. **catalog**: `search_catalog_wines(p_query, p_limit: 20)` minus blind-pending rows, with `catalog_wine_ratings` (`avg_score`, `note_count`) and `image_url`.
  3. **tasted**: my `wset_notes` whose wine matches (join on the same ids), newest first, with my score and date.
  Empty query → all three empty (the sheet shows the hint). Never preload appellations/producers.
- `producerHomeRegion(producerId: string): Promise<{ countryId; countryName; regionId; regionName } | null>` — the producer's home region: the region from `producers.region_id` and that region's country. Returns null when the producer has no region (the ~5% genuinely multi-region producers are left without one on purpose) or a row is missing. It never returns an appellation or a grape. **Owner decision, 2026-09-12:** this replaces `inferFromProducer`, which also guessed an appellation (the region's self-named one, else the producer's most common catalog appellation) and a grape (the producer's most common primary grape, else the region's). The owner called filling the grape or the appellation from the producer "nonsense": a producer makes wines from many appellations and many grapes, so nothing about a new wine's appellation or grape follows from its producer, from that producer's other catalog wines, or from the region's most common grape.
- `addToFlight(tastingId: string, source: AddSource): Promise<AddResult>` — catalog → the existing private `insertTastingWineFromCatalog` (exported now as `insertTastingWineFromCatalogRow` or called via a new exported wrapper in `wines/new/actions.ts`); lot → `addTastingWineFromCellarLot(tastingId, lotId, { consume })` (existing; keep its best-effort consume + warning); identity → the `addWine` write path factored into a callable `insertTastingWineFromIdentity(tastingId, identity)` inside `wines/new/actions.ts` (same floor, same `find_or_create_catalog_wine`, `syncCatalogWine`, pending producer/grape created on save). All three end with `revalidatePath("/tastings/${tastingId}")` and return `{ ok, added: { glass: position, label, wineId, catalogWineId } }` — **no redirect**. Fix while here: `insertTastingWineFromCatalog` must set `is_revealed: reveal_mode === "OPEN"` like `addWine` does.
- `addToCellar(source: Exclude<AddSource, {kind:"lot"}>, lot: { quantity: number; storageLocation: string | null; pricePerBottle: number | null; currency: string | null }): Promise<AddResult>` — `addCellarLot` (existing, returns `{id}|{error}`) with `catalogWineId` or the identity keys; `bottleSizeMl` 750; `revalidatePath("/cellar")`.
- `addToCatalog(source: Exclude<AddSource, {kind:"lot"}>): Promise<AddResult>` — catalog: no-op success (already there); identity → `find_or_create_catalog_wine` through `createCatalogWine`'s payload rules (pending producer/grapes resolved first); `revalidatePath("/catalog")`.
- `fixScanVintage` is client-only (it just edits the prefill).

## The sheet (`add-wine-sheet.tsx`)

Rendered once by `AddWineProvider`. Base-ui `Dialog` with the WSET full-screen recipe on phones (`inset-0 … rounded-none`) and a centred `sm:max-w-[760px]` card on desktop; `DialogContent` switched to `flex flex-col gap-0 overflow-hidden p-0`; body scrolls in a `min-h-0 flex-1 overflow-y-auto overscroll-contain` region; footer is a `shrink-0 border-t` sibling (drawer skeleton) with `pb-[max(22px,env(safe-area-inset-bottom))]` on phones. `showCloseButton={false}`; a `DialogTitle` (visually the header title).

State: `view: "camera" | "reading" | "confirm" | "search" | "cellar" | "byhand" | "choose"`, `destination`, `multi`, `added: AddedWine[]`, `pending: PendingScan[]`, `scan: { imageUrl; result: ScanResult; prefill } | null`, `busy`. **Every branch happens inside the sheet; no nested dialogs.** Escape / ✕ closes (after confirming when `added.length > 0 || pending.length > 0`? No — adds are already persisted; just close and `router.refresh()`).

Header (dark on the camera views, parchment elsewhere): ✕ (or ← inside cellar/by-hand, returning to the previous view), two-line title — mono eyebrow with the context (tasting name; "Cellar"; "Catalog"; nothing when no destination) and the title: flight "Add wine · glass {position}", cellar "Add a bottle", catalog "Add a wine", none "Scan"; multi mode: title "Adding to the flight" + a gold "+{n} added" badge.

**Device rule — by input type, not width (owner feedback, 2026-09-12).** The live camera is for phones and tablets only. Shown the dark live Scan view with a PC's webcam in the viewfinder, the owner: "That shouldn't be possible on PC, only tablet and phone. It should be more like the add a bottle to cellar flow where you can add from photos." The sheet routes on `(pointer: coarse)` — `useTouchPrimary()` / `isTouchPrimary()` and the pure `startViewFor` / `homeViewFor` / `viewForDevice` in `use-camera.ts` — never on `md`:
- **Touch-primary** (phones, and tablets at any width): the phone views exactly as before — camera home (Library when `getUserMedia` is missing), search, cellar, by hand, reading / confirm, multi-add with Many. A tablet gets the camera inside the centred card, which takes the full `88vh` on the photo views so the viewfinder keeps its height.
- **Mouse / trackpad** (any window width): home is the desktop view (7h). `start: "camera"`, `start: "search"` and no `start` all open it; `"cellar"` and `"byhand"` open those views; after a read, a confirm or an add the sheet returns to it. No path reaches the camera view or the phone search view (the confirm view's "Search by name" lands on the desktop view's own field and focuses it), and no Scan, "Scan instead", "Add and scan the next" or Many control shows. The shell hides its own scan pills and drops the cellar-fields footer's "Add and scan the next" on a mouse device (`ctx.isDesktop` now means "mouse / trackpad device", so views gate on it); the confirm view's own "Add and scan the next" hides on `ctx.isDesktop` as well (closed 2026-09-12 alongside the rate destination). With no destination the photo views are titled "Add wine", not "Scan".
- **Header button** (`scan-button.tsx`): opens the sheet the same way on both (`start: "camera"`), but a mouse device shows lucide `ImagePlus` labelled "Add a wine from label photos" (touch: `Camera`, "Scan a wine label"). The glyph is picked in CSS (`pointer-coarse:`) so the server HTML paints the right one; only the aria-label follows the hook after hydration.
- Only the frame stays width-based (full-screen below `sm`, a centred card above). The legacy entries — `openScan`, `openBulkScan`, `openTastingScan` and the tasting wine form's "Scan the label instead" — pass `start: "camera"` and need no change: on a mouse device they open the desktop view (bulk: in multi mode, into the cellar).

### Camera view (7b, `camera-view.tsx` + `use-camera.ts`)
- `useCamera()` → `{ status: "idle" | "starting" | "live" | "unavailable" | "denied"; videoRef; capture(): Promise<Blob | null>; stop() }` using `navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false })`; capture draws the current frame to a canvas scaled to max 1600px on the long side, `toBlob("image/jpeg", 0.85)`. Stops tracks on unmount and when the sheet leaves the camera view.
- Layout (dark `#15100D`-equivalent: use `bg-[#15100D]` — the handoff's camera ground has no token; note it as the one allowed hex besides the gradients): search field "Or search by name" above the viewfinder (tap → `search` view); viewfinder fills the remaining height (`rounded-2xl`, gold corner brackets, "Fill the frame with the label", flash chip is decorative text "Flash auto" — no torch API); shutter row: `Library` (hidden `<input type="file" accept="image/*">`, no `capture` attribute), 74px shutter, `Many` (toggles multi mode); source chips `Catalog` · `My cellar` · `By hand` full width.
- `unavailable`/`denied` → the viewfinder shows "Camera not available — use Library or search" and the Library button is primary.
- Capture path: blob → upload to Storage `wine-images` at `catalog/staging/${userId}/scan-${Date.now()}-${rand}.jpg` (same as today) → `identifyWineFromLabel(publicUrl)` → view `reading` (photo at top, scanline animation `scanline` keyframes added to globals.css, `WineGlassLoader`) → `confirm`. One FastCork credit per shutter, no other API calls (AGENTS.md).

### Read and confirm (7c, `scan-confirm.tsx`)
- Photo stays in the top third (dark), lower two-thirds a parchment panel (`rounded-t-[22px]`, drag-handle pill). Title = `[producer, wineName, vintage].join(", ")` from `extracted`; meta = appellation · region · country · grapes; chip: confidence `high` → "READ OK" gold pill (`text-gold-dark` on `bg-gold/15`), `medium` → "CHECK THE READ", `low` → "HARD TO READ" (rose border).
- "Matched in the catalog": `matches[0]` as the gold-bordered primary card with a check disc; `matches[1..4]` as rows with "Use this" (swaps the primary). No matches → the card reads "Not in the catalog yet — we'll add it" and the footer adds by hand from the prefill.
- Recovery row: "Wrong bottle?" Rescan · Search by name · By hand (by hand opens `by-hand-form` prefilled from `resolveWinePrefill(extracted)`).
- Flight destination note: "Only you see this until the reveal. Tasters see "glass N"." (BYO: "Only you see this until the reveal.").
- Footer: primary "Add as glass N" / "Add to cellar" (opens the cellar footer fields first) / "Add to the catalog" / "Rate this wine"; secondary "Add and scan the next" (flight and cellar only; catalog too — it just keeps scanning; hidden on a mouse / trackpad device and for rate). Prefill missing a vintage (`vintagePrompt`) and no catalog match → the row goes to `pending` with `problem: "no-vintage"` and the sheet returns to the camera (7d).
- No destination (7i): the panel is the 7i dark footer instead — "Found in the catalog" eyebrow (or "Read from the label"), title, meta, then "Where does it go?": **Tonight's flight · glass N** (gold, only when `activeTasting` or the Overview's live/next tasting exists — passed in as `flightHint`), **My cellar** ("pick a rack after" → cellar footer with quantity 1), **Rate it now** (adopts the `rate` destination, so the add becomes a rate pick: finds or creates the catalog wine if needed, closes, and `AddWineProvider` opens `NewNoteModal` — see "Rate destination"), **Just remember it — save to the catalog only**.

### Multi-add (7d, `multi-add-stack.tsx`)
Stack above the viewfinder: each `AddedWine` as a row with a gold check and "glass N" / "in cellar"; each `PendingScan` as a rose-tinted row "{title} · no vintage read" with **Fix** → an inline strip (year input, "NV" button) that completes the prefill and adds it. Viewfinder caption "Next bottle · glass {next}". Footer: gold "Done · {n} wines added" (closes; `router.refresh()`). This replaces `openBulkScan()`.

### Search (7e, `search-view.tsx`)
Header gains a "Scan" button (back to camera; touch devices only — a mouse / trackpad device never shows this view, see the device rule under "The sheet"). Search field autofocused only via the user's tap (the field is what they tapped to get here — focus synchronously in that handler, per the combobox rule), 250 ms debounce, "{n} found". Three groups with eyebrow headers "In your cellar" (+ "{n} bottles you can pour tonight" when `drinkNow` > 0), "In the catalog", "You have tasted before"; rows: 28×38 thumb, title 14.5px/600, meta line, a `+` disc (filled bordeaux for the first cellar row, gold-outlined otherwise); **tap adds** (`addToFlight`/`addToCellar`/`addToCatalog` per destination; cellar destination with a catalog row → the cellar footer fields appear inline under the row before adding; cellar rows are hidden when the destination is cellar). `inFlight` rows are disabled and read "in flight". Footer: "Nothing matches?" → **Add it by hand**. Empty query → hint "Search by producer, wine or appellation".

### Cellar as a source (7f, `cellar-view.tsx`)
Loads `listMyCellarLots()` (existing) plus drink windows and the flight's catalog ids. Header "From my cellar" + "{n} bottles". Filter chips: `Drink now {n}` (window open this year), then one chip per distinct `storage_location` ("Rack A"…), all toggleable single-select. Rows: thumb, title, "{rack} · {n} bottles · in its window"; selected row gets the check disc; `inFlight` rows disabled ("in flight" / "already glass N"). Footer (flight): checked checkbox "Take it out of the cellar when we pour it" + "Add as glass N" (`addToFlight({kind:"lot", consume})`). Cellar view is hidden for the cellar destination (a cellar bottle is already in the cellar) and offered for catalog only as "already catalogued" (no-op) — so the chip is shown only for flight/none.

### By hand (7g, `by-hand-form.tsx`)
Four required fields in order: **Producer** (`SearchableCombobox` over `searchProducers`, `onCreate` pending — shows the gold "Cigliuti · Neive, Piedmont · 4 wines" suggestion row from `searchProducers` results with region name; no fork of reference data), **Wine name**, **Vintage** (year input; NV / tawny via a small segmented control YEAR · NV · Tawny), **Colour** (segmented Red · White · Other; "Other" reveals a Rosé / Orange pair). Style defaults to STILL; "Sparkling / Sweet / Fortified" live under More detail.
**Origin: always the full pickers (owner decision, 2026-09-12).** Under the four fields the origin is always expanded: **Country → Region → Appellation** (the cascade: changing the country clears the region and appellation, changing the region clears the appellation), then **Grape**. All four are required (`missingFields` is unchanged). There is no collapsed chip card and no "Change ▾". The handoff's gold "Filled in from the producer" card was a mockup mistake. Owner feedback on the by-hand entry: filling the grape or the appellation from the producer "doesn't make sense at all". A producer makes wines from many appellations and many grapes, so nothing about a new wine's appellation or grape follows from its producer, from that producer's other catalog wines, or from the region's most common grape. The one convenience kept:
- **Home region.** When the chosen producer has a home region (`producerHomeRegion`, from `producers.region_id`) and neither the taster nor a label read has set the country or region, both are prefilled from it (`applyProducerRegion`, `originSource: "producer"`). One muted line under Region says "From the producer's home region — change it if this wine comes from elsewhere." The appellation and grape start empty.
- **Changing the producer.** Picking a different producer replaces a producer-prefilled region. A producer with no home region, a pending new producer or a failed lookup clears it, so it never stands under the wrong producer. A hand-picked origin (`manual`: any country, region or appellation pick) or a label-read one (`prefill`, even a country-only read) is never replaced. Picking an appellation commits the region above it, so an appellation is never stranded under another region. Picking the grape does not count as setting the origin.
- **Label read.** A label-read origin shows "Read from the label — check it." under Region, or "Country read from the label — pick the region." when the read found only the country.
- **Suggestion row.** The producer's gold suggestion row stays. It confirms which producer was picked and fills nothing.
**More detail** (collapsed): secondary grape, type designation, style, alcohol %, description, label photo (`ImageUploader`, folder `catalog/staging/${userId}` or the tasting id for flight).
Footer: destination action + "Also saved to the catalog, so nobody has to type it again." All fields are controlled state (the sheet can be open on a polling page).

### Desktop (7h, `desktop-view.tsx`, mouse / trackpad devices at any width)
**Owner feedback, 2026-09-12:** this view is the home of every mouse / trackpad device, not of `md+` — a PC with a webcam never gets the live camera (see the device rule under "The sheet"); "Upload label photos" is how a PC adds from photos, "more like the add a bottle to cellar flow". Because routing no longer follows width, it also lays out in a narrow desktop window: below `md` the upload zone and the two tiles stack vertically; below `sm` each result row moves its keep-in-cellar toggle and add button to a second line under the title, and the `↵` hint is hidden; the footer is sticky to the bottom of the scroll region (Done stays in reach under a long list) and its sentence wraps — nothing scrolls sideways at 390px. The confirm view's "Search by name" lands here with the search field focused.

Search leads: full-width field with `↵ adds the first hit`; result rows state the source ("In your cellar · rack B · 2 bottles · ★ 91" / "Catalog · ★ 95 · 22 notes") with an inline "Add as glass N" (first row primary, others "Add"); Enter adds the first row. Below: **Upload label photos** dashed zone (multiple files; each goes through the phone's read-and-match path, stacking into the 7d list) and two tiles **From my cellar** ("{n} bottles · {m} ready to drink") and **Add it by hand** ("Producer, name, vintage, colour"). Footer: "Glasses 1–{n} are set. Adding does not close this — keep going until the flight is full." + **Done**. Cellar/catalog destinations use the same layout with their own footer sentence ("Added {n} to your cellar").

### Destination footer (`destination-footer.tsx`)
- flight: **Add as glass N** (+ "Add and scan the next" on scan).
- cellar: quantity stepper (default 1), rack (text, suggestions from existing `storage_location`s), optional price in the profile currency → **Add to cellar**. Duplicate-lot rule: if I already hold the wine, offer "Add {n} to the existing lot" vs "Keep as a separate lot" (existing `findMyCellarLotsForWine` / `increaseCellarLotQuantity`).
- catalog: **Add to the catalog**.

### Rate destination (Taste & rate, `{ kind: "rate" }`)
**Owner feedback, 2026-09-12:** "When I click Taste and Rate on the PC, it prompts a taste and rate wine dialog window which lets you scan label. That shouldn't be possible on PC, only tablet and phone. It should be more like the add a bottle to cellar flow where you can add from photos." `RateWineModal` (Scan a label / From my cellar / Add manually + a catalog search) is **deleted**, with `cellar-lot-picker.tsx`. `openTaste("rate")` opens this sheet with `{ kind: "rate" }`, so the device rule applies unchanged: the camera on a phone or tablet, the desktop view (search, a label-photo upload, From my cellar, Add it by hand) on a mouse / trackpad device.
- **Copy.** Header eyebrow "Taste & rate", title "Which wine are you tasting?" (on the cellar / by-hand branches the eyebrow stays "Taste & rate" and the title names the branch). The action on a row, a confirmed scan, the 7f footer and the by-hand form reads **Rate this wine** (desktop: the first row; the other rows read "Rate" and `↵ picks the first hit`; phone search rows swap the `+` disc for a chevron). Desktop upload zone: "Upload a label photo" · "Upload a photo of the label — we find the wine, then its note opens." It takes ONE file: the picker has no `multiple`, and extra dropped files are skipped by name ("one photo at a time"). Desktop footer: "Pick the wine you are tasting — its note opens next." with **Close** instead of Done.
- **Single pick.** Never writes to a flight or a cellar. No multi mode (`options.multi` is ignored), no Many, no "Add and scan the next", no keep-going, no 7i chooser, and no "in flight" rows (no tasting is looked up, not even a registered flight hint). A rate pick produces no `AddedWine` and does not call `onAdded`.
- **Resolving the wine** (`ratePickPlan` in `format.ts`, run by the shell's `pickToRate`):
  - a catalog row or a matched scan → that `catalogWineId`;
  - a cellar lot row → the lot's catalog wine, carried on the source (`{ kind: "lot", lotId, consume, catalogWineId }` — every view that lists lots already has it, so there is no lookup);
  - a by-hand identity or an unmatched scan → `addToCatalog(source)` (the existing find-or-create) first, then its `catalogWineId`. An incomplete read goes through the prefilled by-hand form, whose submit is this identity case.
  Then the sheet closes and calls `onRate(pick)`.
- **Cellar bottles.** Cellar rows carry "Take a bottle out of the cellar when I save the note", **on** by default (desktop: on each row; phone search: the line above the cellar group; 7f: the footer checkbox for the selected lot). The sheet draws nothing down: `AddWineProvider` renders `NewNoteModal` with `cellarConsume={{ lotId }}` when the pick says `consume`, and `NewNoteModal` calls `consume_cellar_lot` (reason DRANK, linked to the note) only after the note saves. Closing the note unsaved leaves the cellar as it was.
- **7i "Rate it now"** adopts `{ kind: "rate" }` and takes the same path through the same callback.

### Provider (`add-wine-context.tsx`)
Same exported names, new semantics:
- `openAddWine(kind, opts?)`: `"catalog"` → sheet with `{kind:"catalog"}`; `"cellar"` → `{kind:"cellar"}` (opts `cellarWine` → opens on the cellar footer for that wine; `cellarNew` → by-hand prefilled); `"tasting"` → `activeTasting` flight (no-op when none).
- `openScan(target)`: catalog/cellar → those destinations with `start: "camera"`; `"choose"` → destination `null`, `start: "camera"`.
- `openBulkScan()`: `{kind:"cellar"}`, `multi: true`, camera.
- new `openAddWineSheet(destination: AddWineDestination | null, options?: AddWineOpenOptions)`.
- the sheet's `onRate(pick: RatePick)` (the rate destination, and 7i "Rate it now") → `NewNoteModal` for `pick.catalogWineId`, with `cellarConsume={{ lotId }}` only when `pick.consume && pick.lotId`. The bottle is drawn down when the note saves, never by the sheet. `openTaste("rate")` is `openAddWineSheet({ kind: "rate" })`.
- `activeTasting` now carries `{ tastingId, tastingName, revealMode, wineSource, position }` (registered by `TastingScanRegistrar`, which the tasting page renders whenever `canAddWine` — running or not, since adding mid-tasting is normal).
- `flightHint` for 7i: the provider fetches nothing; the Overview passes its live/next tasting through `TastingScanRegistrar`-style registration (`registerFlightHint`) when the banner has one.

### The flight page (7a — `src/app/tastings/[id]/page.tsx` Wines card)
Only the Wines card changes: title row "Wines" · "{n} of ?" is replaced by "{n} wines" + (host-provides host) "only you can see them"; the **Add wine / Add a wine** button (label rule unchanged) opens the sheet via a small client `AddToFlightButton` (`openAddWineSheet(flightDestination)`); the `TastingAddWineButton`/modal pair is deleted. `WineFlightList` rows are unchanged (contributor label, badges, identity, Edit, arrows). BYO "waiting for {name}" stays as the italic line. The Wines card is also rendered in the running branch for the host (it was draft-only) so mid-tasting adds and reorders of unrevealed wines are possible from the page, not only the console.

---

# Part 2 — Creating a tasting

## Files

```
src/components/new-tasting-sheet.tsx        "use client" — the 3-step sheet (replaces new-tasting-modal.tsx)
src/app/tastings/new/new-tasting-form.tsx   step 1 form body (rewritten; mode is a control)
src/app/tastings/new/flight-step.tsx        step 2 — search row + flight list
src/app/tastings/new/invite-step.tsx        step 3 — friend chips, email chip, share link, summary
src/app/tastings/new/actions.ts             createTasting returns { id }; + updateTastingSetup, getJoinLink
src/app/j/[code]/page.tsx                   join by code
```

`taste-launcher-context.tsx` keeps `openTaste(kind)` with `TasteKind = "blind" | "rate"`. `"blind"` opens this sheet (BLIND is the default; the sheet's own mode control switches to semi-blind). `"rate"` opens the add-wine sheet with `{ kind: "rate" }` (owner feedback, 2026-09-12: `RateWineModal` is deleted, see Part 1 "Rate destination"). `"open"` and `"semi-blind"` are not launcher kinds; OPEN is "Soon" in the sheet.

## Step 1 · Setup (6a / 6d)
Header: eyebrow "Step 1 of 3 · setup", title "New tasting", the three-dash progress rail, ✕. Fields (all controlled):
1. **Name** (autofocus only on desktop — no autoFocus on phones) with suggestion chips (3, generated client-side: "{weekday} blind", "{Region} #{n}" from the user's most-tasted region (passed in) or "Burgundy #1", "Six glasses, no mercy").
2. **How hidden are the wines?** — three tiles: Blind (default when launched as blind), Semi-blind, Taste & rate (dashed, SOON badge, `aria-disabled`, not selectable). Copy verbatim from 6a. Below: "Switch between blind and semi-blind at any time before you start — the wines you have added stay."
3. **When, and who pours?** — segmented `Live, together` / `Self-paced` (`timing_mode`) and `I bring the wines` / `Everyone brings one` (`wine_source`); optional `datetime-local` row ("optional"). **Timezone fix:** the client converts the local value to ISO before posting (`scheduled_at_iso`), the action reads that first and falls back to the old field.
4. **Rules and reveal** — collapsed card with the summary in words: "{Guided|Free} · standings after {each attribute|the full wine} · Danish Championship scoring" (blind) / "Semi-blind · one point per glass" (semi-blind) / self-paced adds " · results {after everyone has guessed|as soon as you submit}"; "Change ▾" expands the existing Selects (`flow`, `leaderboard_reveal`, `async_reveal_policy`) with their existing `items` maps and help copy. Same FormData names, same action.
Footer: "You can add wines and invite people after saving." + **Save as draft** (creates, closes, `router.push('/tastings/{id}')`) / **Add the wines →** (creates, then step 2).

`createTasting` returns `{ id: string } | { error: string } | null` (`CreateTastingFormState` widened) and no longer redirects; it `revalidatePath`s `/taste` and `/overview`. It still inserts the host participant and processes `emails` if present (empty in the sheet — invites move to step 3 via `inviteToTasting`). A new `updateTastingSetup(tastingId, fields)` server action lets steps go back to step 1 and change name / mode / timing / source / schedule / rules while DRAFT (host-only, uses the same validation; mode switch keeps the wines). The `/tastings/new` page route renders the sheet inline (same component, `inline` prop) so old links work.

## Step 2 · The wines (6b)
Header "Step 2 of 3 · {name} · {mode}", title "The flight". The add-wine `search-view`'s row inline (desktop 7h search field with the three shortcut chips `Scan a label` / `From my cellar` / `Enter manually`, each opening the add-wine sheet with the flight destination and that `start`; on phones the field itself opens the sheet in search), results add on ↵ / Add. Below, "Poured in this order" + the ordered flight (`WineFlightList` with `FlightWine` rows; **drag handles are the existing ▲▼ arrows** — no DnD library; the label says "Reorder · tasters only ever see the number"), per-row remove (new host-only `removeWine(tastingId, wineId)` action, DRAFT only, deletes the `wines` row — cascades). BYO: one dashed row per JOINED participant without a wine — "{name}'s wine · waiting for {name} to add it". The sheet's `onAdded` refreshes the list (`router.refresh()` + local optimistic append). Footer copy verbatim; "← Setup" / "Invite people →". No wine count gate here.

## Step 3 · Invite & start (6c)
"Your people": friend chips (avatar initial + name), tap toggles; a "+ email or name" chip that turns into the existing `InviteField` input; "Tap a face to invite. People who are not on Blindr get an email invitation to this tasting." Chips send through `inviteToTasting` (existing loop) when **Start** or **Save as draft** is pressed (batched), with the action's `Invited {n} people.` feedback. "Or share a link": `getJoinLink(tastingId)` (calls `ensure_join_code`) → `${NEXT_PUBLIC_SITE_URL}/j/{code}` with **Copy** (`navigator.clipboard`). "Ready to go" gold summary: "{Blind|Semi-blind} · {live|self-paced} · {guided|free} · {n} wine(s) so far · {LocalDateTime | no date} · {m} invited · add more as you pour". Footer: "← Wines" / **Save as draft** / **Start the tasting** (gold; calls `startTasting`; needs ≥ 1 wine — otherwise the button is disabled with "Add one glass to start"; on success closes and `router.push('/tastings/{id}')` — for the host of a blind live tasting the destination is the host console).

`/j/[code]`: server page; signed out → `redirect('/login?next=/j/{code}')` (add `next` support to the login form's redirect if absent — it is a one-line change in `login/actions.ts`); signed in → `rpc("join_tasting_by_code")` → `redirect('/tastings/{id}')`; on error a small card with the message and a link to `/overview`.

---

# Part 3 — Playing a blind tasting

## Files

```
src/app/tastings/[id]/play/guess-ladder.tsx        "use client" — 6e ladder (replaces guess-form.tsx)
src/app/tastings/[id]/play/field-picker.tsx        "use client" — 6f bottom-sheet picker
src/app/tastings/[id]/play/locked-in.tsx           6g dark waiting state (server-fed props, client for Change it)
src/app/tastings/[id]/play/reveal-view.tsx         6h participant reveal (replaces progressive-wine-reveal.tsx)
src/app/tastings/[id]/play/match-ladder.tsx        "use client" — semi-blind ladder (replaces match-guess-form.tsx)
src/app/tastings/[id]/play/actions.ts              submitGuess (unchanged contract) + lockGuess / unlockGuess; score_own_guess moves to lockGuess
src/app/tastings/[id]/play/play-experience.tsx     composes the above per wine
src/app/tastings/[id]/host/page.tsx                6i host console (dark)
src/app/tastings/[id]/host/console.tsx             "use client" — reveal chips, big button, facts
src/lib/guess-ladder-math.ts (+ .test.ts)          points at stake, next unanswered field, rank delta
src/lib/grape-shortlist.ts                         shortlistGrapesForRegion(regionId)
```

## Autosave model
- The ladder keeps the full guess in React state and calls `submitGuess` with the **complete current state** after every pick (one call per field, full-row replace — the action's contract is unchanged; absent fields are `null`). Debounced 150 ms so a rapid chip tap + picker close is one write. Optimistic: the row updates immediately; a failed save shows a rose toast line and reverts.
- `submitGuess` **no longer calls `score_own_guess` or `maybeAutoRevealWine`**; those move to `lockGuess(tastingId, wineId)` (new): stamps `locked_at = now()`, then `score_own_guess`, then `maybeAutoRevealWine` (which now counts **locked** guesses, and excludes the HOST_PROVIDES host from the eligible count — the map's Open question 2 bug). `unlockGuess(tastingId, wineId)` clears `locked_at` unless `scored_at` is set. Both revalidate `/tastings/{id}` (+ `/play`).
- Readiness everywhere keys off `locked`: `tasting_guess_status.locked` drives the play page's "N of M locked" and the host console's count; a draft row (unlocked) is "In progress", not "Guessed".
- Sequential (guided) guessing keeps its server check; the ladder only renders for the current glass, the others are collapsed rows "Glass N · opens after the reveal".

## The ladder (6e)
Header: ← (to the tasting page), eyebrow "{tasting} · blind", title "Glass {n} of {total}" (running count — `wines.length` can grow), rank chip "{ordinal} · {pts} pts" from `getTastingLeaderboard` (omitted before any reveal). Six-segment progress bar for the flight (segments: revealed = bordeaux, current = gold, rest = border) + "{locked} of {eligible} locked" (from `tasting_guess_status`). Summary row "Your guess so far" + **{stake} / {max} pts at stake** — `stake` = Σ point values of answered fields; `max` = 30 (blind; 32 when secondary/designation answered — show "/ 30" and let the stake exceed only via those two optional rows? No: max is fixed at 30 and the optional rows read "+2 if the wine has one"). Rows in order: Country **2** · Region **3** · Appellation **5** · Grape **8** (with up to three inline shortlist chips from `shortlistGrapesForRegion(regionId)`, one-tap) · Producer **6** · Vintage **2** ("1 pt if you are a year out"). Row states exactly as drawn: answered (white, chevron), just saved (bordeaux border + "just now" for 3 s), unanswered (dashed, "Skip, or name one"). Below, a note "Secondary grape and type designation appear only if the wine has them — 2 pts each." and a collapsed "More" that opens the two optional rows (always available; they do not leak anything). Footer: **Lock in glass {n}** + "Saved as you go. Locking stops edits and shows the others you are ready."

## A picker (6f)
Bottom sheet (dependency-free portaled overlay like `MobileNav`, `bottom-0`, `max-h-[88dvh]`, body scroll locked while open; on desktop `md+` it is a centred dialog 480px wide). Title "Which {field}?" + gold "{pts} pts" pill; search field (cmdk `CommandInput`, focused synchronously in the tap that opened the sheet — the sheet is kept mounted like the popovers); a shortlist group under a provenance eyebrow — Region: "In {country}" (regions of the guessed country); Appellation: "In {region}" (`listAppellationsForRegions`); Grape: "Grown in {region} · from your region guess" (`shortlistGrapesForRegion`); Producer: "Specific to {region}" (`searchProducers` `in_region`), "Everything else" below; Country: all countries; Vintage: a year list (this year back to 1960) with NV and tawny options. Rows 15.5px with a secondary line ("Barolo, Barbaresco · you guess this often" — the second clause only when my past guesses include the grape ≥ 2 times; passed in as `frequentGrapeIds`) and a radio disc. Footer: "Not sure — skip it" (clears the field) and **Next: {next field} →** (saves and opens the next unanswered field's picker; the last field's button reads "Back to the glass").

## Locked in (6g)
When my guess for the current glass is locked and the wine is not fully revealed, the glass card renders the dark waiting state: title "Glass {n} · locked in", rank chip, wine-glass mark, "Waiting for the table" + "{Name} is still deciding…" (or "Everyone is in — the host can reveal"), "{locked} of {eligible} locked in" chips (mine gold), "What you said" chips + "{stake} pts at stake" + **Change it** (`unlockGuess` → back to the ladder), and "While you wait": "Standings after glass {n−1}" (scrolls to the standings). The glass leaves this state when the host advances the reveal (RevealSync).

## The reveal (6h, participant)
Replaces `ProgressiveWineReveal`: reads only `get_wine_reveal`. Dark section: live dot eyebrow "Revealing glass {n}" + "{k} of {m} attributes"; the newest revealed key as the hero ("The {grape|producer|…} was" + value in gold 46px) with the verdict pill ("You said {x} · +{pts}" / "You said {x} · 0 pts" rose / "You skipped this"); then every in-play attribute row: revealed rows show truth, "you: …", points (correct = gold border; miss = rose border + `text-[#E08A76]` your-answer — the one hex the handoff gives with no token; add `--miss` token instead: `--miss: #e08a76` → `text-miss`); unrevealed rows dashed at 55% opacity with the point value still showing. Standings card at the bottom: rank delta from `getTastingLeaderboard` (previous rank computed from `total − lastRoundPoints`) — "▲ 2nd → 1st" / "▼" / "=". Fully revealed → the existing "Answer" + everyone's breakdown block stays (unchanged).

## Semi-blind (match-ladder.tsx)
Same ladder shell with one row per still-hidden glass ("Glass {n}" · the matched candidate's `describeAnswer` or "Skip, or pick a wine"), each opening the picker over the candidate list (candidates visible again thanks to the RLS fix). Footer **Lock in all glasses** enabled when every row is matched (→ `submitAllMatchGuesses`, then `lockGuess` per glass); "Change it" unlocks all.

## Host console (6i, `/tastings/[id]/host`)
Host-only route (non-host → `redirect('/tastings/{id}')`), dark palette (`bg-[#1B1310]`-family: add tokens `--console: #1b1310`, `--console-card: #241b16`, `--console-ink: #b9a98c` so nothing is raw hex in JSX). Header: live dot + "Live · you are hosting", tasting name, then **+ Add a wine** (gold outline → add-wine sheet, flight destination) and **End tasting** (`finishTasting` with the existing confirm). No Pause (decision 6).
Main: "Pouring now · glass {n} of {total} so far", the wine's identity (HOST_PROVIDES: full title + meta + "only you can see this"; BYO: "{Name}'s wine" and no identity), "{locked}/{eligible} locked in" (from `tasting_guess_status.locked`; HOST_PROVIDES host excluded, contributor excluded). **Reveal in order**: chips for every in-play step (order from `wine_answers` — the host can read it; appellation/type designation only when present; producer/vintage always, matching `in_play_steps`): revealed = gold filled with check, next = dashed gold "· next", rest dashed muted. Big gold button **Reveal the {next}** (`revealNextCategory` with `expected_step` = the step on screen; a no-op return just re-reads) — only for guided live (`LIVE && sequential_guessing && !SEMI_BLIND`); otherwise the button is **Reveal the whole glass** (`revealFull`). Secondary: **Reveal everything** (`revealFull`, confirm) and, when this glass is fully revealed, **Next glass →** (scrolls the console to the new current glass — the current glass is derived, never chosen). Warning line: "{Names} has not locked in. Revealing now scores them on what they have." Right rail: standings with per-round deltas (`getTastingLeaderboard` — `+{lastRoundPoints}`), and "This glass" facts computed server-side for the host from `guesses` + `wine_answers` (host RLS): "Got the grape {a} of {b}", "Got the appellation", "Most said {appellation name}" — in BYO only for already-revealed categories. Live updates via `RevealSync` (LIVE) / `AutoRefresh` (ASYNC). The tasting page shows the host a prominent "Open the host console →" card while running; "Start the tasting" (step 3 and the lobby's Start) lands the host there for LIVE tastings.

---

# Interactions, states, data (from the handoff, made concrete)

- Hover (desktop only) per the handoff table; tap targets ≥ 44px on phones.
- Live dot: existing `LiveDot`.
- Scan states: reading (photo + scanline + `WineGlassLoader`), matched (7c), partial (7d Fix). No modal error state — failures are inline lines ("Couldn't read the label — try again or search by name").
- Autosave survives `router.refresh()` (all state in React; the ladder's writes are the only client → server traffic).
- Optimism: invitation chips, flight reorder (existing), guess saves (ladder), lock (immediate dark state), add-to-flight (row appears at once in the sheet and the step-2 list).
- Growing flights: `wines.length` is read live everywhere ("glass 3 of 6 so far").
- Copy from the handoff is verbatim where quoted; point values are the real ones (2/3/5/8/6/2, +2/+2 optional; vintage 1 pt at ±1).

## Out of scope
Pause / skip-glass, auto-add on high confidence, per-glass semi-blind locking, a QR hand-off, dark-mode tokens for the parchment sheets, and the `catalog`/`cellar` full-page routes (kept as they are).
