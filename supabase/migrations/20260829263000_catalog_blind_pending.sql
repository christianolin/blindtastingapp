-- Blind-tasting privacy: a brand-new wine added to a tasting is created in the
-- shared catalog immediately (find_or_create_catalog_wine), so a participant
-- could discover its identity by browsing/searching the catalog before it is
-- revealed. Add a blind_pending flag on catalog_wines; the list + search hide
-- rows where it is true. Triggers (next migration) set it when a still-blind
-- answer links a wine and clear it on reveal. catalog_wines is read-only to
-- clients (insert-only RLS), so only the DB maintains this flag.

alter table catalog_wines
  add column if not exists blind_pending boolean not null default false;

create index if not exists catalog_wines_blind_pending_idx
  on catalog_wines (blind_pending) where blind_pending;

-- Backfill: hide wines whose ONLY footprint today is an unrevealed blind slot
-- (never revealed, not in any cellar, no tasting notes). Anything already public
-- stays visible.
update catalog_wines cw set blind_pending = true
where exists (
    select 1 from wine_answers wa join wines w on w.id = wa.wine_id
    where wa.catalog_wine_id = cw.id and not w.is_revealed
  )
  and not exists (
    select 1 from wine_answers wa join wines w on w.id = wa.wine_id
    where wa.catalog_wine_id = cw.id and w.is_revealed
  )
  and not exists (select 1 from cellar_lots cl where cl.catalog_wine_id = cw.id)
  and not exists (select 1 from wset_notes n where n.catalog_wine_id = cw.id);
