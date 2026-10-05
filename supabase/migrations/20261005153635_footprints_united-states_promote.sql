-- Footprint cleanup fp-1, wave united-states: promote.
-- RENDERED by scripts/wine-map-sources/footprint-pass.mjs --render-sql from the
-- approved review file — do not hand-edit. Approval: Owner 2026-10-04: "Yes, go ahead (Recommended)" (ship fp-1 after review); crumb cap 1,000 m² ("Keep parcels over 0.1 ha (Recommended)"); harbours "Keep water out (Recommended)" (Migration W 20261005122000, applied); owner 2026-10-05 chose "Now" for the coastal run; this --wave united-states dry run computed by 064e673 (inline step = the live function, byte-identical).

do $promote$
declare
  v_expect jsonb := '[{"place_id":"b0a3fa02-400b-4671-ae24-bc94e7a11bb5","key":"united-states.washington.columbia-valley.the-burn-of-columbia-valley","current_boundary_id":"32276060-820d-4b54-b3b5-3e1e5d9047b0","current_sha":"21dd143b460bf36da419e7c753f303d0975aef5ae777ef7a5b6cca8080511181","output_sha":"986c12d613a4ecd2f794726c8727b9b71735fc1a1a55dea67980228c4ef589b1"},{"place_id":"b3937ae8-cba7-4254-8679-e19509775223","key":"united-states.california.north-coast.mendocino-ridge","current_boundary_id":"3f6b055e-b84b-49a7-8b61-2a07db5512d7","current_sha":"b91c8cd49829c5679118935f9adee9ca23e8e6ca2b7a2a59ce286c5b5bf9bf90","output_sha":"89be9f60d7393fbfbd12a01928076fe56a2b095a37dd6d03e2315a0720c258cb"},{"place_id":"8ed32720-da0d-4fb4-a78f-5ab5e72a5dbe","key":"united-states.california.south-coast.san-luis-rey","current_boundary_id":"87f6b887-a012-4f45-9e80-94b3c194b665","current_sha":"24b66a320dcbc977d87a56fac098a353f44ad07bf7d91563815635dddb3ab53b","output_sha":"f7bbacedeebd6e7deb3aa656c21e20025f1334b4c853760c5bb7ef6d3946fe9f"},{"place_id":"9565c840-3cac-4291-92ee-61413f4dcd71","key":"united-states.washington.columbia-valley.walla-walla-valley","current_boundary_id":"083f2cd0-1889-4cd2-8b0e-bfaa74034f7f","current_sha":"09f91ffa5548a7b451095e6f74277589b60e8d1db4fa6b129d80fc8580fbba45","output_sha":"be2a0323abe2c11516aff5bbf540cb0d4577ad9bcf69f3fcb1f9bb0f38fb4b6d"}]'::jsonb;
  v_n int := jsonb_array_length(v_expect);
  v_bad int;
  v_refreshed int;
  v_list text;
