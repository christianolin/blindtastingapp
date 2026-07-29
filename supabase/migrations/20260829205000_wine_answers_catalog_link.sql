-- Protected catalog link. The FK lives on wine_answers (not wines), so it rides
-- the existing pre-reveal RLS: a participant cannot follow it to the answer
-- early. Nullable here; the backfill migration links history and enforces
-- NOT NULL. Also drops the unused, wrongly-placed wines.catalog_wine_id — wines
-- is readable by all joined participants, so a link there would leak the answer.

alter table wine_answers
  add column if not exists catalog_wine_id uuid references catalog_wines(id) on delete restrict;

alter table wines drop column if exists catalog_wine_id;

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'wine_answers'
      and column_name = 'catalog_wine_id'
  ) then raise exception 'final-state: wine_answers.catalog_wine_id missing'; end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'wines'
      and column_name = 'catalog_wine_id'
  ) then raise exception 'final-state: wines.catalog_wine_id should be dropped'; end if;
end $$;
