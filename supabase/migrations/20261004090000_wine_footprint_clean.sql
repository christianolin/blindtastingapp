-- Footprint cleanup fp-1 (Migration A). RENDERED by
-- scripts/wine-map-sources/footprint-sql.mjs renderMigrationA() — do not hand-edit;
-- footprint-sql.test.mjs fails if this file and the module drift apart.
--
-- Changes no data. Installs:
--   public.wine_footprint_clean_core(raw, blockers, parent, protected, params)
--     the step itself (pure, STABLE, reads no table);
--   public.wine_footprint_clean(p_raw, p_place_id, p_pending, p_params)
--     resolves the context (same-tier blockers without a DUAL_LABEL, OVERLAPS, REPLACES_WITHIN edge,
--     the containment parent, lazily the protected descendant ground), runs the
--     ladder (full -> close-only -> unchanged) and returns (geom, cleanup stamp);
--   trigger wine_place_boundaries_require_cleanup: every INSERT, and every UPDATE
--     OF display_geometry, must carry generation_parameters.cleanup with version
--     'fp-1' and output_sha256 = sha256(ST_AsEWKB(display_geometry)).
--     Status/is_current flips never touch display_geometry, so promotes and
--     reverts are unaffected; existing rows are untouched.
-- EXECUTE on all three functions is the owner's alone: revoked from PUBLIC, anon,
-- authenticated AND service_role (Supabase's default privileges would otherwise
-- grant a new function to service_role; the trap refresh_wine_place_neighbours
-- and transfer_tasting_host document).
-- Builders call it through footprint-cleanup.mjs (cleanGeomCte / withCleanupStamp).

create or replace function public.wine_footprint_clean_core(
  p_raw extensions.geometry, p_blockers extensions.geometry, p_parent extensions.geometry,
  p_protected extensions.geometry, p_params jsonb)
returns table (clean4 extensions.geometry, unchanged boolean, area_m2_before double precision, area_m2_after double precision, parts_before integer, parts_after integer, holes_before integer, holes_after integer, vertices_before integer, vertices_after integer, perimeter_m_before double precision, perimeter_m_after double precision, clusters integer, passthrough_clusters integer, dropped_parts integer, hole_floor_m2 double precision, crumb_floor_m2 double precision, grown_m2 double precision, lost_m2 double precision, raw_overlap_m2 double precision, new_overlap_m2 double precision, new_overlap_sliver_m2 double precision, outside_parent_raw_m2 double precision, outside_parent_new_m2 double precision, protected_lost_m2 double precision, valid boolean)
language sql stable
set search_path = public, extensions
as $core$
with prm as (
  select (p->>'gap_m')::float8 d, (p->>'arm_m')::float8 e, (p->>'arm_keep_share')::float8 ks,
         (p->>'hole_min_m2')::float8 hmin, (p->>'hole_share')::float8 hsh, (p->>'hole_max_m2')::float8 hmax,
         (p->>'crumb_min_m2')::float8 cmin, (p->>'crumb_share')::float8 csh, (p->>'crumb_max_m2')::float8 cmax,
         (p->>'crumb_cap_share')::float8 ccap, (p->>'noop_share')::float8 noop, p->>'buffer_style' sty,
         (p->>'grid_deg')::float8 grid, coalesce((p->>'denoise_m')::float8, 0) dn
    from (select $5::jsonb p) z),
i0 as (select st_multi(st_collectionextract(st_makevalid($1::geometry), 3)) r4),
i as (select i0.r4, $2::geometry blk4, $3::geometry par4, $4::geometry prot4,
             (case when st_y(st_centroid(i0.r4)) >= 0 then 32600 else 32700 end)
               + least(60, greatest(1, floor((st_x(st_centroid(i0.r4)) + 180) / 6)::int + 1)) srid
        from i0),
g as (select st_collectionextract(st_reduceprecision(i.r4, prm.grid), 3) r4g,
             case when i.blk4 is null then null else st_collectionextract(st_reduceprecision(i.blk4, prm.grid), 3) end blk,
             case when i.par4 is null then null else st_collectionextract(st_reduceprecision(i.par4, prm.grid), 3) end par,
             case when i.prot4 is null then null else st_collectionextract(st_reduceprecision(i.prot4, prm.grid), 3) end prot
        from i, prm),
