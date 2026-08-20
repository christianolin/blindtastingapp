-- Germany wave 1: the `germany` COUNTRY node and the six Anbaugebiete covered
-- by the Rheinland-Pfalz Weinbergsrolle (Mosel, Rheinhessen, Pfalz, Nahe,
-- Mittelrhein, Ahr).
--
-- Modelling note: unlike a Spanish comunidad (a container that happens to hold
-- DOs), a German **Anbaugebiet IS the g.U./PDO**. So these REGION nodes are
-- themselves appellations — the same dual-role pattern France uses for Bordeaux
-- and Spain uses for Rioja/Navarra.
--
-- Boundaries are attached by scripts, not embedded here:
--   build-germany-country-outline.mjs  — dissolve of the 16 Bundesländer
--   build-germany-anbaugebiete.mjs     — dissolve of the Weinbergsrolle
-- so the nodes land DRAFT (regions) and the script promotes them once the
-- geometry passes its guards. The country lands VERIFIED: country keys never
-- rename, matching the france/italy/spain precedent.
--
-- The seven remaining Anbaugebiete (Baden, Württemberg, Franken, Rheingau,
-- Hessische Bergstraße, Saale-Unstrut, Sachsen) are in other federal states and
-- need their own sources; sort_order leaves gaps for them, ordered by vineyard
-- area so the legend reads sensibly once they land.

begin;

-- Missing German varieties. Spätburgunder/Grauburgunder/Weißburgunder are the
-- German names for Pinot Noir/Gris/Blanc, which already exist, so only the
-- genuinely absent ones are added.
insert into grapes (name, color, description)
select v.name, v.color, v.description
from (values
  ('Dornfelder', 'RED',
   'A modern German crossing (1955) that became the country''s answer to the thin reds of the past: deep violet-black, soft and fruity, with real colour and body. Widely planted in Rheinhessen and the Pfalz.'),
  ('Elbling', 'WHITE',
   'An ancient, sharply acidic white once grown all over northern Europe, now largely confined to the limestone of the Obermosel. Neutral and bracing; much of it becomes Sekt.'),
  ('Portugieser', 'RED',
   'An early-ripening red giving pale, soft, low-tannin wines, traditionally drunk young and often as Weißherbst. Long a workhorse of the Pfalz and Rheinhessen.'),
  ('Scheurebe', 'WHITE',
   'A Silvaner crossing with a pronounced grapefruit-and-blackcurrant perfume. Superb when fully ripe — dry or botrytised — and unmistakably aromatic.'),
  ('Frühburgunder', 'RED',
   'An early-ripening mutation of Pinot Noir, ripening weeks ahead of Spätburgunder. Darker and more compact; the Ahr''s speciality.')
) as v(name, color, description)
where not exists (select 1 from grapes g where g.name = v.name);

-- germany (COUNTRY, tier 0). Endonym, matching 'Italia' / 'España'.
insert into wine_places (
  slug, canonical_key, name, kind, display_tier, min_zoom, label_min_zoom,
  is_appellation, publication_status, sort_order
) values (
  'germany', 'germany', 'Deutschland', 'COUNTRY', 0, 1.5, 2,
  false, 'VERIFIED', 120
);

-- The six RLP Anbaugebiete. REGION + is_appellation: the Anbaugebiet is the PDO.
insert into wine_places (
  slug, canonical_key, name, kind, display_tier, min_zoom, label_min_zoom,
  is_appellation, appellation_system, appellation_level,
  publication_status, sort_order, primary_parent_id
)
select v.slug, 'germany.' || v.slug, v.name, 'REGION', 1, 4, 4,
       true, 'g.U.', 'regional', 'DRAFT', v.so, p.id
from (values
  ('rheinhessen', 'Rheinhessen',  10),
  ('pfalz',       'Pfalz',        20),
  ('mosel',       'Mosel',        50),
  ('nahe',        'Nahe',         70),
  ('ahr',         'Ahr',         100),
  ('mittelrhein', 'Mittelrhein', 120)
) as v(slug, name, so)
join wine_places p on p.canonical_key = 'germany';

