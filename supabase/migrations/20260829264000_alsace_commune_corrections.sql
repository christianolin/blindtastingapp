-- Alsace grand cru communes — corrected against the delimitation itself.
--
-- The commune column shipped in 20260829263900 was compiled from recollection
-- rather than a source document. data/wine-map/alsace-communes.json now derives
-- it from geometry: each cru's INAO delimited parcels (IGN AOC-VITICOLES, the
-- same layer the live cru boundaries were built from) unioned and intersected
-- with IGN Admin Express commune polygons, which measures how the delimited
-- area actually splits across commune lines. The communes holding >= 0.5% of
-- some cru turn out to be exactly the 47 of INAO's published aire géographique
-- — two independent sources, identical answer.
--
-- Against that, the stored data was right on 43 of 51. The 8 defects:
--
--   Moenchberg      Andlau           -> Eichhoffen 81.5% + Andlau 18.5%
--   Zinnkoepfle     Soultzmatt       -> Westhalten 53.1% + Soultzmatt 46.9%
--   Praelatenberg   + Orschwiller    -> Kintzheim 100%; the note was wrong
--   Altenberg de Bergheim
--                   + Saint-Hippolyte-> Bergheim 100%; the note was wrong
--   Kessler         Guebwiller only  -> + Bergholtz 3.5%
--   Steingrubler    Wettolsheim only -> + Wintzenheim 0.6%
--   Engelberg       Scharrachbergheim-> Scharrachbergheim-Irmstett (official)
--   Schlossberg     + Kaysersberg    -> right, but note the 2016 merger
--
-- Praelatenberg/Orschwiller and Altenberg de Bergheim/Saint-Hippolyte are
-- commonly stated in textbooks; both INAO sources disagree, so they go.
-- Saint-Hippolyte does hold grand cru land — Gloeckelberg's, not Bergheim's.
--
-- The primary commune is the one holding the LARGEST share of the delimited
-- area: it becomes the cru's map parent in 20260829264200, so it has to be
-- decided by the geometry rather than by convention. Others stay in
-- local_note, since a place can only have one parent.
--
-- All 51 rows are restated (not just the 8) so this migration is the whole
-- truth table and the flip can cross-check parents against it.

-- local_note is overwritten wholesale below, so first prove it still holds
-- exactly what 20260829263900 put there. If anything else has since written a
-- note on these rows, fail rather than destroy it.
do $$
declare
  v_rows int;
  v_notes int;
  v_foreign int;
begin
  select count(*), count(m.local_note),
         count(*) filter (
           where m.local_note is not null
             and m.local_note not like 'Also extends into %'
         )
    into v_rows, v_notes, v_foreign
    from wine_designation_members m
    join wine_designations d on d.id = m.designation_id
   where d.key = 'alsace-grand-cru';
  if v_rows <> 51 then
    raise exception 'expected 51 alsace grand cru members, got %', v_rows;
  end if;
  if v_notes <> 20 then
    raise exception 'expected the 20 notes from 20260829263900, got %', v_notes;
  end if;
  if v_foreign <> 0 then
    raise exception '% local_note(s) not written by 20260829263900; refusing to overwrite', v_foreign;
  end if;
end;
$$;