begin
  perform set_config('search_path', 'public, extensions', true);
  -- 0. never alongside a tiles run: a release built from a half-flipped wave would
  --    publish it before Gate B
  select count(*) into v_bad from public.wine_map_releases
   where status = 'BUILDING' and created_at > now() - interval '1 hour';
  if v_bad > 0 then raise exception 'footprints promote: % tiles release(s) BUILDING in the last 1 hour: wait, then re-run', v_bad; end if;

  -- 1. every input is still current with the sha the owner approved against
  select count(*) into v_bad
    from jsonb_to_recordset(v_expect) e(place_id uuid, current_boundary_id uuid, current_sha text, output_sha text)
   where not exists (select 1 from public.wine_place_boundaries b
                      where b.id = e.current_boundary_id and b.wine_place_id = e.place_id and b.is_current
                        and b.quality_status = 'VALIDATED'
                        and encode(sha256(extensions.ST_AsEWKB(b.display_geometry)), 'hex') = e.current_sha);
  if v_bad > 0 then raise exception 'footprints promote: % input row(s) changed since approval', v_bad; end if;

  -- 2. exactly one staged +fp1 row per place, DRAFT, non-current, with the approved output sha
  select count(*) into v_bad
    from jsonb_to_recordset(v_expect) e(place_id uuid, output_sha text)
   where (select count(*) from public.wine_place_boundaries b
           where b.wine_place_id = e.place_id and b.quality_status = 'DRAFT' and not b.is_current
             and b.revision like '%+fp1'
             and encode(sha256(extensions.ST_AsEWKB(b.display_geometry)), 'hex') = e.output_sha
             and b.generation_parameters->'cleanup'->>'output_sha256' = e.output_sha) <> 1;
  if v_bad > 0 then raise exception 'footprints promote: % place(s) without exactly one approved staged row', v_bad; end if;

  -- 3. the stamp's own checks: no new overlap with a non-partner, no new ground
  --    outside the containment parent, no descendant ground lost (each <= 1 m²),
  --    area within [-3 %, +10 %]
  select count(*) into v_bad
    from jsonb_to_recordset(v_expect) e(place_id uuid, output_sha text)
    join public.wine_place_boundaries b
      on b.wine_place_id = e.place_id and b.quality_status = 'DRAFT' and not b.is_current
     and b.revision like '%+fp1'
   where (b.generation_parameters->'cleanup'->'metrics'->>'new_overlap_m2')::float8 > 1
      or (b.generation_parameters->'cleanup'->'metrics'->>'outside_parent_new_m2')::float8 > 1
      or (b.generation_parameters->'cleanup'->'metrics'->>'protected_lost_m2')::float8 > 1
      or (b.generation_parameters->'cleanup'->'metrics'->>'area_m2_after')::float8
           > (1 + 0.1) * (b.generation_parameters->'cleanup'->'metrics'->>'area_m2_before')::float8
      or (b.generation_parameters->'cleanup'->'metrics'->>'area_m2_after')::float8
           < (1 - 0.03) * (b.generation_parameters->'cleanup'->'metrics'->>'area_m2_before')::float8;
  if v_bad > 0 then raise exception 'footprints promote: % staged row(s) fail the stamp checks', v_bad; end if;

  -- 4. flip: demote the inputs, make the staged rows VALIDATED + current
  update public.wine_place_boundaries b set is_current = false
    from jsonb_to_recordset(v_expect) e(current_boundary_id uuid)
   where b.id = e.current_boundary_id;
  update public.wine_place_boundaries b set quality_status = 'VALIDATED', is_current = true, reviewed_at = now()
    from jsonb_to_recordset(v_expect) e(place_id uuid, output_sha text)
   where b.wine_place_id = e.place_id and b.quality_status = 'DRAFT' and not b.is_current
     and b.revision like '%+fp1'
     and encode(sha256(extensions.ST_AsEWKB(b.display_geometry)), 'hex') = e.output_sha;
  get diagnostics v_bad = row_count;
  if v_bad <> v_n then raise exception 'footprints promote: flipped % of % rows', v_bad, v_n; end if;

  -- 5. post-state: each place has exactly one current row, the approved one
  select count(*) into v_bad
    from jsonb_to_recordset(v_expect) e(place_id uuid, output_sha text)
   where (select count(*) from public.wine_place_boundaries b where b.wine_place_id = e.place_id and b.is_current) <> 1
      or not exists (select 1 from public.wine_place_boundaries b where b.wine_place_id = e.place_id and b.is_current
                       and encode(sha256(extensions.ST_AsEWKB(b.display_geometry)), 'hex') = e.output_sha);
  if v_bad > 0 then raise exception 'footprints promote: post-state wrong for % place(s)', v_bad; end if;

  -- 5b. the independent check (footprint-sql.mjs independentCheckSql), on the stored
  --     rows themselves, trusting no stamp: each place's new ground against the input
  --     row it replaces, on every same-tier non-partner place (old and new shapes),
  --     outside its containment parent, and descendant ground given up; > 1 m² refuses
  select count(*), string_agg(format('%s %s / %s %s m²', x.kind, x.key, coalesce(x.other_key, '-'), round(x.m2::numeric, 1)), '; ')
    into v_bad, v_list
    from (select * from (
    with recursive
    pend as (
      select (e.key)::uuid id, st_geomfromewkb(decode(e.value, 'hex')) g
        from jsonb_each_text(coalesce(('{}'::jsonb)::jsonb, '{}'::jsonb)) e),
    w as (select e.place_id, nb.display_geometry g_new, ob.display_geometry g_old
           from jsonb_to_recordset(v_expect) e(place_id uuid, current_boundary_id uuid, output_sha text)
           join public.wine_place_boundaries nb on nb.wine_place_id = e.place_id and nb.is_current
            and encode(sha256(extensions.ST_AsEWKB(nb.display_geometry)), 'hex') = e.output_sha
           join public.wine_place_boundaries ob on ob.id = e.current_boundary_id),
    wp as (
      select w.place_id id, p.canonical_key k, p.display_tier tier, p.primary_parent_id ppid, w.g_new,
             st_collectionextract(st_difference(st_reduceprecision(w.g_new, 0.000001), st_reduceprecision(w.g_old, 0.000001), 0.000001), 3) grown,
             st_collectionextract(st_difference(st_reduceprecision(w.g_old, 0.000001), st_reduceprecision(w.g_new, 0.000001), 0.000001), 3) lost
        from w join public.wine_places p on p.id = w.place_id),
    nb as (
      select a.id aid, o.id bid, st_unaryunion(st_collect(st_reduceprecision(o.g, 0.000001))) g
        from wp a
        cross join lateral (
      select b.wine_place_id id, b.display_geometry g
            from public.wine_place_boundaries b
           where b.display_geometry && a.grown
             and ((b.is_current and b.quality_status = 'VALIDATED')
                  or (not b.is_current and b.quality_status = 'DRAFT'
                      and b.generation_parameters->'cleanup'->>'version' = 'fp-1'))
             and (b.is_current or not exists (select 1 from pend where pend.id = b.wine_place_id and pend.g = b.display_geometry))
          union all
          select b.wine_place_id id, i.display_geometry g
            from public.wine_place_boundaries b
            join public.wine_place_boundaries i
              on i.id = (b.generation_parameters->'cleanup'->>'input_boundary_id')::uuid
             and i.wine_place_id = b.wine_place_id and i.id <> b.id
           where i.display_geometry && a.grown
             and b.is_current and b.quality_status = 'VALIDATED'
          union all select w2.place_id, w2.g_new from w w2 where w2.g_new && a.grown
          union all select w2.place_id, w2.g_old from w w2 where w2.g_old && a.grown
          union all select pend.id, pend.g from pend where pend.g && a.grown) o
        join public.wine_places q on q.id = o.id
       where not st_isempty(a.grown) and o.id <> a.id and q.display_tier = a.tier
         and not exists (select 1 from public.wine_place_relationships r
                          where r.relationship_type::text in ('DUAL_LABEL', 'OVERLAPS', 'REPLACES_WITHIN')
                            and ((r.source_place_id = a.id and r.target_place_id = o.id)
                              or (r.source_place_id = o.id and r.target_place_id = a.id)))
       group by a.id, o.id),
    anc as (
      select a.id aid, q.id, q.primary_parent_id ppid, 1 depth from wp a join public.wine_places q on q.id = a.ppid
      union all
      select anc.aid, q.id, q.primary_parent_id, anc.depth + 1 from anc join public.wine_places q on q.id = anc.ppid
       where anc.depth < 20),
    par as (
      select distinct on (anc.aid) anc.aid, q.canonical_key k, coalesce(w.g_new, pend.g, b.display_geometry) g
        from anc join public.wine_places q on q.id = anc.id
        left join w on w.place_id = anc.id
        left join pend on pend.id = anc.id
        left join public.wine_place_boundaries b
          on b.wine_place_id = anc.id and b.is_current and b.quality_status = 'VALIDATED'
       where (w.place_id is not null or pend.id is not null or b.id is not null)
         and coalesce(b.boundary_method::text, '') <> 'DERIVED_FROM_DESCENDANTS'
       order by anc.aid, anc.depth),
    des as (
      select a.id pid, q.id, 1 depth from wp a join public.wine_places q on q.primary_parent_id = a.id
       where not st_isempty(a.lost)
      union all
      select des.pid, q.id, des.depth + 1 from des join public.wine_places q on q.primary_parent_id = des.id
       where des.depth < 20),
    dg as (
      select des.pid, st_unaryunion(st_collect(st_reduceprecision(x.g, 0.000001))) g
        from des join wp a on a.id = des.pid
        cross join lateral (
          select w.g_new g from w where w.place_id = des.id
          union all
          select b.display_geometry from public.wine_place_boundaries b
           where b.wine_place_id = des.id and not exists (select 1 from w where w.place_id = des.id)
             and ((b.is_current and b.quality_status = 'VALIDATED')
              or (not b.is_current and b.quality_status = 'DRAFT'
                  and b.generation_parameters->'cleanup'->>'version' = 'fp-1'))) x
       where x.g && a.lost
       group by des.pid)
    select 'new_ground_on_neighbour' kind, a.k key, q.canonical_key other_key,
           (select coalesce(sum(st_area(d.geom::geography)) filter (
        where 2 * st_area(d.geom::geography) / nullif(st_perimeter(d.geom::geography), 0) >= 0.1), 0)
       from st_dump(st_collectionextract(st_intersection(a.grown, nb.g, 0.000001), 3)) d) m2
      from nb join wp a on a.id = nb.aid join public.wine_places q on q.id = nb.bid
    union all
    select 'outside_parent', a.k, par.k, (select coalesce(sum(st_area(d.geom::geography)) filter (
        where 2 * st_area(d.geom::geography) / nullif(st_perimeter(d.geom::geography), 0) >= 0.1), 0)
       from st_dump(st_collectionextract(st_difference(a.grown, st_reduceprecision(par.g, 0.000001), 0.000001), 3)) d)
      from wp a join par on par.aid = a.id
     where not st_isempty(a.grown)
    union all
    select 'descendant_ground_lost', a.k, null, (select coalesce(sum(st_area(d.geom::geography)) filter (
        where 2 * st_area(d.geom::geography) / nullif(st_perimeter(d.geom::geography), 0) >= 0.1), 0)
       from st_dump(st_collectionextract(st_intersection(a.lost, dg.g, 0.000001), 3)) d)
      from wp a join dg on dg.pid = a.id) x where x.m2 > 1 order by x.kind, x.key, x.other_key) x;
  if v_bad > 0 then raise exception 'footprints promote: % independent check failure(s): %', v_bad, left(v_list, 3000); end if;

  -- 6. the neighbour cache, in the same transaction
  v_refreshed := public.refresh_wine_place_neighbours();
  if v_refreshed < 0 then raise exception 'footprints promote: refresh_wine_place_neighbours() refused (%)', v_refreshed; end if;
end
$promote$;
