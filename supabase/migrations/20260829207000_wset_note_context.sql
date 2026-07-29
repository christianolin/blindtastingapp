-- Note context: a WSET note can be written open (default), blind during a
-- tasting, or in the training room. tasting_wine_id ties a blind/training note to
-- the specific tasting wine it was written against, so the wine hub can show
-- "written blind" and the training room reuses the same note shape.

do $$
begin
  if to_regtype('public.wset_note_context') is null then
    create type wset_note_context as enum ('OPEN', 'BLIND', 'TRAINING');
  end if;
end $$;

alter table wset_notes
  add column if not exists context_kind wset_note_context not null default 'OPEN';
alter table wset_notes
  add column if not exists tasting_wine_id uuid references wines(id) on delete set null;

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='wset_notes' and column_name='context_kind'
  ) then raise exception 'final-state: wset_notes.context_kind missing'; end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='wset_notes' and column_name='tasting_wine_id'
  ) then raise exception 'final-state: wset_notes.tasting_wine_id missing'; end if;
end $$;
