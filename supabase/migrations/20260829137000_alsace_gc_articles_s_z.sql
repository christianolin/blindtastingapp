-- Alsace Grand Cru articles, part 3 (S-Z, 16 crus). Completes all 51.
-- Insert-only with guards; re-run no-op.
insert into wine_place_articles
  (wine_place_id, description, climate, soils, key_facts, editorial_status)
select p.id, v.descr, v.climate, v.soils, array[v.fact1, v.fact2], 'PUBLISHED'
from (values
  ('saering',
   'Guebwiller''s ring hill, marl-sandstone below Kessler and Kitterle - citrus-bright Riesling from the Schlumberger slopes.',
   'Open, breezy lower slope.',
   'Marl with sandstone.',
   'Riesling-led among the Guebwiller crus', 'Part of the great Schlumberger holdings'),
  ('schlossberg',
   'The castle hill of Kientzheim and Kaysersberg: the FIRST grand cru (1975), pure granite, Riesling of soaring precision.',
   'Steep, terraced, sun-rich.',
   'Deep two-mica granite sand.',
   'Alsace''s first grand cru (1975)', 'Weinbach''s Rieslings made it famous'),
  ('schoenenbourg',
   'Riquewihr''s beautiful hill, gypsum-veined marl above the postcard town - Voltaire once owned vines; Riesling rules.',
   'Sheltered, warm slope.',
   'Keuper marl with gypsum.',
   'Voltaire was a proprietor', 'Strong vendanges-tardives tradition'),
  ('sommerberg',
   'Niedermorschwihr''s summer hill: granite slopes at 45% worked by hand - nervy, saline Riesling (Albert Boxler).',
   'Steep south-facing granite.',
   'Two-mica granite.',
   'Slopes reach 45% gradient', 'Boxler''s Rieslings are the reference'),
  ('sonnenglanz',
   'The sunshine hill of Beblenheim - gentle marl-limestone where Pinot Gris and Gewurztraminer turn honeyed and serene.',
   'Warm, gentle east slope.',
   'Marl-limestone.',
   'Pinot Gris is the signature', 'One of the first classified sites (1935 attempt)'),
  ('spiegel',
   'The mirror of Bergholtz and Guebwiller: marl-sandstone giving suave, reflective Gewurztraminer and Riesling.',
   'Mild, even exposure.',
   'Marl with sandstone.',
   'Suave, harmonious styles', 'Bridges the Guebwiller cru chain'),
  ('sporen',
   'Riquewihr''s clay-marl bowl - heavy, slow soil famous for Gewurztraminer of depth (Hugel''s historic ground).',
   'Warm hollow beside Schoenenbourg.',
   'Deep clay-marl.',
   'Historic Hugel Gewurztraminer terroir', 'Rich soil, long-lived wines'),
  ('steinert',
   'Pfaffenheim''s stony hill of pure limestone - Pinot Gris of unusual firmness and smoke.',
   'Dry mid-southern sector.',
   'Bare oolitic limestone.',
   'Pinot Gris excels on naked limestone', 'The name means stony ground'),
  ('steingrubler',
   'Wettolsheim''s stone-quarry hill: marl-limestone-sandstone above the plain - well-cut Gewurztraminer and Riesling.',
   'Sunny, moderate slope.',
   'Marl-limestone with sandstone.',
   'Balanced Gewurztraminer country', 'Overlooks the Colmar plain'),
  ('steinklotz',
   'The stone block of Marlenheim, northernmost grand cru, on hard limestone - and historic red-wine country too.',
   'Northern gateway of the Route des Vins.',
   'Hard muschelkalk limestone.',
   'The northernmost of the 51', 'Marlenheim is old Pinot Noir country'),
  ('vorbourg',
   'Rouffach and Westhalten''s fore-castle: limestone-sandstone in the driest sector, crowned by Clos Saint-Landelin (Mure).',
   'Rain-shadow dry, sunny.',
   'Limestone with sandstone.',
   'Contains Clos Saint-Landelin (Mure)', 'Also noted for Pinot Noir within the clos'),
  ('wiebelsberg',
   'Andlau''s sandstone hill - pure Vosges sandstone giving airy, floral, finely-drawn Riesling.',
   'Light, fast-draining slope.',
   'Pink Vosges sandstone.',
   'Pure-sandstone Riesling', 'Sister slope to schist Kastelberg'),
  ('wineck-schlossberg',
   'Katzenthal''s castle-crag amphitheatre, granite under the Wineck tower - delicate, mountain-fresh Riesling.',
   'Sheltered granite bowl.',
   'Granite sand.',
   'Granite Riesling under a castle ruin', 'A quiet, high-quality corner'),
  ('winzenberg',
   'Blienschwiller''s vintners'' hill: granite once more, small and neat - lifted, floral Riesling.',
   'Mid-Bas-Rhin sun trap.',
   'Two-mica granite.',
   'Compact granite cru', 'Floral, precise Riesling'),
  ('zinnkoepfle',
   'The sun-summit of Soultzmatt and Westhalten, at 420 m the HIGHEST grand cru - Mediterranean flora, saline Gewurztraminer.',
   'High, dry Vallee Noble - protected by two Vosges spurs.',
   'Shell limestone and sandstone.',
   'Highest of the 51 (to ~420 m)', 'Dry enough for wild orchids and lizards'),
  ('zotzenberg',
   'Mittelbergheim''s bowl of marl-limestone - the one grand cru whose decree admits SYLVANER, its historic speciality.',
   'Gentle saddle exposure.',
   'Marl-limestone.',
   'The only grand cru allowing Sylvaner (2005)', 'Mittelbergheim is a Sylvaner citadel')
) as v(slug, descr, climate, soils, fact1, fact2)
join wine_places p on p.canonical_key = 'france.alsace.' || v.slug
where not exists (select 1 from wine_place_articles a where a.wine_place_id = p.id);

do $$
declare v_a int;
begin
  select count(*) into v_a from wine_place_articles a
    join wine_places p on p.id = a.wine_place_id
   where p.canonical_key like 'france.alsace%';
  if v_a <> 52 then
    raise exception 'expected 52 alsace articles (region + 51 crus), got %', v_a;
  end if;
end $$;
