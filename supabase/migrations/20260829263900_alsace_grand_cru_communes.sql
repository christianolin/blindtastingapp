-- Communes for the 51 Alsace Grand Crus.
--
-- Every Alsace grand cru lies in a named commune, but we held none: the library
-- table showed an empty column and the map parented all 51 straight to the
-- region, with no village level (unlike Burgundy and Champagne).
--
-- A grand cru is an appellation in its own right and several straddle more than
-- one commune. We store ONE primary commune — the seat used for parenting and
-- for the table column — and record any others in local_note, since a place can
-- only have one parent on the map.
with commune(cru, commune, also) as (values
  ('Altenberg de Bergbieten',   'Bergbieten',        null),
  ('Altenberg de Bergheim',     'Bergheim',          'Saint-Hippolyte'),
  ('Altenberg de Wolxheim',     'Wolxheim',          null),
  ('Brand',                     'Turckheim',         null),
  ('Bruderthal',                'Molsheim',          null),
  ('Eichberg',                  'Eguisheim',         null),
  ('Engelberg',                 'Dahlenheim',        'Scharrachbergheim'),
  ('Florimont',                 'Ingersheim',        'Katzenthal'),
  ('Frankstein',                'Dambach-la-Ville',  null),
  ('Froehn',                    'Zellenberg',        null),
  ('Furstentum',                'Kientzheim',        'Sigolsheim'),
  ('Geisberg',                  'Ribeauvillé',       null),
  ('Gloeckelberg',              'Rodern',            'Saint-Hippolyte'),
  ('Goldert',                   'Gueberschwihr',     null),
  ('Hatschbourg',               'Hattstatt',         'Voegtlinshoffen'),
  ('Hengst',                    'Wintzenheim',       null),
  ('Kaefferkopf',               'Ammerschwihr',      null),
  ('Kanzlerberg',               'Bergheim',          null),
  ('Kastelberg',                'Andlau',            null),
  ('Kessler',                   'Guebwiller',        null),
  ('Kirchberg de Barr',         'Barr',              null),
  ('Kirchberg de Ribeauvillé',  'Ribeauvillé',       null),
  ('Kitterlé',                  'Guebwiller',        null),
  ('Mambourg',                  'Sigolsheim',        null),
  ('Mandelberg',                'Mittelwihr',        'Beblenheim'),
  ('Marckrain',                 'Bennwihr',          'Sigolsheim'),
  ('Moenchberg',                'Andlau',            'Eichhoffen'),
  ('Muenchberg',                'Nothalten',         null),
  ('Ollwiller',                 'Wuenheim',          null),
  ('Osterberg',                 'Ribeauvillé',       null),
  ('Pfersigberg',               'Eguisheim',         'Wettolsheim'),
  ('Pfingstberg',               'Orschwihr',         null),
  ('Praelatenberg',             'Kintzheim',         'Orschwiller'),
  ('Rangen',                    'Thann',             'Vieux-Thann'),
  ('Rosacker',                  'Hunawihr',          null),
  ('Saering',                   'Guebwiller',        null),
  ('Schlossberg',               'Kientzheim',        'Kaysersberg'),
  ('Schoenenbourg',             'Riquewihr',         'Zellenberg'),
  ('Sommerberg',                'Niedermorschwihr',  'Katzenthal'),
  ('Sonnenglanz',               'Beblenheim',        null),
  ('Spiegel',                   'Bergholtz',         'Guebwiller'),
  ('Sporen',                    'Riquewihr',         null),
  ('Steinert',                  'Pfaffenheim',       'Westhalten'),
  ('Steingrubler',              'Wettolsheim',       null),
  ('Steinklotz',                'Marlenheim',        null),
  ('Vorbourg',                  'Rouffach',          'Westhalten'),
  ('Wiebelsberg',               'Andlau',            null),
  ('Wineck-Schlossberg',        'Katzenthal',        'Ammerschwihr'),
  ('Winzenberg',                'Blienschwiller',    null),
  -- Stored without the accent in wine_designation_members.
  ('Zinnkoepfle',               'Soultzmatt',        'Westhalten'),
  ('Zotzenberg',                'Mittelbergheim',    null)
)
update wine_designation_members m
set commune = c.commune,
    local_note = coalesce(
      m.local_note,
      case when c.also is not null
        then 'Also extends into ' || c.also || '.'
      end
    )
from wine_designations d, commune c
where m.designation_id = d.id
  and d.key = 'alsace-grand-cru'
  and m.name = c.cru;
