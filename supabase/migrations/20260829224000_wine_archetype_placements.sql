-- Where each archetype "typical wine" is surfaced in the map hierarchy. An
-- archetype has a home place (wine_archetypes.wine_place_id) but should also
-- appear at ancestors a curator picks (e.g. "A typical Chablis" at Burgundy +
-- Chablis subregion + Chablis appellation). This join drives the map popup and
-- is edited from the admin section. Reads: all authenticated. Writes: admins.

create table if not exists wine_archetype_placements (
  id uuid primary key default gen_random_uuid(),
  archetype_id uuid not null references wine_archetypes(id) on delete cascade,
  wine_place_id uuid not null references wine_places(id) on delete cascade,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  unique (archetype_id, wine_place_id)
);
create index if not exists wine_archetype_placements_place_idx
  on wine_archetype_placements (wine_place_id);

alter table wine_archetype_placements enable row level security;

drop policy if exists "archetype placements read" on wine_archetype_placements;
create policy "archetype placements read" on wine_archetype_placements
  for select to authenticated using (true);
drop policy if exists "archetype placements write" on wine_archetype_placements;
create policy "archetype placements write" on wine_archetype_placements for all to authenticated
  using (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'ADMIN'))
  with check (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'ADMIN'));

-- Backfill: every archetype is placed at its own home place (preserving the
-- current map behaviour), carrying its sort_order so the popup order is stable.
insert into wine_archetype_placements (archetype_id, wine_place_id, sort_order)
select a.id, a.wine_place_id, a.sort_order
from wine_archetypes a
on conflict (archetype_id, wine_place_id) do nothing;

-- Multi-level placements for existing appellation archetypes: Chablis rolls up
-- to the Chablis subregion and to Burgundy; Vosne-Romanée rolls up to the Côte
-- de Nuits subregion (Burgundy itself shows subregion representatives, authored
-- in a later migration).
insert into wine_archetype_placements (archetype_id, wine_place_id, sort_order)
select a.id, p.id, 10
from wine_archetypes a
join wine_places p
  on p.canonical_key = any(array['france.bourgogne', 'france.bourgogne.chablis'])
where a.name = 'A typical Chablis'
on conflict (archetype_id, wine_place_id) do nothing;

insert into wine_archetype_placements (archetype_id, wine_place_id, sort_order)
select a.id, p.id, 20
from wine_archetypes a
join wine_places p on p.canonical_key = 'france.bourgogne.cote-de-nuits'
where a.name = 'A typical Vosne-Romanée'
on conflict (archetype_id, wine_place_id) do nothing;

do $$
declare v_arch int; v_place int;
begin
  if to_regclass('public.wine_archetype_placements') is null then
    raise exception 'final-state: wine_archetype_placements missing'; end if;
  select count(*) into v_arch from wine_archetypes;
  select count(distinct archetype_id) into v_place from wine_archetype_placements;
  if v_place < v_arch then
    raise exception 'final-state: every archetype needs a placement (% vs %)', v_arch, v_place; end if;
end $$;
