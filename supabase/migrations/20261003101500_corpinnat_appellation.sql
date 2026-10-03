-- Corpinnat (owner, 2026-10-03: "Also we dont have "corpinnat" in the app.").
--
-- Corpinnat is the collective brand of Penedès sparkling-wine growers who left the Cava DO
-- (2019; EU-registered collective trademark, not a DO/DOP): 100% organic, hand-harvested
-- estate grapes from the heart of Penedès, at least 18 months on the lees. It is printed on
-- the label where "Cava" used to be, so the label reader reads it as the appellation
-- ("CORPINNAT" on the Huguet de Can Feixes bottle of 2026-10-02, which today sits under
-- the "None" sentinel because nothing matched).
--
-- One appellation row, "Corpinnat", under Spain's region "Catalonia" (which already holds
-- Penedes DO, Conca del Riu Anoia DO, Alella DO …; the Cava DO is its own region, "Cava").
-- CONVENTIONS KEPT (20260914121417_spain_missing_appellations):
--   - the name carries NO designation word: Corpinnat is not a DO, and a bare name is how
--     every non-DO Spanish row (VP, VT, VC) is stored. fold.ts's DESIGNATION_SUFFIXES
--     strips nothing from it, so "Corpinnat", "CORPINNAT" and "Corpinnat DO" read off a
--     label all resolve to this row (resolve.ts step 4) and search_appellations finds it;
--   - map_status stays PENDING and wine_place_id null, as on every stored Spanish row.
--
-- SAFETY. Insert only. Fails closed unless Spain has exactly one "Catalonia" region and
-- no appellation anywhere in Spain folds to "corpinnat" (so a rerun refuses rather than
-- inserting a second row). The appellations table writes no wine_places or
-- wine_place_boundaries row, so the neighbour cache is untouched.
--
-- No begin/commit: the applier owns the transaction.

do $$
declare
  v_spain uuid;
  v_catalonia uuid;
  v_id uuid;
  v_n int;
begin
  select id into v_spain from countries where name = 'Spain';
  if v_spain is null then
    raise exception '20261003101500: no country "Spain"';
  end if;
  select count(*) into v_n from regions where country_id = v_spain and name = 'Catalonia';
  if v_n <> 1 then
    raise exception '20261003101500: Spain has % region(s) named "Catalonia", expected 1', v_n;
  end if;
  select id into v_catalonia from regions where country_id = v_spain and name = 'Catalonia';
  if v_catalonia is distinct from '31f27f9d-c789-4ade-abbe-178a2fbd9941'::uuid then
    raise exception '20261003101500: "Catalonia" is not the region read on 2026-10-03 (%)', v_catalonia;
  end if;

  if exists (select 1 from appellations a join regions r on r.id = a.region_id
              where r.country_id = v_spain
                and public.f_search_norm(regexp_replace(a.name, '\s+(DO|DOP|DOCa|DOQ)$', '')) = 'corpinnat') then
    raise exception '20261003101500: Spain already has a Corpinnat appellation (already applied?)';
  end if;

  insert into appellations (region_id, name) values (v_catalonia, 'Corpinnat') returning id into v_id;

  -- Post-state.
  if (select count(*) from appellations a join regions r on r.id = a.region_id
       where r.country_id = v_spain and public.f_search_norm(a.name) = 'corpinnat') <> 1 then
    raise exception '20261003101500: expected exactly one Corpinnat row in Spain';
  end if;
  if not exists (select 1 from appellations where id = v_id and region_id = v_catalonia and name = 'Corpinnat'
                   and map_status = 'PENDING' and wine_place_id is null) then
    raise exception '20261003101500: the Corpinnat row is not PENDING under Catalonia';
  end if;
  -- The appellation search finds it, accent- and case-blind, as the label reader asks.
  if not exists (select 1 from public.search_appellations('corpinnat') s where s.id = v_id) then
    raise exception '20261003101500: search_appellations(''corpinnat'') does not find it';
  end if;
end $$;
