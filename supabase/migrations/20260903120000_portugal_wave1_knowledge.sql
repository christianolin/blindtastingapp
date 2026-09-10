-- Portugal wave 1: Details content for every node the wave adds — articles,
-- principal/accessory grapes and wine styles. The eleven freguesia-defined
-- sub-regions (Douro's three, the Alentejo's eight) have no boundary, so their
-- article is the only thing the app can show for them; they get the same
-- treatment as the rest rather than a stub.

begin;

insert into wine_place_articles (
  wine_place_id, description, climate, soils, grape_varieties, wine_styles,
  key_facts, editorial_status
)
select p.id, v.description, v.climate, v.soils, v.grapes, v.styles,
       v.facts::text[], 'PUBLISHED'
from (values
  ('portugal',
   'A country with more indigenous grape varieties than almost anywhere else, and a habit of blending them. Two of its regions were demarcated before anyone else bothered — the Douro in 1756, Setúbal in 1907 — and its two great fortified wines, Port and Madeira, were built by British and Atlantic trade. The modern story is the table wine: the Douro turning its Port grapes into dry red, the Alentejo industrialising, Vinho Verde shedding its spritzy reputation, and Bairrada and the Dão quietly making some of Europe''s best-value serious wine.',
   'Atlantic in the north and west — cool, wet, green — turning sharply continental behind the coastal ranges and Mediterranean-to-arid in the south. The Douro''s schist gorge and the Alentejo''s plain are both far hotter than their latitude suggests.',
   'Granite in the north and centre, the Douro''s vertical schist, limestone and clay on the Atlantic coast at Bairrada, sand around Palmela, and the Alentejo''s schist, granite and clay-limestone. Madeira''s vineyards are volcanic basalt on terraces.',
   'Overwhelmingly indigenous: Touriga Nacional, Touriga Franca, Tinta Roriz, Baga, Castelão, Trincadeira, Alicante Bouschet and Jaen for red; Alvarinho, Loureiro, Arinto, Encruzado, Antão Vaz, Fernão Pires and the Madeira nobles for white.',
   'Fortified (Port, Madeira, Moscatel de Setúbal), full-bodied dry reds, high-acid light whites, traditional-method sparkling in Bairrada, and a long rosé tradition.',
   array['More native varieties than almost any country','Douro demarcated 1756 — among the world''s first','Blending, not varietal labelling, is the norm','Port and Madeira built on Atlantic trade'],
   130),

  ('portugal.minho',
   'The green, rainy north-west between the Douro and the Spanish border: smallholdings, granite, maize and vines that were traditionally trained high on pergolas and trees to keep the fruit off damp ground. Its wine — Vinho Verde, "green" in the sense of young rather than coloured — was for a long time a cheap, faintly fizzy commodity. That has changed. Estate Alvarinho from Monção e Melgaço and single-sub-region Loureiro now show a region that can make serious, precise Atlantic white.',
   'Maritime Atlantic: mild, very wet (up to 1,500 mm a year on the coast), with a long, cool ripening season. Inland valleys behind the hills are warmer and drier.',
   'Granite, and soils weathered from it — sandy, acidic and free-draining, giving the wines their taut, saline edge.',
   'Alvarinho, Loureiro, Arinto (locally Pedernã), Trajadura, Avesso and Azal for white; Vinhão (Sousão) and Espadeiro for the traditional reds and rosés.',
   'Dry whites of high acidity and low alcohol, ranging from featherweight blends to concentrated, ageworthy Alvarinho; sharp purple-black reds; increasingly, traditional-method sparkling.',
   array['Nine sub-regions across 37 concelhos','Granite and heavy Atlantic rainfall','Alvarinho at its best in Monção e Melgaço','"Verde" means young, not green'],
   10),

  ('portugal.douro',
   'A gorge of hand-built schist terraces climbing hundreds of metres from the river, cut off from the Atlantic by the Marão and Montemuro ranges and blazingly hot in summer. Demarcated in 1756 — the third such delimitation in the world and the first with a proper regulatory body — it exists because of Port, but its future is at least as much about dry red and white Douro, which now uses the same old mixed-variety vineyards to different ends.',
   'Continental and extreme, sheltered from Atlantic rain by the Marão. Summers over 40 °C, cold winters; rainfall falls steeply from west (Baixo Corgo, ~900 mm) to east (Douro Superior, ~450 mm).',
   'Pre-Cambrian schist, vertically bedded so vine roots can drive deep for water — the single most important fact about the region. Granite intrudes at the margins.',
   'Touriga Nacional, Touriga Franca, Tinta Roriz, Tinta Barroca, Tinto Cão and Sousão for red; Rabigato, Viosinho, Gouveio, Malvasia Fina and Códega do Larinho for white.',
   'Port in every style (Ruby, Reserve, LBV, Vintage, Tawny with indication of age, Colheita, White), plus structured dry reds and, increasingly, mineral white Douro from high, cool sites.',
   array['Demarcated 1756 — among the world''s first','Vertically bedded schist terraces','UNESCO World Heritage cultural landscape','Three sub-regions: Baixo Corgo, Cima Corgo, Douro Superior'],
   20),

  ('portugal.dao',
   'A granite plateau ringed by mountains — the Caramulo to the west, the Serra da Estrela to the east — which shelter it from both Atlantic rain and continental extremes. Vineyards sit in clearings among pine and eucalyptus at 400–800 m. Long the victim of a co-operative monopoly that made dull, oxidised wine, the Dão has been transformed since the 1990s into the source of Portugal''s most elegant reds: fragrant, firm and slow to open.',
   'Temperate with a strong altitude effect: warm days, cold nights, and mountain shelter from the sea. Winters are cold and wet, summers dry.',
   'Granite, thin and sandy, with schist in the south-east around Seia. Poor and free-draining, which keeps yields naturally low.',
   'Touriga Nacional (which almost certainly originated here), Jaen, Alfrocheiro and Tinta Roriz for red; Encruzado above all for white, with Bical, Malvasia Fina and Cercial.',
   'Perfumed, medium-bodied reds with fine tannin and real ageing capacity — the "Burgundy of Portugal" comparison is about restraint, not weight — and textural, oak-friendly Encruzado whites.',
   array['Granite plateau at 400–800 m','Sheltered by the Caramulo and Serra da Estrela','Probable birthplace of Touriga Nacional','Encruzado — arguably Portugal''s best white'],
   30),

  ('portugal.bairrada',
   'A low, damp strip between the Atlantic and the hills, closer to the sea than any other serious Portuguese red region, where clay and limestone replace the granite and schist of the interior. Bairrada means "place of clay". It is the country''s sparkling-wine heartland and the home of Baga — a grape so tannic and late-ripening that it divides the region between those who tame it and those who let it be difficult. Roast suckling pig is the local pairing, and it is not a coincidence.',
   'Maritime: cool, wet and Atlantic-exposed, with real vintage variation and a genuine risk that late-ripening Baga does not ripen at all.',
   'Heavy clay over limestone — "bairro" clay — with sandier patches near the coast. The clay holds water and gives the reds their structure.',
   'Baga for red, with Touriga Nacional and Alfrocheiro increasingly permitted; Maria Gomes (Fernão Pires), Bical and Arinto for white and sparkling.',
   'Tannic, high-acid, long-lived Baga reds; crisp whites; and a large traditional-method sparkling industry — Portugal''s oldest, dating to the 1890s.',
   array['Clay over limestone, close to the Atlantic','Baga: tannic, acidic, very long-lived','Portugal''s sparkling-wine heartland since the 1890s','Eight concelhos between Aveiro and Coimbra'],
   40),

  ('portugal.peninsula-de-setubal',
   'The land south of the Tagus, between the Sado estuary and the Serra da Arrábida: flat sandy plains inland and a limestone ridge on the coast. It gave Portugal its second demarcated region, in 1907, for the fortified Moscatel de Setúbal — a wine macerated on its skins for months after fortification, which is why it smells of orange peel rather than grapes. The dry wines are built on Castelão, which is at its best here on pure sand.',
   'Mediterranean with a strong maritime influence from the two estuaries and the Atlantic; hot, dry summers moderated by sea breezes.',
   'Deep sand on the plain around Palmela — where ungrafted old Castelão still survives, phylloxera being unable to move through it — and clay-limestone on the Arrábida slopes.',
   'Castelão above all, with Touriga Nacional, Aragonez, Syrah and Cabernet Sauvignon; Moscatel Graúdo and the rare Moscatel Roxo for the fortified wines, plus Fernão Pires and Arinto.',
   'Fortified Moscatel de Setúbal, aged for years in cask; firm, savoury Castelão reds; dry whites; and a significant volume of modern, internationally styled red.',
   array['Demarcated 1907 — Portugal''s second','Moscatel de Setúbal: fortified, then skin-macerated','Ungrafted Castelão on deep sand at Palmela','The Arrábida limestone ridge on the coast'],
   50),

  ('portugal.alentejo',
   'A third of Portugal — vast, hot, thinly populated wheat-and-cork country east and south of Lisbon, where vineyards are large, mechanised and irrigated in a way that would be impossible further north. It supplies more wine to the Portuguese themselves than anywhere else. The DO is not one block but eight named sub-regions scattered across the plain and up into the hills at Portalegre, where altitude and old field blends make something quite different from the rich, soft, oaky reds the region is known for.',
   'Hot Mediterranean turning continental inland: long, dry, 40 °C summers, mild winters, and low rainfall — irrigation is legal and widespread. Portalegre, at 800 m in the Serra de São Mamede, is markedly cooler.',
   'Varied: schist and granite in the north and east, clay-limestone around Borba and Estremoz (the marble belt), and sandier soils in the south.',
   'Aragonez (Tinta Roriz), Trincadeira, Alicante Bouschet, Castelão, Touriga Nacional and Syrah for red; Antão Vaz, Arinto, Roupeiro (Síria) and increasingly Alvarinho for white.',
   'Ripe, soft, generous reds with oak; full-bodied whites that need acid support; and the surviving talha tradition — wine fermented and aged in clay amphorae, a Roman practice never quite lost here.',
   array['Eight sub-regions, from the plain to 800 m at Portalegre','Portugal''s largest-selling wine region at home','Alicante Bouschet found its best home here','Vinho de talha — amphora wine, still made'],
   60),

  ('portugal.madeira',
   'A volcanic island 900 km south-west of Lisbon whose wine is defined by an accident: barrels carried as ballast across the tropics came back better than they left. The industry then reproduced the heat deliberately — estufagem for the everyday wines, canteiro (years in cask in warm lofts) for the finest. The result is a wine that is effectively indestructible, keeping for months once opened and for centuries in bottle. Vineyards are tiny terraced plots on impossibly steep slopes, most of them worked by hand.',
   'Subtropical Atlantic: mild all year, humid on the north coast, sunnier and drier on the south. The mountainous interior forces vineyards onto terraces between sea level and about 800 m.',
   'Volcanic basalt, weathered to fertile reddish soils, on hand-built stone terraces (poios).',
   'Tinta Negra for the bulk of production; the noble varieties Sercial, Verdelho, Boal, Malvasia (Malmsey) and the rare Terrantez for the classic styles.',
   'Fortified wine across the full sweetness range from bone-dry Sercial to rich Malmsey, heated by estufagem or aged by canteiro; plus a small quantity of dry table wine under DO Madeirense.',
   array['Heated deliberately — estufagem and canteiro','Effectively indestructible once opened','Tinta Negra is ~4/5 of the vineyard','Terraced volcanic basalt, largely hand-worked'],
   70),

  ('portugal.minho.vinho-verde',
   'The DO covering the whole Minho: 37 concelhos and nine sub-regions, from the Spanish border to the Douro''s north bank. Rules permit dry white, red, rosé and sparkling, but the reputation rests on white — either an inexpensive blend at 9–11% with a touch of CO2, or, at the top, a varietal Alvarinho or Loureiro with no spritz at all and the concentration to age.',
   null, null,
   'Alvarinho, Loureiro, Arinto (Pedernã), Trajadura, Avesso, Azal; Vinhão and Espadeiro for red and rosé.',
   'Light, high-acid dry whites; serious varietal Alvarinho and Loureiro; sharp, deeply coloured reds; traditional-method sparkling.',
   array['Portugal''s largest DO by area','Nine sub-regions, 37 concelhos','Sub-region on the label signals ambition','Minimum alcohol as low as 8% for some styles'],
   110),

  ('portugal.douro.porto',
   'Fortified wine from the Douro — grape spirit added mid-fermentation, which stops it and leaves the wine sweet and around 20% alcohol. The style ladder runs from Ruby and Reserve through Late Bottled Vintage to Vintage, declared only in the best years and bottled after two years to age for decades in bottle; and separately through the oxidative Tawnies with indication of age (10, 20, 30, 40 years) and single-vintage Colheita. Ageing happens largely in Vila Nova de Gaia, across the river from Porto.',
   null, null,
   'The same Douro field blend as the table wines: Touriga Nacional, Touriga Franca, Tinta Roriz, Tinta Barroca, Tinto Cão, Sousão.',
   'Ruby, Reserve, LBV, Vintage and Single Quinta Vintage; Tawny with indication of age, Colheita; White and Rosé Port.',
   array['Fortified mid-fermentation to ~20% abv','Vintage declared only in exceptional years','Tawny ages oxidatively in cask; Vintage reductively in bottle','Aged mostly in Vila Nova de Gaia'],
   210),

  ('portugal.douro.douro',
   'The unfortified DO, sharing the Port region''s territory and often its vines. Once a sideline made from what Port did not need, it became the region''s prestige project from the 1990s: dark, structured reds from old mixed plantings, and — from the coolest, highest sites — taut whites that few people expected the Douro could make.',
   null, null,
   'Touriga Nacional, Touriga Franca, Tinta Roriz and old field blends for red; Rabigato, Viosinho, Gouveio and Códega do Larinho for white.',
   'Full-bodied, structured dry reds; increasingly fine, mineral dry whites; some rosé.',
   array['Same demarcated area as Port','Old mixed field blends prized over monovarietals','High-altitude whites are the newest success','Prestige reds date mostly from the 1990s'],
   220),

  ('portugal.dao.dao',
   'The DO of the granite plateau, covering 16 concelhos across the districts of Viseu, Guarda and Coimbra. Reds must be blends or varietals from the region''s own grapes, with Touriga Nacional leading; Encruzado dominates the serious whites. Reserva and Garrafeira designations demand extra ageing.',
   null, null,
   'Touriga Nacional, Jaen, Alfrocheiro, Tinta Roriz; Encruzado, Bical, Malvasia Fina, Cercial.',
   'Elegant, firm, ageworthy reds; textural whites; a little sparkling and rosé.',
   array['16 concelhos on granite at 400–800 m','Touriga Nacional-led red blends','Encruzado for the top whites','Reserva and Garrafeira carry ageing rules'],
   310),

  ('portugal.bairrada.bairrada',
   'Demarcated in 1979 after decades in which its wine was legally absorbed into other regions'' blends. Baga was once required at 50% or more of a red; the rules have loosened, which split the region between modernists adding Touriga Nacional and traditionalists — the "Baga Friends" among them — who insist the grape only needs old vines, patience and a light hand.',
   null, null,
   'Baga, with Touriga Nacional, Alfrocheiro, Camarate and Castelão permitted; Maria Gomes (Fernão Pires), Bical, Arinto, Cercial and Rabo de Ovelha for white.',
   'Tannic, high-acid reds built to age; crisp dry whites; and traditional-method espumante in white and rosé.',
   array['Demarcated 1979','Baga no longer compulsory at 50%','Espumante is a major part of production','Águeda, Anadia, Aveiro, Cantanhede, Coimbra, Mealhada, Oliveira do Bairro, Vagos'],
   410),

  ('portugal.peninsula-de-setubal.setubal',
   'The 1907 DO for fortified Moscatel. Fermentation is stopped with grape spirit, then — uniquely — the skins are left steeping in the fortified wine for several months, extracting the orange-peel, tea and dried-apricot character that separates it from every other Muscat. Ages in cask for years; the 20-year and older bottlings go dark and treacly without losing their perfume. Moscatel Roxo bottlings are rarer and finer-boned.',
   null, null,
   'Moscatel Graúdo (Muscat of Alexandria), at least 67%; Moscatel Roxo for the separate designation.',
   'Fortified sweet wine, typically 5, 10 or 20 years old, plus single-vintage bottlings.',
   array['Demarcated 1907','Skins macerate in the fortified wine for months','Orange peel, dried apricot, tea','Moscatel Roxo is the rare, finer version'],
   510),

  ('portugal.peninsula-de-setubal.palmela',
   'The unfortified DO of the sandy plain, requiring at least two-thirds Castelão. Ungrafted old vines survive here because phylloxera cannot travel through pure sand, and the resulting reds — raspberry, dried herb, tobacco, firm acid — age far longer than their price suggests.',
   null, null,
   'Castelão (minimum 66.7%), with Touriga Nacional, Aragonez, Trincadeira and Syrah; Fernão Pires, Arinto, Moscatel Graúdo and Vital for white.',
   'Medium- to full-bodied Castelão reds, dry whites and rosés.',
   array['At least two-thirds Castelão','Ungrafted old vines survive in deep sand','Palmela in full plus parts of Montijo and Setúbal','Long-lived for the money'],
   520),

  ('portugal.alentejo.alentejo',
   'The DO, as distinct from the much larger Vinho Regional Alentejano that surrounds it: eight named sub-regions, each with its own delimited freguesias, which may be named on the label after "Alentejo". Reds dominate, and the house style — ripe, soft, oaked, immediately likeable — made the region Portugal''s domestic bestseller. Portalegre is the outlier, cooler and higher, with old field blends that taste nothing like the plain.',
   null, null,
   'Aragonez, Trincadeira, Alicante Bouschet, Castelão, Touriga Nacional, Syrah; Antão Vaz, Arinto, Roupeiro.',
   'Ripe, generous reds; full-bodied whites; talha wine fermented in clay amphorae.',
   array['Eight sub-regions may be named on the label','Distinct from the wider Vinho Regional Alentejano','Portalegre is the cool, high-altitude exception','Talha (amphora) tradition survives'],
   610),

  ('portugal.madeira.madeira',
   'The fortified DO. Everyday wine is heated by estufagem — three months at up to 50 °C — while the best is aged by canteiro, years in cask in a warm loft with no artificial heat at all. Style names traditionally track the noble grapes from driest to sweetest: Sercial, Verdelho, Boal, Malmsey. Wines labelled by grape must contain at least 85% of it; those without a grape name are almost always Tinta Negra.',
   null, null,
   'Tinta Negra; Sercial, Verdelho, Boal, Malvasia (Malmsey), Terrantez.',
   'Fortified wine from bone-dry to lusciously sweet, at 3, 5, 10, 15, 20, 30 and 40 years, plus Colheita and Frasqueira (vintage) bottlings.',
   array['Estufagem (heated) vs canteiro (naturally aged)','Grape name requires 85% of that variety','Frasqueira: vintage, minimum 20 years in cask','Survives months open — the acidity is the preservative'],
   710),

  ('portugal.madeira.madeirense',
   'The island''s dry table-wine DO, created in 1999 and still tiny. The same terraces and volcanic soil produce light, high-acid reds and whites, most of them drunk on Madeira itself — the fortified wine takes the good fruit and almost all the attention.',
   null, null,
   'Tinta Negra, Touriga Nacional, Merlot and Syrah for red; Verdelho, Arnsburger, Sercial and Terrantez for white.',
   'Light, fresh, high-acid dry reds, whites and rosés.',
   array['Created 1999','Unfortified — the counterpart to DO Madeira','Very small production, mostly consumed locally','Same terraced volcanic vineyards'],
   720)
) as v(key, description, climate, soils, grapes, styles, facts, so)
join wine_places p on p.canonical_key = v.key;

