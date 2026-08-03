-- Reference search ignored punctuation differences: searching "la fleur petrus"
-- could not find the producer "Château La Fleur-Petrus" because the hyphen (and
-- the "Château" prefix) broke the `f_unaccent(name) ilike '%…%'` match. Normalise
-- BOTH the stored name and the query down to lowercase alphanumerics (accents
-- folded via f_unaccent, then spaces/hyphens/apostrophes/periods stripped) before
-- matching, so a hyphen reads as a space or as nothing interchangeably. A
-- functional pg_trgm GIN index on the normalised name keeps the contains-search
-- fast on the large (LWIN) producers table.

-- Immutable so it can back a functional index. All refs are schema-qualified or
-- built-in, so no search_path is needed. f_unaccent is already immutable (it
-- backs the existing accent-insensitive trigram indexes).
create or replace function public.f_search_norm(txt text)
returns text
language sql
immutable
parallel safe
as $func$
  select regexp_replace(public.f_unaccent(lower(coalesce(txt, ''))), '[^a-z0-9]+', '', 'g')
$func$;

create index if not exists idx_producers_search_norm
  on public.producers using gin (public.f_search_norm(name) gin_trgm_ops);

-- Recreate search_producers to match on the normalised form. Same signature and
-- same region-grouping + instant-first-page behaviour as v3
-- (20260721090000_producer_search_groups.sql); only the match expression changes.
create or replace function public.search_producers(
  p_query text,
  p_region_id uuid default null
)
returns table (id uuid, name text, in_region boolean)
language sql
stable
security definer
set search_path = public, extensions
as $func$
  select p.id, p.name,
    (p_region_id is not null and p.region_id is not distinct from p_region_id) as in_region
  from producers p
  where
    case
      when coalesce(trim(p_query), '') = '' then
        p_region_id is not null and p.region_id = p_region_id
      else
        public.f_search_norm(p_query) <> ''
        and public.f_search_norm(p.name) like '%' || public.f_search_norm(p_query) || '%'
    end
  order by in_region desc, p.name
  limit case when coalesce(trim(p_query), '') = '' then 30 else 25 end
$func$;

grant execute on function public.search_producers(text, uuid) to authenticated;