insert into wine_place_articles (wine_place_id, description, key_facts, editorial_status)
select p.id, v.description, v.facts::text[], 'PUBLISHED'
from (values
  ('rheinhessen',
   'Germany''s largest wine region by far, a broad sweep of rolling farmland in the Rhine''s left-bank crook. Long a byword for bulk Liebfraumilch, it has been remade in a generation by young growers on the steep Rheinterrasse at Nierstein and Nackenheim and in the Wonnegau, where Riesling and Silvaner now make some of the country''s most serious dry whites.',
   array['Germany''s largest Anbaugebiet','The Rheinterrasse: Nierstein, Nackenheim','Wonnegau — Westhofen, Flörsheim-Dalsheim','Riesling and Silvaner; much Müller-Thurgau']),
  ('pfalz',
   'A warm, dry ribbon running north–south below the Haardt hills, sheltered enough for figs and almonds to line the Weinstraße. Germany''s second-largest region and arguably its most generous: Riesling with body and breadth in the Mittelhaardt, and a deep Pinot culture — Spätburgunder, Weiß- and Grauburgunder — further south.',
   array['Warmest and driest of the classic regions','Mittelhaardt: Forst, Deidesheim, Ruppertsberg','Powerful, broad-shouldered Riesling','Strong Pinot (Burgunder) tradition']),
  ('mosel',
   'Riesling''s greatest theatre: blue Devonian slate in slopes so steep they are worked by hand or by monorail, coiling through the river''s loops between Trier and Koblenz. The wines are the benchmark for delicacy — low in alcohol, high in acid, transparent to their site, and capable of ageing for decades whether bone-dry or intensely sweet.',
   array['Steepest vineyards in the world of wine','Blue Devonian slate','Riesling of great delicacy and longevity','Saar and Ruwer tributaries included']),
  ('nahe',
   'A geological patchwork between the Mosel and Rheinhessen — porphyry, slate, quartzite and sandstone within a few kilometres — and a style that splits the difference: the raciness of the Mosel with rather more substance. Long overlooked, now among Germany''s most reliably excellent Riesling sources.',
   array['Unusually varied geology in a small area','Riesling between Mosel and Rheinhessen in style','Schlossböckelheim, Niederhausen, Traisen','Historically underrated']),
  ('ahr',
   'One of the world''s northernmost red-wine regions: a narrow, sheltered side valley west of the Rhine where slate and greywacke store enough heat to ripen Pinot. Spätburgunder and the earlier-ripening Frühburgunder dominate, giving pale, perfumed, savoury reds. Devastated by the 2021 flood and still rebuilding.',
   array['Almost entirely red — unusual for Germany','Spätburgunder and Frühburgunder','Slate and greywacke in a narrow valley','Rebuilding after the 2021 flood']),
  ('mittelrhein',
   'A slender, dramatic gorge of terraced slate between Bingen and Koblenz, castles above and barges below — a UNESCO landscape. Tiny and still shrinking as the terraces prove too steep to farm economically, yet the source of some of Germany''s most piercing, mineral Riesling.',
   array['UNESCO Upper Middle Rhine Valley','Terraced slate, very steep','Almost all Riesling','One of the smallest German regions'])
) as v(slug, description, facts)
join wine_places p on p.canonical_key = 'germany.' || v.slug;

insert into wine_place_grapes (wine_place_id, grape_id, role, permitted, editorial_status)
select p.id, g.id, 'PRINCIPAL', true, 'PUBLISHED'
from (values
  ('rheinhessen', 'Riesling'), ('rheinhessen', 'Silvaner'), ('rheinhessen', 'Müller-Thurgau'), ('rheinhessen', 'Dornfelder'),
  ('pfalz', 'Riesling'), ('pfalz', 'Pinot Noir'), ('pfalz', 'Pinot Gris'), ('pfalz', 'Dornfelder'),
  ('mosel', 'Riesling'), ('mosel', 'Elbling'), ('mosel', 'Müller-Thurgau'),
  ('nahe', 'Riesling'), ('nahe', 'Müller-Thurgau'), ('nahe', 'Silvaner'),
  ('ahr', 'Pinot Noir'), ('ahr', 'Frühburgunder'), ('ahr', 'Portugieser'),
  ('mittelrhein', 'Riesling')
) as v(slug, grape)
join grapes g on g.name = v.grape
join wine_places p on p.canonical_key = 'germany.' || v.slug
where not exists (select 1 from wine_place_grapes wg where wg.wine_place_id = p.id and wg.grape_id = g.id);

insert into wine_place_styles (wine_place_id, style, sort_order, editorial_status)
select p.id, s.style::wine_style_kind, s.so, 'PUBLISHED'
from (values
  ('rheinhessen', 'WHITE', 0), ('rheinhessen', 'RED', 1),
  ('pfalz', 'WHITE', 0), ('pfalz', 'RED', 1),
  ('mosel', 'WHITE', 0), ('mosel', 'SPARKLING', 1),
  ('nahe', 'WHITE', 0),
  ('ahr', 'RED', 0), ('ahr', 'WHITE', 1),
  ('mittelrhein', 'WHITE', 0)
) as s(slug, style, so)
join wine_places p on p.canonical_key = 'germany.' || s.slug
where not exists (select 1 from wine_place_styles ws where ws.wine_place_id = p.id and ws.style = s.style::wine_style_kind and ws.colour is null);

-- Link the countries reference row to the new place (France's row is linked the
-- same way; Italy's and Spain's were left PENDING, which is a separate tidy-up).
update countries
   set wine_place_id = (select id from wine_places where canonical_key = 'germany'),
       map_status = 'VERIFIED',
       map_match_method = 'MIGRATED_EXACT'
 where name = 'Germany';

do $$
declare v_country int; v_regions int;
begin
  select count(*) into v_country from wine_places
   where canonical_key = 'germany' and kind = 'COUNTRY' and publication_status = 'VERIFIED';
  if v_country <> 1 then raise exception 'germany country node not created VERIFIED'; end if;

  select count(*) into v_regions from wine_places
   where canonical_key like 'germany.%' and kind = 'REGION'
     and is_appellation and publication_status = 'DRAFT';
  if v_regions <> 6 then raise exception 'expected 6 DRAFT Anbaugebiete, got %', v_regions; end if;
end $$;

commit;
