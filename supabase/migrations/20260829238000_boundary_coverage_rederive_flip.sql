-- Boundary coverage fixes (audit buckets 1, 2, 4-derived). Re-derive eight
-- outlines from their children so each geographically contains its members:
--   * Savoie / Corse / Languedoc-Roussillon regions — were generalized official
--     outlines that excluded their scattered appellations; now derived aggregates
--     (the Provence / Sud-Ouest pattern).
--   * Loire region — refresh so it covers the Centre-Loire subregion.
--   * Côte de Beaune / Mâconnais subregions — cover their regional-appellation
--     children; Bourgogne region is re-derived after in the cascade step.
--   * Montagne de Reims / Côte des Blancs subregions — cover Tauxières / Vertus;
--     Champagne region re-derived after in the cascade step.
-- DRAFTs staged by derive-boundary.mjs.

do $$
declare
  keys text[] := array[
    'france.savoie', 'france.corse', 'france.languedoc-roussillon', 'france.loire',
    'france.bourgogne.cote-de-beaune', 'france.bourgogne.maconnais',
    'france.champagne.montagne-de-reims', 'france.champagne.cote-des-blancs'
  ];
  k text; v_place uuid; v_old uuid; v_new uuid; v int;
begin
  foreach k in array keys loop
    select id into v_place from wine_places where canonical_key = k;
    if v_place is null then raise exception 'place % missing', k; end if;
    select id into v_new from wine_place_boundaries
     where wine_place_id = v_place and quality_status = 'DRAFT' and not is_current
       and boundary_method = 'DERIVED_FROM_DESCENDANTS';
    if v_new is null then raise exception 'no staged draft for %', k; end if;
    select id into v_old from wine_place_boundaries where wine_place_id = v_place and is_current;
    update wine_place_boundaries set is_current = false where id = v_old;
    update wine_place_boundaries
       set quality_status = 'VALIDATED', is_current = true, reviewed_at = now()
     where id = v_new;
  end loop;

  select count(*) into v
    from wine_places parent
    join wine_place_boundaries pb on pb.wine_place_id = parent.id and pb.is_current
    join wine_places child on child.primary_parent_id = parent.id and child.publication_status = 'VERIFIED'
    join wine_place_boundaries cb on cb.wine_place_id = child.id and cb.is_current
   where parent.canonical_key = any(keys)
     and not extensions.ST_Covers(extensions.ST_Buffer(pb.display_geometry, 0.0006), cb.display_geometry);
  if v <> 0 then raise exception '% children still poke outside a re-derived parent', v; end if;

  select count(*) into v from wine_places p where p.publication_status = 'VERIFIED'
     and not exists (select 1 from wine_place_boundaries b
        where b.wine_place_id = p.id and b.is_current and b.quality_status = 'VALIDATED');
  if v <> 0 then raise exception '% verified places without a current boundary', v; end if;
end $$;
