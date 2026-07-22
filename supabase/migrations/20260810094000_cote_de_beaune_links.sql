-- Phase 3D wave 1 scoring links: every Côte de Beaune village and grand cru
-- matched to its live scoring row by exact (probe-verified) name. Corton and
-- Charlemagne each carry a co-located "Le …" variant row — both rows link to
-- the same place, as with Blaye. Fail-closed on the exact update count.

update appellations a
set wine_place_id = p.id,
    map_status = 'VERIFIED',
    map_match_method = 'MIGRATED_EXACT',
    map_match_confidence = 1,
    map_reviewed_at = now(),
    map_review_note = 'Phase 3D cote-de-beaune migration: exact name match'
from (values
  ('Ladoix AOP', 'france.bourgogne.cote-de-beaune.ladoix'),
  ('Aloxe-Corton AOP', 'france.bourgogne.cote-de-beaune.aloxe-corton'),
  ('Pernand-Vergelesses AOP', 'france.bourgogne.cote-de-beaune.pernand-vergelesses'),
  ('Savigny-les-Beaune AOP', 'france.bourgogne.cote-de-beaune.savigny-les-beaune'),
  ('Chorey-les-Beaune AOP', 'france.bourgogne.cote-de-beaune.chorey-les-beaune'),
  ('Beaune AOP', 'france.bourgogne.cote-de-beaune.beaune'),
  ('Pommard AOP', 'france.bourgogne.cote-de-beaune.pommard'),
  ('Volnay AOP', 'france.bourgogne.cote-de-beaune.volnay'),
  ('Monthelie AOP', 'france.bourgogne.cote-de-beaune.monthelie'),
  ('Auxey-Duresses AOP', 'france.bourgogne.cote-de-beaune.auxey-duresses'),
  ('Saint-Romain AOP', 'france.bourgogne.cote-de-beaune.saint-romain'),
  ('Meursault AOP', 'france.bourgogne.cote-de-beaune.meursault'),
  ('Puligny-Montrachet AOP', 'france.bourgogne.cote-de-beaune.puligny-montrachet'),
  ('Chassagne-Montrachet AOP', 'france.bourgogne.cote-de-beaune.chassagne-montrachet'),
  ('Saint-Aubin AOP', 'france.bourgogne.cote-de-beaune.saint-aubin'),
  ('Santenay AOP', 'france.bourgogne.cote-de-beaune.santenay'),
  ('Maranges AOP', 'france.bourgogne.cote-de-beaune.maranges'),
  ('Corton AOP', 'france.bourgogne.cote-de-beaune.aloxe-corton.corton'),
  ('Le Corton AOP', 'france.bourgogne.cote-de-beaune.aloxe-corton.corton'),
  ('Corton-Charlemagne AOP', 'france.bourgogne.cote-de-beaune.aloxe-corton.corton-charlemagne'),
  ('Charlemagne AOP', 'france.bourgogne.cote-de-beaune.aloxe-corton.charlemagne'),
  ('Le Charlemagne AOP', 'france.bourgogne.cote-de-beaune.aloxe-corton.charlemagne'),
  ('Montrachet AOP', 'france.bourgogne.cote-de-beaune.puligny-montrachet.montrachet'),
  ('Chevalier-Montrachet AOP', 'france.bourgogne.cote-de-beaune.puligny-montrachet.chevalier-montrachet'),
  ('Bâtard-Montrachet AOP', 'france.bourgogne.cote-de-beaune.puligny-montrachet.batard-montrachet'),
  ('Bienvenues-Bâtard-Montrachet AOP', 'france.bourgogne.cote-de-beaune.puligny-montrachet.bienvenues-batard-montrachet'),
  ('Criots-Bâtard-Montrachet AOP', 'france.bourgogne.cote-de-beaune.chassagne-montrachet.criots-batard-montrachet')
) as v(name, key)
join wine_places p on p.canonical_key = v.key
where a.name = v.name and a.wine_place_id is null;

do $$
declare v_count int;
begin
  select count(*) into v_count from appellations
   where map_review_note = 'Phase 3D cote-de-beaune migration: exact name match';
  if v_count <> 27 then
    raise exception 'expected 27 Cote de Beaune links, got % (a name failed to match)', v_count;
  end if;
end $$;
