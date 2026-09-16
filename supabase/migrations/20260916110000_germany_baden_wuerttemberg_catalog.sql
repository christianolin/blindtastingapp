-- Catalogue Baden and Württemberg, Germany's third- and fourth-largest
-- Anbaugebiete and the last two large ones missing from this map.
--
-- Together they are about 27 000 planted hectares -- more than Mosel, Franken,
-- Nahe, Rheingau, Saale-Unstrut, Ahr, Mittelrhein and Hessische Bergstraße put
-- together. sort_order 30 and 40 were left free for them when the other ten
-- were catalogued.
--
-- WHY THESE TWO NEEDED A DIFFERENT DELIMITATION FROM EVERY REGION BEFORE THEM.
--
-- Every other German region on this map is delimited by naming administrative
-- units in its product specification and clipping vineyard land inside them.
-- That works because those regions do not share a state with another region.
-- Baden and Württemberg do. Their boundary runs between neighbouring villages,
-- and in five Gemeinden it runs THROUGH the village: Eppingen is Baden and its
-- own Kleingartach is Württemberg; Neudenau is Baden and its Siglingen is
-- Württemberg; likewise Bad Mergentheim (Dainbach against Markelsheim),
-- Oberderdingen (Flehingen against Oberderdingen itself) and Ölbronn-Dürrn.
--
-- Both specifications are flat lists of place names with no district context,
-- and twelve names appear in BOTH lists -- Marbach, Mühlhausen, Stetten,
-- Weiler, Feuerbach, Laudenbach, Rotenberg and others are each two or three
-- different places in Baden-Württemberg. The lists alone cannot say which
-- region a given village is in, so they cannot draw either region.
--
-- The delimitation used instead is the instrument written for exactly this
-- purpose: the Verordnungen der Regierungspräsidien Karlsruhe, Freiburg,
-- Tübingen und Stuttgart zur Abgrenzung der bestimmten Anbaugebiete,
-- Gesetzblatt für Baden-Württemberg 1983 Nr. 23, in force since 1.1.1984 and
-- not repealed by the 2016 Weinrechts-DVO BW, which repeals only the 2005 DVO
-- and a 1991 Prüfungsnummern-Verordnung. Its annexes assign GEMARKUNGEN --
-- cadastral districts -- to one region or the other, which is precisely the
-- resolution the flat lists lack. The current specifications are then used to
-- add places admitted since 1983.
--
-- The result is 589 Gemarkungen for Baden and 421 for Württemberg, holding
-- 33 435 of the 33 468 hectares of vineyard ATKIS records for the whole state.
-- The 33 ha remainder lies in Gemarkungen named by neither the ordinance nor
-- the specification, mostly around Salem and Friedrichshafen on the Bodensee.
--
-- Baden is also the only German Anbaugebiet in EU wine-growing Zone B; the
-- other twelve are in Zone A.
--
-- NOT catalogued: the Bereiche (Baden has nine, Württemberg six) or the
-- Großlagen, on the same grounds as Saale-Unstrut's -- the specifications do
-- not delimit them, and a place with no footprint renders as nothing.

begin;

insert into wine_places (
  canonical_key, kind, name, slug, display_tier, min_zoom, label_min_zoom,
  publication_status, sort_order, is_appellation, appellation_system,
  appellation_level, primary_parent_id
)
select v.canonical_key, 'REGION', v.name, v.slug, 1, 4, 4,
       'VERIFIED', v.sort_order, true, 'g.U.', 'regional', p.id
from wine_places p
cross join (values
  ('germany.baden',        'Baden',        'baden',        30),
  ('germany.wuerttemberg', 'Württemberg',  'wuerttemberg', 40)
) as v(canonical_key, name, slug, sort_order)
where p.canonical_key = 'germany'
on conflict (canonical_key) do nothing;

do $$
declare n int;
begin
  select count(*) into n from wine_places
   where canonical_key in ('germany.baden', 'germany.wuerttemberg');
  if n <> 2 then raise exception 'expected Baden and Wuerttemberg catalogued once each, got %', n; end if;

  select count(*) into n
    from wine_places c join wine_places p on p.id = c.primary_parent_id
   where c.canonical_key in ('germany.baden', 'germany.wuerttemberg')
     and p.canonical_key = 'germany';
  if n <> 2 then raise exception 'Baden/Wuerttemberg are not both parented to germany'; end if;

  -- sort_order 30 and 40 sit between Pfalz (20) and Mosel (50), which is where
  -- roughly 15 800 and 11 400 planted hectares belong among the others.
  select count(*) into n from wine_places
   where kind = 'REGION' and canonical_key like 'germany.%' and sort_order in (30, 40);
  if n <> 2 then raise exception 'expected sort_order 30 and 40 to be Baden and Wuerttemberg, got % rows', n; end if;

  -- Twelve of Germany's thirteen Anbaugebiete. Sachsen is the one still absent:
  -- its specification is a flat list like these two, but Saxony publishes no
  -- open vineyard land-use layer to clip against.
  select count(*) into n from wine_places
   where kind = 'REGION' and canonical_key like 'germany.%';
  if n <> 12 then raise exception 'expected 12 German Anbaugebiete, got %', n; end if;
end $$;

commit;
