-- Italy / Piedmont pilot — Task 6 knowledge content.
--
-- Populates the Details panel for the 4 verified Italy places seeded by
-- 20260829268000/269000 (italy, italy.piemonte, italy.piemonte.barolo,
-- italy.piemonte.barbaresco). Unlike the France V1 content
-- (20260809090000 DRAFT -> 20260810090000 PUBLISHED two-step), this ships
-- content and the publish flip in one migration: editorial_status is set
-- to 'PUBLISHED' directly on every row below, because:
--   - wine_place_articles RLS only allows editorial_status in
--     ('PLACEHOLDER', 'PUBLISHED') to be selected at all (DRAFT rows are
--     invisible to the client, not merely nulled) — see
--     20260727090000_world_wine_map_foundation.sql "wine place articles
--     published read" policy.
--   - wine_place_grapes / wine_place_styles RLS require editorial_status =
--     'PUBLISHED' exactly (20260808090000_wine_knowledge_schema.sql).
--   - The client additionally nulls PLACEHOLDER articles
--     (tile-wine-map-explorer.tsx:297), so PLACEHOLDER would render nothing
--     even where RLS lets it through.
-- PUBLISHED is therefore the only status that renders content at all.
--
-- Content is verified fact only (disciplinare ageing minimums, DOCG dates,
-- commune counts, soil families); nothing invented. Where no verified
-- climate/soils text exists (piemonte, italy) those columns are left null
-- rather than guessed, per the task brief.

begin;

-- ---------------------------------------------------------------------------
-- 1. Articles — Barolo and Barbaresco (description, soils, climate, key_facts).
-- ---------------------------------------------------------------------------
insert into wine_place_articles (wine_place_id, description, soils, climate, key_facts, editorial_status)
select p.id, v.description, v.soils, v.climate, v.facts, 'PUBLISHED'
from (values
  ('italy.piemonte.barolo',
   'Barolo, the flagship red of Piedmont''s Langhe hills, is made entirely from Nebbiolo. Powerful, high-tannin and perfumed — the classic ''tar and roses'' — it rewards long ageing. Produced in 11 communes around and south-west of Alba, in the province of Cuneo.',
   'Two dominant marls: Tortonian (blue-grey Sant''Agata marls; more perfumed, earlier-maturing — La Morra, Barolo) and Serravallian (compact, sandier; more structured and long-lived — Serralunga, Monforte, Castiglione Falletto).',
   'Continental, with the autumn fog (nebbia) that names the grape; hillside vineyards ~200–400 m.',
   array['DOCG since 1980 (DOC 1966)', '100% Nebbiolo (Michet, Lampia, Rosé)', 'Minimum ageing 38 months, ≥18 in wood; Riserva 62 months', '11 communes, province of Cuneo']),
  ('italy.piemonte.barbaresco',
   'Barbaresco, Barolo''s neighbour across the Tanaro north-east of Alba, is likewise 100% Nebbiolo — typically a touch more approachable and aromatic, with slightly shorter required ageing. Made in Barbaresco, Neive and Treiso, plus the San Rocco Seno d''Elvio frazione of Alba.',
   'Predominantly Tortonian (Sant''Agata) calcareous marls, giving elegant, perfumed wines.',
   'A little warmer and lower than Barolo, close to the Tanaro; vineyards ~200–350 m.',
   array['DOCG since 1980 (DOC 1966)', '100% Nebbiolo', 'Minimum ageing 26 months, ≥9 in wood; Riserva 50 months', 'Barbaresco, Neive, Treiso (+ part of Alba)'])
) as v(key, description, soils, climate, facts)
join wine_places p on p.canonical_key = v.key;

-- ---------------------------------------------------------------------------
-- 2. Articles — Piemonte and Italy (description + key_facts only; no
--    verified soils/climate text at this tier, left null rather than guessed).
-- ---------------------------------------------------------------------------
insert into wine_place_articles (wine_place_id, description, key_facts, editorial_status)
select p.id, v.description, v.facts, 'PUBLISHED'
from (values
  ('italy.piemonte',
   'Piedmont (''foot of the mountains''), in north-west Italy below the Alps, is one of the country''s great wine regions. Its Langhe and Monferrato hills yield Nebbiolo (Barolo, Barbaresco), Barbera, Dolcetto, Moscato and Cortese.',
   array['North-west Italy, province-rich hills of Langhe & Monferrato', 'Home of Nebbiolo — Barolo & Barbaresco', 'Also Barbera, Dolcetto, Moscato d''Asti, Gavi (Cortese)']),
  ('italy',
   'Italy is among the world''s largest and most diverse wine producers, with distinctive native grapes and appellations in every region from the Alps to Sicily.',
   array['20 wine regions', 'Hundreds of native grape varieties', 'DOCG/DOC/IGT classification'])
) as v(key, description, facts)
join wine_places p on p.canonical_key = v.key;

-- ---------------------------------------------------------------------------
-- 3. Grape link — Nebbiolo, principal and sole permitted variety, for
--    Barolo and Barbaresco (both 100% Nebbiolo per the disciplinare).
-- ---------------------------------------------------------------------------
insert into wine_place_grapes (wine_place_id, grape_id, role, permitted, share_pct, editorial_status)
select p.id, g.id, 'PRINCIPAL', true, 100, 'PUBLISHED'
from wine_places p, grapes g
where g.name = 'Nebbiolo'
  and p.canonical_key in ('italy.piemonte.barolo', 'italy.piemonte.barbaresco');

do $$
begin
  if not exists (select 1 from grapes where name = 'Nebbiolo') then
    raise exception 'Nebbiolo grape not found — cannot link wine_place_grapes';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 4. Style link — still red, for Barolo and Barbaresco.
-- ---------------------------------------------------------------------------
insert into wine_place_styles (wine_place_id, style, sort_order, editorial_status)
select p.id, 'RED', 0, 'PUBLISHED'
from wine_places p
where p.canonical_key in ('italy.piemonte.barolo', 'italy.piemonte.barbaresco');

-- ---------------------------------------------------------------------------
-- Same-transaction assertions — fail closed.
-- ---------------------------------------------------------------------------
do $$
declare
  v_articles int;
  v_rendering int;
  v_grapes int;
  v_styles int;
begin
  select count(*) into v_articles
    from wine_place_articles a
    join wine_places p on p.id = a.wine_place_id
   where p.canonical_key like 'italy%';
  if v_articles <> 4 then
    raise exception 'expected 4 italy articles, got %', v_articles;
  end if;

  select count(*) into v_rendering
    from wine_place_articles a
    join wine_places p on p.id = a.wine_place_id
   where p.canonical_key like 'italy%' and a.editorial_status = 'PUBLISHED';
  if v_rendering <> 4 then
    raise exception 'expected 4 rendering (PUBLISHED) italy articles, got %', v_rendering;
  end if;

  select count(*) into v_grapes
    from wine_place_grapes wpg
    join wine_places p on p.id = wpg.wine_place_id
   where p.canonical_key like 'italy%' and wpg.editorial_status = 'PUBLISHED';
  if v_grapes <> 2 then
    raise exception 'expected 2 published italy grape links, got %', v_grapes;
  end if;

  select count(*) into v_styles
    from wine_place_styles s
    join wine_places p on p.id = s.wine_place_id
   where p.canonical_key like 'italy%' and s.editorial_status = 'PUBLISHED';
  if v_styles <> 2 then
    raise exception 'expected 2 published italy style links, got %', v_styles;
  end if;
end $$;

commit;
