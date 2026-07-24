-- Phase 3F: Bordeaux ESTATE classification members (frozen classifications) —
-- the 1855 Médoc (61), the 1855 Sauternes & Barsac (27), and the 1959 Graves /
-- Pessac-Léognan Cru Classé (16). An ESTATE member IS a château (a producer),
-- ranked into a growth; producer_id stays null now (linked later), commune is
-- the appellation the estate sits in. Seeded PUBLISHED (published-read RLS) so
-- it renders without the promote workflow. St-Émilion's 2022 list ships in a
-- separate migration after source verification.

-- 1855 Médoc — 61 châteaux across five growths.
insert into public.wine_designation_members
  (designation_id, member_kind, name, tier, tier_rank, commune, sort_order, local_note, editorial_status)
select d.id, 'ESTATE', v.name, v.tier, v.tier_rank, v.commune, v.sort_order, v.local_note, 'PUBLISHED'
from public.wine_designations d,
(values
  -- Premier Cru (First Growths) — 5
  ('Château Lafite Rothschild', 'Premier Cru', 1, 'Pauillac', 1, null),
  ('Château Latour', 'Premier Cru', 1, 'Pauillac', 2, null),
  ('Château Margaux', 'Premier Cru', 1, 'Margaux', 3, null),
  ('Château Haut-Brion', 'Premier Cru', 1, 'Pessac (Graves)', 4, 'The only 1855 First Growth from Graves, not the Médoc.'),
  ('Château Mouton Rothschild', 'Premier Cru', 1, 'Pauillac', 5, 'Promoted from Second to First Growth in 1973 — the only revision to the 1855 list.'),
  -- Deuxième Cru (Second Growths) — 14
  ('Château Rauzan-Ségla', 'Deuxième Cru', 2, 'Margaux', 6, null),
  ('Château Rauzan-Gassies', 'Deuxième Cru', 2, 'Margaux', 7, null),
  ('Château Léoville-Las Cases', 'Deuxième Cru', 2, 'Saint-Julien', 8, null),
  ('Château Léoville-Poyferré', 'Deuxième Cru', 2, 'Saint-Julien', 9, null),
  ('Château Léoville-Barton', 'Deuxième Cru', 2, 'Saint-Julien', 10, null),
  ('Château Durfort-Vivens', 'Deuxième Cru', 2, 'Margaux', 11, null),
  ('Château Gruaud-Larose', 'Deuxième Cru', 2, 'Saint-Julien', 12, null),
  ('Château Lascombes', 'Deuxième Cru', 2, 'Margaux', 13, null),
  ('Château Brane-Cantenac', 'Deuxième Cru', 2, 'Margaux', 14, null),
  ('Château Pichon-Longueville Baron', 'Deuxième Cru', 2, 'Pauillac', 15, null),
  ('Château Pichon Longueville Comtesse de Lalande', 'Deuxième Cru', 2, 'Pauillac', 16, null),
  ('Château Ducru-Beaucaillou', 'Deuxième Cru', 2, 'Saint-Julien', 17, null),
  ('Château Cos d''Estournel', 'Deuxième Cru', 2, 'Saint-Estèphe', 18, null),
  ('Château Montrose', 'Deuxième Cru', 2, 'Saint-Estèphe', 19, null),
  -- Troisième Cru (Third Growths) — 14
  ('Château Kirwan', 'Troisième Cru', 3, 'Margaux', 20, null),
  ('Château d''Issan', 'Troisième Cru', 3, 'Margaux', 21, null),
  ('Château Lagrange', 'Troisième Cru', 3, 'Saint-Julien', 22, null),
  ('Château Langoa-Barton', 'Troisième Cru', 3, 'Saint-Julien', 23, null),
  ('Château Giscours', 'Troisième Cru', 3, 'Margaux', 24, null),
  ('Château Malescot St. Exupéry', 'Troisième Cru', 3, 'Margaux', 25, null),
  ('Château Boyd-Cantenac', 'Troisième Cru', 3, 'Margaux', 26, null),
  ('Château Cantenac-Brown', 'Troisième Cru', 3, 'Margaux', 27, null),
  ('Château Palmer', 'Troisième Cru', 3, 'Margaux', 28, null),
  ('Château La Lagune', 'Troisième Cru', 3, 'Haut-Médoc', 29, null),
  ('Château Desmirail', 'Troisième Cru', 3, 'Margaux', 30, null),
  ('Château Calon-Ségur', 'Troisième Cru', 3, 'Saint-Estèphe', 31, null),
  ('Château Ferrière', 'Troisième Cru', 3, 'Margaux', 32, null),
  ('Château Marquis d''Alesme Becker', 'Troisième Cru', 3, 'Margaux', 33, null),
  -- Quatrième Cru (Fourth Growths) — 10
  ('Château Saint-Pierre', 'Quatrième Cru', 4, 'Saint-Julien', 34, null),
  ('Château Talbot', 'Quatrième Cru', 4, 'Saint-Julien', 35, null),
  ('Château Branaire-Ducru', 'Quatrième Cru', 4, 'Saint-Julien', 36, null),
  ('Château Duhart-Milon', 'Quatrième Cru', 4, 'Pauillac', 37, null),
  ('Château Pouget', 'Quatrième Cru', 4, 'Margaux', 38, null),
  ('Château La Tour Carnet', 'Quatrième Cru', 4, 'Haut-Médoc', 39, null),
  ('Château Lafon-Rochet', 'Quatrième Cru', 4, 'Saint-Estèphe', 40, null),
  ('Château Beychevelle', 'Quatrième Cru', 4, 'Saint-Julien', 41, null),
  ('Château Prieuré-Lichine', 'Quatrième Cru', 4, 'Margaux', 42, null),
  ('Château Marquis de Terme', 'Quatrième Cru', 4, 'Margaux', 43, null),
  -- Cinquième Cru (Fifth Growths) — 18
  ('Château Pontet-Canet', 'Cinquième Cru', 5, 'Pauillac', 44, null),
  ('Château Batailley', 'Cinquième Cru', 5, 'Pauillac', 45, null),
  ('Château Haut-Batailley', 'Cinquième Cru', 5, 'Pauillac', 46, null),
  ('Château Grand-Puy-Lacoste', 'Cinquième Cru', 5, 'Pauillac', 47, null),
  ('Château Grand-Puy-Ducasse', 'Cinquième Cru', 5, 'Pauillac', 48, null),
  ('Château Lynch-Bages', 'Cinquième Cru', 5, 'Pauillac', 49, null),
  ('Château Lynch-Moussas', 'Cinquième Cru', 5, 'Pauillac', 50, null),
  ('Château Dauzac', 'Cinquième Cru', 5, 'Margaux', 51, null),
  ('Château d''Armailhac', 'Cinquième Cru', 5, 'Pauillac', 52, null),
  ('Château du Tertre', 'Cinquième Cru', 5, 'Margaux', 53, null),
  ('Château Haut-Bages Libéral', 'Cinquième Cru', 5, 'Pauillac', 54, null),
  ('Château Pédesclaux', 'Cinquième Cru', 5, 'Pauillac', 55, null),
  ('Château Belgrave', 'Cinquième Cru', 5, 'Haut-Médoc', 56, null),
  ('Château de Camensac', 'Cinquième Cru', 5, 'Haut-Médoc', 57, null),
  ('Château Cos Labory', 'Cinquième Cru', 5, 'Saint-Estèphe', 58, null),
  ('Château Clerc Milon', 'Cinquième Cru', 5, 'Pauillac', 59, null),
  ('Château Croizet-Bages', 'Cinquième Cru', 5, 'Pauillac', 60, null),
  ('Château Cantemerle', 'Cinquième Cru', 5, 'Haut-Médoc', 61, null)
) as v(name, tier, tier_rank, commune, sort_order, local_note)
where d.key = 'medoc-1855'
on conflict (designation_id, name) do nothing;

