-- Spain wave 13: two NEW comunidades — País Vasco and Illes Balears — with their
-- DOPs, from the official MAPA pliegos.
--   País Vasco: Arabako Txakolina (5, Álava — Aiara valley), Bizkaiko Txakolina
--     (whole province of Bizkaia — the pliego delimits it as any Bizkaia término
--     municipal), Getariako Txakolina (whole Gipuzkoa — "Territorio Histórico de
--     Gipuzkoa"). The two whole-territory Txakolis are the legal zona de producción.
--   Illes Balears: Binissalem (5, Raiguer), Pla i Llevant (19, plain + east Mallorca).
-- New REGION nodes (tier 1, VERIFIED, tree-only — overview boundary built by
-- build-spain-comunidad-boundaries after promotion). DOs -> APPELLATION tier 2
-- (6/6) DRAFT; run-spain-dos.mjs promotes each. Native grapes added idempotently.

begin;

insert into grapes (name, color, skin_color, description, main_regions)
select v.name, v.color, v.skin, v.descr, v.regions
from (values
  ('Hondarrabi Zuri', 'WHITE', 'green', 'The white grape of Basque Txakoli — searingly high-acid, green-apple and citrus whites with a characteristic spritz.', 'País Vasco (Txakoli)'),
  ('Hondarrabi Beltza', 'RED', 'blue-black', 'The red Txakoli grape — light, tart, low-alcohol reds and rosés on the Basque coast.', 'País Vasco (Txakoli)'),
  ('Manto Negro', 'RED', 'blue-black', 'Mallorca''s principal native red — soft, aromatic, moderate-bodied reds, the backbone of Binissalem.', 'Illes Balears (Mallorca)'),
  ('Callet', 'RED', 'blue-black', 'A Mallorcan native red giving pale, fresh, fragrant reds and rosés.', 'Illes Balears (Mallorca)'),
  ('Prensal', 'WHITE', 'green', 'Prensal Blanc (Moll) — Mallorca''s native white, giving soft, gently aromatic whites.', 'Illes Balears (Mallorca)')
) as v(name, color, skin, descr, regions)
where not exists (select 1 from grapes g where g.name = v.name);

-- New comunidad REGION nodes.
insert into wine_places (slug, canonical_key, name, kind, display_tier, min_zoom, label_min_zoom, is_appellation, publication_status, sort_order, primary_parent_id)
select v.slug, v.ckey, v.name, 'REGION', 1, 4, 4, false, 'VERIFIED', v.so, p.id
  from (values
    ('pais-vasco', 'spain.pais-vasco', 'País Vasco', 90),
    ('baleares', 'spain.baleares', 'Illes Balears', 100)
  ) as v(slug, ckey, name, so)
  cross join wine_places p where p.canonical_key = 'spain';

-- DO nodes (APPELLATION, tier 2, DOP regional) — DRAFT.
insert into wine_places (slug, canonical_key, name, kind, display_tier, min_zoom, label_min_zoom, is_appellation, appellation_system, appellation_level, publication_status, sort_order, primary_parent_id)
select v.slug, v.ckey, v.name, 'APPELLATION', 2, 6, 6, true, 'DOP', 'regional', 'DRAFT', v.so, p.id
  from (values
    ('arabako', 'spain.pais-vasco.arabako', 'Arabako Txakolina', 10, 'spain.pais-vasco'),
    ('bizkaiko', 'spain.pais-vasco.bizkaiko', 'Bizkaiko Txakolina', 20, 'spain.pais-vasco'),
    ('getariako', 'spain.pais-vasco.getariako', 'Getariako Txakolina', 30, 'spain.pais-vasco'),
    ('binissalem', 'spain.baleares.binissalem', 'Binissalem', 10, 'spain.baleares'),
    ('pla-i-llevant', 'spain.baleares.pla-i-llevant', 'Pla i Llevant', 20, 'spain.baleares')
  ) as v(slug, ckey, name, so, parent)
  join wine_places p on p.canonical_key = v.parent;

insert into wine_place_articles (wine_place_id, description, key_facts, editorial_status)
select p.id, v.descr, v.facts, 'PUBLISHED'
from (values
  ('spain.pais-vasco.arabako',
   'The Álava expression of Basque Txakoli, from the Aiara (Ayala) valley — bracing, high-acid whites from Hondarrabi Zuri, traditionally poured from a height to lift their spritz.',
   array['Hondarrabi Zuri whites','Aiara/Ayala valley (Álava)','Spritzy, high-acid Txakoli']),
  ('spain.pais-vasco.bizkaiko',
   'Txakoli from across Bizkaia — lively, low-alcohol, green-apple whites (with some reds) from Hondarrabi Zuri and Beltza, shaped by the cool, wet Atlantic coast. The DO spans the whole province.',
   array['Whole-province DO (Bizkaia)','Hondarrabi Zuri & Beltza','Cool, wet Atlantic whites']),
  ('spain.pais-vasco.getariako',
   'The original Txakoli, from Getaria on the Gipuzkoan coast — bone-dry, spritzy, saline whites from Hondarrabi Zuri, made to drink young with Basque seafood. Delimited as the whole Territorio Histórico de Gipuzkoa.',
   array['The original Txakoli (Getaria)','Whole Gipuzkoa territory','Saline, seafood-friendly whites']),
  ('spain.baleares.binissalem',
   'Mallorca''s historic inland DO on the Raiguer plain, built on the native red Manto Negro — soft, warm, aromatic reds — with Moll/Prensal whites.',
   array['Native Manto Negro reds','Moll/Prensal whites','Raiguer plain, central Mallorca']),
  ('spain.baleares.pla-i-llevant',
   'The plain and east of Mallorca, championing the native reds Callet and Manto Negro for fresh reds and rosés, alongside island whites.',
   array['Native Callet & Manto Negro','Fresh reds & rosés','Plain + east Mallorca'])
) as v(key, descr, facts)
join wine_places p on p.canonical_key = v.key;

insert into wine_place_grapes (wine_place_id, grape_id, role, permitted, editorial_status)
select p.id, g.id, 'PRINCIPAL', true, 'PUBLISHED'
from (values
  ('Hondarrabi Zuri','spain.pais-vasco.arabako'),('Hondarrabi Beltza','spain.pais-vasco.arabako'),
  ('Hondarrabi Zuri','spain.pais-vasco.bizkaiko'),('Hondarrabi Beltza','spain.pais-vasco.bizkaiko'),
  ('Hondarrabi Zuri','spain.pais-vasco.getariako'),('Hondarrabi Beltza','spain.pais-vasco.getariako'),
  ('Manto Negro','spain.baleares.binissalem'),('Prensal','spain.baleares.binissalem'),
  ('Callet','spain.baleares.pla-i-llevant'),('Manto Negro','spain.baleares.pla-i-llevant'),('Prensal','spain.baleares.pla-i-llevant')
) as m(grape, ck)
join grapes g on g.name = m.grape
join wine_places p on p.canonical_key = m.ck
where not exists (select 1 from wine_place_grapes wg where wg.wine_place_id = p.id and wg.grape_id = g.id);

insert into wine_place_styles (wine_place_id, style, sort_order, editorial_status)
select p.id, s.style::wine_style_kind, s.so, 'PUBLISHED'
from (values
  ('spain.pais-vasco.arabako','WHITE',0),
  ('spain.pais-vasco.bizkaiko','WHITE',0),('spain.pais-vasco.bizkaiko','RED',1),
  ('spain.pais-vasco.getariako','WHITE',0),
  ('spain.baleares.binissalem','RED',0),('spain.baleares.binissalem','WHITE',1),('spain.baleares.binissalem','ROSE',2),
  ('spain.baleares.pla-i-llevant','RED',0),('spain.baleares.pla-i-llevant','WHITE',1),('spain.baleares.pla-i-llevant','ROSE',2)
) as s(ck, style, so)
join wine_places p on p.canonical_key = s.ck
where not exists (select 1 from wine_place_styles ws where ws.wine_place_id = p.id and ws.style = s.style::wine_style_kind and ws.colour is null);

do $$
declare v_reg int; v_do int; v_art int;
begin
  select count(*) into v_reg from wine_places where canonical_key in ('spain.pais-vasco','spain.baleares') and kind = 'REGION' and publication_status = 'VERIFIED';
  if v_reg <> 2 then raise exception 'expected 2 new REGIONs, got %', v_reg; end if;
  select count(*) into v_do from wine_places where canonical_key in ('spain.pais-vasco.arabako','spain.pais-vasco.bizkaiko','spain.pais-vasco.getariako','spain.baleares.binissalem','spain.baleares.pla-i-llevant') and kind = 'APPELLATION' and publication_status = 'DRAFT';
  if v_do <> 5 then raise exception 'expected 5 DRAFT DOs, got %', v_do; end if;
  select count(*) into v_art from wine_place_articles x join wine_places p on p.id = x.wine_place_id where p.canonical_key like 'spain.pais-vasco.%' or p.canonical_key like 'spain.baleares.%';
  if v_art <> 5 then raise exception 'expected 5 articles, got %', v_art; end if;
end $$;

commit;
