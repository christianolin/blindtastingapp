-- 20260914120917_italy_missing_appellations
--
-- Italy: add the 148 official DOCG / DOC / IGT denominations that have no
-- appellation row. The owner asked on 2026-09-13, after a Bolgheri Sassicaia
-- scan found nothing: "If we are missing appellations in database, fix it".
--
-- Built by .superpowers/appellation-audit/build-italy-draft.mjs from
-- italy-compare.json and the live re-check in italy-missing-recheck.json.
--
-- WHAT COUNTS AS OFFICIAL. The source is the EU register (eAmbrosia: Italy,
-- wine, not removed). It holds 411 PDOs (79 DOCG, 332 DOC) and 111 PGIs (IGT),
-- 522 in all. The list was cross-checked against the MASAF DOP and IGP lists
-- and Federdoc's 2025 booklet. 374 of the 522 already have a row: 350 exactly,
-- 23 as a spelling, prefix, tier or former-name variant, and 1 under another
-- region. The other 148 have none: 11 DOCG, 90 DOC and 47 IGT.
--
-- WHY THEY ARE REALLY MISSING. Each was searched live across every region and
-- country with three checks:
--   - f_unaccent ILIKE on every registered name and synonym;
--   - pg_trgm similarity above 0.4, with and without the designation word;
--   - folded-token containment.
-- Every near hit was one of four things:
--   - a different official denomination (Barbera del Monferrato DOC is not
--     Barbera del Monferrato Superiore DOCG);
--   - a Barolo or Barbaresco MGA (Castellero, San Lorenzo);
--   - a sub-zone row;
--   - a foreign row.
-- None was a stored copy of a missing denomination.
--
-- BOLGHERI SASSICAIA IS NOT IN THIS FILE. It was already stored under Toscana
-- with the right tier, but as "DOC Bolgheri Sassicaia": the designation sat in
-- front of the name, a form the suffix-based resolver cannot read.
-- 20260914114217_appellation_prefix_designations renamed it in place to
-- "Bolgheri Sassicaia DOC", and "DOC Etna" to "Etna DOC". That file runs
-- before this one; neither depends on the other. The other prefix-named rows
-- need merges, which are left to the owner: italy-followups.md.
--
-- CONVENTIONS KEPT
--   Name: the EU-registered spelling plus ONE trailing designation word,
--     "<Name> DOCG|DOC|IGT", the form fold.ts DESIGNATION_SUFFIXES expects.
--     Registered accents are kept (Cirò Classico, Girò di Cagliari, San Torpè,
--     Val Polcèvera, Arghillà). These become the first accented Italian rows;
--     search and every check below ignore accents.
--   Home: the single administrative region, under its stored name (Sardinia,
--     Emilia Romagna, Trentino Alto Adige). A denomination that spans regions
--     goes under the region row named after it or its family, as all 12
--     stored cross-region denominations do:
--       - Lison DOCG under Lison-Pramaggiore;
--       - Valdadige Terradeiforti DOC under Valdadige;
--       - Alto Livenza IGT (Veneto and Friuli Venezia Giulia) under a new
--         "Alto Livenza" region row, as Vin de France got in 20260829212000.
--   Map: map_status stays PENDING and wine_place_id stays null, as on every
--     stored Italian appellation and region row. Italy has wine_places
--     catalog entries, but no Italian reference row links to one yet.
--   Lazio 17, Lombardia 17, Puglia 13, Toscana 13, Calabria 12, Piemonte 11,
--   Sardinia 10, Emilia Romagna 9, Sicilia 9, Veneto 9, Umbria 6, Campania 4,
--   Abruzzo 3, Liguria 3, Marche 3, Basilicata 2, Molise 2, Alto Livenza 1,
--   Friuli Venezia Giulia 1, Lison-Pramaggiore 1, Trentino Alto Adige 1,
--   Valdadige 1.
--
-- ONE REVIEWED NEAR-DUPLICATE. Emilia-Romagna DOC (PDO-IT-02770, protected
-- 2021-04-28) goes in beside the stored "Emilia Romagna IGT". That row matches
-- no official IGT; the region-wide IGT is Emilia, stored as Emilia IGT. The
-- near-duplicate guard allows this one pair and no other.
--
-- SAFETY. The file only inserts. It is idempotent: a row is skipped when its
-- home region already holds a name that folds to the same text
-- (f_search_norm). If only part of the list is already present, the file
-- refuses to run. Every check runs in the same transaction as the inserts.
-- There is no begin or commit in the file, because the runner owns the
-- transaction.
--
-- FRESH REPLAY. supabase/migrations creates only six of the home regions:
-- Piemonte, Toscana, Veneto, Sicilia, Campania and Puglia (20260710113358).
-- Alto Livenza is created here. The other 15 come from
-- scripts/import-lwin.mjs. When none of those 15 exists, step 1b skips the
-- file with a notice and inserts nothing; the rows then need a manual rerun
-- of this block after the import. If only some of the 15 exist, step 2
-- still raises.

