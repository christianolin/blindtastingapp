-- resolve_unidentified_wine: turn an unidentified bottle into a real catalog wine.
-- Repoints every wine_answers / wset_notes reference from the unidentified record to
-- the chosen catalog wine (the frozen answer snapshot is untouched — scoring stands),
-- then tombstones the unidentified row via resolved_into_catalog_wine_id.
--
-- SECURITY DEFINER because it repoints rows owned by other users; guarded to the
-- unidentified record's creator or a curator (auth.uid() still resolves the caller).

create or replace function resolve_unidentified_wine(
  p_unidentified_id uuid,
  p_catalog_wine_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_created_by uuid;
  v_is_curator boolean;
begin
  select created_by into v_created_by
  from catalog_wines_unidentified where id = p_unidentified_id;
  if v_created_by is null then
    raise exception 'unidentified wine % not found', p_unidentified_id;
  end if;

  select coalesce(is_curator, false) into v_is_curator from profiles where id = v_uid;
  if v_uid is null or (v_uid <> v_created_by and not coalesce(v_is_curator, false)) then
    raise exception 'not authorised to resolve this wine';
  end if;

  if not exists (
    select 1 from catalog_wines where id = p_catalog_wine_id and merged_into is null
  ) then
    raise exception 'target catalog wine % not found', p_catalog_wine_id;
  end if;

  update wine_answers
    set catalog_wine_id = p_catalog_wine_id, unidentified_wine_id = null
    where unidentified_wine_id = p_unidentified_id;
  update wset_notes
    set catalog_wine_id = p_catalog_wine_id, unidentified_wine_id = null
    where unidentified_wine_id = p_unidentified_id;
  update catalog_wines_unidentified
    set resolved_into_catalog_wine_id = p_catalog_wine_id, updated_at = now()
    where id = p_unidentified_id;
end $$;

grant execute on function resolve_unidentified_wine(uuid, uuid) to authenticated;

do $$
begin
  if not exists (select 1 from pg_proc where proname = 'resolve_unidentified_wine') then
    raise exception 'final-state: resolve_unidentified_wine missing';
  end if;
end $$;
