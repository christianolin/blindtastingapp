-- Distinct palate flavours per archetype (they were a copy of the nose). The
-- palate emphasises what's tasted — palate development, minerality, savoury and
-- oak/malo notes — rather than repeating the nose. Idempotent: clears existing
-- PALATE rows, re-inserts the curated set. Terms are from the WSET L4 lexicon;
-- distinct-on picks one id per term word (some words live in several groups).

delete from wine_archetype_aromas where kind = 'PALATE';

insert into wine_archetype_aromas (archetype_id, term_id, kind)
select a.id, t.id, 'PALATE'
from (values
  ('A typical Vosne-Romanée', array['red cherry','red plum','forest floor','mushroom','earth','savoury']),
  ('A typical Chablis', array['apple','lemon','lime','flint','wet stones']),
  ('A typical Sancerre', array['gooseberry','lime','grapefruit','flint','wet stones']),
  ('A typical Châteauneuf-du-Pape', array['black cherry','black plum','liquorice','dried herbs','leather','tar']),
  ('A typical Côte-Rôtie', array['blackberry','black pepper','smoke','leather','game']),
  ('A typical Margaux', array['blackcurrant','black cherry','cedar','tobacco','leather']),
  ('A typical Sauternes', array['dried apricot','honey','orange marmalade','caramel','ginger']),
  ('A typical Champagne', array['apple','lemon','brioche','toast','hazelnut','cream'])
) as v(name, terms)
join wine_archetypes a on a.name = v.name
join lateral (
  select distinct on (lower(term)) id from wset_aroma_terms
  where lower(term) = any(v.terms) order by lower(term), sort_order
) t on true
on conflict do nothing;

insert into wine_archetype_aromas (archetype_id, term_id, kind)
select a.id, t.id, 'PALATE'
from (values
  ('A typical Alsace Riesling', array['lime','apple','peach','petrol','wet stones']),
  ('A typical Bandol', array['blackberry','black cherry','leather','game','tar','liquorice']),
  ('A typical Petit Chablis', array['apple','lemon','lime','wet stones']),
  ('A typical Côte de Nuits', array['red cherry','black cherry','forest floor','earth','mushroom','savoury']),
  ('A typical Côte de Beaune', array['apple','lemon','hazelnut','butter','toast','vanilla']),
  ('A typical Mâconnais', array['apple','peach','melon','lemon','hazelnut']),
  ('A typical Côte Chalonnaise', array['red cherry','red plum','strawberry','earth','savoury'])
) as v(name, terms)
join wine_archetypes a on a.name = v.name
join lateral (
  select distinct on (lower(term)) id from wset_aroma_terms
  where lower(term) = any(v.terms) order by lower(term), sort_order
) t on true
on conflict do nothing;

do $$
declare n int;
begin
  select count(*) into n from wine_archetype_aromas where kind = 'PALATE';
  if n < 70 then raise exception 'final-state: expected >= 70 palate flavours, got %', n; end if;
end $$;