do $italy$
declare
  v_src constant jsonb := $src$[
    {"file":"PDO-IT-A0742","region":"Abruzzo","name":"Terre Tollesi DOCG"},
    {"file":"PDO-IT-03209","region":"Calabria","name":"Cirò Classico DOCG"},
    {"file":"PDO-IT-A0457","region":"Lison-Pramaggiore","name":"Lison DOCG"},
    {"file":"PDO-IT-A0949","region":"Lombardia","name":"Scanzo DOCG"},
    {"file":"PDO-IT-A1397","region":"Piemonte","name":"Barbera del Monferrato Superiore DOCG"},
    {"file":"PDO-IT-02810","region":"Piemonte","name":"Canelli DOCG"},
    {"file":"PDO-IT-A1319","region":"Piemonte","name":"Dolcetto di Ovada Superiore DOCG"},
    {"file":"PDO-IT-A1262","region":"Toscana","name":"Val di Cornia Rosso DOCG"},
    {"file":"PDO-IT-A0467","region":"Veneto","name":"Bagnoli Friularo DOCG"},
    {"file":"PDO-IT-A0453","region":"Veneto","name":"Colli di Conegliano DOCG"},
    {"file":"PDO-IT-A0470","region":"Veneto","name":"Recioto di Gambellara DOCG"},
    {"file":"PDO-IT-A1184","region":"Abruzzo","name":"Ortona DOC"},
    {"file":"PDO-IT-A0528","region":"Basilicata","name":"Grottino di Roccanova DOC"},
    {"file":"PDO-IT-A0530","region":"Basilicata","name":"Terre dell'Alta Val d'Agri DOC"},
    {"file":"PDO-IT-A0605","region":"Calabria","name":"Bivongi DOC"},
    {"file":"PDO-IT-A0617","region":"Calabria","name":"Greco di Bianco DOC"},
    {"file":"PDO-IT-A0629","region":"Calabria","name":"S. Anna di Isola Capo Rizzuto DOC"},
    {"file":"PDO-IT-A0242","region":"Campania","name":"Castel San Lorenzo DOC"},
    {"file":"PDO-IT-A0280","region":"Campania","name":"Penisola Sorrentina DOC"},
    {"file":"PDO-IT-A0287","region":"Emilia Romagna","name":"Bosco Eliceo DOC"},
    {"file":"PDO-IT-A0292","region":"Emilia Romagna","name":"Colli di Parma DOC"},
    {"file":"PDO-IT-A0305","region":"Emilia Romagna","name":"Colli di Scandiano e di Canossa DOC"},
    {"file":"PDO-IT-02770","region":"Emilia Romagna","name":"Emilia-Romagna DOC"},
    {"file":"PDO-IT-A0342","region":"Emilia Romagna","name":"Lambrusco Salamino di Santa Croce DOC"},
    {"file":"PDO-IT-A0506","region":"Emilia Romagna","name":"Reno DOC"},
    {"file":"PDO-IT-A0905","region":"Friuli Venezia Giulia","name":"Friuli Annia DOC"},
    {"file":"PDO-IT-A0689","region":"Lazio","name":"Aleatico di Gradoli DOC"},
    {"file":"PDO-IT-A0691","region":"Lazio","name":"Aprilia DOC"},
    {"file":"PDO-IT-A0694","region":"Lazio","name":"Bianco Capena DOC"},
    {"file":"PDO-IT-A0696","region":"Lazio","name":"Cerveteri DOC"},
    {"file":"PDO-IT-A0701","region":"Lazio","name":"Colli Albani DOC"},
    {"file":"PDO-IT-A0703","region":"Lazio","name":"Colli Etruschi Viterbesi DOC"},
    {"file":"PDO-IT-A0751","region":"Lazio","name":"Genazzano DOC"},
    {"file":"PDO-IT-A0753","region":"Lazio","name":"Marino DOC"},
    {"file":"PDO-IT-A0757","region":"Lazio","name":"Montecompatri Colonna DOC"},
    {"file":"PDO-IT-A0758","region":"Lazio","name":"Nettuno DOC"},
    {"file":"PDO-IT-A0760","region":"Lazio","name":"Tarquinia DOC"},
    {"file":"PDO-IT-A0762","region":"Lazio","name":"Velletri DOC"},
    {"file":"PDO-IT-A0763","region":"Lazio","name":"Vignanello DOC"},
    {"file":"PDO-IT-A0764","region":"Lazio","name":"Zagarolo DOC"},
    {"file":"PDO-IT-A0354","region":"Liguria","name":"Colline di Levanto DOC"},
    {"file":"PDO-IT-A0356","region":"Liguria","name":"Pornassio DOC"},
    {"file":"PDO-IT-A0359","region":"Liguria","name":"Val Polcèvera DOC"},
    {"file":"PDO-IT-A1104","region":"Lombardia","name":"Botticino DOC"},
    {"file":"PDO-IT-A1124","region":"Lombardia","name":"Capriano del Colle DOC"},
    {"file":"PDO-IT-A0974","region":"Lombardia","name":"Casteggio DOC"},
    {"file":"PDO-IT-A1108","region":"Lombardia","name":"Cellatica DOC"},
    {"file":"PDO-IT-A1070","region":"Lombardia","name":"Garda Colli Mantovani DOC"},
    {"file":"PDO-IT-A1054","region":"Lombardia","name":"San Colombano al Lambro DOC"},
    {"file":"PDO-IT-A1358","region":"Lombardia","name":"Terre del Colleoni DOC"},
    {"file":"PDO-IT-A0432","region":"Marche","name":"I Terreni di Sanseverino DOC"},
    {"file":"PDO-IT-A0451","region":"Marche","name":"Serrapetrona DOC"},
    {"file":"PDO-IT-A0479","region":"Marche","name":"Terre di Offida DOC"},
    {"file":"PDO-IT-A0684","region":"Molise","name":"Pentro di Isernia DOC"},
    {"file":"PDO-IT-A1066","region":"Piemonte","name":"Albugnano DOC"},
    {"file":"PDO-IT-A1118","region":"Piemonte","name":"Calosso DOC"},
    {"file":"PDO-IT-A1098","region":"Piemonte","name":"Collina Torinese DOC"},
    {"file":"PDO-IT-A1106","region":"Piemonte","name":"Colline Saluzzesi DOC"},
    {"file":"PDO-IT-A1183","region":"Piemonte","name":"Gabiano DOC"},
    {"file":"PDO-IT-A1232","region":"Piemonte","name":"Pinerolese DOC"},
    {"file":"PDO-IT-A1238","region":"Piemonte","name":"Strevi DOC"},
    {"file":"PDO-IT-A1243","region":"Piemonte","name":"Valsusa DOC"},
    {"file":"PDO-IT-A0540","region":"Puglia","name":"Aleatico di Puglia DOC"},
    {"file":"PDO-IT-A0541","region":"Puglia","name":"Alezio DOC"},
    {"file":"PDO-IT-A0542","region":"Puglia","name":"Barletta DOC"},
    {"file":"PDO-IT-A0546","region":"Puglia","name":"Colline Joniche Tarantine DOC"},
    {"file":"PDO-IT-A0548","region":"Puglia","name":"Galatina DOC"},
    {"file":"PDO-IT-A0552","region":"Puglia","name":"Locorotondo DOC"},
    {"file":"PDO-IT-A0553","region":"Puglia","name":"Martina DOC"},
    {"file":"PDO-IT-A0554","region":"Puglia","name":"Matino DOC"},
    {"file":"PDO-IT-A0558","region":"Puglia","name":"Orta Nova DOC"},
    {"file":"PDO-IT-A0561","region":"Puglia","name":"Ostuni DOC"},
    {"file":"PDO-IT-A0566","region":"Puglia","name":"Rosso di Cerignola DOC"},
    {"file":"PDO-IT-A0569","region":"Puglia","name":"Squinzano DOC"},
    {"file":"PDO-IT-A0570","region":"Puglia","name":"Tavoliere delle Puglie DOC"},
    {"file":"PDO-IT-A0906","region":"Sardinia","name":"Arborea DOC"},
    {"file":"PDO-IT-A1122","region":"Sardinia","name":"Girò di Cagliari DOC"},
    {"file":"PDO-IT-A0909","region":"Sardinia","name":"Moscato di Sorso-Sennori DOC"},
    {"file":"PDO-IT-A0779","region":"Sicilia","name":"Erice DOC"},
    {"file":"PDO-IT-A0793","region":"Sicilia","name":"Riesi DOC"},
    {"file":"PDO-IT-A0797","region":"Sicilia","name":"Sambuca di Sicilia DOC"},
    {"file":"PDO-IT-A0798","region":"Sicilia","name":"Santa Margherita di Belice DOC"},
    {"file":"PDO-IT-A0800","region":"Sicilia","name":"Sciacca DOC"},
    {"file":"PDO-IT-A1337","region":"Toscana","name":"Bianco dell'Empolese DOC"},
    {"file":"PDO-IT-A1377","region":"Toscana","name":"Candia dei Colli Apuani DOC"},
    {"file":"PDO-IT-A1379","region":"Toscana","name":"Capalbio DOC"},
    {"file":"PDO-IT-A1384","region":"Toscana","name":"Colli dell'Etruria Centrale DOC"},
    {"file":"PDO-IT-A1400","region":"Toscana","name":"Grance Senesi DOC"},
    {"file":"PDO-IT-A1451","region":"Toscana","name":"Parrina DOC"},
    {"file":"PDO-IT-A1488","region":"Toscana","name":"San Torpè DOC"},
    {"file":"PDO-IT-A1491","region":"Toscana","name":"Terratico di Bibbona DOC"},
    {"file":"PDO-IT-A1493","region":"Toscana","name":"Terre di Casole DOC"},
    {"file":"PDO-IT-A1512","region":"Toscana","name":"Valdinievole DOC"},
    {"file":"PDO-IT-A0748","region":"Trentino Alto Adige","name":"Casteller DOC"},
    {"file":"PDO-IT-A0838","region":"Umbria","name":"Colli Altotiberini DOC"},
    {"file":"PDO-IT-A0847","region":"Umbria","name":"Rosso Orvietano DOC"},
    {"file":"PDO-IT-A0475","region":"Valdadige","name":"Valdadige Terradeiforti DOC"},
    {"file":"PDO-IT-A0466","region":"Veneto","name":"Bagnoli di Sopra DOC"},
    {"file":"PDO-IT-A0456","region":"Veneto","name":"Corti Benedettine del Padovano DOC"},
    {"file":"PDO-IT-A0440","region":"Veneto","name":"Merlara DOC"},
    {"file":"PDO-IT-A0471","region":"Veneto","name":"Riviera del Brenta DOC"},
    {"file":"PGI-IT-02874","region":"Abruzzo","name":"Terre Abruzzesi IGT"},
    {"file":"PGI-IT-A0864","region":"Alto Livenza","name":"Alto Livenza IGT"},
    {"file":"PGI-IT-A0662","region":"Calabria","name":"Arghillà IGT"},
    {"file":"PGI-IT-A0640","region":"Calabria","name":"Costa Viola IGT"},
    {"file":"PGI-IT-A0665","region":"Calabria","name":"Lipuda IGT"},
    {"file":"PGI-IT-A0644","region":"Calabria","name":"Locride IGT"},
    {"file":"PGI-IT-A0645","region":"Calabria","name":"Palizzi IGT"},
    {"file":"PGI-IT-A0648","region":"Calabria","name":"Pellaro IGT"},
    {"file":"PGI-IT-A0651","region":"Calabria","name":"Scilla IGT"},
    {"file":"PGI-IT-A0658","region":"Calabria","name":"Valdamato IGT"},
    {"file":"PGI-IT-A0254","region":"Campania","name":"Catalanesca del Monte Somma IGT"},
    {"file":"PGI-IT-A0256","region":"Campania","name":"Dugenta IGT"},
    {"file":"PGI-IT-A0508","region":"Emilia Romagna","name":"Castelfranco Emilia IGT"},
    {"file":"PGI-IT-A0513","region":"Emilia Romagna","name":"Fortana del Taro IGT"},
    {"file":"PGI-IT-A0529","region":"Emilia Romagna","name":"Terre di Veleja IGT"},
    {"file":"PGI-IT-A0765","region":"Lazio","name":"Anagni IGT"},
    {"file":"PGI-IT-A0767","region":"Lazio","name":"Colli Cimini IGT"},
    {"file":"PGI-IT-A0768","region":"Lazio","name":"Costa Etrusco Romana IGT"},
    {"file":"PGI-IT-A1369","region":"Lombardia","name":"Bergamasca IGT"},
    {"file":"PGI-IT-A1053","region":"Lombardia","name":"Collina del Milanese IGT"},
    {"file":"PGI-IT-A1078","region":"Lombardia","name":"Provincia di Mantova IGT"},
    {"file":"PGI-IT-A1081","region":"Lombardia","name":"Quistello IGT"},
    {"file":"PGI-IT-A1265","region":"Lombardia","name":"Ronchi di Brescia IGT"},
    {"file":"PGI-IT-A1037","region":"Lombardia","name":"Ronchi Varesini IGT"},
    {"file":"PGI-IT-A1082","region":"Lombardia","name":"Sabbioneta IGT"},
    {"file":"PGI-IT-A1069","region":"Lombardia","name":"Terre Lariane IGT"},
    {"file":"PGI-IT-A1317","region":"Lombardia","name":"Valcamonica IGT"},
    {"file":"PGI-IT-A0688","region":"Molise","name":"Rotae IGT"},
    {"file":"PGI-IT-A0789","region":"Sardinia","name":"Marmilla IGT"},
    {"file":"PGI-IT-A0791","region":"Sardinia","name":"Nurra IGT"},
    {"file":"PGI-IT-A0794","region":"Sardinia","name":"Ogliastra IGT"},
    {"file":"PGI-IT-A0796","region":"Sardinia","name":"Parteolla IGT"},
    {"file":"PGI-IT-A0799","region":"Sardinia","name":"Planargia IGT"},
    {"file":"PGI-IT-A0808","region":"Sardinia","name":"Provincia di Nuoro IGT"},
    {"file":"PGI-IT-A0815","region":"Sardinia","name":"Trexenta IGT"},
    {"file":"PGI-IT-A0804","region":"Sicilia","name":"Avola IGT"},
    {"file":"PGI-IT-A0805","region":"Sicilia","name":"Camarro IGT"},
    {"file":"PGI-IT-A0806","region":"Sicilia","name":"Fontanarossa di Cerda IGT"},
    {"file":"PGI-IT-A0811","region":"Sicilia","name":"Valle Belice IGT"},
    {"file":"PGI-IT-A1438","region":"Toscana","name":"Montecastelli IGT"},
    {"file":"PGI-IT-A1431","region":"Toscana","name":"Val di Magra IGT"},
    {"file":"PGI-IT-A0852","region":"Umbria","name":"Allerona IGT"},
    {"file":"PGI-IT-A0853","region":"Umbria","name":"Bettona IGT"},
    {"file":"PGI-IT-A0854","region":"Umbria","name":"Cannara IGT"},
    {"file":"PGI-IT-A0856","region":"Umbria","name":"Spello IGT"},
    {"file":"PGI-IT-A0519","region":"Veneto","name":"Conselvano IGT"},
    {"file":"PGI-IT-A0522","region":"Veneto","name":"Veneto Orientale IGT"}
  ]$src$::jsonb;
  v_expected constant int := 148;
  v_country uuid;
  v_n int;
  v_files int;
  v_pairs int;
  v_docg int;
  v_doc int;
  v_igt int;
  v_before int;
  v_regions_before int;
  v_already int;
  v_region_new int;
  v_region_want int;
  v_inserted int;
  v_ids uuid[];
  v_bad text;
