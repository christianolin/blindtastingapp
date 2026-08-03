-- Blind-tasting privacy (3/3): clear catalog_wines.blind_pending the moment a
-- wine is fully revealed. Keying off wines.is_revealed covers every reveal path
-- (full reveal, progressive, async) since they all flip that flag. SECURITY
-- DEFINER to write the insert-only catalog_wines table.
create or replace function catalog_wine_unmark_blind()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.is_revealed and not old.is_revealed then
    update catalog_wines cw set blind_pending = false
    where cw.blind_pending
      and cw.id in (
        select wa.catalog_wine_id from wine_answers wa where wa.wine_id = new.id
      );
  end if;
  return new;
end $$;

drop trigger if exists trg_catalog_wine_unmark_blind on wines;
create trigger trg_catalog_wine_unmark_blind
  after update of is_revealed on wines
  for each row execute function catalog_wine_unmark_blind();