u as (select st_unaryunion(st_reduceprecision(st_transform(i.r4, i.srid), 0.001)) r from i),
a as (select st_area(r) area from u),
fl as (select least(greatest(prm.hsh * a.area, prm.hmin), prm.hmax) hfloor,
              least(greatest(prm.csh * a.area, prm.cmin), prm.cmax) cfloor from a, prm),
parts as (select (st_dump(r)).geom pg from u),
cl as (select pg, st_clusterdbscan(pg, eps := (select d from prm), minpoints := 1) over () cid from parts),
clusters as (select cid, st_unaryunion(st_collect(pg)) g from cl group by cid),
proc as (
  select c.cid, c.g raw, o.g cleaned, hr.g hraw
    from clusters c cross join prm cross join fl
    -- close: radius gap_m/2, mitre joins, never losing raw ground
    cross join lateral (select st_union(st_buffer(st_buffer(c.g, prm.d / 2, prm.sty), -prm.d / 2, prm.sty), c.g) g) clo
    -- the raw cluster with only its small holes filled (raw vertices kept)
    cross join lateral (
      select st_unaryunion(st_collect(case when st_numinteriorrings(q) = 0 then q else st_makepolygon(st_exteriorring(q),
        coalesce((select array_agg(st_interiorringn(q, k)) from generate_series(1, st_numinteriorrings(q)) k
                   where st_area(st_makepolygon(st_interiorringn(q, k))) >= fl.hfloor), array[]::geometry[])) end)) g
        from (select (st_dump(c.g)).geom q) z) hr
    -- fill holes under the hole floor
    cross join lateral (
      select st_unaryunion(st_collect(case when st_numinteriorrings(q) = 0 then q else st_makepolygon(st_exteriorring(q),
        coalesce((select array_agg(st_interiorringn(q, k)) from generate_series(1, st_numinteriorrings(q)) k
                   where st_area(st_makepolygon(st_interiorringn(q, k))) >= fl.hfloor), array[]::geometry[])) end)) g
        from (select (st_dump(st_collectionextract(clo.g, 3))).geom q) z) hf
    -- open arms under arm_m; a part the opening would gut or split is kept whole
    cross join lateral (
      select st_unaryunion(st_collect(case when keep then q else oq end)) g
        from (select q, oq, (prm.e <= 0 or st_isempty(oq) or st_area(oq) < prm.ks * st_area(q)
                  or (select count(*) from st_dump(oq) dd where st_area(dd.geom) >= prm.cmin) > 1) keep
                from (select q, case when prm.e > 0 then st_buffer(st_buffer(q, -prm.e / 2, prm.sty), prm.e / 2, prm.sty) else q end oq
                        from (select (st_dump(hf.g)).geom q) z) z2) z3) o),
sel as (select cid, raw, cleaned, hraw,
          (st_area(st_symdifference(hraw, cleaned)) < (select noop from prm) * st_area(raw)
           and st_numgeometries(hraw) = st_numgeometries(cleaned)) passthru
          from proc),
s_utm as (select st_unaryunion(st_collect(case when passthru then hraw else st_simplifypreservetopology(cleaned, (select dn from prm)) end)) g from sel),
-- back to 4326 on the shared grid; from here on every operation is exact against neighbours
s4 as (select st_collectionextract(st_reduceprecision(st_transform(s_utm.g, 4326), prm.grid), 3) g from s_utm, prm),
-- constrain: no new ground on a non-partner same-tier place, none outside the containment
-- parent, and never remove ground a descendant holds
c1 as (select case when g.blk is null then s4.g else st_collectionextract(st_difference(s4.g, st_collectionextract(st_difference(g.blk, g.r4g, prm.grid), 3), prm.grid), 3) end cg from s4, g, prm),
c2 as (select case when g.par is null then c1.cg else st_collectionextract(st_intersection(c1.cg, st_collectionextract(st_union(g.par, g.r4g, prm.grid), 3), prm.grid), 3) end cg from c1, g, prm),
c3 as (select case when g.prot is null then c2.cg else st_collectionextract(st_union(c2.cg, st_collectionextract(st_intersection(g.r4g, g.prot, prm.grid), 3), prm.grid), 3) end cg from c2, g, prm),
-- crumbs, after the constraint (so its slivers go too)
cparts as (select (st_dump(st_collectionextract(c3.cg, 3))).geom pg from c3),
ranked as (select pg, st_area(pg::geography) ar, row_number() over (order by st_area(pg::geography) desc) rk,
                  sum(st_area(pg::geography)) over () tot,
                  coalesce((select g.prot is not null and st_relate(pg, g.prot, 'T********') from g), false) holds
             from cparts),
