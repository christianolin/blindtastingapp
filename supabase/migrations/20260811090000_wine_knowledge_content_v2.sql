-- Phase 3K content v2: fills out every remaining thin entry (owner brief
-- 2026-07-22 "fill out all information for existing appellations"). The 11
-- rule-stub Vosne climats and 7 premier-cru group nodes get real editorial
-- text, and every Burgundy cru article gains climate/soils. Rows are already
-- PUBLISHED, so the new text is live on apply.

update wine_place_articles a set
  description = v.description,
  soils = v.soils,
  key_facts = v.facts
from (values
  ('france.bourgogne.cote-de-nuits.vosne-romanee.premier-cru.au-dessus-des-malconsorts',
   'The high, cool shelf above Aux Malconsorts at the Nuits boundary — taut, red-fruited Vosne that has gained real polish in warmer vintages.',
   'Thin white marl over hard rock.',
   array['Upslope neighbour of Aux Malconsorts']),
  ('france.bourgogne.cote-de-nuits.vosne-romanee.premier-cru.aux-brulees',
   'A sun-catching climat in the fold above the village — "the burnt ones". Smoky, dark, powerful Vosne with a long Jayer-family association.',
   'Stony clay-limestone in a warm crease of the slope.',
   array['Name refers to sun-scorched soils', 'Henri Jayer farmed vines here']),
  ('france.bourgogne.cote-de-nuits.vosne-romanee.premier-cru.aux-malconsorts',
   'Vosne''s southern flagship premier cru, sharing a wall with La Tâche — grand cru depth wrapped in the village''s velvet.',
   'Deep marl over limestone, perfectly mid-slope.',
   array['Borders La Tâche', 'Among Vosne''s most expensive premiers crus']),
  ('france.bourgogne.cote-de-nuits.vosne-romanee.premier-cru.aux-raignots',
   'Steep, stony climat directly above La Romanée — chiselled, mineral wine that unwinds slowly.',
   'Very thin soil over fractured rock.',
   array['Sits directly above La Romanée']),
  ('france.bourgogne.cote-de-nuits.vosne-romanee.premier-cru.clos-des-reas',
   'A fully walled monopole at the village''s southern edge — supple, rose-scented, quietly classic Vosne.',
   'Deeper clay low on the slope.',
   array['Monopole of Domaine Michel Gros', 'Completely walled clos']),
  ('france.bourgogne.cote-de-nuits.vosne-romanee.premier-cru.en-orveaux',
   'Forest-edge climat in the combe above Échezeaux — cool, airy, redcurrant-fresh Vosne.',
   'Stony limestone at altitude.',
   array['Lies in Flagey-Échezeaux, like the grands crus below it']),
  ('france.bourgogne.cote-de-nuits.vosne-romanee.premier-cru.la-croix-rameau',
   'A pocket-sized climat enclosed within Romanée-Saint-Vivant — grand cru land in all but name, some argue.',
   'Shares Saint-Vivant''s deeper clay-limestone.',
   array['Enclave inside Romanée-Saint-Vivant''s footprint']),
  ('france.bourgogne.cote-de-nuits.vosne-romanee.premier-cru.les-chaumes',
   'The band directly below La Tâche towards the road — generous, supple, early-drinking Vosne.',
   'Deeper, warmer soils at the slope''s foot.',
   array['Directly downslope of La Tâche']),
  ('france.bourgogne.cote-de-nuits.vosne-romanee.premier-cru.les-gaudichots',
   'The historic climat from which much of La Tâche was assembled in the 1930s — the remaining slivers show an unmistakable family resemblance.',
   'As La Tâche: thin, stony, mid-slope.',
   array['Most of it was absorbed into La Tâche']),
  ('france.bourgogne.cote-de-nuits.vosne-romanee.premier-cru.les-petis-monts',
   'High above Richebourg on the thinnest of soils — floral, fine-boned, alpine-fresh Vosne.',
   'Shallow scree at the top of the slope.',
   array['Directly above Richebourg']),
  ('france.bourgogne.cote-de-nuits.vosne-romanee.premier-cru.les-rouges',
   'High climat towards Échezeaux, named for its iron-red earth — cool-toned, vivid, energetic wine in warm years.',
   'Iron-tinged red soil over limestone.',
   array['Named for its iron-red soils'])
) as v(key, description, soils, facts)
join wine_places p on p.canonical_key = v.key
where a.wine_place_id = p.id;

update wine_place_articles a set
  description = v.description,
  key_facts = v.facts
