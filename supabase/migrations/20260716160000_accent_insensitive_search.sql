-- Appellation/producer search was plain `ilike '%q%'`, which is
-- case-insensitive but NOT accent-insensitive: searching "estephe" never
-- matched "Saint-Estèphe AOP", "chateau" missed "Château …", etc. Users type
-- ASCII; the data (French/German/… names) is full of accents. Fix with an
-- accent-folding search backed by trigram indexes on the folded text.

create extension if not exists unaccent with schema extensions;

-- IMMUTABLE wrapper around the 2-arg unaccent(regdictionary, text) form so it
-- can be used in an index expression (the 1-arg unaccent is only STABLE).
create or replace function public.f_unaccent(text)
returns text
language sql
immutable
parallel safe
as $func$
  select extensions.unaccent('extensions.unaccent'::regdictionary, $1)
$func$;

-- Trigram GIN indexes on the folded name so `f_unaccent(name) ilike '%q%'`
-- stays index-backed even on the big producers table.
create index if not exists appellations_name_unaccent_trgm
  on appellations using gin (public.f_unaccent(name) gin_trgm_ops);
create index if not exists producers_name_unaccent_trgm
  on producers using gin (public.f_unaccent(name) gin_trgm_ops);

create or replace function public.search_appellations(
  p_query text,
  p_region_id uuid default null
)
returns table (id uuid, name text)
language sql
stable
security definer
set search_path = public, extensions
as $func$
  select a.id, a.name
  from appellations a
  where public.f_unaccent(a.name) ilike '%' || public.f_unaccent(p_query) || '%'
    and (p_region_id is null or a.region_id = p_region_id)
  order by a.name
  limit 25
$func$;

create or replace function public.search_producers(p_query text)
returns table (id uuid, name text)
language sql
stable
security definer
set search_path = public, extensions
as $func$
  select p.id, p.name
  from producers p
  where public.f_unaccent(p.name) ilike '%' || public.f_unaccent(p_query) || '%'
  order by p.name
  limit 25
$func$;

grant execute on function public.search_appellations(text, uuid) to authenticated;
grant execute on function public.search_producers(text) to authenticated;
