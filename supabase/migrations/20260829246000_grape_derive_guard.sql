-- The grape-derive recompute UPDATE fires the catalog_wines edit-audit trigger,
-- so seeding a new wine's blend rows (and the blend backfill) wrote spurious
-- audit rows. (1) Guard the recompute so it only writes when a derived value
-- actually changes; (2) purge the backfill's grape-only, null-editor audit rows.
create or replace function recompute_catalog_wine_grapes(p_wine uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_ids uuid[];
begin
  select array(
    select grape_id from catalog_wine_grapes
    where catalog_wine_id = p_wine
    order by (percentage is null) asc, percentage desc nulls last, sort_order asc
  ) into v_ids;
  if array_length(v_ids, 1) >= 1 then
    update catalog_wines
      set primary_grape_id = v_ids[1], secondary_grape_id = v_ids[2]
    where id = p_wine
      and (primary_grape_id is distinct from v_ids[1]
           or secondary_grape_id is distinct from v_ids[2]);
  end if;
end $$;

-- Purge the backfill's spurious audit rows: null editor (migration/trigger, not a
-- user) whose before/after differ only in the derived grape columns (+ updated_at).
delete from catalog_wine_edits
where editor_id is null
  and (before - 'primary_grape_id' - 'secondary_grape_id' - 'updated_at')
    = (after - 'primary_grape_id' - 'secondary_grape_id' - 'updated_at');

do $$
begin
  if not exists (select 1 from pg_proc where proname = 'recompute_catalog_wine_grapes') then
    raise exception 'final-state: recompute_catalog_wine_grapes missing'; end if;
end $$;