-- Sub-regions. Short by design: what distinguishes it, and why you would care.
insert into wine_place_articles (wine_place_id, description, key_facts, editorial_status)
select p.id, v.description, v.facts::text[], 'PUBLISHED'
from (values
  ('portugal.minho.moncao-e-melgaco',
   'The far north-east corner of the Minho, on the Spanish border along the Minho river, shielded from the Atlantic by the Serra da Peneda. Warmer and drier than the rest of the region, and the only sub-region where Alvarinho can be bottled as a varietal Vinho Verde at full ripeness. The benchmark for serious Portuguese Alvarinho.',
   array['Monção and Melgaço','Sheltered, warmest sub-region','Alvarinho''s home ground','Granite soils above the Minho river']),
  ('portugal.minho.lima',
   'The Lima valley running inland from Viana do Castelo — open to the sea, cool and very wet. Loureiro country: floral, low-alcohol and razor-fresh.',
   array['Viana do Castelo, Ponte de Lima, Ponte da Barca, Arcos de Valdevez','Cool and Atlantic-exposed','Loureiro at its most perfumed']),
  ('portugal.minho.cavado',
   'The Cávado basin around Braga and Barcelos, running from the coast at Esposende up into the Gerês mountains. Blends of Loureiro and Trajadura dominate.',
   array['Esposende, Barcelos, Braga, Vila Verde, Amares, Terras de Bouro','Coast to mountain in 50 km','Loureiro and Trajadura blends']),
  ('portugal.minho.ave',
   'The most densely populated and industrial corner of the region, between Guimarães and the coast at Póvoa de Varzim. Loureiro and Trajadura on granite, at high volume.',
   array['Ten concelhos including Guimarães and Vila do Conde','Largest sub-region by number of concelhos','Loureiro-led blends']),
  ('portugal.minho.basto',
   'Inland and mountainous, in the Tâmega''s upper valley — the coolest, most marginal part of the region. Azal dominates, giving sharp, low-alcohol wine.',
   array['Cabeceiras de Basto, Celorico de Basto, Mondim de Basto, Ribeira de Pena','Coolest and most marginal','Azal country']),
  ('portugal.minho.sousa',
   'The Sousa valley south-east of Porto, sheltered and comparatively warm, straddling the granite between the Douro and the Tâmega. Avesso and Azal ripen well here.',
   array['Paços de Ferreira, Paredes, Lousada, Felgueiras, Penafiel','Sheltered inland valley','Avesso and Azal']),
  ('portugal.minho.amarante',
   'Inland along the Tâmega, warm and continental by Minho standards. Reds are more important here than almost anywhere else in the region.',
   array['Amarante and Marco de Canaveses','Warm, continental for the Minho','A red-wine stronghold within Vinho Verde']),
  ('portugal.minho.baiao',
   'The southern edge of the region on the Douro''s north bank, effectively a transition zone into the Douro. Avesso''s heartland: riper, fuller and lower in acid than coastal Vinho Verde.',
   array['Baião, Resende, Cinfães','On the Douro''s north bank','Avesso''s home — riper, fuller whites']),
  ('portugal.minho.paiva',
   'The smallest sub-region, on the Paiva river where it meets the Douro. Warm and sheltered; Avesso and Azal again, in tiny quantity.',
   array['Castelo de Paiva','Smallest of the nine sub-regions','Warm, sheltered, Avesso-led']),

  ('portugal.douro.baixo-corgo',
   'The westernmost and coolest third of the Douro, downstream of the Corgo around Peso da Régua. The wettest part of the region and the most densely planted, historically supplying the volume for Ruby and basic Tawny rather than the great Vintage wines.',
   array['Around Peso da Régua, west of the Corgo','Wettest and coolest sub-region (~900 mm)','Most densely planted','Traditionally the source of everyday Port']),
  ('portugal.douro.cima-corgo',
   'The heart of the region, upstream of the Corgo around Pinhão and São João da Pesqueira, where most of the famous quintas sit. Warmer and drier than the Baixo Corgo, and the source of most Vintage Port and the best dry Douro reds.',
   array['Around Pinhão and São João da Pesqueira','Home to most of the great quintas','Source of most Vintage Port','The classic terraced landscape']),
  ('portugal.douro.douro-superior',
   'The remote eastern third, from Cachão da Valeira to the Spanish border — the hottest, driest and least planted part of the region, impassable by boat until the Valeira gorge was blasted in 1780. Flatter land allows mechanisation, and it has been the main direction of new planting.',
   array['East of the Valeira gorge to the Spanish border','Hottest and driest (~450 mm)','Least planted; most new development','Flat enough to mechanise']),

  ('portugal.alentejo.portalegre',
   'The high, cool outlier in the Serra de São Mamede on the Spanish border, up to 800 m — granite, schist, more rain, old ungrafted field blends and a fresher, more perfumed style that has become the Alentejo''s critical darling.',
   array['Portalegre, Castelo de Vide, Crato, Marvão, Sousel','Up to 800 m in the Serra de São Mamede','Old ungrafted field blends','The cool, fine-boned Alentejo']),
  ('portugal.alentejo.borba',
   'The marble belt: clay-limestone soils around Borba, Estremoz and Vila Viçosa, where quarries cut white marble out of the same rock the vines grow on. Structured reds with unusual freshness for the region.',
   array['Borba, Estremoz, Vila Viçosa, Alandroal, Elvas, Monforte','Clay-limestone — the marble belt','Fresher, firmer reds','One of the region''s largest sub-regions']),
  ('portugal.alentejo.redondo',
   'A schist and granite amphitheatre at the foot of the Serra d''Ossa, sheltered enough to ripen reliably. Soft, well-coloured reds with a long co-operative tradition.',
   array['Redondo, with parts of Alandroal and Évora','Sheltered by the Serra d''Ossa','Schist and granite','Strong co-operative history']),
  ('portugal.alentejo.reguengos',
   'The plain around Reguengos de Monsaraz and the Alqueva reservoir — hot, flat and the Alentejo''s largest producer by volume, with several of its best-known estates.',
   array['Reguengos de Monsaraz, with parts of Évora and Redondo','Largest sub-region by volume','Hot, flat, beside the Alqueva reservoir','Home to the region''s biggest names']),
  ('portugal.alentejo.evora',
   'A small sub-region around the walled city of Évora, with a documented winemaking history back to Roman times and a strong surviving talha (amphora) tradition.',
   array['Évora, with parts of Arraiolos and Montemor-o-Novo','Roman winemaking history','Talha — clay amphora — tradition','Small and largely estate-based']),
  ('portugal.alentejo.vidigueira',
   'South of the Serra do Mendro, which acts as a climatic wall: the land drops and the wind shifts, giving nights that are cooler than the latitude suggests. The classic talha wines come from here.',
   array['Vidigueira, Cuba, Alvito','Below the Serra do Mendro escarpment','Cooler nights than the plain','The heartland of talha wine']),
  ('portugal.alentejo.granja-amareleja',
   'The hottest corner of Portugal, on the Spanish border by the Guadiana — schist so hard that vines are planted in blasted holes, in a landscape that regularly passes 45 °C.',
   array['Parts of Moura and Mourão','The hottest place in Portugal','Hard schist; vines planted in blasted rock','Very low yields']),
  ('portugal.alentejo.moura',
   'Clay-limestone soils around Moura and Serpa in the deep south-east, warm and low-lying, producing soft, full reds.',
   array['Parts of Moura and Serpa','Clay-limestone in the deep south-east','Warm, low-lying','Soft, full-bodied reds'])
) as v(key, description, facts)
join wine_places p on p.canonical_key = v.key;