-- 1855 Sauternes & Barsac — 27 châteaux.
insert into public.wine_designation_members
  (designation_id, member_kind, name, tier, tier_rank, commune, sort_order, local_note, editorial_status)
select d.id, 'ESTATE', v.name, v.tier, v.tier_rank, v.commune, v.sort_order, v.local_note, 'PUBLISHED'
from public.wine_designations d,
(values
  -- Premier Cru Supérieur — 1
  ('Château d''Yquem', 'Premier Cru Supérieur', 1, 'Sauternes', 1, 'The sole Premier Cru Supérieur — ranked above all other sweet-wine growths in 1855.'),
  -- Premiers Crus — 11
  ('Château La Tour Blanche', 'Premier Cru', 2, 'Bommes', 2, null),
  ('Château Lafaurie-Peyraguey', 'Premier Cru', 2, 'Bommes', 3, null),
  ('Château Clos Haut-Peyraguey', 'Premier Cru', 2, 'Bommes', 4, null),
  ('Château de Rayne Vigneau', 'Premier Cru', 2, 'Bommes', 5, null),
  ('Château Suduiraut', 'Premier Cru', 2, 'Preignac', 6, null),
  ('Château Coutet', 'Premier Cru', 2, 'Barsac', 7, null),
  ('Château Climens', 'Premier Cru', 2, 'Barsac', 8, null),
  ('Château Guiraud', 'Premier Cru', 2, 'Sauternes', 9, null),
  ('Château Rieussec', 'Premier Cru', 2, 'Fargues', 10, null),
  ('Château Rabaud-Promis', 'Premier Cru', 2, 'Bommes', 11, null),
  ('Château Sigalas Rabaud', 'Premier Cru', 2, 'Bommes', 12, null),
  -- Deuxièmes Crus — 15
  ('Château de Myrat', 'Deuxième Cru', 3, 'Barsac', 13, null),
  ('Château Doisy Daëne', 'Deuxième Cru', 3, 'Barsac', 14, null),
  ('Château Doisy-Dubroca', 'Deuxième Cru', 3, 'Barsac', 15, null),
  ('Château Doisy-Védrines', 'Deuxième Cru', 3, 'Barsac', 16, null),
  ('Château d''Arche', 'Deuxième Cru', 3, 'Sauternes', 17, null),
  ('Château Filhot', 'Deuxième Cru', 3, 'Sauternes', 18, null),
  ('Château Broustet', 'Deuxième Cru', 3, 'Barsac', 19, null),
  ('Château Nairac', 'Deuxième Cru', 3, 'Barsac', 20, null),
  ('Château Caillou', 'Deuxième Cru', 3, 'Barsac', 21, null),
  ('Château Suau', 'Deuxième Cru', 3, 'Barsac', 22, null),
  ('Château de Malle', 'Deuxième Cru', 3, 'Preignac', 23, null),
  ('Château Romer', 'Deuxième Cru', 3, 'Fargues', 24, null),
  ('Château Romer du Hayot', 'Deuxième Cru', 3, 'Fargues', 25, null),
  ('Château Lamothe', 'Deuxième Cru', 3, 'Sauternes', 26, null),
  ('Château Lamothe-Guignard', 'Deuxième Cru', 3, 'Sauternes', 27, null)
) as v(name, tier, tier_rank, commune, sort_order, local_note)
where d.key = 'sauternes-1855'
on conflict (designation_id, name) do nothing;

