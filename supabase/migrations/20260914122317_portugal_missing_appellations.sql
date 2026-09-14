-- 20260914122317_portugal_missing_appellations
--
-- Portugal: add the 11 official DOC / VR denominations that have no
-- appellation row, each under its official IVV wine region. The owner asked
-- on 2026-09-13: "If we are missing appellations in database, fix it". On
-- 2026-09-14 the owner chose IVV's wine regions as their homes, not one new
-- region row per denomination. Italy (20260914120917) and Spain
-- (20260914121417) went first; this file follows their pattern.
--
-- Built from .superpowers/appellation-audit/pt-compare.json and
-- pt-verify-probe.json. The region mapping, its sources and the live region
-- rows are in pt2-redraft.md.
--
-- WHAT COUNTS AS OFFICIAL. The source is the EU register (eAmbrosia:
-- Portugal, wine, not removed). It holds 30 PDOs (DOC) and 14 PGIs (VR), 44
-- in all. IVV's wine-region pages list the same 44 names. IVV also lists DOP
-- Lourinhã, but only for brandy ("aguardentes"), so it is not added. 33 of
-- the 44 already have a row. The other 11 have none: 7 DOC and 4 VR.
--
-- WHY THEY ARE REALLY MISSING. Each was searched live across every region
-- and country with three checks:
--   - f_unaccent ILIKE on the name without its designation word;
--   - pg_trgm similarity above 0.4, with and without the designation word;
--   - folded containment.
-- Every near hit was a different denomination or a foreign row:
--   - Tejo VR (the PGI, not DoTejo DOC);
--   - Port DOC (a registered synonym of Porto, not Portimão);
--   - Madeirense DOC and Madeira DOC (PDOs, not Terras Madeirenses);
--   - Terras do Dao VR and the retired Beiras VR (not Terras da Beira);
--   - Cisterna d'Asti DOC (Italy) and Montana (United States).
-- None was a stored copy of a missing denomination.
--
-- HOME: THE IVV WINE REGION. Each row goes under the one stored Portuguese
-- region row whose name folds (f_search_norm) to its IVV wine region. All
-- eight regions already exist, so the file adds no region row:
--   - Arruda DOC -> Lisboa (IVV Lisboa: DOP Arruda);
--   - DoTejo DOC -> Tejo (IVV Tejo: DOP "DoTejo"), beside Tejo VR and its
--     sub-region Tomar DOC;
--   - Graciosa DOC -> Acores (IVV Açores: DOP Graciosa);
--   - Lagoa, Lagos, Portimão and Tavira DOC -> Algarve (IVV Algarve: "DOP
--     Lagos, Portimão, Lagoa e Tavira");
--   - Terras da Beira VR -> Beira Interior (IVV Beira Interior: IGP Terras da
--     Beira);
--   - Terras de Cister VR -> Tavora-Varosa (IVV Távora-Varosa: IGP Terras de
--     Cister);
--   - Terras Madeirenses VR -> Madeira (IVV Madeira: IGP Terras Madeirenses);
--   - Transmontano VR -> Tras-os-Montes (IVV Trás-os-Montes: IGP
--     Transmontano).
-- The list names each region in IVV's spelling (Açores, Távora-Varosa,
-- Trás-os-Montes) and matches it folded. So the stored ASCII region rows are
-- reused, and an accent rename of a region row still replays.
-- Sources, fetched 2026-09-14:
-- https://www.ivv.gov.pt/regioes-vitivinicolas/mapa-das-regioes/ and its
-- lisboa/, tejo/, acores/, algarve/, beira-interior/, tavora-varosa/,
-- madeira/ and tras-os-montes/ pages.
--
-- CONVENTIONS KEPT
--   Name: the registered name plus ONE trailing designation word, DOC for a
--     PDO and VR for a PGI, as every stored Portuguese denomination row has.
--     Registered accents are kept, as the Italy and Spain files keep them:
--     Portimão DOC, not Portimao DOC. Search and every check below ignore
--     accents. DoTejo keeps the spelling of the EU register and IVV; CVR
--     Tejo's "Do Tejo" folds to the same text. It is never "Tejo DOC", which
--     would share its core with Tejo VR in the same region.
--   Map: map_status stays PENDING and wine_place_id stays null, as on every
--     stored Portuguese region and appellation row.
--   Rows per region: Algarve 4; Açores, Beira Interior, Lisboa, Madeira,
--   Távora-Varosa, Tejo and Trás-os-Montes 1 each.
--
-- NOT IN THIS FILE. These need the owner, so they are listed in
-- pt-followups.md:
--   - moving the stored per-denomination region rows (Bucelas, Pico, Porto,
--     ...) into their IVV regions;
--   - accent renames of stored rows;
--   - Port DOC beside Porto DOC, the bare Alentejo / Bairrada / Dão / Douro /
--     Vinho Verde rows, Beiras VR and Moscatel de Setubal DOC.
--
-- SAFETY. The file only inserts; it deletes, renames and moves nothing.
--   - It is idempotent. A row is skipped when its home region already holds
--     a name that folds to the same text. If only part of the list is
--     present, the file refuses to run.
--   - Each IVV home must match exactly one Portuguese region row, even with a
--     leading or trailing designation word stripped. A second "Açores"
--     beside "Acores", or an "Algarve VR" region, stops the file.
--   - No Portuguese region row may be named after one of the 11. That row
--     would be a second, per-denomination home (step 3a).
--   - The near-duplicate guard strips a leading or trailing designation word
--     and folds what is left. No other Portuguese row may then match a new
--     row: "Lagoa VR" under Algarve blocks "Lagoa DOC" (step 3).
--   - It refuses when a stored Portuguese row could be DoTejo under a label
--     form or its former name: "Tejo DOC", "DOP Tejo", "Ribatejo DOC"
--     (step 3b).
--   - Every check runs in the same transaction as the inserts. There is no
--     begin or commit in the file, because the runner owns the transaction.
--
-- FRESH REPLAY. supabase/migrations creates only six Portuguese regions:
-- Douro, Vinho Verde, Alentejo, Dão and Bairrada (20260710113358), and the
-- None sentinel (20260829263700). None of the eight homes is among them; they
-- come from scripts/import-lwin.mjs. Step 1b skips the whole file with a
-- notice and inserts nothing only when a home region is missing AND every
-- Portuguese region folds to one of those six. The rows then need a manual
-- rerun of this block after the import. When a home is missing but any other
-- Portuguese region exists, the import has run and the home was renamed or
-- removed. Step 1b then raises: a skip would let the runner record this
-- version with nothing inserted, and creating the region would add a second
-- copy beside the renamed one.

