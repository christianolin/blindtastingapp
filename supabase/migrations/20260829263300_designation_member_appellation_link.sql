-- Link 1855 / Graves / Saint-Émilion classified members (châteaux) to their
-- appellation wine_place, powering the Library Bordeaux panel deep-links and
-- the map place page's "classified growths" list. Backfill is total: every
-- distinct commune maps to a real wine_places.canonical_key (verified against
-- live data 2026-08-04).

alter table wine_designation_members
  add column if not exists appellation_wine_place_id uuid references wine_places(id);

create index if not exists wine_designation_members_appellation_idx
  on wine_designation_members (appellation_wine_place_id);

update wine_designation_members m
set appellation_wine_place_id = wp.id
from (values
  ('Pauillac', 'france.bordeaux.haut-medoc.pauillac'),
  ('Margaux', 'france.bordeaux.haut-medoc.margaux'),
  ('Saint-Julien', 'france.bordeaux.haut-medoc.saint-julien'),
  ('Saint-Estèphe', 'france.bordeaux.haut-medoc.saint-estephe'),
  ('Haut-Médoc', 'france.bordeaux.haut-medoc'),
  ('Pessac (Graves)', 'france.bordeaux.pessac-leognan'),
  ('Cadaujac', 'france.bordeaux.pessac-leognan'),
  ('Léognan', 'france.bordeaux.pessac-leognan'),
  ('Martillac', 'france.bordeaux.pessac-leognan'),
  ('Pessac', 'france.bordeaux.pessac-leognan'),
  ('Talence', 'france.bordeaux.pessac-leognan'),
  ('Villenave-d''Ornon', 'france.bordeaux.pessac-leognan'),
  ('Sauternes', 'france.bordeaux.sauternes'),
  ('Bommes', 'france.bordeaux.sauternes'),
  ('Fargues', 'france.bordeaux.sauternes'),
  ('Preignac', 'france.bordeaux.sauternes'),
  ('Barsac', 'france.bordeaux.sauternes.barsac'),
  ('Saint-Émilion', 'france.bordeaux.saint-emilion'),
  ('Saint-Christophe-des-Bardes', 'france.bordeaux.saint-emilion'),
  ('Saint-Étienne-de-Lisse', 'france.bordeaux.saint-emilion'),
  ('Saint-Hippolyte', 'france.bordeaux.saint-emilion'),
  ('Saint-Laurent-des-Combes', 'france.bordeaux.saint-emilion'),
  ('Saint-Pey-d''Armens', 'france.bordeaux.saint-emilion'),
  ('Saint-Sulpice-de-Faleyrens', 'france.bordeaux.saint-emilion')
) as map(commune, key)
join wine_places wp on wp.canonical_key = map.key
where m.member_kind = 'ESTATE' and m.commune = map.commune;

-- Self-assert: no Bordeaux ESTATE member left unlinked. A new/renamed commune
-- trips this and must be added to the map above.
do $$
declare n int;
begin
  select count(*) into n
  from wine_designation_members m
  join wine_designations d on d.id = m.designation_id
  where d.key in ('medoc-1855','sauternes-1855','saint-emilion-grand-cru-classe','graves-cru-classe')
    and m.member_kind = 'ESTATE'
    and m.appellation_wine_place_id is null;
  if n <> 0 then
    raise exception 'Bordeaux members with no appellation link: %', n;
  end if;
end $$;