-- 1959 Graves / Pessac-Léognan Cru Classé — 16 châteaux, single flat tier.
-- Colour scope (red / white / red & white) carried in local_note.
insert into public.wine_designation_members
  (designation_id, member_kind, name, tier, tier_rank, commune, sort_order, local_note, editorial_status)
select d.id, 'ESTATE', v.name, 'Cru Classé', 1, v.commune, v.sort_order, v.local_note, 'PUBLISHED'
from public.wine_designations d,
(values
  ('Château Bouscaut', 'Cadaujac', 1, 'red & white'),
  ('Château Carbonnieux', 'Léognan', 2, 'red & white'),
  ('Domaine de Chevalier', 'Léognan', 3, 'red & white'),
  ('Château Couhins', 'Villenave-d''Ornon', 4, 'white'),
  ('Château Couhins-Lurton', 'Villenave-d''Ornon', 5, 'white'),
  ('Château de Fieuzal', 'Léognan', 6, 'red'),
  ('Château Haut-Bailly', 'Léognan', 7, 'red'),
  ('Château Haut-Brion', 'Pessac', 8, 'red — also an 1855 Médoc First Growth'),
  ('Château Latour-Martillac', 'Martillac', 9, 'red & white'),
  ('Château Laville Haut-Brion', 'Talence', 10, 'white — now part of Château La Mission Haut-Brion'),
  ('Château Malartic-Lagravière', 'Léognan', 11, 'red & white'),
  ('Château La Mission Haut-Brion', 'Talence', 12, 'red'),
  ('Château Olivier', 'Léognan', 13, 'red & white'),
  ('Château Pape Clément', 'Pessac', 14, 'red'),
  ('Château Smith Haut Lafitte', 'Martillac', 15, 'red'),
  ('Château La Tour Haut-Brion', 'Talence', 16, 'red — now part of Château La Mission Haut-Brion')
) as v(name, commune, sort_order, local_note)
where d.key = 'graves-cru-classe'
on conflict (designation_id, name) do nothing;