begin
  -- 0. Italy, exactly once.
  select count(*) into v_n from public.countries where name = 'Italy';
  if v_n <> 1 then
    raise exception 'italy appellations: want one Italy country row, found %', v_n;
  end if;
  select id into v_country from public.countries where name = 'Italy';

  -- 1. The list itself:
  --    - 148 rows, 148 EU file numbers, and 148 distinct pairs of region and
  --      folded name;
  --    - a tier split of 11 / 90 / 47;
  --    - every name ends in one designation word, and none puts it in front;
  --    - the file-number kind matches the tier: PDO for DOCG and DOC, PGI for
  --      IGT.
  select count(*),
         count(distinct s.file),
         count(distinct (s.region, public.f_search_norm(s.name))),
         count(*) filter (where s.name ~ ' DOCG$'),
         count(*) filter (where s.name ~ ' DOC$'),
         count(*) filter (where s.name ~ ' IGT$')
    into v_n, v_files, v_pairs, v_docg, v_doc, v_igt
    from jsonb_to_recordset(v_src) as s(file text, region text, name text);
  if v_n <> v_expected or v_files <> v_expected or v_pairs <> v_expected then
    raise exception 'italy appellations: list has % rows, % file numbers, % folded pairs; want %',
      v_n, v_files, v_pairs, v_expected;
  end if;
  if v_docg <> 11 or v_doc <> 90 or v_igt <> 47 then
    raise exception 'italy appellations: tier split %/%/%; want 11/90/47', v_docg, v_doc, v_igt;
  end if;
  select string_agg(s.name, ', ') into v_bad
    from jsonb_to_recordset(v_src) as s(file text, region text, name text)
   where s.name ~* '^(DOCG|DOC|IGT|IGP|DOP)\s'
      or s.name ~* '\s(DOCG|DOC|IGT|IGP|DOP)\s+(DOCG|DOC|IGT|IGP|DOP)$'
      or s.file !~ '^(PDO|PGI)-IT-'
      or (s.name ~ ' IGT$') <> (s.file ~ '^PGI-IT-');
  if v_bad is not null then
    raise exception 'italy appellations: malformed name or file number: %', v_bad;
  end if;

  -- 1b. Fresh replay (see FRESH REPLAY above). When none of the 15 home
  --     regions that scripts/import-lwin.mjs creates exists, there is nothing
  --     to attach the rows to, so skip with a notice. Every check above has
  --     already run; a partial set of regions still raises in step 2.
  if not exists (
       select 1
         from jsonb_to_recordset(v_src) as s(file text, region text, name text)
         join public.regions r on r.country_id = v_country and r.name = s.region
        where s.region not in ('Alto Livenza', 'Piemonte', 'Toscana', 'Veneto',
                               'Sicilia', 'Campania', 'Puglia')) then
    raise notice 'italy appellations: skipped, no LWIN-imported Italian home region exists (fresh replay without scripts/import-lwin.mjs); nothing inserted';
    return;
  end if;

  -- 2. Pre-state. Every home region except the new Alto Livenza must already
  --    be an Italian region row.
  select count(*) into v_before
    from public.appellations a join public.regions r on r.id = a.region_id
   where r.country_id = v_country;
  select count(*) into v_regions_before from public.regions where country_id = v_country;

  select string_agg(distinct s.region, ', ') into v_bad
    from jsonb_to_recordset(v_src) as s(file text, region text, name text)
   where s.region <> 'Alto Livenza'
     and not exists (select 1 from public.regions r
                      where r.country_id = v_country and r.name = s.region);
  if v_bad is not null then
    raise exception 'italy appellations: home region not found under Italy: %', v_bad;
  end if;

  --    A row counts as present when its home region holds a name that folds to
  --    the same text. The count is 0 on a first apply and 148 on a replay.
  --    Anything in between means part of the list was added by hand, so stop
  --    for review.
  select count(*) into v_already
    from jsonb_to_recordset(v_src) as s(file text, region text, name text)
    join public.regions r on r.country_id = v_country and r.name = s.region
   where exists (select 1 from public.appellations a
                  where a.region_id = r.id
                    and public.f_search_norm(a.name) = public.f_search_norm(s.name));
  if v_already not in (0, v_expected) then
    raise exception 'italy appellations: % of % already present (partial state)', v_already, v_expected;
  end if;

  -- 3. Near-duplicate guard, the check the (region_id, name) key cannot make.
  --    Strip a leading or trailing designation word and fold what is left. No
  --    other row, in any Italian region, may then match a new row: "DOCG
  --    Canelli" or "Canelli DOC" would block "Canelli DOCG".
  with stored as (
    select a.name, r.name as region,
           public.f_search_norm(a.name) as folded,
           public.f_search_norm(regexp_replace(a.name,
             '^(DOCG|DOC|IGT|IGP|DOP)\s+|\s+(DOCG|DOC|IGT|IGP|DOP)$', '', 'gi')) as core
      from public.appellations a join public.regions r on r.id = a.region_id
     where r.country_id = v_country
  ), src as (
    select s.name, s.region,
           public.f_search_norm(s.name) as folded,
           public.f_search_norm(regexp_replace(s.name,
             '^(DOCG|DOC|IGT|IGP|DOP)\s+|\s+(DOCG|DOC|IGT|IGP|DOP)$', '', 'gi')) as core
      from jsonb_to_recordset(v_src) as s(file text, region text, name text)
  )
  select string_agg(format('%s ~ %s (%s)', src.name, stored.name, stored.region), '; ')
    into v_bad
    from src join stored on stored.core = src.core
   where not (stored.region = src.region and stored.folded = src.folded)
     and not (src.name = 'Emilia-Romagna DOC'
              and stored.name = 'Emilia Romagna IGT'
              and stored.region = 'Emilia Romagna');
  if v_bad is not null then
    raise exception 'italy appellations: near-duplicate of a stored row: %', v_bad;
  end if;

  -- 4. Write the new region row first, then the appellations.
  insert into public.regions (country_id, name)
  values (v_country, 'Alto Livenza')
  on conflict (country_id, name) do nothing;
  get diagnostics v_region_new = row_count;

  with ins as (
    insert into public.appellations (region_id, name)
    select r.id, s.name
      from jsonb_to_recordset(v_src) as s(file text, region text, name text)
      join public.regions r on r.country_id = v_country and r.name = s.region
     where not exists (select 1 from public.appellations a
                        where a.region_id = r.id
                          and public.f_search_norm(a.name) = public.f_search_norm(s.name))
    on conflict (region_id, name) do nothing
    returning id
  )
  select count(*), coalesce(array_agg(id), '{}') into v_inserted, v_ids from ins;

  -- 5. Final state, checked before the transaction can commit.
  --    5a. The run added exactly the rows it could add. The region row is new
  --        on a first apply only.
  if v_inserted <> v_expected - v_already then
    raise exception 'italy appellations: inserted %, want %', v_inserted, v_expected - v_already;
  end if;
  -- (A CASE inside an IF condition would end at its own THEN, so assign first.)
  v_region_want := case when v_already = 0 then 1 else 0 end;
  if v_region_new <> v_region_want then
    raise exception 'italy appellations: % new Alto Livenza region rows, want %', v_region_new, v_region_want;
  end if;

  --    5b. Italy's totals moved by exactly that much.
  select count(*) into v_n
    from public.appellations a join public.regions r on r.id = a.region_id
   where r.country_id = v_country;
  if v_n <> v_before + v_inserted then
    raise exception 'italy appellations: Italy has % appellation rows, want % + %', v_n, v_before, v_inserted;
  end if;
  select count(*) into v_n from public.regions where country_id = v_country;
  if v_n <> v_regions_before + v_region_new then
    raise exception 'italy appellations: Italy has % region rows, want % + %', v_n, v_regions_before, v_region_new;
  end if;

  --    5c. Every new row sits under an Italian region, still PENDING and
  --        unlinked.
  select count(*) into v_n
    from public.appellations a join public.regions r on r.id = a.region_id
   where a.id = any (v_ids)
     and r.country_id = v_country
     and a.map_status = 'PENDING'
     and a.wine_place_id is null;
  if v_n <> cardinality(v_ids) then
    raise exception 'italy appellations: % of % new rows are not PENDING rows under an Italian region',
      cardinality(v_ids) - v_n, cardinality(v_ids);
  end if;

  --    5d. All 148 are now present.
  select count(*) into v_n
    from jsonb_to_recordset(v_src) as s(file text, region text, name text)
    join public.regions r on r.country_id = v_country and r.name = s.region
   where exists (select 1 from public.appellations a
                  where a.region_id = r.id
                    and public.f_search_norm(a.name) = public.f_search_norm(s.name));
  if v_n <> v_expected then
    raise exception 'italy appellations: % of % present after insert', v_n, v_expected;
  end if;

  --    5e. No Italian region holds two names that fold to the same text.
  select string_agg(format('%s: %s', d.region, d.names), '; ') into v_bad
    from (select r.name as region, string_agg(a.name, ' | ') as names
            from public.appellations a join public.regions r on r.id = a.region_id
           where r.country_id = v_country
           group by r.id, r.name, public.f_search_norm(a.name)
          having count(*) > 1) d;
  if v_bad is not null then
    raise exception 'italy appellations: folded duplicates within a region: %', v_bad;
  end if;

  --    5f. The Alto Livenza region row holds Alto Livenza IGT and nothing else.
  select count(*) into v_n
    from public.appellations a join public.regions r on r.id = a.region_id
   where r.country_id = v_country and r.name = 'Alto Livenza';
  if v_n <> 1 or not exists (
       select 1 from public.appellations a join public.regions r on r.id = a.region_id
        where r.country_id = v_country and r.name = 'Alto Livenza' and a.name = 'Alto Livenza IGT') then
    raise exception 'italy appellations: Alto Livenza region should hold only Alto Livenza IGT (holds % rows)', v_n;
  end if;

  raise notice 'italy appellations: inserted % appellation rows (% already present), % region row(s)',
    v_inserted, v_already, v_region_new;
end
$italy$;
