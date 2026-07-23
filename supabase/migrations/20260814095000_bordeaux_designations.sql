-- Phase 3E: Bordeaux's château classifications as designation-catalogue
-- entries (one per system) with per-place links — the Bordeaux analogue of
-- the Burgundy cru ladder. Published directly. Bordeaux classifications rank
-- estates, not vineyards, so they attach to the appellations where they
-- apply rather than to individual sites.

insert into wine_designations (key, name, appellation_system, description, editorial_status)
values
  ('medoc-1855', '1855 Classification (Médoc)', '1855',
   'Napoleon III''s 1855 ranking of the Médoc''s (plus Haut-Brion''s) leading châteaux into five growths — Premier to Cinquième Cru Classé. Essentially frozen since, with one 1973 promotion (Mouton Rothschild).', 'PUBLISHED'),
  ('sauternes-1855', '1855 Classification (Sauternes & Barsac)', '1855',
   'The parallel 1855 ranking of the great sweet-wine châteaux of Sauternes and Barsac: a single Premier Cru Supérieur (Château d''Yquem) above Premiers and Deuxièmes Crus.', 'PUBLISHED'),
  ('saint-emilion-grand-cru-classe', 'Saint-Émilion Grand Cru Classé', 'Saint-Émilion',
   'Saint-Émilion''s own classification, revised roughly every decade — Grand Cru Classé beneath Premier Grand Cru Classé (B, then A). Distinct from the Saint-Émilion Grand Cru AOC, which is an appellation open to any qualifying estate.', 'PUBLISHED'),
  ('graves-cru-classe', 'Cru Classé de Graves', 'Graves',
   'The 1959 classification of Pessac-Léognan estates for red and/or white wine — a single flat tier of Crus Classés, with no growth ranking.', 'PUBLISHED'),
  ('cru-bourgeois-medoc', 'Cru Bourgeois du Médoc', 'Cru Bourgeois',
   'A separate, periodically-revised recognition for Médoc châteaux outside the 1855 growths, tiered as Cru Bourgeois, Cru Bourgeois Supérieur and Cru Bourgeois Exceptionnel.', 'PUBLISHED')
on conflict (key) do nothing;

insert into wine_place_designations (wine_place_id, designation_id, local_note, editorial_status)
select p.id, d.id, null, 'PUBLISHED'
from (values
  ('medoc-1855', 'france.bordeaux.haut-medoc'),
  ('medoc-1855', 'france.bordeaux.haut-medoc.margaux'),
  ('medoc-1855', 'france.bordeaux.haut-medoc.pauillac'),
  ('medoc-1855', 'france.bordeaux.haut-medoc.saint-julien'),
  ('medoc-1855', 'france.bordeaux.haut-medoc.saint-estephe'),
  ('medoc-1855', 'france.bordeaux.pessac-leognan'),
  ('sauternes-1855', 'france.bordeaux.sauternes'),
  ('sauternes-1855', 'france.bordeaux.sauternes.barsac'),
  ('saint-emilion-grand-cru-classe', 'france.bordeaux.saint-emilion'),
  ('graves-cru-classe', 'france.bordeaux.pessac-leognan'),
  ('cru-bourgeois-medoc', 'france.bordeaux.medoc'),
  ('cru-bourgeois-medoc', 'france.bordeaux.haut-medoc'),
  ('cru-bourgeois-medoc', 'france.bordeaux.haut-medoc.listrac-medoc')
) as v(dkey, pkey)
join wine_designations d on d.key = v.dkey
join wine_places p on p.canonical_key = v.pkey
on conflict (wine_place_id, designation_id) do nothing;

-- Saint-Georges-Saint-Émilion may legally be sold as Montagne-Saint-Émilion
-- (Saint-Georges is an enclave commune within Montagne).
insert into wine_place_relationships (source_place_id, target_place_id, relationship_type, note)
select s.id, t.id, 'DUAL_LABEL',
       'Saint-Georges-Saint-Émilion may also be sold as Montagne-Saint-Émilion.'
from wine_places s, wine_places t
where s.canonical_key = 'france.bordeaux.saint-georges-saint-emilion'
  and t.canonical_key = 'france.bordeaux.montagne-saint-emilion'
on conflict do nothing;

do $$
declare v_desig int; v_edges int;
begin
  select count(*) into v_desig from wine_designations;
  if v_desig <> 8 then
    raise exception 'expected 8 designations, got %', v_desig;
  end if;
  select count(*) into v_edges from wine_place_relationships where relationship_type = 'DUAL_LABEL';
  if v_edges <> 5 then
    raise exception 'expected 5 DUAL_LABEL edges, got %', v_edges;
  end if;
end $$;
