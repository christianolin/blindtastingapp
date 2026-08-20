-- Germany wave 2b: the 83 Großlagen (collective sites) of the six RLP Anbaugebiete.
--
-- A Großlage is a legally-labelable name covering MANY separate vineyards across
-- several villages. That is the confusion the 1971 wine law created: on a bottle
-- "Piesporter Michelsberg" reads exactly like a single-vineyard Einzellage but
-- may span hundreds of hectares. They are legally real and in the Weinbergsrolle,
-- so they are mapped — and every one carries that caveat in its profile so the
-- distinction is visible rather than buried.
--
-- Generated from the Weinbergsrolle cache by
-- .tiles-build/gen-grosslagen-migration.mjs. Verified from that source: no
-- Großlage name spans more than one Bereich, so the tree is strictly nested.
-- Nodes land DRAFT; build-germany-grosslagen.mjs dissolves and promotes them.

begin;

create temp table _g (parent text, slug text, name text, so int, lagen int, villages int) on commit drop;
insert into _g (parent, slug, name, so, lagen, villages) values
  ('germany.ahr.walporzheim-ahrtal', 'klosterberg', 'Klosterberg', 10, 38, 7),
  ('germany.mittelrhein.loreley', 'burg-hammerstein', 'Burg Hammerstein', 30, 11, 9),
  ('germany.mittelrhein.loreley', 'burg-rheinfels', 'Burg Rheinfels', 100, 3, 1),
  ('germany.mittelrhein.loreley', 'gedeonseck', 'Gedeonseck', 40, 11, 4),
  ('germany.mittelrhein.loreley', 'herrenberg', 'Herrenberg', 70, 8, 2),
  ('germany.mittelrhein.loreley', 'lahntal', 'Lahntal', 90, 4, 4),
  ('germany.mittelrhein.loreley', 'loreleyfelsen', 'Loreleyfelsen', 50, 9, 6),
  ('germany.mittelrhein.loreley', 'marksburg', 'Marksburg', 80, 8, 6),
  ('germany.mittelrhein.loreley', 'schloss-reichenstein', 'Schloß Reichenstein', 60, 9, 3),
  ('germany.mittelrhein.loreley', 'schloss-schoenburg', 'Schloß Schönburg', 20, 15, 5),
  ('germany.mittelrhein.loreley', 'schloss-stahleck', 'Schloß Stahleck', 10, 17, 4),
  ('germany.mosel.bernkastel', 'kurfuerstlay', 'Kurfürstlay', 20, 43, 12),
  ('germany.mosel.bernkastel', 'michelsberg', 'Michelsberg', 30, 29, 7),
  ('germany.mosel.bernkastel', 'muenzlay', 'Münzlay', 60, 18, 4),
  ('germany.mosel.bernkastel', 'nacktarsch', 'Nacktarsch', 90, 6, 2),
  ('germany.mosel.bernkastel', 'probstberg', 'Probstberg', 80, 9, 6),
  ('germany.mosel.bernkastel', 'roemerlay', 'Römerlay', 40, 20, 1),
  ('germany.mosel.bernkastel', 'sankt-michael', 'Sankt Michael', 50, 19, 11),
  ('germany.mosel.bernkastel', 'schwarzlay', 'Schwarzlay', 10, 50, 13),
  ('germany.mosel.bernkastel', 'vom-heissen-stein', 'Vom heißen Stein', 70, 13, 3),
  ('germany.mosel.burg-cochem', 'goldbaeumchen', 'Goldbäumchen', 40, 27, 11),
  ('germany.mosel.burg-cochem', 'grafschaft', 'Grafschaft', 20, 32, 10),
  ('germany.mosel.burg-cochem', 'rosenhang', 'Rosenhang', 30, 28, 11),
  ('germany.mosel.burg-cochem', 'schwarze-katz', 'Schwarze Katz', 50, 16, 2),
  ('germany.mosel.burg-cochem', 'weinhex', 'Weinhex', 10, 38, 15),
  ('germany.mosel.obermosel', 'gipfel', 'Gipfel', 10, 20, 10),
  ('germany.mosel.obermosel', 'koenigsberg', 'Königsberg', 20, 7, 2),
  ('germany.mosel.ruwer', 'grosslagenfrei', 'Großlagenfrei', 10, 22, 6),
  ('germany.mosel.saar', 'scharzberg', 'Scharzberg', 10, 65, 15),
  ('germany.nahe.nahetal', 'burgweg', 'Burgweg', 20, 53, 11),
  ('germany.nahe.nahetal', 'kronenberg', 'Kronenberg', 40, 33, 3),
  ('germany.nahe.nahetal', 'paradiesgarten', 'Paradiesgarten', 10, 60, 34),
  ('germany.nahe.nahetal', 'pfarrgarten', 'Pfarrgarten', 60, 23, 6),
  ('germany.nahe.nahetal', 'rosengarten', 'Rosengarten', 50, 30, 13),
  ('germany.nahe.nahetal', 'schlosskapelle', 'Schlosskapelle', 30, 52, 17),
  ('germany.pfalz.mittelhaardt-dt-weinstrasse', 'feuerberg', 'Feuerberg', 90, 11, 6),
  ('germany.pfalz.mittelhaardt-dt-weinstrasse', 'grafenstueck', 'Grafenstück', 70, 16, 5),
  ('germany.pfalz.mittelhaardt-dt-weinstrasse', 'hochmess', 'Hochmess', 150, 4, 1),
  ('germany.pfalz.mittelhaardt-dt-weinstrasse', 'hoellenpfad', 'Höllenpfad', 60, 18, 5),
  ('germany.pfalz.mittelhaardt-dt-weinstrasse', 'hofstueck', 'Hofstück', 50, 19, 10),
  ('germany.pfalz.mittelhaardt-dt-weinstrasse', 'honigsaeckel', 'Honigsäckel', 160, 3, 1),
  ('germany.pfalz.mittelhaardt-dt-weinstrasse', 'kobnert', 'Kobnert', 30, 20, 7),
  ('germany.pfalz.mittelhaardt-dt-weinstrasse', 'mariengarten', 'Mariengarten', 20, 22, 3),
  ('germany.pfalz.mittelhaardt-dt-weinstrasse', 'meerspinne', 'Meerspinne', 40, 20, 1),
  ('germany.pfalz.mittelhaardt-dt-weinstrasse', 'pfaffengrund', 'Pfaffengrund', 100, 9, 1),
  ('germany.pfalz.mittelhaardt-dt-weinstrasse', 'rebstoeckel', 'Rebstöckel', 130, 6, 1),
  ('germany.pfalz.mittelhaardt-dt-weinstrasse', 'rosenbuehl', 'Rosenbühl', 110, 8, 4),
  ('germany.pfalz.mittelhaardt-dt-weinstrasse', 'schenkenboehl', 'Schenkenböhl', 120, 7, 3),
  ('germany.pfalz.mittelhaardt-dt-weinstrasse', 'schnepfenflug-an-der-weinstrasse', 'Schnepfenflug an der Weinstraße', 140, 6, 5),
  ('germany.pfalz.mittelhaardt-dt-weinstrasse', 'schnepfenflug-vom-zellertal', 'Schnepfenflug vom Zellertal', 80, 14, 11),
  ('germany.pfalz.mittelhaardt-dt-weinstrasse', 'schwarzerde', 'Schwarzerde', 10, 24, 11),
  ('germany.pfalz.suedl-weinstrasse', 'bischofskreuz', 'Bischofskreuz', 30, 16, 8),
  ('germany.pfalz.suedl-weinstrasse', 'guttenberg', 'Guttenberg', 40, 13, 12),
  ('germany.pfalz.suedl-weinstrasse', 'herrlich', 'Herrlich', 60, 11, 10),
  ('germany.pfalz.suedl-weinstrasse', 'kloster-liebfrauenberg', 'Kloster Liebfrauenberg', 20, 17, 13),
  ('germany.pfalz.suedl-weinstrasse', 'koenigsgarten', 'Königsgarten', 50, 12, 8),
  ('germany.pfalz.suedl-weinstrasse', 'mandelhoehe', 'Mandelhöhe', 90, 7, 2),
  ('germany.pfalz.suedl-weinstrasse', 'ordensgut', 'Ordensgut', 70, 11, 4),
  ('germany.pfalz.suedl-weinstrasse', 'schloss-ludwigshoehe', 'Schloß Ludwigshöhe', 80, 11, 2),
  ('germany.pfalz.suedl-weinstrasse', 'trappenberg', 'Trappenberg', 10, 20, 15),
  ('germany.rheinhessen.bingen', 'abtey', 'Abtey', 40, 25, 8),
  ('germany.rheinhessen.bingen', 'adelberg', 'Adelberg', 50, 22, 12),
  ('germany.rheinhessen.bingen', 'kaiserpfalz', 'Kaiserpfalz', 10, 36, 7),
  ('germany.rheinhessen.bingen', 'kurfuerstenstueck', 'Kurfürstenstück', 60, 10, 7),
  ('germany.rheinhessen.bingen', 'rheingrafenstein', 'Rheingrafenstein', 30, 30, 15),
  ('germany.rheinhessen.bingen', 'st-rochuskapelle', 'St.  Rochuskapelle', 20, 34, 12),
  ('germany.rheinhessen.nierstein', 'auflangen', 'Auflangen', 80, 8, 1),
  ('germany.rheinhessen.nierstein', 'domherr', 'Domherr', 40, 23, 8),
  ('germany.rheinhessen.nierstein', 'gueldenmorgen', 'Güldenmorgen', 70, 10, 4),
  ('germany.rheinhessen.nierstein', 'gutes-domtal', 'Gutes Domtal', 20, 25, 16),
  ('germany.rheinhessen.nierstein', 'kroetenbrunnen', 'Krötenbrunnen', 30, 24, 13),
  ('germany.rheinhessen.nierstein', 'petersberg', 'Petersberg', 50, 19, 8),
  ('germany.rheinhessen.nierstein', 'rehbach', 'Rehbach', 110, 4, 1),
  ('germany.rheinhessen.nierstein', 'rheinblick', 'Rheinblick', 90, 7, 4),
  ('germany.rheinhessen.nierstein', 'sankt-alban', 'Sankt Alban', 10, 27, 6),
  ('germany.rheinhessen.nierstein', 'spiegelberg', 'Spiegelberg', 60, 12, 2),
  ('germany.rheinhessen.nierstein', 'voegelsgaerten', 'Vögelsgärten', 100, 6, 3),
  ('germany.rheinhessen.wonnegau', 'bergkloster', 'Bergkloster', 20, 18, 8),
  ('germany.rheinhessen.wonnegau', 'burg-rodenstein', 'Burg Rodenstein', 50, 10, 4),
  ('germany.rheinhessen.wonnegau', 'domblick', 'Domblick', 60, 9, 6),
  ('germany.rheinhessen.wonnegau', 'liebfrauenmorgen', 'Liebfrauenmorgen', 40, 14, 1),
  ('germany.rheinhessen.wonnegau', 'pilgerpfad', 'Pilgerpfad', 10, 24, 5),
  ('germany.rheinhessen.wonnegau', 'sybillenstein', 'Sybillenstein', 30, 15, 7);

