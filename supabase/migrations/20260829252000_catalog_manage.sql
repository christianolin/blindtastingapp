-- Catalog wine management: cross-user cellar usage stats + a curator-only,
-- guarded delete. cellar_lots is owner-only RLS so the usage read must be
-- SECURITY DEFINER; delete is likewise definer so it can verify the wine is
-- truly unreferenced (four ON DELETE RESTRICT parents) and raise a clean error
-- rather than a raw FK violation. Editing is already covered by the existing
-- "catalog update" policy (creator OR is_curator).

create or replace function catalog_wine_usage(p_id uuid)
returns table (
  holders int,
  bottles int,
  lot_count int,
  note_count int,
  appearance_count int,
  consumption_count int
)
language sql
security definer
set search_path = public
stable
as $$
  select
    (select count(distinct owner_id)::int from cellar_lots
       where catalog_wine_id = p_id and quantity > 0),
    (select coalesce(sum(quantity), 0)::int from cellar_lots
       where catalog_wine_id = p_id and quantity > 0),
    (select count(*)::int from cellar_lots         where catalog_wine_id = p_id),
    (select count(*)::int from wset_notes          where catalog_wine_id = p_id),
    (select count(*)::int from wine_answers        where catalog_wine_id = p_id),
    (select count(*)::int from cellar_consumptions where catalog_wine_id = p_id);
$$;

grant execute on function catalog_wine_usage(uuid) to authenticated;

create or replace function delete_catalog_wine(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_is_curator boolean;
  v_refs int;
begin
  if v_uid is null then
    raise exception 'Not signed in.' using errcode = '42501';
  end if;
  select coalesce(is_curator, false) into v_is_curator from profiles where id = v_uid;
  if not coalesce(v_is_curator, false) then
    raise exception 'Only curators can delete catalog wines.' using errcode = '42501';
  end if;

  select
    (select count(*) from cellar_lots         where catalog_wine_id = p_id)
    + (select count(*) from wset_notes          where catalog_wine_id = p_id)
    + (select count(*) from wine_answers        where catalog_wine_id = p_id)
    + (select count(*) from cellar_consumptions where catalog_wine_id = p_id)
  into v_refs;

  if v_refs > 0 then
    raise exception 'This wine is still in use (cellars, notes or tastings) and cannot be deleted.'
      using errcode = 'P0001';
  end if;

  begin
    delete from catalog_wines where id = p_id;
  exception when foreign_key_violation then
    raise exception 'This wine is still referenced and cannot be deleted.'
      using errcode = 'P0001';
  end;
end;
$$;

grant execute on function delete_catalog_wine(uuid) to authenticated;

do $$
begin
  if not exists (select 1 from pg_proc where proname = 'catalog_wine_usage') then
    raise exception 'final-state: catalog_wine_usage missing';
  end if;
  if not exists (select 1 from pg_proc where proname = 'delete_catalog_wine') then
    raise exception 'final-state: delete_catalog_wine missing';
  end if;
end $$;
