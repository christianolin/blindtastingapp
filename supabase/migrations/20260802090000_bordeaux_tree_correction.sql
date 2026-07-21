-- Phase 3A Bordeaux correction (owner-approved target tree, addendum
-- 2026-07-21): Graves and Médoc become dual-role grouping nodes (one-node
-- duplicates rule), Pessac-Léognan + Sauternes reparent under Graves,
-- Haut-Médoc under Médoc; five new appellations enter as DRAFT places;
-- two sourced legal edges are recorded. Canonical keys never change.
do $$
declare
  v_bordeaux uuid;
  v_graves uuid;
  v_medoc uuid;
  v_count int;
begin
  select id into v_bordeaux from wine_places where canonical_key = 'france.bordeaux';
  select id into v_graves from wine_places where canonical_key = 'france.bordeaux.graves';
  select id into v_medoc from wine_places where canonical_key = 'france.bordeaux.medoc';
  if v_bordeaux is null or v_graves is null or v_medoc is null then
    raise exception 'expected bordeaux/graves/medoc places to exist';
  end if;

  insert into wine_places (
    primary_parent_id, kind, canonical_key, name, slug, display_tier,
    min_zoom, label_min_zoom, publication_status, sort_order,
    is_appellation, appellation_system, appellation_level
  ) values
    (v_bordeaux, 'APPELLATION', 'france.bordeaux.fronsac', 'Fronsac', 'fronsac', 2, 7, 7, 'DRAFT', 60, true, 'AOC/AOP', 'communal'),
    (v_bordeaux, 'APPELLATION', 'france.bordeaux.canon-fronsac', 'Canon-Fronsac', 'canon-fronsac', 2, 7, 7, 'DRAFT', 61, true, 'AOC/AOP', 'communal'),
    (v_bordeaux, 'APPELLATION', 'france.bordeaux.blaye', 'Blaye', 'blaye', 2, 7, 7, 'DRAFT', 62, true, 'AOC/AOP', 'subregional'),
    (v_bordeaux, 'APPELLATION', 'france.bordeaux.cotes-de-bourg', 'Côtes de Bourg', 'cotes-de-bourg', 2, 7, 7, 'DRAFT', 63, true, 'AOC/AOP', 'subregional'),
    (v_bordeaux, 'APPELLATION', 'france.bordeaux.entre-deux-mers', 'Entre-deux-Mers', 'entre-deux-mers', 2, 7, 7, 'DRAFT', 64, true, 'AOC/AOP', 'subregional');
  get diagnostics v_count = row_count;
  if v_count <> 5 then raise exception 'expected 5 new places, got %', v_count; end if;

  update wine_places set primary_parent_id = v_graves
  where canonical_key in ('france.bordeaux.pessac-leognan', 'france.bordeaux.sauternes');
  get diagnostics v_count = row_count;
  if v_count <> 2 then raise exception 'expected 2 reparents under graves, got %', v_count; end if;

  update wine_places set primary_parent_id = v_medoc
  where canonical_key = 'france.bordeaux.haut-medoc';
  get diagnostics v_count = row_count;
  if v_count <> 1 then raise exception 'expected haut-medoc reparent, got %', v_count; end if;

  insert into wine_place_relationships (source_place_id, target_place_id, relationship_type, note)
  select s.id, t.id, 'REPLACES_WITHIN',
         'Pessac-Léognan AOC (1987) replaces Graves AOC within its boundaries; producers inside cannot label Graves. Source: INAO cahier des charges Pessac-Léognan.'
  from wine_places s, wine_places t
  where s.canonical_key = 'france.bordeaux.pessac-leognan'
    and t.canonical_key = 'france.bordeaux.graves';

  insert into wine_place_relationships (source_place_id, target_place_id, relationship_type, note)
  select s.id, t.id, 'DUAL_LABEL',
         'Barsac producers may label Barsac AOC or Sauternes AOC; other Sauternes communes cannot use Barsac. Source: INAO cahiers des charges Barsac / Sauternes.'
  from wine_places s, wine_places t
  where s.canonical_key = 'france.bordeaux.sauternes.barsac'
    and t.canonical_key = 'france.bordeaux.sauternes';

  select count(*) into v_count from wine_place_relationships
  where relationship_type in ('REPLACES_WITHIN', 'DUAL_LABEL');
  if v_count <> 2 then raise exception 'expected 2 legal edges, got %', v_count; end if;

  select count(*) into v_count from wine_places where canonical_key like 'france%';
  if v_count <> 19 then raise exception 'expected 19 france places, got %', v_count; end if;
end;
$$;
