-- Vallee du Rhone (Southern slice) — catalog (8 crus, DRAFT).
--
-- Adds the 8 Southern Rhone communal crus under the existing france.rhone
-- region (which currently carries a derived outline from its 8 northern crus).
-- After these are verified, france.rhone is RE-DERIVED from all 16 crus so its
-- outline expands to cover the south (20260824094000). Model: APPELLATION /
-- communal / AOC-AOP, tier 2, parent france.rhone. Vacqueyras is omitted
-- (absent from the pinned INAO membership file); the sweet VDN/Muscats and the
-- full Cotes du Rhone regional dissolve remain deferred.
do $$
declare
  v_region uuid;
  v_n int;
begin
  select id into v_region from wine_places
   where canonical_key = 'france.rhone' and publication_status = 'VERIFIED';
  if v_region is null then
    raise exception 'france.rhone is not VERIFIED';
  end if;
  if exists (
    select 1 from wine_places where canonical_key = any(array[
      'france.rhone.chateauneuf-du-pape','france.rhone.gigondas','france.rhone.vinsobres',
      'france.rhone.cairanne','france.rhone.rasteau','france.rhone.beaumes-de-venise',
      'france.rhone.lirac','france.rhone.tavel'])
  ) then
    raise exception 'southern rhone places already exist';
  end if;

  insert into wine_places (
    primary_parent_id, kind, canonical_key, name, slug, display_tier,
    min_zoom, label_min_zoom, publication_status,
    is_appellation, appellation_system, appellation_level, sort_order
  )
  select v_region, 'APPELLATION', 'france.rhone.' || v.slug, v.name, v.slug, 2,
         7, 7, 'DRAFT', true, 'AOC/AOP', 'communal', v.so
  from (values
    ('chateauneuf-du-pape', 'Châteauneuf-du-Pape',  9),
    ('gigondas',            'Gigondas',            10),
    ('vinsobres',           'Vinsobres',           11),
    ('cairanne',            'Cairanne',            12),
    ('rasteau',             'Rasteau',             13),
    ('beaumes-de-venise',   'Beaumes-de-Venise',   14),
    ('lirac',               'Lirac',               15),
    ('tavel',               'Tavel',               16)
  ) as v(slug, name, so);

  select count(*) into v_n from wine_places
   where canonical_key like 'france.rhone.%'
     and slug in ('chateauneuf-du-pape','gigondas','vinsobres','cairanne','rasteau','beaumes-de-venise','lirac','tavel')
     and kind = 'APPELLATION' and appellation_level = 'communal'
     and appellation_system = 'AOC/AOP' and publication_status = 'DRAFT';
  if v_n <> 8 then
    raise exception 'expected 8 southern rhone crus, got %', v_n;
  end if;
  if (select count(*) from wine_places where canonical_key like 'france.rhone.%') <> 16 then
    raise exception 'expected 16 total rhone crus after southern catalog';
  end if;
end;
$$;
