-- Undo M2 (20260927150000_sharing_defaults_flip): spec §10.3. NEVER under
-- supabase/migrations. Run with scripts/sharing-defaults/run-sql.mjs,
-- --dry first. It re-privatizes every cellar M2 flipped that is still
-- PUBLIC — including anyone who chose PUBLIC on purpose after the notice
-- (R10) — restores the PRIVATE default, empties the notices and removes
-- M2's history row so the file can be applied again later.

set local lock_timeout = '10s';

do $$
begin
  if to_regclass('public.sharing_notices') is null then
    raise exception 'M1 is not applied; there is no M2 to undo';
  end if;
  if (select column_default from information_schema.columns
      where table_schema = 'public' and table_name = 'profiles' and column_name = 'cellar_visibility')
     is distinct from '''PUBLIC''::cellar_visibility' then
    raise exception 'M2 is not applied: the cellar default is not PUBLIC';
  end if;
end $$;

drop table if exists pg_temp._sd_reprivatized;
create temp table _sd_reprivatized on commit drop as
select p.id
  from public.profiles p
  join public.sharing_notices s on s.user_id = p.id
 where s.cellar_flipped and p.cellar_visibility = 'PUBLIC' and p.deleted_at is null;

update public.profiles p
   set cellar_visibility = 'PRIVATE'
  from public.sharing_notices s
 where s.user_id = p.id and s.cellar_flipped and p.cellar_visibility = 'PUBLIC' and p.deleted_at is null;
alter table public.profiles alter column cellar_visibility set default 'PRIVATE';
delete from public.sharing_notices;
delete from supabase_migrations.schema_migrations where version = '20260927150000';

do $$
begin
  if (select column_default from information_schema.columns
      where table_schema = 'public' and table_name = 'profiles' and column_name = 'cellar_visibility')
     is distinct from '''PRIVATE''::cellar_visibility' then
    raise exception 'the cellar default is not PRIVATE again';
  end if;
  if exists (select 1 from public.sharing_notices) then
    raise exception 'sharing_notices is not empty';
  end if;
  if exists (select 1 from public.profiles p join _sd_reprivatized r on r.id = p.id
              where p.cellar_visibility <> 'PRIVATE') then
    raise exception 'a flipped cellar is not PRIVATE again';
  end if;
  if exists (select 1 from supabase_migrations.schema_migrations where version = '20260927150000') then
    raise exception 'M2''s history row is still recorded';
  end if;
  raise notice 'rollback M2: % cellar(s) made private again', (select count(*) from _sd_reprivatized);
end $$;
