-- Catalog dedupe, part 3: the Cava tasting of 2026-10-02, cleaned up to the owner's answers
-- (2026-10-03). Replaces the prepared, never-applied 20261003101000_cava_duplicates_cleanup.
--
-- Owner, verbatim: "nodal was 2019. Ortus was 2020. Miguel pons was both NV but it was a semi
-- sec. The others were brut nature." Producer: "Forns Raventós (Recommended)" — "The name on
-- the label and in shops. "Marc Esteve Vives" and "Mas Esteve Vinyes" become alternative
-- names, so any scan that reads them lands on Forns Raventós." Dosage: its own field
-- (20261003101000). Corpinnat: an appellation (20261003101500).
--
-- Applies after 20261003100000 (near matches), 20261003101000 (dosage) and
-- 20261003101500 (Corpinnat); it asserts all three.
--
-- Eleven catalog rows become five wines. Every merge mirrors merge_catalog_wines (its live
-- body is asserted, md5 6894957f…): the loser's wset_notes move, the answer keys of
-- REVEALED glasses move (there are none), the loser stays as a tombstone with merged_into
-- = winner. The function itself is not called: it authorises by auth.uid() and a migration
-- has no session. Beyond it, so nothing is lost: the loser's scan photos join the winner's
-- "More photos", and a winner with no alcohol takes the loser's. Anything else that could
-- point at a loser (cellar lots and consumptions, glasses' answer keys, flight holds,
-- training attempts, a resolved unidentified wine, another tombstone) must not exist:
-- asserted, so a change since the 2026-10-03 read stops the file.
--
-- (a) Forns Raventós "Òrtus Blanc de Noirs" 2020 — Cava DO, Gran Reserva, Brut Nature,
--     white sparkling, 100% Pinot Noir (owner's shop page; the bc88c69e read said 100 %).
--       winner be1c8b91 (2020); losers a31e4ad9 (2020, "Mas Esteve Vinyes") and 94dc0de7
--       ("Ortus Blanc de Noirs" 2022 — the year was typed by hand; owner: 2020).
--     Name: "Òrtus Blanc de Noirs", kept. All three label reads printed ÒRTUS and BLANC DE
--     NOIRS together and all three returned exactly that wine name, so the next scan of the
--     bottle lands on this row through the identity lookup (accent-folded), not on a new
--     one. "Blanc de Noirs" is a descriptor, but the reader treats it as part of the name
--     and there is no other field for it. The blend loses the Mourvèdre a read guessed.
-- (b) Forns Raventós "Nodal" 2019 — Cava DO, Gran Reserva, Brut Nature, white sparkling,
--     Xarel·lo 60 % / Macabeo 30 % / Pinot Noir 10 %, 11.5 %.
--       winner 781fec9d (2019); losers e204809a ("Nódal" 2021) and 8e7cf420 ("Nodal" 2021).
--     Name "Nodal": all four reads printed NODAL without an accent. Grapes: the owner's shop
--     page lists Pinot Noir, Macabeu and Xarel·lo, which only the hand-typed e204809a blend
--     (60/30/10, Xarel·lo first) had; the label prints MACABEU · XAREL·LO without shares.
--     So the primary grape is Xarel·lo, as on the winner already. The alcohol comes from
--     e204809a (typed by hand).
-- (c) Forns Raventós (no wine name) 2023 — Cava DO, Reserva, Brut Nature, rosé sparkling,
--     100% Pinot Noir.
--       winner e8e739a7 ("Forns Raventós" as a wine name of Marc Esteve Vives, 2023);
--       loser 72171bf7 (the producer row's NV entry).
--     With Forns Raventós the producer, the label (MARC ESTEVE VIVES — FORNS RAVENTÓS —
--     RESERVA — … BRUT NATURE — … PINOT NOIR — ROSAT — CAVA) carries no other name, so the
--     wine name is null ("Rosat" is the colour, "Brut Nature" the dosage). Vintage: no read
--     printed a year (two claimed an NV statement their raw text does not show), so the
--     hand-typed 2023 is kept and is an owner question.
-- (d) Miquel Pons (no wine name) NV — Cava DO, Reserva, Demi-Sec, white sparkling,
--     Macabeo / Xarel·lo / Parellada (no shares; owner's shop page), 11.5 %.
--       winner c3bf8b20 (the "Semi-sec" row: its photo is the SEMI SEC label, its alcohol
--       and its description are this wine's); loser a8403e79 (its read said Brut Nature;
--       owner: both were the semi sec). "Semi-sec" leaves the wine name (a dosage word
--       never belongs there) and becomes the dosage, Demi-Sec.
-- (e) Huguet de Can Feixes (no wine name) 2018 — Catalonia / Corpinnat, Gran Reserva, Brut
--     Nature, white sparkling, blend unchanged (Parellada 50 / Macabeo 26 / Pinot Noir 24).
--       82c7ec7a, from the "None" sentinel to Corpinnat. Vintage 2018 was read off the
--     label. The read's "Reserva 5 Anys" contradicts the owner's Gran Reserva (84 months),
--     so the name is cleared and is an owner question, like the third grape (the owner's
--     page says Monastrell, the blend typed at the table says Macabeo).
--     The producer's region link moves from Spain's "None" sentinel to Catalonia.
--
-- Producers: "Forns Raventós" (25fe9bb0, the existing row) is the canonical producer.
-- Every catalog wine of "Marc Esteve Vives" (82f3e13b) and "Mas Esteve Vinyes" (ff257247),
-- tombstones included, is repointed to it. A producer row always beats an alias in
-- find_producer_by_folded_name, so the two rows are deleted when nothing else references
-- them (every FK to producers is checked, plus by-hand drafts) and their names become
-- curated aliases of Forns Raventós; if anything still references one, it is kept (with a
-- NOTICE) and still aliased.
--
-- Rerunning refuses: every loser must be live and every winner must hold its 2026-10-03
-- identity. No begin/commit: the applier owns the transaction.

do $$
declare
  -- producers
  c_fr     constant uuid := '25fe9bb0-1846-4cd9-b236-12c83231b17a';
  c_mev    constant uuid := '82f3e13b-e8d7-4103-a12b-a20dd1a25a2e';
  c_masv   constant uuid := 'ff257247-9683-4c06-bc9a-4552c9472ce5';
  c_mp     constant uuid := 'ab7850ad-90a0-4d3c-90bb-73323487ef68';
  c_huguet constant uuid := 'e6fa5d41-929f-43d4-922c-edb486ffbc3e';
  -- places
  c_spain     constant uuid := '16982111-0796-4279-b344-4268a0d075e1';
  c_cava_rg   constant uuid := '5a6f4563-82d2-440c-865e-86d5626b3dd0';
  c_cava      constant uuid := 'c8b32777-b2e2-4975-a9b4-1bff5bc62074';
  c_catalonia constant uuid := '31f27f9d-c789-4ade-abbe-178a2fbd9941';
  c_none_rg   constant uuid := '76da7f27-6ce1-4bb7-b7b8-795de8b148bc';
  c_none_ap   constant uuid := '0514d903-7fc1-4e12-9236-746829fa6343';
  -- designations
  c_reserva  constant uuid := 'cc846b11-c636-4d8f-9cd4-8b6b73f77c34';
  c_gran     constant uuid := '8041c745-1462-44fc-afcd-c70689a90abd';
  c_nature   constant uuid := '8592b1c6-0ba7-4e5c-9b6a-c7e4499294c4';
  c_demisec  constant uuid := '9aa0c374-436c-490e-86d0-3843cb5c098f';
  -- grapes
  c_pinot     constant uuid := '3101b341-c636-40d8-9538-c5d31617625a';
  c_macabeo   constant uuid := '8c981e7f-3b2e-40b8-afa5-ba37875036f4';
  c_xarello   constant uuid := '24175dff-db80-4078-b759-66ff74b164a9';
  c_parellada constant uuid := '4b1ea6e0-866b-459e-9170-bdf903773176';
  c_mourv     constant uuid := '216a4aa9-340f-444a-9b8c-27b954eb9917';
  -- wines
  c_ortus_w   constant uuid := 'be1c8b91-92ba-4003-82f5-658225c5e6aa';
  c_ortus_l1  constant uuid := 'a31e4ad9-b133-44b0-8084-69cb327e5d76';
  c_ortus_l2  constant uuid := '94dc0de7-bfde-4a44-9a1c-5f43fdbc8f1d';
  c_nodal_w   constant uuid := '781fec9d-2791-4309-a8fa-87274700e907';
  c_nodal_l1  constant uuid := 'e204809a-ada9-4e5f-bd70-17ffcfa896be';
  c_nodal_l2  constant uuid := '8e7cf420-d12c-4e78-b957-e7d9a8e70df3';
  c_forns_w   constant uuid := 'e8e739a7-902d-47a3-a3f8-9d9f6a236778';
  c_forns_l   constant uuid := '72171bf7-ce4f-4d0e-8dee-19a6d3fc7438';
  c_mp_w      constant uuid := 'c3bf8b20-6152-4f07-8029-7a12b87e0003';
  c_mp_l      constant uuid := 'a8403e79-9e84-421f-a57f-7580992ade9b';
  c_feixes    constant uuid := '82c7ec7a-3055-4e59-a306-2896525d4c77';
  c_corpinnat uuid;
  v_all uuid[];
  v_losers uuid[];
  v_winners uuid[];
  v_row record;
  v_text text;
  v_n int;
  v_notes_before int;
  v_photos_before int;
begin
  v_losers := array[c_ortus_l1, c_ortus_l2, c_nodal_l1, c_nodal_l2, c_forns_l, c_mp_l];
  v_winners := array[c_ortus_w, c_nodal_w, c_forns_w, c_mp_w, c_feixes];
  v_all := v_losers || v_winners;

  -- -------------------------------------------------------------------------
  -- Pre-state
  -- -------------------------------------------------------------------------
  select md5(replace(p.prosrc, chr(13), '')) into v_text
  from pg_proc p where p.oid = to_regprocedure('public.merge_catalog_wines(uuid,uuid)');
  if v_text is distinct from '6894957f77b8107a54e9f186a0973788' then
    raise exception '20261003102000: merge_catalog_wines is not the definition these merges mirror (md5 %)', v_text;
  end if;
  if to_regprocedure('public.catalog_wine_near_matches(uuid,text,uuid,text,integer)') is null then
    raise exception '20261003102000: 20261003100000 (near matches) is not applied';
  end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public'
                  and table_name = 'catalog_wines' and column_name = 'dosage_designation_id') then
    raise exception '20261003102000: 20261003101000 (dosage) is not applied';
  end if;
  select a.id into c_corpinnat from appellations a where a.region_id = c_catalonia and a.name = 'Corpinnat';
  if c_corpinnat is null then
    raise exception '20261003102000: 20261003101500 (Corpinnat) is not applied';
  end if;

  -- Reference rows, by id and name.
  for v_row in
    select * from (values
      ('producers', c_fr, 'Forns Raventós'), ('producers', c_mev, 'Marc Esteve Vives'),
      ('producers', c_masv, 'Mas Esteve Vinyes'), ('producers', c_mp, 'Miquel Pons'),
      ('producers', c_huguet, 'Huguet de Can Feixes'),
      ('regions', c_cava_rg, 'Cava'), ('regions', c_catalonia, 'Catalonia'), ('regions', c_none_rg, 'None'),
      ('appellations', c_cava, 'Cava DO'), ('appellations', c_none_ap, 'None'),
      ('type_designations', c_reserva, 'Reserva'), ('type_designations', c_gran, 'Gran Reserva'),
      ('type_designations', c_nature, 'Brut Nature'), ('type_designations', c_demisec, 'Demi-Sec'),
      ('grapes', c_pinot, 'Pinot Noir'), ('grapes', c_macabeo, 'Macabeo'), ('grapes', c_xarello, 'Xarel·lo'),
      ('grapes', c_parellada, 'Parellada'), ('grapes', c_mourv, 'Mourvèdre'), ('countries', c_spain, 'Spain')
    ) as t (tab, id, name)
  loop
    execute format('select name from %I where id = $1', v_row.tab) into v_text using v_row.id;
    if v_text is distinct from v_row.name then
      raise exception '20261003102000: %.% is %, expected %', v_row.tab, v_row.id, coalesce(v_text, '(missing)'), v_row.name;
    end if;
  end loop;
  if (select count(*) from producers where id in (c_fr, c_mev, c_masv, c_mp) and region_id = c_cava_rg) <> 4
     or (select region_id from producers where id = c_huguet) is distinct from c_none_rg then
    raise exception '20261003102000: a producer''s region link changed since 2026-10-03';
  end if;
  if (select region_id from appellations where id = c_cava) is distinct from c_cava_rg
     or (select region_id from appellations where id = c_none_ap) is distinct from c_none_rg
     or exists (select 1 from regions where id in (c_cava_rg, c_catalonia, c_none_rg) and country_id <> c_spain) then
    raise exception '20261003102000: a place moved since 2026-10-03';
  end if;

  -- Every row by its exact 2026-10-03 identity (after 20261003101000), live and public.
  for v_row in
    select * from (values
      (c_ortus_w,  c_mev,    'Òrtus Blanc de Noirs', 'YEAR', 2020, 'WHITE', c_cava,    c_gran,    null::uuid),
      (c_ortus_l1, c_masv,   'Òrtus Blanc de Noirs', 'YEAR', 2020, 'WHITE', c_cava,    null,      null),
      (c_ortus_l2, c_mev,    'Ortus Blanc de Noirs', 'YEAR', 2022, 'WHITE', c_cava,    c_gran,    null),
      (c_nodal_w,  c_mev,    'Nodal',                'YEAR', 2019, 'WHITE', c_cava,    c_gran,    null),
      (c_nodal_l1, c_mev,    'Nódal',                'YEAR', 2021, 'WHITE', c_cava,    c_gran,    null),
      (c_nodal_l2, c_mev,    'Nodal',                'YEAR', 2021, 'WHITE', c_cava,    c_gran,    null),
      (c_forns_w,  c_mev,    'Forns Raventós',       'YEAR', 2023, 'ROSE',  c_cava,    c_reserva, null),
      (c_forns_l,  c_fr,     null,                   'NV',   null, 'ROSE',  c_cava,    c_reserva, null),
      (c_mp_w,     c_mp,     'Semi-sec',             'NV',   null, 'WHITE', c_cava,    null,      null),
      (c_mp_l,     c_mp,     null,                   'NV',   null, 'WHITE', c_cava,    null,      c_nature),
      (c_feixes,   c_huguet, 'Reserva 5 Anys',       'YEAR', 2018, 'WHITE', c_none_ap, null,      null)
    ) as t (id, producer_id, wine_name, vintage_kind, vintage_year, colour, appellation_id, type_id, dosage_id)
  loop
    if not exists (
      select 1 from catalog_wines c
      where c.id = v_row.id and c.producer_id = v_row.producer_id
        and c.wine_name is not distinct from v_row.wine_name
        and c.vintage_kind::text = v_row.vintage_kind and c.vintage_year is not distinct from v_row.vintage_year
        and c.vintage_tawny_years is null
        and c.colour::text = v_row.colour and c.style = 'SPARKLING' and c.appellation_id = v_row.appellation_id
        and c.type_designation_id is not distinct from v_row.type_id
        and c.dosage_designation_id is not distinct from v_row.dosage_id
        and c.country_id = c_spain
        and c.merged_into is null and not c.blind_pending
    ) then
      raise exception '20261003102000: catalog wine % is not the live, public "%" % it was on 2026-10-03 (already cleaned up?)',
        v_row.id, v_row.wine_name, coalesce(v_row.vintage_year::text, 'NV');
    end if;
  end loop;

  -- Nothing these merges do not move points at a loser, and no glass, lot or hold names
  -- any of the eleven (rule 1: no unrevealed glass's wine changes here; scoring: no
  -- answer key is read or written).
  select count(*) into v_n from (
    select 1 from cellar_lots where catalog_wine_id = any(v_all)
    union all select 1 from cellar_consumptions where catalog_wine_id = any(v_all)
    union all select 1 from wine_answers where catalog_wine_id = any(v_all)
    union all select 1 from flight_holds where catalog_wine_id = any(v_all)
    union all select 1 from training_attempts where actual_catalog_wine_id = any(v_all)
    union all select 1 from catalog_wines_unidentified where resolved_into_catalog_wine_id = any(v_all)
    union all select 1 from catalog_wines where merged_into = any(v_all)
    union all select 1 from wset_notes where catalog_wine_id = any(v_all) and tasting_wine_id is not null
  ) x;
  if v_n <> 0 then
    raise exception '20261003102000: % lot, glass, hold, attempt, tombstone or glass note row(s) name these wines; re-read first', v_n;
  end if;

  -- The notes and photos the 2026-10-03 read found, wine by wine.
  for v_row in
    select * from (values
      (c_ortus_w, 1, 1), (c_ortus_l1, 1, 1), (c_ortus_l2, 1, 1),
      (c_nodal_w, 1, 1), (c_nodal_l1, 1, 1), (c_nodal_l2, 0, 1),
      (c_forns_w, 2, 2), (c_forns_l, 0, 1),
      (c_mp_w, 1, 1), (c_mp_l, 1, 1),
      (c_feixes, 1, 1)
    ) as t (id, notes, photos)
  loop
    if (select count(*) from wset_notes where catalog_wine_id = v_row.id) <> v_row.notes
       or (select count(*) from catalog_wine_photos where catalog_wine_id = v_row.id) <> v_row.photos then
      raise exception '20261003102000: % no longer holds % note(s) and % photo(s)', v_row.id, v_row.notes, v_row.photos;
    end if;
  end loop;
  select count(*) into v_notes_before from wset_notes where catalog_wine_id = any(v_all);
  select count(*) into v_photos_before from catalog_wine_photos where catalog_wine_id = any(v_all);

  -- The two producers to retire name nothing but these wines. Their aliases are new, and
  -- no other producer folds to their names.
  if exists (select 1 from catalog_wines where producer_id in (c_mev, c_masv) and not (id = any(v_all))) then
    raise exception '20261003102000: Marc Esteve Vives or Mas Esteve Vinyes holds another catalog wine';
  end if;
  if exists (select 1 from producer_aliases
              where alias_folded in (public.f_search_norm('Marc Esteve Vives'), public.f_search_norm('Mas Esteve Vinyes'))) then
    raise exception '20261003102000: an alias for Marc Esteve Vives or Mas Esteve Vinyes already exists';
  end if;
  if exists (select 1 from producers
              where public.f_search_norm(name) in (public.f_search_norm('Marc Esteve Vives'), public.f_search_norm('Mas Esteve Vinyes'),
                                                   public.f_search_norm('Forns Raventós'))
                and id not in (c_mev, c_masv, c_fr)) then
    raise exception '20261003102000: another producer folds to Marc Esteve Vives, Mas Esteve Vinyes or Forns Raventós';
  end if;

  -- -------------------------------------------------------------------------
  -- The merges (merge_catalog_wines' semantics, plus photos and alcohol)
  -- -------------------------------------------------------------------------
  for v_row in
    select * from (values
      (c_ortus_l1, c_ortus_w), (c_ortus_l2, c_ortus_w),
      (c_nodal_l1, c_nodal_w), (c_nodal_l2, c_nodal_w),
      (c_forns_l, c_forns_w),
      (c_mp_l, c_mp_w)
    ) as t (loser, winner)
  loop
    update wset_notes set catalog_wine_id = v_row.winner where catalog_wine_id = v_row.loser;

    update wine_answers wa set catalog_wine_id = v_row.winner
     where wa.catalog_wine_id = v_row.loser
       and exists (select 1 from wines w where w.id = wa.wine_id and w.is_revealed);

    update catalog_wine_photos ph set catalog_wine_id = v_row.winner
     where ph.catalog_wine_id = v_row.loser
       and not exists (select 1 from catalog_wine_photos o
                        where o.catalog_wine_id = v_row.winner and o.image_path = ph.image_path);
    if exists (select 1 from catalog_wine_photos where catalog_wine_id = v_row.loser) then
      raise exception '20261003102000: a scan photo of % could not move', v_row.loser;
    end if;

    update catalog_wines w set alcohol_percent = l.alcohol_percent
      from catalog_wines l
     where w.id = v_row.winner and l.id = v_row.loser
       and w.alcohol_percent is null and l.alcohol_percent is not null;

    update catalog_wines set merged_into = v_row.winner where id = v_row.loser and merged_into is null;
    get diagnostics v_n = row_count;
    if v_n <> 1 then raise exception '20261003102000: % was not merged', v_row.loser; end if;
  end loop;

  -- -------------------------------------------------------------------------
  -- Forns Raventós is the producer of every Marc Esteve Vives / Mas Esteve Vinyes wine
  -- -------------------------------------------------------------------------
  update catalog_wines set producer_id = c_fr where producer_id in (c_mev, c_masv);
  get diagnostics v_n = row_count;
  if v_n <> 7 then raise exception '20261003102000: repointed % wine(s) to Forns Raventós, expected 7', v_n; end if;

  -- -------------------------------------------------------------------------
  -- The five identities
  -- -------------------------------------------------------------------------
  -- (a) Òrtus Blanc de Noirs 2020: Brut Nature, 100% Pinot Noir.
  update catalog_wines set dosage_designation_id = c_nature where id = c_ortus_w;
  delete from catalog_wine_grapes where catalog_wine_id = c_ortus_w and grape_id = c_mourv;
  update catalog_wine_grapes set percentage = 100, sort_order = 0 where catalog_wine_id = c_ortus_w and grape_id = c_pinot;

  -- (b) Nodal 2019: Brut Nature, Xarel·lo 60 / Macabeo 30 / Pinot Noir 10.
  update catalog_wines set dosage_designation_id = c_nature where id = c_nodal_w;
  update catalog_wine_grapes set percentage = 60, sort_order = 0 where catalog_wine_id = c_nodal_w and grape_id = c_xarello;
  insert into catalog_wine_grapes (catalog_wine_id, grape_id, percentage, sort_order)
  values (c_nodal_w, c_macabeo, 30, 1), (c_nodal_w, c_pinot, 10, 2);

  -- (c) Forns Raventós rosé 2023: no wine name, Brut Nature, 100% Pinot Noir.
  update catalog_wines set wine_name = null, dosage_designation_id = c_nature where id = c_forns_w;
  update catalog_wine_grapes set percentage = 100, sort_order = 0 where catalog_wine_id = c_forns_w and grape_id = c_pinot;

  -- (d) Miquel Pons NV: no wine name, Reserva, Demi-Sec, Macabeo / Xarel·lo / Parellada.
  update catalog_wines set wine_name = null, type_designation_id = c_reserva, dosage_designation_id = c_demisec
   where id = c_mp_w;
  insert into catalog_wine_grapes (catalog_wine_id, grape_id, percentage, sort_order)
  values (c_mp_w, c_macabeo, null, 0);
  update catalog_wine_grapes set sort_order = 1 where catalog_wine_id = c_mp_w and grape_id = c_xarello;
  update catalog_wine_grapes set sort_order = 2 where catalog_wine_id = c_mp_w and grape_id = c_parellada;

  -- (e) Huguet de Can Feixes 2018: Catalonia / Corpinnat, Gran Reserva, Brut Nature, no wine name.
  update catalog_wines
     set region_id = c_catalonia, appellation_id = c_corpinnat, wine_name = null,
         type_designation_id = c_gran, dosage_designation_id = c_nature
   where id = c_feixes;
  update producers set region_id = c_catalonia where id = c_huguet and region_id = c_none_rg;
  get diagnostics v_n = row_count;
  if v_n <> 1 then raise exception '20261003102000: Huguet de Can Feixes'' region link was not moved'; end if;

  -- -------------------------------------------------------------------------
  -- The two names become aliases of Forns Raventós
  -- -------------------------------------------------------------------------
  for v_row in select * from (values (c_mev, 'Marc Esteve Vives'), (c_masv, 'Mas Esteve Vinyes')) as t (id, name)
  loop
    select count(*) into v_n from (
      select 1 from catalog_wines where producer_id = v_row.id
      union all select 1 from wine_answers where producer_id = v_row.id
      union all select 1 from guesses where producer_id = v_row.id
      union all select 1 from catalog_wines_unidentified where producer_id = v_row.id
      union all select 1 from wine_designation_members where producer_id = v_row.id
      union all select 1 from profile_favourite_producers where producer_id = v_row.id
      union all select 1 from producer_aliases where producer_id = v_row.id
      union all select 1 from wine_identity_drafts where draft -> 'producer' ->> 'id' = v_row.id::text
    ) x;
    if v_n = 0 then
      delete from producers where id = v_row.id;
      get diagnostics v_n = row_count;
      if v_n <> 1 then raise exception '20261003102000: producer % was not deleted', v_row.name; end if;
    else
      raise notice '20261003102000: producer % is still referenced by % row(s); kept, and aliased', v_row.name, v_n;
    end if;
    insert into producer_aliases (producer_id, alias) values (c_fr, v_row.name);
  end loop;

  -- -------------------------------------------------------------------------
  -- Post-state
  -- -------------------------------------------------------------------------
  -- The five wines, exactly.
  for v_row in
    select * from (values
      (c_ortus_w, c_fr,     'Òrtus Blanc de Noirs', 'YEAR', 2020, 'WHITE', c_cava_rg,   c_cava,      c_gran,    c_nature,  c_pinot,     null::uuid, 'Pinot Noir:100.00',                              null::numeric),
      (c_nodal_w, c_fr,     'Nodal',                'YEAR', 2019, 'WHITE', c_cava_rg,   c_cava,      c_gran,    c_nature,  c_xarello,   c_macabeo,  'Xarel·lo:60.00,Macabeo:30.00,Pinot Noir:10.00', 11.5),
      (c_forns_w, c_fr,     null,                   'YEAR', 2023, 'ROSE',  c_cava_rg,   c_cava,      c_reserva, c_nature,  c_pinot,     null,       'Pinot Noir:100.00',                              null),
      (c_mp_w,    c_mp,     null,                   'NV',   null, 'WHITE', c_cava_rg,   c_cava,      c_reserva, c_demisec, c_macabeo,   c_xarello,  'Macabeo:-,Xarel·lo:-,Parellada:-',               11.5),
      (c_feixes,  c_huguet, null,                   'YEAR', 2018, 'WHITE', c_catalonia, c_corpinnat, c_gran,    c_nature,  c_parellada, c_macabeo,  'Parellada:50.00,Macabeo:26.00,Pinot Noir:24.00', 12.0)
    ) as t (id, producer_id, wine_name, vintage_kind, vintage_year, colour, region_id, appellation_id, type_id,
            dosage_id, primary_id, secondary_id, blend, alcohol)
  loop
    if not exists (
      select 1 from catalog_wines c
      where c.id = v_row.id and c.producer_id = v_row.producer_id
        and c.wine_name is not distinct from v_row.wine_name
        and c.vintage_kind::text = v_row.vintage_kind and c.vintage_year is not distinct from v_row.vintage_year
        and c.colour::text = v_row.colour and c.style = 'SPARKLING'
        and c.country_id = c_spain and c.region_id = v_row.region_id and c.appellation_id = v_row.appellation_id
        and c.type_designation_id is not distinct from v_row.type_id
        and c.dosage_designation_id is not distinct from v_row.dosage_id
        and c.primary_grape_id = v_row.primary_id
        and c.secondary_grape_id is not distinct from v_row.secondary_id
        and c.alcohol_percent is not distinct from v_row.alcohol
        and c.merged_into is null and not c.blind_pending
    ) then
      raise exception '20261003102000: final wine % is not the identity this file sets', v_row.id;
    end if;
    select string_agg(g.name || ':' || coalesce(cg.percentage::text, '-'), ','
                      order by cg.percentage desc nulls last, cg.sort_order) into v_text
    from catalog_wine_grapes cg join grapes g on g.id = cg.grape_id where cg.catalog_wine_id = v_row.id;
    if v_text is distinct from v_row.blend then
      raise exception '20261003102000: final wine % has the blend %, expected %', v_row.id, v_text, v_row.blend;
    end if;
    -- The app's identity lookup (with the dosage key) answers it with itself.
    if public.catalog_wine_identity_match((
         select jsonb_build_object('producer_id', c.producer_id, 'wine_name', c.wine_name,
                  'appellation_id', c.appellation_id, 'colour', c.colour, 'style', c.style,
                  'vintage_kind', c.vintage_kind, 'vintage_year', c.vintage_year,
                  'vintage_tawny_years', c.vintage_tawny_years, 'type_designation_id', c.type_designation_id,
                  'dosage_designation_id', c.dosage_designation_id)
           from catalog_wines c where c.id = v_row.id)) is distinct from v_row.id then
      raise exception '20261003102000: the identity lookup does not answer final wine % with itself', v_row.id;
    end if;
  end loop;

  -- Every loser is a tombstone of its winner.
  if exists (
    select 1 from (values
      (c_ortus_l1, c_ortus_w), (c_ortus_l2, c_ortus_w), (c_nodal_l1, c_nodal_w), (c_nodal_l2, c_nodal_w),
      (c_forns_l, c_forns_w), (c_mp_l, c_mp_w)
    ) as t (loser, winner)
    left join catalog_wines c on c.id = t.loser
    where c.merged_into is distinct from t.winner
  ) then
    raise exception '20261003102000: a loser is not merged into its winner';
  end if;

  -- Nothing lost: every note and photo is on a winner.
  if (select count(*) from wset_notes where catalog_wine_id = any(v_winners)) <> v_notes_before
     or exists (select 1 from wset_notes where catalog_wine_id = any(v_losers)) then
    raise exception '20261003102000: notes were lost or left on a loser';
  end if;
  if (select count(*) from catalog_wine_photos where catalog_wine_id = any(v_winners)) <> v_photos_before
     or exists (select 1 from catalog_wine_photos where catalog_wine_id = any(v_losers)) then
    raise exception '20261003102000: scan photos were lost or left on a loser';
  end if;
  if (select count(*) from wset_notes where catalog_wine_id = c_ortus_w) <> 3
     or (select count(*) from wset_notes where catalog_wine_id = c_nodal_w) <> 2
     or (select count(*) from wset_notes where catalog_wine_id = c_forns_w) <> 2
     or (select count(*) from wset_notes where catalog_wine_id = c_mp_w) <> 2
     or (select count(*) from wset_notes where catalog_wine_id = c_feixes) <> 1 then
    raise exception '20261003102000: the notes are not 3 / 2 / 2 / 2 / 1 on the five wines';
  end if;

  -- The producers.
  if (select count(*) from catalog_wines where producer_id = c_fr and merged_into is null) <> 3 then
    raise exception '20261003102000: Forns Raventós should hold 3 live wines, holds %',
      (select count(*) from catalog_wines where producer_id = c_fr and merged_into is null);
  end if;
  if exists (select 1 from catalog_wines where producer_id in (c_mev, c_masv)) then
    raise exception '20261003102000: a wine still names Marc Esteve Vives or Mas Esteve Vinyes';
  end if;
  if (select count(*) from catalog_wines where producer_id = c_mp and merged_into is null) <> 1 then
    raise exception '20261003102000: Miquel Pons should hold 1 live wine';
  end if;
  for v_row in select * from (values ('Marc Esteve Vives'), ('Mas Esteve Vinyes'), ('Forns Raventós'), ('FORNS RAVENTOS')) as t (name)
  loop
    if public.find_producer_by_folded_name(v_row.name, c_cava_rg) is distinct from c_fr
       or public.find_producer_by_folded_name(v_row.name, null) is distinct from c_fr then
      -- A kept (still referenced) producer row legitimately wins over its alias.
      if v_row.name in ('Marc Esteve Vives', 'Mas Esteve Vinyes')
         and exists (select 1 from producers where public.f_search_norm(name) = public.f_search_norm(v_row.name)) then
        raise notice '20261003102000: % still resolves to its kept producer row', v_row.name;
      else
        raise exception '20261003102000: "%" does not resolve to Forns Raventós', v_row.name;
      end if;
    end if;
  end loop;
  if (select count(*) from producer_aliases where producer_id = c_fr
        and alias_folded in (public.f_search_norm('Marc Esteve Vives'), public.f_search_norm('Mas Esteve Vinyes'))) <> 2 then
    raise exception '20261003102000: the two aliases of Forns Raventós are missing';
  end if;

  -- No hidden wine was touched or made.
  if exists (select 1 from catalog_wines where id = any(v_all) and blind_pending) then
    raise exception '20261003102000: one of these wines is hidden';
  end if;
end $$;