from (values
  ('france.bourgogne.cote-de-nuits.fixin.premier-cru',
   'Fixin''s handful of sturdy premiers crus on the slope above the village — Clos du Chapitre, Clos Napoléon and Les Hervelets lead them.',
   array['Includes Clos du Chapitre and Clos Napoléon']),
  ('france.bourgogne.cote-de-nuits.gevrey-chambertin.premier-cru',
   'Gevrey''s premier cru band — twenty-six climats from the Combe de Lavaux hillside to Clos Saint-Jacques, which many rank beside the grands crus.',
   array['26 climats', 'Clos Saint-Jacques trades at grand cru prices']),
  ('france.bourgogne.cote-de-nuits.morey-saint-denis.premier-cru',
   'Twenty small climats threaded between and above Morey''s walled grands crus — Les Ruchots, Clos de la Bussière and Les Millandes among them.',
   array['20 climats between the grands crus']),
  ('france.bourgogne.cote-de-nuits.chambolle-musigny.premier-cru',
   'Chambolle''s premiers crus are led by Les Amoureuses — "the lovers", trading at grand cru prices — with Les Charmes close behind.',
   array['Les Amoureuses is the Côte''s most celebrated premier cru']),
  ('france.bourgogne.cote-de-nuits.vougeot.premier-cru',
   'A small band of climats between the château wall and the village — Le Clos Blanc de Vougeot has grown white grapes since the Cistercians planted it.',
   array['Le Clos Blanc has been white since monastic times']),
  ('france.bourgogne.cote-de-nuits.vosne-romanee.premier-cru',
   'Vosne''s fourteen mapped premiers crus ring the grands crus — several, like Malconsorts, Suchots, Beaux Monts and Cros Parantoux, are of near-grand-cru standing.',
   array['14 climats mapped here', 'Several trade at grand cru prices']),
  ('france.bourgogne.cote-de-nuits.nuits-saint-georges.premier-cru',
   'The Côte''s deepest premier cru bench: forty-one climats in two halves — Vosne-side finesse to the north of town, Les Saint-Georges power to the south.',
   array['41 climats in two distinct halves', 'Les Saint-Georges leads the south'])
) as v(key, description, facts)
join wine_places p on p.canonical_key = v.key
where a.wine_place_id = p.id;

-- Family climate and soils for every Burgundy cru article still missing them
-- (grand crus, groups and climats inherit their village's slope conditions).
update wine_place_articles a set climate = v.climate
from (values
  ('france.bourgogne.cote-de-nuits.fixin', 'Continental with a cooler northern edge.'),
  ('france.bourgogne.cote-de-nuits.gevrey-chambertin', 'Continental; the Combe de Lavaux funnels cool air across the upper crus.'),
  ('france.bourgogne.cote-de-nuits.morey-saint-denis', 'Continental, well sheltered mid-slope.'),
  ('france.bourgogne.cote-de-nuits.chambolle-musigny', 'Continental; a narrow combe keeps the high crus fresh.'),
  ('france.bourgogne.cote-de-nuits.vougeot', 'Continental; low-slope warmth off the plain.'),
  ('france.bourgogne.cote-de-nuits.vosne-romanee', 'Continental; a flawless east-facing slope, frost-safe at mid-height.'),
  ('france.bourgogne.cote-de-nuits.nuits-saint-georges', 'Continental; drier in the lee of the hills.')
) as v(prefix, climate)
join wine_places p on p.canonical_key like v.prefix || '.%'
where a.wine_place_id = p.id and a.climate is null;

update wine_place_articles a set soils = v.soils
from (values
  ('france.bourgogne.cote-de-nuits.fixin', 'Deep marl and limestone scree.'),
  ('france.bourgogne.cote-de-nuits.gevrey-chambertin', 'Brown marls and limestone, deeper clay on the flats.'),
  ('france.bourgogne.cote-de-nuits.morey-saint-denis', 'Limestone with thin red clay.'),
  ('france.bourgogne.cote-de-nuits.chambolle-musigny', 'The Côte''s highest limestone content, with little clay.'),
  ('france.bourgogne.cote-de-nuits.vougeot', 'Gravelly mid-slope grading to heavier clay by the road.'),
  ('france.bourgogne.cote-de-nuits.vosne-romanee', 'Limestone under varying depths of clay and marl.'),
  ('france.bourgogne.cote-de-nuits.nuits-saint-georges', 'Deeper clay north of town; stonier, thinner soils south.')
) as v(prefix, soils)
join wine_places p on p.canonical_key like v.prefix || '.%'
where a.wine_place_id = p.id and a.soils is null;

-- Every verified place must now have a complete overview: description,
-- climate and soils, with no rule-stub text remaining.
do $$
declare v_bad int;
begin
  select count(*) into v_bad
    from wine_places p
    join wine_place_articles a on a.wine_place_id = p.id
   where p.publication_status = 'VERIFIED'
     and (a.description is null
          or a.climate is null
          or a.soils is null
          or a.description like '%labelled Vosne-Romanée 1er Cru%');
  if v_bad <> 0 then
    raise exception 'knowledge v2: % verified places still incomplete', v_bad;
  end if;
end $$;
