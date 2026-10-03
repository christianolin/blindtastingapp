-- Catalog dedupe, part 2: the clear duplicates from the Cava tasting of 2026-10-02 (owner,
-- 2026-10-03, approved proposal item 5: "merging each pair into one wine; everyone's notes
-- move to the kept entry, and nothing is lost"; and "Its Marc Esteve Vives").
--
-- Two merges, each loser -> winner, with merge_catalog_wines' own semantics (its live body is
-- asserted below, md5 6894957f…): the loser's wset_notes move, the answer keys of REVEALED
-- glasses move (there are none), and the loser keeps its row as a tombstone with
-- merged_into = winner, which every reader already follows or filters. The function itself
-- is not called: it authorises by auth.uid() (creator or curator), and a migration runs with
-- no session. Beyond it, so nothing is lost:
--   - the loser's scan photos (catalog_wine_photos) move to the winner's "More photos";
--   - a winner with no alcohol takes the loser's.
-- Anything else that could point at a loser (cellar lots and consumptions, glasses, flight
-- holds, training attempts, a resolved unidentified wine) must not exist: asserted, so a
-- change since the 2026-10-03 read stops the file instead of being skipped.
--
-- 1. "Òrtus Blanc de Noirs" 2020, white sparkling Cava DO:
--      loser  a31e4ad9-b133-44b0-8084-69cb327e5d76, producer "Mas Esteve Vinyes" (ff257247)
--      winner be1c8b91-92ba-4003-82f5-658225c5e6aa, producer "Marc Esteve Vives" (82f3e13b)
--    Both are one bottle scanned five seconds apart (label reads 14:54:23 and 14:54:28 UTC);
--    the label prints MARC ESTEVE VIVES (the monogram "MEV" read as "Mas Esteve Vinyes"), and
--    the owner confirms the producer. The winner keeps its own blend (Pinot Noir, Mourvèdre)
--    and its Gran Reserva designation.
-- 2. "Nodal" 2021, white sparkling Cava DO, Marc Esteve Vives:
--      loser  e204809a-ada9-4e5f-bd70-17ffcfa896be, "Nódal" (Xarel·lo 60 / Macabeo 30 / Pinot Noir 10)
--      winner 8e7cf420-d12c-4e78-b957-e7d9a8e70df3, "Nodal"  (Macabeo, Xarel·lo)
--    The kept row is the one that matches the label: all three Nodal label reads print the
--    name "NODAL" without an accent and the grapes as "MACABEU · XAREL·LO" (Macabeo first,
--    no Pinot Noir); the loser's 60/30/10 blend with Pinot Noir was typed by hand and nothing
--    on the label supports it. The loser's 11.5 % alcohol (typed by hand) fills the winner's
--    empty alcohol.
-- 3. The producer "Mas Esteve Vinyes" (ff257247) names nothing else: no other catalog wine,
--    answer key, guess, unidentified wine, designation member, favourite, alias or by-hand
--    draft (asserted). The tombstone of merge 1 is repointed to Marc Esteve Vives (the
--    identity index is partial on merged_into is null, so a tombstone never collides), the
--    producer is deleted, and the curated alias "Mas Esteve Vinyes" -> Marc Esteve Vives is
--    added, so a later read of that name resolves to the right producer
--    (find_producer_by_folded_name's alias half).
--
-- NOT merged (owner questions, kept apart on purpose): Miquel Pons NV vs "Semi-sec" NV;
-- Ortus 2020 vs 2022; Nodal 2019 vs 2021; "Forns Raventós" as a wine name vs as a producer.
--
-- Rerunning refuses: the losers must be live (merged_into is null) and the producer present.
-- No begin/commit: the applier owns the transaction.

do $$
declare
  c_mev    constant uuid := '82f3e13b-e8d7-4103-a12b-a20dd1a25a2e';
  c_masv   constant uuid := 'ff257247-9683-4c06-bc9a-4552c9472ce5';
  c_cava   constant uuid := 'c8b32777-b2e2-4975-a9b4-1bff5bc62074';
  c_region constant uuid := '5a6f4563-82d2-440c-865e-86d5626b3dd0';
  c_ortus_l constant uuid := 'a31e4ad9-b133-44b0-8084-69cb327e5d76';
  c_ortus_w constant uuid := 'be1c8b91-92ba-4003-82f5-658225c5e6aa';
  c_nodal_l constant uuid := 'e204809a-ada9-4e5f-bd70-17ffcfa896be';
  c_nodal_w constant uuid := '8e7cf420-d12c-4e78-b957-e7d9a8e70df3';
  v_pair record;
  v_text text;
  v_n int;
  v_notes_before int;
  v_photos_before int;
begin
  -- -------------------------------------------------------------------------
  -- Pre-state
  -- -------------------------------------------------------------------------
  select md5(replace(p.prosrc, chr(13), '')) into v_text
  from pg_proc p where p.oid = to_regprocedure('public.merge_catalog_wines(uuid,uuid)');
  if v_text is distinct from '6894957f77b8107a54e9f186a0973788' then
    raise exception '20261003101000: merge_catalog_wines is not the definition these merges mirror (md5 %)', v_text;
  end if;

  if not exists (select 1 from producers where id = c_mev and name = 'Marc Esteve Vives' and region_id = c_region) then
    raise exception '20261003101000: producer 82f3e13b is not ''Marc Esteve Vives'' in Cava';
  end if;
  if not exists (select 1 from producers where id = c_masv and name = 'Mas Esteve Vinyes') then
    raise exception '20261003101000: producer ff257247 ''Mas Esteve Vinyes'' is gone (already cleaned up?)';
  end if;

  -- Every row by its exact identity, live and public.
  for v_pair in
    select * from (values
      (c_ortus_l, c_masv, 'Òrtus Blanc de Noirs', 2020),
      (c_ortus_w, c_mev,  'Òrtus Blanc de Noirs', 2020),
      (c_nodal_l, c_mev,  'Nódal', 2021),
      (c_nodal_w, c_mev,  'Nodal', 2021)
    ) as t (id, producer_id, wine_name, vintage_year)
  loop
    if not exists (
      select 1 from catalog_wines c
      where c.id = v_pair.id and c.producer_id = v_pair.producer_id and c.wine_name = v_pair.wine_name
        and c.vintage_kind = 'YEAR' and c.vintage_year = v_pair.vintage_year and c.vintage_tawny_years is null
        and c.colour = 'WHITE' and c.style = 'SPARKLING' and c.appellation_id = c_cava
        and c.merged_into is null and not c.blind_pending
    ) then
      raise exception '20261003101000: catalog wine % is not the live, public "%" % it was on 2026-10-03 (already merged?)',
        v_pair.id, v_pair.wine_name, v_pair.vintage_year;
    end if;
  end loop;

  -- Nothing a loser could carry that these merges do not move.
  select count(*) into v_n from (
    select 1 from cellar_lots where catalog_wine_id in (c_ortus_l, c_nodal_l)
    union all select 1 from cellar_consumptions where catalog_wine_id in (c_ortus_l, c_nodal_l)
    union all select 1 from wine_answers where catalog_wine_id in (c_ortus_l, c_nodal_l)
    union all select 1 from flight_holds where catalog_wine_id in (c_ortus_l, c_nodal_l)
    union all select 1 from training_attempts where actual_catalog_wine_id in (c_ortus_l, c_nodal_l)
    union all select 1 from catalog_wines_unidentified where resolved_into_catalog_wine_id in (c_ortus_l, c_nodal_l)
    union all select 1 from catalog_wines where merged_into in (c_ortus_l, c_nodal_l)
  ) x;
  if v_n <> 0 then
    raise exception '20261003101000: % row(s) outside notes and photos now point at a loser; re-read before merging', v_n;
  end if;

  -- The producer to retire names nothing but the Òrtus loser.
  select count(*) into v_n from (
    select 1 from catalog_wines where producer_id = c_masv and id <> c_ortus_l
    union all select 1 from wine_answers where producer_id = c_masv
    union all select 1 from guesses where producer_id = c_masv
    union all select 1 from catalog_wines_unidentified where producer_id = c_masv
    union all select 1 from wine_designation_members where producer_id = c_masv
    union all select 1 from profile_favourite_producers where producer_id = c_masv
    union all select 1 from producer_aliases where producer_id = c_masv
    union all select 1 from wine_identity_drafts where draft -> 'producer' ->> 'id' = c_masv::text
  ) x;
  if v_n <> 0 then
    raise exception '20261003101000: producer ''Mas Esteve Vinyes'' is used by % other row(s); alias it instead of deleting', v_n;
  end if;

  -- The alias is new, and only the producer being retired folds to it today.
  if exists (select 1 from producer_aliases where alias_folded = public.f_search_norm('Mas Esteve Vinyes')) then
    raise exception '20261003101000: an alias for ''Mas Esteve Vinyes'' already exists';
  end if;
  if exists (select 1 from producers where public.f_search_norm(name) = public.f_search_norm('Mas Esteve Vinyes') and id <> c_masv) then
    raise exception '20261003101000: another producer folds to ''Mas Esteve Vinyes''';
  end if;

  -- The counts the 2026-10-03 read found.
  select count(*) into v_notes_before from wset_notes where catalog_wine_id in (c_ortus_l, c_ortus_w, c_nodal_l, c_nodal_w);
  select count(*) into v_photos_before from catalog_wine_photos where catalog_wine_id in (c_ortus_l, c_ortus_w, c_nodal_l, c_nodal_w);
  if (select count(*) from wset_notes where catalog_wine_id = c_ortus_l) <> 1
     or (select count(*) from wset_notes where catalog_wine_id = c_nodal_l) <> 1 then
    raise exception '20261003101000: the losers no longer hold exactly one note each';
  end if;
  if (select count(*) from catalog_wine_photos where catalog_wine_id = c_ortus_l) <> 1
     or (select count(*) from catalog_wine_photos where catalog_wine_id = c_nodal_l) <> 1 then
    raise exception '20261003101000: the losers no longer hold exactly one scan photo each';
  end if;

  -- -------------------------------------------------------------------------
  -- The merges
  -- -------------------------------------------------------------------------
  for v_pair in
    select * from (values (c_ortus_l, c_ortus_w), (c_nodal_l, c_nodal_w)) as t (loser, winner)
  loop
    update wset_notes set catalog_wine_id = v_pair.winner where catalog_wine_id = v_pair.loser;
    get diagnostics v_n = row_count;
    if v_n <> 1 then raise exception '20261003101000: moved % note(s) off %, expected 1', v_n, v_pair.loser; end if;

    update wine_answers wa set catalog_wine_id = v_pair.winner
     where wa.catalog_wine_id = v_pair.loser
       and exists (select 1 from wines w where w.id = wa.wine_id and w.is_revealed);

    update catalog_wine_photos ph set catalog_wine_id = v_pair.winner
     where ph.catalog_wine_id = v_pair.loser
       and not exists (select 1 from catalog_wine_photos o
                        where o.catalog_wine_id = v_pair.winner and o.image_path = ph.image_path);
    get diagnostics v_n = row_count;
    if v_n <> 1 then raise exception '20261003101000: moved % photo(s) off %, expected 1', v_n, v_pair.loser; end if;

    update catalog_wines w set alcohol_percent = l.alcohol_percent
      from catalog_wines l
     where w.id = v_pair.winner and l.id = v_pair.loser
       and w.alcohol_percent is null and l.alcohol_percent is not null;

    update catalog_wines set merged_into = v_pair.winner where id = v_pair.loser and merged_into is null;
    get diagnostics v_n = row_count;
    if v_n <> 1 then raise exception '20261003101000: % was not merged', v_pair.loser; end if;
  end loop;

  -- -------------------------------------------------------------------------
  -- The producer
  -- -------------------------------------------------------------------------
  update catalog_wines set producer_id = c_mev where id = c_ortus_l and producer_id = c_masv and merged_into = c_ortus_w;
  get diagnostics v_n = row_count;
  if v_n <> 1 then raise exception '20261003101000: the Òrtus tombstone was not repointed'; end if;

  delete from producers where id = c_masv;
  get diagnostics v_n = row_count;
  if v_n <> 1 then raise exception '20261003101000: producer ''Mas Esteve Vinyes'' was not deleted'; end if;

  insert into producer_aliases (producer_id, alias) values (c_mev, 'Mas Esteve Vinyes');

  -- -------------------------------------------------------------------------
  -- Post-state
  -- -------------------------------------------------------------------------
  if (select count(*) from wset_notes where catalog_wine_id in (c_ortus_w, c_nodal_w)) <> v_notes_before
     or exists (select 1 from wset_notes where catalog_wine_id in (c_ortus_l, c_nodal_l)) then
    raise exception '20261003101000: notes were lost or left on a loser';
  end if;
  if (select count(*) from catalog_wine_photos where catalog_wine_id in (c_ortus_w, c_nodal_w)) <> v_photos_before then
    raise exception '20261003101000: scan photos were lost or left on a loser';
  end if;
  if (select merged_into from catalog_wines where id = c_ortus_l) is distinct from c_ortus_w
     or (select merged_into from catalog_wines where id = c_nodal_l) is distinct from c_nodal_w then
    raise exception '20261003101000: a loser is not merged into its winner';
  end if;
  if exists (select 1 from catalog_wines where id in (c_ortus_w, c_nodal_w) and (merged_into is not null or blind_pending)) then
    raise exception '20261003101000: a winner is no longer live and public';
  end if;
  if (select alcohol_percent from catalog_wines where id = c_nodal_w) is distinct from 11.5 then
    raise exception '20261003101000: the Nodal winner did not take the 11.5 %% alcohol';
  end if;
  if public.find_producer_by_folded_name('Mas Esteve Vinyes', c_region) is distinct from c_mev
     or public.find_producer_by_folded_name('Mas Esteve Vinyes', null) is distinct from c_mev then
    raise exception '20261003101000: ''Mas Esteve Vinyes'' does not resolve to Marc Esteve Vives';
  end if;
  if public.find_producer_by_folded_name('Marc Esteve Vives', c_region) is distinct from c_mev then
    raise exception '20261003101000: ''Marc Esteve Vives'' no longer resolves to itself';
  end if;
  if (select count(*) from catalog_wines where producer_id = c_mev and merged_into is null) <> 5 then
    raise exception '20261003101000: Marc Esteve Vives should hold 5 live wines, holds %',
      (select count(*) from catalog_wines where producer_id = c_mev and merged_into is null);
  end if;
end $$;
