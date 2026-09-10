-- The six Alentejo sub-regions that cannot carry a map shape get a key fact
-- saying what actually bounds them. Portaria 296/2010 delimits these by the
-- serra d'Ossa ridgeline, river courses, named roads, a railway line, numbered
-- rustic properties and a 700 m altitude ceiling — not by parish boundaries —
-- so no union of administrative units can represent them and they stay
-- Details-only. Without this the reader clicks one, sees the panel fill and the
-- map sit still, and has no idea why; with it, the reason is the fact.
--
-- Vidigueira and Granja-Amareleja are not in this list: Portaria 296/2010
-- defines those two administratively, so they got real geometry in
-- 20260904100000_portugal_wave2_freguesia_subregions.sql.

begin;

update wine_place_articles a
set key_facts = a.key_facts || v.extra,
    updated_at = now()
from (values
  ('portugal.alentejo.borba',
   'Bounded by the serra d''Ossa, the ribeira do Tira Calças and named roads, not by parish limits'),
  ('portugal.alentejo.evora',
   'Bounded by the rio Degebe, the rio Xarrama and named farm tracks, not by parish limits'),
  ('portugal.alentejo.moura',
   'Bounded by the Guadiana, the Ardila and the ribeira de Toutalga'),
  ('portugal.alentejo.portalegre',
   'Bounded by the Elvas–Torre das Vargens railway, the ribeira de Seda and a 700 m altitude ceiling'),
  ('portugal.alentejo.redondo',
   'Bounded by the serra d''Ossa and the ribeira da Pardiela'),
  ('portugal.alentejo.reguengos',
   'Bounded by the Vigia reservoir, the rio Degebe and the Guadiana')
) as v(key, extra)
join wine_places p on p.canonical_key = v.key
where a.wine_place_id = p.id
  and not (a.key_facts @> array[v.extra]);

do $$
declare n int;
begin
  select count(*) into n
  from wine_place_articles a join wine_places p on p.id = a.wine_place_id
  where p.canonical_key like 'portugal.alentejo.%' and array_length(a.key_facts, 1) = 5;
  if n <> 6 then raise exception 'expected 6 Alentejo sub-regions with a 5th key fact, got %', n; end if;

  -- The two that do have geometry must NOT have been given the explanation.
  select count(*) into n
  from wine_place_articles a join wine_places p on p.id = a.wine_place_id
  where p.canonical_key in ('portugal.alentejo.vidigueira', 'portugal.alentejo.granja-amareleja')
    and array_length(a.key_facts, 1) <> 4;
  if n <> 0 then raise exception 'a sub-region with geometry was given the no-shape explanation'; end if;
end $$;

commit;
