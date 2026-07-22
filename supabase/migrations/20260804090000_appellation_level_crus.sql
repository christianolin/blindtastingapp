-- Phase 3C: Burgundy needs the premier/grand cru layers distinguished.
-- appellation_level is a text column whose CHECK was created inline in
-- 20260801090000 (PostgreSQL auto-named it wine_places_appellation_level_check).
-- Swap that constraint to add premier_cru and grand_cru. No rows use the new
-- values yet, so there is no backfill. Fully transactional (no ALTER TYPE),
-- so the rollback-only dry-run harness stays valid.
alter table wine_places
  drop constraint if exists wine_places_appellation_level_check;

alter table wine_places
  add constraint wine_places_appellation_level_check
  check (
    appellation_level is null
    or appellation_level in
       ('regional', 'subregional', 'communal', 'premier_cru', 'grand_cru', 'cru')
  );
