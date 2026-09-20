# Rule 1: the older leaks F4-F11

- **Date:** 2026-09-19
- **Worktree / branch:** `blindtastingapp-leaks2` / `leaks2` (off master `f8bddaf`)
- **Origin:** the owner's "Yes, fix them next" for the pre-existing findings F4-F11 in `docs/superpowers/specs/2026-09-19-rule1-usage-and-main-photo.md` §9 (with §2.4 and §5.3 of that spec).
- **Migration versions:** two files, `20260919223100` and `20260919223200`.
  - Both are absent from live `supabase_migrations.schema_migrations` (newest live: `20260919214700` label_lookups), from `origin/master` (`b1a7c08`), from every local ref (`git for-each-ref`) and from every worktree's `supabase/migrations` (including the detached `.claude/worktrees/eloquent-poincare-1a37e9`).
  - `blindtastingapp-scanfix`'s `20260919214700_label_lookups.sql` is live now and touches nothing here.
- **State of the design:**
  - `20260919223100`: `scripts/scratch-apply.mjs --mode dry` gives `DRY-OK 20260919223100 rule1_born_hidden_and_shared_cellar`.
  - `20260919223200` needs `20260919223100` applied first (its pre-state checks the row), so it cannot be dry-run alone yet. `.superpowers/leaks2/probes/chain-dry.mjs` runs both in one rolled-back transaction, each recorded in `schema_migrations` as scratch-apply records one: `CHAIN-DRY-OK` for both.
  - The rolled-back probe (§7) meets every EXPECT: 90 before, 91 after, and "live unchanged". The extra probe (§7.3) meets its 6.
  - Review round 1 (§13) changed the release rule: only a reveal releases a hold. The reviewer's own probe (`review-probe.mjs`) now gives the live outcome in both of its leak scenarios.
  - Nothing was applied, pushed or committed. The owner approves each live apply.

**Rule 1 (CLAUDE.md):** nothing may show a hidden (unrevealed) glass's wine, before its reveal, to anyone who may not already see it. A check whose visible outcome differs, for anyone other than the glass's adder, depending on whether a wine is poured is itself an oracle. Refusals may depend only on the caller's own glasses.

## 1. Summary

| Leak | What leaked | Fix | Where |
|---|---|---|---|
| F4 | A public catalog-only wine vanished (hidden) the moment a host poured it; its creator read the flag. | A wine is hidden only when it is born for a flight. `catalog_wine_mark_blind` is dropped: pouring never hides an existing wine. | M1 (born hidden), M2 (drop), app |
| F5 | A brand-new flight wine was public for one round trip, until its answer key was inserted. | `find_or_create_catalog_wine` creates it `blind_pending` when the flight path sends `"hidden": true`. | M1, app |
| F6 | `authenticated` (and `anon`) could write `blind_pending`, `merged_into`, `created_by` (and `id`) on `catalog_wines`. | Column grants: INSERT and UPDATE only on the columns the app writes. | M2 |
| F7 | `merge_catalog_wines` (EXECUTE for PUBLIC and anon) moved other people's unrevealed answer keys, and could hide the winner. | EXECUTE for authenticated and service_role. Only revealed glasses move. An unrevealed glass moves at its own reveal. A hidden wine is never a target. | M2 |
| F8 | A PUBLIC or FRIENDS cellar's lot quantity dropped at Start, readable by every viewer of that cellar. | Other people read a cellar only through `shared_cellar_lots`, where a bottle poured into an unrevealed glass is still in its lot. "cellar own select" is the owner only. | M1 (function), M2 (policy), app |
| F9 | A new producer, grape or appellation keyed for a flight is readable by everyone at once. | **Owner decision.** It cannot close without breaking guessing (§3.6). Recommended: accept, with an optional host notice. | none |
| F10 | An "I can't identify this bottle" glass's identity lives in `catalog_wines_unidentified`, which every signed-in user could read. | Read by its creator, whoever can read an answer key naming it, and the author of a note naming it. | M2 |
| F11 | An Edit, Swap or Remove plus re-add un-hid the abandoned brand-new wine, with its flight fill, while its glass was unrevealed. The same steps unmasked the pre-swap bottle's counts. | `flight_holds`: a hidden wine or a poured bottle is held to its glass. Only a reveal releases a hold: that glass's, or, for a wine, that of any glass that pours it. A removed glass or a deleted tasting keeps its holds for good. | M2, app (search) |

Two new findings came up while designing, and neither is fixed here (§10):

- **F8b.** `wines.added_via = 'CELLAR'` tells every participant which glass came from the adder's own cellar.
- **F12.** `catalog_wine_identity_match` and `find_or_create_catalog_wine` confirm an exact guessed identity of someone's hidden brand-new wine.

(A third, R4, "a host reopens a CLOSED tasting after its holds were released", no longer applies: since review round 1 a close releases nothing, §13.)

## 2. The leaks, reproduced on live (rolled back)

When the design started, live had 0 unrevealed glasses, 0 `blind_pending` wines, 0 pour intents and 0 unidentified rows. So every scenario builds its own fixtures in one transaction and rolls it back (§7).

For the first design's final runs (scratch-apply dry, chain dry, probe) live had 1 unrevealed glass and 1 hidden wine: someone was keying a flight. M2's backfill held that pair, and its post-state check 6 passed. For review round 1's runs (§13) live had 0 of each again.