do $portugal$
declare
  v_src constant jsonb := $src$[
    {"file":"PDO-PT-A1471","registered":"Arruda","region":"Lisboa","name":"Arruda DOC"},
    {"file":"PDO-PT-A1544","registered":"DoTejo","region":"Tejo","name":"DoTejo DOC"},
    {"file":"PDO-PT-A1446","registered":"Graciosa","region":"Açores","name":"Graciosa DOC"},
    {"file":"PDO-PT-A1450","registered":"Lagoa","region":"Algarve","name":"Lagoa DOC"},
    {"file":"PDO-PT-A1454","registered":"Lagos","region":"Algarve","name":"Lagos DOC"},
    {"file":"PDO-PT-A1452","registered":"Portimão","region":"Algarve","name":"Portimão DOC"},
    {"file":"PDO-PT-A1449","registered":"Tavira","region":"Algarve","name":"Tavira DOC"},
    {"file":"PGI-PT-02355","registered":"Terras da Beira","region":"Beira Interior","name":"Terras da Beira VR"},
    {"file":"PGI-PT-02351","registered":"Terras de Cister","region":"Távora-Varosa","name":"Terras de Cister VR"},
    {"file":"PGI-PT-A0040","registered":"Terras Madeirenses","region":"Madeira","name":"Terras Madeirenses VR"},
    {"file":"PGI-PT-A1467","registered":"Transmontano","region":"Trás-os-Montes","name":"Transmontano VR"}
  ]$src$::jsonb;
  -- The eight IVV wine regions, in IVV's spelling. Each resolves to the one
  -- stored Portuguese region row whose name folds to the same text.
  v_homes constant text[] := array[
    'Lisboa', 'Tejo', 'Açores', 'Algarve',
    'Beira Interior', 'Távora-Varosa', 'Madeira', 'Trás-os-Montes'];
  v_split_want constant text :=
    'Açores 1, Algarve 4, Beira Interior 1, Lisboa 1, Madeira 1, Távora-Varosa 1, Tejo 1, Trás-os-Montes 1';
  v_tejo_name constant text := 'Tejo';
  -- The six Portuguese regions supabase/migrations creates, folded
  -- (f_search_norm): Douro, Vinho Verde, Alentejo, Dão, Bairrada, None.
  v_migration_regions constant text[] := array['douro', 'vinhoverde', 'alentejo', 'dao', 'bairrada', 'none'];
  -- A leading or trailing designation word. VR is Portugal's regional tier;
  -- Italy's guard had no VR. DO is left out so "Do Tejo" keeps its "Do".
  v_des constant text := '^(DOCG|DOCa|DOC|DOP|IGP|IGT|IG|VR|IPR)\s+|\s+(DOCG|DOCa|DOC|DOP|IGP|IGT|IG|VR|IPR)$';
  v_expected constant int := 11;
  v_country uuid;
  v_tejo uuid;
  v_n int;
  v_files int;
  v_pairs int;
  v_cores int;
  v_doc int;
  v_vr int;
  v_mig int;
  v_split text;
  v_before int;
  v_regions_before int;
  v_already int;
  v_inserted int;
  v_ids uuid[];
  v_missing text;
  v_want text;
  v_bad text;
