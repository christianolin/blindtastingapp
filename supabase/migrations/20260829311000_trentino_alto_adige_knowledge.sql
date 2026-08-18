-- Knowledge for Trentino-Alto Adige round 1. Full Details (Intro/Climate/Soils/
-- Grapes/Wine styles/Key facts) on the REGION and the Alto Adige SUBREGION;
-- articles + grape/style chips on the appellations. All grapes now exist in the
-- grapes table, so grape links render as chips.

begin;

insert into wine_place_articles (wine_place_id, description, grape_varieties, wine_styles, climate, soils, key_facts, editorial_status)
select p.id, v.descr, v.gv, v.styles, v.climate, v.soils, v.kf, 'PUBLISHED'
from (values
  ('italy.trentino-alto-adige',
   'Trentino-Alto Adige is Italy''s alpine north — two autonomous provinces of steep, high-altitude vineyards yielding some of the country''s most precise whites alongside distinctive native reds. Bilingual Alto Adige (Südtirol) sits above Trentino, which runs south down the Adige toward Lake Garda.',
   'Pinot Grigio, Gewürztraminer, Pinot Bianco, Chardonnay, Sauvignon, Kerner, Sylvaner; native reds Schiava & Lagrein; Pinot Nero.',
   'Crisp, aromatic, mineral whites; light Schiava reds; darker Lagrein; alpine Pinot Nero; and traditional-method Trentodoc sparkling.',
   'Cool alpine-continental, with large diurnal swings and intense mountain sun; sheltered valleys and steep south-facing slopes keep acidity bright.',
   'Highly varied — porphyry, quartz and volcanic rock, glacial moraine, limestone and dolomitic debris across the valley slopes.',
   array['Italy''s alpine north — two autonomous provinces','Some of Italy''s finest white wines','Native reds Schiava (Vernatsch) & Lagrein','Bilingual Alto Adige (Südtirol) + Trentino']::text[]),
  ('italy.trentino-alto-adige.alto-adige',
   'Alto Adige (Südtirol) — a small, mountainous, bilingual region where terraced vineyards climb from the Adige valley floor to about 1,000 m. Celebrated above all for varietally-labelled white wines of purity and precision, plus the native reds Schiava and Lagrein.',
   'Pinot Grigio, Gewürztraminer, Pinot Bianco, Chardonnay, Sauvignon Blanc, Kerner, Sylvaner, Müller-Thurgau; Schiava, Lagrein; Pinot Nero.',
   'Precise, aromatic varietal whites; light, easy Schiava reds; structured Lagrein; and fine Pinot Nero.',
   'Alpine — warm, sunny days and cold nights; the Adige valley funnels dramatic diurnal shifts that preserve aromatics and acidity.',
   'Volcanic porphyry and quartz around Bolzano, limestone and dolomite on the slopes, glacial and morainic gravels on the valley floor.',
   array['Roughly 60% white, 40% red','Wines labelled by grape variety','Native reds: Schiava (Vernatsch) & Lagrein','Vineyards from the valley floor to ~1,000 m']::text[]),
  ('italy.trentino-alto-adige.santa-maddalena',
   'Santa Maddalena (St. Magdalener) — the historic Schiava-based red from the hills just above Bolzano, once ranked among Italy''s finest reds: light, silky and perfumed, with a dash of Lagrein for depth.',
   'Schiava, Lagrein', null, null, null,
   array['Schiava (+ up to 15% Lagrein)','DOC subzone above Bolzano','Light, silky, aromatic red','A historic Alto Adige red']::text[]),
  ('italy.trentino-alto-adige.terlano',
   'Terlano (Terlaner) — a subzone renowned for age-worthy whites, above all Pinot Bianco, on mineral porphyry-and-quartz soils north-west of Bolzano.',
   'Pinot Bianco, Chardonnay, Sauvignon Blanc', null, null, null,
   array['White specialist (esp. Pinot Bianco)','Porphyry & quartz soils','North-west of Bolzano','Famously age-worthy whites']::text[]),
  ('italy.trentino-alto-adige.meranese',
   'Meranese (Meraner) — light, delicate Schiava reds from the terraced slopes around Merano.',
   'Schiava', null, null, null,
   array['Schiava','Slopes around Merano','Light, delicate red','DOC subzone']::text[]),
  ('italy.trentino-alto-adige.valle-isarco',
   'Valle Isarco (Eisacktaler) — Alto Adige''s coolest, highest zone, running up the Isarco valley toward Bressanone: racy, aromatic whites from Sylvaner, Kerner, Grüner Veltliner and Gewürztraminer.',
   'Sylvaner, Kerner, Grüner Veltliner, Gewürztraminer, Müller-Thurgau', null, null, null,
   array['High, cool valley whites','Sylvaner, Kerner, Veltliner, Gewürztraminer','Toward Bressanone/Brixen','Racy, aromatic, mineral']::text[]),
  ('italy.trentino-alto-adige.val-venosta',
   'Val Venosta (Vinschgau) — a dry, sunny, high-altitude valley in the west making precise Riesling and Pinot Bianco whites plus some light Schiava.',
   'Riesling, Pinot Bianco, Schiava', null, null, null,
   array['High, dry western valley','Riesling & Pinot Bianco','Also light Schiava reds','Precise and mineral']::text[]),
  ('italy.trentino-alto-adige.colli-di-bolzano',
   'Colli di Bolzano (Bozner Leiten) — the slopes ringing Bolzano, making soft, everyday Schiava reds.',
   'Schiava', null, null, null,
   array['Schiava','Slopes around Bolzano','Soft, everyday red','DOC subzone']::text[]),
  ('italy.trentino-alto-adige.lago-di-caldaro',
   'Lago di Caldaro (Kalterersee) — gentle, fruity, almond-scented Schiava reds from the warm amphitheatre around Lake Caldaro.',
   'Schiava', null, null, null,
   array['Schiava','Around Lake Caldaro','Soft, fruity, almond-scented red','Shared with Trentino']::text[]),
  ('italy.trentino-alto-adige.valdadige',
   'Valdadige (Etschtaler) — the broad valley-floor DOC shared with Trentino and the Veronese, for everyday Schiava reds and Pinot Grigio whites.',
   'Schiava, Pinot Grigio', null, null, null,
   array['Valley-floor DOC','Shared with Trentino & Veneto','Everyday Schiava + Pinot Grigio','Along the Adige']::text[]),
  ('italy.trentino-alto-adige.mitterberg',
   'Mitterberg — a broad Alto Adige IGT for wines made outside the DOC rules, spanning the province''s valleys.',
   'Various (Alto Adige varieties)', null, null, null,
   array['Alto Adige IGT','Wines outside the DOC rules','Province-wide','Reds and whites']::text[]),
  ('italy.trentino-alto-adige.vigneti-delle-dolomiti',
   'Vigneti delle Dolomiti (Weinberg Dolomiten) — a large IGT spanning Alto Adige, Trentino and the Belluno Dolomites.',
   'Various (alpine varieties)', null, null, null,
   array['Cross-provincial IGT','Alto Adige + Trentino + Belluno','In the shadow of the Dolomites','Reds and whites']::text[])
) as v(ck, descr, gv, styles, climate, soils, kf)
join wine_places p on p.canonical_key = v.ck;

