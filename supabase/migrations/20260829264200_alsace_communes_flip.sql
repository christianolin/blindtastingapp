-- Alsace communes — reviewed flip, and the crus drop to tier 3.
--
-- Promotes the 47 staged DRAFT commune footprints (IGN Admin Express by INSEE,
-- MANUAL; whole-commune over-approximations) to current-VALIDATED, their places
-- DRAFT -> VERIFIED, and in the same transaction re-parents the 51 grands crus
-- onto their commune at display_tier 3. Preview:
-- .superpowers/sdd/preview-alsace-communes.svg. Window guard = the Alsace
-- region_window (lon [6.9,7.8], lat [47.7,49.2]).
--
-- The re-parenting belongs HERE rather than in the catalog: doing it at the same
-- moment the communes become VERIFIED-with-boundaries means there is never an
-- instant where a cru's parent is a place the tile exporter does not emit
-- (export.mjs inner-joins boundaries on is_current and quality_status).
--
-- primary_parent_id and display_tier must move in ONE update: the hierarchy
-- trigger validates the row as a whole, and a cru at tier 2 under a tier-2
-- commune is legal while the intermediate states of two separate updates are
-- not necessarily reachable in the right order.
--
-- Parents come from wine_designation_members.commune, corrected against the
-- delimitation itself in 20260829264000. Matching is on the commune place's
-- name, and every one of the 51 must resolve or this migration fails.
do $$
declare
  r record;
  v_count int;
begin
  -- Pre-flip shape: 47 DRAFT commune boundaries, none current, 51 crus still
  -- hanging off the region at tier 2.
  select count(*) into v_count
    from wine_place_boundaries b
    join wine_places p on p.id = b.wine_place_id
   where p.canonical_key like 'france.alsace.%' and p.kind = 'SITE'
     and b.quality_status = 'DRAFT';
  if v_count <> 47 then
    raise exception 'expected exactly 47 DRAFT alsace commune boundaries pre-flip, got %', v_count;
  end if;
  select count(*) into v_count
    from wine_place_boundaries b
    join wine_places p on p.id = b.wine_place_id
   where p.canonical_key like 'france.alsace.%' and p.kind = 'SITE' and b.is_current;
  if v_count <> 0 then
    raise exception 'alsace communes already have current boundaries pre-flip: %', v_count;
  end if;
  select count(*) into v_count from wine_places p
    join wine_places region on region.id = p.primary_parent_id
   where region.canonical_key = 'france.alsace'
     and p.kind = 'APPELLATION' and p.display_tier = 2;
  if v_count <> 51 then
    raise exception 'expected 51 crus at tier 2 under the region pre-flip, got %', v_count;
  end if;

  -- Promote each commune boundary, window-guarded.
  for r in
    select p.id place_id, p.canonical_key ck, b.id boundary_id, b.bbox
      from wine_place_boundaries b
      join wine_places p on p.id = b.wine_place_id
     where p.canonical_key like 'france.alsace.%' and p.kind = 'SITE'
       and b.quality_status = 'DRAFT'
  loop
    if r.bbox[1] < 6.9 or r.bbox[2] < 47.7 or r.bbox[3] > 7.8 or r.bbox[4] > 49.2 then
      raise exception 'alsace commune % bbox %,%,%,% escapes the window',
        r.ck, r.bbox[1], r.bbox[2], r.bbox[3], r.bbox[4];
    end if;
    update wine_place_boundaries
       set quality_status = 'VALIDATED', is_current = true, reviewed_at = now()
     where id = r.boundary_id;
    update wine_places set publication_status = 'VERIFIED' where id = r.place_id;
  end loop;

  -- Re-parent + re-tier the crus. The join through the member table is what
  -- ties the map hierarchy to the corrected, geometry-derived commune column.
  update wine_places cru
     set primary_parent_id = commune.id,
         display_tier = 3
    from wine_designation_members m
    join wine_designations d on d.id = m.designation_id
    join wine_places commune
      on commune.canonical_key like 'france.alsace.%'
     and commune.kind = 'SITE'
     and commune.name = m.commune
   where d.key = 'alsace-grand-cru'
     and cru.id = m.appellation_wine_place_id;

  get diagnostics v_count = row_count;
  if v_count <> 51 then
    raise exception 'expected to re-parent 51 crus, moved %', v_count;
  end if;

  -- Post-flip assertions, same transaction.
  select count(*) into v_count from wine_places
   where canonical_key like 'france.alsace.%' and kind = 'SITE'
     and publication_status = 'VERIFIED' and display_tier = 2;
  if v_count <> 47 then
    raise exception 'expected 47 verified alsace commune places, got %', v_count;
  end if;
  select count(*) into v_count
    from wine_place_boundaries b
    join wine_places p on p.id = b.wine_place_id
   where p.canonical_key like 'france.alsace.%' and p.kind = 'SITE'
     and b.is_current and b.quality_status = 'VALIDATED';
  if v_count <> 47 then
    raise exception 'expected 47 current/validated alsace commune boundaries, got %', v_count;
  end if;
  if exists (
    select 1 from wine_places p
     where p.canonical_key like 'france.alsace.%' and p.kind = 'SITE'
       and (select count(*) from wine_place_boundaries b
              where b.wine_place_id = p.id and b.is_current) <> 1
  ) then
    raise exception 'an alsace commune lacks exactly one current boundary';
  end if;
  if exists (
    select 1 from wine_places
     where canonical_key like 'france.alsace.%' and kind = 'SITE'
       and canonical_key_locked_at is null
  ) then
    raise exception 'an alsace commune is not locked post-verify';
  end if;

  -- Every cru now sits at tier 3 under a commune, and none is left on the region.
  select count(*) into v_count from wine_places cru
    join wine_places commune on commune.id = cru.primary_parent_id
   where cru.canonical_key like 'france.alsace.%' and cru.kind = 'APPELLATION'
     and cru.display_tier = 3 and commune.kind = 'SITE' and commune.display_tier = 2;
  if v_count <> 51 then
    raise exception 'expected 51 crus at tier 3 under a commune, got %', v_count;
  end if;
  select count(*) into v_count from wine_places p
    join wine_places region on region.id = p.primary_parent_id
   where region.canonical_key = 'france.alsace' and p.kind = 'APPELLATION';
  if v_count <> 0 then
    raise exception '% crus still parented to the region', v_count;
  end if;

  -- The map hierarchy and the library column must tell the same story.
  if exists (
    select 1 from wine_designation_members m
      join wine_designations d on d.id = m.designation_id
      join wine_places cru on cru.id = m.appellation_wine_place_id
      join wine_places commune on commune.id = cru.primary_parent_id
     where d.key = 'alsace-grand-cru' and commune.name <> m.commune
  ) then
    raise exception 'a cru parent disagrees with its member commune';
  end if;

  -- 42 communes are somebody's parent; 5 host cru land whose majority lies next
  -- door and are legitimately childless.
  select count(distinct cru.primary_parent_id) into v_count from wine_places cru
   where cru.canonical_key like 'france.alsace.%' and cru.kind = 'APPELLATION';
  if v_count <> 42 then
    raise exception 'expected 42 parent communes, got %', v_count;
  end if;
end;
$$;
