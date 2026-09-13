-- 20260914121417_spain_missing_appellations
--
-- Spain: add the 51 official DO / VC / VP / VT denominations that have no
-- appellation row. The owner asked on 2026-09-13: "If we are missing
-- appellations in database, fix it". Italy went first, in
-- 20260914120917_italy_missing_appellations; this file follows its pattern.
--
-- Built by .superpowers/appellation-audit/es-build-draft.mjs from
-- es-compare.json. Checked against es-verify-recheck.json and
-- es-spotchecks.json.
--
-- WHAT COUNTS AS OFFICIAL. The source is MAPA's list of wine DOPs and IGPs
-- registered in the EU, updated 2026-07-02. It holds 149 names: 106 DOP and
-- 43 IGP. It matches the EU register (eAmbrosia: Spain, wine, not removed)
-- one to one by file number. By MAPA's traditional term, with Urbezo counted
-- as a VP (see ONE TIER OVERRIDE), the 149 are:
--   - 69 DO and 2 DOCa;
--   - 7 VC (vino de calidad);
--   - 28 VP (vino de pago);
--   - 43 VT (vino de la tierra).
-- 98 already have a row: 69 exactly, and 29 as a spelling, tier-word,
-- former-name, English-name or LWIN variant. None sits under the wrong
-- region. The other 51 have none: 7 DO, 3 VC, 18 VP and 23 VT.
--
-- ONE TIER OVERRIDE. Urbezo (PDO-ES-02585) goes in bare, as a VP. MAPA's PDF
-- column says DO, but MAPA's registration notice of 2024-10-25 calls it a
-- "Denominación de Origen Protegida (DOP) de vino de pago".
--
-- WHY THEY ARE REALLY MISSING. Each was searched live across every region and
-- country:
--   - f_unaccent ILIKE on the whole name and on each significant word;
--   - pg_trgm similarity above 0.4, with and without a designation word;
--   - f_search_norm equality, with and without a designation word.
-- Every near hit was one of four things:
--   - a different Spanish denomination: Ribera del Duero, Jiloca, Queiles
--     and Guadiana; Campo de Borja; Campo de la Guardia; Sierra de Salamanca;
--     Sierras de Malaga; Valles de Benavente; Valle de la Orotava;
--   - a self-named "just the region" row: Canary Islands, Cantabria;
--   - a foreign row: Rio Negro (Argentina), Castello DOCG (Italy), Terras do
--     Dao (Portugal), Valle de Guadalupe (Mexico), Valle de Uco (Argentina);
--   - a shared common word only (valle, sierra, costa, casa, nevada).
-- None was a stored copy of a missing denomination.
--
-- CONVENTIONS KEPT
--   Name: the EU-registered spelling.
--     - A DO takes ONE trailing word, "<Name> DO", as the 72 stored DO rows
--       do.
--     - VC, VP and VT rows are bare, as every stored VP and VT row is. No
--       Spanish row carries VC, VP, VT or IGP, and fold.ts
--       DESIGNATION_SUFFIXES cannot strip those words.
--     - Registered accents are kept (Bailén, Valle de Güímar DO, Río Negro,
--       Castelló). Search and every check below ignore accents.
--   Home: the one autonomous community, under its stored region name
--     (Andalucia, Canary Islands, Castilla La Mancha, Castilla y Leon). None
--     of the 51 spans communities, so no region row is added. La Rioja has no
--     region row of its own, so Valles de Sadacia goes under the stored
--     "Rioja" region, beside Rioja DOCa.
--   Map: map_status stays PENDING and wine_place_id stays null, as on every
--     stored Spanish appellation row.
--   Rows per region: Andalucia 16, Castilla La Mancha 14, Canary Islands 5,
--   Aragon 4, Castilla y Leon 4, Valencia 3, Cantabria 1, Galicia 1,
--   Murcia 1, Navarra 1, Rioja 1.
--
-- REVIEWED NEAR NAMES. None of these is a copy, and the step 3 guard does
-- not block any of them:
--   - Islas Canarias (VC) goes in beside the self-named "Canary Islands"
--     row, as Illes Balears (VT) already sits beside "Balearic Islands";
--   - Costa de Cantabria (VT) goes in beside the self-named "Cantabria" row;
--   - Río Negro and Castelló fold to the same text as rows in Argentina and
--     Italy. The guard is scoped to Spain, as the Italy guard is to Italy.
--
-- NOT IN THIS FILE. These need the owner, so they are listed in
-- es-followups.md:
--   - renames: accents, tier words, and Tierra de Leon DO to León DO;
--   - the 8 duplicate rows under the hand-seeded pseudo-regions;
--   - the 17 non-official rows.
--
-- SAFETY. The file only inserts.
--   - It is idempotent. A row is skipped when its home region already holds
--     a name that folds to the same text (f_search_norm). If only part of the
--     list is present, the file refuses to run.
--   - The near-duplicate guard folds each name after stripping:
--       - one trailing tier word (DO, DOCa, DOQ, DOP, IGP, VT, VC, VP);
--       - leading tier words and label prefixes ("Pago", "Pago de",
--         "Vino de la Tierra de");
--       - one leading article.
--     So a stored "Mondejar", "Pago Calzadilla" or "Gomera DO" blocks the
--     matching new row.
--   - Every check runs in the same transaction as the inserts. There is no
--     begin or commit in the file, because the runner owns the transaction.
--
-- FRESH REPLAY. supabase/migrations creates five Spanish region rows in
-- 20260710113358: Rioja, Ribera del Duero, Priorat, Rías Baixas and Jerez.
-- Rioja is the only home region among them. The other 10 come from
-- scripts/import-lwin.mjs. When none of those 10 exists, step 1b skips the
-- file with a notice and inserts nothing; the rows then need a manual rerun
-- of this block after the import. If only some of the 10 exist, step 2 still
-- raises.

