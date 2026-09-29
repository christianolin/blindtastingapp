-- Training room on the wine map, phase R2 (spec
-- docs/superpowers/specs/2026-09-29-training-room-map-design.md §4.3, RM12, RM23).
-- Curated, display-only points for the typical wines that have no map place:
-- two nullable columns on wine_archetypes and the spec's §7 values, set BY ID,
-- each guarded by the live name, and only while the archetype is still
-- unplaced (wine_place_id is null). An archetype already placed (the USA wave
-- may place Napa, Sonoma and Willamette first) is skipped with a notice: it has
-- a real point, and the room never reads a curated one while a place point
-- exists.
--
-- These are approximate centres of each wine's growing area, NOT boundaries
-- and NOT appellation claims; they are never a wine_places row. The two Wachau
-- wines share one point on purpose (owner decision O5).
--
-- The room reads them with its own fail-soft select (spec RM23), so the app
-- deployed before this migration keeps working. Grants on wine_archetypes are
-- table-level (authenticated holds SELECT), so the new columns need no grant;
-- the asserts check that. It writes no wine_places or wine_place_boundaries
-- row: no neighbour-cache refresh (CLAUDE.md), no tiles run.
-- No begin/commit: the applier owns the transaction.

-- The alter takes an ACCESS EXCLUSIVE lock: never queue behind a neighbour
-- refresh or a collaborator's write. On timeout the apply fails; retry it.
set local lock_timeout = '5s';

alter table public.wine_archetypes
  add column display_lon double precision,
  add column display_lat double precision,
  add constraint wine_archetypes_display_point_check check (
    (display_lon is null and display_lat is null)
    or (display_lon is not null and display_lat is not null
        and display_lon between -180 and 180
        and display_lat between -90 and 90)
  );

do $$
declare
  r record;
  n int;
  v_expected int := 0;
  v_got int;
begin
  for r in
    select * from (values
      ('569e2a6f-a31b-4a88-86c2-d49c3eb7c83e'::uuid, 'A typical Mendoza Malbec',                 -68.88::float8, -33.05::float8),
      ('8c350884-ab3d-4e14-906d-b9046dd6ba23'::uuid, 'A typical Barossa Shiraz',                 138.96, -34.52),
      ('b4abafcc-03e4-4b9d-9288-4384fe685bcb'::uuid, 'A typical Clare Valley Riesling',          138.61, -33.83),
      ('6de675c2-0611-460d-8b89-506e26f9fff9'::uuid, 'A typical Coonawarra Cabernet Sauvignon',  140.83, -37.29),
      ('4d159a28-6ee3-445e-a821-e314c6bd58c2'::uuid, 'A typical Eden Valley Riesling',           139.10, -34.65),
      ('43805ec4-e7ea-4b06-a651-834da6299acb'::uuid, 'A typical Hunter Valley Semillon',         151.29, -32.78),
      ('cf054f8a-07e9-4d23-ac6c-ac9eca9e59df'::uuid, 'A typical Blaufränkisch',                   16.63,  47.60),
      ('a92188eb-fc36-4ad1-89c9-dda9a9d53594'::uuid, 'A typical Wachau Grüner Veltliner',         15.42,  48.39),
      ('5a8a879d-03c7-445f-85b8-63837dcdb104'::uuid, 'A typical Wachau Riesling',                 15.42,  48.39),
      ('05235473-fc75-4f5c-8908-df19b911ab55'::uuid, 'A typical Chilean Cabernet Sauvignon',     -70.57, -33.61),
      ('3d7aa7a4-846d-4210-a109-b3f07f6cf466'::uuid, 'A typical Santorini Assyrtiko',             25.44,  36.39),
      ('a8097ab3-0200-4ccc-8ab3-0881e21fd535'::uuid, 'A typical Tokaji Aszú',                     21.28,  48.19),
      ('d46a437c-cba9-4966-894f-2da4d808b075'::uuid, 'A typical Central Otago Pinot Noir',       169.20, -45.07),
      ('cd76ac56-06a3-4eb1-8ac6-97a359913f5d'::uuid, 'A typical Marlborough Sauvignon Blanc',    173.83, -41.51),
      ('3ff0167e-6b23-415e-912c-d978a02adf9d'::uuid, 'A typical Stellenbosch Chenin Blanc',       18.86, -33.93),
      ('75e4e467-3929-4844-bbc4-ffe8b12523a1'::uuid, 'A typical Napa Cabernet Sauvignon',       -122.40,  38.43),
      ('c4ea77f3-5599-43dd-bdc3-4287c1e0ea15'::uuid, 'A typical Sonoma Chardonnay',             -122.82,  38.40),
      ('bab8537e-b0bc-4f7c-8547-242537322f8a'::uuid, 'A typical Willamette Pinot Noir',         -123.03,  45.28)
    ) v(id, name, lon, lat)
  loop
    select count(*) into n from public.wine_archetypes where id = r.id and name = r.name;
    if n <> 1 then
      raise exception 'display points: "%" (%) is not a live archetype by that id and name', r.name, r.id;
    end if;
    if exists (select 1 from public.wine_archetypes where id = r.id and wine_place_id is not null) then
      raise notice 'display points: "%" already has a map place; skipped', r.name;
      continue;
    end if;
    update public.wine_archetypes
       set display_lon = r.lon, display_lat = r.lat
     where id = r.id and wine_place_id is null;
    get diagnostics n = row_count;
    if n <> 1 then
      raise exception 'display points: "%" updated % rows, expected 1', r.name, n;
    end if;
    v_expected := v_expected + 1;
  end loop;

  -- 18 on 2026-09-29; 15 once the USA wave has placed its three.
  select count(*) into v_got from public.wine_archetypes where display_lon is not null;
  if v_got <> v_expected then
    raise exception 'display points: % archetypes carry a point, % expected', v_got, v_expected;
  end if;
  if not (has_column_privilege('authenticated', 'public.wine_archetypes', 'display_lon', 'SELECT')
          and has_column_privilege('authenticated', 'public.wine_archetypes', 'display_lat', 'SELECT')) then
    raise exception 'display points: authenticated cannot read the new columns';
  end if;
end $$;

notify pgrst, 'reload schema';