with commune(cru, commune, note) as (values
  ('Altenberg de Bergbieten',   'Bergbieten',        null),
  ('Altenberg de Bergheim',     'Bergheim',          null),
  ('Altenberg de Wolxheim',     'Wolxheim',          null),
  ('Brand',                     'Turckheim',         null),
  ('Bruderthal',                'Molsheim',          null),
  ('Eichberg',                  'Eguisheim',         null),
  ('Engelberg',                 'Dahlenheim',        'Also extends into Scharrachbergheim-Irmstett.'),
  ('Florimont',                 'Ingersheim',        'Also extends into Katzenthal.'),
  ('Frankstein',                'Dambach-la-Ville',  null),
  ('Froehn',                    'Zellenberg',        null),
  ('Furstentum',                'Kientzheim',        'Also extends into Sigolsheim.'),
  ('Geisberg',                  'Ribeauvillé',       null),
  ('Gloeckelberg',              'Rodern',            'Also extends into Saint-Hippolyte.'),
  ('Goldert',                   'Gueberschwihr',     null),
  ('Hatschbourg',               'Hattstatt',         'Also extends into Vœgtlinshoffen.'),
  ('Hengst',                    'Wintzenheim',       null),
  ('Kaefferkopf',               'Ammerschwihr',      null),
  ('Kanzlerberg',               'Bergheim',          null),
  ('Kastelberg',                'Andlau',            null),
  ('Kessler',                   'Guebwiller',        'Also extends into Bergholtz.'),
  ('Kirchberg de Barr',         'Barr',              null),
  ('Kirchberg de Ribeauvillé',  'Ribeauvillé',       null),
  ('Kitterlé',                  'Guebwiller',        null),
  ('Mambourg',                  'Sigolsheim',        null),
  ('Mandelberg',                'Mittelwihr',        'Also extends into Beblenheim.'),
  ('Marckrain',                 'Bennwihr',          'Also extends into Sigolsheim.'),
  ('Moenchberg',                'Eichhoffen',        'Also extends into Andlau.'),
  ('Muenchberg',                'Nothalten',         null),
  ('Ollwiller',                 'Wuenheim',          null),
  ('Osterberg',                 'Ribeauvillé',       null),
  ('Pfersigberg',               'Eguisheim',         'Also extends into Wettolsheim.'),
  ('Pfingstberg',               'Orschwihr',         null),
  ('Praelatenberg',             'Kintzheim',         null),
  ('Rangen',                    'Thann',             'Also extends into Vieux-Thann.'),
  ('Rosacker',                  'Hunawihr',          null),
  ('Saering',                   'Guebwiller',        null),
  ('Schlossberg',               'Kientzheim',        'Also extends into Kaysersberg. Both are communes déléguées of Kaysersberg Vignoble since 2016.'),
  ('Schoenenbourg',             'Riquewihr',         'Also extends into Zellenberg.'),
  ('Sommerberg',                'Niedermorschwihr',  'Also extends into Katzenthal.'),
  ('Sonnenglanz',               'Beblenheim',        null),
  ('Spiegel',                   'Bergholtz',         'Also extends into Guebwiller.'),
  ('Sporen',                    'Riquewihr',         null),
  ('Steinert',                  'Pfaffenheim',       'Also extends into Westhalten.'),
  ('Steingrubler',              'Wettolsheim',       'Also extends into Wintzenheim.'),
  ('Steinklotz',                'Marlenheim',        null),
  ('Vorbourg',                  'Rouffach',          'Also extends into Westhalten.'),
  ('Wiebelsberg',               'Andlau',            null),
  ('Wineck-Schlossberg',        'Katzenthal',        'Also extends into Ammerschwihr.'),
  ('Winzenberg',                'Blienschwiller',    null),
  ('Zinnkoepfle',               'Westhalten',        'Also extends into Soultzmatt.'),
  ('Zotzenberg',                'Mittelbergheim',    null)
)
update wine_designation_members m
set commune = c.commune,
    local_note = c.note
from wine_designations d, commune c
where m.designation_id = d.id
  and d.key = 'alsace-grand-cru'
  and m.name = c.cru;

do $$
declare
  v_n int;
begin
  select count(*) into v_n
    from wine_designation_members m
    join wine_designations d on d.id = m.designation_id
   where d.key = 'alsace-grand-cru' and m.commune is not null;
  if v_n <> 51 then
    raise exception 'expected 51 alsace grand crus with a commune, got %', v_n;
  end if;

  -- 42 of the 47 communes are somebody's primary; the other 5 host cru land
  -- whose majority lies next door (they arrive as places in 20260829264100).
  select count(distinct m.commune) into v_n
    from wine_designation_members m
    join wine_designations d on d.id = m.designation_id
   where d.key = 'alsace-grand-cru';
  if v_n <> 42 then
    raise exception 'expected 42 distinct primary communes, got %', v_n;
  end if;

  -- The two re-seated crus and the two withdrawn claims.
  if not exists (
    select 1 from wine_designation_members m
      join wine_designations d on d.id = m.designation_id
     where d.key = 'alsace-grand-cru' and m.name = 'Moenchberg'
       and m.commune = 'Eichhoffen'
  ) then
    raise exception 'Moenchberg was not re-seated to Eichhoffen';
  end if;
  if not exists (
    select 1 from wine_designation_members m
      join wine_designations d on d.id = m.designation_id
     where d.key = 'alsace-grand-cru' and m.name = 'Zinnkoepfle'
       and m.commune = 'Westhalten'
  ) then
    raise exception 'Zinnkoepfle was not re-seated to Westhalten';
  end if;
  if exists (
    select 1 from wine_designation_members m
      join wine_designations d on d.id = m.designation_id
     where d.key = 'alsace-grand-cru'
       and m.name in ('Praelatenberg', 'Altenberg de Bergheim')
       and m.local_note is not null
  ) then
    raise exception 'a withdrawn multi-commune claim survived';
  end if;

  -- 20 crus cross a commune line at or above the 0.5% membership threshold.
  select count(*) into v_n
    from wine_designation_members m
    join wine_designations d on d.id = m.designation_id
   where d.key = 'alsace-grand-cru' and m.local_note is not null;
  if v_n <> 20 then
    raise exception 'expected 20 multi-commune crus, got %', v_n;
  end if;
end;
$$;