begin
  -- 0. Portugal, exactly once.
  select count(*) into v_n from public.countries where name = 'Portugal';
  if v_n <> 1 then
    raise exception 'portugal appellations: want one Portugal country row, found %', v_n;
  end if;
  select id into v_country from public.countries where name = 'Portugal';

  -- 1. The list itself:
  --    - 11 rows, 11 EU file numbers, 11 distinct pairs of folded region and
  --      folded name, and 11 distinct, non-empty cores;
  --    - a tier split of 7 DOC / 4 VR;
  --    - every name is its registered name plus " DOC" for a PDO file or
  --      " VR" for a PGI file, and no registered name carries a designation
  --      word of its own;
  --    - Portimão DOC is the one accented name (registered accents kept);
  --    - every home is one of the eight IVV regions, in the region split in
  --      the header, and DoTejo DOC is the one Tejo row.
  select count(*),
         count(distinct s.file),
         count(distinct (public.f_search_norm(s.region), public.f_search_norm(s.name))),
         count(distinct nullif(public.f_search_norm(regexp_replace(s.name, v_des, '', 'gi')), '')),
         count(*) filter (where s.name ~ ' DOC$'),
         count(*) filter (where s.name ~ ' VR$')
    into v_n, v_files, v_pairs, v_cores, v_doc, v_vr
    from jsonb_to_recordset(v_src) as s(file text, registered text, region text, name text);
  if v_n <> v_expected or v_files <> v_expected or v_pairs <> v_expected or v_cores <> v_expected then
    raise exception 'portugal appellations: list has % rows, % file numbers, % folded pairs, % cores; want %',
      v_n, v_files, v_pairs, v_cores, v_expected;
  end if;
  if v_doc <> 7 or v_vr <> 4 then
    raise exception 'portugal appellations: tier split %/%; want 7 DOC / 4 VR', v_doc, v_vr;
  end if;
  select string_agg(coalesce(s.name, '(null)'), ', ') into v_bad
    from jsonb_to_recordset(v_src) as s(file text, registered text, region text, name text)
   where s.name is distinct from
           (s.registered || case when s.file ~ '^PDO-PT-' then ' DOC'
                                 when s.file ~ '^PGI-PT-' then ' VR' end)
      or s.registered !~ '^\S(.*\S)?$'
      or s.registered ~* '(^|\s)(DOCG|DOCa|DOC|DOP|IGP|IGT|IG|VR|IPR)(\s|$)'
      or s.name ~* '^(DOCG|DOCa|DOC|DOP|IGP|IGT|IG|VR|IPR)\s';
  if v_bad is not null then
    raise exception 'portugal appellations: malformed name, registered name or file number: %', v_bad;
  end if;
  select string_agg(s.name, ', ' order by s.name) into v_bad
    from jsonb_to_recordset(v_src) as s(file text, registered text, region text, name text)
   where s.name <> public.f_unaccent(s.name);
  if v_bad is distinct from 'Portimão DOC' then
    raise exception 'portugal appellations: accented names are %; want Portimão DOC only', coalesce(v_bad, 'none');
  end if;

  select string_agg(format('%s @ %s', s.name, s.region), ', ') into v_bad
    from jsonb_to_recordset(v_src) as s(file text, registered text, region text, name text)
   where s.region is null
      or not (s.region = any (v_homes))
      or (s.region = v_tejo_name) <> (s.name = 'DoTejo DOC');
  if v_bad is not null then
    raise exception 'portugal appellations: home is not the listed IVV wine region: %', v_bad;
  end if;
  select string_agg(format('%s %s', x.region, x.n), ', ' order by public.f_search_norm(x.region) collate "C")
    into v_split
    from (select s.region, count(*) as n
            from jsonb_to_recordset(v_src) as s(file text, registered text, region text, name text)
           group by s.region) x;
  select count(distinct public.f_search_norm(t.h)),
         count(*) filter (where public.f_search_norm(t.h) = any (v_migration_regions))
    into v_n, v_mig
    from unnest(v_homes) as t(h);
  if v_split is distinct from v_split_want or cardinality(v_homes) <> 8 or v_n <> 8 or v_mig <> 0 then
    raise exception 'portugal appellations: region split is % (% homes, % distinct folded, % migration-created); want %, 8, 8, 0',
      v_split, cardinality(v_homes), v_n, v_mig, v_split_want;
  end if;

  -- 1b. Fresh replay (see FRESH REPLAY above). The eight home regions come
  --     from scripts/import-lwin.mjs. When one is missing, skip the whole
  --     file with a notice only if every Portuguese region folds to one of
  --     the six the migrations create. Any other region means the import ran
  --     and a home was renamed or removed, so stop rather than let the
  --     version be recorded with nothing inserted. Every check above has
  --     already run.
  select string_agg(t.h, ', ' order by t.h) into v_missing
    from unnest(v_homes) as t(h)
   where not exists (select 1 from public.regions r
                      where r.country_id = v_country
                        and public.f_search_norm(r.name) = public.f_search_norm(t.h));
  if v_missing is not null then
    select string_agg(r.name, ', ' order by r.name) into v_bad
      from public.regions r
     where r.country_id = v_country
       and public.f_search_norm(r.name) <> all (v_migration_regions);
    if v_bad is not null then
      raise exception 'portugal appellations: no region row for IVV home region(s) %, but Portugal holds regions no migration creates (%); not a fresh replay', v_missing, v_bad;
    end if;
    raise notice 'portugal appellations: skipped, the LWIN-imported home regions (%) do not exist (fresh replay without scripts/import-lwin.mjs); nothing inserted', v_missing;
    return;
  end if;

  -- 2. Pre-state.
  --    Each home matches exactly one Portuguese region row, compared with a
  --    leading or trailing designation word stripped. Step 1b found a row
  --    that folds equal, so a second match is a copy ("Açores" beside
  --    "Acores", or "Algarve VR") and the home is ambiguous.
  select string_agg(format('%s -> %s', t.h, x.names), '; ' order by t.h) into v_bad
    from unnest(v_homes) as t(h)
    cross join lateral (
      select count(*) as n, string_agg(r.name, ' | ' order by r.name) as names
        from public.regions r
       where r.country_id = v_country
         and public.f_search_norm(regexp_replace(r.name, v_des, '', 'gi')) = public.f_search_norm(t.h)) x
   where x.n <> 1;
  if v_bad is not null then
    raise exception 'portugal appellations: IVV home region matches more than one Portuguese region row: %', v_bad;
  end if;
  select id into v_tejo
    from public.regions
   where country_id = v_country and public.f_search_norm(name) = public.f_search_norm(v_tejo_name);

  select count(*) into v_before
    from public.appellations a join public.regions r on r.id = a.region_id
   where r.country_id = v_country;
  select count(*) into v_regions_before from public.regions where country_id = v_country;

  --    A row counts as present when its home region holds a name that folds to
  --    the same text. The count is 0 on a first apply and 11 on a replay.
  --    Anything in between means part of the list was added by hand, so stop
  --    for review.
  select count(*) into v_already
    from jsonb_to_recordset(v_src) as s(file text, registered text, region text, name text)
    join public.regions r
      on r.country_id = v_country and public.f_search_norm(r.name) = public.f_search_norm(s.region)
   where exists (select 1 from public.appellations a
                  where a.region_id = r.id
                    and public.f_search_norm(a.name) = public.f_search_norm(s.name));
  if v_already not in (0, v_expected) then
    raise exception 'portugal appellations: % of % already present (partial state)', v_already, v_expected;
  end if;

  -- 3. Near-duplicate guard, the check the (region_id, name) key cannot make.
  --    Strip a leading or trailing designation word and fold what is left. No
  --    other row, in any Portuguese region, may then match a new row: "Lagoa
  --    VR" under Algarve, or "Portimao" under Lisboa, blocks the new row.
  --    A row's own replayed copy (same region, same folded name) is not a
  --    near-duplicate.
  with stored as (
    select a.name, r.id as region_id, r.name as region,
           public.f_search_norm(a.name) as folded,
           public.f_search_norm(regexp_replace(a.name, v_des, '', 'gi')) as core
      from public.appellations a join public.regions r on r.id = a.region_id
     where r.country_id = v_country
  ), src as (
    select s.name, r.id as region_id,
           public.f_search_norm(s.name) as folded,
           public.f_search_norm(regexp_replace(s.name, v_des, '', 'gi')) as core
      from jsonb_to_recordset(v_src) as s(file text, registered text, region text, name text)
      join public.regions r
        on r.country_id = v_country and public.f_search_norm(r.name) = public.f_search_norm(s.region)
  )
  select string_agg(format('%s ~ %s (%s)', src.name, stored.name, stored.region), '; '
                    order by src.name, stored.name)
    into v_bad
    from src join stored on stored.core = src.core
   where not (stored.region_id = src.region_id and stored.folded = src.folded);
  if v_bad is not null then
    raise exception 'portugal appellations: near-duplicate of a stored row: %', v_bad;
  end if;

  --    3a. No Portuguese region row may be named after one of the 11, with or
  --        without a designation word ("Portimão", "Terras da Beira VR").
  --        Such a row would be a second, per-denomination home, the layout
  --        the owner turned down on 2026-09-14, so stop for review.
  select string_agg(format('%s ~ region %s', s.name, r.name), '; ' order by s.name, r.name) into v_bad
    from jsonb_to_recordset(v_src) as s(file text, registered text, region text, name text)
    join public.regions r
      on r.country_id = v_country
     and public.f_search_norm(regexp_replace(r.name, v_des, '', 'gi'))
         = public.f_search_norm(regexp_replace(s.name, v_des, '', 'gi'));
  if v_bad is not null then
    raise exception 'portugal appellations: a Portuguese region row is named after a new denomination: %', v_bad;
  end if;

  --    3b. DoTejo's label forms reduce to other cores, so step 3 cannot see
  --        them: "Tejo DOC" and "DOP Tejo" reduce to tejo, and the former name
  --        "Ribatejo DOC" to ribatejo. In Portugal only Tejo VR in the Tejo
  --        region may reduce to tejo, no row to ribatejo, and only this
  --        file's own DoTejo DOC in the Tejo region to dotejo. Names compare
  --        folded, so a later accent or spacing rename still replays.
  select string_agg(format('%s (%s)', a.name, r.name), '; ') into v_bad
    from public.appellations a join public.regions r on r.id = a.region_id
   where r.country_id = v_country
     and public.f_search_norm(regexp_replace(a.name, v_des, '', 'gi')) in ('tejo', 'ribatejo', 'dotejo')
     and not (r.id = v_tejo and public.f_search_norm(a.name) = public.f_search_norm('Tejo VR'))
     and not (r.id = v_tejo and public.f_search_norm(a.name) = public.f_search_norm('DoTejo DOC'));
  if v_bad is not null then
    raise exception 'portugal appellations: stored rows reduce to tejo, ribatejo or dotejo but are not Tejo VR or DoTejo DOC in the Tejo region (DoTejo under another name?): %', v_bad;
  end if;

  -- 4. Write the appellations. No region row is added.
  with ins as (
    insert into public.appellations (region_id, name)
    select r.id, s.name
      from jsonb_to_recordset(v_src) as s(file text, registered text, region text, name text)
      join public.regions r
        on r.country_id = v_country and public.f_search_norm(r.name) = public.f_search_norm(s.region)
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
    raise exception 'portugal appellations: inserted %, want %', v_inserted, v_expected - v_already;
  end if;

  --    5b. Portugal's appellation total moved by exactly that much; its region
  --        total did not move (no region row added).
  select count(*) into v_n
    from public.appellations a join public.regions r on r.id = a.region_id
   where r.country_id = v_country;
  if v_n <> v_before + v_inserted then
    raise exception 'portugal appellations: Portugal has % appellation rows, want % + %', v_n, v_before, v_inserted;
  end if;
  select count(*) into v_n from public.regions where country_id = v_country;
  if v_n <> v_regions_before then
    raise exception 'portugal appellations: Portugal has % region rows, want % (no region row added)', v_n, v_regions_before;
  end if;

  --    5c. Every new row sits under its listed IVV home region with its listed
  --        name, still PENDING and unlinked.
  select count(*) into v_n
    from public.appellations a
    join public.regions r on r.id = a.region_id
    join jsonb_to_recordset(v_src) as s(file text, registered text, region text, name text)
      on public.f_search_norm(s.region) = public.f_search_norm(r.name) and s.name = a.name
   where a.id = any (v_ids)
     and r.country_id = v_country
     and a.map_status = 'PENDING'
     and a.wine_place_id is null;
  if v_n <> cardinality(v_ids) then
    raise exception 'portugal appellations: % of % new rows are not PENDING, unlinked rows in their listed IVV region',
      cardinality(v_ids) - v_n, cardinality(v_ids);
  end if;

  --    5d. On a first apply the new rows are exactly the 11, each under its
  --        home region.
  if v_already = 0 then
    select string_agg(format('%s @ %s', a.name, r.name), ', ' order by a.name) into v_bad
      from public.appellations a join public.regions r on r.id = a.region_id
     where a.id = any (v_ids);
    select string_agg(format('%s @ %s', s.name, r.name), ', ' order by s.name) into v_want
      from jsonb_to_recordset(v_src) as s(file text, registered text, region text, name text)
      join public.regions r
        on r.country_id = v_country and public.f_search_norm(r.name) = public.f_search_norm(s.region);
    if v_bad is distinct from v_want then
      raise exception 'portugal appellations: new rows are [%], want [%]', v_bad, v_want;
    end if;
  end if;

  --    5e. All 11 are now present.
  select count(*) into v_n
    from jsonb_to_recordset(v_src) as s(file text, registered text, region text, name text)
    join public.regions r
      on r.country_id = v_country and public.f_search_norm(r.name) = public.f_search_norm(s.region)
   where exists (select 1 from public.appellations a
                  where a.region_id = r.id
                    and public.f_search_norm(a.name) = public.f_search_norm(s.name));
  if v_n <> v_expected then
    raise exception 'portugal appellations: % of % present after insert', v_n, v_expected;
  end if;

  --    5f. No Portuguese region holds two names that fold to the same text.
  select string_agg(format('%s: %s', d.region, d.names), '; ') into v_bad
    from (select r.name as region, string_agg(a.name, ' | ') as names
            from public.appellations a join public.regions r on r.id = a.region_id
           where r.country_id = v_country
           group by r.id, r.name, public.f_search_norm(a.name)
          having count(*) > 1) d;
  if v_bad is not null then
    raise exception 'portugal appellations: folded duplicates within a region: %', v_bad;
  end if;

  --    5g. No new row has a near-duplicate anywhere in Portugal after the
  --        insert.
  with portugal as (
    select a.id, a.name, r.name as region,
           public.f_search_norm(regexp_replace(a.name, v_des, '', 'gi')) as core
      from public.appellations a join public.regions r on r.id = a.region_id
     where r.country_id = v_country
  )
  select string_agg(format('%s (%s) ~ %s (%s)', n.name, n.region, o.name, o.region), '; ') into v_bad
    from portugal n join portugal o on o.core = n.core and o.id <> n.id
   where n.id = any (v_ids);
  if v_bad is not null then
    raise exception 'portugal appellations: near-duplicate after insert: %', v_bad;
  end if;

  --    5h. DoTejo DOC sits in the Tejo region; on a first apply, beside Tejo VR,
  --        so it is the Tejo that holds the PGI. Names compare folded.
  if not exists (select 1 from public.appellations
                  where region_id = v_tejo
                    and public.f_search_norm(name) = public.f_search_norm('DoTejo DOC'))
     or (v_already = 0
         and not exists (select 1 from public.appellations
                          where region_id = v_tejo
                            and public.f_search_norm(name) = public.f_search_norm('Tejo VR'))) then
    raise exception 'portugal appellations: the Tejo region should hold DoTejo DOC beside Tejo VR';
  end if;

  raise notice 'portugal appellations: inserted % appellation rows (% already present), 0 region rows',
    v_inserted, v_already;
end
$portugal$;