insert into wine_places (
  slug, canonical_key, name, kind, display_tier, min_zoom, label_min_zoom,
  is_appellation, appellation_system, appellation_level,
  publication_status, sort_order, primary_parent_id
)
select g.slug, g.parent || '.' || g.slug, g.name, 'APPELLATION', 3, 7, 7,
       true, 'g.U.', 'subregional', 'DRAFT', g.so, p.id
  from _g g
  join wine_places p on p.canonical_key = g.parent
 where not exists (select 1 from wine_places x where x.canonical_key = g.parent || '.' || g.slug);

insert into wine_place_articles (wine_place_id, description, key_facts, editorial_status)
select p.id,
  'A Großlage — a collective site name, not a single vineyard. ' || g.name ||
  ' covers ' || g.lagen || ' individual Einzellagen across ' || g.villages ||
  case when g.villages = 1 then ' village' else ' villages' end ||
  '. Because a Großlage is labelled in the same "village + site" form as a true single vineyard, a wine sold under this name can come from anywhere within it; the 1971 German wine law made that ambiguity possible and it is the main reason Großlage names are treated with suspicion.',
  array[
    'Großlage — a collective site, not one vineyard',
    g.lagen || ' Einzellagen within it',
    'Spans ' || g.villages || case when g.villages = 1 then ' village' else ' villages' end,
    'Labelled like a single vineyard — check the producer'
  ]::text[],
  'PUBLISHED'
from _g g
join wine_places p on p.canonical_key = g.parent || '.' || g.slug
where not exists (select 1 from wine_place_articles a where a.wine_place_id = p.id);

do $$
declare v int;
begin
  select count(*) into v from wine_places
   where canonical_key like 'germany.%' and display_tier = 3;
  if v <> 83 then raise exception 'expected 83 Großlagen, got %', v; end if;
end $$;

commit;