do $spain$
declare
  v_src constant jsonb := $src$[
    {"file":"PDO-ES-A0975","tier":"DO","region":"Canary Islands","name":"Abona DO"},
    {"file":"PDO-ES-A1250","tier":"DO","region":"Canary Islands","name":"El Hierro DO"},
    {"file":"PDO-ES-A0111","tier":"DO","region":"Canary Islands","name":"La Gomera DO"},
    {"file":"PDO-ES-A0980","tier":"DO","region":"Canary Islands","name":"Valle de Güímar DO"},
    {"file":"PDO-ES-02870","tier":"DO","region":"Castilla La Mancha","name":"Campo de Calatrava DO"},
    {"file":"PDO-ES-A0048","tier":"DO","region":"Castilla La Mancha","name":"Mondéjar DO"},
    {"file":"PDO-ES-A0049","tier":"DO","region":"Castilla La Mancha","name":"Ribera del Júcar DO"},
    {"file":"PDO-ES-A1478","tier":"VC","region":"Andalucia","name":"Lebrija"},
    {"file":"PDO-ES-A1511","tier":"VC","region":"Canary Islands","name":"Islas Canarias"},
    {"file":"PDO-ES-A0747","tier":"VC","region":"Castilla y Leon","name":"Valtiendas"},
    {"file":"PDO-ES-A1522","tier":"VP","region":"Aragon","name":"Aylés"},
    {"file":"PDO-ES-02585","tier":"VP","region":"Aragon","name":"Urbezo"},
    {"file":"PDO-ES-A0056","tier":"VP","region":"Castilla La Mancha","name":"Calzadilla"},
    {"file":"PDO-ES-A0060","tier":"VP","region":"Castilla La Mancha","name":"Casa del Blanco"},
    {"file":"PDO-ES-A0054","tier":"VP","region":"Castilla La Mancha","name":"Dehesa del Carrizal"},
    {"file":"PDO-ES-N1634","tier":"VP","region":"Castilla La Mancha","name":"El Vicario"},
    {"file":"PDO-ES-A0053","tier":"VP","region":"Castilla La Mancha","name":"Finca Élez"},
    {"file":"PDO-ES-A0058","tier":"VP","region":"Castilla La Mancha","name":"Guijoso"},
    {"file":"PDO-ES-01895","tier":"VP","region":"Castilla La Mancha","name":"La Jaraba"},
    {"file":"PDO-ES-02228","tier":"VP","region":"Castilla La Mancha","name":"Los Cerrillos"},
    {"file":"PDO-ES-03003","tier":"VP","region":"Castilla La Mancha","name":"Río Negro"},
    {"file":"PDO-ES-02880","tier":"VP","region":"Castilla La Mancha","name":"Rosalejo"},
    {"file":"PDO-ES-02085","tier":"VP","region":"Castilla La Mancha","name":"Vallegarcía"},
    {"file":"PDO-ES-02481","tier":"VP","region":"Castilla y Leon","name":"Abadía Retuerta"},
    {"file":"PDO-ES-02592","tier":"VP","region":"Castilla y Leon","name":"Dehesa Peñalba"},
    {"file":"PDO-ES-02485","tier":"VP","region":"Castilla y Leon","name":"Urueña"},
    {"file":"PDO-ES-N1637","tier":"VP","region":"Valencia","name":"Chozas Carrascal"},
    {"file":"PDO-ES-02980","tier":"VP","region":"Valencia","name":"Tharsys"},
    {"file":"PGI-ES-A1402","tier":"VT","region":"Andalucia","name":"Altiplano de Sierra Nevada"},
    {"file":"PGI-ES-A1404","tier":"VT","region":"Andalucia","name":"Bailén"},
    {"file":"PGI-ES-A1406","tier":"VT","region":"Andalucia","name":"Córdoba"},
    {"file":"PGI-ES-A1407","tier":"VT","region":"Andalucia","name":"Cumbres del Guadalfeo"},
    {"file":"PGI-ES-A1408","tier":"VT","region":"Andalucia","name":"Desierto de Almería"},
    {"file":"PGI-ES-A1409","tier":"VT","region":"Andalucia","name":"Laderas del Genil"},
    {"file":"PGI-ES-A1410","tier":"VT","region":"Andalucia","name":"Laujar-Alpujarra"},
    {"file":"PGI-ES-A1411","tier":"VT","region":"Andalucia","name":"Los Palacios"},
    {"file":"PGI-ES-A1412","tier":"VT","region":"Andalucia","name":"Norte de Almería"},
    {"file":"PGI-ES-A1414","tier":"VT","region":"Andalucia","name":"Ribera del Andarax"},
    {"file":"PGI-ES-A1415","tier":"VT","region":"Andalucia","name":"Sierra Norte de Sevilla"},
    {"file":"PGI-ES-A1416","tier":"VT","region":"Andalucia","name":"Sierra Sur de Jaén"},
    {"file":"PGI-ES-A1417","tier":"VT","region":"Andalucia","name":"Sierras de Las Estancias y Los Filabres"},
    {"file":"PGI-ES-A1418","tier":"VT","region":"Andalucia","name":"Torreperogil"},
    {"file":"PGI-ES-A1419","tier":"VT","region":"Andalucia","name":"Villaviciosa de Córdoba"},
    {"file":"PGI-ES-A0245","tier":"VT","region":"Aragon","name":"Ribera del Gállego - Cinco Villas"},
    {"file":"PGI-ES-A0181","tier":"VT","region":"Aragon","name":"Valle del Cinca"},
    {"file":"PGI-ES-A0129","tier":"VT","region":"Cantabria","name":"Costa de Cantabria"},
    {"file":"PGI-ES-02787","tier":"VT","region":"Galicia","name":"Terras do Navia"},
    {"file":"PGI-ES-A0607","tier":"VT","region":"Murcia","name":"Campo de Cartagena"},
    {"file":"PGI-ES-A0128","tier":"VT","region":"Navarra","name":"3 Riberas"},
    {"file":"PGI-ES-A0511","tier":"VT","region":"Rioja","name":"Valles de Sadacia"},
    {"file":"PGI-ES-A1173","tier":"VT","region":"Valencia","name":"Castelló"}
  ]$src$::jsonb;
  v_expected constant int := 51;
  -- What the near-duplicate guard strips before it folds a name: one trailing
  -- tier word, then leading tier words and label prefixes, then one article.
  v_suffix constant text := '\s+(DOCa|DOQ|DOP|DO|IGP|VT|VC|VP|PDO|PGI)$';
  v_label constant text := '^((DOCa|DOQ|DOP|DO|IGP|VT|VC|VP|PDO|PGI|Vino de la Tierra de|Vino de la Tierra|Vino de Pago|Pago del|Pago de|Pago)\s+)+';
  v_article constant text := '^(El|La|Los|Las)\s+';
  v_country uuid;
  v_n int;
  v_files int;
  v_pairs int;
  v_cores int;
  v_do int;
  v_vc int;
  v_vp int;
  v_vt int;
  v_split text;
  v_before int;
  v_regions_before int;
  v_already int;
  v_inserted int;
  v_ids uuid[];
  v_bad text;
