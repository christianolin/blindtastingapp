-- Producers previously had no link to region/country at all -- the original
-- LWIN import deduped them purely by name (safeKey()), discarding each raw
-- row's country/region before the final insert. Add a nullable region_id so
-- the producer combobox can be scoped the same way appellations already are.
--
-- Nullable (unlike appellations.region_id, which is `not null`) because an
-- analysis of the raw LWIN source found ~4.7% of producers are genuinely
-- multi-region (large negociants/brands with estates in more than one place,
-- e.g. "Penfolds" across several Australian regions, "William Fevre" in both
-- Bourgogne and Chile) -- forcing a single region on those would make the
-- true answer silently unfindable in a region-scoped search. Those stay NULL
-- on purpose. See scripts/backfill-producer-regions.mjs for how region_id is
-- populated for the ~95% of producers with a clear (or strongly dominant)
-- home region.
alter table producers add column if not exists region_id uuid references regions(id);
create index if not exists producers_region_id_idx on producers(region_id);

-- Replaces the single-arg version from 20260716160000_accent_insensitive_search.sql
-- (different signature, so the old one needs an explicit drop -- create or
-- replace can't change a function's argument list).
drop function if exists public.search_producers(text);

create or replace function public.search_producers(
  p_query text,
  p_region_id uuid default null
)
returns table (id uuid, name text)
language sql
stable
security definer
set search_path = public, extensions
as $func$
  select p.id, p.name
  from producers p
  where public.f_unaccent(p.name) ilike '%' || public.f_unaccent(p_query) || '%'
    and (p_region_id is null or p.region_id is null or p.region_id = p_region_id)
  order by p.name
  limit 25
$func$;

grant execute on function public.search_producers(text, uuid) to authenticated;
