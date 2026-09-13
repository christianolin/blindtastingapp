-- Rename the two prefix-designated Italian appellations that have no same-region
-- suffix-named twin to the house "<Name> <DESIGNATION>" convention:
--   Italy / Toscana  "DOC Bolgheri Sassicaia"  ->  "Bolgheri Sassicaia DOC"
--   Italy / Sicilia  "DOC Etna"                ->  "Etna DOC"
--
-- Why: both rows were hand-seeded with the designation in FRONT
-- (20260710141617_expand_reference_data.sql:69 and :75), while every other
-- appellation ("Barolo DOCG", "Toscana IGT") and the label-read resolver expect
-- it as a trailing word — stripDesignationSuffix (src/lib/wine-identity/fold.ts)
-- strips only a trailing designation, so resolve.ts step 4.3 never agreed with
-- these rows. A correct read of "Bolgheri Sassicaia DOC" (2026-09-13) was left
-- with a blank appellation. Offline counterfactual over 112 stored, fixture and
-- synthetic reads: 9 reads go from no appellation to one of these rows, 0
-- regress (.superpowers/debug-sassicaia/debug-result.json).
--
-- In place, ids kept: nothing that references these rows moves. Rows are matched
-- by country + region + old name, never by id, because a fresh replay of the
-- seed migrations creates them with different ids (same approach as
-- 20260829257000_french_appellations_aoc.sql). The other 26 prefix-named Italian
-- rows are deliberately NOT touched. 23 have a suffix-named twin in the same
-- region, so a rename would break UNIQUE (region_id, name). DOCG Dolcetto di
-- Dogliani, DOC Barbera d'Asti and IGT Bolgheri carry a former name or the wrong
-- tier, and their correct rows (Dogliani DOCG, Barbera d'Asti DOCG, Bolgheri DOC)
-- already exist. All 26 need a merge and are a separate owner decision.
--
-- Replay-safe and idempotent: a rerun (new name present, old name gone) changes
-- nothing. Both names present in one region is a merge, not a rename; this
-- migration refuses to guess and raises. Every check below runs in the same
-- transaction as the rename.

do $$
declare
  v_specs constant jsonb := '[
    {"country": "Italy", "region": "Toscana",
     "old_name": "DOC Bolgheri Sassicaia", "new_name": "Bolgheri Sassicaia DOC",
     "live_id": "a4522526-62f1-4de4-b1ca-195f4b001e49"},
    {"country": "Italy", "region": "Sicilia",
     "old_name": "DOC Etna", "new_name": "Etna DOC",
     "live_id": "09a2296a-b7be-4d0b-b904-3e95a30e7295"}
  ]';
  v_spec record;
  v_regions uuid[];
  v_region uuid;
  v_old_count int;
  v_new_count int;
  v_renamed int;
  v_live_region uuid;
  v_live_name text;
  v_live_before jsonb := '{}'::jsonb;
begin
  -- Pass 1: rename.
  for v_spec in
    select *
    from jsonb_to_recordset(v_specs)
      as s(country text, region text, old_name text, new_name text, live_id uuid)
  loop
    select array_agg(r.id) into v_regions
      from regions r
      join countries c on c.id = r.country_id
     where c.name = v_spec.country
       and r.name = v_spec.region;
    if coalesce(array_length(v_regions, 1), 0) <> 1 then
      raise exception 'appellation_prefix_designations: expected exactly one %/% region, found %',
        v_spec.country, v_spec.region, coalesce(array_length(v_regions, 1), 0);
    end if;
    v_region := v_regions[1];

    -- The live row's region before the rename. The id exists only in the live
    -- database; on a fresh replay this records nothing and its check is skipped.
    select region_id into v_live_region
      from appellations
     where id = v_spec.live_id;
    if found then
      v_live_before := v_live_before
        || jsonb_build_object(v_spec.live_id::text, v_live_region);
    end if;

    select count(*) filter (where name = v_spec.old_name),
           count(*) filter (where name = v_spec.new_name)
      into v_old_count, v_new_count
      from appellations
     where region_id = v_region
       and name in (v_spec.old_name, v_spec.new_name);
    if v_old_count > 0 and v_new_count > 0 then
      raise exception 'appellation_prefix_designations: %/% has both "%" and "%" (a merge, not a rename); refusing',
        v_spec.country, v_spec.region, v_spec.old_name, v_spec.new_name;
    end if;

    update appellations
       set name = v_spec.new_name
     where region_id = v_region
       and name = v_spec.old_name;
    get diagnostics v_renamed = row_count;
    if v_renamed > 1 then
      raise exception 'appellation_prefix_designations: renaming %/% "%" touched % rows, expected at most 1',
        v_spec.country, v_spec.region, v_spec.old_name, v_renamed;
    end if;

    raise notice 'appellation_prefix_designations: %/% "%" -> "%": % row(s) renamed',
      v_spec.country, v_spec.region, v_spec.old_name, v_spec.new_name, v_renamed;
  end loop;

  -- Pass 2: the final state, after every rename.
  for v_spec in
    select *
    from jsonb_to_recordset(v_specs)
      as s(country text, region text, old_name text, new_name text, live_id uuid)
  loop
    select r.id into strict v_region
      from regions r
      join countries c on c.id = r.country_id
     where c.name = v_spec.country
       and r.name = v_spec.region;

    select count(*) filter (where name = v_spec.old_name),
           count(*) filter (where name = v_spec.new_name)
      into v_old_count, v_new_count
      from appellations
     where region_id = v_region
       and name in (v_spec.old_name, v_spec.new_name);
    if v_new_count <> 1 then
      raise exception 'appellation_prefix_designations: final state: %/% has % rows named "%", expected 1',
        v_spec.country, v_spec.region, v_new_count, v_spec.new_name;
    end if;
    if v_old_count <> 0 then
      raise exception 'appellation_prefix_designations: final state: %/% still has % rows named "%"',
        v_spec.country, v_spec.region, v_old_count, v_spec.old_name;
    end if;

    if v_live_before ? v_spec.live_id::text then
      select region_id, name into v_live_region, v_live_name
        from appellations
       where id = v_spec.live_id;
      if not found then
        raise exception 'appellation_prefix_designations: final state: live row % is gone', v_spec.live_id;
      end if;
      if v_live_region is distinct from (v_live_before ->> v_spec.live_id::text)::uuid then
        raise exception 'appellation_prefix_designations: final state: live row % changed region_id % -> %',
          v_spec.live_id, v_live_before ->> v_spec.live_id::text, v_live_region;
      end if;
      if v_live_region <> v_region or v_live_name <> v_spec.new_name then
        raise exception 'appellation_prefix_designations: final state: live row % is "%" in region %, expected "%" in %/% (%)',
          v_spec.live_id, v_live_name, v_live_region, v_spec.new_name, v_spec.country, v_spec.region, v_region;
      end if;
    end if;
  end loop;
end $$;
