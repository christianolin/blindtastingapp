-- A shared bottle photo per catalog wine (community-visible on the catalog list and
-- the wine hub). Nullable — when absent the UI shows a default bottle icon. Writable
-- by the creator or a curator (the existing catalog_wines UPDATE policy).

alter table catalog_wines add column if not exists image_url text;

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_name = 'catalog_wines' and column_name = 'image_url'
  ) then
    raise exception 'final-state: catalog_wines.image_url missing';
  end if;
end $$;