do $$
declare v_medoc int; v_saut int; v_graves int; v_m1 int; v_m2 int; v_m3 int; v_m4 int; v_m5 int; v_s1 int;
begin
  select count(*) into v_medoc  from wine_designation_members m join wine_designations d on d.id=m.designation_id where d.key='medoc-1855';
  select count(*) into v_saut   from wine_designation_members m join wine_designations d on d.id=m.designation_id where d.key='sauternes-1855';
  select count(*) into v_graves from wine_designation_members m join wine_designations d on d.id=m.designation_id where d.key='graves-cru-classe';
  if v_medoc  <> 61 then raise exception 'medoc expected 61, got %', v_medoc; end if;
  if v_saut   <> 27 then raise exception 'sauternes expected 27, got %', v_saut; end if;
  if v_graves <> 16 then raise exception 'graves expected 16, got %', v_graves; end if;
  -- Médoc growth composition 5/14/14/10/18
  select count(*) into v_m1 from wine_designation_members m join wine_designations d on d.id=m.designation_id where d.key='medoc-1855' and m.tier_rank=1;
  select count(*) into v_m2 from wine_designation_members m join wine_designations d on d.id=m.designation_id where d.key='medoc-1855' and m.tier_rank=2;
  select count(*) into v_m3 from wine_designation_members m join wine_designations d on d.id=m.designation_id where d.key='medoc-1855' and m.tier_rank=3;
  select count(*) into v_m4 from wine_designation_members m join wine_designations d on d.id=m.designation_id where d.key='medoc-1855' and m.tier_rank=4;
  select count(*) into v_m5 from wine_designation_members m join wine_designations d on d.id=m.designation_id where d.key='medoc-1855' and m.tier_rank=5;
  if v_m1<>5 or v_m2<>14 or v_m3<>14 or v_m4<>10 or v_m5<>18 then
    raise exception 'medoc growth composition expected 5/14/14/10/18, got %/%/%/%/%', v_m1, v_m2, v_m3, v_m4, v_m5; end if;
  -- Sauternes: exactly one Premier Cru Supérieur (Yquem)
  select count(*) into v_s1 from wine_designation_members m join wine_designations d on d.id=m.designation_id where d.key='sauternes-1855' and m.tier_rank=1;
  if v_s1<>1 then raise exception 'sauternes Premier Cru Supérieur expected 1, got %', v_s1; end if;
end $$;
