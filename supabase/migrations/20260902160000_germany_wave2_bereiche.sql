-- Germany wave 2: the 13 Bereiche (districts) of the six RLP Anbaugebiete.
--
-- A Bereich is a legal geographic unit within the g.U. that may appear on a
-- label ("Bereich Bernkastel"), so these are appellations in their own right,
-- one tier below the Anbaugebiet.
--
-- Generated from the Weinbergsrolle cache by .tiles-build/gen-bereiche-migration.mjs
-- so the keys can never drift from the source the boundaries dissolve from.
-- Verified from that source: no Bereich name spans more than one Anbaugebiet,
-- so the tree is strictly nested.
--
-- Display names drop the "Bereich "/"Ber. " prefix (the tier and parent already
-- say what they are); the full legal name is kept in source_feature_refs on the
-- boundary. Nodes land DRAFT; build-germany-bereiche.mjs promotes them.

begin;

create temp table _b (a_slug text, slug text, name text, raw text, so int) on commit drop;
insert into _b (a_slug, slug, name, raw, so) values
  ('ahr', 'walporzheim-ahrtal', 'Walporzheim/Ahrtal', 'Bereich Walporzheim/Ahrtal', 10),
  ('mittelrhein', 'loreley', 'Loreley', 'Bereich Loreley', 10),
  ('mosel', 'bernkastel', 'Bernkastel', 'Bereich Bernkastel', 10),
  ('mosel', 'burg-cochem', 'Burg Cochem', 'Bereich Burg Cochem', 20),
  ('mosel', 'saar', 'Saar', 'Bereich Saar', 30),
  ('mosel', 'obermosel', 'Obermosel', 'Bereich Obermosel', 40),
  ('mosel', 'ruwer', 'Ruwer', 'Bereich Ruwer', 50),
  ('nahe', 'nahetal', 'Nahetal', 'Bereich Nahetal', 10),
  ('pfalz', 'mittelhaardt-dt-weinstrasse', 'Mittelhaardt/Dt. Weinstraße', 'Ber. Mittelhaardt/Dt. Weinstraße', 10),
  ('pfalz', 'suedl-weinstrasse', 'Südl. Weinstraße', 'Ber. Südl. Weinstraße', 20),
  ('rheinhessen', 'nierstein', 'Nierstein', 'Bereich Nierstein', 10),
  ('rheinhessen', 'bingen', 'Bingen', 'Bereich Bingen', 20),
  ('rheinhessen', 'wonnegau', 'Wonnegau', 'Bereich Wonnegau', 30);

insert into wine_places (
  slug, canonical_key, name, kind, display_tier, min_zoom, label_min_zoom,
  is_appellation, appellation_system, appellation_level,
  publication_status, sort_order, primary_parent_id
)
select b.slug, 'germany.' || b.a_slug || '.' || b.slug, b.name, 'SUBREGION', 2, 6, 6,
       true, 'g.U.', 'subregional', 'DRAFT', b.so, p.id
  from _b b
  join wine_places p on p.canonical_key = 'germany.' || b.a_slug
 where not exists (
   select 1 from wine_places x where x.canonical_key = 'germany.' || b.a_slug || '.' || b.slug);

do $$
declare v int;
begin
  select count(*) into v from wine_places
   where canonical_key like 'germany.%.%' and kind = 'SUBREGION' and display_tier = 2;
  if v <> 13 then raise exception 'expected 13 Bereiche, got %', v; end if;
end $$;

commit;