-- Grape entity links (chips).
insert into wine_place_grapes (wine_place_id, grape_id, role, permitted, share_pct, editorial_status)
select p.id, g.id, 'PRINCIPAL', true, null, 'PUBLISHED'
from (values
  ('Pinot Grigio','italy.trentino-alto-adige'),('Gewürztraminer','italy.trentino-alto-adige'),('Pinot Bianco','italy.trentino-alto-adige'),('Chardonnay','italy.trentino-alto-adige'),('Schiava','italy.trentino-alto-adige'),('Lagrein','italy.trentino-alto-adige'),('Pinot Nero','italy.trentino-alto-adige'),
  ('Pinot Grigio','italy.trentino-alto-adige.alto-adige'),('Gewürztraminer','italy.trentino-alto-adige.alto-adige'),('Pinot Bianco','italy.trentino-alto-adige.alto-adige'),('Chardonnay','italy.trentino-alto-adige.alto-adige'),('Sauvignon Blanc','italy.trentino-alto-adige.alto-adige'),('Schiava','italy.trentino-alto-adige.alto-adige'),('Lagrein','italy.trentino-alto-adige.alto-adige'),('Pinot Nero','italy.trentino-alto-adige.alto-adige'),
  ('Schiava','italy.trentino-alto-adige.santa-maddalena'),('Lagrein','italy.trentino-alto-adige.santa-maddalena'),
  ('Pinot Bianco','italy.trentino-alto-adige.terlano'),('Chardonnay','italy.trentino-alto-adige.terlano'),('Sauvignon Blanc','italy.trentino-alto-adige.terlano'),
  ('Schiava','italy.trentino-alto-adige.meranese'),
  ('Sylvaner','italy.trentino-alto-adige.valle-isarco'),('Kerner','italy.trentino-alto-adige.valle-isarco'),('Grüner Veltliner','italy.trentino-alto-adige.valle-isarco'),('Gewürztraminer','italy.trentino-alto-adige.valle-isarco'),('Müller-Thurgau','italy.trentino-alto-adige.valle-isarco'),
  ('Riesling','italy.trentino-alto-adige.val-venosta'),('Pinot Bianco','italy.trentino-alto-adige.val-venosta'),('Schiava','italy.trentino-alto-adige.val-venosta'),
  ('Schiava','italy.trentino-alto-adige.colli-di-bolzano'),
  ('Schiava','italy.trentino-alto-adige.lago-di-caldaro'),
  ('Schiava','italy.trentino-alto-adige.valdadige'),('Pinot Grigio','italy.trentino-alto-adige.valdadige')
) as m(grape, ck)
join grapes g on g.name = m.grape
join wine_places p on p.canonical_key = m.ck
where not exists (select 1 from wine_place_grapes wg where wg.wine_place_id = p.id and wg.grape_id = g.id);

