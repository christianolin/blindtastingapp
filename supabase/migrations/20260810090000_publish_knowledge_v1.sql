-- Publishes the V1 knowledge content (owner review gate passed 2026-07-22:
-- "Everything is good"). DRAFT -> PUBLISHED across the five editorial
-- surfaces; RLS then exposes it to authenticated users.

update wine_place_grapes set editorial_status = 'PUBLISHED' where editorial_status = 'DRAFT';
update wine_place_styles set editorial_status = 'PUBLISHED' where editorial_status = 'DRAFT';
update wine_designations set editorial_status = 'PUBLISHED' where editorial_status = 'DRAFT';
update wine_place_designations set editorial_status = 'PUBLISHED' where editorial_status = 'DRAFT';
update wine_place_articles set editorial_status = 'PUBLISHED' where editorial_status = 'DRAFT';

do $$
declare v_draft int;
begin
  select (select count(*) from wine_place_grapes where editorial_status <> 'PUBLISHED')
       + (select count(*) from wine_place_styles where editorial_status <> 'PUBLISHED')
       + (select count(*) from wine_designations where editorial_status <> 'PUBLISHED')
       + (select count(*) from wine_place_designations where editorial_status <> 'PUBLISHED')
       + (select count(*) from wine_place_articles where editorial_status not in ('PUBLISHED', 'PLACEHOLDER'))
    into v_draft;
  if v_draft <> 0 then
    raise exception 'publish flip left % unpublished rows', v_draft;
  end if;
end $$;
