-- Alsace — designation linkage now the places are live.
--
-- (1) Sets wine_place_id on the 51 alsace-grand-cru SITE members
-- (wine_designation_members) by exact display-name match to the newly
-- VERIFIED france.alsace.* grand_cru places — both sides derive from the
-- same pinned artifact, so names align accent-for-accent.
-- (2) Mirrors Burgundy's Phase 3K model: wine_place_designations rows link
-- each of the 51 GC places to the alsace-grand-cru catalogue entry
-- (PUBLISHED) so the map place context lists the designation.
-- Idempotent by final state; no row-count-delta assertions.

update wine_designation_members m
   set wine_place_id = p.id
  from wine_designations d, wine_places p
 where d.id = m.designation_id
   and d.key = 'alsace-grand-cru'
   and p.canonical_key like 'france.alsace.%'
   and p.appellation_level = 'grand_cru'
   and p.publication_status = 'VERIFIED'
   and p.name = m.name;

insert into wine_place_designations (wine_place_id, designation_id, local_note, editorial_status)
select p.id, d.id, null, 'PUBLISHED'
from wine_places p
join wine_designations d on d.key = 'alsace-grand-cru'
where p.canonical_key like 'france.alsace.%'
  and p.appellation_level = 'grand_cru'
  and p.publication_status = 'VERIFIED'
on conflict (wine_place_id, designation_id) do nothing;

do $$
declare v_linked int; v_null int; v_bad int; v_pd int;
begin
  select count(*) filter (where m.wine_place_id is not null),
         count(*) filter (where m.wine_place_id is null)
    into v_linked, v_null
    from wine_designation_members m
    join wine_designations d on d.id = m.designation_id
   where d.key = 'alsace-grand-cru';
  if v_linked <> 51 or v_null <> 0 then
    raise exception 'alsace members expected 51 linked / 0 null, got % / %', v_linked, v_null;
  end if;

  select count(*) into v_bad
    from wine_designation_members m
    join wine_designations d on d.id = m.designation_id
    join wine_places p on p.id = m.wine_place_id
   where d.key = 'alsace-grand-cru'
     and (p.canonical_key not like 'france.alsace.%'
          or p.appellation_level <> 'grand_cru'
          or p.publication_status <> 'VERIFIED');
  if v_bad <> 0 then
    raise exception 'an alsace member links a non-alsace-GC place (%)', v_bad;
  end if;

  select count(*) into v_pd
    from wine_place_designations pd
    join wine_designations d on d.id = pd.designation_id
    join wine_places p on p.id = pd.wine_place_id
   where d.key = 'alsace-grand-cru'
     and pd.editorial_status = 'PUBLISHED'
     and p.canonical_key like 'france.alsace.%';
  if v_pd <> 51 then
    raise exception 'expected 51 alsace wine_place_designations, got %', v_pd;
  end if;
end;
$$;