- **People:** the demo people are Marcus (host), Priya (a JOINED guest), Isabelle (an outsider who owns catalog wines), Diego (a second host, and Priya's friend) and Sofia (made a curator inside the transaction).
- **Cellars:** inside the transaction, Marcus's cellar is PUBLIC, Diego's FRIENDS and Isabelle's PRIVATE.
- **Row ids** below are the probe's (§7.2).

### 2.1 F4: pouring hides an existing public wine

Isabelle adds C to the catalog: it is public, with no lot and no note. Marcus picks C from search into his unrevealed glass.

- `catalog_wine_mark_blind` sets `C.blind_pending = true` (A2).
- Priya can no longer read C (A3: 0 rows), and `search_catalog_wines` no longer finds it (A5: 0).
- Isabelle, C's creator, reads `blind_pending = true` on her own row (A4).

**What a guest learns, and how.** A guest (or any signed-in user) snapshots the catalog before the tasting. The rows that vanish while the host keys the flight are the flight, or at least its catalog-only part. C's creator doesn't even need a snapshot: their own row flips.

### 2.2 F5: the brand-new wine's window

`find_or_create_catalog_wine`, the `wines` insert and the `wine_answers` insert are three PostgREST requests. The new wine N is inserted with `blind_pending = false` (A6) and hidden only by the answer insert.

**What a guest learns, and how.** Between those requests anyone reads N (A7: Priya 1 row). A signed-in client polling `catalog_wines` ordered by `created_at` sees each new flight wine appear for about 100 ms.

### 2.3 F6: client-writable system columns

On live, `authenticated` and `anon` hold table-level INSERT and UPDATE on `catalog_wines`. "catalog update" admits the creator or a curator.

- B1: Isabelle sets `blind_pending = true` on her own wine, which hides it from everyone.
- B2: she tombstones it (`merged_into`) without a merge.
- B3: Sofia re-assigns `created_by`.
- B7: a client inserts a born-merged row.
- B9: an adder un-hiding their own hidden wine was already refused, by the F3 guard (20260919213300).

**What a guest learns.** Nothing directly, but these are the levers the other leaks pull: a creator could un-hide a wine someone else poured (spec 20260919213300, repro R5d).

### 2.4 F7: `merge_catalog_wines`

Setup: Marcus has Isabelle's public wine L in an unrevealed glass G3. Isabelle, L's creator, merges L into her catalog-only wine Wn.

- C3: G3's answer key moves to Wn. That is another person's unrevealed answer key, rewritten.
- C4/C5: the move fires `catalog_wine_mark_blind` on Wn, which vanishes: Priya reads 0 rows, and Isabelle reads `blind_pending = true` on her own winner.
- C9/C10: Marcus merges his own public wine M, which is in his unrevealed glass, and so hides the winner Wn2.
- C1: anon can call it (the ACL includes PUBLIC and anon). It is refused only because `auth.uid()` is null.

**What a guest or outsider learns, and how.**

- A catalog-only wine that a merge makes vanish is linked by someone's unrevealed glass. So is a merge target that disappears.
- The loser's creator learns it from their own winner's flag.
- Any curator can merge a suspected wine and watch the winner.

### 2.5 F8: a shared cellar at Start

Setup: Marcus's PUBLIC cellar has lot LM (2 bottles of P) and LM1 (1 bottle of P1). Both are poured into his flight (D11 intents).

- At Start, Priya's direct read of LM goes 2 → 1 (D1, D4).
- LM1 drops to 0 and leaves every "in stock" list (D6).
- The same happens in Diego's FRIENDS cellar for his friend Priya (D9).
- `catalog_wine_usage`/`catalog_wine_holdings` already hide this (20260919213300). The lot row does not.

**What a guest learns, and how.** A guest who can view the host's cellar snapshots it before Start. The lots that drop at Start are the flight's cellar glasses, and a lot that vanishes is a one-bottle pour.

### 2.6 F9: new reference rows

Marcus keys a flight glass with a producer and a grape that do not exist yet. `find_or_create_producer` and `findOrCreateGrapeFolded` insert them, and Priya reads both at once (E1, E3). `search_producers` finds the producer (E2).

**What a guest learns, and how.** A guest who paged `producers` (33,772 rows, 34 requests of 1,000) or `grapes` (276) before the flight was keyed diffs the table afterwards. A new row created during keying is very likely tonight's.

A new producer linked to a region also shows up with no diffing at all, for a guest who remembers the region's list: the guess ladder's empty-query "Specific to {region}" list shows up to 30 producers, and 229 of the 335 regions that have producers have 30 or fewer.

### 2.7 F10: the unidentified glass

Marcus keys an unidentified glass G7: a `wines` row, then the `catalog_wines_unidentified` row U, then the answer key.

- Priya reads U before and after the answer insert (F1, F2), and finds it by `created_by = Marcus` (F3), while she reads 0 rows of the answer key itself (F6).
- Sofia (a curator who is not a member) and Isabelle (an outsider) read it too (F5).
- When Marcus Edits G8 away from U2, U2 stays public (F9).
- In a BYO tasting, the host reads the contributor's U3 (F10), although he cannot read that answer key.

**What a guest learns, and how.** A guest filters `catalog_wines_unidentified` by `created_by = host` and reads the glass's country, region, grapes, producer, vintage, colour, style and name.

### 2.8 F11: Edit, Swap, Remove

Setup: Marcus's brand-new N4 is hidden and filled ("flight fill").

- G2/G3: he Edits the glass to N5. `catalog_wine_unmark_blind_on_unlink` un-hides N4 at once, and Priya reads N4 with its description.
- G4: a Swap to an existing public wine un-hides N6 the same way.
- G5: a Remove un-hides N7.
- G12: an Edit in a tasting that is then deleted un-hides N10.
- The counts behave the same way. At Start, a pour of Marcus's lot of Q is masked (G13: 3 bottles, 0 drunk). A Swap deletes the pour intent, so the masking lifts and Priya sees 2 and 1 (G14). A Remove does the same (G16).

**What a guest learns, and how.** A corrective Edit usually changes one field (vintage, name, appellation). So the wine that appears mid-tasting, or whose counts move, is a near-copy of what is now in the glass.

## 3. Decisions

### 3.1 F4 and F5: born hidden

- **D1. A wine is hidden only when it is born for a flight.** The flight path (add, finish, Edit, Swap) sends `"hidden": true` in `find_or_create_catalog_wine`'s payload, except on an OPEN board, whose glasses are inserted revealed. A row that the function creates with that key is inserted `blind_pending = true`. A row it finds is returned unchanged, hidden or public (probe A12, X2).
- **D2. `catalog_wine_mark_blind` and its trigger are dropped.**
  - Nothing ever turns a public wine hidden any more, so a pour, a Swap onto an existing wine, `resolve_unidentified_wine` (X3) and a merge no longer change anyone's view of the catalog.
  - A public wine that is poured stays public. Its record is frozen for the adder (the F3 guard) and its counts are masked (F2), both from 20260919213300.
- **D3. The key comes from the app, and a client may send it.**
  - A client can create a hidden row directly (INSERT `blind_pending` stays granted, D5). It can already do the same through a DRAFT tasting today.
  - What it gains is a private row with that identity. Anyone who later adds the identity links a row they cannot read (the documented "own lot naming a hidden wine" residual).
  - Accepted (R3).
- **Rejected:**
  - Keeping the mark trigger narrowed by creator or by age: it is a heuristic, and a catalog-only wine the host created minutes earlier would still vanish.
  - One RPC that inserts the wine, the glass and the answer key in a single transaction: every add path would change. Born hidden closes the same window for the catalog row.

### 3.2 F6: column grants

- **D4.** `revoke insert, update on catalog_wines from anon, authenticated`. Then `authenticated` gets the following back (post-state check 4):
  - **INSERT** on the columns `find_or_create_catalog_wine` writes: the identity columns, `created_by` (still pinned by the "catalog insert" policy) and `blind_pending` (born hidden).
  - **UPDATE** on the columns the app writes: Manage wine's patch (`updateCatalogWine`), the fill, `fillPrice` and `setCatalogWineImage`. That is the identity columns, `wine_name`, `description`, `alcohol_percent`, `image_url`, `estimated_price` and `estimated_price_currency`.
- **D5. What stays out.**
  - `blind_pending`, `merged_into`, `created_by`, `id`, `created_at`, `updated_at`, `lwin_code` and `external_source`.
  - `bottle_size_ml` and the FastCork-era columns, which nothing in `src/` writes.
  - Triggers, `merge_catalog_wines` (SECURITY DEFINER), defaults and `service_role` write them as before.
  - A refused column is `42501 permission denied for table catalog_wines`, the same for every caller.
- **Rejected:** a BEFORE trigger that refuses system-column changes at depth 1. Column grants are the repo's pattern (`wines`, `profiles`), fail before RLS, and cannot be bypassed by a new code path.

### 3.3 F7: merge defers

- **D6.** EXECUTE is revoked from PUBLIC and `anon` and kept for `authenticated` and `service_role` (no app caller; curators and the live tests call it as `authenticated`).
- **D7. Only revealed glasses move now.**
  - An unrevealed glass keeps its answer key on the merged-away loser.
  - At that glass's reveal, `catalog_wine_unmark_blind` moves it to `catalog_wine_merge_target(loser)`: `merged_into` followed to its end, capped at 32 hops. That happens before the glass's wine is un-hidden and before `wset_notes_resolve_on_reveal` fires (trigger order on `wines`), so a hidden-glass note resolves to the winner (X1).
  - A glass that is never revealed keeps pointing at the loser. Only its adder reads that answer key.
- **D8. A hidden wine is never a merge target.**
  - The refusal is `winner catalog wine not found or already merged`, the same words as for a missing id (C7, C8).
  - Only its creator, curators and answer-key readers know a hidden id, and each of them can already read the row.
- **D9. The tombstone is still judged by `catalog_wines_rule1_guard`.**
  - Before, the merge moved the caller's own unrevealed answer keys first, so the guard never fired.
  - Now the adder of an unrevealed glass of a public loser is refused (C9), which depends only on the caller's own glasses (the F3 rule, R6 of 20260919213300).
  - Everyone else's merge gives the same result whether or not someone poured the loser (C2 = C12).
- **Rejected:**
  - Refusing while someone else's unrevealed glass links the loser: the refusal itself tells the loser's creator the wine is poured.
  - Curator-only merges: a curator would still move hidden answer keys.

### 3.4 F8: the shared cellar read

- **D10. `shared_cellar_lots(p_owner uuid) returns setof cellar_lots`** (SECURITY DEFINER, stable; EXECUTE for authenticated and service_role).
  - **Gate.** It returns the owner's lots when `p_owner = auth.uid() or can_view_cellar(p_owner)`, the gate "cellar own select" had.
  - **Quantity.** A bottle `catalog_wine_masked_pours` names (poured into a glass that is not revealed yet, or held, D14) is added back to its lot.
  - **`updated_at`** reads as `created_at` for every lot, since a pour stamps it.
  - **Robustness.** Built with `jsonb_populate_record(null::cellar_lots, to_jsonb(lot) || …)`, so a later `cellar_lots` column does not break it.
  - **Embeds.** It returns table rows, so PostgREST embeds `catalog_wines(...)` from it exactly as `LOT_SELECT` does from the table.
- **D11. "cellar own select" becomes `owner_id = auth.uid()`.**
  - The one reader of someone else's lots is `getCellarBottles(..., { readOnly: true })` (`/u/[id]/cellar`), which switches to the function (§6.3).
  - `lot-sheet.ts` already refuses a lot that is not the viewer's (refinement 21).
  - `catalog_wine_photos read` keeps its own `can_view_cellar` test.
  - The owner still sees the bottle leave at Start (D11 unchanged). Everyone else sees it leave at the glass's reveal. A bottle poured into a glass that is then removed, or into a tasting that is then deleted, never leaves in their view (D16, R5).
- **Rejected:**
  - Drawing down at the reveal instead of at Start: that changes D11, the owner decision, plus two live pour functions and the owner's own cellar.
  - A SECURITY DEFINER view: equivalent, but readable with any filter and flagged by Supabase's linter. The function takes the owner explicitly.

### 3.5 F10: unidentified rows follow the answer key

- **D12.** `"unidentified read"` becomes `created_by = auth.uid() or can_read_unidentified_wine(id)`.
  - The helper is SECURITY INVOKER, like `can_read_blind_pending_catalog_wine`: true when an answer key naming the row is readable under the caller's own `wine_answers read`, or the caller wrote a note naming it.
  - So the adder reads it, everyone reads it once its glass is revealed (F7), and an ASYNC IMMEDIATE guesser who scored it reads it.
  - A row in the window before its answer key, or one abandoned by an Edit or Swap (F9), is its creator's alone. That closes the F5 and F11 analogues for unidentified glasses with no extra machinery.
  - A partial index `wine_answers_unidentified_wine_id_idx` keeps the helper cheap.
- **D13. No curator clause (owner decision OD3).**
  - The curator queue (`/catalog/unidentified`) then lists the rows whose glass is revealed, plus the curator's own.
  - That is stricter than hidden catalog rows, which every curator reads.
  - A curator who is also a guest no longer sees tonight's unidentified bottle in the queue.
- **Rejected:**
  - Keeping the identity out of the shared table until the reveal: a larger app change.
  - A `blind_pending`-style flag on the table: more triggers for the same outcome.

### 3.6 F9: owner decision OD1 (no change here)

Every guessable field is a dropdown of existing reference rows (CLAUDE.md Domain rules), so guests must be able to pick a new producer, grape or appellation to score it.

| Option | Effect |
|---|---|
| **A. Accept (recommended).** | Document the residual. A diff of `producers` or `grapes` taken before the flight is keyed shows the rows created during keying. |
| **A + a notice (optional, recommended).** | When the by-hand form creates a new reference row for a BLIND or SEMI_BLIND glass, it says "Guests will see this new producer in their lists." App-only; no rule-1 change. |
| **B. Hide new rows until the reveal.** | Guests can then never pick the right entry: that field scores 0 for everyone on that glass. It also needs creator and hold columns on four reference tables, and changes to `search_producers`, `search_appellations`, `find_producer_by_folded_name`, the guess ladder and every embed. Not recommended. |

**Quantified:**

- The oracle needs a deliberate snapshot and diff (34 requests for producers), or a remembered region list of 30 or fewer.
- It names a producer, grape or appellation, not the wine.
- It fires only for entries missing from LWIN's 33,772 producers, 276 grapes and 3,894 appellations.

### 3.7 F11: holds (`flight_holds`)

- **D14. A hold ties something hidden because of a flight to a glass.** Each hold is internal: RLS on, no policy, no client grant. There are two kinds.
  - **A catalog hold** is created when an answer key links a `blind_pending` wine to an unrevealed glass (`flight_holds_on_link`, which replaces the mark trigger's slot).
  - **A pour hold** is created when `wine_pour_intents.cellar_consumption_id` is set for an unrevealed glass (`flight_holds_on_pour`). Both D11 pour functions do that, and they are unchanged.
  - A glass that is removed keeps its holds: `wine_id` is set to null. A tasting that is deleted keeps them too: `tasting_id` is set to null. `tasting_id` only records where the hold came from; no release reads it.
  - Only the held wine or consumption itself going away (a curator's delete of an unused catalog wine, a deleted consumption or account) drops a hold without a reveal.
- **D15. A held wine is un-hidden only by `catalog_wine_unhide_if_free`.** That runs when no unrevealed glass links the wine and no hold remains.
  - The unlink trigger calls it (it used to un-hide at once). A flight-born wine's hold outlives the link, so this never publishes one.
  - So does the trigger that fires after a hold is deleted, that is, after a reveal released it.
  - `catalog_wine_masked_pours` masks a pour while a hold exists, or while an intent links it to an unrevealed glass (20260919213300's rule, kept).
- **D16. Only a reveal releases a hold** (review round 1, §13).
  - **A glass's reveal** releases every hold on that glass, and every hold on the wine it now links (`catalog_wine_unmark_blind`), including the kept holds of removed glasses and deleted tastings on that wine.
  - That publishes two kinds of wine, and both are harmless by then. A wine this glass abandoned on an Edit or Swap is a near-copy of the glass's current wine, which is public from that moment (G6, G7, G15, D14). A wine a removed glass or a deleted tasting left hidden is published by the reveal of the next glass that pours it: that wine is the revealed one (H7).
  - **A close releases nothing.** A tasting CLOSED with every glass revealed has no hold left except those of its removed glasses, and it keeps them (G10, G18, H5). A tasting CLOSED with a glass never revealed keeps that glass's holds too (G11). That matches the glass's own wine, which is never un-hidden either (R2 of 20260919213300).
  - **A delete releases nothing** (G12, H1, H8).
  - So a flight-born wine abandoned before any reveal stays hidden: its creator and curators read it, and its creator's add-wine search still lists it (§6.6). If it is poured again, the new glass links the hidden row and the new glass's reveal publishes it (H6, H7).
- **Rejected:**
  - "Release when no unrevealed glass is left": a Remove then a re-add in a one-glass flight, or an IN_PROGRESS tasting that gets a glass after all current ones are revealed, would publish the near-copy first.
  - "Release at CLOSED regardless": it publishes the near-copy of a glass never revealed.
  - **"Release a removed glass's holds at a CLOSE with every glass revealed, and every hold at a delete"** (the first version of D16). Review round 1 showed it publishes a wine no glass ever revealed (§13, R1 and R2). A host deletes a DRAFT tasting to set it up again, or removes a bottle to pour it next time. The released wine then stays public when it is poured again, since D2 never hides an existing wine. Its un-hide audit row, by the host, with no revealed glass to explain it, marks it as a flight wine abandoned before a reveal.
  - **"Release only pour holds at a close or a delete"** (the reviewer's alternative). The same two flows apply to a bottle from the host's cellar. A started tasting deleted to be set up again (mode, timing and wine source lock at Start) would unmask its pours at the delete, which tells a viewer of the host's cellar which of its bottles the new flight holds. Kept as owner option OD4.
  - "Record that a born-hidden row was never revealed, and hide it again when a flight links it": the release itself still publishes the wine until the next pour, and hiding it again is the F4 vanish oracle.
  - Deleting the orphaned brand-new row: it destroys data, and someone's lot of that identity blocks it anyway.
  - Updating the glass's own row in place on Edit: that covers Edit only, not Swap or Remove, and collides with the identity key.

## 4. How the pieces fit (the life of a flight wine)

The notation is `blind_pending` plus the holds on the wine; G is its glass and T its tasting.

1. **Add** (BLIND or SEMI_BLIND): `find_or_create_catalog_wine({..., hidden: true})` inserts N `blind_pending`. Only its creator and curators read it. The glass and the answer key follow, and `flight_holds_on_link` adds the hold (N, T, G).
2. **Edit, Swap or Remove away from N:** the unlink trigger calls `catalog_wine_unhide_if_free(N)`, which does nothing while the hold exists. N stays hidden. A pour into G keeps its pour hold (the counts and the shared cellar stay masked).
3. **G is revealed:** a merged-away answer key moves to its winner. G's wine becomes public, and every hold on G (N's, and any pour) is released. The release trigger un-hides N if nothing else holds it.
4. **G was removed, or T deleted:** the holds stay for good (`wine_id`, `tasting_id` set null). N stays hidden, read by its creator and curators, and its creator's add-wine search still lists it. A pour stays masked. Closing T changes nothing.
5. **N is poured again** (the bottle saved for next time, or T set up again as T2): `find_or_create_catalog_wine` returns the hidden N, the new glass G2 links it and takes a hold, and G2's reveal publishes N and releases every hold on it, the kept ones included.
6. **An existing public wine** is never hidden and never held. F2 masks its counts and the F3 guard freezes its record for the adder.

## 5. Migrations

Both files follow `20260919213300`'s style.

- **Pre-state.** A fail-closed DO block:
  - every live body replaced, dropped or relied on is pinned by `md5(replace(prosrc, chr(13), ''))`;
  - the exact trigger lists, policies and grants are asserted;
  - nothing it creates may exist yet.
- **Post-state.** A same-transaction DO block asserts attributes, bodies, EXECUTE grantees, triggers, policies, grants and data invariants.
- **Full files.** Appendices C and D hold both files verbatim. The drafts live at `.superpowers/leaks2/probes/draft/` (gitignored); the implementation copies them to `supabase/migrations/`.
- **Pins.** If any byte inside a function body changes, recompute the pins with `.superpowers/leaks2/probes/md5s.mjs [--pre <M1>] <file> <fn...>`. It applies the file up to its post-state and rolls back.

### 5.1 `20260919223100_rule1_born_hidden_and_shared_cellar.sql` (additive)

**Pre-state:**

- `20260919213300` is applied.
- `shared_cellar_lots` is absent.
- These bodies are pinned:

| Function | Pinned md5 | Why |
|---|---|---|
| `find_or_create_catalog_wine` | `2cf9598f…` | replaced |
| `catalog_wine_identity_match` | `763eb9a5…` | relied on |
| `catalog_wine_masked_pours` | `7e2054d9…` | relied on |
| `can_view_cellar` | `3af2e51e…` | relied on |
| `catalog_wine_mark_blind` | `08dc5499…` | still hides at link until M2 |

- `find_or_create`'s attributes and ACL: INVOKER, volatile, `OWNER,PUBLIC,anon,authenticated,service_role`.

**Post-state:**

- New pins: `find_or_create_catalog_wine` `0e9e2f11…` (ACL unchanged) and `shared_cellar_lots` `c3da48f2…` (`OWNER,authenticated,service_role`).
- anon lacks EXECUTE.
- For every owner, read as that owner, `shared_cellar_lots` returns exactly their lots, with the same quantity wherever nothing is masked, and `updated_at = created_at`.

**Behaviour.** Nothing a deployed caller does changes: the deployed app never sends `hidden`, and nothing calls the new function yet.

```sql
-- F5: a wine created for a flight is born hidden. The flight path sends
-- "hidden": true (never for an OPEN board, whose glasses are revealed at
-- insert); every other caller sends nothing and gets a public row. A row that
-- already exists is returned unchanged, hidden or not (F4: a public wine is
-- never hidden because someone pours it).
create or replace function find_or_create_catalog_wine(p jsonb)
returns uuid
language plpgsql
set search_path = public
as $$
declare v_id uuid;
begin
  v_id := public.catalog_wine_identity_match(p);
  if v_id is not null then return v_id; end if;

  insert into catalog_wines (
    country_id, region_id, appellation_id, primary_grape_id, secondary_grape_id,
    producer_id, type_designation_id, vintage_kind, vintage_year, vintage_tawny_years,
    colour, style, wine_name, created_by, blind_pending
  ) values (
    (p->>'country_id')::uuid, (p->>'region_id')::uuid, (p->>'appellation_id')::uuid,
    (p->>'primary_grape_id')::uuid, (p->>'secondary_grape_id')::uuid,
    (p->>'producer_id')::uuid, (p->>'type_designation_id')::uuid,
    (p->>'vintage_kind')::vintage_kind, (p->>'vintage_year')::int, (p->>'vintage_tawny_years')::int,
    (p->>'colour')::wine_colour, (p->>'style')::wine_style,
    nullif(btrim(p->>'wine_name'), ''), auth.uid(),
    coalesce((p->>'hidden')::boolean, false)
  ) returning id into v_id;
  return v_id;
end $$;

-- F8: someone's cellar as another person may see it. Gated like "cellar own
-- select" (the owner, or can_view_cellar). A bottle poured into a glass that is
-- not revealed yet (catalog_wine_masked_pours) still counts in its lot, and
-- updated_at reads as created_at for every lot, so neither a quantity nor a
-- timestamp moves when the host pours at Start. Returns cellar_lots rows so
-- PostgREST can embed the catalog wine exactly as a direct read does.
create function shared_cellar_lots(p_owner uuid)
returns setof cellar_lots
language sql
stable
security definer
set search_path = public
as $$
  with lots as (
    select l.*
      from cellar_lots l
     where l.owner_id = p_owner
       and (p_owner = auth.uid() or can_view_cellar(p_owner))
  ),
  masked as (
    select m.lot_id, sum(m.quantity)::int as quantity
      from catalog_wine_masked_pours(array(select distinct lots.catalog_wine_id from lots)) m
     group by m.lot_id
  )
  select (jsonb_populate_record(null::cellar_lots,
            to_jsonb(lots) || jsonb_build_object(
              'quantity', lots.quantity + coalesce(masked.quantity, 0),
              'updated_at', lots.created_at))).*
    from lots
    left join masked on masked.lot_id = lots.id;
$$;

revoke execute on function shared_cellar_lots(uuid) from public, anon;
grant execute on function shared_cellar_lots(uuid) to authenticated, service_role;
```

### 5.2 `20260919223200_rule1_older_leaks.sql` (the switch)

**Pre-state:**

- `20260919223100` is applied.
- `flight_holds`, the new index and the six new functions are absent.
- 20 bodies are pinned:
  - the two M1 bodies;
  - mark, unmark, unmark-on-unlink, masked pours and merge (replaced or dropped);
  - relied on: the D11 pour pair, `reveal_wine`, `reveal_next_category`, `remove_flight_glass`, the rule-1 guard and its helper, usage and holdings, `can_read_blind_pending_catalog_wine`, `resolve_unidentified_wine`, `can_view_cellar`.
- The merge ACL is `OWNER,PUBLIC,anon,authenticated,service_role`.
- The full trigger lists on `wine_answers`, `wines`, `tastings` and `wine_pour_intents` match live. `tastings` is pinned because no trigger there may release a hold.
- These policies match live: "catalog read", "cellar own select" and "unidentified read", plus the md5 of "wine_answers read" (`abe0592a…`), which the new helper reads under.
- `catalog_wines` still has table-level INSERT and UPDATE for anon and authenticated.
- Every column the new bodies use exists.

**Post-state:**

1. **The ten functions.** Attributes, bodies (table below) and EXECUTE grantees:
   - the four internal helpers and triggers: `OWNER` only;
   - unmark and unmark-on-unlink: their live ACL, unchanged;
   - masked pours: `OWNER`;
   - merge: `OWNER,authenticated,service_role`;
   - the unidentified helper: `OWNER,authenticated,service_role`.

   `catalog_wine_mark_blind` must be gone.
2. **Triggers.** The exact lists on the five tables, `flight_holds` included. `tastings` keeps exactly its four live triggers: nothing releases a hold at a close.
3. **Policies.** The three read policies as left:
   - `catalog read`: unchanged;
   - `unidentified read`: `((created_by = auth.uid()) OR can_read_unidentified_wine(id))`;
   - `cellar own select`: `(owner_id = auth.uid())`.
4. **`catalog_wines` grants.**
   - No table-level INSERT or UPDATE for anon or authenticated, and no column privilege for anon.
   - authenticated's INSERT and UPDATE column lists are exact.
5. **`flight_holds`.** RLS is on, there is no policy, and no client privilege. Its foreign keys are exactly `catalog_wine_id` CASCADE, `consumption_id` CASCADE, `tasting_id` SET NULL and `wine_id` SET NULL, and both set-null columns are nullable: a delete of the glass or of the tasting keeps the hold (D16).
6. **Backfill.** Every hidden wine that an unrevealed glass links is held, and every pour into an unrevealed glass is held.
7. **Counts.** `catalog_wine_masked_pours` returns exactly the consumptions 20260919213300 masked, checked both ways, so no live count moves at apply. This holds at apply time only. Afterwards a removed glass's or a deleted tasting's pour stays masked with no intent left, by design, so the probe runs its re-checks (I1) straight after the apply.

| New body | md5 |
|---|---|
| `catalog_wine_unhide_if_free(uuid)` | `f946145ff6a4f72ee7271e87d5112ab8` |
| `catalog_wine_merge_target(uuid)` | `41b6630a6f071bc910f6af21f32511ce` |
| `flight_holds_on_link()` | `7e7f1a32f794e143df94b10cdec59d67` |
| `flight_holds_on_pour()` | `f2eefca376cd3135468195963bf32ae5` |
| `flight_holds_after_delete()` | `b9f927675b7787cf134df79e9831c54b` |
| `catalog_wine_unmark_blind_on_unlink()` | `923badd459406c1cffcc02cb66733df7` |
| `catalog_wine_unmark_blind()` | `de1f11ee58c418bf8fdc9310f0ba508f` |
| `catalog_wine_masked_pours(uuid[])` | `fea91b152e3565f16c56cc1d15810d29` |
| `merge_catalog_wines(uuid,uuid)` | `6894957f77b8107a54e9f186a0973788` |
| `can_read_unidentified_wine(uuid)` | `c293ea5374aaee3bb3c89e8da4513850` |

The SQL between M2's banners is Appendix D's `BEGIN SPEC §5.2 SQL` … `END SPEC §5.2 SQL` block. It is not repeated here, to keep one copy.

## 6. App changes

### 6.1 New pure module `src/lib/wine-identity/catalog-payload.ts`

It uses relative or type-only imports, so vitest loads it. `catalogWinePayload` moves here from `write.ts`, unchanged except for the key.

```ts
// The find_or_create_catalog_wine payload (spec 2026-09-19-rule1-older-leaks §6.1).
// Pure: vitest loads it.

/** The payload key find_or_create_catalog_wine reads (20260919223100): a row the function CREATES
    with it is born blind_pending; a row it finds is returned unchanged. Pinned to the migration by
    catalog-payload.test.ts. */
export const BORN_HIDDEN_KEY = "hidden";

/** A wine created for a flight is born hidden, except on an OPEN board, whose glasses are inserted
    revealed (spec D1). */
export function flightWineBornHidden(revealMode: "BLIND" | "SEMI_BLIND" | "OPEN"): boolean {
  return revealMode !== "OPEN";
}

export type CatalogWineIdentity = {
  countryId: string; regionId: string; appellationId: string;
  primaryGrapeId: string; secondaryGrapeId: string | null; producerId: string;
  typeDesignationId: string | null;
  vintage: { kind: "YEAR" | "NV" | "TAWNY"; year: number | null; tawnyYears: number | null };
  wineName: string | null; colour: string; style: string;
};

/** The jsonb keys every find_or_create_catalog_wine caller sends (a blank wine name is null, D3),
    plus BORN_HIDDEN_KEY only when `hidden`. */
export function catalogWinePayload(wine: CatalogWineIdentity, options: { hidden?: boolean } = {}) {
  return {
    country_id: wine.countryId,
    region_id: wine.regionId,
    appellation_id: wine.appellationId,
    primary_grape_id: wine.primaryGrapeId,
    secondary_grape_id: wine.secondaryGrapeId,
    producer_id: wine.producerId,
    type_designation_id: wine.typeDesignationId,
    vintage_kind: wine.vintage.kind,
    vintage_year: wine.vintage.year,
    vintage_tawny_years: wine.vintage.tawnyYears,
    wine_name: wine.wineName,
    colour: wine.colour,
    style: wine.style,
    ...(options.hidden ? { [BORN_HIDDEN_KEY]: true } : {}),
  };
}
```

Use the repo's own vintage-kind and colour types if `types.ts` exports them in pure form; the shape above is the contract.

### 6.2 `src/lib/wine-identity/server/write.ts` and the flight writers

**`upsertCatalogWine(supabase, userId, wine, options: { fill?: boolean; hidden?: boolean } = {})`:**

- It builds `catalogWinePayload(wine, { hidden: options.hidden === true })` for both RPC calls, including the 23505 retry.
- Its doc comment gains: "Flight callers also pass `hidden` (`flightWineBornHidden(revealMode)`): a wine it creates is born `blind_pending`, so no request ever shows it (spec 2026-09-19-rule1-older-leaks D1)."
- `identityExists` is unchanged.
- The local `catalogWinePayload` is removed.

**`fillFlightCatalogWine`'s doc comment.** Replace "That holds only while the glass links it: an Edit, Swap or Remove … (spec F11, pre-existing)" with "A wine born for a flight is hidden from its creation, and only a reveal publishes it: that glass's reveal (also after an Edit or Swap away from it), or the reveal of a later glass that pours it. A removed glass or a deleted tasting leaves it hidden (`flight_holds`, spec 2026-09-19-rule1-older-leaks D14-D16)."

**`src/app/tastings/[id]/wines/new/tasting-wine-writes.ts`:**

- `insertTastingWineFromIdentity`: `upsertCatalogWine(supabase, userId, prepared.wine, { fill: false, hidden: flightWineBornHidden(adder.tasting.revealMode) })`.
- `saveFlightGlassCore` (Edit, finish, Swap): the same, with `state.revealMode`.
- The comment above each `fillFlightCatalogWine` call becomes: "After the answer key: a brand-new wine was born hidden (find_or_create_catalog_wine's `hidden`), so its fill is read only by its creator (the caller), a curator and whoever can already read that answer key, until a glass that links it (or this one, after an Edit or Swap away) is revealed; a removed glass or a deleted tasting leaves it hidden (spec 2026-09-19-rule1-older-leaks D14-D16). A public wine is never filled from a flight."
- **Unchanged:**
  - `insertTastingWineFromCatalogRow`, `insertTastingWineFromLot`, `insertIncompleteGlass`: none creates a catalog row;
  - the unidentified paths: F10 is a read policy;
  - every non-flight caller (catalog, cellar, note): it sends no `hidden`.

### 6.3 `src/lib/cellar/bottles.ts` (F8)

`getCellarBottles` reads someone else's cellar through the function:

```ts
const base = opts.readOnly
  // Someone else's cellar (/u/[id]/cellar): only through shared_cellar_lots, where a bottle poured
  // into a glass that is not revealed yet still counts in its lot (spec 2026-09-19-rule1-older-leaks
  // D10, D11); "cellar own select" admits the owner alone.
  ? () => supabase.rpc("shared_cellar_lots", { p_owner: ownerId }).select(LOT_SELECT)
  : () => supabase.from("cellar_lots").select(LOT_SELECT).eq("owner_id", ownerId);
const { data: lotData } = await base()
  .gt("quantity", 0)
  .order("created_at", { ascending: false })
  .order("id")
  .range(from, from + LOT_PAGE - 1);
```

- The `.gt` applies to the masked quantity, so a one-bottle lot poured at Start stays listed.
- The module comment's "`cellar own select` is `owner_id = auth.uid() or can_view_cellar(owner_id)`" becomes "`cellar own select` admits the owner alone; someone else's cellar reads through `shared_cellar_lots` (masked pours, 20260919223100/20260919223200)".
- The same line in `lot-sheet.ts` (refinement 21) and the comment in `src/app/u/[id]/cellar/page.tsx` get the same correction.

### 6.4 `src/lib/supabase/database.types.ts`

Add under `Functions`:

```ts
shared_cellar_lots: {
  Args: { p_owner: string };
  Returns: Database["public"]["Tables"]["cellar_lots"]["Row"][];
  SetofOptions: { from: "*"; to: "cellar_lots"; isOneToOne: false; isSetofReturn: true };
};
```

- `find_or_create_catalog_wine` keeps `Args: { p: unknown }`.
- `can_read_unidentified_wine`, `flight_holds` and the internal helpers get no entries: no client code calls them.
- `npx tsc --noEmit` must accept the `.rpc(...).select(LOT_SELECT).gt(...).order(...).range(...)` chain. postgrest-js 2.110.2's `select` on an RPC returns a filter builder.

### 6.5 No app change

These rely on the database alone: F4 (after M2's drop), F6, F7, F10, F11 and the tests. `/catalog/unidentified` keeps its query. Under D13 it shows only rows its curator may read.

### 6.6 `src/components/add-wine/actions.ts` and `flight-knowledge.ts` (review round 1, minor finding)

Under D16 a flight wine whose glass is removed, or whose tasting is deleted, stays `blind_pending` until a glass that pours it is revealed. `searchAddWine` used to drop every `blind_pending` row, so the adder could no longer find their own wine in the add-wine sheet, for a flight, their cellar or a note (review R3; probe H4). Keying it again by hand still worked, because the identity match returns it.

- **New pure helper** in `flight-knowledge.ts`, tested in `flight-knowledge.test.ts` (T5):

  ```ts
  export function searchShowsCatalogWine(
    w: { blindPending: boolean; createdBy: string | null },
    userId: string,
  ): boolean {
    return !w.blindPending || w.createdBy === userId;
  }
  ```

- **`searchAddWine`:** `WINE_EMBED` and `catalogIdentities` also select `created_by`. The cellar group (`matchingWine`), the tasted group and the catalog group (`visibleHits`) each keep a row when `searchShowsCatalogWine` holds, in place of `!blind_pending`. The helper is a non-exported `shownTo` wrapper, since a `"use server"` file exports only async functions.
- **Why this is safe.** The creator already reads the row ("catalog read"'s `created_by = auth.uid()`), and `search_catalog_wines` already returns it to them. Listing it tells no one anything new. For everyone else nothing changes: a hidden row is never listed.
- **What the creator can do with it.** A flight add links the hidden row, so the new glass takes a hold and its reveal publishes the wine. A cellar or note add links a row that only the creator and curators read (R2).
- **Unchanged:** the global header search (`global-search.tsx`), the catalog page (`/catalog/[wineId]` answers 404 for a hidden wine, even to its creator), the scan matcher (`server/match.ts`) and the by-hand form's producer wine count (`by-hand-actions.ts`) still leave every hidden row out. Nothing in the finding needs them (R11).

## 7. The rolled-back probes

### 7.1 Files

All of these are under `.superpowers/leaks2/probes/` (gitignored):

- `rule1-older-leaks-probe.mjs` (Appendix E): the main probe;
- `extra-probe.mjs` (§7.3);
- `chain-dry.mjs`: the pair's rolled-back chain dry run;
- `md5s.mjs`: body pins;
- `ro.mjs`: read-only queries;
- `review-probe.mjs`: review round 1's reproduction (R1-R3, §13), kept as the reviewer wrote it (last output: `review-probe-output.txt`);
- `sync-appendices.mjs`: rewrites Appendices A-E from the files they copy;
- `suite-harness.mjs`: runs a live `node:test` suite (T4) with both migrations applied inside the suite's own rolled-back transactions (last outputs: `suite-cellar-social-2.txt` 5/5, `suite-wine-backbone-2.txt` 30/30);
- `draft/`: the two migration files.

**Shape.**

- There are two phases, each one transaction ending in ROLLBACK.
  - **before:** live as it is.
  - **after:** M1, then M2, executed first, each recorded in `schema_migrations` as scratch-apply records one. The migrations' own checks (I1) run straight after the apply, before any fixture, since M2's post-state check 7 is an apply-time invariant.
- Fixtures are built as postgres on the demo people. Every step the app takes runs as the signed-in person, in a savepoint under `set local role authenticated|anon` with `request.jwt.claims`. Those steps are: `find_or_create_catalog_wine` with or without `hidden`, the `wines` and `wine_answers` inserts, an Edit's `wine_answers` update, a Swap's intent delete, `remove_flight_glass`, `reveal_wine`, the D11 draw-down, the close, the tasting delete and `merge_catalog_wines`.
- **The final line** compares a live fingerprint before and after both phases. It covers the counts of 15 tables, md5s over the catalog, the lots, every public function body and ACL, and every policy, the trigger count, and `catalog_wines`' ACL.
- **`--applied`** runs only the after-phase against live, after the owner's apply. `--m1` and `--m2` point it at the copied files.

**Last run:** ALL EXPECTS MET (Appendix A), with the migration files, 2026-09-19, after review round 1. The first run of the original design failed one row, D12, in both phases.

- The EXPECT was wrong, not the design. Marcus editing Isabelle's P is filtered out by "catalog update" (0 rows) before any guard fires.
- D12 now tests the guard on a wine Marcus created (PM), and keeps the 0-row case beside it.

Review round 1 changed the after-values of G10, G12 and G18 (a close or a delete releases nothing) and added H1-H8 and I1's foreign-key tamper, all written before the run. The first run met every scenario, but I1 failed: it re-ran M2's post-state at the end of the phase, where G18's and H8's kept pour holds legitimately fail check 7 (an apply-time invariant). I1 now runs straight after the apply.

### 7.2 Scenarios (EXPECTs written before the first run)

"guard" is `42501 This wine is in one of your flights that hasn't been revealed yet. Change it after the reveal.`; "denied" is `42501 permission denied for table catalog_wines`; "no fn" is `42883 function shared_cellar_lots(uuid) does not exist`; "not found" is `P0001 winner catalog wine not found or already merged`.

| # | Scenario | Before (leak) | After |
|---|---|---|---|
| A1 | Priya reads Isabelle's catalog-only C before any pour | 1 | 1 |
| A2 | C.blind_pending after Marcus pours it | true | false |
| A3 | Priya reads C after the pour | 0 | 1 |
| A4 | Isabelle (creator, not adder) reads C.blind_pending | true | false |
| A5 | Priya's `search_catalog_wines` finds C while poured | 0 | 1 |
| A6 | brand-new N.blind_pending before its glass exists | false | true |
| A7 | Priya reads N in the window | 1 | 0 |
| A8 | Marcus (creator) reads N in the window | 1 | 1 |
| A9 | N after its answer key: hidden / Priya reads | true, 0 | true, 0 |
| A10 | OPEN board: a new wine public at once | false, 1 | false, 1 |
| A11 | a non-flight add is public | false | false |
| A12 | a second adder of N's identity links the same row | true | true |
| A13 | N hidden with two unrevealed glasses | true | true |
| A14 | F12 residual: Diego reads N's creator through his answer key | true | true |
| B1 | Isabelle sets blind_pending on her own wine | 1 | denied |
| B2 | Isabelle sets merged_into (no merge) | 1 | denied |
| B3 | Sofia (curator) re-assigns created_by | 1 | denied |
| B4 | Isabelle's Manage wine columns (name, text, photo, alcohol, price) | 1 | 1 |
| B5 | Sofia renames Isabelle's wine | 1 | 1 |
| B6 | anon renames a wine | 0 | denied |
| B7 | a direct insert with merged_into | 1 | denied |
| B8 | a direct insert of identity columns only | 1 | 1 |
| B9 | Marcus un-hides N (his unrevealed glass) | guard | denied |
| C1 | anon calls merge | `P0001 not authorised…` | `42501 permission denied for function merge_catalog_wines` |
| C2 | Isabelle merges L (in Marcus's unrevealed G3) into Wn | ok | ok |
| C3 | G3's answer key after the merge | Wn | L |
| C4 | Wn: hidden / Priya reads | true, 0 | false, 1 |
| C5 | Isabelle reads Wn.blind_pending | true | false |
| C6 | Priya reads L's tombstone | true | true |
| C7 | Sofia merges X into hidden N | ok | not found |
| C8 | Sofia merges X2 into a missing id | not found | not found |
| C9 | Marcus merges public M (his unrevealed glass) into Wn2 | ok | guard |
| C10 | Wn2 hidden after C9 | true | false |
| C11 | Sofia merges R (a note, a revealed OPEN glass): ok / note moved / answer moved | ok, true, true | ok, true, true |
| C12 | Isabelle merges an unpoured L2 (same outcome as C2) | ok | ok |
| C13 | reveal G3: answer key = Wn / Wn hidden / Priya reads Wn | revealed, true, false, 1 | revealed, true, false, 1 |
| D1 | Priya reads Marcus's PUBLIC lot LM directly before Start | [2] | [] |
| D2 | Priya's shared view of LM before Start | no fn | [[2, true]] |
| D3 | Start (draw-down) | drawn, drawn | drawn, drawn |
| D4 | Priya reads LM directly after Start | [1] | [] |
| D5 | Priya's shared view of LM after Start | no fn | [[2, true]] |
| D6 | one-bottle LM1: direct (qty > 0) / shared | 0, no fn | 0, [[1, true]] |
| D7 | Marcus reads his own LM | [1] | [1] |
| D8 | Diego's shared view equals Priya's | true | true |
| D9 | FRIENDS: Priya direct / Priya shared / Isabelle (stranger) shared | [1], no fn, no fn | [], [[2, true]], [] |
| D10 | PRIVATE: Priya direct / shared | [], no fn | [], [] |
| D11 | anon calls shared_cellar_lots | no fn | `42501 permission denied for function shared_cellar_lots` |
| D12 | Marcus edits his own public PM in his unrevealed glass / Isabelle's P | guard, 0 | guard, 0 |
| D13 | Marcus's add-wine search finds P while poured | 1 | 1 |
| D14 | reveal G5, then Priya's shared LM | revealed, no fn | revealed, [[1, true]] |
| E1 | Priya reads a producer Marcus just created | 1 | 1 |
| E2 | Priya's `search_producers` finds it | 1 | 1 |
| E3 | Priya reads a grape Marcus just created | 1 | 1 |
| F1 | Priya reads U before its answer key | 1 | 0 |
| F2 | Priya reads U, glass unrevealed | 1 | 0 |
| F3 | Priya finds U by created_by = Marcus | true | false |
| F4 | Marcus (creator) reads U | 1 | 1 |
| F5 | Sofia (curator) / Isabelle read U | 1, 1 | 0, 0 |
| F6 | Priya reads the answer key | 0 | 0 |
| F7 | reveal G7, then Priya / Isabelle read U | revealed, 1, 1 | revealed, 1, 1 |
| F8 | Marcus Edits G8 from U2 to a catalog identity | 1 | 1 |
| F9 | abandoned U2: Priya / Marcus | 1, 1 | 0, 1 |
| F10 | BYO: Diego (contributor) / Marcus (host) read Diego's U3 | 1, 1 | 1, 0 |
| F11 | tasting deleted: Priya (a note naming U) / Isabelle read U | 1, 1 | 1, 0 |
| G1 | the flight fill of hidden N4 | 1 | 1 |
| G2 | Edit G10 from N4 to N5 | 1 | 1 |
| G3 | N4: hidden / Priya reads | false, 1 | true, 0 |
| G4 | Swap G11 to public P: rows / N6 hidden / Priya reads N6 | 1, false, 1 | 1, true, 0 |
| G5 | Remove G12: N7 hidden / Priya reads | removed, false, 1 | removed, true, 0 |
| G6 | reveal G10: N5 / N4 hidden, Priya reads N4 | revealed, false, false, 1 | revealed, false, false, 1 |
| G7 | reveal G11: N6 hidden | revealed, false | revealed, false |
| G8 | N7 (glass removed) while G13 unrevealed | false | true |
| G9 | reveal G13: N7b / N7 | revealed, false, false | revealed, false, true |
| G10 | close T6 (all revealed): N7 / Priya reads (a close releases nothing) | 1, false, 1 | 1, true, 0 |
| G11 | T7 closed with a glass never revealed: N9 (removed) / N8 | 1, false, true | 1, true, true |
| G12 | T8: N10 after an Edit / delete T8 / N10 / N11 (a delete releases nothing) | false, 1, false, false | true, 1, true, true |
| G13 | Priya usage(Q) after Start (bottles, drunk) | [3, 0] | [3, 0] |
| G14 | Swap G17 to Q2: usage(Q) / Priya's shared LS | [2, 1], no fn | [3, 0], [[2, true]] |
| G15 | reveal G17: usage(Q) | revealed, [2, 1] | revealed, [2, 1] |
| G16 | Remove G18 after Start: usage(Q3) | removed, [2, 1] | removed, [3, 0] |
| G17 | reveal G19: usage(Q3) (G18 was removed: still held) | revealed, [2, 1] | revealed, [3, 0] |
| G18 | close T10 (all revealed): usage(Q3) (a close releases nothing: held for good) | 1, [2, 1] | 1, [3, 0] |
| H1 | R1: Marcus deletes DRAFT TH1 holding brand-new NH: deleted / NH hidden / Priya reads NH | 1, false, 1 | 1, true, 0 |
| H2 | NH keyed into running TH2 (Priya a guest): same row / NH hidden / Priya reads NH / Priya reads an un-hide audit row of NH | true, true, 0, 0 | true, true, 0, 0 |
| H3 | R2: Remove GS1 (NS) from running TH3: NS hidden / Priya reads / holds on NS | removed, false, 1, — | removed, true, 0, 1 |
| H4 | R3: Marcus's `search_catalog_wines` finds NS [found, hidden, kept by `searchShowsCatalogWine`] / Priya's search finds NS | [1, false, true], 1 | [1, true, true], 0 |
| H5 | reveal GS2 and close TH3 (every glass revealed): NS hidden / Priya reads | revealed, 1, false, 1 | revealed, 1, true, 0 |
| H6 | NS poured in running TH4: same row / hidden / Priya reads / Priya reads an un-hide audit row | true, true, 0, 0 | true, true, 0, 0 |
| H7 | reveal GS4, the glass that pours it: NS hidden / Priya reads / holds on NS | revealed, false, 1, — | revealed, false, 1, 0 |
| H8 | Marcus deletes started TH5 (a pour of LQ4): deleted / Priya usage(Q4) / Priya's shared LQ4 / Marcus's own LQ4 | 1, [2, 1], no fn, [1] | 1, [3, 0], [[2, true]], [1] |
| I1 | run straight after the apply: both post-states pass; M2's post-state raises on an UPDATE(blind_pending) grant, a dropped `flight_holds_on_link`, a changed helper body, an anon merge grant, and a `tasting_id` foreign key that cascades; both pre-states refuse a second apply | — | passed, passed, true ×7 |
| end | live unchanged after both phases | ok | ok |

The same probe run against the first version of M2 (the pre-review file, Appendix D as it was, `probe-output-old-m2.txt`) fails 9 rows after the apply: G10 `1, false, 1`, G12 `true, 1, false, false`, G18 `1, [2, 1]`, H1 `1, false, 1`, H2 `true, false, 1, 1`, H5 `revealed, 1, false, 1`, H6 `true, false, 1, 1`, H8 `1, [2, 1], [[1, true]], [1]`, and I1's foreign-key tamper. H3, H4 and H7 pass there too. Live stays unchanged.

**How the rows prove the rule.**

- **Leaks close:**
  - F4: A2-A5.
  - F5: A6, A7.
  - F6: B1-B3, B6, B7.
  - F7: C1, C3-C5, C7, C9, C10.
  - F8: D1, D2, D4-D6, D9, D11.
  - F10: F1-F3, F5, F9, F10.
  - F11: G3-G5, G8-G12, G14, G16-G18, H1, H3, H5, H8.
  - Review round 1 (a close or a delete publishing a wine no glass revealed): G10, G12, H1, H2, H5, H6.
- **Legitimate paths keep working:**
  - catalog, cellar and note adds: A8, A10, A11, B4, B5, B8;
  - the second adder and identity match: A12, A13;
  - curator and creator merges: C2, C11, C12;
  - the deferred key moving at its reveal: C13;
  - the owner's own cellar: D7;
  - viewers seeing unmasked lots, and the reveal unmasking: D2, D14;
  - the F3 guard and RLS unchanged: D12;
  - add-wine search: D13, and the creator's own hidden wine: H4;
  - the flight fill: G1;
  - reveals releasing holds, the kept ones included: G6, G7, G15, H7;
  - the owner's own lot after a delete: H8;
  - revealed unidentified rows and the adder's own: F4, F7, F11.
- **Refusals depend only on the caller's own glasses:**
  - C2 = C12: a non-adder's merge gives the same result, poured or not;
  - C9: only the adder is refused;
  - C7 = C8: a hidden target reads as a missing one;
  - D8: every viewer gets the same shared cellar;
  - B1-B3, B6, B7: denied for everyone, glass or no glass;
  - F5, F9, F10: a non-reader gets 0 rows, exactly as for a row that does not exist.

### 7.3 The extra probe (`extra-probe.mjs`, after-phase only, rolled back)

| # | Scenario | Result |
|---|---|---|
| X1a | Isabelle merges L → W1, then W1 → W2, while Marcus's unrevealed G links L | ok, ok |
| X1b | G still on L before its reveal | true |
| X1c | after G's reveal: answer key = W2, and Priya's hidden-glass note resolved to W2 (trigger order) | true, true |
| X2 | a `hidden` flight add of an existing public identity returns it, still public | true, false |
| X3 | Marcus resolves his unrevealed glass's unidentified row into a public wine: ok / still public / Priya reads the unidentified row | ok, false, 0 |
| end | live unchanged | ok |

## 8. Deploy order and verification

**Order.** Apply M1, then deploy the app, then apply M2.

- **M1 alone** changes nothing a deployed caller does.
- **The app on M1:** flight wines are born hidden (F5 closes), and friends' cellars read through the masked function.
- **The app on the old DB, without M1:** `/u/[id]/cellar` would call a missing function and show an empty cellar. So M1 goes first.
- **M2 before the app:**
  - the old app sends no `hidden`, and there is no longer a mark trigger, so brand-new flight wines would be born public and stay public;
  - friends' cellars would read empty.
  - M2's pre-state can check M1, not the app. The owner must hold the order.

**Implementation run:**

1. Write T1-T3 (§9) and see them fail. Implement §6 and see them pass.
2. Run `npx tsc --noEmit`, `npm run lint`, `npm test` and `npm run build`. The untouched tree (`f8bddaf`) passes vitest with 137 files / 3,076 tests. After review round 1 the tree passes with 138 files / 3,088 tests; tsc, lint and build are clean (the build's one NFT-trace warning on `next.config.ts` predates this change).
3. Copy both drafts to `supabase/migrations/` byte for byte, then:
   - `node --env-file=.env.local scripts/scratch-apply.mjs --file supabase/migrations/20260919223100_rule1_born_hidden_and_shared_cellar.sql --mode dry` → `DRY-OK`;
   - `node --env-file=.env.local .superpowers/leaks2/probes/chain-dry.mjs supabase/migrations/20260919223100_rule1_born_hidden_and_shared_cellar.sql supabase/migrations/20260919223200_rule1_older_leaks.sql` → `CHAIN-DRY-OK` ×2;
   - the probe with `--m1`/`--m2` on the copied files → ALL EXPECTS MET;
   - the extra probe → ALL EXPECTS MET.
4. **Never `--mode live`, never push.** The owner applies M1, deploys, then applies M2. After M1 is live, `scratch-apply --file …223200… --mode dry` works standalone, as a last check.
5. **After M2 is live:**
   - run the probe with `--applied`;
   - run the updated live suites (§9, T4);
   - check in the browser as a demo account: another person's PUBLIC cellar at `/u/[id]/cellar` lists and embeds its wines; the curator queue loads.

## 9. Tests to write first

**T1. `src/lib/wine-identity/catalog-payload.test.ts`:**

- `flightWineBornHidden`: BLIND → true, SEMI_BLIND → true, OPEN → false.
- `catalogWinePayload(wine)` has exactly the 13 keys, with no `hidden` key.
- `{ hidden: false }` → no `hidden` key. `{ hidden: true }` → `hidden: true` plus the same 13.
- A blank-name wine sends `wine_name: null` (unchanged from `write.ts`).

**T2. The pin, in the same file.** It reads `supabase/migrations/20260919223100_rule1_born_hidden_and_shared_cellar.sql` (CRLF normalised) and expects `coalesce((p->>'` + `BORN_HIDDEN_KEY` + `')::boolean, false)` exactly once.

**T3. Existing suites that must stay green without edits:** `fill-rule.test.ts` and `rule1-guard.test.ts` (it pins 20260919213300's file, unchanged).

**T5. `src/components/add-wine/flight-knowledge.test.ts`** (review round 1, §6.6): `searchShowsCatalogWine` lists a public wine for everyone (with or without a creator), a hidden wine for its creator, and a hidden wine for no one else (including when `created_by` is null).

**T4. Live `node:test` suites to update.** They pass only once M2 is live, and they fail before it by design.

- **`scripts/cellar-social.test.mjs`:**
  - "PUBLIC cellar is visible" and "FRIENDS … visible to a friend" read through `shared_cellar_lots(owner)`.
  - A direct `cellar_lots` read by the other user is 0 rows in every visibility.
  - "PRIVATE … hidden" checks both reads return nothing.
  - Add: a lot poured into an unrevealed glass keeps its quantity in the shared view until that glass's reveal.
- **`scripts/wine-backbone.test.mjs` "merge repoints notes and answers":**
  - The test's glass is unrevealed, so its answer now stays on the loser. Assert that, then reveal the glass (as its host) and assert the answer moved.
  - Add a revealed-glass case that moves at merge time.
  - Add "anon cannot call merge_catalog_wines" and "a hidden wine is not a merge target".
- **Optional `scripts/rule1-older-leaks.test.mjs`:** A2/A7, B1, D5, F2, G3 and G14, as permanent regressions.

## 10. Residuals, owner decisions and new findings

**Owner decisions:**

- **OD1 (F9):** accept new reference rows being public, recommended with the host notice. §3.6 has the options and numbers.
- **OD2 (F8b, new):**
  - The problem: `wines.added_via` is readable by every participant (`wines read` has no column split), so `CELLAR` says "this glass came from the adder's own cellar". With F8 masked, a guest who can view that cellar (PUBLIC or FRIENDS) still narrows the glass to its wines. Live's four shared cellars hold 33, 27, 5 and 2 lots.
  - Proposed follow-up: `revoke select (added_via) on wines from authenticated`, plus an adder-only SECURITY DEFINER read for `wines-card.tsx`, the one reader, which reads its own glasses. No `select("*")` on `wines` exists in `src/`.
  - Not in this change: it is a separate column and surface, and the owner asked for F4-F11.
- **OD3 (F10 curators):** curators lose unrevealed unidentified rows (D13). Alternative: add `is_curator` to the helper, for parity with `can_read_blind_pending_catalog_wine`. The reverse alignment, dropping curators from the hidden catalog read, is a separate question.
- **OD4 (release rule, revised in review round 1):** only a reveal releases a hold (D16). A removed glass, a deleted tasting, or a glass never revealed keeps its holds for good (R5).
  - **The alternative** is to also release pour holds, never catalog holds, when a tasting is CLOSED with every glass revealed, or deleted. That is one trigger on `tastings`, and `tasting_id` is kept on every hold for it.
  - **What it gains:** community counts and shared cellars are exact again once the tasting is over. Today the bottles poured into removed glasses or deleted tastings keep counting as unopened for everyone but the owner.
  - **What it costs:** a started tasting deleted to be set up again (mode, timing and wine source lock at Start) unmasks its pours at the delete. A viewer of the host's cellar learns which bottles the new flight holds. A poured glass removed "for next time" is unmasked at the close in the same way.
  - Recommended: keep the rule as it is.

**New finding, not fixed. Suggest a separate task.**

- **F12. Identity match confirms an exact guess of a hidden wine.**
  - `catalog_wine_identity_match(jsonb)` is SECURITY DEFINER with EXECUTE for `authenticated`, and returns the id of any live row with the given identity (producer, name, appellation, colour, vintage kind, year, tawny), hidden or not.
  - A guest who suspects "Domaine X Cuvée Y 2015" calls it. An id they cannot then read means someone holds that exact brand-new wine in an unrevealed glass, or abandoned it.
  - `find_or_create_catalog_wine` answers the same way, and a second adder who links the row reads its `created_by` (A14), which names the first adder.
  - The same row lets the creator of an abandoned wine see that it stays hidden after their own holds are released, which means someone else linked that identity.
  - It needs the exact identity, so it confirms a guess and names nothing new. It is pre-existing: 20260914126500's "accepted residual", which understated it.
  - **Direction:** revoke client EXECUTE on the helper (making `find_or_create` SECURITY DEFINER), and let a hidden row stop reserving its identity (`catalog_wines_identity_key … where merged_into is null and not blind_pending`), merging the duplicate when the hidden one is revealed. That is an owner decision and a separate design.

**Accepted residuals of this design:**

- **R1. Deploy order** (§8). M2 before the app would publish brand-new flight wines for good.
- **R2. An orphan born-hidden row.** It stays hidden, and only its creator and curators read it. It happens in three ways:
  - a flight add fails after `find_or_create_catalog_wine` (the glass or answer insert is refused, or the network is lost), leaving no link and no hold;
  - since review round 1, a glass holding a brand-new wine is removed before it is revealed;
  - or its tasting is deleted before it is revealed.

  How it ends and what it costs:
  - A retry, or a later flight glass that pours it, links it, and that glass's reveal publishes it (H6, H7). Its creator's add-wine search still lists it (§6.6, H4).
  - A later catalog, cellar or note add of that exact identity by someone else links a row they cannot read. That is the pre-existing "own lot naming a hidden wine" residual, and it lasts until a glass that pours the wine is revealed.
  - Before this change, live published such a wine at the Remove or the delete itself (F11). This design trades that for a row that stays private.
  - It needs an exact match of producer, wine name, appellation, colour and vintage with a wine that was brand new to the catalog when a host keyed it for a flight.
  - Live today: 7 tastings, 19 glasses, 0 unrevealed glasses, 0 hidden wines.
- **R3. A client may send `hidden`** (D3). It can create private rows that capture an identity: griefing only, and possible today through a DRAFT tasting.
- **R4. Withdrawn in review round 1.** It was "a host reopens a CLOSED tasting through the API after its holds were released". A close no longer releases anything, so a reopened tasting finds every hold in place.
- **R5. A hold is kept for good when no reveal ever releases it.** That covers a removed glass, a deleted tasting, and a glass never revealed, whether its tasting was CLOSED or never closed.
  - Abandoned wines stay hidden (R2).
  - Pours stay masked, so for everyone but the owner the community counts (`catalog_wine_usage`, `catalog_wine_holdings`) and the shared cellar count those bottles as unopened, forever. This affects only bottles drawn at Start, or poured into a running flight, whose glass is then removed or whose tasting is then deleted.
  - The owner's own cellar is exact (H8). Deleting the emptied lot drops its phantom bottle from the counts, and deleting the consumption drops the hold.
  - That matches the never-revealed glass's own wine (20260919213300 R2). OD4 has the alternative.
- **R6. The adder cannot merge a public wine in their own unrevealed glass until the reveal** (the guard, D9). A hidden wine cannot be a merge target.
- **R7. An unrevealed glass keeps its answer key on a merged-away wine until its reveal.** One never revealed keeps it for good. Only its adder reads it.
- **R8. F8 timing.**
  - The owner sees the bottle leave at Start; others see it at the glass's reveal. A bottle poured into a glass that is then removed, or into a tasting that is then deleted, never leaves in their view (R5).
  - Every shared lot's `updated_at` reads as `created_at`.
  - An owner's own mid-tasting edit or delete of that lot still shows.
  - The probe cannot show `updated_at` masking in one transaction (`now()` is constant), so D2/D5 check only that the function reports `created_at`.
- **R9. After a tasting is deleted**, an unidentified row is readable only by its creator and by authors of notes naming it. Other people's notes on it show no wine.
- **R10. `catalog_wine_mark_blind` is dropped.** A pour never hides anything, so the "own lot naming a hidden wine" residual now arises only from born-hidden rows (R2, R3, F12), never from someone pouring a wine you hold.
- **R11. The creator's own hidden wine outside the add-wine search** (§6.6). The creator reads the row and the add-wine sheet lists it, but other surfaces still hide it from the creator too:
  - the header search (`global-search.tsx`);
  - the catalog page (`/catalog/[wineId]` answers 404 for any hidden wine);
  - the scan matcher's confident match (`server/match.ts`): a scan of that bottle offers "add by hand", whose identity match then returns the hidden row.

  So the creator's own lot or note on an abandoned wine links to a 404 until a glass that pours it is revealed. Showing a hidden wine to its creator on those surfaces is safe for the same reason as §6.6, but nothing in the review asked for it.

## 11. CLAUDE.md changes (the main session makes them)

**1. In "Rule 1 on catalog counts and a poured wine's record", replace the closing sentence.** The current sentence is:

> Pre-existing, still open (owner: fix next, 2026-09-19): a catalog-only public wine vanishing when poured (F4), the new-wine window (F5), client-writable `blind_pending` (F6), `merge_catalog_wines` (F7), PUBLIC-cellar draw-downs (F8), new reference rows (F9), an unidentified glass's identity in the all-readable `catalog_wines_unidentified` (F10), and an Edit, Swap or Remove plus re-add un-hiding the abandoned brand-new wine with its flight fill (F11).

The replacement is:

> F4-F8, F10 and F11 are closed by "Rule 1: born-hidden flight wines and holds" below; F9 (new reference rows) is an accepted owner decision.

**2. A new bullet under Domain rules, after that one:**

> - **Rule 1: born-hidden flight wines and holds** (migrations `20260919223100_rule1_born_hidden_and_shared_cellar.sql` and `20260919223200_rule1_older_leaks.sql`; spec `docs/superpowers/specs/2026-09-19-rule1-older-leaks.md`; order: 223100, then the app, then 223200). A catalog wine is hidden (`blind_pending`) only when it is born for a flight: the flight path (add, finish, Edit, Swap; never an OPEN board) sends `"hidden": true` to `find_or_create_catalog_wine` (`catalogWinePayload`/`flightWineBornHidden`, `src/lib/wine-identity/catalog-payload.ts`), which creates it hidden and returns an existing row unchanged. `catalog_wine_mark_blind` is gone: pouring, a Swap onto an existing wine, a merge or `resolve_unidentified_wine` never hides a public wine. `flight_holds` (internal, no client access) holds a hidden wine an unrevealed glass links, and a cellar bottle poured into one, to that glass. A held wine stays hidden after an Edit, Swap or Remove (`catalog_wine_unhide_if_free` is the only un-hide besides a reveal), and a held pour stays masked in `catalog_wine_masked_pours` (so in usage, holdings and shared cellars). Only a reveal releases a hold: that glass's, or, for a wine, the reveal of any glass that links it. A close or a delete releases nothing (`flight_holds.tasting_id`/`wine_id` are `on delete set null`; review round 1: releasing at a close or a delete published a wine no glass ever revealed, which stayed public when the host poured it again). So a brand-new wine whose glass is removed, or whose tasting is deleted, before its reveal stays hidden (its creator and curators read it, and `searchAddWine` still lists it for its creator, `searchShowsCatalogWine`) until a glass that pours it is revealed. Its pour stays masked for good (everyone but the owner counts that bottle as unopened; owner decision OD4). Never add a trigger on `tastings` that releases a hold. `catalog_wines`: `authenticated` INSERTs only the identity columns, `created_by` and `blind_pending`, and UPDATEs only the columns Manage wine, the fill, the price fill and the main photo write; `blind_pending`, `merged_into`, `created_by` and `id` are written only by the database, and `anon` writes nothing. `merge_catalog_wines` is `authenticated` + `service_role` only. It moves only revealed glasses' answer keys, and an unrevealed glass's key moves to `catalog_wine_merge_target` at its own reveal (before notes resolve). A hidden wine is never a target, with the same words as a missing one. The adder of an unrevealed glass of a public loser is refused by `catalog_wines_rule1_guard`. Someone else's cellar is read only through `shared_cellar_lots(owner)` (`getCellarBottles`' `readOnly` path): masked pours still in their lot, `updated_at` = `created_at`. "cellar own select" is the owner alone, so a new surface that shows another person's lots must use the function. `catalog_wines_unidentified` is read by its creator, by whoever can read an answer key naming it (`can_read_unidentified_wine`, SECURITY INVOKER over "wine_answers read"), and by the author of a note naming it; curators no longer read an unrevealed one, so the `/catalog/unidentified` queue lists revealed glasses' rows. Still open: F8b (`wines.added_via = 'CELLAR'` readable by participants), F9 (new reference rows are public at once; guessing needs them), and F12 (`catalog_wine_identity_match`/`find_or_create_catalog_wine` confirm an exact guessed identity of someone's hidden wine).

**3. In "A `blind_pending` catalog wine is readable only by those who may already see it", replace its last sentence.** The current sentence is:

> Accepted residual, by design: that second adder learns such a row exists (and cannot read it) without learning its details; a caller's own cellar lot or note naming a hidden catalog wine shows no details on it until a glass that links the wine is revealed or unlinked.

The replacement is:

> Accepted residual, understated before (spec 2026-09-19-rule1-older-leaks F12): the helper tells any caller whether a row with an exact identity exists, hidden or not, and a second adder who links it reads it, `created_by` included; a caller's own cellar lot or note naming a hidden catalog wine shows no details on it until a glass that links the wine is revealed (no longer "or unlinked": since 20260919223200 a wine abandoned before any reveal stays hidden until a glass that pours it is revealed; its creator still reads it).

## 12. File plan

**New:**

- `supabase/migrations/20260919223100_rule1_born_hidden_and_shared_cellar.sql` (Appendix C, verbatim).
- `supabase/migrations/20260919223200_rule1_older_leaks.sql` (Appendix D, verbatim).
- `src/lib/wine-identity/catalog-payload.ts` and `catalog-payload.test.ts` (§6.1, T1, T2).

**Changed:**

- `src/lib/wine-identity/server/write.ts` (§6.2).
- `src/app/tastings/[id]/wines/new/tasting-wine-writes.ts` (§6.2).
- `src/lib/cellar/bottles.ts` (§6.3).
- `src/lib/cellar/lot-sheet.ts` and `src/app/u/[id]/cellar/page.tsx` (comments only).
- `src/lib/supabase/database.types.ts` (§6.4).
- `src/components/add-wine/actions.ts`, `flight-knowledge.ts` and `flight-knowledge.test.ts` (§6.6, T5; review round 1).
- `scripts/cellar-social.test.mjs` and `scripts/wine-backbone.test.mjs` (T4).
- `CLAUDE.md`, by the main session (§11).

**Gitignored, already written:** `.superpowers/leaks2/probes/`, which holds:

- the two drafts;
- `rule1-older-leaks-probe.mjs`, `extra-probe.mjs`, `chain-dry.mjs`, `md5s.mjs`, `ro.mjs`, `review-probe.mjs`;
- `old-m2/`: the pre-review M2, for the comparison run in §7.2;
- the live definitions read (`live-defs-1.sql`, `live-defs-2.sql`);
- the probe outputs (`probe-output-5.txt` is Appendix A; `probe-output-old-m2.txt` is the comparison run).

## 13. Review round 1 (2026-09-19)

### 13.1 Major: a close or a delete published a wine no glass ever revealed (confirmed)

**The finding.** The first version of D16 released holds in two more places:

- `flight_holds_release_on_close`, when a tasting was CLOSED with every glass revealed. A removed glass's hold, with `wine_id` null, was released there.
- The `on delete cascade` from `flight_holds.tasting_id`, when a tasting was deleted.

Each release un-hid a brand-new wine that no glass had revealed. D2 no longer hides an existing wine, so when the host poured that wine again it stayed public for the whole of the next tasting.

**The reproduction** (`review-probe.mjs`, rolled back, live unchanged), for [N hidden, the guest Priya reads N, Priya reads N's un-hide audit row]:

- **R1.** A DRAFT tasting is deleted, and N is keyed into a new running tasting. Live gives `[true,0,0]`; the first version gave `[false,1,1]`.
- **R2.** N's glass is removed, the tasting is closed with every other glass revealed, and N is poured next time. Live gives `[true,0,0]`; the first version gave `[false,1,1]`.

A guest finds such a wine without knowing it. They filter `catalog_wines` by `created_by` = the host, then look for a `blind_pending` true→false audit row that no revealed glass explains (`catalog_wine_usage.appearance_count` 0). Both flows are normal: re-creating a tasting to fix its setup, and removing a bottle to pour it next time.

**The fix** (M2 as it stands now):

- `flight_holds.tasting_id` is nullable and `on delete set null`.
- `flight_holds_release_on_close` and its trigger are gone.
- The post-state asserts the four foreign-key actions and that `tastings` keeps exactly its four live triggers.
- **The rule:** only a reveal releases a hold (D16). An abandoned wine waits, hidden, for a glass that pours it, and that glass's reveal publishes it and releases the kept holds.
- Pour holds follow the same rule. The same two flows apply to a bottle from the host's cellar: a started tasting deleted to be set up again unmasks its pours at the delete. The alternative, pours released at a close or a delete, is owner option OD4.

**The evidence:**

- The review probe now gives `[true,0,0]` in both scenarios after the apply.
- The main probe adds H1-H8 and meets every EXPECT.
- The same probe fails 9 rows against the first version (§7.2).
- Chain dry: `CHAIN-DRY-OK` ×2.
- The extra probe: ALL EXPECTS MET.
- Body pins are unchanged: no function body changed, one function was dropped.

### 13.2 Minor: the adder's add-wine search lost their own abandoned wine (confirmed)

**The finding.** Once a glass was removed, or Edited or Swapped away, `searchAddWine` dropped the adder's own brand-new wine for as long as it stayed hidden, which is now until a glass that pours it is revealed. It dropped every `blind_pending` row, even one the caller created and can read (R3: live `[1,false]`, after `[1,true]`).

**The fix:** §6.6. `searchShowsCatalogWine` lists a hidden row only for its creator, in all three groups. It has a unit test (T5) and is pinned against the database by probe H4.

## Appendix A. The last probe run (`rule1-older-leaks-probe.mjs`, migration files, 2026-09-19, after review round 1; live with 0 unrevealed glasses)

```text
ok   before.A1   Priya reads Isabelle's catalog-only C before any pour => 1
ok   before.A2   C.blind_pending after Marcus pours it (F4) => true
ok   before.A3   Priya reads C after the pour (F4: it vanished) => 0
ok   before.A4   Isabelle (C's creator, not the adder) reads C.blind_pending => true
ok   before.A5   Priya's search_catalog_wines finds C while poured => 0
ok   before.A6   brand-new N.blind_pending before its glass exists (F5) => false
ok   before.A7   Priya reads N in the window before its answer key (F5) => 1
ok   before.A8   Marcus (creator) reads N in the window => 1
ok   before.A9   N after its answer key: blind_pending / Priya reads it => [true,0]
ok   before.A10  OPEN board: a new wine is public at once (Priya reads it) => [false,1]
ok   before.A11  a non-flight add (catalog, cellar, note) is public => false
ok   before.A12  a second adder of N's identity links the same row (no 23505) => true
ok   before.A13  N stays hidden with two unrevealed glasses => true
ok   before.A14  F12 residual: Diego reads N's creator (Marcus) through his own answer key => true
ok   before.B1   Isabelle hides her own public wine (blind_pending = true) => 1
ok   before.B2   Isabelle tombstones her own wine without a merge (merged_into) => 1
ok   before.B3   Sofia (curator) re-assigns created_by => 1
ok   before.B4   Isabelle's Manage wine columns (name, text, photo, alcohol, price) => 1
ok   before.B5   Sofia (curator) renames Isabelle's wine => 1
ok   before.B6   anon renames a wine => 0
ok   before.B7   Isabelle inserts a row directly with merged_into set => 1
ok   before.B8   Isabelle inserts a row directly with the identity columns only => 1
ok   before.B9   Marcus un-hides N (his own unrevealed glass) => {"error":"42501 This wine is in one of your flights that hasn't been revealed yet. Change it after the reveal."}
ok   before.C1   anon calls merge_catalog_wines => {"error":"P0001 not authorised to merge this catalog wine"}
ok   before.C2   Isabelle (L's creator, not the adder) merges L into Wn => "ok"
ok   before.C3   Marcus's unrevealed answer key after the merge => "Wn"
ok   before.C4   Wn after the merge: blind_pending / Priya reads it (F7: it vanished) => [true,0]
ok   before.C5   Isabelle reads Wn.blind_pending (her own winner) => true
ok   before.C6   Priya reads L's tombstone => true
ok   before.C7   Sofia (curator) merges X into Marcus's hidden N => "ok"
ok   before.C8   Sofia merges X2 into a wine that does not exist (same words as C7) => {"error":"P0001 winner catalog wine not found or already merged"}
ok   before.C9   Marcus merges public M, in his own unrevealed glass, into Wn2 => "ok"
ok   before.C10  Wn2 after C9: blind_pending => true
ok   before.C11  Sofia merges R (a note, a revealed OPEN glass) into Wn3: ok / note moved / answer moved => ["ok",true,true]
ok   before.C12  Isabelle merges an unpoured L2: the same outcome as C2 => "ok"
ok   before.D1   Priya reads Marcus's PUBLIC lot LM directly, before Start => [2]
ok   before.D2   Priya's shared view of LM before Start => {"error":"42883 function shared_cellar_lots(uuid) does not exist"}
ok   before.D3   Marcus presses Start (the D11 draw-down) => ["drawn","drawn"]
ok   before.D4   Priya reads LM directly after Start (F8: 2 -> 1) => [1]
ok   before.D5   Priya's shared view of LM after Start (masked) => {"error":"42883 function shared_cellar_lots(uuid) does not exist"}
ok   before.D6   the one-bottle lot LM1 after Start: Priya's direct read / shared view (quantity > 0) => [0,{"error":"42883 function shared_cellar_lots(uuid) does not exist"}]
ok   before.D7   Marcus reads his own lot (the owner's truth) => [1]
ok   before.D8   Diego's shared view of Marcus's cellar equals Priya's => true
ok   before.D9   FRIENDS cellar after Start: Priya direct / Priya shared / Isabelle (stranger) shared => [[1],{"error":"42883 function shared_cellar_lots(uuid) does not exist"},{"error":"42883 function shared_cellar_lots(uuid) does not exist"}]
ok   before.D10  PRIVATE cellar: Priya's direct / shared read of Isabelle's lot => [[],{"error":"42883 function shared_cellar_lots(uuid) does not exist"}]
ok   before.D11  anon calls shared_cellar_lots => {"error":"42883 function shared_cellar_lots(uuid) does not exist"}
ok   before.D12  Marcus edits his own public PM while it is in his unrevealed glass (F3 guard, unchanged) / Isabelle's P (not his: RLS, 0 rows) => [{"error":"42501 This wine is in one of your flights that hasn't been revealed yet. Change it after the reveal."},0]
ok   before.D13  Marcus's add-wine search finds P while he has poured it => 1
ok   before.D14  reveal G5, then Priya's shared view of LM (unmasked at the reveal) => ["revealed",{"error":"42883 function shared_cellar_lots(uuid) does not exist"}]
ok   before.E1   Priya reads the producer Marcus just created for a flight => 1
ok   before.E2   Priya's search_producers finds it => 1
ok   before.E3   Priya reads the grape Marcus just created => 1
ok   before.F1   Priya reads the unidentified row before its answer key (the window) => 1
ok   before.F2   Priya reads it with the glass unrevealed (F10) => 1
ok   before.F3   Priya finds it by created_by = Marcus => true
ok   before.F4   Marcus (creator, adder) reads it => 1
ok   before.F5   Sofia (curator, not a member) / Isabelle (outsider) read it => [1,1]
ok   before.F6   Priya reads the glass's answer key => 0
ok   before.F7   reveal G7, then Priya / Isabelle read the row => ["revealed",1,1]
ok   before.F8   Marcus Edits G8 from U2 to a catalog identity => 1
ok   before.F9   the abandoned U2: Priya / Marcus read it => [1,1]
ok   before.F10  BYO: Diego (contributor) / Marcus (host, not the adder) read Diego's unidentified row => [1,1]
ok   before.F11  after T4 is deleted: Priya (a note naming U) / Isabelle read U => [1,1]
ok   before.G1   the flight fill of hidden N4 after its answer key (fillFlightCatalogWine) => 1
ok   before.G2   Edit: Marcus re-points G10 from N4 to N5 => 1
ok   before.G3   N4 after the Edit: blind_pending / Priya reads it => [false,1]
ok   before.G4   Swap G11 to the public P, then N6: blind_pending / Priya reads it => [1,false,1]
ok   before.G5   Remove G12, then N7: blind_pending / Priya reads it => ["removed",false,1]
ok   before.G6   reveal G10 (now N5): N5 / N4 blind_pending, Priya reads N4 => ["revealed",false,false,1]
ok   before.G7   reveal G11 (now P): N6 blind_pending => ["revealed",false]
ok   before.G8   N7 (its glass removed) while G13 is unrevealed => false
ok   before.G9   reveal G13: N7b / N7 blind_pending (N7's glass was removed: only a glass that pours it can release it) => ["revealed",false,false]
ok   before.G10  Marcus closes T6 with every glass revealed: N7 / Priya reads N7 (a close releases nothing) => [1,false,1]
ok   before.G11  T7 closed with a glass never revealed: N9 (removed) / N8 (never revealed) => [1,false,true]
ok   before.G12  T8: N10 after an Edit / after Marcus deletes the tasting (N10, N11; a delete releases nothing) => [false,1,false,false]
ok   before.G13  Priya usage(Q) after Start (bottles, consumption) => [3,0]
ok   before.G14  Swap G17 to Q2: Priya usage(Q) / Priya's shared view of LS => [[2,1],{"error":"42883 function shared_cellar_lots(uuid) does not exist"}]
ok   before.G15  reveal G17 (now Q2): Priya usage(Q) => ["revealed",[2,1]]
ok   before.G16  Remove G18 after Start: Priya usage(Q3) => ["removed",[2,1]]
ok   before.G17  reveal G19: Priya usage(Q3) (still held: G18 was removed) => ["revealed",[2,1]]
ok   before.G18  close T10 (all revealed): Priya usage(Q3) (a close releases nothing: held for good) => [1,[2,1]]
ok   before.H1   Marcus deletes DRAFT TH1 holding brand-new NH: deleted / NH hidden / Priya reads NH => [1,false,1]
ok   before.H2   NH keyed into running TH2: same row / NH hidden / Priya reads NH / Priya reads an un-hide audit row of NH => [true,true,0,0]
ok   before.H3   Remove GS1: NS hidden / Priya reads NS / holds on NS => ["removed",false,1,null]
ok   before.H4   R3: Marcus's search_catalog_wines finds NS (found, blind_pending) and the add-wine search keeps it (searchShowsCatalogWine: public or his own) / Priya's search finds NS => [[1,false,true],1]
ok   before.H5   reveal GS2 and close TH3 (every glass revealed): NS hidden / Priya reads NS => ["revealed",1,false,1]
ok   before.H6   NS poured in running TH4: same row / NS hidden / Priya reads NS / Priya reads an un-hide audit row of NS => [true,true,0,0]
ok   before.H7   reveal GS4 (the glass that pours it publishes it): NS hidden / Priya reads NS / holds on NS => ["revealed",false,1,null]
ok   before.H8   Marcus deletes started TH5 (a pour of LQ4): deleted / Priya usage(Q4) / Priya's shared view of LQ4 / Marcus's own LQ4 => [1,[2,1],{"error":"42883 function shared_cellar_lots(uuid) does not exist"},[1]]
ok   before.C13  reveal G3: its answer key / Wn blind_pending / Priya reads Wn => ["revealed",true,false,1]
      I messages: ["passed","passed","authenticated UPDATE columns on catalog_wines are alcohol_percent,appellation_id,blind_pending,colour,country_id,description,estimated_price,estimated_price_currency,image_url,primary_grape_id,producer_id,region_id,secondary_grape_id,style,type_designation_id,vintage_kind,vintage_tawny_years,vintage_year,wine_name","triggers post-migration are flight_holds.flight_holds_after_delete 9 O flight_holds_after_delete(); tastings.tastings_lock_setup_after_start 19 O tastings_lock_setup_after_start(); tastings.tastings_pause_follows_status 23 O tastings_pause_follows_status(); tastings.tastings_pointer_in_tasting 23 O tastings_pointer_in_tasting(); tastings.tastings_stamp_lifecycle 23 O tastings_stamp_lifecycle(); wine_answers.trg_catalog_wine_unmark_blind_on_unlink 25 O catalog_wine_unmark_blind_on_unlink(); wine_answers.trg_wine_answers_clear_identity_draft 5 O wine_answers_clear_identity_draft(); wine_pour_intents.flight_holds_on_pour 21 O flight_holds_on_pour(); wines.semi_blind_release_revealed_wine 17 O semi_blind_release_revealed_wine(); wines.trg_catalog_wine_unmark_blind 17 O catalog_wine_unmark_blind(); wines.wines_drop_unresolved_notes 11 O wines_drop_unresolved_notes(); wines.wines_full_reveal_step 19 O wines_full_reveal_step(); wines.wines_pin_adder 23 O wines_pin_adder(); wines.wines_refuse_reveal_while_paused 19 O wines_refuse_reveal_while_paused(); wines.wines_semi_blind_flight_locked 7 O wines_semi_blind_flight_locked(); wines.wines_stamp_revealed_at 23 O wines_stamp_revealed_at(); wines.wset_notes_resolve_on_reveal 17 O wset_notes_resolve_on_reveal()","public.catalog_wine_unhide_if_free(uuid) body is not the one this migration was written with (md5 08cc637a177083246c929579bf840d81)","public.merge_catalog_wines(uuid,uuid) EXECUTE is held by OWNER,anon,authenticated,service_role, expected OWNER,authenticated,service_role","flight_holds or wine_answers_unidentified_wine_id_idx already exists; re-read live before applying","shared_cellar_lots(uuid) already exists; re-read live before applying","flight_holds foreign keys are catalog_wine_id c, consumption_id c, tasting_id c, wine_id n; tasting_id and wine_id must be nullable and set null on delete"]
ok   after .I1   post-states pass as applied; M2's raises on each tamper (incl. a tasting delete cascading holds); both pre-states refuse a second apply => ["passed","passed",true,true,true,true,true,true,true]
ok   after .A1   Priya reads Isabelle's catalog-only C before any pour => 1
ok   after .A2   C.blind_pending after Marcus pours it (F4) => false
ok   after .A3   Priya reads C after the pour (F4: it vanished) => 1
ok   after .A4   Isabelle (C's creator, not the adder) reads C.blind_pending => false
ok   after .A5   Priya's search_catalog_wines finds C while poured => 1
ok   after .A6   brand-new N.blind_pending before its glass exists (F5) => true
ok   after .A7   Priya reads N in the window before its answer key (F5) => 0
ok   after .A8   Marcus (creator) reads N in the window => 1
ok   after .A9   N after its answer key: blind_pending / Priya reads it => [true,0]
ok   after .A10  OPEN board: a new wine is public at once (Priya reads it) => [false,1]
ok   after .A11  a non-flight add (catalog, cellar, note) is public => false
ok   after .A12  a second adder of N's identity links the same row (no 23505) => true
ok   after .A13  N stays hidden with two unrevealed glasses => true
ok   after .A14  F12 residual: Diego reads N's creator (Marcus) through his own answer key => true
ok   after .B1   Isabelle hides her own public wine (blind_pending = true) => {"error":"42501 permission denied for table catalog_wines"}
ok   after .B2   Isabelle tombstones her own wine without a merge (merged_into) => {"error":"42501 permission denied for table catalog_wines"}
ok   after .B3   Sofia (curator) re-assigns created_by => {"error":"42501 permission denied for table catalog_wines"}
ok   after .B4   Isabelle's Manage wine columns (name, text, photo, alcohol, price) => 1
ok   after .B5   Sofia (curator) renames Isabelle's wine => 1
ok   after .B6   anon renames a wine => {"error":"42501 permission denied for table catalog_wines"}
ok   after .B7   Isabelle inserts a row directly with merged_into set => {"error":"42501 permission denied for table catalog_wines"}
ok   after .B8   Isabelle inserts a row directly with the identity columns only => 1
ok   after .B9   Marcus un-hides N (his own unrevealed glass) => {"error":"42501 permission denied for table catalog_wines"}
ok   after .C1   anon calls merge_catalog_wines => {"error":"42501 permission denied for function merge_catalog_wines"}
ok   after .C2   Isabelle (L's creator, not the adder) merges L into Wn => "ok"
ok   after .C3   Marcus's unrevealed answer key after the merge => "L"
ok   after .C4   Wn after the merge: blind_pending / Priya reads it (F7: it vanished) => [false,1]
ok   after .C5   Isabelle reads Wn.blind_pending (her own winner) => false
ok   after .C6   Priya reads L's tombstone => true
ok   after .C7   Sofia (curator) merges X into Marcus's hidden N => {"error":"P0001 winner catalog wine not found or already merged"}
ok   after .C8   Sofia merges X2 into a wine that does not exist (same words as C7) => {"error":"P0001 winner catalog wine not found or already merged"}
ok   after .C9   Marcus merges public M, in his own unrevealed glass, into Wn2 => {"error":"42501 This wine is in one of your flights that hasn't been revealed yet. Change it after the reveal."}
ok   after .C10  Wn2 after C9: blind_pending => false
ok   after .C11  Sofia merges R (a note, a revealed OPEN glass) into Wn3: ok / note moved / answer moved => ["ok",true,true]
ok   after .C12  Isabelle merges an unpoured L2: the same outcome as C2 => "ok"
ok   after .D1   Priya reads Marcus's PUBLIC lot LM directly, before Start => []
ok   after .D2   Priya's shared view of LM before Start => [[2,true]]
ok   after .D3   Marcus presses Start (the D11 draw-down) => ["drawn","drawn"]
ok   after .D4   Priya reads LM directly after Start (F8: 2 -> 1) => []
ok   after .D5   Priya's shared view of LM after Start (masked) => [[2,true]]
ok   after .D6   the one-bottle lot LM1 after Start: Priya's direct read / shared view (quantity > 0) => [0,[[1,true]]]
ok   after .D7   Marcus reads his own lot (the owner's truth) => [1]
ok   after .D8   Diego's shared view of Marcus's cellar equals Priya's => true
ok   after .D9   FRIENDS cellar after Start: Priya direct / Priya shared / Isabelle (stranger) shared => [[],[[2,true]],[]]
ok   after .D10  PRIVATE cellar: Priya's direct / shared read of Isabelle's lot => [[],[]]
ok   after .D11  anon calls shared_cellar_lots => {"error":"42501 permission denied for function shared_cellar_lots"}
ok   after .D12  Marcus edits his own public PM while it is in his unrevealed glass (F3 guard, unchanged) / Isabelle's P (not his: RLS, 0 rows) => [{"error":"42501 This wine is in one of your flights that hasn't been revealed yet. Change it after the reveal."},0]
ok   after .D13  Marcus's add-wine search finds P while he has poured it => 1
ok   after .D14  reveal G5, then Priya's shared view of LM (unmasked at the reveal) => ["revealed",[[1,true]]]
ok   after .E1   Priya reads the producer Marcus just created for a flight => 1
ok   after .E2   Priya's search_producers finds it => 1
ok   after .E3   Priya reads the grape Marcus just created => 1
ok   after .F1   Priya reads the unidentified row before its answer key (the window) => 0
ok   after .F2   Priya reads it with the glass unrevealed (F10) => 0
ok   after .F3   Priya finds it by created_by = Marcus => false
ok   after .F4   Marcus (creator, adder) reads it => 1
ok   after .F5   Sofia (curator, not a member) / Isabelle (outsider) read it => [0,0]
ok   after .F6   Priya reads the glass's answer key => 0
ok   after .F7   reveal G7, then Priya / Isabelle read the row => ["revealed",1,1]
ok   after .F8   Marcus Edits G8 from U2 to a catalog identity => 1
ok   after .F9   the abandoned U2: Priya / Marcus read it => [0,1]
ok   after .F10  BYO: Diego (contributor) / Marcus (host, not the adder) read Diego's unidentified row => [1,0]
ok   after .F11  after T4 is deleted: Priya (a note naming U) / Isabelle read U => [1,0]
ok   after .G1   the flight fill of hidden N4 after its answer key (fillFlightCatalogWine) => 1
ok   after .G2   Edit: Marcus re-points G10 from N4 to N5 => 1
ok   after .G3   N4 after the Edit: blind_pending / Priya reads it => [true,0]
ok   after .G4   Swap G11 to the public P, then N6: blind_pending / Priya reads it => [1,true,0]
ok   after .G5   Remove G12, then N7: blind_pending / Priya reads it => ["removed",true,0]
ok   after .G6   reveal G10 (now N5): N5 / N4 blind_pending, Priya reads N4 => ["revealed",false,false,1]
ok   after .G7   reveal G11 (now P): N6 blind_pending => ["revealed",false]
ok   after .G8   N7 (its glass removed) while G13 is unrevealed => true
ok   after .G9   reveal G13: N7b / N7 blind_pending (N7's glass was removed: only a glass that pours it can release it) => ["revealed",false,true]
ok   after .G10  Marcus closes T6 with every glass revealed: N7 / Priya reads N7 (a close releases nothing) => [1,true,0]
ok   after .G11  T7 closed with a glass never revealed: N9 (removed) / N8 (never revealed) => [1,true,true]
ok   after .G12  T8: N10 after an Edit / after Marcus deletes the tasting (N10, N11; a delete releases nothing) => [true,1,true,true]
ok   after .G13  Priya usage(Q) after Start (bottles, consumption) => [3,0]
ok   after .G14  Swap G17 to Q2: Priya usage(Q) / Priya's shared view of LS => [[3,0],[[2,true]]]
ok   after .G15  reveal G17 (now Q2): Priya usage(Q) => ["revealed",[2,1]]
ok   after .G16  Remove G18 after Start: Priya usage(Q3) => ["removed",[3,0]]
ok   after .G17  reveal G19: Priya usage(Q3) (still held: G18 was removed) => ["revealed",[3,0]]
ok   after .G18  close T10 (all revealed): Priya usage(Q3) (a close releases nothing: held for good) => [1,[3,0]]
ok   after .H1   Marcus deletes DRAFT TH1 holding brand-new NH: deleted / NH hidden / Priya reads NH => [1,true,0]
ok   after .H2   NH keyed into running TH2: same row / NH hidden / Priya reads NH / Priya reads an un-hide audit row of NH => [true,true,0,0]
ok   after .H3   Remove GS1: NS hidden / Priya reads NS / holds on NS => ["removed",true,0,1]
ok   after .H4   R3: Marcus's search_catalog_wines finds NS (found, blind_pending) and the add-wine search keeps it (searchShowsCatalogWine: public or his own) / Priya's search finds NS => [[1,true,true],0]
ok   after .H5   reveal GS2 and close TH3 (every glass revealed): NS hidden / Priya reads NS => ["revealed",1,true,0]
ok   after .H6   NS poured in running TH4: same row / NS hidden / Priya reads NS / Priya reads an un-hide audit row of NS => [true,true,0,0]
ok   after .H7   reveal GS4 (the glass that pours it publishes it): NS hidden / Priya reads NS / holds on NS => ["revealed",false,1,0]
ok   after .H8   Marcus deletes started TH5 (a pour of LQ4): deleted / Priya usage(Q4) / Priya's shared view of LQ4 / Marcus's own LQ4 => [1,[3,0],[[2,true]],[1]]
ok   after .C13  reveal G3: its answer key / Wn blind_pending / Priya reads Wn => ["revealed",true,false,1]
ok   live unchanged after both phases: {"cw":122,"u":0,"w":19,"wa":19,"l":90,"c":8,"i":0,"e":593,"t":7,"tp":22,"f":44,"n":15,"pr":33772,"g":276,"sm":524,"cwmd5":"bdd923abe128bc69a2d872b186d79a0d","lotmd5":"7373890ff1cd9d20d20675555bfdcf17","procs":"55e82b1f5b07f5966716aa2a7a134553","policies":"7690931868258414e4613a7e053c24b1","triggers":60,"cwacl":"46875263bd6598c4534e2df7d1847a5e"}
ALL EXPECTS MET
```

## Appendix B. The extra probe run (`extra-probe.mjs`, 2026-09-19)

```text
ok   X1a merges L -> W1 -> W2 by Isabelle => ["ok","ok"]
ok   X1b G still on L before its reveal => true
ok   X1c after G's reveal: its answer key is W2 / Priya's note resolved to W2 => [true,true]
ok   X2 a hidden flight add of an existing public identity: same id / still public => [true,false]
ok   X3 Marcus resolves his unrevealed glass's unidentified row into Target: ok / Target public / Priya reads the row => ["ok",false,0]
ok   live unchanged {"cw":122,"w":19,"n":15,"sm":524,"procs":"55e82b1f5b07f5966716aa2a7a134553"}
ALL EXPECTS MET
```

## Appendix C. `supabase/migrations/20260919223100_rule1_born_hidden_and_shared_cellar.sql`

Copy verbatim (dry-run clean; body md5s pinned in its post-state).

```sql
-- rule1_born_hidden_and_shared_cellar: the additive half of the fix for the
-- older rule-1 leaks F5 and F8 (docs/superpowers/specs/2026-09-19-rule1-older-leaks.md;
-- the findings are §9 of docs/superpowers/specs/2026-09-19-rule1-usage-and-main-photo.md).
--
-- Spec: docs/superpowers/specs/2026-09-19-rule1-older-leaks.md (§5 is the SQL
-- design this file implements, verbatim between the banners).
--
-- Written against the LIVE state (read-only queries, 2026-09-19):
-- * 20260919214700 (label_lookups) is the newest live version; no row for
--   20260919223100 or 20260919223200 (live, origin/master or any worktree).
-- * find_or_create_catalog_wine(jsonb) is SECURITY INVOKER, EXECUTE for
--   PUBLIC, anon, authenticated and service_role; it inserts every new row
--   with blind_pending = false (the column default). A brand-new flight wine is
--   hidden only later, by catalog_wine_mark_blind at the answer-key insert,
--   a separate PostgREST request (F5: public for one round trip).
-- * cellar_lots "cellar own select" is owner_id = auth.uid() or
--   can_view_cellar(owner_id): a PUBLIC or FRIENDS cellar's lot rows, and the
--   quantity D11 draws down at Start, are read directly by its viewers (F8).
--   catalog_wine_masked_pours (20260919213300) already names every bottle
--   poured into a glass that is not revealed yet.
--
-- What this migration does (nothing a deployed app calls changes behaviour):
-- 1. find_or_create_catalog_wine honours an optional payload key "hidden":
--    a row it CREATES with "hidden": true is born blind_pending. A row it
--    finds is returned as it is. The deployed app never sends the key, so
--    nothing changes until the app that does is deployed (spec §6.1).
-- 2. shared_cellar_lots(p_owner): the owner's lots as someone else may see
--    them. It is gated like "cellar own select" (the owner, or
--    can_view_cellar), and every bottle poured into a glass that is not
--    revealed yet still counts as in its lot (catalog_wine_masked_pours);
--    updated_at reads as created_at, since a pour stamps it. Nothing is
--    narrowed here: 20260919223200 narrows "cellar own select" to the owner
--    once the app reads other people's cellars through this function.
--
-- Deploy order (spec §8): this file, then the app, then 20260919223200.
--
-- No begin/commit: the applier owns the transaction.

set local lock_timeout = '10s';

-- ---------------------------------------------------------------------------
-- Pre-state: fail closed unless live is what this file was written against.
-- ---------------------------------------------------------------------------
do $$
declare
  v_text text;
begin
  -- 1. The rule-1 counts migration (whose catalog_wine_masked_pours this file
  --    reads) is live.
  if not exists (select 1 from supabase_migrations.schema_migrations where version = '20260919213300') then
    raise exception '20260919213300 (rule1_usage_and_main_photo) is not applied; apply it first';
  end if;

  -- 2. Nothing this migration creates exists yet.
  if to_regprocedure('public.shared_cellar_lots(uuid)') is not null then
    raise exception 'shared_cellar_lots(uuid) already exists; re-read live before applying';
  end if;

  -- 3. The body replaced, and every body this file relies on, are the live
  --    ones (md5 of prosrc with any CR stripped):
  --    * find_or_create_catalog_wine: replaced here;
  --    * catalog_wine_identity_match: the lookup it keeps calling;
  --    * catalog_wine_masked_pours: what shared_cellar_lots masks;
  --    * can_view_cellar: the gate shared_cellar_lots applies;
  --    * catalog_wine_mark_blind: until 20260919223200 it still hides a
  --      linked row at the answer insert, and never un-hides one.
  select string_agg(format('%s %s', s.sig, coalesce(md5(replace(p.prosrc, chr(13), '')), 'missing')), '; ')
    into v_text
  from (values
    ('public.find_or_create_catalog_wine(jsonb)', '2cf9598f9b8640e6ef7bcfc4e30e82fb'),
    ('public.catalog_wine_identity_match(jsonb)', '763eb9a53dcb0ebb4dbeaf0c92073f35'),
    ('public.catalog_wine_masked_pours(uuid[])', '7e2054d9001878a17672aedd11d7bfcb'),
    ('public.can_view_cellar(uuid)', '3af2e51e338dc43cc48b58f061049ec2'),
    ('public.catalog_wine_mark_blind()', '08dc5499a57fda78eda6e6ac31ac9f9d')
  ) as s (sig, md5)
  left join pg_proc p on p.oid = to_regprocedure(s.sig)
  where p.oid is null or md5(replace(p.prosrc, chr(13), '')) <> s.md5;
  if v_text is not null then
    raise exception 'live function bodies differ from the ones this file was written against: %', v_text;
  end if;

  -- 4. find_or_create_catalog_wine: SECURITY INVOKER, volatile, plpgsql,
  --    search_path=public, EXECUTE for PUBLIC, anon, authenticated and
  --    service_role (create or replace keeps all of it).
  select format('%s %s %s %s', p.prosecdef, p.provolatile, p.proconfig::text,
                (select string_agg(x.g, ',' order by x.g collate "C")
                   from (select distinct case when a.grantee = 0 then 'PUBLIC'
                                              when a.grantee = p.proowner then 'OWNER'
                                              else pg_get_userbyid(a.grantee)::text end as g
                           from aclexplode(p.proacl) a where a.privilege_type = 'EXECUTE') x))
    into v_text
  from pg_proc p
  where p.oid = to_regprocedure('public.find_or_create_catalog_wine(jsonb)');
  if v_text is distinct from 'f v {search_path=public} OWNER,PUBLIC,anon,authenticated,service_role' then
    raise exception 'find_or_create_catalog_wine attributes or EXECUTE grantees differ from live: %', v_text;
  end if;

  -- 5. The columns the new bodies read or write.
  select string_agg(s.tbl || '.' || s.col, ', ') into v_text
  from (values
    ('catalog_wines', 'blind_pending'), ('catalog_wines', 'created_by'),
    ('cellar_lots', 'id'), ('cellar_lots', 'owner_id'), ('cellar_lots', 'catalog_wine_id'),
    ('cellar_lots', 'quantity'), ('cellar_lots', 'created_at'), ('cellar_lots', 'updated_at')
  ) as s (tbl, col)
  where not exists (select 1 from pg_attribute a
                    where a.attrelid = to_regclass('public.' || s.tbl) and a.attname = s.col and not a.attisdropped);
  if v_text is not null then
    raise exception 'columns this migration reads are missing: %', v_text;
  end if;
end $$;

-- ===========================================================================
-- BEGIN SPEC §5.1 SQL
-- ===========================================================================

-- F5: a wine created for a flight is born hidden. The flight path sends
-- "hidden": true (never for an OPEN board, whose glasses are revealed at
-- insert); every other caller sends nothing and gets a public row. A row that
-- already exists is returned unchanged, hidden or not (F4: a public wine is
-- never hidden because someone pours it).
create or replace function find_or_create_catalog_wine(p jsonb)
returns uuid
language plpgsql
set search_path = public
as $$
declare v_id uuid;
begin
  v_id := public.catalog_wine_identity_match(p);
  if v_id is not null then return v_id; end if;

  insert into catalog_wines (
    country_id, region_id, appellation_id, primary_grape_id, secondary_grape_id,
    producer_id, type_designation_id, vintage_kind, vintage_year, vintage_tawny_years,
    colour, style, wine_name, created_by, blind_pending
  ) values (
    (p->>'country_id')::uuid, (p->>'region_id')::uuid, (p->>'appellation_id')::uuid,
    (p->>'primary_grape_id')::uuid, (p->>'secondary_grape_id')::uuid,
    (p->>'producer_id')::uuid, (p->>'type_designation_id')::uuid,
    (p->>'vintage_kind')::vintage_kind, (p->>'vintage_year')::int, (p->>'vintage_tawny_years')::int,
    (p->>'colour')::wine_colour, (p->>'style')::wine_style,
    nullif(btrim(p->>'wine_name'), ''), auth.uid(),
    coalesce((p->>'hidden')::boolean, false)
  ) returning id into v_id;
  return v_id;
end $$;

-- F8: someone's cellar as another person may see it. Gated like "cellar own
-- select" (the owner, or can_view_cellar). A bottle poured into a glass that is
-- not revealed yet (catalog_wine_masked_pours) still counts in its lot, and
-- updated_at reads as created_at for every lot, so neither a quantity nor a
-- timestamp moves when the host pours at Start. Returns cellar_lots rows so
-- PostgREST can embed the catalog wine exactly as a direct read does.
create function shared_cellar_lots(p_owner uuid)
returns setof cellar_lots
language sql
stable
security definer
set search_path = public
as $$
  with lots as (
    select l.*
      from cellar_lots l
     where l.owner_id = p_owner
       and (p_owner = auth.uid() or can_view_cellar(p_owner))
  ),
  masked as (
    select m.lot_id, sum(m.quantity)::int as quantity
      from catalog_wine_masked_pours(array(select distinct lots.catalog_wine_id from lots)) m
     group by m.lot_id
  )
  select (jsonb_populate_record(null::cellar_lots,
            to_jsonb(lots) || jsonb_build_object(
              'quantity', lots.quantity + coalesce(masked.quantity, 0),
              'updated_at', lots.created_at))).*
    from lots
    left join masked on masked.lot_id = lots.id;
$$;

revoke execute on function shared_cellar_lots(uuid) from public, anon;
grant execute on function shared_cellar_lots(uuid) to authenticated, service_role;

-- ===========================================================================
-- END SPEC §5.1 SQL
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Post-state, same transaction: every check a raise exception.
-- ---------------------------------------------------------------------------
do $$
declare
  v_fn record;
  v_owner record;
  v_claims text := current_setting('request.jwt.claims', true);
  v_n int;
begin
  -- 1. The two functions: security, search_path, volatility, language, return
  --    type, set-returning, arguments, body and the roles holding EXECUTE.
  for v_fn in
    select s.sig, s.secdef, s.config, s.volatile, s.lang, s.rettype, s.retset, s.args, s.body_md5, s.grantees,
           p.oid, p.prosecdef, p.proconfig::text as config_now, p.provolatile::text as volatile_now,
           l.lanname, format_type(p.prorettype, null) as rettype_now, p.proretset,
           pg_get_function_identity_arguments(p.oid) as args_now,
           md5(replace(p.prosrc, chr(13), '')) as md5_now,
           (select string_agg(x.g, ',' order by x.g collate "C")
            from (select distinct case when a.grantee = 0 then 'PUBLIC'
                                       when a.grantee = p.proowner then 'OWNER'
                                       else pg_get_userbyid(a.grantee)::text end as g
                  from aclexplode(p.proacl) a
                  where a.privilege_type = 'EXECUTE') x) as grantees_now
    from (values
      ('public.find_or_create_catalog_wine(jsonb)', false, '{search_path=public}', 'v', 'plpgsql', 'uuid', false,
       'p jsonb', '0e9e2f1142635473eb916125611ed7ef', 'OWNER,PUBLIC,anon,authenticated,service_role'),
      ('public.shared_cellar_lots(uuid)', true, '{search_path=public}', 's', 'sql', 'cellar_lots', true,
       'p_owner uuid', 'c3da48f21c077f0a349e5d88e55b0ff7', 'OWNER,authenticated,service_role')
    ) as s (sig, secdef, config, volatile, lang, rettype, retset, args, body_md5, grantees)
    left join pg_proc p on p.oid = to_regprocedure(s.sig)
    left join pg_language l on l.oid = p.prolang
  loop
    if v_fn.oid is null then
      raise exception '% does not exist post-migration', v_fn.sig;
    end if;
    if v_fn.prosecdef is distinct from v_fn.secdef
       or v_fn.config_now is distinct from v_fn.config
       or v_fn.volatile_now is distinct from v_fn.volatile
       or v_fn.lanname is distinct from v_fn.lang
       or v_fn.rettype_now is distinct from v_fn.rettype
       or v_fn.proretset is distinct from v_fn.retset
       or v_fn.args_now is distinct from v_fn.args then
      raise exception '% attributes differ: security definer %, config %, volatility %, language %, returns % (set %), arguments (%)',
        v_fn.sig, v_fn.prosecdef, v_fn.config_now, v_fn.volatile_now, v_fn.lanname, v_fn.rettype_now,
        v_fn.proretset, v_fn.args_now;
    end if;
    if v_fn.md5_now is distinct from v_fn.body_md5 then
      raise exception '% body is not the one this migration was written with (md5 %)', v_fn.sig, v_fn.md5_now;
    end if;
    if v_fn.grantees_now is distinct from v_fn.grantees then
      raise exception '% EXECUTE is held by %, expected %', v_fn.sig, v_fn.grantees_now, v_fn.grantees;
    end if;
  end loop;

  -- 2. What each role can call.
  if not has_function_privilege('authenticated', 'public.shared_cellar_lots(uuid)', 'EXECUTE')
     or has_function_privilege('anon', 'public.shared_cellar_lots(uuid)', 'EXECUTE') then
    raise exception 'shared_cellar_lots EXECUTE is not authenticated + service_role only';
  end if;

  -- 3. Where nothing is poured, the shared view is the owner's own truth: for
  --    every owner (read as that owner), exactly their lots, the same
  --    quantities for every lot with no masked pour, and updated_at = created_at.
  for v_owner in select distinct owner_id from cellar_lots loop
    perform set_config('request.jwt.claims', json_build_object('sub', v_owner.owner_id, 'role', 'authenticated')::text, true);
    select count(*) into v_n
    from (
      (select s.id, s.quantity, s.updated_at from shared_cellar_lots(v_owner.owner_id) s
        where not exists (select 1 from catalog_wine_masked_pours(array[s.catalog_wine_id]) m where m.lot_id = s.id))
      except
      (select l.id, l.quantity, l.created_at from cellar_lots l where l.owner_id = v_owner.owner_id)
    ) d;
    if v_n > 0 then
      raise exception 'shared_cellar_lots differs from cellar_lots for owner % on % lots', v_owner.owner_id, v_n;
    end if;
    select count(*) into v_n
    from cellar_lots l
    where l.owner_id = v_owner.owner_id
      and not exists (select 1 from shared_cellar_lots(v_owner.owner_id) s where s.id = l.id);
    if v_n > 0 then
      raise exception 'shared_cellar_lots leaves out % lots of owner %', v_n, v_owner.owner_id;
    end if;
  end loop;
  perform set_config('request.jwt.claims', coalesce(v_claims, ''), true);
end $$;
```

## Appendix D. `supabase/migrations/20260919223200_rule1_older_leaks.sql`

Copy verbatim (chain-dry clean after Appendix C; body md5s pinned in its post-state).

```sql
-- rule1_older_leaks: closes the pre-existing rule-1 leaks F4, F6, F7, F8, F10
-- and F11 (§9 of docs/superpowers/specs/2026-09-19-rule1-usage-and-main-photo.md),
-- on top of 20260919223100 (born-hidden flight wines, F5; the shared cellar read).
--
-- Spec: docs/superpowers/specs/2026-09-19-rule1-older-leaks.md (§5.2 is the SQL
-- design this file implements, verbatim between the banners).
--
-- Written against the LIVE state (read-only queries, 2026-09-19), with
-- 20260919223100 applied on top:
-- * catalog_wine_mark_blind (AFTER INSERT OR UPDATE OF catalog_wine_id on
--   wine_answers) hides ANY linked wine with no lot, note or revealed glass,
--   so a public catalog-only wine vanishes the moment a host pours it (F4).
-- * catalog_wine_unmark_blind_on_unlink un-hides the wine a glass stops
--   linking as soon as no unrevealed glass links it: an Edit, a Swap or a
--   Remove plus a re-add publishes the abandoned brand-new wine, a near-copy of
--   the one now in the glass, mid-tasting (F11). catalog_wine_masked_pours
--   masks a pour only while an intent still links it, so the same Swap or
--   Remove unmasks the pre-swap wine's counts (F11, spec R3 of 20260919213300).
-- * authenticated (and anon) hold table-level INSERT and UPDATE on
--   catalog_wines: blind_pending, merged_into, created_by, id are
--   client-writable (F6).
-- * merge_catalog_wines is EXECUTE for PUBLIC and anon, and moves every answer
--   key of the loser, other people's unrevealed glasses included, onto the
--   winner (F7).
-- * "cellar own select" is owner_id = auth.uid() or can_view_cellar(owner_id):
--   a PUBLIC or FRIENDS cellar's lot quantity visibly drops at Start (F8).
-- * "unidentified read" on catalog_wines_unidentified is true for every
--   signed-in user: an unidentified flight glass's identity is public (F10).
--
-- What this migration does:
-- F4.  catalog_wine_mark_blind is dropped. A wine is hidden only when it is
--      born for a flight (20260919223100); a wine that already exists is
--      never hidden because someone pours it.
-- F11. flight_holds: a hidden wine linked by an unrevealed glass, and a bottle
--      poured into one, is held to that glass. A held wine stays hidden after
--      an Edit, Swap or Remove, and a held pour stays masked, until a reveal
--      releases the hold: the reveal of that glass or, for a wine, of any
--      glass that links it. Nothing else releases a hold. A removed glass, a
--      deleted tasting, or a tasting CLOSED with a glass never revealed keeps
--      its holds for good, so a wine abandoned before any reveal stays hidden
--      (its creator and curators read it) until a later glass that pours it
--      is revealed.
-- F6.  authenticated keeps INSERT and UPDATE on the catalog_wines columns the
--      app writes, and nothing else; anon keeps neither.
-- F7.  merge_catalog_wines: EXECUTE for authenticated and service_role only;
--      an unrevealed glass keeps its answer key until its own reveal moves it
--      to the winner; a hidden wine is never a merge target.
-- F8.  "cellar own select" is the owner only; everyone else reads a cellar
--      through shared_cellar_lots (masked pours).
-- F10. "unidentified read" admits the row's creator and whoever can read an
--      answer key naming it (or their own note naming it).
--
-- Rule 1: nothing here answers differently for anyone depending on whether
-- someone else poured a wine; the one refusal added (a merge by the adder of
-- an unrevealed glass of a public loser) is catalog_wines_rule1_guard's, and
-- depends only on the caller's own glasses.
--
-- Deploy order (spec §8): 20260919223100, then the app, then this file. The
-- app sends "hidden" for flight wines and reads other cellars through
-- shared_cellar_lots; applied before that app, brand-new flight wines would be
-- born public and stay public, and friends' cellars would read empty.
--
-- No begin/commit: the applier owns the transaction.

set local lock_timeout = '10s';

-- ---------------------------------------------------------------------------
-- Pre-state: fail closed unless live is what this file was written against.
-- ---------------------------------------------------------------------------
do $$
declare
  v_text text;
begin
  -- 1. 20260919223100 is applied (its two bodies are pinned in 3).
  if not exists (select 1 from supabase_migrations.schema_migrations where version = '20260919223100') then
    raise exception '20260919223100 (rule1_born_hidden_and_shared_cellar) is not applied; apply it, then deploy the app, first';
  end if;

  -- 2. Nothing this migration creates exists yet.
  if to_regclass('public.flight_holds') is not null
     or to_regclass('public.wine_answers_unidentified_wine_id_idx') is not null then
    raise exception 'flight_holds or wine_answers_unidentified_wine_id_idx already exists; re-read live before applying';
  end if;
  select string_agg(p.oid::regprocedure::text, ', ') into v_text
  from pg_proc p
  where p.pronamespace = 'public'::regnamespace
    and p.proname in ('catalog_wine_unhide_if_free', 'catalog_wine_merge_target', 'flight_holds_on_link',
                      'flight_holds_on_pour', 'flight_holds_after_delete', 'can_read_unidentified_wine');
  if v_text is not null then
    raise exception 'a function this migration creates already exists: %', v_text;
  end if;

  -- 3. Every body replaced, dropped or relied on is the live one (md5 of
  --    prosrc with any CR stripped):
  --    * mark (dropped), unmark and unmark-on-unlink, masked pours and merge:
  --      replaced here;
  --    * find_or_create (born hidden) and shared_cellar_lots: 20260919223100;
  --    * the pour pair: each sets wine_pour_intents.cellar_consumption_id
  --      after it inserts the consumption (the pour hold keys on that);
  --    * reveal_wine / reveal_next_category: a reveal is an UPDATE of
  --      wines.is_revealed, and both refuse a CLOSED tasting;
  --    * remove_flight_glass: a Remove deletes the wines row (cascades);
  --    * the rule-1 guard and its helper: they refuse the tombstone of a
  --      merge by the adder of an unrevealed glass of a public loser, and
  --      exempt every write at trigger depth > 1;
  --    * usage/holdings: they read masked pours;
  --    * can_read_blind_pending_catalog_wine: the model the unidentified
  --      helper mirrors; resolve_unidentified_wine: left unchanged.
  select string_agg(format('%s %s', s.sig, coalesce(md5(replace(p.prosrc, chr(13), '')), 'missing')), '; ')
    into v_text
  from (values
    ('public.find_or_create_catalog_wine(jsonb)', '0e9e2f1142635473eb916125611ed7ef'),
    ('public.shared_cellar_lots(uuid)', 'c3da48f21c077f0a349e5d88e55b0ff7'),
    ('public.catalog_wine_identity_match(jsonb)', '763eb9a53dcb0ebb4dbeaf0c92073f35'),
    ('public.catalog_wine_mark_blind()', '08dc5499a57fda78eda6e6ac31ac9f9d'),
    ('public.catalog_wine_unmark_blind()', 'f9e3bf5208ceddd18a9b334c585965cc'),
    ('public.catalog_wine_unmark_blind_on_unlink()', '3473768fbd4143ed68129953ecce6ea4'),
    ('public.catalog_wine_masked_pours(uuid[])', '7e2054d9001878a17672aedd11d7bfcb'),
    ('public.merge_catalog_wines(uuid,uuid)', '82c43b99a3f136acd5d772bd16f4e2d6'),
    ('public.draw_down_flight_cellar_lots(uuid)', '0cbe5dd2dd771abb3cbd5855ea78f7c4'),
    ('public.pour_cellar_lot_into_glass(uuid)', '558e60723fa745ead80dd0dc75871411'),
    ('public.reveal_wine(uuid)', 'ed7f78a59fb299b6307e586b8e8ab5c0'),
    ('public.reveal_next_category(uuid,smallint)', '6a08183662534db0d212b2412d729ac2'),
    ('public.remove_flight_glass(uuid)', 'afbc58c0c0b48becdfde9436d5b2ebc0'),
    ('public.catalog_wines_rule1_guard()', 'd7ab319ef77e4516f32f8d22ff531833'),
    ('public.catalog_wine_in_callers_unrevealed_glass(uuid)', 'f33fbd7f4e283cb0ed682469aa6ea2c2'),
    ('public.catalog_wine_usage(uuid)', '8544e9afe31d30c26d516e68b19fca23'),
    ('public.catalog_wine_holdings(uuid[])', 'af3b6c87fcbfbbbf46c210d84f3b5b00'),
    ('public.can_read_blind_pending_catalog_wine(uuid)', '111373cbbf75a46339813b377c8a975c'),
    ('public.resolve_unidentified_wine(uuid,uuid)', '915e17733e5f48577fbf777fdcd81af8'),
    ('public.can_view_cellar(uuid)', '3af2e51e338dc43cc48b58f061049ec2')
  ) as s (sig, md5)
  left join pg_proc p on p.oid = to_regprocedure(s.sig)
  where p.oid is null or md5(replace(p.prosrc, chr(13), '')) <> s.md5;
  if v_text is not null then
    raise exception 'live function bodies differ from the ones this file was written against: %', v_text;
  end if;

  -- 4. merge_catalog_wines: EXECUTE for PUBLIC, anon, authenticated and
  --    service_role (what the revoke below narrows).
  select string_agg(x.g, ',' order by x.g collate "C") into v_text
  from (select distinct case when a.grantee = 0 then 'PUBLIC'
                             when a.grantee = p.proowner then 'OWNER'
                             else pg_get_userbyid(a.grantee)::text end as g
          from pg_proc p, aclexplode(p.proacl) a
         where p.oid = to_regprocedure('public.merge_catalog_wines(uuid,uuid)') and a.privilege_type = 'EXECUTE') x;
  if v_text is distinct from 'OWNER,PUBLIC,anon,authenticated,service_role' then
    raise exception 'merge_catalog_wines EXECUTE grantees differ from live: %', v_text;
  end if;

  -- 5. The triggers on every table this file adds a trigger to, or whose
  --    trigger function it replaces or drops, and on tastings (a hold must
  --    outlive its tasting's close and delete: no trigger there may release
  --    one), are exactly the live ones.
  select string_agg(format('%s.%s %s %s', t.tgrelid::regclass::text, t.tgname, t.tgtype, t.tgfoid::regprocedure::text),
                    '; ' order by t.tgrelid::regclass::text collate "C", t.tgname::text collate "C")
    into v_text
  from pg_trigger t
  where t.tgrelid in ('public.wine_answers'::regclass, 'public.wines'::regclass, 'public.tastings'::regclass,
                      'public.wine_pour_intents'::regclass)
    and not t.tgisinternal;
  if v_text is distinct from
       'tastings.tastings_lock_setup_after_start 19 tastings_lock_setup_after_start(); '
       || 'tastings.tastings_pause_follows_status 23 tastings_pause_follows_status(); '
       || 'tastings.tastings_pointer_in_tasting 23 tastings_pointer_in_tasting(); '
       || 'tastings.tastings_stamp_lifecycle 23 tastings_stamp_lifecycle(); '
       || 'wine_answers.trg_catalog_wine_mark_blind 21 catalog_wine_mark_blind(); '
       || 'wine_answers.trg_catalog_wine_unmark_blind_on_unlink 25 catalog_wine_unmark_blind_on_unlink(); '
       || 'wine_answers.trg_wine_answers_clear_identity_draft 5 wine_answers_clear_identity_draft(); '
       || 'wines.semi_blind_release_revealed_wine 17 semi_blind_release_revealed_wine(); '
       || 'wines.trg_catalog_wine_unmark_blind 17 catalog_wine_unmark_blind(); '
       || 'wines.wines_drop_unresolved_notes 11 wines_drop_unresolved_notes(); '
       || 'wines.wines_full_reveal_step 19 wines_full_reveal_step(); '
       || 'wines.wines_pin_adder 23 wines_pin_adder(); '
       || 'wines.wines_refuse_reveal_while_paused 19 wines_refuse_reveal_while_paused(); '
       || 'wines.wines_semi_blind_flight_locked 7 wines_semi_blind_flight_locked(); '
       || 'wines.wines_stamp_revealed_at 23 wines_stamp_revealed_at(); '
       || 'wines.wset_notes_resolve_on_reveal 17 wset_notes_resolve_on_reveal()' then
    raise exception 'wine_answers / wines / tastings / wine_pour_intents triggers differ from live: %', v_text;
  end if;

  -- 6. The three policies replaced or relied on read as live does; the
  --    answer-key read policy the unidentified helper runs under is pinned by md5.
  select string_agg(format('%s.%s %s %s', p.tablename, p.policyname, p.cmd, p.qual), '; '
                    order by p.tablename collate "C", p.policyname collate "C")
    into v_text
  from pg_policies p
  where p.schemaname = 'public'
    and (p.tablename, p.policyname) in (('catalog_wines', 'catalog read'), ('cellar_lots', 'cellar own select'),
                                        ('catalog_wines_unidentified', 'unidentified read'));
  if v_text is distinct from
       'catalog_wines.catalog read SELECT ((NOT blind_pending) OR (created_by = auth.uid()) OR can_read_blind_pending_catalog_wine(id)); '
       || 'catalog_wines_unidentified.unidentified read SELECT true; '
       || 'cellar_lots.cellar own select SELECT ((owner_id = auth.uid()) OR can_view_cellar(owner_id))' then
    raise exception 'catalog / cellar / unidentified read policies differ from live: %', v_text;
  end if;
  if (select md5(p.qual) from pg_policies p
       where p.schemaname = 'public' and p.tablename = 'wine_answers' and p.policyname = 'wine_answers read')
     is distinct from 'abe0592ac72de20adfb3b8005bc86f86' then
    raise exception '"wine_answers read" differs from the policy this file was written against';
  end if;

  -- 7. catalog_wines: anon and authenticated hold table-level INSERT and
  --    UPDATE (what F6 narrows to columns).
  if not (has_table_privilege('authenticated', 'public.catalog_wines', 'INSERT')
          and has_table_privilege('authenticated', 'public.catalog_wines', 'UPDATE')
          and has_table_privilege('anon', 'public.catalog_wines', 'INSERT')
          and has_table_privilege('anon', 'public.catalog_wines', 'UPDATE')) then
    raise exception 'catalog_wines table-level INSERT/UPDATE for anon and authenticated differ from live';
  end if;

  -- 8. The columns the new bodies read or write.
  select string_agg(s.tbl || '.' || s.col, ', ') into v_text
  from (values
    ('catalog_wines', 'blind_pending'), ('catalog_wines', 'merged_into'), ('catalog_wines', 'created_by'),
    ('wine_answers', 'catalog_wine_id'), ('wine_answers', 'unidentified_wine_id'), ('wine_answers', 'wine_id'),
    ('wines', 'is_revealed'), ('wines', 'tasting_id'), ('tastings', 'status'),
    ('wine_pour_intents', 'wine_id'), ('wine_pour_intents', 'cellar_consumption_id'),
    ('cellar_consumptions', 'lot_id'), ('cellar_consumptions', 'catalog_wine_id'), ('cellar_consumptions', 'quantity'),
    ('wset_notes', 'unidentified_wine_id'), ('wset_notes', 'author_id'), ('wset_notes', 'catalog_wine_id'),
    ('catalog_wines_unidentified', 'created_by')
  ) as s (tbl, col)
  where not exists (select 1 from pg_attribute a
                    where a.attrelid = to_regclass('public.' || s.tbl) and a.attname = s.col and not a.attisdropped);
  if v_text is not null then
    raise exception 'columns this migration reads are missing: %', v_text;
  end if;
end $$;

-- ===========================================================================
-- BEGIN SPEC §5.2 SQL
-- ===========================================================================

-- F6 ------------------------------------------------------------------------

-- A client inserts only through find_or_create_catalog_wine (the identity, its
-- creator and, for a flight, blind_pending) and updates only what Manage wine,
-- the fill, the price fill and the main photo write. blind_pending,
-- merged_into, created_by, id and the timestamps are written by the database
-- alone (triggers, merge_catalog_wines, defaults).
revoke insert, update on table catalog_wines from anon, authenticated;
grant insert (country_id, region_id, appellation_id, primary_grape_id, secondary_grape_id, producer_id,
              type_designation_id, vintage_kind, vintage_year, vintage_tawny_years, colour, style, wine_name,
              created_by, blind_pending)
  on table catalog_wines to authenticated;
grant update (country_id, region_id, appellation_id, primary_grape_id, secondary_grape_id, producer_id,
              type_designation_id, vintage_kind, vintage_year, vintage_tawny_years, colour, style, wine_name,
              description, alcohol_percent, image_url, estimated_price, estimated_price_currency)
  on table catalog_wines to authenticated;

-- F4 + F11: holds ----------------------------------------------------------

-- Something hidden because of a flight: a flight-born catalog wine an
-- unrevealed glass links (it stays hidden even after the glass stops linking
-- it), or a cellar bottle poured into an unrevealed glass (it stays masked in
-- every shared count and cellar). Only a reveal releases a hold: the reveal of
-- its glass or, for a catalog hold, of any glass that links its wine, since
-- that wine is public from then on (catalog_wine_unmark_blind). A removed glass
-- (wine_id set null) or a deleted tasting (tasting_id set null) keeps its holds
-- for good: releasing them at a close or a delete would publish a wine no glass
-- ever revealed, and a later pour of it would then be public from the start.
-- tasting_id records the tasting that took the hold (null once that tasting is
-- deleted); no release rule reads it.
-- Internal: no client role reads or writes it.
create table flight_holds (
  id uuid primary key default gen_random_uuid(),
  tasting_id uuid references tastings(id) on delete set null,
  wine_id uuid references wines(id) on delete set null,
  catalog_wine_id uuid references catalog_wines(id) on delete cascade,
  consumption_id uuid references cellar_consumptions(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint flight_holds_one_subject check (num_nonnulls(catalog_wine_id, consumption_id) = 1)
);
create index flight_holds_tasting_idx on flight_holds (tasting_id);
create index flight_holds_wine_idx on flight_holds (wine_id) where wine_id is not null;
create index flight_holds_catalog_wine_idx on flight_holds (catalog_wine_id) where catalog_wine_id is not null;
create unique index flight_holds_consumption_key on flight_holds (consumption_id) where consumption_id is not null;
alter table flight_holds enable row level security;
revoke all on table flight_holds from public, anon, authenticated;

-- A hidden wine that no unrevealed glass links and no hold keeps hidden becomes
-- public. The one place a flight-born wine is un-hidden other than its own reveal.
create function catalog_wine_unhide_if_free(p_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update catalog_wines cw set blind_pending = false
   where cw.id = p_id
     and cw.blind_pending
     and not exists (select 1 from wine_answers wa join wines w on w.id = wa.wine_id
                      where wa.catalog_wine_id = cw.id and not w.is_revealed)
     and not exists (select 1 from flight_holds h where h.catalog_wine_id = cw.id);
$$;

-- The wine a merged-away wine ends up in (merged_into followed to its end).
create function catalog_wine_merge_target(p_id uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_id uuid := p_id;
  v_next uuid;
  v_hops int := 0;
begin
  loop
    select c.merged_into into v_next from catalog_wines c where c.id = v_id;
    exit when v_next is null or v_hops >= 32;
    v_id := v_next;
    v_hops := v_hops + 1;
  end loop;
  return v_id;
end $$;

-- An answer key links a hidden wine to a glass that is not revealed yet: hold
-- the wine to that glass (replaces catalog_wine_mark_blind, which hid any
-- linked wine without a lot, note or revealed glass: F4).
create function flight_holds_on_link()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.catalog_wine_id is null then
    return null;
  end if;
  if tg_op = 'UPDATE' and new.catalog_wine_id is not distinct from old.catalog_wine_id then
    return null;
  end if;
  insert into flight_holds (tasting_id, wine_id, catalog_wine_id)
  select w.tasting_id, w.id, cw.id
    from wines w
    join catalog_wines cw on cw.id = new.catalog_wine_id
   where w.id = new.wine_id
     and not w.is_revealed
     and cw.blind_pending
     and not exists (select 1 from flight_holds h where h.wine_id = w.id and h.catalog_wine_id = cw.id);
  return null;
end $$;

-- A bottle poured into a glass that is not revealed yet (D11: Start's
-- draw-down or a running pour, which set cellar_consumption_id): hold the pour
-- to that glass, so a Swap or Remove that drops the intent keeps it masked.
create function flight_holds_on_pour()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.cellar_consumption_id is null then
    return null;
  end if;
  if tg_op = 'UPDATE' and new.cellar_consumption_id is not distinct from old.cellar_consumption_id then
    return null;
  end if;
  insert into flight_holds (tasting_id, wine_id, consumption_id)
  select w.tasting_id, w.id, new.cellar_consumption_id
    from wines w
   where w.id = new.wine_id
     and not w.is_revealed
  on conflict (consumption_id) where consumption_id is not null do nothing;
  return null;
end $$;

-- A released hold may free its wine.
create function flight_holds_after_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.catalog_wine_id is not null then
    perform catalog_wine_unhide_if_free(old.catalog_wine_id);
  end if;
  return null;
end $$;

-- A glass stops linking a wine (Edit, Swap, Remove, a tasting deleted): the
-- wine becomes public only once nothing keeps it hidden (F11; was: as soon as
-- no unrevealed glass linked it). A flight-born wine's hold outlives the link,
-- so this never publishes one; only a reveal does.
create or replace function catalog_wine_unmark_blind_on_unlink()
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
  perform catalog_wine_unhide_if_free(old.catalog_wine_id);
  return null;
end $$;

-- A glass is revealed: an answer key a merge left on a merged-away wine moves
-- to the wine it was merged into (F7), the glass's wine becomes public, and
-- every hold on this glass or on its wine is released (F11; the pours held to
-- it unmask, as 20260919213300's masking did at the reveal). The only release:
-- a wine abandoned by this glass's Edit or Swap is a near-copy of the wine now
-- public, and a removed glass's wine waits for a glass that pours it.
create or replace function catalog_wine_unmark_blind()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.is_revealed and not old.is_revealed then
    update wine_answers wa
       set catalog_wine_id = catalog_wine_merge_target(wa.catalog_wine_id)
     where wa.wine_id = new.id
       and exists (select 1 from catalog_wines c where c.id = wa.catalog_wine_id and c.merged_into is not null);
    update catalog_wines cw set blind_pending = false
    where cw.blind_pending
      and cw.id in (
        select wa.catalog_wine_id from wine_answers wa where wa.wine_id = new.id
      );
    delete from flight_holds h
     where h.wine_id = new.id
        or h.catalog_wine_id in (select wa.catalog_wine_id from wine_answers wa where wa.wine_id = new.id);
  end if;
  return new;
end $$;

drop trigger trg_catalog_wine_mark_blind on wine_answers;
drop function catalog_wine_mark_blind();

create trigger flight_holds_on_link
  after insert or update of catalog_wine_id on wine_answers
  for each row execute function flight_holds_on_link();

create trigger flight_holds_on_pour
  after insert or update of cellar_consumption_id on wine_pour_intents
  for each row execute function flight_holds_on_pour();

create trigger flight_holds_after_delete
  after delete on flight_holds
  for each row execute function flight_holds_after_delete();

-- What live holds today: every hidden wine an unrevealed glass links, and every
-- bottle poured into an unrevealed glass.
insert into flight_holds (tasting_id, wine_id, catalog_wine_id)
select distinct w.tasting_id, w.id, wa.catalog_wine_id
  from wine_answers wa
  join wines w on w.id = wa.wine_id
  join catalog_wines cw on cw.id = wa.catalog_wine_id
 where not w.is_revealed and cw.blind_pending;
insert into flight_holds (tasting_id, wine_id, consumption_id)
select w.tasting_id, w.id, i.cellar_consumption_id
  from wine_pour_intents i
  join wines w on w.id = i.wine_id
 where i.cellar_consumption_id is not null and not w.is_revealed
on conflict (consumption_id) where consumption_id is not null do nothing;

-- F2 + F11: a held pour stays masked after its intent is gone ----------------

create or replace function catalog_wine_masked_pours(p_ids uuid[])
returns table (consumption_id uuid, lot_id uuid, catalog_wine_id uuid, quantity integer)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, c.lot_id, c.catalog_wine_id, c.quantity
    from cellar_consumptions c
   where c.catalog_wine_id = any(p_ids)
     and (exists (select 1 from flight_holds h where h.consumption_id = c.id)
          or exists (select 1
                       from wine_pour_intents i
                       join wines w on w.id = i.wine_id
                      where i.cellar_consumption_id = c.id
                        and not w.is_revealed));
$$;

revoke execute on function catalog_wine_unhide_if_free(uuid) from public, anon, authenticated, service_role;
revoke execute on function catalog_wine_merge_target(uuid) from public, anon, authenticated, service_role;
revoke execute on function flight_holds_on_link() from public, anon, authenticated, service_role;
revoke execute on function flight_holds_on_pour() from public, anon, authenticated, service_role;
revoke execute on function flight_holds_after_delete() from public, anon, authenticated, service_role;

-- F7 ------------------------------------------------------------------------

-- A merge never shows anyone a hidden glass: only revealed glasses move now; an
-- unrevealed glass keeps its answer key on the loser until its own reveal moves
-- it (catalog_wine_unmark_blind). A hidden wine is never a target, and says so
-- with the same words as a missing one. The loser's tombstone is still judged by
-- catalog_wines_rule1_guard, which refuses only the adder of an unrevealed glass
-- of a public loser.
create or replace function merge_catalog_wines(p_loser uuid, p_winner uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_loser = p_winner then
    raise exception 'cannot merge a catalog wine into itself';
  end if;
  if not exists (
    select 1 from catalog_wines c
    where c.id = p_loser
      and (
        c.created_by = auth.uid()
        or exists (select 1 from profiles p where p.id = auth.uid() and p.is_curator)
      )
  ) then
    raise exception 'not authorised to merge this catalog wine';
  end if;
  if not exists (select 1 from catalog_wines where id = p_winner and merged_into is null and not blind_pending) then
    raise exception 'winner catalog wine not found or already merged';
  end if;

  update wset_notes    set catalog_wine_id = p_winner where catalog_wine_id = p_loser;
  update wine_answers wa set catalog_wine_id = p_winner
   where wa.catalog_wine_id = p_loser
     and exists (select 1 from wines w where w.id = wa.wine_id and w.is_revealed);
  update catalog_wines set merged_into = p_winner where id = p_loser;
end $$;

revoke execute on function merge_catalog_wines(uuid, uuid) from public, anon;
grant execute on function merge_catalog_wines(uuid, uuid) to authenticated, service_role;

-- F8 ------------------------------------------------------------------------

-- Another person's cellar is read only through shared_cellar_lots
-- (20260919223100), where a bottle poured into an unrevealed glass is still in
-- its lot.
drop policy "cellar own select" on cellar_lots;
create policy "cellar own select" on cellar_lots
  for select to authenticated
  using (owner_id = auth.uid());

-- F10 -----------------------------------------------------------------------

-- Whoever may already read an answer key naming this unidentified wine (the
-- adder; anyone, once its glass is revealed; an ASYNC IMMEDIATE guesser who
-- scored it), or who wrote a note naming it. SECURITY INVOKER on purpose, like
-- can_read_blind_pending_catalog_wine: it reads under the caller's own RLS, so
-- it narrows whenever "wine_answers read" does.
create function can_read_unidentified_wine(p_id uuid)
returns boolean
language sql
stable
set search_path = public
as $$
  select exists (select 1 from wine_answers wa where wa.unidentified_wine_id = p_id)
      or exists (select 1 from wset_notes n where n.unidentified_wine_id = p_id and n.author_id = auth.uid());
$$;

revoke execute on function can_read_unidentified_wine(uuid) from public, anon;
grant execute on function can_read_unidentified_wine(uuid) to authenticated, service_role;

drop policy "unidentified read" on catalog_wines_unidentified;
create policy "unidentified read" on catalog_wines_unidentified
  for select to authenticated
  using (created_by = auth.uid() or can_read_unidentified_wine(id));

create index wine_answers_unidentified_wine_id_idx on wine_answers (unidentified_wine_id)
  where unidentified_wine_id is not null;

-- ===========================================================================
-- END SPEC §5.2 SQL
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Post-state, same transaction: every check a raise exception.
-- ---------------------------------------------------------------------------
do $$
declare
  v_fn record;
  v_text text;
  v_n int;
begin
  -- 1. Every function created or replaced: security, search_path, volatility,
  --    language, return type, set-returning, arguments, body and EXECUTE.
  for v_fn in
    select s.sig, s.secdef, s.config, s.volatile, s.lang, s.rettype, s.retset, s.args, s.body_md5, s.grantees,
           p.oid, p.prosecdef, p.proconfig::text as config_now, p.provolatile::text as volatile_now,
           l.lanname, format_type(p.prorettype, null) as rettype_now, p.proretset,
           pg_get_function_identity_arguments(p.oid) as args_now,
           md5(replace(p.prosrc, chr(13), '')) as md5_now,
           (select string_agg(x.g, ',' order by x.g collate "C")
            from (select distinct case when a.grantee = 0 then 'PUBLIC'
                                       when a.grantee = p.proowner then 'OWNER'
                                       else pg_get_userbyid(a.grantee)::text end as g
                  from aclexplode(p.proacl) a
                  where a.privilege_type = 'EXECUTE') x) as grantees_now
    from (values
      ('public.catalog_wine_unhide_if_free(uuid)', true, '{search_path=public}', 'v', 'sql', 'void', false,
       'p_id uuid', 'f946145ff6a4f72ee7271e87d5112ab8', 'OWNER'),
      ('public.catalog_wine_merge_target(uuid)', true, '{search_path=public}', 's', 'plpgsql', 'uuid', false,
       'p_id uuid', '41b6630a6f071bc910f6af21f32511ce', 'OWNER'),
      ('public.flight_holds_on_link()', true, '{search_path=public}', 'v', 'plpgsql', 'trigger', false,
       '', '7e7f1a32f794e143df94b10cdec59d67', 'OWNER'),
      ('public.flight_holds_on_pour()', true, '{search_path=public}', 'v', 'plpgsql', 'trigger', false,
       '', 'f2eefca376cd3135468195963bf32ae5', 'OWNER'),
      ('public.flight_holds_after_delete()', true, '{search_path=public}', 'v', 'plpgsql', 'trigger', false,
       '', 'b9f927675b7787cf134df79e9831c54b', 'OWNER'),
      ('public.catalog_wine_unmark_blind_on_unlink()', true, '{search_path=public}', 'v', 'plpgsql', 'trigger', false,
       '', '923badd459406c1cffcc02cb66733df7', 'OWNER,PUBLIC,anon,authenticated,service_role'),
      ('public.catalog_wine_unmark_blind()', true, '{search_path=public}', 'v', 'plpgsql', 'trigger', false,
       '', 'de1f11ee58c418bf8fdc9310f0ba508f', 'OWNER,PUBLIC,anon,authenticated,service_role'),
      ('public.catalog_wine_masked_pours(uuid[])', true, '{search_path=public}', 's', 'sql', 'record', true,
       'p_ids uuid[]', 'fea91b152e3565f16c56cc1d15810d29', 'OWNER'),
      ('public.merge_catalog_wines(uuid,uuid)', true, '{search_path=public}', 'v', 'plpgsql', 'void', false,
       'p_loser uuid, p_winner uuid', '6894957f77b8107a54e9f186a0973788', 'OWNER,authenticated,service_role'),
      ('public.can_read_unidentified_wine(uuid)', false, '{search_path=public}', 's', 'sql', 'boolean', false,
       'p_id uuid', 'c293ea5374aaee3bb3c89e8da4513850', 'OWNER,authenticated,service_role')
    ) as s (sig, secdef, config, volatile, lang, rettype, retset, args, body_md5, grantees)
    left join pg_proc p on p.oid = to_regprocedure(s.sig)
    left join pg_language l on l.oid = p.prolang
  loop
    if v_fn.oid is null then
      raise exception '% does not exist post-migration', v_fn.sig;
    end if;
    if v_fn.prosecdef is distinct from v_fn.secdef
       or v_fn.config_now is distinct from v_fn.config
       or v_fn.volatile_now is distinct from v_fn.volatile
       or v_fn.lanname is distinct from v_fn.lang
       or v_fn.rettype_now is distinct from v_fn.rettype
       or v_fn.proretset is distinct from v_fn.retset
       or v_fn.args_now is distinct from v_fn.args then
      raise exception '% attributes differ: security definer %, config %, volatility %, language %, returns % (set %), arguments (%)',
        v_fn.sig, v_fn.prosecdef, v_fn.config_now, v_fn.volatile_now, v_fn.lanname, v_fn.rettype_now,
        v_fn.proretset, v_fn.args_now;
    end if;
    if v_fn.md5_now is distinct from v_fn.body_md5 then
      raise exception '% body is not the one this migration was written with (md5 %)', v_fn.sig, v_fn.md5_now;
    end if;
    if v_fn.grantees_now is distinct from v_fn.grantees then
      raise exception '% EXECUTE is held by %, expected %', v_fn.sig, v_fn.grantees_now, v_fn.grantees;
    end if;
  end loop;
  if to_regprocedure('public.catalog_wine_mark_blind()') is not null then
    raise exception 'catalog_wine_mark_blind() still exists';
  end if;
  if has_function_privilege('anon', 'public.merge_catalog_wines(uuid,uuid)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.merge_catalog_wines(uuid,uuid)', 'EXECUTE')
     or has_function_privilege('anon', 'public.can_read_unidentified_wine(uuid)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.catalog_wine_unhide_if_free(uuid)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.catalog_wine_merge_target(uuid)', 'EXECUTE') then
    raise exception 'EXECUTE is not: merge and the unidentified helper authenticated + service_role; the hold helpers nobody';
  end if;

  -- 2. The triggers on the five tables, in full (none on tastings releases a
  --    hold).
  select string_agg(format('%s.%s %s %s %s', t.tgrelid::regclass::text, t.tgname, t.tgtype, t.tgenabled,
                           t.tgfoid::regprocedure::text),
                    '; ' order by t.tgrelid::regclass::text collate "C", t.tgname::text collate "C")
    into v_text
  from pg_trigger t
  where t.tgrelid in ('public.wine_answers'::regclass, 'public.wines'::regclass, 'public.tastings'::regclass,
                      'public.wine_pour_intents'::regclass, 'public.flight_holds'::regclass)
    and not t.tgisinternal;
  if v_text is distinct from
       'flight_holds.flight_holds_after_delete 9 O flight_holds_after_delete(); '
       || 'tastings.tastings_lock_setup_after_start 19 O tastings_lock_setup_after_start(); '
       || 'tastings.tastings_pause_follows_status 23 O tastings_pause_follows_status(); '
       || 'tastings.tastings_pointer_in_tasting 23 O tastings_pointer_in_tasting(); '
       || 'tastings.tastings_stamp_lifecycle 23 O tastings_stamp_lifecycle(); '
       || 'wine_answers.flight_holds_on_link 21 O flight_holds_on_link(); '
       || 'wine_answers.trg_catalog_wine_unmark_blind_on_unlink 25 O catalog_wine_unmark_blind_on_unlink(); '
       || 'wine_answers.trg_wine_answers_clear_identity_draft 5 O wine_answers_clear_identity_draft(); '
       || 'wine_pour_intents.flight_holds_on_pour 21 O flight_holds_on_pour(); '
       || 'wines.semi_blind_release_revealed_wine 17 O semi_blind_release_revealed_wine(); '
       || 'wines.trg_catalog_wine_unmark_blind 17 O catalog_wine_unmark_blind(); '
       || 'wines.wines_drop_unresolved_notes 11 O wines_drop_unresolved_notes(); '
       || 'wines.wines_full_reveal_step 19 O wines_full_reveal_step(); '
       || 'wines.wines_pin_adder 23 O wines_pin_adder(); '
       || 'wines.wines_refuse_reveal_while_paused 19 O wines_refuse_reveal_while_paused(); '
       || 'wines.wines_semi_blind_flight_locked 7 O wines_semi_blind_flight_locked(); '
       || 'wines.wines_stamp_revealed_at 23 O wines_stamp_revealed_at(); '
       || 'wines.wset_notes_resolve_on_reveal 17 O wset_notes_resolve_on_reveal()' then
    raise exception 'triggers post-migration are %', v_text;
  end if;

  -- 3. The three read policies, as this file leaves them.
  select string_agg(format('%s.%s %s %s %s', p.tablename, p.policyname, p.cmd, p.roles::text, p.qual), '; '
                    order by p.tablename collate "C", p.policyname collate "C")
    into v_text
  from pg_policies p
  where p.schemaname = 'public'
    and (p.tablename, p.policyname) in (('catalog_wines', 'catalog read'), ('cellar_lots', 'cellar own select'),
                                        ('catalog_wines_unidentified', 'unidentified read'));
  if v_text is distinct from
       'catalog_wines.catalog read SELECT {authenticated} ((NOT blind_pending) OR (created_by = auth.uid()) OR can_read_blind_pending_catalog_wine(id)); '
       || 'catalog_wines_unidentified.unidentified read SELECT {authenticated} ((created_by = auth.uid()) OR can_read_unidentified_wine(id)); '
       || 'cellar_lots.cellar own select SELECT {authenticated} (owner_id = auth.uid())' then
    raise exception 'read policies post-migration are %', v_text;
  end if;

  -- 4. catalog_wines: no table-level INSERT/UPDATE for anon or authenticated;
  --    authenticated's column grants exactly the two lists; anon none.
  if has_table_privilege('authenticated', 'public.catalog_wines', 'INSERT')
     or has_table_privilege('authenticated', 'public.catalog_wines', 'UPDATE')
     or has_table_privilege('anon', 'public.catalog_wines', 'INSERT')
     or has_table_privilege('anon', 'public.catalog_wines', 'UPDATE')
     or has_any_column_privilege('anon', 'public.catalog_wines', 'INSERT')
     or has_any_column_privilege('anon', 'public.catalog_wines', 'UPDATE') then
    raise exception 'catalog_wines still grants table-level INSERT/UPDATE, or anon a column';
  end if;
  select string_agg(a.attname::text, ',' order by a.attname::text collate "C") into v_text
  from pg_attribute a
  where a.attrelid = 'public.catalog_wines'::regclass and a.attnum > 0 and not a.attisdropped
    and has_column_privilege('authenticated', 'public.catalog_wines', a.attname, 'INSERT');
  if v_text is distinct from
       'appellation_id,blind_pending,colour,country_id,created_by,primary_grape_id,producer_id,region_id,'
       || 'secondary_grape_id,style,type_designation_id,vintage_kind,vintage_tawny_years,vintage_year,wine_name' then
    raise exception 'authenticated INSERT columns on catalog_wines are %', v_text;
  end if;
  select string_agg(a.attname::text, ',' order by a.attname::text collate "C") into v_text
  from pg_attribute a
  where a.attrelid = 'public.catalog_wines'::regclass and a.attnum > 0 and not a.attisdropped
    and has_column_privilege('authenticated', 'public.catalog_wines', a.attname, 'UPDATE');
  if v_text is distinct from
       'alcohol_percent,appellation_id,colour,country_id,description,estimated_price,estimated_price_currency,'
       || 'image_url,primary_grape_id,producer_id,region_id,secondary_grape_id,style,type_designation_id,'
       || 'vintage_kind,vintage_tawny_years,vintage_year,wine_name' then
    raise exception 'authenticated UPDATE columns on catalog_wines are %', v_text;
  end if;

  -- 5. flight_holds: RLS on, no policy, nothing for anon or authenticated.
  if not (select c.relrowsecurity from pg_class c where c.oid = 'public.flight_holds'::regclass)
     or exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = 'flight_holds')
     or has_any_column_privilege('authenticated', 'public.flight_holds', 'SELECT')
     or has_any_column_privilege('authenticated', 'public.flight_holds', 'INSERT')
     or has_any_column_privilege('authenticated', 'public.flight_holds', 'UPDATE')
     or has_table_privilege('authenticated', 'public.flight_holds', 'DELETE')
     or has_any_column_privilege('anon', 'public.flight_holds', 'SELECT')
     or has_table_privilege('anon', 'public.flight_holds', 'DELETE') then
    raise exception 'flight_holds is readable or writable by a client role';
  end if;
  --    Only a reveal releases a hold: deleting the tasting or the glass keeps
  --    it (set null); only the held wine or consumption itself going away
  --    drops it.
  select string_agg(format('%s %s', a.attname, c.confdeltype), ', ' order by a.attname::text collate "C")
    into v_text
  from pg_constraint c
  join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
  where c.conrelid = 'public.flight_holds'::regclass and c.contype = 'f';
  if v_text is distinct from 'catalog_wine_id c, consumption_id c, tasting_id n, wine_id n'
     or exists (select 1 from pg_attribute a
                 where a.attrelid = 'public.flight_holds'::regclass and a.attname in ('tasting_id', 'wine_id')
                   and a.attnotnull) then
    raise exception 'flight_holds foreign keys are %; tasting_id and wine_id must be nullable and set null on delete', v_text;
  end if;

  -- 6. The backfill holds what live holds: every hidden wine an unrevealed glass
  --    links, and every pour into an unrevealed glass.
  select count(*) into v_n
  from wine_answers wa
  join wines w on w.id = wa.wine_id
  join catalog_wines cw on cw.id = wa.catalog_wine_id
  where not w.is_revealed and cw.blind_pending
    and not exists (select 1 from flight_holds h where h.wine_id = w.id and h.catalog_wine_id = cw.id);
  if v_n > 0 then
    raise exception '% hidden links are not held', v_n;
  end if;
  select count(*) into v_n
  from wine_pour_intents i
  join wines w on w.id = i.wine_id
  where i.cellar_consumption_id is not null and not w.is_revealed
    and not exists (select 1 from flight_holds h where h.consumption_id = i.cellar_consumption_id);
  if v_n > 0 then
    raise exception '% pours into unrevealed glasses are not held', v_n;
  end if;

  -- 7. No live count moves: the masked pours are exactly the ones
  --    20260919213300 masked (an intent linking an unrevealed glass).
  with now_masked as (
    select m.consumption_id as id from catalog_wine_masked_pours(array(select id from catalog_wines)) m
  ),
  was_masked as (
    select c.id from cellar_consumptions c
     where exists (select 1 from wine_pour_intents i join wines w on w.id = i.wine_id
                    where i.cellar_consumption_id = c.id and not w.is_revealed)
  )
  select count(*) into v_n
  from ((select id from now_masked except select id from was_masked)
        union all
        (select id from was_masked except select id from now_masked)) d;
  if v_n > 0 then
    raise exception 'catalog_wine_masked_pours differs from the pours 20260919213300 masked on % consumptions', v_n;
  end if;
end $$;
```

## Appendix E. The probe source (`.superpowers/leaks2/probes/rule1-older-leaks-probe.mjs`)

```js
// Probe for 20260919223100 + 20260919223200 (spec docs/superpowers/specs/2026-09-19-rule1-older-leaks.md §7).
//   node --env-file=.env.local .superpowers/leaks2/probes/rule1-older-leaks-probe.mjs [--m1 <file>] [--m2 <file>] [--applied]
// Two phases, each ONE transaction that ends in ROLLBACK:
//   before — the leaks F4-F11 reproduce on live as it is;
//   after  — both migration files are executed inside the transaction (each recorded in
//            schema_migrations, as scripts/scratch-apply.mjs records one), then the same scenarios.
// --applied: after the owner's live apply, run only the after-phase against live as it is.
// Fixtures are built as postgres on the seeded demo.*@blindr.invalid people; every flight step the app
// takes (find_or_create_catalog_wine, the wines and wine_answers inserts, Edit, Swap, remove_flight_glass,
// reveal_wine, the D11 pour, merge) runs as the signed-in person, in a savepoint under
// `set local role authenticated|anon` with request.jwt.claims. Every EXPECT was written before the first
// run; a mismatch exits 1. The last line compares a live fingerprint before and after both phases.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import pg from "pg";
import { pgConfig } from "../../../scripts/wine-map-tiles/lib.mjs";

const argOf = (n, d) => {
  const i = process.argv.indexOf("--" + n);
  return i < 0 ? d : process.argv[i + 1];
};
const M1 = argOf("m1", ".superpowers/leaks2/probes/draft/20260919223100_rule1_born_hidden_and_shared_cellar.sql");
const M2 = argOf("m2", ".superpowers/leaks2/probes/draft/20260919223200_rule1_older_leaks.sql");
const APPLIED = process.argv.includes("--applied");

const GUARD = "42501 This wine is in one of your flights that hasn't been revealed yet. Change it after the reveal.";
const DENIED_CW = "42501 permission denied for table catalog_wines";
const NO_SHARED = "42883 function shared_cellar_lots(uuid) does not exist";
const NOT_FOUND = "P0001 winner catalog wine not found or already merged";

const client = new pg.Client({ ...pgConfig(), port: Number(process.env.DB_PORT ?? 5432) });
await client.connect();
const q = (sql, params) => client.query(sql, params);
const rows = async (sql, params) => (await q(sql, params)).rows;
const one = async (sql, params) => (await q(sql, params)).rows[0] ?? null;

let sp = 0;
async function as(who, fn) {
  const name = "s" + ++sp;
  await q("savepoint " + name);
  try {
    if (who === "anon") {
      await q("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ role: "anon" })]);
      await q("set local role anon");
    } else if (who === "postgres") {
      await q("select set_config('request.jwt.claims', '', true)");
    } else {
      await q("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: who, role: "authenticated" })]);
      await q("set local role authenticated");
    }
    const out = await fn();
    await q("reset role");
    await q("select set_config('request.jwt.claims', '', true)");
    await q("release savepoint " + name);
    return out;
  } catch (e) {
    await q("rollback to savepoint " + name);
    await q("reset role");
    await q("select set_config('request.jwt.claims', '', true)");
    return { error: e.code + " " + e.message };
  }
}
const must = (x, what) => {
  if (x && typeof x === "object" && "error" in x) throw new Error(`${what}: ${x.error}`);
  return x;
};

let failures = 0;
let P = false;
function check(id, what, got, before, after) {
  const expect = P ? after : before;
  const g = JSON.stringify(got);
  const e = JSON.stringify(expect);
  const ok = g === e;
  if (!ok) failures++;
  console.log(`${ok ? "ok  " : "FAIL"} ${P ? "after " : "before"}.${id.padEnd(4)} ${what} => ${g}${ok ? "" : "   EXPECTED " + e}`);
}

const liveFingerprint = async () =>
  one(`select (select count(*) from catalog_wines)::int cw, (select count(*) from catalog_wines_unidentified)::int u,
              (select count(*) from wines)::int w, (select count(*) from wine_answers)::int wa,
              (select count(*) from cellar_lots)::int l, (select count(*) from cellar_consumptions)::int c,
              (select count(*) from wine_pour_intents)::int i, (select count(*) from catalog_wine_edits)::int e,
              (select count(*) from tastings)::int t, (select count(*) from tasting_participants)::int tp,
              (select count(*) from friendships)::int f, (select count(*) from wset_notes)::int n,
              (select count(*) from producers)::int pr, (select count(*) from grapes)::int g,
              (select count(*) from supabase_migrations.schema_migrations)::int sm,
              (select md5(string_agg(id::text || blind_pending::text || coalesce(merged_into::text,'') || coalesce(description,''), ',' order by id)) from catalog_wines) cwmd5,
              (select md5(string_agg(id::text || quantity::text || updated_at::text, ',' order by id)) from cellar_lots) lotmd5,
              (select md5(string_agg(p.oid::text || md5(p.prosrc) || coalesce(p.proacl::text,''), ',' order by p.oid)) from pg_proc p where p.pronamespace = 'public'::regnamespace) procs,
              (select md5(string_agg(tablename || policyname || coalesce(qual,''), ',' order by tablename, policyname)) from pg_policies where schemaname = 'public') policies,
              (select count(*) from pg_trigger where not tgisinternal)::int triggers,
              (select md5(coalesce(relacl::text,'')) from pg_class where oid = 'public.catalog_wines'::regclass) cwacl`);

// I. The migrations' own checks, run right after the apply (before any fixture): M2's post-state
// check 7 ("no live count moves at apply") holds at apply time, not after the scenarios below leave
// holds whose glass was removed or whose tasting was deleted (by design: they are kept for good).
async function migrationChecks() {
  const m1 = await readFile(M1, "utf8");
  const m2 = await readFile(M2, "utf8");
  const post = (sql) => sql.slice(sql.indexOf("do $$", sql.indexOf("-- Post-state, same transaction")));
  const pre = (sql) => sql.slice(sql.indexOf("do $$"), sql.indexOf("-- ====="));
  const attempt = async (tamper, sql) => {
    await q("savepoint tamper");
    try {
      if (tamper) await q(tamper);
      await q(sql);
      return "passed";
    } catch (e) {
      return e.message;
    } finally {
      await q("rollback to savepoint tamper");
    }
  };
  const msgs = [
    await attempt(null, post(m1)),
    await attempt(null, post(m2)),
    await attempt("grant update (blind_pending) on catalog_wines to authenticated", post(m2)),
    await attempt("drop trigger flight_holds_on_link on wine_answers", post(m2)),
    await attempt("create or replace function catalog_wine_unhide_if_free(p_id uuid) returns void language sql security definer set search_path = public as $x$ update catalog_wines set blind_pending = blind_pending where false; $x$", post(m2)),
    await attempt("grant execute on function merge_catalog_wines(uuid, uuid) to anon", post(m2)),
    await attempt(null, pre(m2)),
    await attempt(null, pre(m1)),
    await attempt("alter table flight_holds drop constraint flight_holds_tasting_id_fkey, add constraint flight_holds_tasting_id_fkey foreign key (tasting_id) references tastings(id) on delete cascade", post(m2)),
  ];
  console.log("      I messages:", JSON.stringify(msgs));
  check("I1", "post-states pass as applied; M2's raises on each tamper (incl. a tasting delete cascading holds); both pre-states refuse a second apply", [
    msgs[0], msgs[1],
    msgs[2].startsWith("authenticated UPDATE columns on catalog_wines are"),
    msgs[3].startsWith("triggers post-migration are"),
    msgs[4].startsWith("public.catalog_wine_unhide_if_free(uuid) body is not the one"),
    msgs[5].startsWith("public.merge_catalog_wines(uuid,uuid) EXECUTE is held by"),
    msgs[6].startsWith("flight_holds or wine_answers_unidentified_wine_id_idx already exists"),
    msgs[7].startsWith("shared_cellar_lots(uuid) already exists"),
    msgs[8].startsWith("flight_holds foreign keys are"),
  ], undefined, ["passed", "passed", true, true, true, true, true, true, true]);
}

async function phase(name, apply) {
  P = name === "after";
  await q("begin");
  try {
    if (apply) {
      for (const file of [M1, M2]) {
        const m = /^(\d+)_(.+)\.sql$/.exec(basename(file));
        const sql = await readFile(file, "utf8");
        await q(sql);
        await q("insert into supabase_migrations.schema_migrations (version, name, statements) values ($1, $2, $3)", [m[1], m[2], [sql]]);
      }
      await migrationChecks();
    }
    const run = randomUUID().slice(0, 8);
    const ppl = Object.fromEntries(
      (await rows("select u.email, u.id from auth.users u where u.email like 'demo.%@blindr.invalid'")).map((r) => [
        r.email.split(".")[1].split("@")[0],
        r.id,
      ]),
    );
    const { marcus, priya, isabelle, diego, sofia } = ppl;
    assert.ok(marcus && priya && isabelle && diego && sofia, "demo people present");
    // In this transaction only: Sofia a curator, Marcus's cellar PUBLIC, Diego's FRIENDS (Priya his friend).
    await q("update profiles set role = 'ADMIN' where id = $1", [sofia]);
    assert.equal((await one("select is_curator from profiles where id = $1", [sofia])).is_curator, true);
    await q("update profiles set cellar_visibility = 'PUBLIC' where id = $1", [marcus]);
    await q("update profiles set cellar_visibility = 'FRIENDS' where id = $1", [diego]);
    await q("update profiles set cellar_visibility = 'PRIVATE' where id = $1", [isabelle]);
    await q("insert into friendships (user_id, friend_id) values ($1, $2)", [priya, diego]);

    const ref = await one(
      "select country_id, region_id, appellation_id, primary_grape_id, producer_id from catalog_wines where merged_into is null and not blind_pending limit 1",
    );
    const refs = [ref.country_id, ref.region_id, ref.appellation_id, ref.primary_grape_id, ref.producer_id];
    const payload = (tag) => ({
      country_id: ref.country_id, region_id: ref.region_id, appellation_id: ref.appellation_id,
      primary_grape_id: ref.primary_grape_id, secondary_grape_id: null, producer_id: ref.producer_id,
      type_designation_id: null, vintage_kind: "YEAR", vintage_year: 2016, vintage_tawny_years: null,
      wine_name: `Rule1b probe ${tag} ${run}`, colour: "RED", style: "STILL",
    });
    // The app's one catalog write: the flight path sends "hidden": true (never for OPEN); every other path nothing.
    const foc = async (who, tag, hidden = false) =>
      must(await as(who, async () => (await one("select find_or_create_catalog_wine($1::jsonb) id", [JSON.stringify(hidden ? { ...payload(tag), hidden: true } : payload(tag))])).id), "foc " + tag);
    const nameOf = (tag) => `Rule1b probe ${tag} ${run}`;
    const lot = async (owner, wine, qty) =>
      (await one("insert into cellar_lots (owner_id, catalog_wine_id, quantity, purchased_quantity) values ($1,$2,$3,greatest($3,1)) returning id", [owner, wine, qty])).id;
    const tasting = async (host, { source = "HOST_PROVIDES", mode = "BLIND", status = "DRAFT" } = {}) =>
      (await one(
        `insert into tastings (name, host_id, timing_mode, wine_source, status, reveal_mode)
         values ('Rule1b probe', $1, 'LIVE', $2, $3, $4) returning id`,
        [host, source, status, mode],
      )).id;
    const join = async (t, user) =>
      (await one("insert into tasting_participants (tasting_id, user_id, status) values ($1,$2,'JOINED') returning id", [t, user])).id;
    let pos = 500;
    // insertTastingWineCore as the adder: the wines row, then the answer key.
    const glass = async (who, t, wineId, { contributor = null } = {}) =>
      must(await as(who, async () => {
        const w = (await one("insert into wines (tasting_id, position, contributor_participant_id) values ($1,$2,$3) returning id", [t, ++pos, contributor])).id;
        await q(
          `insert into wine_answers (wine_id, country_id, region_id, appellation_id, primary_grape_id, producer_id, vintage_kind, vintage_year, catalog_wine_id)
           values ($1,$2,$3,$4,$5,$6,'YEAR',2016,$7)`,
          [w, ...refs, wineId],
        );
        return w;
      }), "glass");
    const glassFromLot = async (who, t, lotId, wineId) => {
      const g = await glass(who, t, wineId);
      must(await as(who, () => q("insert into wine_pour_intents (wine_id, owner_id, cellar_lot_id, consume_on_start) values ($1,$2,$3,true)", [g, who, lotId])), "intent");
      return g;
    };
    const openGlass = async (t, wineId) => {
      const w = (await one("insert into wines (tasting_id, position, is_revealed) values ($1,$2,true) returning id", [t, ++pos])).id;
      await q(
        `insert into wine_answers (wine_id, country_id, region_id, appellation_id, primary_grape_id, producer_id, vintage_kind, vintage_year, catalog_wine_id)
         values ($1,$2,$3,$4,$5,$6,'YEAR',2016,$7)`,
        [w, ...refs, wineId],
      );
      return w;
    };
    const edit = (who, g, wineId) => as(who, async () => (await q("update wine_answers set catalog_wine_id = $2 where wine_id = $1", [g, wineId])).rowCount);
    const removeGlass = (who, g) => as(who, async () => { await q("select remove_flight_glass($1)", [g]); return "removed"; });
    const reveal = (who, g) => as(who, async () => { await q("select reveal_wine($1)", [g]); return "revealed"; });
    const start = async (t, host) => {
      await q("update tastings set status = 'IN_PROGRESS' where id = $1", [t]);
      return as(host, async () => (await rows("select outcome from draw_down_flight_cellar_lots($1)", [t])).map((r) => r.outcome));
    };
    const close = (who, t) => as(who, async () => (await q("update tastings set status = 'CLOSED' where id = $1", [t])).rowCount);
    const hidden = async (id) => (await one("select blind_pending from catalog_wines where id = $1", [id]))?.blind_pending ?? null;
    const reads = (who, table, id) => as(who, async () => (await rows(`select id from ${table} where id = $1`, [id])).length);
    const answerOf = async (g) => (await one("select catalog_wine_id from wine_answers where wine_id = $1", [g]))?.catalog_wine_id ?? null;
    const usage = (who, id) => as(who, async () => {
      const u = await one("select bottles, consumption_count from catalog_wine_usage($1)", [id]);
      return [u.bottles, u.consumption_count];
    });
    const direct = (who, lotId) => as(who, async () => (await rows("select quantity from cellar_lots where id = $1", [lotId])).map((r) => r.quantity));
    const shared = (who, owner, lotId) => as(who, async () =>
      (await rows("select quantity, updated_at = created_at as stamp_masked from shared_cellar_lots($1::uuid) s where s.id = $2 and s.quantity > 0", [owner, lotId]))
        .map((r) => [r.quantity, r.stamp_masked]));
    const merge = (who, loser, winner) => as(who, async () => { await q("select merge_catalog_wines($1, $2)", [loser, winner]); return "ok"; });
    const patch = (who, id, set) => as(who, async () => (await q(`update catalog_wines set ${set} where id = $1`, [id])).rowCount);

    // ======================= A. F4 + F5: born hidden, never hidden by a pour =======================
    const T1 = await tasting(marcus);
    await join(T1, marcus);
    await join(T1, priya);
    const C = await foc(isabelle, "C");                                                     // a catalog add: public, no lot, no note
    check("A1", "Priya reads Isabelle's catalog-only C before any pour", await reads(priya, "catalog_wines", C), 1, 1);
    await glass(marcus, T1, C);                                                              // Marcus pours C (search row)
    check("A2", "C.blind_pending after Marcus pours it (F4)", await hidden(C), true, false);
    check("A3", "Priya reads C after the pour (F4: it vanished)", await reads(priya, "catalog_wines", C), 0, 1);
    check("A4", "Isabelle (C's creator, not the adder) reads C.blind_pending", await as(isabelle, async () => (await one("select blind_pending from catalog_wines where id = $1", [C])).blind_pending), true, false);
    check("A5", "Priya's search_catalog_wines finds C while poured", await as(priya, async () => (await rows("select id from search_catalog_wines($1, 50) where id = $2", [nameOf("C"), C])).length), 0, 1);
    const N = await foc(marcus, "N", true);                                                  // a flight add of a brand-new wine
    check("A6", "brand-new N.blind_pending before its glass exists (F5)", await hidden(N), false, true);
    check("A7", "Priya reads N in the window before its answer key (F5)", await reads(priya, "catalog_wines", N), 1, 0);
    check("A8", "Marcus (creator) reads N in the window", await reads(marcus, "catalog_wines", N), 1, 1);
    const G2 = await glass(marcus, T1, N);
    check("A9", "N after its answer key: blind_pending / Priya reads it", [await hidden(N), await reads(priya, "catalog_wines", N)], [true, 0], [true, 0]);
    const TO = await tasting(marcus, { mode: "OPEN", status: "IN_PROGRESS" });
    const NO = await foc(marcus, "NO");                                                      // OPEN: the app sends no "hidden"
    await openGlass(TO, NO);
    check("A10", "OPEN board: a new wine is public at once (Priya reads it)", [await hidden(NO), await reads(priya, "catalog_wines", NO)], [false, 1], [false, 1]);
    const K = await foc(isabelle, "K");
    check("A11", "a non-flight add (catalog, cellar, note) is public", await hidden(K), false, false);
    const TD = await tasting(diego);
    await join(TD, diego);
    const N_again = await foc(diego, "N", true);                                             // Diego keys N's exact identity
    check("A12", "a second adder of N's identity links the same row (no 23505)", N_again === N, true, true);
    await glass(diego, TD, N);
    check("A13", "N stays hidden with two unrevealed glasses", await hidden(N), true, true);
    check("A14", "F12 residual: Diego reads N's creator (Marcus) through his own answer key", await as(diego, async () => (await one("select created_by = $2 as by_marcus from catalog_wines where id = $1", [N, marcus]))?.by_marcus ?? null), true, true);

    // ======================= B. F6: system columns =======================
    const C2a = await foc(isabelle, "C2a");
    const C2b = await foc(isabelle, "C2b");
    const C2c = await foc(isabelle, "C2c");
    const C2 = await foc(isabelle, "C2");
    check("B1", "Isabelle hides her own public wine (blind_pending = true)", await patch(isabelle, C2a, "blind_pending = true"), 1, { error: DENIED_CW });
    check("B2", "Isabelle tombstones her own wine without a merge (merged_into)", await patch(isabelle, C2b, `merged_into = '${C}'`), 1, { error: DENIED_CW });
    check("B3", "Sofia (curator) re-assigns created_by", await patch(sofia, C2c, `created_by = '${priya}'`), 1, { error: DENIED_CW });
    check("B4", "Isabelle's Manage wine columns (name, text, photo, alcohol, price)", await patch(isabelle, C2,
      "wine_name = wine_name || ' x', description = 'b5', image_url = 'https://example.invalid/b5.jpg', alcohol_percent = 13, estimated_price = 100, estimated_price_currency = 'DKK'"), 1, 1);
    check("B5", "Sofia (curator) renames Isabelle's wine", await patch(sofia, C2, "wine_name = wine_name || ' y'"), 1, 1);
    check("B6", "anon renames a wine", await patch("anon", C2, "wine_name = 'anon'"), 0, { error: DENIED_CW });
    check("B7", "Isabelle inserts a row directly with merged_into set", await as(isabelle, async () => (await q(
      `insert into catalog_wines (country_id, region_id, appellation_id, primary_grape_id, producer_id, vintage_kind, vintage_year, colour, style, wine_name, created_by, merged_into)
       values ($1,$2,$3,$4,$5,'YEAR',2016,'RED','STILL',$6,$7,$8)`, [...refs, nameOf("B7"), isabelle, C])).rowCount), 1, { error: DENIED_CW });
    check("B8", "Isabelle inserts a row directly with the identity columns only", await as(isabelle, async () => (await q(
      `insert into catalog_wines (country_id, region_id, appellation_id, primary_grape_id, producer_id, vintage_kind, vintage_year, colour, style, wine_name, created_by)
       values ($1,$2,$3,$4,$5,'YEAR',2016,'RED','STILL',$6,$7)`, [...refs, nameOf("B8"), isabelle])).rowCount), 1, 1);
    check("B9", "Marcus un-hides N (his own unrevealed glass)", await patch(marcus, N, "blind_pending = false"), { error: GUARD }, { error: DENIED_CW });

    // ======================= C. F7: merge =======================
    const L = await foc(isabelle, "L");
    await lot(isabelle, L, 1);                                                               // L public in both phases
    const Wn = await foc(isabelle, "Wn");                                                    // catalog-only winner
    const G3 = await glass(marcus, T1, L);                                                   // Marcus's unrevealed glass of L
    check("C1", "anon calls merge_catalog_wines", await merge("anon", L, Wn), { error: "P0001 not authorised to merge this catalog wine" }, { error: "42501 permission denied for function merge_catalog_wines" });
    check("C2", "Isabelle (L's creator, not the adder) merges L into Wn", await merge(isabelle, L, Wn), "ok", "ok");
    check("C3", "Marcus's unrevealed answer key after the merge", (await answerOf(G3)) === Wn ? "Wn" : (await answerOf(G3)) === L ? "L" : "?", "Wn", "L");
    check("C4", "Wn after the merge: blind_pending / Priya reads it (F7: it vanished)", [await hidden(Wn), await reads(priya, "catalog_wines", Wn)], [true, 0], [false, 1]);
    check("C5", "Isabelle reads Wn.blind_pending (her own winner)", await as(isabelle, async () => (await one("select blind_pending from catalog_wines where id = $1", [Wn])).blind_pending), true, false);
    check("C6", "Priya reads L's tombstone", await as(priya, async () => (await one("select merged_into = $2 as merged from catalog_wines where id = $1", [L, Wn]))?.merged ?? null), true, true);
    const X = await foc(isabelle, "X");
    check("C7", "Sofia (curator) merges X into Marcus's hidden N", await merge(sofia, X, N), "ok", { error: NOT_FOUND });
    const X2 = await foc(isabelle, "X2");
    check("C8", "Sofia merges X2 into a wine that does not exist (same words as C7)", await merge(sofia, X2, randomUUID()), { error: NOT_FOUND }, { error: NOT_FOUND });
    const M = await foc(marcus, "M");
    await lot(isabelle, M, 1);
    const Wn2 = await foc(isabelle, "Wn2");
    await glass(marcus, T1, M);
    check("C9", "Marcus merges public M, in his own unrevealed glass, into Wn2", await merge(marcus, M, Wn2), "ok", { error: GUARD });
    check("C10", "Wn2 after C9: blind_pending", await hidden(Wn2), true, false);
    const R = await foc(isabelle, "R");
    const Wn3 = await foc(isabelle, "Wn3");
    const note = (await one("insert into wset_notes (author_id, catalog_wine_id) values ($1, $2) returning id", [priya, R])).id;
    const GO = await openGlass(TO, R);
    check("C11", "Sofia merges R (a note, a revealed OPEN glass) into Wn3: ok / note moved / answer moved",
      [await merge(sofia, R, Wn3), (await one("select catalog_wine_id from wset_notes where id = $1", [note])).catalog_wine_id === Wn3, (await answerOf(GO)) === Wn3],
      ["ok", true, true], ["ok", true, true]);
    const L2 = await foc(isabelle, "L2");
    const Wn4 = await foc(isabelle, "Wn4");
    check("C12", "Isabelle merges an unpoured L2: the same outcome as C2", await merge(isabelle, L2, Wn4), "ok", "ok");

    // ======================= D. F8: a PUBLIC or FRIENDS cellar at Start =======================
    const Pw = await foc(isabelle, "P");
    const LI = await lot(isabelle, Pw, 1);                                                   // Isabelle PRIVATE, keeps P public
    const P1 = await foc(isabelle, "P1");
    await lot(isabelle, P1, 1);
    const LM = await lot(marcus, Pw, 2);
    const LM1 = await lot(marcus, P1, 1);
    const T2 = await tasting(marcus);
    await join(T2, marcus);
    await join(T2, priya);
    const G5 = await glassFromLot(marcus, T2, LM, Pw);
    await glassFromLot(marcus, T2, LM1, P1);
    const PM = await foc(marcus, "PM");                                                      // Marcus's own public wine (Isabelle's lot)
    await lot(isabelle, PM, 1);
    await glass(marcus, T2, PM);
    check("D1", "Priya reads Marcus's PUBLIC lot LM directly, before Start", await direct(priya, LM), [2], []);
    check("D2", "Priya's shared view of LM before Start", await shared(priya, marcus, LM), { error: NO_SHARED }, [[2, true]]);
    check("D3", "Marcus presses Start (the D11 draw-down)", await start(T2, marcus), ["drawn", "drawn"], ["drawn", "drawn"]);
    check("D4", "Priya reads LM directly after Start (F8: 2 -> 1)", await direct(priya, LM), [1], []);
    check("D5", "Priya's shared view of LM after Start (masked)", await shared(priya, marcus, LM), { error: NO_SHARED }, [[2, true]]);
    check("D6", "the one-bottle lot LM1 after Start: Priya's direct read / shared view (quantity > 0)",
      [await as(priya, async () => (await rows("select quantity from cellar_lots where id = $1 and quantity > 0", [LM1])).length), await shared(priya, marcus, LM1)],
      [0, { error: NO_SHARED }], [0, [[1, true]]]);
    check("D7", "Marcus reads his own lot (the owner's truth)", await direct(marcus, LM), [1], [1]);
    check("D8", "Diego's shared view of Marcus's cellar equals Priya's", JSON.stringify(await shared(diego, marcus, LM)) === JSON.stringify(await shared(priya, marcus, LM)), true, true);
    const LD = await lot(diego, Pw, 2);
    const T3 = await tasting(diego);
    await join(T3, diego);
    await join(T3, priya);
    await glassFromLot(diego, T3, LD, Pw);
    await start(T3, diego);
    check("D9", "FRIENDS cellar after Start: Priya direct / Priya shared / Isabelle (stranger) shared",
      [await direct(priya, LD), await shared(priya, diego, LD), await shared(isabelle, diego, LD)],
      [[1], { error: NO_SHARED }, { error: NO_SHARED }], [[], [[2, true]], []]);
    check("D10", "PRIVATE cellar: Priya's direct / shared read of Isabelle's lot", [await direct(priya, LI), await shared(priya, isabelle, LI)], [[], { error: NO_SHARED }], [[], []]);
    check("D11", "anon calls shared_cellar_lots", await as("anon", async () => (await rows("select id from shared_cellar_lots($1::uuid)", [marcus])).length),
      { error: NO_SHARED }, { error: "42501 permission denied for function shared_cellar_lots" });
    check("D12", "Marcus edits his own public PM while it is in his unrevealed glass (F3 guard, unchanged) / Isabelle's P (not his: RLS, 0 rows)",
      [await patch(marcus, PM, "description = 'x'"), await patch(marcus, Pw, "description = 'x'")], [{ error: GUARD }, 0], [{ error: GUARD }, 0]);
    check("D13", "Marcus's add-wine search finds P while he has poured it", await as(marcus, async () => (await rows("select id from search_catalog_wines($1, 50) where id = $2", [nameOf("P"), Pw])).length), 1, 1);
    check("D14", "reveal G5, then Priya's shared view of LM (unmasked at the reveal)", [await reveal(marcus, G5), await shared(priya, marcus, LM)], ["revealed", { error: NO_SHARED }], ["revealed", [[1, true]]]);

    // ======================= E. F9: new reference rows (owner decision; unchanged) =======================
    const prodName = `Rule1b Probe Producer ${run}`;
    const newProducer = must(await as(marcus, async () => (await one("select find_or_create_producer($1, $2) id", [prodName, ref.region_id])).id), "producer");
    check("E1", "Priya reads the producer Marcus just created for a flight", await reads(priya, "producers", newProducer), 1, 1);
    check("E2", "Priya's search_producers finds it", await as(priya, async () => (await rows("select id from search_producers($1, $2) where id = $3", [prodName, ref.region_id, newProducer])).length), 1, 1);
    const newGrape = must(await as(marcus, async () => (await one("insert into grapes (name) values ($1) returning id", [`Rule1b probe grape ${run}`])).id), "grape");
    check("E3", "Priya reads the grape Marcus just created", await reads(priya, "grapes", newGrape), 1, 1);

    // ======================= F. F10: the unidentified glass =======================
    const T4 = await tasting(marcus, { status: "IN_PROGRESS" });
    await join(T4, marcus);
    await join(T4, priya);
    const unidentified = (who, name) => as(who, async () => (await one(
      `insert into catalog_wines_unidentified (country_id, region_id, producer_id, primary_grape_id, vintage_kind, vintage_year, colour, style, wine_name, reason, created_by)
       values ($1,$2,$3,$4,'YEAR',2011,'RED','STILL',$5,'probe',$6) returning id`,
      [ref.country_id, ref.region_id, ref.producer_id, ref.primary_grape_id, name, who])).id);
    const unidentifiedAnswer = (who, g, u) => as(who, () => q(
      `insert into wine_answers (wine_id, country_id, region_id, primary_grape_id, producer_id, vintage_kind, vintage_year, unidentified_wine_id)
       values ($1,$2,$3,$4,$5,'YEAR',2011,$6)`, [g, ref.country_id, ref.region_id, ref.primary_grape_id, ref.producer_id, u]));
    const G7 = must(await as(marcus, async () => (await one("insert into wines (tasting_id, position) values ($1,$2) returning id", [T4, ++pos])).id), "G7");
    const U = must(await unidentified(marcus, `Secret cuvee ${run}`), "U");
    check("F1", "Priya reads the unidentified row before its answer key (the window)", await reads(priya, "catalog_wines_unidentified", U), 1, 0);
    must(await unidentifiedAnswer(marcus, G7, U), "U answer");
    check("F2", "Priya reads it with the glass unrevealed (F10)", await reads(priya, "catalog_wines_unidentified", U), 1, 0);
    check("F3", "Priya finds it by created_by = Marcus", await as(priya, async () => (await rows("select id from catalog_wines_unidentified where created_by = $1", [marcus])).some((r) => r.id === U)), true, false);
    check("F4", "Marcus (creator, adder) reads it", await reads(marcus, "catalog_wines_unidentified", U), 1, 1);
    check("F5", "Sofia (curator, not a member) / Isabelle (outsider) read it", [await reads(sofia, "catalog_wines_unidentified", U), await reads(isabelle, "catalog_wines_unidentified", U)], [1, 1], [0, 0]);
    check("F6", "Priya reads the glass's answer key", await as(priya, async () => (await rows("select wine_id from wine_answers where wine_id = $1", [G7])).length), 0, 0);
    check("F7", "reveal G7, then Priya / Isabelle read the row", [await reveal(marcus, G7), await reads(priya, "catalog_wines_unidentified", U), await reads(isabelle, "catalog_wines_unidentified", U)], ["revealed", 1, 1], ["revealed", 1, 1]);
    const G8 = must(await as(marcus, async () => (await one("insert into wines (tasting_id, position) values ($1,$2) returning id", [T4, ++pos])).id), "G8");
    const U2 = must(await unidentified(marcus, `Other cuvee ${run}`), "U2");
    must(await unidentifiedAnswer(marcus, G8, U2), "U2 answer");
    const N3 = await foc(marcus, "N3", true);
    check("F8", "Marcus Edits G8 from U2 to a catalog identity", await as(marcus, async () => (await q("update wine_answers set unidentified_wine_id = null, catalog_wine_id = $2 where wine_id = $1", [G8, N3])).rowCount), 1, 1);
    check("F9", "the abandoned U2: Priya / Marcus read it", [await reads(priya, "catalog_wines_unidentified", U2), await reads(marcus, "catalog_wines_unidentified", U2)], [1, 1], [0, 1]);
    const T5 = await tasting(marcus, { source: "PARTICIPANT_CONTRIBUTED", status: "IN_PROGRESS" });
    await join(T5, marcus);
    const diegoSeat = await join(T5, diego);
    const G9 = must(await as(diego, async () => (await one("insert into wines (tasting_id, position, contributor_participant_id) values ($1,$2,$3) returning id", [T5, ++pos, diegoSeat])).id), "G9");
    const U3 = must(await unidentified(diego, `BYO cuvee ${run}`), "U3");
    must(await unidentifiedAnswer(diego, G9, U3), "U3 answer");
    check("F10", "BYO: Diego (contributor) / Marcus (host, not the adder) read Diego's unidentified row", [await reads(diego, "catalog_wines_unidentified", U3), await reads(marcus, "catalog_wines_unidentified", U3)], [1, 1], [1, 0]);
    must(await as(priya, () => q("insert into wset_notes (author_id, unidentified_wine_id) values ($1, $2)", [priya, U])), "Priya's note on U");
    must(await as(marcus, () => q("delete from tastings where id = $1", [T4])), "delete T4");
    check("F11", "after T4 is deleted: Priya (a note naming U) / Isabelle read U", [await reads(priya, "catalog_wines_unidentified", U), await reads(isabelle, "catalog_wines_unidentified", U)], [1, 1], [1, 0]);

    // ======================= G. F11: Edit, Swap, Remove =======================
    const T6 = await tasting(marcus);
    await join(T6, marcus);
    await join(T6, priya);
    const N4 = await foc(marcus, "N4", true);
    const G10 = await glass(marcus, T6, N4);
    check("G1", "the flight fill of hidden N4 after its answer key (fillFlightCatalogWine)", await patch(marcus, N4, "description = 'flight fill'"), 1, 1);
    const N5 = await foc(marcus, "N5", true);
    check("G2", "Edit: Marcus re-points G10 from N4 to N5", await edit(marcus, G10, N5), 1, 1);
    check("G3", "N4 after the Edit: blind_pending / Priya reads it", [await hidden(N4), await reads(priya, "catalog_wines", N4)], [false, 1], [true, 0]);
    const N6 = await foc(marcus, "N6", true);
    const G11 = await glass(marcus, T6, N6);
    check("G4", "Swap G11 to the public P, then N6: blind_pending / Priya reads it", [await edit(marcus, G11, Pw), await hidden(N6), await reads(priya, "catalog_wines", N6)], [1, false, 1], [1, true, 0]);
    const N7 = await foc(marcus, "N7", true);
    const G12 = await glass(marcus, T6, N7);
    check("G5", "Remove G12, then N7: blind_pending / Priya reads it", [await removeGlass(marcus, G12), await hidden(N7), await reads(priya, "catalog_wines", N7)], ["removed", false, 1], ["removed", true, 0]);
    const N7b = await foc(marcus, "N7b", true);
    const G13 = await glass(marcus, T6, N7b);                                                // the corrected re-add
    await q("update tastings set status = 'IN_PROGRESS' where id = $1", [T6]);
    check("G6", "reveal G10 (now N5): N5 / N4 blind_pending, Priya reads N4", [await reveal(marcus, G10), await hidden(N5), await hidden(N4), await reads(priya, "catalog_wines", N4)], ["revealed", false, false, 1], ["revealed", false, false, 1]);
    check("G7", "reveal G11 (now P): N6 blind_pending", [await reveal(marcus, G11), await hidden(N6)], ["revealed", false], ["revealed", false]);
    check("G8", "N7 (its glass removed) while G13 is unrevealed", await hidden(N7), false, true);
    check("G9", "reveal G13: N7b / N7 blind_pending (N7's glass was removed: only a glass that pours it can release it)", [await reveal(marcus, G13), await hidden(N7b), await hidden(N7)], ["revealed", false, false], ["revealed", false, true]);
    check("G10", "Marcus closes T6 with every glass revealed: N7 / Priya reads N7 (a close releases nothing)", [await close(marcus, T6), await hidden(N7), await reads(priya, "catalog_wines", N7)], [1, false, 1], [1, true, 0]);
    const T7 = await tasting(marcus);
    await join(T7, marcus);
    const N8 = await foc(marcus, "N8", true);
    await glass(marcus, T7, N8);
    const N9 = await foc(marcus, "N9", true);
    const G15 = await glass(marcus, T7, N9);
    await removeGlass(marcus, G15);
    check("G11", "T7 closed with a glass never revealed: N9 (removed) / N8 (never revealed)", [await close(marcus, T7), await hidden(N9), await hidden(N8)], [1, false, true], [1, true, true]);
    const T8 = await tasting(marcus);
    await join(T8, marcus);
    const N10 = await foc(marcus, "N10", true);
    const G16 = await glass(marcus, T8, N10);
    const N11 = await foc(marcus, "N11", true);
    await edit(marcus, G16, N11);
    check("G12", "T8: N10 after an Edit / after Marcus deletes the tasting (N10, N11; a delete releases nothing)",
      [await hidden(N10), must(await as(marcus, async () => (await q("delete from tastings where id = $1", [T8])).rowCount), "delete T8"), await hidden(N10), await hidden(N11)],
      [false, 1, false, false], [true, 1, true, true]);
    // Counts: a pour whose glass is swapped away (F11, spec R3 of 20260919213300).
    const Q = await foc(isabelle, "Q");
    await lot(isabelle, Q, 1);
    const Q2 = await foc(isabelle, "Q2");
    await lot(isabelle, Q2, 1);
    const LS = await lot(marcus, Q, 2);
    const T9 = await tasting(marcus);
    await join(T9, marcus);
    await join(T9, priya);
    const G17 = await glassFromLot(marcus, T9, LS, Q);
    await start(T9, marcus);
    check("G13", "Priya usage(Q) after Start (bottles, consumption)", await usage(priya, Q), [3, 0], [3, 0]);
    must(await as(marcus, () => q("delete from wine_pour_intents where wine_id = $1", [G17])), "swap intent");
    await edit(marcus, G17, Q2);
    check("G14", "Swap G17 to Q2: Priya usage(Q) / Priya's shared view of LS", [await usage(priya, Q), await shared(priya, marcus, LS)], [[2, 1], { error: NO_SHARED }], [[3, 0], [[2, true]]]);
    check("G15", "reveal G17 (now Q2): Priya usage(Q)", [await reveal(marcus, G17), await usage(priya, Q)], ["revealed", [2, 1]], ["revealed", [2, 1]]);
    // Counts: a pour whose glass is removed.
    const Q3 = await foc(isabelle, "Q3");
    await lot(isabelle, Q3, 1);
    const LR = await lot(marcus, Q3, 2);
    const T10 = await tasting(marcus);
    await join(T10, marcus);
    await join(T10, priya);
    const G18 = await glassFromLot(marcus, T10, LR, Q3);
    const N12 = await foc(marcus, "N12", true);
    const G19 = await glass(marcus, T10, N12);
    await start(T10, marcus);
    check("G16", "Remove G18 after Start: Priya usage(Q3)", [await removeGlass(marcus, G18), await usage(priya, Q3)], ["removed", [2, 1]], ["removed", [3, 0]]);
    check("G17", "reveal G19: Priya usage(Q3) (still held: G18 was removed)", [await reveal(marcus, G19), await usage(priya, Q3)], ["revealed", [2, 1]], ["revealed", [3, 0]]);
    check("G18", "close T10 (all revealed): Priya usage(Q3) (a close releases nothing: held for good)", [await close(marcus, T10), await usage(priya, Q3)], [1, [2, 1]], [1, [3, 0]]);

    // ======================= H. only a reveal releases a hold (review R1-R3) =======================
    const unhideAudit = (who, id) => as(who, async () => (await rows(
      `select 1 from catalog_wine_edits where catalog_wine_id = $1
          and (before->>'blind_pending')::boolean and not (after->>'blind_pending')::boolean`, [id])).length);
    const holdsOn = async (id) => (await one("select to_regclass('public.flight_holds') is not null as t")).t
      ? Number((await one("select count(*) n from flight_holds where catalog_wine_id = $1", [id])).n)
      : null;
    const delTasting = async (who, t) => must(await as(who, async () => (await q("delete from tastings where id = $1", [t])).rowCount), "delete tasting");
    // R1: a DRAFT tasting deleted (to set it up again), and the same bottle keyed into the new one.
    const TH1 = await tasting(marcus);
    await join(TH1, marcus);
    await join(TH1, priya);
    const NH = await foc(marcus, "NH", true);
    await glass(marcus, TH1, NH);
    check("H1", "Marcus deletes DRAFT TH1 holding brand-new NH: deleted / NH hidden / Priya reads NH",
      [await delTasting(marcus, TH1), await hidden(NH), await reads(priya, "catalog_wines", NH)], [1, false, 1], [1, true, 0]);
    const TH2 = await tasting(marcus, { status: "IN_PROGRESS" });
    await join(TH2, marcus);
    await join(TH2, priya);
    const NH_again = await foc(marcus, "NH", true);
    await glass(marcus, TH2, NH);
    check("H2", "NH keyed into running TH2: same row / NH hidden / Priya reads NH / Priya reads an un-hide audit row of NH",
      [NH_again === NH, await hidden(NH), await reads(priya, "catalog_wines", NH), await unhideAudit(priya, NH)],
      [true, true, 0, 0], [true, true, 0, 0]);
    // R2 + R3: a glass removed from a running tasting (the bottle saved for next time).
    const TH3 = await tasting(marcus, { status: "IN_PROGRESS" });
    await join(TH3, marcus);
    await join(TH3, priya);
    const NS = await foc(marcus, "NS", true);
    const GS1 = await glass(marcus, TH3, NS);
    const GS2 = await glass(marcus, TH3, await foc(isabelle, "PS"));
    check("H3", "Remove GS1: NS hidden / Priya reads NS / holds on NS",
      [await removeGlass(marcus, GS1), await hidden(NS), await reads(priya, "catalog_wines", NS), await holdsOn(NS)],
      ["removed", false, 1, null], ["removed", true, 0, 1]);
    check("H4", "R3: Marcus's search_catalog_wines finds NS (found, blind_pending) and the add-wine search keeps it (searchShowsCatalogWine: public or his own) / Priya's search finds NS",
      [await as(marcus, async () => {
        const r = await rows("select cw.blind_pending, cw.created_by from search_catalog_wines($1, 50) s join catalog_wines cw on cw.id = s.id where s.id = $2", [nameOf("NS"), NS]);
        return [r.length, r[0]?.blind_pending ?? null, r.length === 1 && (!r[0].blind_pending || r[0].created_by === marcus)];
      }), await as(priya, async () => (await rows("select id from search_catalog_wines($1, 50) where id = $2", [nameOf("NS"), NS])).length)],
      [[1, false, true], 1], [[1, true, true], 0]);
    check("H5", "reveal GS2 and close TH3 (every glass revealed): NS hidden / Priya reads NS",
      [await reveal(marcus, GS2), await close(marcus, TH3), await hidden(NS), await reads(priya, "catalog_wines", NS)],
      ["revealed", 1, false, 1], ["revealed", 1, true, 0]);
    const TH4 = await tasting(marcus, { status: "IN_PROGRESS" });
    await join(TH4, marcus);
    await join(TH4, priya);
    const NS_again = await foc(marcus, "NS", true);
    const GS4 = await glass(marcus, TH4, NS);
    check("H6", "NS poured in running TH4: same row / NS hidden / Priya reads NS / Priya reads an un-hide audit row of NS",
      [NS_again === NS, await hidden(NS), await reads(priya, "catalog_wines", NS), await unhideAudit(priya, NS)],
      [true, true, 0, 0], [true, true, 0, 0]);
    check("H7", "reveal GS4 (the glass that pours it publishes it): NS hidden / Priya reads NS / holds on NS",
      [await reveal(marcus, GS4), await hidden(NS), await reads(priya, "catalog_wines", NS), await holdsOn(NS)],
      ["revealed", false, 1, null], ["revealed", false, 1, 0]);
    // A started tasting deleted (to set it up again): its pours stay masked.
    const Q4 = await foc(isabelle, "Q4");
    await lot(isabelle, Q4, 1);
    const LQ4 = await lot(marcus, Q4, 2);
    const TH5 = await tasting(marcus);
    await join(TH5, marcus);
    await join(TH5, priya);
    await glassFromLot(marcus, TH5, LQ4, Q4);
    await start(TH5, marcus);
    check("H8", "Marcus deletes started TH5 (a pour of LQ4): deleted / Priya usage(Q4) / Priya's shared view of LQ4 / Marcus's own LQ4",
      [await delTasting(marcus, TH5), await usage(priya, Q4), await shared(priya, marcus, LQ4), await direct(marcus, LQ4)],
      [1, [2, 1], { error: NO_SHARED }, [1]], [1, [3, 0], [[2, true]], [1]]);

    // ======================= C (continued): the deferred answer key moves at its reveal =======================
    await q("update tastings set status = 'IN_PROGRESS' where id = $1", [T1]);
    check("C13", "reveal G3: its answer key / Wn blind_pending / Priya reads Wn", [await reveal(marcus, G3), (await answerOf(G3)) === Wn, await hidden(Wn), await reads(priya, "catalog_wines", Wn)],
      ["revealed", true, false, 1], ["revealed", true, false, 1]);
  } finally {
    await q("rollback").catch(() => {});
  }
}

const live0 = await liveFingerprint();
try {
  if (!APPLIED) await phase("before", false);
  await phase("after", !APPLIED);
} catch (e) {
  failures++;
  console.error("PROBE ERROR", e.message);
}
const live1 = await liveFingerprint();
const same = JSON.stringify(live0) === JSON.stringify(live1);
if (!same) failures++;
console.log(`${same ? "ok  " : "FAIL"} live unchanged after both phases: ${JSON.stringify(live1)}`);
console.log(failures === 0 ? "ALL EXPECTS MET" : `${failures} EXPECT(S) FAILED`);
process.exitCode = failures === 0 ? 0 : 1;
await client.end();
```