-- Style links (appellations only; region + subregion use wine_styles text).
insert into wine_place_styles (wine_place_id, style, sort_order, editorial_status)
select p.id, st.style::wine_style_kind, st.so, 'PUBLISHED'
from wine_places p
join (values
  ('italy.trentino-alto-adige.santa-maddalena','RED',0),
  ('italy.trentino-alto-adige.terlano','WHITE',0),
  ('italy.trentino-alto-adige.meranese','RED',0),
  ('italy.trentino-alto-adige.valle-isarco','WHITE',0),
  ('italy.trentino-alto-adige.val-venosta','WHITE',0), ('italy.trentino-alto-adige.val-venosta','RED',1),
  ('italy.trentino-alto-adige.colli-di-bolzano','RED',0),
  ('italy.trentino-alto-adige.lago-di-caldaro','RED',0),
  ('italy.trentino-alto-adige.valdadige','RED',0), ('italy.trentino-alto-adige.valdadige','WHITE',1),
  ('italy.trentino-alto-adige.mitterberg','WHITE',0), ('italy.trentino-alto-adige.mitterberg','RED',1),
  ('italy.trentino-alto-adige.vigneti-delle-dolomiti','WHITE',0), ('italy.trentino-alto-adige.vigneti-delle-dolomiti','RED',1)
) as st(ck, style, so) on st.ck = p.canonical_key;

do $$
declare a int; gr int; sl int;
begin
  select count(*) into a from wine_place_articles x join wine_places p on p.id=x.wine_place_id where p.canonical_key like 'italy.trentino-alto-adige%' and x.editorial_status='PUBLISHED';
  if a <> 12 then raise exception 'expected 12 articles, got %', a; end if;
  select count(*) into gr from wine_place_grapes x join wine_places p on p.id=x.wine_place_id where p.canonical_key like 'italy.trentino-alto-adige%' and x.editorial_status='PUBLISHED';
  if gr <> 33 then raise exception 'expected 33 grape links, got %', gr; end if;
  select count(*) into sl from wine_place_styles x join wine_places p on p.id=x.wine_place_id where p.canonical_key like 'italy.trentino-alto-adige%' and x.editorial_status='PUBLISHED';
  if sl <> 14 then raise exception 'expected 14 style links, got %', sl; end if;
end $$;

commit;
