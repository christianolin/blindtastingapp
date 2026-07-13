-- Appellations and producers are about to grow from dozens to thousands
-- (LWIN import) and tens of thousands respectively — preloading full lists
-- into the client is no longer viable, so those two dropdowns switch to
-- server-side search-as-you-type. Trigram indexes make ILIKE '%term%'
-- lookups fast at that scale instead of a sequential scan per keystroke.
create extension if not exists pg_trgm;

create index if not exists producers_name_trgm_idx
  on producers using gin (name gin_trgm_ops);

create index if not exists appellations_name_trgm_idx
  on appellations using gin (name gin_trgm_ops);