cr as (select coalesce(sum(ar) filter (where ar < (select cfloor from fl) and rk > 1 and not holds), 0) dropped,
              count(*) filter (where ar < (select cfloor from fl) and rk > 1 and not holds) ndropped, max(tot) total from ranked),
kept as (select pg from ranked, cr, fl, prm
          where not (ranked.ar < fl.cfloor and ranked.rk > 1 and not ranked.holds and cr.dropped <= prm.ccap * cr.total)),
out0 as (select st_multi(st_collectionextract(st_makevalid(st_unaryunion(st_collect(pg), (select grid from prm))), 3)) g from kept),
-- whole-place pass-through: same parts, same holes, moved < noop of the area -> the input byte for byte
same as (select coalesce(st_area(st_symdifference(st_transform(i.r4, i.srid), st_transform(out0.g, i.srid))) < prm.noop * a.area
                 and st_numgeometries(i.r4) = st_numgeometries(out0.g) and st_nrings(i.r4) = st_nrings(out0.g), false) v
           from i, out0, prm, a),
fin as (select case when same.v then $1::geometry else out0.g end g from same, out0),
m as (select st_transform(i.r4, i.srid) rm, st_transform(fin.g, i.srid) fm from i, fin),
-- new ground on a non-partner, piece by piece: a piece whose mean width (2A/P) is under 0.1 m is
-- overlay noise on the 1e-6 degree grid (~0.07-0.11 m), never real ground; it is counted apart
ov as (select st_area(d.geom::geography) a, coalesce(2 * st_area(d.geom::geography) / nullif(st_perimeter(d.geom::geography), 0), 0) w
         from g, fin, prm, lateral st_dump(st_collectionextract(st_intersection(st_collectionextract(st_difference(st_reduceprecision(fin.g, prm.grid), g.r4g, prm.grid), 3), g.blk, prm.grid), 3)) d
        where g.blk is not null)
select (select g from fin) clean4, (select v from same) unchanged,
  (select round(area::numeric, 2)::float8 from a) area_m2_before, (select round(st_area(fm)::numeric, 2)::float8 from m) area_m2_after,
  (select st_numgeometries(r4) from i) parts_before, (select st_numgeometries(g) from fin) parts_after,
  (select st_nrings(r4) - st_numgeometries(r4) from i) holes_before, (select st_nrings(g) - st_numgeometries(g) from fin) holes_after,
  (select st_npoints(r4) from i) vertices_before, (select st_npoints(g) from fin) vertices_after,
  (select round(st_perimeter(rm)::numeric, 2)::float8 from m) perimeter_m_before, (select round(st_perimeter(fm)::numeric, 2)::float8 from m) perimeter_m_after,
  (select count(*)::int from clusters) clusters, (select count(*)::int from sel where passthru) passthrough_clusters,
  (select ndropped::int from cr) dropped_parts,
  (select round(hfloor::numeric, 2)::float8 from fl) hole_floor_m2, (select round(cfloor::numeric, 2)::float8 from fl) crumb_floor_m2,
  (select round(st_area(st_difference(fm, rm))::numeric, 2)::float8 from m) grown_m2,
  (select round(st_area(st_difference(rm, fm))::numeric, 2)::float8 from m) lost_m2,
  (select case when g.blk is null then 0 else round(st_area(st_collectionextract(st_intersection(g.r4g, g.blk, (select grid from prm)), 3)::geography)::numeric, 2)::float8 end from g) raw_overlap_m2,
  (select coalesce(round(sum(a) filter (where w >= 0.1)::numeric, 2)::float8, 0) from ov) new_overlap_m2,
  (select coalesce(round(sum(a) filter (where w < 0.1)::numeric, 2)::float8, 0) from ov) new_overlap_sliver_m2,
  (select case when g.par is null then 0 else round(st_area(st_collectionextract(st_difference(g.r4g, g.par, (select grid from prm)), 3)::geography)::numeric, 2)::float8 end from g) outside_parent_raw_m2,
  (select case when g.par is null then 0 else round(st_area(st_collectionextract(st_difference(st_collectionextract(st_difference(st_reduceprecision(fin.g, (select grid from prm)), g.r4g, (select grid from prm)), 3), g.par, (select grid from prm)), 3)::geography)::numeric, 2)::float8 end from g, fin) outside_parent_new_m2,
  (select case when g.prot is null then 0 else round(st_area(st_collectionextract(st_difference(st_collectionextract(st_intersection(g.r4g, g.prot, (select grid from prm)), 3), st_reduceprecision(fin.g, (select grid from prm)), (select grid from prm)), 3)::geography)::numeric, 2)::float8 end from g, fin) protected_lost_m2,
  (select st_isvalid(g) from fin) valid$core$;