-- Principal and accessory grapes.
insert into wine_place_grapes (wine_place_id, grape_id, role, permitted, local_note, editorial_status)
select p.id, g.id, v.role::wine_grape_role, true, v.note, 'PUBLISHED'
from (values
  ('portugal.minho', 'Alvarinho',   'PRINCIPAL', null),
  ('portugal.minho', 'Loureiro',    'PRINCIPAL', null),
  ('portugal.minho', 'Arinto',      'PRINCIPAL', 'Called Pedernã in the Minho.'),
  ('portugal.minho', 'Trajadura',   'ACCESSORY', null),
  ('portugal.minho', 'Avesso',      'ACCESSORY', null),
  ('portugal.minho', 'Azal',        'ACCESSORY', null),
  ('portugal.minho', 'Sousão',      'ACCESSORY', 'Called Vinhão in the Minho, where it makes the traditional black-red.'),
  ('portugal.minho', 'Espadeiro',   'ACCESSORY', null),
  ('portugal.douro', 'Touriga Nacional', 'PRINCIPAL', null),
  ('portugal.douro', 'Touriga Franca',   'PRINCIPAL', null),
  ('portugal.douro', 'Tinta Roriz',      'PRINCIPAL', null),
  ('portugal.douro', 'Tinta Barroca',    'PRINCIPAL', null),
  ('portugal.douro', 'Tinto Cão',        'PRINCIPAL', null),
  ('portugal.douro', 'Sousão',           'ACCESSORY', null),
  ('portugal.douro', 'Rabigato',         'ACCESSORY', null),
  ('portugal.douro', 'Viosinho',         'ACCESSORY', null),
  ('portugal.douro', 'Gouveio',          'ACCESSORY', null),
  ('portugal.douro', 'Malvasia Fina',    'ACCESSORY', null),
  ('portugal.douro', 'Códega do Larinho','ACCESSORY', null),
  ('portugal.dao', 'Touriga Nacional', 'PRINCIPAL', 'Almost certainly originated in the Dão.'),
  ('portugal.dao', 'Jaen',             'PRINCIPAL', null),
  ('portugal.dao', 'Alfrocheiro',      'PRINCIPAL', null),
  ('portugal.dao', 'Tinta Roriz',      'ACCESSORY', null),
  ('portugal.dao', 'Encruzado',        'PRINCIPAL', null),
  ('portugal.dao', 'Malvasia Fina',    'ACCESSORY', null),
  ('portugal.dao', 'Bical',            'ACCESSORY', null),
  ('portugal.bairrada', 'Baga',         'PRINCIPAL', null),
  ('portugal.bairrada', 'Fernão Pires', 'PRINCIPAL', 'Called Maria Gomes in the Bairrada.'),
  ('portugal.bairrada', 'Bical',        'PRINCIPAL', null),
  ('portugal.bairrada', 'Arinto',       'ACCESSORY', null),
  ('portugal.bairrada', 'Touriga Nacional', 'ACCESSORY', null),
  ('portugal.peninsula-de-setubal', 'Castelão',        'PRINCIPAL', 'Long sold as Periquita; ungrafted old vines survive on the sand.'),
  ('portugal.peninsula-de-setubal', 'Moscatel Graúdo', 'PRINCIPAL', 'Muscat of Alexandria — the grape of Moscatel de Setúbal.'),
  ('portugal.peninsula-de-setubal', 'Moscatel Roxo',   'ACCESSORY', null),
  ('portugal.peninsula-de-setubal', 'Fernão Pires',    'ACCESSORY', null),
  ('portugal.peninsula-de-setubal', 'Arinto',          'ACCESSORY', null),
  ('portugal.peninsula-de-setubal', 'Touriga Nacional','ACCESSORY', null),
  ('portugal.alentejo', 'Tinta Roriz',       'PRINCIPAL', 'Called Aragonez in the Alentejo.'),
  ('portugal.alentejo', 'Trincadeira',       'PRINCIPAL', null),
  ('portugal.alentejo', 'Alicante Bouschet', 'PRINCIPAL', null),
  ('portugal.alentejo', 'Castelão',          'ACCESSORY', null),
  ('portugal.alentejo', 'Touriga Nacional',  'ACCESSORY', null),
  ('portugal.alentejo', 'Antão Vaz',         'PRINCIPAL', null),
  ('portugal.alentejo', 'Arinto',            'PRINCIPAL', null),
  ('portugal.alentejo', 'Síria',             'ACCESSORY', 'Called Roupeiro in the Alentejo.'),
  ('portugal.madeira', 'Tinta Negra', 'PRINCIPAL', 'Around four-fifths of the island''s vineyard.'),
  ('portugal.madeira', 'Sercial',     'PRINCIPAL', 'The dry style.'),
  ('portugal.madeira', 'Verdelho',    'PRINCIPAL', 'The medium-dry style.'),
  ('portugal.madeira', 'Boal',        'PRINCIPAL', 'The medium-sweet style; Bual in English.'),
  ('portugal.madeira', 'Malvasia',    'PRINCIPAL', 'The sweet style; Malmsey in English.'),
  ('portugal.madeira', 'Terrantez',   'ACCESSORY', 'Nearly extinct after phylloxera; slowly being replanted.')
) as v(key, grape, role, note)
join wine_places p on p.canonical_key = v.key
join grapes g on g.name = v.grape;

