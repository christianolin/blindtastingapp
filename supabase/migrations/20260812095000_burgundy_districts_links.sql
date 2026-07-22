-- Phase 3D waves 2+3 scoring links: every new appellation matched to its
-- live scoring row by exact (probe-verified) name. Unaccented variants and
-- the suffix-less "Chablis Grand Cru" row are enumerated verbatim.

update appellations a
set wine_place_id = p.id,
    map_status = 'VERIFIED',
    map_match_method = 'MIGRATED_EXACT',
    map_match_confidence = 1,
    map_reviewed_at = now(),
    map_review_note = 'Phase 3D districts migration: exact name match'
from (values
  ('Chablis AOP', 'france.bourgogne.chablis.chablis'),
  ('Petit Chablis AOP', 'france.bourgogne.chablis.petit-chablis'),
  ('Chablis Grand Cru', 'france.bourgogne.chablis.chablis.chablis-grand-cru'),
  ('Irancy AOP', 'france.bourgogne.grand-auxerrois.irancy'),
  ('Saint-Bris AOP', 'france.bourgogne.grand-auxerrois.saint-bris'),
  ('Vezelay AOP', 'france.bourgogne.grand-auxerrois.vezelay'),
  ('Bouzeron AOP', 'france.bourgogne.cote-chalonnaise.bouzeron'),
  ('Rully AOP', 'france.bourgogne.cote-chalonnaise.rully'),
  ('Mercurey AOP', 'france.bourgogne.cote-chalonnaise.mercurey'),
  ('Givry AOP', 'france.bourgogne.cote-chalonnaise.givry'),
  ('Montagny AOP', 'france.bourgogne.cote-chalonnaise.montagny'),
  ('Macon AOP', 'france.bourgogne.maconnais.macon'),
  ('Vire-Clesse AOP', 'france.bourgogne.maconnais.vire-clesse'),
  ('Pouilly-Fuissé AOP', 'france.bourgogne.maconnais.pouilly-fuisse'),
  ('Pouilly-Vinzelles AOP', 'france.bourgogne.maconnais.pouilly-vinzelles'),
  ('Pouilly-Loche AOP', 'france.bourgogne.maconnais.pouilly-loche'),
  ('Saint-Véran AOP', 'france.bourgogne.maconnais.saint-veran')
) as v(name, key)
join wine_places p on p.canonical_key = v.key
where a.name = v.name and a.wine_place_id is null;

do $$
declare v_count int;
begin
  select count(*) into v_count from appellations
   where map_review_note = 'Phase 3D districts migration: exact name match';
  if v_count <> 17 then
    raise exception 'expected 17 district-wave links, got % (a name failed to match)', v_count;
  end if;
end $$;
