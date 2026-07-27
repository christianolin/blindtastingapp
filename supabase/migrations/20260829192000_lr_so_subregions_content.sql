-- Languedoc-Roussillon + Sud-Ouest — sub-region content (v1, published).
-- Articles only (grapes/styles live on the AOCs).
insert into wine_place_articles
  (wine_place_id, description, climate, soils, key_facts, editorial_status)
select p.id, v.descr, v.climate, v.soils, array[v.fact], 'PUBLISHED'
from (values
  ('france.languedoc-roussillon.languedoc', 'France''s biggest vineyard - garrigue-scented GSM reds from Corbières to Pic Saint-Loup, Picpoul by the lagoons, the Muscats and Limoux''s sparklers.', 'Mediterranean; hot, dry, Tramontane-swept.', 'Schist, limestone, galets and alluvium - hugely varied.', '43 AOCs from Nîmes to the Aude.'),
  ('france.languedoc-roussillon.roussillon', 'French Catalonia - Grenache country in the Pyrénées'' foothills: Collioure and the great Vins Doux Naturels of Banyuls, Maury and Rivesaltes.', 'Mediterranean; France''s sunniest, driest corner.', 'Black and brown schist, gneiss and granite terraces.', 'VDN heartland; 13 AOCs.'),
  ('france.sud-ouest.bergeracois', 'The Dordogne''s Bordeaux-in-miniature - Bergerac reds, Monbazillac''s botrytis sweets and the Montravel tiers, plus neighbouring Duras.', 'Oceanic, warming inland along the Dordogne.', 'Clay-limestone plateaux and mist-prone valley slopes.', 'Bordeaux varieties; 9 AOCs.'),
  ('france.sud-ouest.garonne-tarn', 'The middle rivers - Cahors'' Malbec on the Lot, Gaillac''s ancient Tarn vineyard, Fronton''s Négrette and the Garonne co-op country.', 'Oceanic with Mediterranean echoes up the Tarn.', 'Causse limestone, river terraces and boulbènes.', 'Old indigenous grapes; 8 AOCs.'),
  ('france.sud-ouest.gascogne', 'The Adour hills - Madiran''s Tannat, Pacherenc''s Manseng whites, Saint-Mont and Tursan.', 'Oceanic Gascon; Pyrenean föhn ripens late harvests.', 'Clay-limestone and fawn sands.', 'Tannat country; 4 AOCs.'),
  ('france.sud-ouest.pyrenees', 'The mountain vineyards - Jurançon''s Manseng sweets and drys, Basque Irouléguy, Béarn.', 'Oceanic-montane; south-facing terraces catch the föhn.', 'Poudingue conglomerate, ophite and steep terraced clays.', 'Manseng + Tannat; 3 AOCs.')
) as v(ck, descr, climate, soils, fact)
join wine_places p on p.canonical_key = v.ck
where not exists (select 1 from wine_place_articles a where a.wine_place_id = p.id);

do $$
declare v_a int;
begin
  select count(*) into v_a from wine_place_articles a join wine_places p on p.id = a.wine_place_id
   where p.kind = 'SUBREGION'
     and (p.canonical_key like 'france.languedoc-roussillon.%' or p.canonical_key like 'france.sud-ouest.%');
  if v_a <> 6 then raise exception 'expected 6 LR/SO subregion articles, got %', v_a; end if;
end;
$$;