-- Styles.
insert into wine_place_styles (wine_place_id, style, note, sort_order, editorial_status)
select p.id, v.style::wine_style_kind, v.note, v.so, 'PUBLISHED'
from (values
  ('portugal.minho', 'WHITE', 'High-acid, low-alcohol dry whites, from light blends to concentrated Alvarinho.', 10),
  ('portugal.minho', 'RED', 'Deeply coloured, tart Vinhão — an acquired taste, drunk locally from bowls.', 20),
  ('portugal.minho', 'ROSE', 'Pale, sharp Espadeiro rosé.', 30),
  ('portugal.minho', 'SPARKLING', 'A growing traditional-method category.', 40),
  ('portugal.douro', 'FORTIFIED', 'Port in every style, from Ruby to forty-year-old Tawny.', 10),
  ('portugal.douro', 'RED', 'Structured dry Douro reds from the same vineyards.', 20),
  ('portugal.douro', 'WHITE', 'Mineral whites from the highest, coolest sites.', 30),
  ('portugal.dao', 'RED', 'Perfumed, firm, ageworthy Touriga Nacional-led blends.', 10),
  ('portugal.dao', 'WHITE', 'Textural Encruzado, often barrel-fermented.', 20),
  ('portugal.bairrada', 'RED', 'Tannic, high-acid Baga built for long ageing.', 10),
  ('portugal.bairrada', 'SPARKLING', 'Traditional-method espumante — the region''s oldest speciality.', 20),
  ('portugal.bairrada', 'WHITE', 'Crisp Bical and Maria Gomes.', 30),
  ('portugal.peninsula-de-setubal', 'FORTIFIED', 'Moscatel de Setúbal, skin-macerated after fortification.', 10),
  ('portugal.peninsula-de-setubal', 'RED', 'Savoury Castelão from deep sand.', 20),
  ('portugal.peninsula-de-setubal', 'WHITE', 'Dry whites from Fernão Pires and Arinto.', 30),
  ('portugal.alentejo', 'RED', 'Ripe, soft, generous reds — Portugal''s domestic bestseller.', 10),
  ('portugal.alentejo', 'WHITE', 'Full-bodied Antão Vaz blends, acid-corrected with Arinto.', 20),
  ('portugal.madeira', 'FORTIFIED', 'Heated by estufagem or aged by canteiro; dry Sercial to sweet Malmsey.', 10),
  ('portugal.madeira', 'WHITE', 'Small quantities of dry table white under DO Madeirense.', 20),
  ('portugal.madeira', 'RED', 'Light, high-acid dry reds under DO Madeirense.', 30)
) as v(key, style, note, so)
join wine_places p on p.canonical_key = v.key;

do $$
declare n int;
begin
  select count(*) into n from wine_place_articles a
  join wine_places p on p.id = a.wine_place_id where p.canonical_key like 'portugal%';
  if n <> 38 then raise exception 'expected 38 portugal articles, got %', n; end if;

  select count(*) into n from wine_place_grapes wg
  join wine_places p on p.id = wg.wine_place_id where p.canonical_key like 'portugal%';
  if n <> 51 then raise exception 'expected 51 portugal grape links, got %', n; end if;

  -- A missing grape name would silently drop its row in the join above, so the
  -- count guard is the check; assert the colours too, since a null colour
  -- breaks the varietal filters.
  select count(*) into n from wine_place_grapes wg
  join wine_places p on p.id = wg.wine_place_id
  join grapes g on g.id = wg.grape_id
  where p.canonical_key like 'portugal%' and g.color is null;
  if n <> 0 then raise exception '% portugal grape links point at a colourless grape', n; end if;
end $$;

commit;
