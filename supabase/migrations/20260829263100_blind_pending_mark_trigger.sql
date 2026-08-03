-- Blind-tasting privacy (2/3): set catalog_wines.blind_pending when a wine
-- answer links a catalog wine whose only footprint is still an unrevealed blind
-- slot. A wine that is already public (revealed elsewhere, in a cellar, or
-- noted) stays visible. SECURITY DEFINER so it can write the otherwise
-- insert-only catalog_wines table.
create or replace function catalog_wine_mark_blind()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.catalog_wine_id is null then
    return new;
  end if;
  update catalog_wines cw set blind_pending = true
  where cw.id = new.catalog_wine_id
    and not cw.blind_pending
    and not exists (
      select 1 from wine_answers wa join wines w on w.id = wa.wine_id
      where wa.catalog_wine_id = cw.id and w.is_revealed
    )
    and not exists (select 1 from cellar_lots cl where cl.catalog_wine_id = cw.id)
    and not exists (select 1 from wset_notes n where n.catalog_wine_id = cw.id);
  return new;
end $$;

drop trigger if exists trg_catalog_wine_mark_blind on wine_answers;
create trigger trg_catalog_wine_mark_blind
  after insert or update of catalog_wine_id on wine_answers
  for each row execute function catalog_wine_mark_blind();
