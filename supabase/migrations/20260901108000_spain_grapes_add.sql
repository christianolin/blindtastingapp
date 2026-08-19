-- Spanish grape varieties for the wine-map knowledge chips. Idempotent
-- (where-not-exists), mirrors the Italian *_grapes_add.sql pattern. These are
-- the principal native grapes of the live Spanish DOs that the shared `grapes`
-- library was missing; Tempranillo, Garnacha, Albariño, Mencía, Verdejo,
-- Graciano and Malvasia already exist. Also fixes Graciano's null colour.

begin;

insert into grapes (name, color, skin_color, description, main_regions)
select v.name, v.color, v.skin, v.descr, v.regions
from (values
  ('Monastrell', 'RED', 'blue-black',
   'Spain''s Mediterranean powerhouse (Mourvèdre in France) — thick-skinned and heat-loving, giving dense, dark, high-alcohol reds in the sun-baked hills of Murcia.',
   'Murcia & Alicante (Jumilla, Yecla, Bullas)'),
  ('Bobal', 'RED', 'blue-black',
   'A deeply coloured, high-acid native of the Levante; long used for bulk rosado, now increasingly bottled as fresh, characterful old-vine reds.',
   'Valencia & Castilla-La Mancha (Utiel-Requena, Manchuela)'),
  ('Airén', 'WHITE', 'green',
   'One of the world''s most-planted grapes, blanketing La Mancha — hardy and drought-resistant, giving neutral, easy whites and much of Spain''s brandy base.',
   'Castilla-La Mancha (La Mancha, Valdepeñas)'),
  ('Palomino', 'WHITE', 'golden',
   'The base grape of Sherry — a fairly neutral Andalucían white whose magic comes from flor, oxidative ageing and the solera, not the grape itself.',
   'Andalucía (Jerez, Condado de Huelva)'),
  ('Pedro Ximénez', 'WHITE', 'golden',
   '"PX" — sun-dried into raisins to make intensely sweet, treacle-dark fortified wines; central to Montilla-Moriles, Málaga and sweet Sherry.',
   'Andalucía (Jerez, Málaga, Montilla-Moriles)'),
  ('Moscatel', 'WHITE', 'golden',
   'Moscatel de Alejandría — grapey, floral and aromatic, sun-dried for sweet Málaga and Sherry Moscatel and grown all along the Mediterranean.',
   'Andalucía & Valencia'),
  ('Godello', 'WHITE', 'green',
   'A revived Galician white of real class — mineral, citrus and stone fruit with texture, at its best in Valdeorras and Ribeira Sacra.',
   'Galicia (Valdeorras, Ribeira Sacra)'),
  ('Treixadura', 'WHITE', 'green',
   'The backbone of Ribeiro whites — apple and white-flower aromas over a balanced, gently structured palate.',
   'Galicia (Ribeiro)'),
  ('Cariñena', 'RED', 'blue-black',
   'Mazuelo in Rioja, Samsó in Catalonia, Carignan in France — high in acid and tannin, lending colour and grip, and a star of old-vine Priorat and Montsant.',
   'Aragón, Cataluña & La Rioja'),
  ('Xarel·lo', 'WHITE', 'green',
   'Catalonia''s most characterful white — the structural, age-worthy heart of Cava and of still Penedès whites.',
   'Cataluña (Penedès, Alella)'),
  ('Parellada', 'WHITE', 'green',
   'A delicate, floral Catalan white grown at altitude; the fresh, aromatic lift in the classic Cava trio.',
   'Cataluña (Penedès, Conca de Barberà)'),
  ('Viura', 'WHITE', 'green',
   'Rioja''s principal white (Macabeo elsewhere) — subtle and fresh when young, capable of remarkable complexity with barrel age.',
   'La Rioja & Aragón'),
  ('Garnacha Blanca', 'WHITE', 'golden',
   'The white mutation of Garnacha — full-bodied, low-acid and textural, important in Terra Alta and across Aragón and Catalonia.',
   'Aragón & Cataluña (Terra Alta)'),
  ('Prieto Picudo', 'RED', 'blue-black',
   'A native of León giving deeply coloured, fresh reds and lively rosados, traditionally made by the "madreo" method.',
   'Castilla y León (Tierra de León)'),
  ('Trepat', 'RED', 'blue-black',
   'A Catalan speciality of Conca de Barberà, prized for pale, delicate, aromatic rosados and light reds.',
   'Cataluña (Conca de Barberà)')
) as v(name, color, skin, descr, regions)
where not exists (select 1 from grapes g where g.name = v.name);

update grapes set color = 'RED' where name = 'Graciano' and color is null;

do $$
declare v int;
begin
  select count(*) into v from grapes where name in (
    'Monastrell','Bobal','Airén','Palomino','Pedro Ximénez','Moscatel','Godello',
    'Treixadura','Cariñena','Xarel·lo','Parellada','Viura','Garnacha Blanca',
    'Prieto Picudo','Trepat');
  if v <> 15 then raise exception 'expected 15 Spanish grapes present, got %', v; end if;
end $$;

commit;
