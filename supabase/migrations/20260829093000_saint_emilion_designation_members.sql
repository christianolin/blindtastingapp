-- Phase 3F: Saint-Émilion Grand Cru Classé — the 2022 classification (homologated
-- by arrêté of 15 December 2022, valid through the 2031 harvest). 85 estates:
-- 2 Premier Grand Cru Classé A, 12 Premier Grand Cru Classé B, 71 Grand Cru
-- Classé. Source: official Conseil des Vins de Saint-Émilion 2022 press kit,
-- cross-checked against the fr.wikipedia 2022 tables (EN wiki is stale — do not
-- use). Angélus, Ausone, Cheval Blanc and La Gaffelière withdrew (2021–2022) and
-- are correctly absent. ESTATE members: producer_id null (linked later), commune
-- is the estate's commune (satellite communes assigned where confident, else the
-- Saint-Émilion commune). Seeded PUBLISHED. Unlike the frozen 1855 lists, this
-- one is revised ~decennially — a future revision is a data update.
insert into public.wine_designation_members
  (designation_id, member_kind, name, tier, tier_rank, commune, sort_order, editorial_status)
select d.id, 'ESTATE', v.name, v.tier, v.tier_rank, v.commune, v.sort_order, 'PUBLISHED'
from public.wine_designations d,
(values
  -- Premier Grand Cru Classé A — 2
  ('Château Figeac', 'Premier Grand Cru Classé A', 1, 'Saint-Émilion', 1),
  ('Château Pavie', 'Premier Grand Cru Classé A', 1, 'Saint-Émilion', 2),
  -- Premier Grand Cru Classé B — 12
  ('Château Beau-Séjour Bécot', 'Premier Grand Cru Classé B', 2, 'Saint-Émilion', 3),
  ('Château Beauséjour (Héritiers Duffau-Lagarrosse)', 'Premier Grand Cru Classé B', 2, 'Saint-Émilion', 4),
  ('Château Bélair-Monange', 'Premier Grand Cru Classé B', 2, 'Saint-Émilion', 5),
  ('Château Canon', 'Premier Grand Cru Classé B', 2, 'Saint-Émilion', 6),
  ('Château Canon-la-Gaffelière', 'Premier Grand Cru Classé B', 2, 'Saint-Émilion', 7),
  ('Château Larcis Ducasse', 'Premier Grand Cru Classé B', 2, 'Saint-Laurent-des-Combes', 8),
  ('Château Pavie-Macquin', 'Premier Grand Cru Classé B', 2, 'Saint-Émilion', 9),
  ('Château Troplong Mondot', 'Premier Grand Cru Classé B', 2, 'Saint-Émilion', 10),
  ('Château Trottevieille', 'Premier Grand Cru Classé B', 2, 'Saint-Émilion', 11),
  ('Château Valandraud', 'Premier Grand Cru Classé B', 2, 'Saint-Émilion', 12),
  ('Clos Fourtet', 'Premier Grand Cru Classé B', 2, 'Saint-Émilion', 13),
  ('La Mondotte', 'Premier Grand Cru Classé B', 2, 'Saint-Émilion', 14),
  -- Grand Cru Classé — 71
  ('Château Badette', 'Grand Cru Classé', 3, 'Saint-Émilion', 15),
  ('Château Balestard la Tonnelle', 'Grand Cru Classé', 3, 'Saint-Émilion', 16),
  ('Château Barde-Haut', 'Grand Cru Classé', 3, 'Saint-Christophe-des-Bardes', 17),
  ('Château Bellefont-Belcier', 'Grand Cru Classé', 3, 'Saint-Laurent-des-Combes', 18),
  ('Château Bellevue', 'Grand Cru Classé', 3, 'Saint-Émilion', 19),
  ('Château Berliquet', 'Grand Cru Classé', 3, 'Saint-Émilion', 20),
  ('Château Boutisse', 'Grand Cru Classé', 3, 'Saint-Émilion', 21),
  ('Château Cadet-Bon', 'Grand Cru Classé', 3, 'Saint-Émilion', 22),
  ('Château Cap de Mourlin', 'Grand Cru Classé', 3, 'Saint-Émilion', 23),
  ('Château Chauvin', 'Grand Cru Classé', 3, 'Saint-Émilion', 24),
  ('Château Clos de Sarpe', 'Grand Cru Classé', 3, 'Saint-Émilion', 25),
  ('Château Corbin', 'Grand Cru Classé', 3, 'Saint-Émilion', 26),
  ('Château Corbin Michotte', 'Grand Cru Classé', 3, 'Saint-Émilion', 27),
  ('Château Côte de Baleau', 'Grand Cru Classé', 3, 'Saint-Émilion', 28),
  ('Château Croix de Labrie', 'Grand Cru Classé', 3, 'Saint-Émilion', 29),
  ('Château Dassault', 'Grand Cru Classé', 3, 'Saint-Émilion', 30),
  ('Château de Ferrand', 'Grand Cru Classé', 3, 'Saint-Hippolyte', 31),
  ('Château de Pressac', 'Grand Cru Classé', 3, 'Saint-Étienne-de-Lisse', 32),
  ('Château Destieux', 'Grand Cru Classé', 3, 'Saint-Hippolyte', 33),
  ('Château Faugères', 'Grand Cru Classé', 3, 'Saint-Étienne-de-Lisse', 34),
  ('Château Fleur Cardinale', 'Grand Cru Classé', 3, 'Saint-Étienne-de-Lisse', 35),
  ('Château Fombrauge', 'Grand Cru Classé', 3, 'Saint-Christophe-des-Bardes', 36),
  ('Château Fonplégade', 'Grand Cru Classé', 3, 'Saint-Émilion', 37),
  ('Château Fonroque', 'Grand Cru Classé', 3, 'Saint-Émilion', 38),
  ('Château Franc Mayne', 'Grand Cru Classé', 3, 'Saint-Émilion', 39),
  ('Château Grand Corbin', 'Grand Cru Classé', 3, 'Saint-Émilion', 40),
  ('Château Grand Corbin-Despagne', 'Grand Cru Classé', 3, 'Saint-Émilion', 41),
  ('Château Grand Mayne', 'Grand Cru Classé', 3, 'Saint-Émilion', 42),
  ('Château Guadet', 'Grand Cru Classé', 3, 'Saint-Émilion', 43),
  ('Château Haut-Sarpe', 'Grand Cru Classé', 3, 'Saint-Christophe-des-Bardes', 44),
  ('Château Jean Faure', 'Grand Cru Classé', 3, 'Saint-Émilion', 45),
  ('Château La Commanderie', 'Grand Cru Classé', 3, 'Saint-Émilion', 46),
  ('Château La Confession', 'Grand Cru Classé', 3, 'Saint-Émilion', 47),
  ('Château La Couspaude', 'Grand Cru Classé', 3, 'Saint-Émilion', 48),
  ('Château La Croizille', 'Grand Cru Classé', 3, 'Saint-Émilion', 49),
  ('Château La Dominique', 'Grand Cru Classé', 3, 'Saint-Émilion', 50),
  ('Château La Fleur Morange', 'Grand Cru Classé', 3, 'Saint-Pey-d''Armens', 51),
  ('Château La Marzelle', 'Grand Cru Classé', 3, 'Saint-Émilion', 52),
  ('Château La Serre', 'Grand Cru Classé', 3, 'Saint-Émilion', 53),
  ('Château La Tour Figeac', 'Grand Cru Classé', 3, 'Saint-Émilion', 54),
  ('Château Laniote', 'Grand Cru Classé', 3, 'Saint-Émilion', 55),
  ('Château Larmande', 'Grand Cru Classé', 3, 'Saint-Émilion', 56),
  ('Château Laroque', 'Grand Cru Classé', 3, 'Saint-Christophe-des-Bardes', 57),
  ('Château Laroze', 'Grand Cru Classé', 3, 'Saint-Émilion', 58),
  ('Château Le Châtelet', 'Grand Cru Classé', 3, 'Saint-Émilion', 59),
  ('Château Le Prieuré', 'Grand Cru Classé', 3, 'Saint-Émilion', 60),
  ('Château Mangot', 'Grand Cru Classé', 3, 'Saint-Étienne-de-Lisse', 61),
  ('Château Monbousquet', 'Grand Cru Classé', 3, 'Saint-Sulpice-de-Faleyrens', 62),
  ('Château Montlabert', 'Grand Cru Classé', 3, 'Saint-Émilion', 63),
  ('Château Montlisse', 'Grand Cru Classé', 3, 'Saint-Émilion', 64),
  ('Château Moulin du Cadet', 'Grand Cru Classé', 3, 'Saint-Émilion', 65),
  ('Château Péby Faugères', 'Grand Cru Classé', 3, 'Saint-Étienne-de-Lisse', 66),
  ('Château Petit Faurie de Soutard', 'Grand Cru Classé', 3, 'Saint-Émilion', 67),
  ('Château Ripeau', 'Grand Cru Classé', 3, 'Saint-Émilion', 68),
  ('Château Rochebelle', 'Grand Cru Classé', 3, 'Saint-Émilion', 69),
  ('Château Rol Valentin', 'Grand Cru Classé', 3, 'Saint-Émilion', 70),
  ('Château Saint-Georges (Côte Pavie)', 'Grand Cru Classé', 3, 'Saint-Émilion', 71),
  ('Château Sansonnet', 'Grand Cru Classé', 3, 'Saint-Émilion', 72),
  ('Château Soutard', 'Grand Cru Classé', 3, 'Saint-Émilion', 73),
  ('Château Tour Baladoz', 'Grand Cru Classé', 3, 'Saint-Émilion', 74),
  ('Château Tour Saint-Christophe', 'Grand Cru Classé', 3, 'Saint-Christophe-des-Bardes', 75),
  ('Château Villemaurine', 'Grand Cru Classé', 3, 'Saint-Émilion', 76),
  ('Château Yon-Figeac', 'Grand Cru Classé', 3, 'Saint-Émilion', 77),
  ('Clos Badon Thunevin', 'Grand Cru Classé', 3, 'Saint-Émilion', 78),
  ('Clos de l''Oratoire', 'Grand Cru Classé', 3, 'Saint-Émilion', 79),
  ('Clos des Jacobins', 'Grand Cru Classé', 3, 'Saint-Émilion', 80),
  ('Clos Dubreuil', 'Grand Cru Classé', 3, 'Saint-Émilion', 81),
  ('Clos Saint-Julien', 'Grand Cru Classé', 3, 'Saint-Émilion', 82),
  ('Clos Saint-Martin', 'Grand Cru Classé', 3, 'Saint-Émilion', 83),
  ('Couvent des Jacobins', 'Grand Cru Classé', 3, 'Saint-Émilion', 84),
  ('Lassègue', 'Grand Cru Classé', 3, 'Saint-Hippolyte', 85)
) as v(name, tier, tier_rank, commune, sort_order)
where d.key = 'saint-emilion-grand-cru-classe'
on conflict (designation_id, name) do nothing;

