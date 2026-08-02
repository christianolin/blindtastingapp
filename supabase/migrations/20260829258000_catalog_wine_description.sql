-- Free-text description for catalog wines. Anyone can set it when they add a
-- wine (they are the creator); afterwards the creator and curators can edit it,
-- via the existing "catalog update" RLS + catalog_wine_edits audit trigger — so
-- this is a plain additive column, no policy change. Idempotent.
alter table catalog_wines add column if not exists description text;
