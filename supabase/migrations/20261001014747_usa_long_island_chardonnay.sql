-- USA on the wine map, a post-release grape-role correction on Long Island
-- (spec docs/superpowers/specs/2026-09-29-usa-wine-map-design.md §27, the role
-- rule: a grape is PRINCIPAL only where a cited source ranks it among the
-- place's leaders, at most three, never passing over a grape that list ranks
-- higher).
--
-- united-states.new-york.long-island (US-2, live) lists Merlot and Cabernet
-- Franc as PRINCIPAL and Chardonnay as ACCESSORY. Its grape source, the New
-- York Wine & Grape Foundation Long Island sheet, ranks Merlot (658 acres),
-- Chardonnay (440), Cabernet Franc (215) and Cabernet Sauvignon (143), so the
-- PRINCIPAL Cabernet Franc passed over Chardonnay. Chardonnay becomes
-- PRINCIPAL: the place's signature grapes are that list's first three. New
-- York's shortlist then counts Chardonnay as a signature grape on 4 places
-- against Riesling's 5, so Riesling still leads alone (asserted below).
--
-- The US-2 knowledge migration (20260930094747) is applied and is not edited.
-- data/wine-map/place-profiles-usa.json carries the corrected role, and
-- scripts/usa-map/usa-knowledge.mjs's US2_CORRECTIONS names this migration, so
-- the data-vs-migration test still fails on any other drift.
--
-- Writes one wine_place_grapes row and nothing else: no wine_places or
-- wine_place_boundaries write, so no neighbour refresh; get_wine_place_context
-- serves grapes at request time, so no tiles run. Fails closed: the place and
-- the grape must each resolve to exactly one row, the link must exist and be
-- ACCESSORY (a second run refuses), exactly one row must change, and Riesling
-- must still lead New York alone. Hand-written; there is no renderer.
-- No begin/commit: the applier owns the transaction (D24).

set local lock_timeout = '5s';

do $$
declare
  v_place uuid;
  v_grape uuid;
  v_link uuid;
  v_role text;
  v_n int;
  v_rows int;
  v_top text;
  v_riesling int;
  v_chardonnay int;
  v_next int;
begin
  select count(*) into v_n from public.wine_places where canonical_key = 'united-states.new-york.long-island';
  if v_n <> 1 then
    raise exception 'Long Island Chardonnay: % places keyed united-states.new-york.long-island, expected 1', v_n;
  end if;
  select id into v_place from public.wine_places where canonical_key = 'united-states.new-york.long-island';

  select count(*) into v_n from public.grapes where name = 'Chardonnay';
  if v_n <> 1 then
    raise exception 'Long Island Chardonnay: % grapes named Chardonnay, expected 1', v_n;
  end if;
  select id into v_grape from public.grapes where name = 'Chardonnay';

  select count(*) into v_n from public.wine_place_grapes where wine_place_id = v_place and grape_id = v_grape;
  if v_n <> 1 then
    raise exception 'Long Island Chardonnay: % grape links, expected 1 (is the US-2 knowledge live?)', v_n;
  end if;
  select id, role::text into v_link, v_role
    from public.wine_place_grapes where wine_place_id = v_place and grape_id = v_grape;
  if v_role <> 'ACCESSORY' then
    raise exception 'Long Island Chardonnay: the link is %, expected ACCESSORY (applied twice?)', v_role;
  end if;

  update public.wine_place_grapes
     set role = 'PRINCIPAL'
   where id = v_link and role = 'ACCESSORY';
  get diagnostics v_rows = row_count;
  if v_rows <> 1 then
    raise exception 'Long Island Chardonnay: % rows changed, expected 1', v_rows;
  end if;

  -- New York's shortlist (src/lib/grape-shortlist.ts): the state and every
  -- place beneath it by primary_parent_id, as a signed-in reader sees them
  -- (VERIFIED places, PUBLISHED links), signature links counted per grape.
  -- Riesling must lead alone.
  with recursive tree as (
    select id from public.wine_places where canonical_key = 'united-states.new-york'
    union all
    select p.id from public.wine_places p join tree t on p.primary_parent_id = t.id
  ), counts as (
    select gr.name, count(*)::int n
      from tree t
      join public.wine_places p on p.id = t.id and p.publication_status = 'VERIFIED'
      join public.wine_place_grapes l on l.wine_place_id = p.id
       and l.role = 'PRINCIPAL' and l.editorial_status = 'PUBLISHED'
      join public.grapes gr on gr.id = l.grape_id
     group by gr.name
  )
  select (select string_agg(name, ', ' order by name) from counts where n = (select max(n) from counts)),
         coalesce((select n from counts where name = 'Riesling'), 0),
         coalesce((select n from counts where name = 'Chardonnay'), 0),
         coalesce((select max(n) from counts where name <> 'Riesling'), 0)
    into v_top, v_riesling, v_chardonnay, v_next;
  if v_riesling <= v_next then
    raise exception 'Long Island Chardonnay: New York''s shortlist would lead with % (Riesling %, the next grape %), not Riesling alone',
      coalesce(v_top, 'nothing'), v_riesling, v_next;
  end if;

  raise notice 'Long Island Chardonnay: ACCESSORY -> PRINCIPAL (% row). New York signature links: Riesling %, Chardonnay %, the most of any other grape %',
    v_rows, v_riesling, v_chardonnay, v_next;
end $$;
