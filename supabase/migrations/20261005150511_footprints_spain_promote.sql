-- Footprint cleanup fp-1, wave spain: promote.
-- RENDERED by scripts/wine-map-sources/footprint-pass.mjs --render-sql from the
-- approved review file — do not hand-edit. Approval: Owner 2026-10-04: "Yes, go ahead (Recommended)" (ship fp-1 after review); crumb cap 1,000 m² ("Keep parcels over 0.1 ha (Recommended)"); harbours "Keep water out (Recommended)" (Migration W 20261005122000, applied); owner 2026-10-05 chose "Now" for the coastal run; this --wave spain dry run computed by 17624c4 (inline step = the live function, byte-identical).

do $promote$
declare
  v_expect jsonb := '[{"place_id":"34d229b4-68c3-404a-a786-f21149ed253a","key":"spain.galicia.rias-baixas.o-rosal","current_boundary_id":"323e10f1-eead-4a59-9708-4e8b87e0c69f","current_sha":"08fb89fd0cbce3033c058a87ac0096dcb72c0e057986124b41fb59a72f2ce132","output_sha":"c3adeebcf4443bea6d95ff61e1e75ec03102c1b209f26c0094c547b475f466c0"},{"place_id":"f4a0e728-e97f-4f80-9f4e-2f4df76fa8e8","key":"spain.galicia.rias-baixas.val-do-salnes","current_boundary_id":"45e0649f-d377-46ee-8ec9-77ed47eef1a2","current_sha":"43a8ebd9d6f959a5dd9316189e93db6d3d4c06736b3077ecfb461283193e21eb","output_sha":"28589763c20b2d4c39562fc57a838f87e79c3ad705e045ab53568569d3f14104"},{"place_id":"050c6527-c6e0-4ad7-aef7-e641a5b318b6","key":"spain.cataluna.emporda","current_boundary_id":"ae00790d-5d46-4863-b55b-3b81378f66d2","current_sha":"031e51e5a4eadccb2a137981d4fcddcdd67dc561dfb05cb843b07a18d4588c1f","output_sha":"50d871600235f7259d5e0a739e6a4ec30e1036508284e19bd995a673398ab2e9"},{"place_id":"1aecb548-0507-48dd-85ec-366067a09c8b","key":"spain.baleares.pla-i-llevant","current_boundary_id":"f532e756-ba98-42ae-879a-981e6ace22ab","current_sha":"5efb10b6e0568977adce0d32c43b50a6f6c4da42e6405ad0da0a6984e59abdd3","output_sha":"95d9cfaf1d5d80e8e1b12825c95fdb2221420060964c867c6737e03e854c644a"},{"place_id":"c7e3d34a-2b50-4721-b6b7-42c7b07ad66e","key":"spain.pais-vasco.getariako","current_boundary_id":"dbedf861-9b70-429c-95d7-87491b8dcdf3","current_sha":"5c8829b22be1902d6e1e9a302a155be46aee331d793acfb65fb22e111f02e3a8","output_sha":"4e092943c6cf7a3792ec7d97dd64019f1b999dc767a83be5381e09c01a0edfca"},{"place_id":"9c765f20-51d1-4f1f-bf0b-a8a7cf5931da","key":"spain.pais-vasco.bizkaiko","current_boundary_id":"87d7a008-99f0-4ddc-9fc8-77a7b8497b20","current_sha":"2d46468cef92b3701816db7b28a53ee290a615f54a6cfd186734de2e732ba6f2","output_sha":"465f8cff14843aced4236aef37ad2ce053757b00961b840e61311cf19b7cda49"},{"place_id":"6fce8863-5f12-4f57-addb-b3eaa2c5550b","key":"spain.galicia.rias-baixas","current_boundary_id":"f255792d-24a6-48b9-ad90-14838080938b","current_sha":"f8bee54e8e623f9a7180dfe94be26ae941626b81a4b6f729eb1db26ffc924d41","output_sha":"4bf1e60fc78432310cc49a1c87a38a94c19d84511abddf4e07af8e52a724a6bc"},{"place_id":"04131023-b066-43fb-a509-b70579c84884","key":"spain.andalucia.jerez","current_boundary_id":"30b20cff-f6c1-4425-b4ce-d92306978ed7","current_sha":"46a14a04d6fa7bdcb81e0acc2de3bcd4f57e3fc000e4062afe14d661f2a97962","output_sha":"3a51cd258e7af05fcb7d67b5006fe9b46a9d653a05aaccc927a7ab39b8e8b98b"},{"place_id":"17931d4c-0af8-4608-b63e-93b3a5e787df","key":"spain.valencia.alicante","current_boundary_id":"e9c60067-1f13-4c4b-a924-9ae468d9fdf6","current_sha":"09553da2c978c159bcbf23173afc8d480c1d01062ecf8972fc16fdfd7d3cb380","output_sha":"4b1a8715165d6498a6e83ecd14acf95fb2d3fd51d6607c024181815096d3841d"},{"place_id":"7589934b-b65a-410c-8797-99ae77392e74","key":"spain.valencia.valencia","current_boundary_id":"db46c584-4add-4cdf-818e-d5becff1a4d6","current_sha":"591889b3188f97e9d7decdc618638e098adbbc5a4b50255984c31e618802d487","output_sha":"185770a483bdba25d9caec307f9f69d13944da6e2614eb3572c0bcec85ac8110"},{"place_id":"d3cde437-8ce4-4480-a89c-c24bd25df759","key":"spain.andalucia.granada","current_boundary_id":"a274ef7a-4dd0-46e8-8610-d3d845279240","current_sha":"86d48a867ed3a3593b7d8e8b9b1004fdfbfcba240845c1f3785e6810e03330ea","output_sha":"15d43c4d29b6217405ec9ed9b5c6a410bb8b85770189002e5b4a115ef7db53d5"},{"place_id":"0bfe0843-39e7-4d4f-93fe-c07516ab2294","key":"spain.baleares","current_boundary_id":"657b90dc-6b70-46d0-9967-8492db10299f","current_sha":"9eb2c42f6ab599095bd6d848a4f49d5f3c067c2b820c8c35208d6a6d57490a89","output_sha":"fc192749a53324064a5d0b43c34b10b0f68b65f1d09b8add21657bcc36b9b9f0"},{"place_id":"a8d4a6b6-2b19-4ea9-9916-3fc5b1bd9862","key":"spain.pais-vasco","current_boundary_id":"cd485a7a-7e90-4975-af6d-49397c3f31a9","current_sha":"54665a2a1bf3714c63ed97b698100c8adaedb64f80cb9949939aadbc3c8690ba","output_sha":"772d57993310f50dcc3927288077ee7391ad263fb71a6306a36c1fe18e7231c3"},{"place_id":"4644319d-0c2f-4ea6-9d45-adf28d671c2e","key":"spain.galicia","current_boundary_id":"dc10148c-eed2-4465-8e44-ffb9e9c5259e","current_sha":"44cbc50632811a2d8ef2aea26976db892ead1c22dd8593abee84643d339c30d3","output_sha":"5a80435a65913de571b4bcaff2f4151cd9ac01f21ad62e1b3356f8ec2b5fd242"},{"place_id":"fb8be563-9bd8-410a-80b1-cf219dbb4d8a","key":"spain.valencia","current_boundary_id":"83410e2f-2f43-43ba-a241-cbf1d1ae055d","current_sha":"618b741a3b7ac1ec6ef5994cc5a8952602525184707f7cd3152f776eb60cfab7","output_sha":"5fa44b4597f09aca0bcd90752fadee8c8ac78731fd63a07b07bb56f731ad40ec"},{"place_id":"cef684d9-cc99-49d4-919f-58c4787a4845","key":"spain.cataluna","current_boundary_id":"04f81437-499c-49bb-a0fe-53a1e5b298f3","current_sha":"c14909a1086ea2d5a6521f83107ad5f0629070400848a8401fcb98b84e337a8c","output_sha":"88ed5ccf124b43898f29ddea62f19d4ffc28708b8dfbbff818c8b5d4b2d139f9"},{"place_id":"09d35a8a-cb97-4402-b7eb-83868f422b4b","key":"spain.andalucia","current_boundary_id":"2a3b63c8-0cc4-4e4e-aa2e-15cbdbc69370","current_sha":"d78f38fe06c7f84c529ee1c9f43aea3a94e94624776cfe61555ac6f1f127c225","output_sha":"ea1156cfe9e72b4127af29d6ce0e9c0f08f483cbb4ed7a81c98f7b55a12936e0"}]'::jsonb;
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