begin
  -- 0. Spain, exactly once.
  select count(*) into v_n from public.countries where name = 'Spain';
  if v_n <> 1 then
    raise exception 'spain appellations: want one Spain country row, found %', v_n;
  end if;
  select id into v_country from public.countries where name = 'Spain';

  -- 1. The list itself:
  --    - 51 rows, 51 EU file numbers, 51 distinct pairs of region and folded
  --      name, and 51 distinct, non-empty guard cores;
  --    - a tier split of 7 DO / 3 VC / 18 VP / 23 VT, and the region split
  --      in the header;
  --    - a DO name ends in " DO", and no other name ends in a tier word;
  --    - no name starts with a tier word or a label prefix;
  --    - the file-number kind matches the tier: PGI for VT, PDO otherwise.
  select count(*),
         count(distinct s.file),
         count(distinct (s.region, public.f_search_norm(s.name))),
         count(distinct nullif(public.f_search_norm(regexp_replace(regexp_replace(regexp_replace(
           s.name, v_suffix, '', 'i'), v_label, '', 'i'), v_article, '', 'i')), '')),
         count(*) filter (where s.tier = 'DO'),
         count(*) filter (where s.tier = 'VC'),
         count(*) filter (where s.tier = 'VP'),
         count(*) filter (where s.tier = 'VT')
    into v_n, v_files, v_pairs, v_cores, v_do, v_vc, v_vp, v_vt
    from jsonb_to_recordset(v_src) as s(file text, tier text, region text, name text);
  if v_n <> v_expected or v_files <> v_expected or v_pairs <> v_expected or v_cores <> v_expected then
    raise exception 'spain appellations: list has % rows, % file numbers, % folded pairs, % cores; want %',
      v_n, v_files, v_pairs, v_cores, v_expected;
  end if;
  if v_do <> 7 or v_vc <> 3 or v_vp <> 18 or v_vt <> 23 then
    raise exception 'spain appellations: tier split %/%/%/%; want 7/3/18/23', v_do, v_vc, v_vp, v_vt;
  end if;
  select string_agg(format('%s %s', x.region, x.n), ', ' order by x.region collate "C") into v_split
    from (select s.region, count(*) as n
            from jsonb_to_recordset(v_src) as s(file text, tier text, region text, name text)
           group by s.region) x;
  if v_split <> 'Andalucia 16, Aragon 4, Canary Islands 5, Cantabria 1, Castilla La Mancha 14, Castilla y Leon 4, Galicia 1, Murcia 1, Navarra 1, Rioja 1, Valencia 3' then
    raise exception 'spain appellations: region split is %', v_split;
  end if;
  select string_agg(format('%s (%s %s)', s.name, s.tier, s.file), ', ') into v_bad
    from jsonb_to_recordset(v_src) as s(file text, tier text, region text, name text)
   where s.tier is null or s.tier not in ('DO', 'VC', 'VP', 'VT')
      or s.file !~ '^(PDO|PGI)-ES-'
      or (s.tier = 'VT') <> (s.file ~ '^PGI-ES-')
      or (s.tier = 'DO') <> (s.name ~ '\S DO$')
      or s.name ~* '\s(DOCa|DOQ|DOP|IGP|VT|VC|VP|PDO|PGI|DOC|DOCG|IGT)$'
      or s.name ~* '\sDO\s+DO$'
      or s.name ~* v_label;
  if v_bad is not null then
    raise exception 'spain appellations: malformed name, tier or file number: %', v_bad;
  end if;

  -- 1b. Fresh replay (see FRESH REPLAY above). When none of the 10 home
  --     regions that scripts/import-lwin.mjs creates exists, there is
  --     nothing to attach those rows to, so skip with a notice. Every check
  --     above has already run; a partial set of regions still raises in
  --     step 2.
  if not exists (
       select 1
         from jsonb_to_recordset(v_src) as s(file text, tier text, region text, name text)
         join public.regions r on r.country_id = v_country and r.name = s.region
        where s.region <> 'Rioja') then
    raise notice 'spain appellations: skipped, no LWIN-imported Spanish home region exists (fresh replay without scripts/import-lwin.mjs); nothing inserted';
    return;
  end if;

  -- 2. Pre-state. Every home region must already be a Spanish region row.
  select count(*) into v_before
    from public.appellations a join public.regions r on r.id = a.region_id
   where r.country_id = v_country;
  select count(*) into v_regions_before from public.regions where country_id = v_country;

  select string_agg(distinct s.region, ', ') into v_bad
    from jsonb_to_recordset(v_src) as s(file text, tier text, region text, name text)
   where not exists (select 1 from public.regions r
                      where r.country_id = v_country and r.name = s.region);
  if v_bad is not null then
    raise exception 'spain appellations: home region not found under Spain: %', v_bad;
  end if;

  --    A row counts as present when its home region holds a name that folds to
  --    the same text. The count is 0 on a first apply and 51 on a replay.
  --    Anything in between means part of the list was added by hand, so stop
  --    for review.
  select count(*) into v_already
    from jsonb_to_recordset(v_src) as s(file text, tier text, region text, name text)
    join public.regions r on r.country_id = v_country and r.name = s.region
   where exists (select 1 from public.appellations a
                  where a.region_id = r.id
                    and public.f_search_norm(a.name) = public.f_search_norm(s.name));
  if v_already not in (0, v_expected) then
    raise exception 'spain appellations: % of % already present (partial state)', v_already, v_expected;
  end if;

  -- 3. Near-duplicate guard, the check the (region_id, name) key cannot make.
  --    Strip tier words, label prefixes and one article (v_suffix, v_label,
  --    v_article), then fold what is left. No other row, in any Spanish
  --    region, may then match a new row. "Mondejar", "Pago Calzadilla",
  --    "Gomera DO" or "Lebrija DO" under any region blocks "Mondéjar DO",
  --    "Calzadilla", "La Gomera DO" or "Lebrija". A row's own replayed copy
  --    (same region, same folded name) is not a near-duplicate.
  with stored as (
    select a.name, r.name as region,
           public.f_search_norm(a.name) as folded,
           public.f_search_norm(regexp_replace(regexp_replace(regexp_replace(
             a.name, v_suffix, '', 'i'), v_label, '', 'i'), v_article, '', 'i')) as core
      from public.appellations a join public.regions r on r.id = a.region_id
     where r.country_id = v_country
  ), src as (
    select s.name, s.region,
           public.f_search_norm(s.name) as folded,
           public.f_search_norm(regexp_replace(regexp_replace(regexp_replace(
             s.name, v_suffix, '', 'i'), v_label, '', 'i'), v_article, '', 'i')) as core
      from jsonb_to_recordset(v_src) as s(file text, tier text, region text, name text)
  )
  select string_agg(format('%s ~ %s (%s)', src.name, stored.name, stored.region), '; '
                    order by src.name, stored.name)
    into v_bad
    from src join stored on stored.core = src.core
   where not (stored.region = src.region and stored.folded = src.folded);
  if v_bad is not null then
    raise exception 'spain appellations: near-duplicate of a stored row: %', v_bad;
  end if;

  -- 4. Write the appellations. No region row is added.
  with ins as (
    insert into public.appellations (region_id, name)
    select r.id, s.name
      from jsonb_to_recordset(v_src) as s(file text, tier text, region text, name text)
      join public.regions r on r.country_id = v_country and r.name = s.region
     where not exists (select 1 from public.appellations a
                        where a.region_id = r.id
                          and public.f_search_norm(a.name) = public.f_search_norm(s.name))
    on conflict (region_id, name) do nothing
    returning id
  )
  select count(*), coalesce(array_agg(id), '{}') into v_inserted, v_ids from ins;

  -- 5. Final state, checked before the transaction can commit.
  --    5a. The run added exactly the rows it could add.
  if v_inserted <> v_expected - v_already then
    raise exception 'spain appellations: inserted %, want %', v_inserted, v_expected - v_already;
  end if;

  --    5b. Spain's appellation total moved by exactly that much; its region
  --        total did not move.
  select count(*) into v_n
    from public.appellations a join public.regions r on r.id = a.region_id
   where r.country_id = v_country;
  if v_n <> v_before + v_inserted then
    raise exception 'spain appellations: Spain has % appellation rows, want % + %', v_n, v_before, v_inserted;
  end if;
  select count(*) into v_n from public.regions where country_id = v_country;
  if v_n <> v_regions_before then
    raise exception 'spain appellations: Spain has % region rows, want %', v_n, v_regions_before;
  end if;

  --    5c. Every new row sits under its listed Spanish home region with its
  --        listed name, still PENDING and unlinked.
  select count(*) into v_n
    from public.appellations a
    join public.regions r on r.id = a.region_id
    join jsonb_to_recordset(v_src) as s(file text, tier text, region text, name text)
      on s.region = r.name and s.name = a.name
   where a.id = any (v_ids)
     and r.country_id = v_country
     and a.map_status = 'PENDING'
     and a.wine_place_id is null;
  if v_n <> cardinality(v_ids) then
    raise exception 'spain appellations: % of % new rows are not PENDING, unlinked rows in their listed Spanish region',
      cardinality(v_ids) - v_n, cardinality(v_ids);
  end if;

  --    5d. All 51 are now present.
  select count(*) into v_n
    from jsonb_to_recordset(v_src) as s(file text, tier text, region text, name text)
    join public.regions r on r.country_id = v_country and r.name = s.region
   where exists (select 1 from public.appellations a
                  where a.region_id = r.id
                    and public.f_search_norm(a.name) = public.f_search_norm(s.name));
  if v_n <> v_expected then
    raise exception 'spain appellations: % of % present after insert', v_n, v_expected;
  end if;

  --    5e. No Spanish region holds two names that fold to the same text.
  select string_agg(format('%s: %s', d.region, d.names), '; ') into v_bad
    from (select r.name as region, string_agg(a.name, ' | ') as names
            from public.appellations a join public.regions r on r.id = a.region_id
           where r.country_id = v_country
           group by r.id, r.name, public.f_search_norm(a.name)
          having count(*) > 1) d;
  if v_bad is not null then
    raise exception 'spain appellations: folded duplicates within a region: %', v_bad;
  end if;

  --    5f. No new row has a near-duplicate anywhere in Spain after the insert.
  with spain as (
    select a.id, a.name, r.name as region,
           public.f_search_norm(regexp_replace(regexp_replace(regexp_replace(
             a.name, v_suffix, '', 'i'), v_label, '', 'i'), v_article, '', 'i')) as core
      from public.appellations a join public.regions r on r.id = a.region_id
     where r.country_id = v_country
  )
  select string_agg(format('%s (%s) ~ %s (%s)', n.name, n.region, o.name, o.region), '; ') into v_bad
    from spain n join spain o on o.core = n.core and o.id <> n.id
   where n.id = any (v_ids);
  if v_bad is not null then
    raise exception 'spain appellations: near-duplicate after insert: %', v_bad;
  end if;

  raise notice 'spain appellations: inserted % appellation rows (% already present)', v_inserted, v_already;
end
$spain$;
