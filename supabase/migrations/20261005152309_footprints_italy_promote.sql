-- Footprint cleanup fp-1, wave italy: promote.
-- RENDERED by scripts/wine-map-sources/footprint-pass.mjs --render-sql from the
-- approved review file — do not hand-edit. Approval: Owner 2026-10-04: "Yes, go ahead (Recommended)" (ship fp-1 after review); crumb cap 1,000 m² ("Keep parcels over 0.1 ha (Recommended)"); harbours "Keep water out (Recommended)" (Migration W 20261005122000, applied); owner 2026-10-05 chose "Now" for the coastal run; this --wave italy dry run computed by d9a0158 (inline step = the live function, byte-identical).

do $promote$
declare
  v_expect jsonb := '[{"place_id":"4f4daead-e94a-4aa8-ac29-f255ea3c0872","key":"italy.trentino-alto-adige.meranese","current_boundary_id":"ab3449ef-d9e1-4d6c-b26c-a26319b43e20","current_sha":"043848e6ac869f459c974956e021a91523ee83682f80578de79ee5d427503555","output_sha":"2a4430428d60888052111f0843a96863d871caf4830acbde3a9eda3586810f32"},{"place_id":"e97fa6dc-98be-4cde-89ef-5639ae99ffd8","key":"italy.piemonte.dogliani","current_boundary_id":"b5b47b83-27f3-4b4d-9c48-8c60c7fb0176","current_sha":"0a0cae546b5f279671541ca44f4f946a20ed6cf0fc87c23b0f803bc5ae7b5cac","output_sha":"1445c6cc5dbbdaac90eeb4ecb2c0303fc6a76342383cc863d2232b59b88dff75"},{"place_id":"dbdef8fb-7a75-4fe1-94d9-3dbbdde50651","key":"italy.piemonte.colline-saluzzesi","current_boundary_id":"f05aab7d-e506-4c60-a581-618e7f9ed8a0","current_sha":"a6131b1270fc9f7bdaf4e742aa9fb2566cf2d39213e4f36ac749c20c9cfcf236","output_sha":"84c0bdb072049db7722cf93179ee540fd52f6346a607d40cade6ac59d9f228db"},{"place_id":"13603296-ed89-44a8-9a5e-154bd2f38fa5","key":"italy.campania.vesuvio","current_boundary_id":"b4f69202-5806-4ebc-b512-4ec3ecc9a1d9","current_sha":"746fbbf2a72dd982e6216fe3034ad8064f76f1a929ed50017e505ec72d452897","output_sha":"fbf82e409df8ce252724fbcb523d1b04d4ecaeb18f716400b126bbdacfb919ab"},{"place_id":"0d464480-fabb-4851-925c-d1e16f0fc870","key":"italy.veneto.monti-lessini","current_boundary_id":"23940e58-7c79-42b2-b889-cfdd456e1cb2","current_sha":"01bfae47c40b10cabaa97a1330b7bc11e888b4abe827dfadc11b08321e911d75","output_sha":"67de5631106155c43a186f0a707baa7d84b75395f59e2410648959d02c93f393"},{"place_id":"07ed860e-f3c5-4f56-8fd2-6e670c357883","key":"italy.liguria.colli-di-luni","current_boundary_id":"e5d8b5db-4078-4ec2-b9a2-1a956c4f452f","current_sha":"5fd94e627d52659433b71ddaaaca0fdaa15a2616007dac7f651b10ec5eb1c067","output_sha":"ee8926d0bf58b8af362ce219e91453f386a9b8f6b34e7be415e3384c6c436710"},{"place_id":"13b33cee-4212-470a-81c0-323088b5ad63","key":"italy.trentino-alto-adige.valdadige","current_boundary_id":"78eb2e80-f3bf-4295-ba73-7e1ef93b0069","current_sha":"2fa17039b650aea9d8a8bd793466841bf24e76bb900912e63d966e4da89cb77b","output_sha":"48e9681997e85364114c0f48a1f3ef23aaf6ed696529fcc64ca460060fab3ccb"},{"place_id":"379dbdf0-64ce-4330-99e9-5ddd2ec5fc26","key":"italy.piemonte.pinerolese","current_boundary_id":"949fae77-1bc0-4ae3-9469-160a78fd96fc","current_sha":"21cc8e038893f505626c6136a0d74a2a3724955fc389df6a7333dd0252a3a0ca","output_sha":"ba24e291c3751dddd9a3cd4be0a2ff969535f2273d7ee2bf2349dfa6d532f57b"},{"place_id":"65d45b7d-161b-4854-8a1c-bd94b2df93c6","key":"italy.trentino-alto-adige.alto-adige","current_boundary_id":"6b1ff25d-3b9d-4272-b788-1411072442f7","current_sha":"3c66828e45f281fe31243af17bd3a7f56848f69b42db0dfd1b3d8ca1cfad421e","output_sha":"ff47a9846ac21feb77e69e79248c201d805536ac08c1771f72a84ff53bd567ae"},{"place_id":"ccea683c-2b94-4656-9c12-688011beb2a7","key":"italy.piemonte.canavese","current_boundary_id":"99f6c7f9-f73f-4cd5-a030-e31f72df0774","current_sha":"c4b6506bf5e9f9885d86e908312c5750dcbcc354f74c856e034f505b39e308cd","output_sha":"08b960da2a33ac691f45456c467e14bf0d517b0541c1c33fe695537e9df87e9a"},{"place_id":"244aa128-b108-4226-a582-78627d663331","key":"italy.sicilia.marsala","current_boundary_id":"36c2fbd3-dd7e-4531-8852-4b4732d8799f","current_sha":"7fd242422af433e992531f33045809ee5cbe4cd8615d9a6f35b127740500bb27","output_sha":"eac08060f04390bc1ae5bc9dde36346ab4d0b5cdad4e3e1e608c19980164ec90"},{"place_id":"2ed4ed08-286e-441a-9dc0-3b48ee19e2d1","key":"italy.sardegna.vermentino-di-gallura","current_boundary_id":"38bd4bed-fcff-4989-986b-47f6daf1dff8","current_sha":"f4baa88a6d4516c48de8698975d2c58369911ae79d247d356c5d6d8c124824d4","output_sha":"db4f7a0c8b47a9771ad439e01adf980a012b54afadd758c13a11860a2d1297c5"},{"place_id":"3ed039ac-bd2f-4cb2-9448-9db22b6d4952","key":"italy.piemonte.monferrato","current_boundary_id":"98c6b4f3-8df5-41fc-b502-e388801120ca","current_sha":"c738282e852a020737786169614874cecbaaee24779a51a34e328f3a24010664","output_sha":"9e84b4bec2e1c5708e488569f5a4f9bf1a3878502fc2f2e058186bf8481caa1e"},{"place_id":"8df2ddf9-33ee-4787-8476-44e22177bfc9","key":"italy.toscana.maremma-toscana","current_boundary_id":"97ec170d-c4b7-427f-ab72-e987210be193","current_sha":"7e6f2952a6c1c0cbc62318615736595fcd6b7bf2d38a4d144987cd08e4a690dc","output_sha":"a0ef77d3d25c6cfd663afc37962aee27c4ff74c656e5bb7012e272f3caae407e"}]'::jsonb;
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