do $$
declare v_stem int; v_a int; v_b int; v_g int; v_estate int;
begin
  select count(*) into v_stem from wine_designation_members m
    join wine_designations d on d.id = m.designation_id where d.key = 'saint-emilion-grand-cru-classe';
  select count(*) into v_a from wine_designation_members m
    join wine_designations d on d.id = m.designation_id where d.key = 'saint-emilion-grand-cru-classe' and m.tier_rank = 1;
  select count(*) into v_b from wine_designation_members m
    join wine_designations d on d.id = m.designation_id where d.key = 'saint-emilion-grand-cru-classe' and m.tier_rank = 2;
  select count(*) into v_g from wine_designation_members m
    join wine_designations d on d.id = m.designation_id where d.key = 'saint-emilion-grand-cru-classe' and m.tier_rank = 3;
  if v_stem <> 85 then raise exception 'st-emilion expected 85, got %', v_stem; end if;
  if v_a <> 2 or v_b <> 12 or v_g <> 71 then
    raise exception 'st-emilion tiers expected 2/12/71, got %/%/%', v_a, v_b, v_g; end if;
  -- All Bordeaux ESTATE members now present: 61 + 27 + 16 + 85 = 189.
  select count(*) into v_estate from wine_designation_members where member_kind = 'ESTATE';
  if v_estate <> 189 then raise exception 'ESTATE total expected 189, got %', v_estate; end if;
end $$;