create or replace function public.wine_footprint_clean(
  p_raw extensions.geometry, p_place_id uuid, p_pending jsonb default '{}'::jsonb, p_params jsonb default null)
returns table (geom extensions.geometry, cleanup jsonb)
language plpgsql stable security invoker
set search_path = public, extensions
as $fn$
declare
  v_params jsonb := coalesce(p_params, $p${"version":"fp-1","gap_m":20,"arm_m":10,"arm_keep_share":0.5,"hole_min_m2":2000,"hole_share":0.001,"hole_max_m2":250000,"crumb_min_m2":1000,"crumb_share":0.005,"crumb_max_m2":1000,"crumb_cap_share":0.02,"noop_share":0.005,"buffer_style":"join=mitre mitre_limit=3","grid_deg":0.000001,"denoise_m":0.01,"grow_max":0.1,"shrink_max":0.03,"near_m":50,"protect_min_m2":1}$p$::jsonb);
  v_pending jsonb := coalesce(p_pending, '{}'::jsonb);
  v_ctx record;
  v_r record;
  v_prot extensions.geometry;
  v_try jsonb;
  v_rung text;
  v_reason text;
  v_status text;
  v_out extensions.geometry;
  v_before numeric;
  v_delta numeric;
  v_stamp jsonb;
begin
  if p_raw is null then
    raise exception 'wine_footprint_clean: no geometry for place %', p_place_id using errcode = '22004';
  end if;
  execute $ctx$
with recursive me as (
  select p.id, p.canonical_key k, p.display_tier tier, p.primary_parent_id ppid
    from public.wine_places p where p.id = $1::uuid),
pend as (
  select (e.key)::uuid id, st_geomfromewkb(decode(e.value, 'hex')) g
    from jsonb_each_text(coalesce($3::jsonb, '{}'::jsonb)) e),
partner as (
  select case when r.source_place_id = me.id then r.target_place_id else r.source_place_id end pid
    from public.wine_place_relationships r, me
   where (r.source_place_id = me.id or r.target_place_id = me.id)
     and r.relationship_type::text in ('DUAL_LABEL', 'OVERLAPS', 'REPLACES_WITHIN')),
near as (
  select b.wine_place_id id, b.display_geometry g
    from public.wine_place_boundaries b
   where b.display_geometry && st_expand($2::geometry, 0.002)
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
   where i.display_geometry && st_expand($2::geometry, 0.002)
     and b.is_current and b.quality_status = 'VALIDATED'
  union all
  select pend.id, pend.g from pend where pend.g && st_expand($2::geometry, 0.002)),
blk as (
  select q.canonical_key k, near.g
    from near join public.wine_places q on q.id = near.id, me
   where q.display_tier = me.tier and q.id <> me.id
     and q.id not in (select pid from partner)
     and st_dwithin(near.g::geography, $2::geometry::geography, 50)),
anc as (
  select q.id, q.primary_parent_id, 1 depth from public.wine_places q, me where q.id = me.ppid
  union all
  select q.id, q.primary_parent_id, anc.depth + 1 from public.wine_places q join anc on q.id = anc.primary_parent_id
   where anc.depth < 20),
