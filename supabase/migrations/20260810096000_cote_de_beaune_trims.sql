-- Phase 3D wave 1 polish: promote the 3 sibling-trimmed Côte de Beaune plot
-- revisions (Corton, Chevalier-Montrachet, Bâtard-Montrachet) and record the
-- legal overlap the trim tool surfaced: Charlemagne may also be sold as
-- Corton-Charlemagne (87% shared INAO footprint — the Charmes/Mazoyères
-- pattern on the hill of Corton).

do $$
declare v_count int;
begin
  select count(*) into v_count
    from wine_place_boundaries b
    join wine_places p on p.id = b.wine_place_id
   where p.canonical_key like 'france.bourgogne.cote-de-beaune.%'
     and b.quality_status = 'DRAFT' and not b.is_current
     and b.generation_parameters ? 'sibling_trim';
  if v_count <> 3 then
    raise exception 'expected 3 staged Cote de Beaune trim revisions, got %', v_count;
  end if;
end $$;

-- Retire the untrimmed currents of exactly those places…
update wine_place_boundaries b
set is_current = false
from wine_place_boundaries d
join wine_places p on p.id = d.wine_place_id
where d.quality_status = 'DRAFT' and not d.is_current
  and d.generation_parameters ? 'sibling_trim'
  and p.canonical_key like 'france.bourgogne.cote-de-beaune.%'
  and b.wine_place_id = d.wine_place_id
  and b.is_current;

-- …and promote the trimmed revisions.
update wine_place_boundaries b
set quality_status = 'VALIDATED', is_current = true, reviewed_at = now()
from wine_places p
where p.id = b.wine_place_id
  and p.canonical_key like 'france.bourgogne.cote-de-beaune.%'
  and b.quality_status = 'DRAFT' and not b.is_current
  and b.generation_parameters ? 'sibling_trim';

insert into wine_place_relationships (source_place_id, target_place_id, relationship_type, note)
select s.id, t.id, 'DUAL_LABEL',
       'Charlemagne may legally be sold as Corton-Charlemagne (87% shared footprint in INAO parcels).'
from wine_places s, wine_places t
where s.canonical_key = 'france.bourgogne.cote-de-beaune.aloxe-corton.charlemagne'
  and t.canonical_key = 'france.bourgogne.cote-de-beaune.aloxe-corton.corton-charlemagne'
on conflict do nothing;

do $$
declare v_current int; v_orphans int; v_edges int;
begin
  select count(*) into v_current from wine_place_boundaries where is_current;
  if v_current <> 114 then
    raise exception 'expected 114 current boundaries after trim flip, got %', v_current;
  end if;
  select count(*) into v_orphans from wine_places p
   where p.publication_status = 'VERIFIED'
     and not exists (
       select 1 from wine_place_boundaries b
        where b.wine_place_id = p.id and b.is_current and b.quality_status = 'VALIDATED'
     );
  if v_orphans <> 0 then
    raise exception 'verified places without current boundary: %', v_orphans;
  end if;
  select count(*) into v_edges from wine_place_relationships
   where relationship_type = 'DUAL_LABEL';
  if v_edges <> 4 then
    raise exception 'expected 4 DUAL_LABEL edges, got %', v_edges;
  end if;
end $$;
