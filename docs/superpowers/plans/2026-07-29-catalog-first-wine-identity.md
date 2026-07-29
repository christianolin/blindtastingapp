# Plan — P5: Catalog-first wine identity

Execution: **concise + inline**, TDD on the DB/logic surface.
Base: P3 shipped; latest migration `20260829209000`. Next: `210000+`.

## Goal
Every blind pour resolves to a **real, fully-identified catalog wine** — or, rarely, an
explicit **unidentified** record in a separate table. Adding a wine to a tasting is **one
step**: search the catalog and pick the real bottle (or create it, complete); the app
copies its identity into the frozen `wine_answers` snapshot that participants guess
against. No second answer-key form. No "producer/vintage unknown" checkboxes.

## Model
- `catalog_wines.cuvee` → **`wine_name`** (LWIN "Wine" field; e.g. "Château Lascombes"),
  `NOT NULL`. Title builder collapses producer/name repetition.
- `catalog_wines` **strict `NOT NULL`**: country, region, appellation, wine_name,
  producer, primary_grape, vintage_kind (+ shape check), colour, style.
  Optional: secondary_grape, type_designation, lwin_code.
- New **`catalog_wines_unidentified`**: same columns, **all nullable**, plus
  `reason text`, `created_by`, `resolved_into_catalog_wine_id`, timestamps. Not shown in
  the public catalog list; reachable by direct link + curator queue.
- **Dual FK + CHECK** on `wine_answers` *and* `wset_notes`: `catalog_wine_id`
  (→ catalog_wines) + `unidentified_wine_id` (→ catalog_wines_unidentified),
  `check (num_nonnulls(catalog_wine_id, unidentified_wine_id) = 1)`. Exactly one — the
  "every pour resolves to a real record" invariant stays DB-enforced.
- **Identity/dedup** retuned to bottle identity — producer + normalised wine_name +
  vintage(kind,year,tawny) + appellation + colour — with the **UNIQUE index** the design
  called for (never built). Drop the old guess-field-tuple match.
- Seed a **national-tier region "Vin de France"** under France holding a "Vin de France"
  appellation, so every wine has an appellation (declassified wines included).

## Steps (commit after each)
1. **Export Hornbæk 2026 FREDAG** — DONE (6 wines, 5 participants, 16 guesses, 0 notes;
   fixture in the temp dir, zero commit risk).
2. **Migration A** (non-destructive schema): rename `cuvee`→`wine_name`; create
   `catalog_wines_unidentified`; add dual FK + CHECK to `wine_answers` & `wset_notes`
   (columns nullable at this stage so existing rows pass).
3. **Purge** event data: wset_note_aromas → wset_notes → guesses → wine_answers → wines →
   tastings → catalog_wine_edits → catalog_wines. Reference / map / profiles untouched.
4. **Migration B**: tighten `catalog_wines` to `NOT NULL`; add the unique identity index;
   rebuild `find_or_create_catalog_wine` on the new identity + `wine_name`/colour/style.
5. **Seed** the Vin de France national region + appellation.
6. **Re-import Hornbæk** from the fixture (owner-confirmed wine_name/colour/style),
   restoring tasting/participants/wines/answers/guesses verbatim; catalog wines created
   strict. (Script, not a committed data migration — real user UUIDs stay out of git.)
7. **App**: `search_catalog_wines` RPC (producer · wine_name · appellation · vintage);
   one shared **complete-wine creator** used by `/catalog/new` and the tasting flow;
   add-wine-to-tasting becomes search → pick → (create) → done; remove
   `producer_unknown`/`vintage_unknown`; **unidentified** checkbox path with a warning
   banner routing to the separate table. Same for `updateWine`.
8. **Curator queue** to resolve unidentified bottles into real wines (merge RPC exists).
9. Types + tests (strict constraints, dual-FK CHECK, dedup uniqueness, search RPC) + tsc
   + verification.

## Notes
- WSET notes on an unidentified bottle are allowed (dual FK); they're excluded from
  catalog aggregates until a curator resolves the bottle into a real wine.
- OCR later slots into step 7 (photo → catalog search pre-filled).
- The purge means any in-progress wines get re-added by hand; only Hornbæk is preserved.