par as (
  select q.canonical_key k, coalesce(pend.g, b.display_geometry) g
    from anc join public.wine_places q on q.id = anc.id
    left join pend on pend.id = anc.id
    left join public.wine_place_boundaries b
      on b.wine_place_id = anc.id and b.is_current and b.quality_status = 'VALIDATED'
   where (pend.id is not null or b.id is not null)
     and coalesce(b.boundary_method::text, '') <> 'DERIVED_FROM_DESCENDANTS'
   order by anc.depth limit 1)
select me.tier, me.k,
  coalesce((select array_agg(q.canonical_key order by q.canonical_key)
              from (select distinct pid from partner) x join public.wine_places q on q.id = x.pid), '{}'::text[]) partner_keys,
  (select st_unaryunion(st_collect(blk.g)) from blk) blockers,
  coalesce((select array_agg(distinct blk.k order by blk.k) from blk), '{}'::text[]) blocker_keys,
  (select par.k from par) parent_key,
  (select par.g from par) parent
from me$ctx$ into v_ctx using p_place_id, p_raw, v_pending;
  if v_ctx.k is null then
    raise exception 'wine_footprint_clean: no wine_places row %', p_place_id using errcode = '23503';
  end if;
  foreach v_rung in array array['full', 'close-only'] loop
    v_try := case when v_rung = 'full' then v_params else v_params || '{"arm_m": 0}'::jsonb end;
    v_prot := null;
    select * into v_r from public.wine_footprint_clean_core(p_raw, v_ctx.blockers, v_ctx.parent, null, v_try);
    if not v_r.unchanged then
      execute $prot$
with recursive des as (
  select q.id, 1 depth from public.wine_places q where q.primary_parent_id = $1::uuid
  union all
  select q.id, des.depth + 1 from public.wine_places q join des on q.primary_parent_id = des.id where des.depth < 20),
pend as (
  select (e.key)::uuid id, st_geomfromewkb(decode(e.value, 'hex')) g
    from jsonb_each_text(coalesce($4::jsonb, '{}'::jsonb)) e),
lost as (
  select st_collect(d.geom) g
    from st_dump(st_collectionextract(st_difference(
           st_reduceprecision($2::geometry, 0.000001), st_reduceprecision($3::geometry, 0.000001), 0.000001), 3)) d
   where st_area(d.geom::geography) >= 1),
dg as (
  select coalesce(pend.g, b.display_geometry) g
    from des
    left join pend on pend.id = des.id
    left join public.wine_place_boundaries b on b.wine_place_id = des.id and pend.id is null and ((b.is_current and b.quality_status = 'VALIDATED')
          or (not b.is_current and b.quality_status = 'DRAFT'
              and b.generation_parameters->'cleanup'->>'version' = 'fp-1')))
select st_unaryunion(st_collect(dg.g)) prot
  from dg, lost
 where dg.g is not null and lost.g is not null and dg.g && lost.g and st_intersects(dg.g, lost.g)$prot$ into v_prot using p_place_id, p_raw, v_r.clean4, v_pending;
      if v_prot is not null then
        select * into v_r from public.wine_footprint_clean_core(p_raw, v_ctx.blockers, v_ctx.parent, v_prot, v_try);
      end if;
    end if;
    -- the ladder (footprint-sql.mjs ladderReason)
    v_before := v_r.area_m2_before;
    if v_r.valid is not true or v_before is null or v_before <= 0 then v_reason := 'invalid';
    else
      v_delta := (v_r.area_m2_after - v_before) / v_before;
      if v_delta > (v_try->>'grow_max')::numeric then v_reason := 'grow';
      elsif v_delta < -(v_try->>'shrink_max')::numeric then v_reason := 'shrink';
      elsif v_r.parts_after > v_r.parts_before then v_reason := 'parts';
      else v_reason := null;
      end if;
    end if;
    exit when v_reason is null;
  end loop;
  if v_reason is null then
    v_out := v_r.clean4;
    v_status := case when v_r.unchanged then 'unchanged' else 'cleaned' end;
  else
    v_out := p_raw;
    v_rung := 'none';
    v_status := 'skipped:' || v_reason;
  end if;
  execute $stamp$
