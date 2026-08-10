-- Langhe flip: switch Barolo/Barbaresco to the accurate official geometry,
-- promote the new Langhe footprints, re-parent Barolo/Barbaresco under Langhe,
-- and verify the new places. One transaction, fail-closed.
--
-- Boundary source swap: Barolo/Barbaresco currently have a current-VALIDATED
-- ISTAT_CONFINI (whole-comune) boundary + a DRAFT PIEMONTE_DOC_DOCG (official
-- delimited) boundary. Retire the old, promote the new. Dogliani, Diano d'Alba,
-- Verduno Pelaverga and the Langhe subregion get their first current boundary.
-- Barbera/Dolcetto/Nebbiolo d'Alba are verified WITHOUT a boundary (tree/Details
-- entries only) — get_wine_place_tree lists VERIFIED places regardless of
-- boundary, and the explorer's camera-fit no-ops on a null boundary.

begin;

do $$
declare
  r record;
  n int;
  langhe_id uuid;
begin
  select id into langhe_id from wine_places where canonical_key = 'italy.piemonte.langhe';
  if langhe_id is null then raise exception 'langhe place missing'; end if;

  -- 1. Retire the old ISTAT (whole-comune) current boundaries for Barolo/Barbaresco.
  update wine_place_boundaries b
     set is_current = false
    from wine_places p
    join wine_boundary_source_snapshots s2 on true
   where b.wine_place_id = p.id
     and b.source_snapshot_id = s2.id
     and s2.source_id in (select id from wine_boundary_sources where source_namespace = 'ISTAT_CONFINI')
     and p.canonical_key in ('italy.piemonte.barolo', 'italy.piemonte.barbaresco')
     and b.is_current;
  get diagnostics n = row_count;
  if n <> 2 then raise exception 'expected to retire 2 old ISTAT barolo/barbaresco boundaries, got %', n; end if;

  -- 2. Promote the 6 new official DRAFT boundaries -> current + VALIDATED (window-guarded).
  n := 0;
  for r in
    select b.id, p.canonical_key ck, b.bbox
      from wine_place_boundaries b
      join wine_places p on p.id = b.wine_place_id
      join wine_boundary_source_snapshots s on s.id = b.source_snapshot_id
      join wine_boundary_sources so on so.id = s.source_id
     where so.source_namespace = 'PIEMONTE_DOC_DOCG'
       and b.quality_status = 'DRAFT'
       and p.canonical_key like 'italy.piemonte.%'
  loop
    if r.bbox[1] < 6.5 or r.bbox[2] < 44.0 or r.bbox[3] > 9.3 or r.bbox[4] > 46.6 then
      raise exception 'boundary % bbox %,%,%,% escapes the Piemonte window', r.ck, r.bbox[1], r.bbox[2], r.bbox[3], r.bbox[4];
    end if;
    update wine_place_boundaries set quality_status = 'VALIDATED', is_current = true, reviewed_at = now() where id = r.id;
    n := n + 1;
  end loop;
  if n <> 6 then raise exception 'expected to promote 6 official boundaries, got %', n; end if;

  -- 3. Re-parent Barolo & Barbaresco under Langhe (tier 2 -> 3). parent + tier move together.
  update wine_places set primary_parent_id = langhe_id, display_tier = 3
   where canonical_key in ('italy.piemonte.barolo', 'italy.piemonte.barbaresco');
  get diagnostics n = row_count;
  if n <> 2 then raise exception 'expected to re-parent 2 places, moved %', n; end if;

  -- 4. Verify the 7 new places (locks canonical_key).
  update wine_places set publication_status = 'VERIFIED'
   where canonical_key in (
     'italy.piemonte.langhe','italy.piemonte.dogliani','italy.piemonte.diano-dalba',
     'italy.piemonte.verduno-pelaverga','italy.piemonte.barbera-dalba',
     'italy.piemonte.dolcetto-dalba','italy.piemonte.nebbiolo-dalba'
   ) and publication_status = 'DRAFT';
  get diagnostics n = row_count;
  if n <> 7 then raise exception 'expected to verify 7 new places, got %', n; end if;

  -- 5. Post-flip assertions (same transaction).
  -- Barolo & Barbaresco: exactly one current boundary each, and it is the official one.
  select count(*) into n
    from wine_places p
   where p.canonical_key in ('italy.piemonte.barolo','italy.piemonte.barbaresco')
     and (select count(*) from wine_place_boundaries b where b.wine_place_id = p.id and b.is_current) = 1
     and exists (
       select 1 from wine_place_boundaries b
        join wine_boundary_source_snapshots s on s.id = b.source_snapshot_id
        join wine_boundary_sources so on so.id = s.source_id
       where b.wine_place_id = p.id and b.is_current and so.source_namespace = 'PIEMONTE_DOC_DOCG');
  if n <> 2 then raise exception 'barolo/barbaresco not on exactly one official current boundary (%)', n; end if;

  -- The 4 footprint zones with boundaries are current+VALIDATED.
  select count(*) into n
    from wine_place_boundaries b join wine_places p on p.id = b.wine_place_id
   where p.canonical_key in ('italy.piemonte.langhe','italy.piemonte.dogliani',
         'italy.piemonte.diano-dalba','italy.piemonte.verduno-pelaverga')
     and b.is_current and b.quality_status = 'VALIDATED';
  if n <> 4 then raise exception 'expected 4 current/validated new footprint boundaries, got %', n; end if;

  -- All 7 new places VERIFIED + locked.
  select count(*) into n from wine_places
   where canonical_key in ('italy.piemonte.langhe','italy.piemonte.dogliani','italy.piemonte.diano-dalba',
         'italy.piemonte.verduno-pelaverga','italy.piemonte.barbera-dalba','italy.piemonte.dolcetto-dalba','italy.piemonte.nebbiolo-dalba')
     and publication_status = 'VERIFIED' and canonical_key_locked_at is not null;
  if n <> 7 then raise exception 'expected 7 verified+locked new places, got %', n; end if;

  -- Barolo/Barbaresco now sit at tier 3 under Langhe.
  select count(*) into n from wine_places c join wine_places par on par.id = c.primary_parent_id
   where c.canonical_key in ('italy.piemonte.barolo','italy.piemonte.barbaresco')
     and c.display_tier = 3 and par.canonical_key = 'italy.piemonte.langhe';
  if n <> 2 then raise exception 'barolo/barbaresco not re-parented under langhe at tier 3 (%)', n; end if;
end $$;

commit;
