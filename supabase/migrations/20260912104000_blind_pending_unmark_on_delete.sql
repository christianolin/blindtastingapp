-- blind_pending unmark on unlink (sources-4; spec §E.5, §D.4 #4).
--
-- Clears catalog_wines.blind_pending when an unrevealed glass stops linking a catalog wine:
-- - the glass is removed (removeWine) or its tasting deleted (deleteTasting); both reach
--   wine_answers through the FK cascade;
-- - its answer is re-linked to another catalog wine (saveFlightGlass).
-- A catalog wine stays hidden while any other unrevealed glass still links it, whatever order
-- cascaded rows are deleted in.
--
-- Completes the set of three triggers: the insert-time mark (20260829263100), the reveal-time
-- unmark (20260829263200), and this one.
--
-- SECURITY DEFINER because only a wine's creator or a curator may update catalog_wines
-- (20260829203000). No grant: a trigger function is only ever fired, never called, and the
-- existing mark/unmark trigger functions carry none either.
--
-- The backfill clears flags no unrevealed glass justifies any more (on 2026-09-12, two catalog
-- wines were hidden with no glass linking them at all). Each flag flip writes a
-- catalog_wine_edits row through catalog_wines_audit (editor_id null here, since a migration has
-- no auth.uid()), exactly as the mark and reveal-time unmark triggers already do.
--
-- No begin/commit: the applier owns the transaction.

create or replace function public.catalog_wine_unmark_blind_on_unlink()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.catalog_wine_id is null then
    return null;
  end if;
  if tg_op = 'UPDATE' and new.catalog_wine_id is not distinct from old.catalog_wine_id then
    return null;
  end if;
  update catalog_wines cw set blind_pending = false
  where cw.id = old.catalog_wine_id
    and cw.blind_pending
    and not exists (
      select 1 from wine_answers wa join wines w on w.id = wa.wine_id
      where wa.catalog_wine_id = cw.id and not w.is_revealed
    );
  return null;
end $$;

drop trigger if exists trg_catalog_wine_unmark_blind_on_unlink on public.wine_answers;
create trigger trg_catalog_wine_unmark_blind_on_unlink
  after delete or update of catalog_wine_id on public.wine_answers
  for each row execute function public.catalog_wine_unmark_blind_on_unlink();

-- Backfill: rows that no unrevealed answer links any more.
update catalog_wines cw set blind_pending = false
where cw.blind_pending
  and not exists (
    select 1 from wine_answers wa join wines w on w.id = wa.wine_id
    where wa.catalog_wine_id = cw.id and not w.is_revealed
  );

-- Same-transaction assertions (never trust "version recorded").
do $$
declare
  v_fn regprocedure := to_regprocedure('public.catalog_wine_unmark_blind_on_unlink()');
  v_trg record;
  v_proc record;
  v_attnum int2;
  v_stale int;
begin
  -- The trigger: on wine_answers, AFTER, FOR EACH ROW, on DELETE and UPDATE OF catalog_wine_id only, enabled.
  select t.tgtype::int as tgtype, t.tgenabled, t.tgattr::int2[] as cols, t.tgfoid
    into v_trg
  from pg_trigger t
  where t.tgrelid = 'public.wine_answers'::regclass
    and t.tgname = 'trg_catalog_wine_unmark_blind_on_unlink'
    and not t.tgisinternal;
  if not found then
    raise exception 'trg_catalog_wine_unmark_blind_on_unlink missing on wine_answers post-migration';
  end if;
  -- tgtype bits: 1 row, 2 before, 4 insert, 8 delete, 16 update, 32 truncate, 64 instead of.
  if v_trg.tgtype & 1 = 0 or v_trg.tgtype & 2 <> 0 or v_trg.tgtype & 64 <> 0 then
    raise exception 'trg_catalog_wine_unmark_blind_on_unlink is not an AFTER ... FOR EACH ROW trigger post-migration';
  end if;
  if v_trg.tgtype & 8 = 0 or v_trg.tgtype & 16 = 0
     or v_trg.tgtype & 4 <> 0 or v_trg.tgtype & 32 <> 0 then
    raise exception 'trg_catalog_wine_unmark_blind_on_unlink does not fire on exactly DELETE and UPDATE post-migration';
  end if;
  select a.attnum into v_attnum
  from pg_attribute a
  where a.attrelid = 'public.wine_answers'::regclass
    and a.attname = 'catalog_wine_id'
    and not a.attisdropped;
  -- tgattr is a zero-based int2vector, so compare by membership, never by array equality.
  if v_attnum is null or coalesce(cardinality(v_trg.cols), 0) <> 1 or not (v_attnum = any (v_trg.cols)) then
    raise exception 'trg_catalog_wine_unmark_blind_on_unlink UPDATE is not scoped to catalog_wine_id post-migration';
  end if;
  if v_trg.tgenabled <> 'O' then
    raise exception 'trg_catalog_wine_unmark_blind_on_unlink is not enabled post-migration';
  end if;
  if v_fn is null or v_trg.tgfoid <> v_fn::oid then
    raise exception 'trg_catalog_wine_unmark_blind_on_unlink does not call catalog_wine_unmark_blind_on_unlink() post-migration';
  end if;

  -- The function: SECURITY DEFINER (catalog_wines is not client-writable), search_path pinned.
  select p.prosecdef, p.proconfig, p.prorettype
    into v_proc
  from pg_proc p
  where p.oid = v_fn::oid;
  if not found or not v_proc.prosecdef then
    raise exception 'catalog_wine_unmark_blind_on_unlink() is not SECURITY DEFINER post-migration';
  end if;
  if not ('search_path=public' = any (coalesce(v_proc.proconfig, '{}'::text[]))) then
    raise exception 'catalog_wine_unmark_blind_on_unlink() search_path is not pinned to public post-migration';
  end if;
  if v_proc.prorettype <> 'trigger'::regtype then
    raise exception 'catalog_wine_unmark_blind_on_unlink() is not a trigger function post-migration';
  end if;

  -- The backfill left no stale flag: every hidden catalog wine is still linked by an unrevealed glass.
  select count(*) into v_stale
  from public.catalog_wines cw
  where cw.blind_pending
    and not exists (
      select 1 from public.wine_answers wa join public.wines w on w.id = wa.wine_id
      where wa.catalog_wine_id = cw.id and not w.is_revealed
    );
  if v_stale <> 0 then
    raise exception '% catalog wine(s) still blind_pending with no unrevealed glass linking them post-migration', v_stale;
  end if;
end $$;

-- Behavioural assertions (spec E.0 synthetic rollback: nothing below survives, in dry or live).
-- One synthetic tasting, two unrevealed glasses linking the same catalog wine, then the three
-- paths this trigger exists for: removeWine, a saveFlightGlass re-link, and deleteTasting.
do $$
declare
  v_host uuid;
  v_candidates uuid[];
  v_cw1 uuid;
  v_cw2 uuid;
  v_tasting uuid;
  v_wine_a uuid;
  v_wine_b uuid;
  v_ran boolean := false;
  v_cw1_after_insert boolean;
  v_cw1_after_glass_delete boolean;
  v_cw1_after_relink boolean;
  v_cw2_after_relink boolean;
  v_cw2_after_tasting_delete boolean;
begin
  select p.id into v_host from public.profiles p order by p.id limit 1;

  -- Catalog wines the insert-time mark (20260829263100) will hide: not already hidden, linked by
  -- no glass, in no cellar, in no note, and shaped like a valid answer-key vintage.
  select array_agg(x.id order by x.id) into v_candidates
  from (
    select cw.id
    from public.catalog_wines cw
    where not cw.blind_pending
      and cw.merged_into is null
      and not exists (select 1 from public.wine_answers wa where wa.catalog_wine_id = cw.id)
      and not exists (select 1 from public.cellar_lots cl where cl.catalog_wine_id = cw.id)
      and not exists (select 1 from public.wset_notes n where n.catalog_wine_id = cw.id)
      and (
        (cw.vintage_kind = 'YEAR' and cw.vintage_year is not null and cw.vintage_tawny_years is null)
        or (cw.vintage_kind = 'NV' and cw.vintage_year is null and cw.vintage_tawny_years is null)
        or (cw.vintage_kind = 'TAWNY' and cw.vintage_tawny_years is not null and cw.vintage_year is null)
      )
    order by cw.id
    limit 2
  ) x;
  v_cw1 := v_candidates[1];
  v_cw2 := v_candidates[2];

  if v_host is null or v_cw2 is null then
    raise notice '20260912104000: behavioural assertions skipped (needs a profile and two unlinked catalog wines)';
    return;
  end if;

  begin
    insert into public.tastings (name, host_id, timing_mode, wine_source)
    values ('20260912104000 synthetic assertion', v_host, 'LIVE', 'HOST_PROVIDES')
    returning id into v_tasting;
    insert into public.wines (tasting_id, position) values (v_tasting, 1) returning id into v_wine_a;
    insert into public.wines (tasting_id, position) values (v_tasting, 2) returning id into v_wine_b;

    -- Both unrevealed glasses link cw1, so the insert-time mark hides it.
    insert into public.wine_answers (
      wine_id, catalog_wine_id, country_id, region_id, appellation_id, primary_grape_id,
      producer_id, vintage_kind, vintage_year, vintage_tawny_years
    )
    select g.wine_id, cw.id, cw.country_id, cw.region_id, cw.appellation_id, cw.primary_grape_id,
           cw.producer_id, cw.vintage_kind, cw.vintage_year, cw.vintage_tawny_years
    from public.catalog_wines cw
    cross join unnest(array[v_wine_a, v_wine_b]) as g(wine_id)
    where cw.id = v_cw1;
    select cw.blind_pending into v_cw1_after_insert from public.catalog_wines cw where cw.id = v_cw1;

    -- removeWine: glass A's answer goes by FK cascade, but glass B still links cw1.
    delete from public.wines where id = v_wine_a;
    select cw.blind_pending into v_cw1_after_glass_delete from public.catalog_wines cw where cw.id = v_cw1;

    -- saveFlightGlass re-link: glass B now points at cw2, so no unrevealed glass links cw1.
    update public.wine_answers set catalog_wine_id = v_cw2 where wine_id = v_wine_b;
    select cw.blind_pending into v_cw1_after_relink from public.catalog_wines cw where cw.id = v_cw1;
    select cw.blind_pending into v_cw2_after_relink from public.catalog_wines cw where cw.id = v_cw2;

    -- deleteTasting: tastings -> wines -> wine_answers by FK cascade releases cw2.
    delete from public.tastings where id = v_tasting;
    select cw.blind_pending into v_cw2_after_tasting_delete from public.catalog_wines cw where cw.id = v_cw2;

    v_ran := true;
    raise exception 'synthetic rollback' using errcode = 'SYNRB';
  exception
    when sqlstate 'SYNRB' then
      null;
  end;

  if not v_ran then
    raise exception '20260912104000 behavioural block did not run to completion';
  end if;
  if not v_cw1_after_insert then
    raise exception 'precondition: linking an unrevealed glass did not hide its catalog wine';
  end if;
  if not v_cw1_after_glass_delete then
    raise exception 'removing one glass un-hid a catalog wine another unrevealed glass still links post-migration';
  end if;
  if v_cw1_after_relink then
    raise exception 're-linking the last unrevealed glass left the old catalog wine hidden post-migration';
  end if;
  if not v_cw2_after_relink then
    raise exception 'precondition: re-linking a glass did not hide the new catalog wine';
  end if;
  if v_cw2_after_tasting_delete then
    raise exception 'deleting the tasting left its catalog wine hidden post-migration';
  end if;

  -- Nothing synthetic survived the rollback.
  if exists (select 1 from public.tastings t where t.id = v_tasting)
     or exists (select 1 from public.catalog_wines cw where cw.id in (v_cw1, v_cw2) and cw.blind_pending) then
    raise exception '20260912104000 synthetic rows or flags survived the rollback';
  end if;
end $$;