select jsonb_build_object(
  'version', $6::jsonb->>'version',
  'params', $6::jsonb->'params',
  'rung', $6::jsonb->>'rung',
  'status', $6::jsonb->>'status',
  'input_sha256', encode(sha256(st_asewkb($1::geometry)), 'hex'),
  'input_boundary_id', $6::jsonb->'input_boundary_id',
  'context', jsonb_build_object(
    'partners', $6::jsonb->'partners',
    'blockers_sha256', case when $3::geometry is null then null else encode(sha256(st_asewkb($3::geometry)), 'hex') end,
    'parent_key', $6::jsonb->'parent_key',
    'parent_sha256', case when $4::geometry is null then null else encode(sha256(st_asewkb($4::geometry)), 'hex') end,
    'protected_sha256', case when $5::geometry is null then null else encode(sha256(st_asewkb($5::geometry)), 'hex') end),
  'output_sha256', encode(sha256(st_asewkb($2::geometry)), 'hex'),
  'metrics', $6::jsonb->'metrics',
  'postgis', postgis_lib_version(),
  'geos', postgis_geos_version()) stamp,
  encode(st_asewkb($2::geometry), 'hex') out_hex$stamp$ into v_stamp
    using p_raw, v_out, v_ctx.blockers, v_ctx.parent, v_prot,
          jsonb_build_object('version', 'fp-1', 'params', v_try, 'rung', v_rung, 'status', v_status,
                             'input_boundary_id', null, 'partners', to_jsonb(v_ctx.partner_keys),
                             'parent_key', v_ctx.parent_key, 'metrics', to_jsonb(v_r) - 'clean4');
  return query select v_out, v_stamp;
end
$fn$;

create or replace function public.wine_place_boundaries_require_cleanup()
returns trigger
language plpgsql
set search_path = public, extensions
as $fn$
begin
  if coalesce(new.generation_parameters->'cleanup'->>'version', '') <> 'fp-1'
     or new.display_geometry is null
     or coalesce(new.generation_parameters->'cleanup'->>'output_sha256', '')
        <> encode(sha256(st_asewkb(new.display_geometry)), 'hex') then
    raise exception 'wine_place_boundaries: display_geometry must come from public.wine_footprint_clean (fp-1)'
      using errcode = '23514',
            hint = 'Build the INSERT with cleanGeomCte() and withCleanupStamp() from scripts/wine-map-sources/footprint-cleanup.mjs (or footprint-pass.mjs for the one-off pass); generation_parameters.cleanup.output_sha256 must equal sha256(ST_AsEWKB(display_geometry)).';
  end if;
  return new;
end
$fn$;

drop trigger if exists wine_place_boundaries_require_cleanup on public.wine_place_boundaries;
create trigger wine_place_boundaries_require_cleanup
  before insert or update of display_geometry on public.wine_place_boundaries
  for each row execute function public.wine_place_boundaries_require_cleanup();

revoke all on function public.wine_footprint_clean_core(extensions.geometry, extensions.geometry, extensions.geometry, extensions.geometry, jsonb) from public, anon, authenticated, service_role;
revoke all on function public.wine_footprint_clean(extensions.geometry, uuid, jsonb, jsonb) from public, anon, authenticated, service_role;
revoke all on function public.wine_place_boundaries_require_cleanup() from public, anon, authenticated, service_role;

do $check$
begin
  if to_regprocedure('public.wine_footprint_clean(extensions.geometry, uuid, jsonb, jsonb)') is null then
    raise exception 'wine_footprint_clean was not created';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'wine_place_boundaries_require_cleanup' and not tgisinternal) then
    raise exception 'wine_place_boundaries_require_cleanup trigger was not created';
  end if;
  if has_function_privilege('service_role', 'public.wine_footprint_clean(extensions.geometry, uuid, jsonb, jsonb)', 'execute')
     or has_function_privilege('authenticated', 'public.wine_footprint_clean(extensions.geometry, uuid, jsonb, jsonb)', 'execute') then
    raise exception 'wine_footprint_clean is executable by a client role';
  end if;
end
$check$;
