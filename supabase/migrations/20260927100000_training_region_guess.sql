-- Training room: a call may stop at the region (and name a grape).
--
-- Spec: docs/superpowers/specs/2026-09-27-training-room-region-guess.md (R6,
-- R7), extending docs/superpowers/specs/2026-09-25-training-room-design.md
-- §6.1-§6.2. Plan: docs/superpowers/plans/2026-09-27-training-room-region-guess.md,
-- Task 1. Additive for the deployed app: two nullable columns, two checks, and
-- record_training_attempt gains a branch the deployed app never takes (it
-- never sends picked_region_id or picked_grape_id).
--
-- Written against the LIVE state (read-only, 2026-09-27), never an older
-- migration file alone:
-- * record_training_attempt(jsonb,jsonb,jsonb): md5 79b65a0e38ea00be8b8adcc771abcc60
--   (the 20260925120000 body, byte for byte), SECURITY DEFINER, search_path
--   public, EXECUTE held by its owner and authenticated only. Recreated below
--   from that body with the region branch added and nothing else changed.
-- * save_wset_note(jsonb,jsonb) md5 9ac29b18bbda5b08bcd9a12e19beb932 and
--   wset_hue_fits_colour(wset_colour_hue,wine_colour) md5
--   96339c7d5a5a84074ffc33db8e89d6ba are called, not changed.
-- * training_attempts: the 24 columns and 13 constraints of 20260925120000,
--   one live row (a typical-wine pick). grapes: 276 rows; wine_archetypes: 102
--   rows in 43 regions.
--
-- What this migration does:
-- 1. training_attempts.picked_region_id (-> regions, on delete set null) and
--    picked_grape_id (-> grapes, on delete set null); checks: never a typical
--    wine and a region together, and a grape only with a region (R7).
-- 2. record_training_attempt reads picked_region_id / picked_grape_id from
--    p_attempt on a fresh attempt ("no such region" / "no such grape" when
--    they name no row; a re-reveal keeps the stored pick, as before) and
--    scores a region pick (R6): country 2 and region 3 by the region's own
--    country_id / id, appellation 0, primary grape 8 when the picked grape is
--    the wine's primary grape, second grape 0 when the wine has one (null when
--    not), designation 0 when the wine has one (null when not), vintage as
--    before. A typical-wine pick scores exactly as before; possible_points and
--    D17's style verdict (which prefers the picked typical wine; a region pick
--    has none) are unchanged.
-- 3. EXECUTE re-granted to authenticated only (PUBLIC, anon, service_role
--    revoked), as 20260925120000 did.
--
-- Rule 1: nothing here reads or writes a tasting, glass, guess or answer key.
--
-- No begin/commit: the applier owns the transaction.

set local lock_timeout = '10s';

-- ---------------------------------------------------------------------------
-- Pre-state: fail closed unless live is what this file was written against.
-- ---------------------------------------------------------------------------
do $$
declare
  v_text text;
begin
  -- 1. The RPC this file recreates: one overload, the live body, its attributes.
  select string_agg(p.oid::regprocedure::text, ', ') into v_text
  from pg_proc p
  where p.pronamespace = 'public'::regnamespace and p.proname = 'record_training_attempt';
  if v_text is distinct from 'record_training_attempt(jsonb,jsonb,jsonb)' then
    raise exception 'record_training_attempt overloads are %, expected the one (jsonb,jsonb,jsonb)', coalesce(v_text, 'none');
  end if;
  if (select md5(replace(p.prosrc, chr(13), '')) from pg_proc p
       where p.oid = 'public.record_training_attempt(jsonb,jsonb,jsonb)'::regprocedure)
     is distinct from '79b65a0e38ea00be8b8adcc771abcc60' then
    raise exception 'record_training_attempt is not the 20260925120000 body this file recreates; re-read live before applying';
  end if;
  if not exists (select 1 from pg_proc p
                 where p.oid = 'public.record_training_attempt(jsonb,jsonb,jsonb)'::regprocedure
                   and p.prosecdef and p.proconfig::text = '{search_path=public}') then
    raise exception 'record_training_attempt is not SECURITY DEFINER with search_path public';
  end if;

  -- 2. What it calls without changing.
  select string_agg(s.sig, ', ') into v_text
  from (values
    ('public.save_wset_note(jsonb,jsonb)',                       '9ac29b18bbda5b08bcd9a12e19beb932'),
    ('public.wset_hue_fits_colour(wset_colour_hue,wine_colour)', '96339c7d5a5a84074ffc33db8e89d6ba')
  ) as s (sig, md5)
  left join pg_proc p on p.oid = to_regprocedure(s.sig)
  where p.oid is null or md5(replace(p.prosrc, chr(13), '')) <> s.md5;
  if v_text is not null then
    raise exception 'a function the RPC calls differs from live: %', v_text;
  end if;

  -- 3. training_attempts as 20260925120000 left it: no pick column added yet.
  select string_agg(a.attname, ', ' order by a.attnum) into v_text
  from pg_attribute a
  where a.attrelid = 'public.training_attempts'::regclass and a.attnum > 0 and not a.attisdropped;
  if v_text is distinct from
       'id, author_id, session_key, note_id, picked_archetype_id, guessed_vintage_kind, guessed_vintage_year, '
       || 'guessed_vintage_tawny_years, actual_catalog_wine_id, actual_archetype_id, note_colour_hue, hue_cleared, '
       || 'candidates_snapshot, country_points, region_points, appellation_points, primary_grape_points, '
       || 'secondary_grape_points, type_designation_points, vintage_points, total_points, possible_points, '
       || 'scored_at, created_at' then
    raise exception 'training_attempts columns differ from the live state this file was written against: %', v_text;
  end if;
  select string_agg(k.conname, ', ' order by k.conname::text collate "C") into v_text
  from pg_constraint k
  where k.conrelid = 'public.training_attempts'::regclass;
  if v_text is distinct from
       'training_attempts_actual_archetype_id_fkey, training_attempts_actual_catalog_wine_id_fkey, '
       || 'training_attempts_author_id_fkey, training_attempts_author_id_session_key_key, '
       || 'training_attempts_guessed_vintage_year_check, training_attempts_note_id_fkey, training_attempts_note_id_key, '
       || 'training_attempts_picked_archetype_id_fkey, training_attempts_pkey, training_attempts_scored_when_revealed, '
       || 'training_attempts_snapshot_is_array, training_attempts_vintage_tawny_shape, training_attempts_vintage_year_shape' then
    raise exception 'training_attempts constraints differ from the live state this file was written against: %', v_text;
  end if;

  -- 4. The two tables the new columns reference, keyed by uuid.
  if (select format_type(a.atttypid, null) from pg_attribute a
       where a.attrelid = 'public.regions'::regclass and a.attname = 'id') is distinct from 'uuid'
     or (select format_type(a.atttypid, null) from pg_attribute a
          where a.attrelid = 'public.grapes'::regclass and a.attname = 'id') is distinct from 'uuid' then
    raise exception 'regions.id or grapes.id is not a uuid';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1. The region pick (R7).
-- ---------------------------------------------------------------------------
alter table public.training_attempts
  add column picked_region_id uuid
    constraint training_attempts_picked_region_id_fkey references public.regions(id) on delete set null,
  add column picked_grape_id uuid
    constraint training_attempts_picked_grape_id_fkey references public.grapes(id) on delete set null,
  add constraint training_attempts_one_pick
    check (picked_archetype_id is null or picked_region_id is null),
  add constraint training_attempts_grape_needs_region
    check (picked_grape_id is null or picked_region_id is not null);

-- ---------------------------------------------------------------------------
-- 2. record_training_attempt: the 20260925120000 body with the region branch
--    (R6). Only the declarations, the fresh attempt's pick checks and insert,
--    and step 4's country, region and primary grape lines change.
-- ---------------------------------------------------------------------------
create or replace function public.record_training_attempt(p_note jsonb, p_aromas jsonb, p_attempt jsonb)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  -- The championship maxima (spec D7); the DB suite pins each to reveal_wine's.
  c_country constant smallint := 2;
  c_region constant smallint := 3;
  c_appellation constant smallint := 5;
  c_primary_grape constant smallint := 8;
  c_secondary_grape constant smallint := 2;
  c_type_designation constant smallint := 2;
  c_vintage constant smallint := 2;
  c_vintage_near constant smallint := 1;
  v_uid uuid := auth.uid();
  v_attempt training_attempts%rowtype;
  v_attempt_id uuid;
  v_session uuid;
  v_started timestamptz;
  v_wine_id uuid;
  v_wine catalog_wines%rowtype;
  v_pick_id uuid;
  v_pick wine_archetypes%rowtype;
  v_has_pick boolean := false;
  -- A pick that stopped at the region (region-guess addendum R6, R7).
  v_region_pick_id uuid;
  v_grape_pick_id uuid;
  v_region_country uuid;
  v_has_region boolean := false;
  v_note jsonb;
  v_hue wset_colour_hue;
  v_identities int;
  v_cleared boolean := false;
  v_note_id uuid;
  v_kind vintage_kind;
  v_score boolean := false;
  v_country smallint;
  v_region smallint;
  v_appellation smallint;
  v_primary smallint;
  v_secondary smallint;
  v_designation smallint;
  v_vintage smallint;
  v_actual uuid;
begin
  -- 1. Signed in.
  if v_uid is null then
    raise exception 'not signed in' using errcode = 'insufficient_privilege';
  end if;
  if p_attempt is null or jsonb_typeof(p_attempt) <> 'object' then
    raise exception 'the attempt must be an object' using errcode = 'invalid_parameter_value';
  end if;
  v_attempt_id := nullif(p_attempt ->> 'attempt_id', '')::uuid;
  v_wine_id := nullif(p_attempt ->> 'actual_catalog_wine_id', '')::uuid;
  if v_wine_id is not null then
    -- Read as the definer: "catalog read" may hide a blind_pending row from
    -- the caller, and the score is still computed (step 4).
    select * into v_wine from catalog_wines where id = v_wine_id;
    if not found then
      raise exception 'no such wine' using errcode = 'invalid_parameter_value';
    end if;
  end if;

  if v_attempt_id is null then
    -- 2. A fresh attempt, idempotent on (caller, session key): a second tab
    --    or a reload returns the first attempt unchanged.
    v_session := nullif(p_attempt ->> 'session_key', '')::uuid;
    if v_session is null then
      raise exception 'a session key is required' using errcode = 'invalid_parameter_value';
    end if;
    perform pg_advisory_xact_lock(hashtextextended('training-session:' || v_uid::text || ':' || v_session::text, 0));
    select * into v_attempt from training_attempts where author_id = v_uid and session_key = v_session;
    if not found then
      if p_note is null or jsonb_typeof(p_note) <> 'object' then
        raise exception 'the note must be an object' using errcode = 'invalid_parameter_value';
      end if;
      if nullif(p_note ->> 'id', '') is not null then
        raise exception 'a new session takes no note id' using errcode = 'insufficient_privilege';
      end if;
      if p_aromas is not null and jsonb_typeof(p_aromas) <> 'array' then
        raise exception 'the aromas must be a list' using errcode = 'invalid_parameter_value';
      end if;
      if jsonb_typeof(coalesce(p_attempt -> 'candidates_snapshot', '[]'::jsonb)) <> 'array' then
        raise exception 'the ranking must be a list' using errcode = 'invalid_parameter_value';
      end if;
      v_pick_id := nullif(p_attempt ->> 'picked_archetype_id', '')::uuid;
      if v_pick_id is not null and not exists (select 1 from wine_archetypes where id = v_pick_id) then
        raise exception 'no such typical wine' using errcode = 'invalid_parameter_value';
      end if;
      -- A region pick, optionally with a grape. The table's checks refuse a
      -- typical wine and a region together, and a grape without a region.
      v_region_pick_id := nullif(p_attempt ->> 'picked_region_id', '')::uuid;
      if v_region_pick_id is not null and not exists (select 1 from regions where id = v_region_pick_id) then
        raise exception 'no such region' using errcode = 'invalid_parameter_value';
      end if;
      v_grape_pick_id := nullif(p_attempt ->> 'picked_grape_id', '')::uuid;
      if v_grape_pick_id is not null and not exists (select 1 from grapes where id = v_grape_pick_id) then
        raise exception 'no such grape' using errcode = 'invalid_parameter_value';
      end if;
      v_started := coalesce(nullif(p_attempt ->> 'started_at', '')::timestamptz, now());
      v_hue := nullif(p_note ->> 'colour_hue', '')::wset_colour_hue;
      v_note := (p_note - 'id') || jsonb_build_object(
        'context_kind', 'TRAINING',
        'tasting_wine_id', null,
        'unidentified_wine_id', null,
        'catalog_wine_id', v_wine_id,
        'tasted_on', (v_started at time zone 'UTC')::date);
      -- 2b. A hue that does not fit the revealed wine's colour would be refused
      --     by wset_notes_check_hue: drop it from the note, keep it on the attempt.
      if v_wine_id is not null and not wset_hue_fits_colour(v_hue, v_wine.colour) then
        v_note := jsonb_set(v_note, '{colour_hue}', 'null'::jsonb);
        v_cleared := true;
      end if;
      v_note_id := save_wset_note(v_note, coalesce(p_aromas, '[]'::jsonb));
      v_kind := nullif(p_attempt ->> 'guessed_vintage_kind', '')::vintage_kind;
      insert into training_attempts (
        author_id, session_key, note_id, picked_archetype_id, picked_region_id, picked_grape_id,
        guessed_vintage_kind, guessed_vintage_year, guessed_vintage_tawny_years,
        note_colour_hue, hue_cleared, candidates_snapshot
      ) values (
        v_uid, v_session, v_note_id, v_pick_id, v_region_pick_id, v_grape_pick_id,
        v_kind,
        case when v_kind = 'YEAR' then (p_attempt ->> 'guessed_vintage_year')::smallint end,
        case when v_kind = 'TAWNY' then (p_attempt ->> 'guessed_vintage_tawny_years')::smallint end,
        v_hue, v_cleared, coalesce(p_attempt -> 'candidates_snapshot', '[]'::jsonb)
      )
      returning * into v_attempt;
      v_score := v_wine_id is not null;
    end if;
  else
    -- 3. A re-reveal of the caller's own unscored attempt: only the note's
    --    identity and the score are written; p_note, p_aromas, the pick, the
    --    vintage and the ranking are ignored.
    select * into v_attempt from training_attempts
     where id = v_attempt_id and author_id = v_uid
     for update;
    if not found then
      raise exception 'that session is not yours' using errcode = 'insufficient_privilege';
    end if;
    if v_attempt.scored_at is not null then
      raise exception 'already revealed' using errcode = 'P0001';
    end if;
    if v_wine_id is null then
      raise exception 'name the wine to reveal' using errcode = 'invalid_parameter_value';
    end if;
    select n.colour_hue, num_nonnulls(n.catalog_wine_id, n.unidentified_wine_id)
      into v_hue, v_identities
      from wset_notes n where n.id = v_attempt.note_id
     for update;
    if v_identities = 0 then
      v_cleared := not wset_hue_fits_colour(v_hue, v_wine.colour);
      update wset_notes
         set catalog_wine_id = v_wine_id,
             colour_hue = case when wset_hue_fits_colour(colour_hue, v_wine.colour) then colour_hue end
       where id = v_attempt.note_id and num_nonnulls(catalog_wine_id, unidentified_wine_id) = 0;
    end if;
    v_score := true;
  end if;

  -- 4. Score against the named wine with the picked archetype's FKs, grapes
  --    and designations, or with the picked region's own FKs and the picked
  --    grape; no pick scores 0 on every category that applies.
  if v_score then
    if v_attempt.picked_archetype_id is not null then
      select * into v_pick from wine_archetypes where id = v_attempt.picked_archetype_id;
      v_has_pick := found;
    end if;
    if not v_has_pick and v_attempt.picked_region_id is not null then
      select r.country_id into v_region_country from regions r where r.id = v_attempt.picked_region_id;
      v_has_region := found;
    end if;
    v_country := case
      when v_has_pick and v_pick.country_id = v_wine.country_id then c_country
      when v_has_region and v_region_country = v_wine.country_id then c_country
      else 0
    end;
    v_region := case
      when v_has_pick and v_pick.region_id = v_wine.region_id then c_region
      when v_has_region and v_attempt.picked_region_id = v_wine.region_id then c_region
      else 0
    end;
    v_appellation := case when v_has_pick and v_pick.appellation_id = v_wine.appellation_id then c_appellation else 0 end;
    v_primary := case
      when v_has_pick and v_pick.primary_grape_id = v_wine.primary_grape_id then c_primary_grape
      when v_has_region and v_attempt.picked_grape_id = v_wine.primary_grape_id then c_primary_grape
      else 0
    end;
    v_secondary := case
      when v_wine.secondary_grape_id is null then null
      when v_has_pick and v_pick.secondary_grape_id = v_wine.secondary_grape_id then c_secondary_grape
      else 0
    end;
    v_designation := case
      when v_wine.type_designation_id is null then null
      when v_has_pick and exists (select 1 from wine_archetype_designations d
                                   where d.archetype_id = v_pick.id
                                     and d.type_designation_id = v_wine.type_designation_id) then c_type_designation
      else 0
    end;
    -- reveal_wine's vintage rule; null when no vintage was guessed.
    v_vintage := case
      when v_attempt.guessed_vintage_kind is null then null
      when v_attempt.guessed_vintage_kind = v_wine.vintage_kind
        and v_wine.vintage_kind = 'NV' then c_vintage
      when v_attempt.guessed_vintage_kind = v_wine.vintage_kind
        and v_wine.vintage_kind = 'TAWNY'
        and v_attempt.guessed_vintage_tawny_years = v_wine.vintage_tawny_years then c_vintage
      when v_attempt.guessed_vintage_kind = v_wine.vintage_kind
        and v_wine.vintage_kind = 'YEAR'
        and v_attempt.guessed_vintage_year = v_wine.vintage_year then c_vintage
      when v_attempt.guessed_vintage_kind = v_wine.vintage_kind
        and v_wine.vintage_kind = 'YEAR'
        and abs(v_attempt.guessed_vintage_year - v_wine.vintage_year) = 1 then c_vintage_near
      else 0
    end;
    -- D17: the wine's own style. Same appellation, colour and style; else same
    -- region, primary grape, colour and style. Ties: the wine's designation,
    -- then the taster's pick, then an equal second grape, sort_order, id.
    select a.id into v_actual
      from wine_archetypes a
     where a.colour = v_wine.colour and a.style = v_wine.style
       and (a.appellation_id = v_wine.appellation_id
            or (a.region_id = v_wine.region_id and a.primary_grape_id = v_wine.primary_grape_id))
     order by (a.appellation_id = v_wine.appellation_id) desc,
              exists (select 1 from wine_archetype_designations d
                       where d.archetype_id = a.id
                         and d.type_designation_id = v_wine.type_designation_id) desc,
              (a.id is not distinct from v_attempt.picked_archetype_id) desc,
              (a.secondary_grape_id is not distinct from v_wine.secondary_grape_id) desc,
              a.sort_order,
              a.id
     limit 1;
    update training_attempts
       set actual_catalog_wine_id = v_wine_id,
           actual_archetype_id = v_actual,
           hue_cleared = v_cleared,
           country_points = v_country,
           region_points = v_region,
           appellation_points = v_appellation,
           primary_grape_points = v_primary,
           secondary_grape_points = v_secondary,
           type_designation_points = v_designation,
           vintage_points = v_vintage,
           total_points = v_country + v_region + v_appellation + v_primary
             + coalesce(v_secondary, 0) + coalesce(v_designation, 0) + coalesce(v_vintage, 0),
           possible_points = c_country + c_region + c_appellation + c_primary_grape
             + case when v_secondary is null then 0 else c_secondary_grape end
             + case when v_designation is null then 0 else c_type_designation end
             + case when v_vintage is null then 0 else c_vintage end,
           scored_at = now()
     where id = v_attempt.id
    returning * into v_attempt;
  end if;

  -- 5. The attempt as stored.
  return jsonb_build_object(
    'attempt_id', v_attempt.id,
    'note_id', v_attempt.note_id,
    'points', jsonb_build_object(
      'country', v_attempt.country_points,
      'region', v_attempt.region_points,
      'appellation', v_attempt.appellation_points,
      'primary_grape', v_attempt.primary_grape_points,
      'secondary_grape', v_attempt.secondary_grape_points,
      'type_designation', v_attempt.type_designation_points,
      'vintage', v_attempt.vintage_points),
    'total', v_attempt.total_points,
    'possible', v_attempt.possible_points,
    'actual_archetype_id', v_attempt.actual_archetype_id,
    'hue_cleared', v_attempt.hue_cleared);
end $$;

-- create or replace keeps the ACL; restated so this file alone says who may
-- call it (the 20260925120000 grant, and its OD-1 precedent: auth.uid() is
-- null for anon and service_role).
revoke all on function public.record_training_attempt(jsonb, jsonb, jsonb) from public, anon, service_role;
grant execute on function public.record_training_attempt(jsonb, jsonb, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Post-state, same transaction: every check a raise exception.
-- ---------------------------------------------------------------------------
do $$
declare
  v_text text;
begin
  -- 1. training_attempts: the columns of 20260925120000, then the two picks.
  select string_agg(format('%s %s%s%s', a.attname, t.typname,
                           case when a.attnotnull then ' not null' else '' end,
                           case when d.adbin is null then ''
                                else ' default ' || regexp_replace(pg_get_expr(d.adbin, d.adrelid), '\mpublic\.', '', 'g') end),
                    ', ' order by a.attnum)
    into v_text
  from pg_attribute a
  join pg_type t on t.oid = a.atttypid
  left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
  where a.attrelid = 'public.training_attempts'::regclass and a.attnum > 0 and not a.attisdropped;
  if v_text is distinct from
       'id uuid not null default gen_random_uuid(), author_id uuid not null, session_key uuid not null, '
       || 'note_id uuid not null, picked_archetype_id uuid, guessed_vintage_kind vintage_kind, '
       || 'guessed_vintage_year int2, guessed_vintage_tawny_years int2, actual_catalog_wine_id uuid, '
       || 'actual_archetype_id uuid, note_colour_hue wset_colour_hue, hue_cleared bool not null default false, '
       || 'candidates_snapshot jsonb not null default ''[]''::jsonb, country_points int2, region_points int2, '
       || 'appellation_points int2, primary_grape_points int2, secondary_grape_points int2, '
       || 'type_designation_points int2, vintage_points int2, total_points int2, possible_points int2, '
       || 'scored_at timestamptz, created_at timestamptz not null default now(), '
       || 'picked_region_id uuid, picked_grape_id uuid' then
    raise exception 'training_attempts columns differ from R7: %', v_text;
  end if;

  -- 2. Its constraints: the 13 of 20260925120000 plus the four of R7.
  select string_agg(format('%s %s', k.conname, regexp_replace(pg_get_constraintdef(k.oid), '\mpublic\.', '', 'g')),
                    '; ' order by k.conname::text collate "C")
    into v_text
  from pg_constraint k
  where k.conrelid = 'public.training_attempts'::regclass;
  if v_text is distinct from
       'training_attempts_actual_archetype_id_fkey FOREIGN KEY (actual_archetype_id) REFERENCES wine_archetypes(id) ON DELETE SET NULL; '
       || 'training_attempts_actual_catalog_wine_id_fkey FOREIGN KEY (actual_catalog_wine_id) REFERENCES catalog_wines(id) ON DELETE RESTRICT; '
       || 'training_attempts_author_id_fkey FOREIGN KEY (author_id) REFERENCES profiles(id) ON DELETE CASCADE; '
       || 'training_attempts_author_id_session_key_key UNIQUE (author_id, session_key); '
       || 'training_attempts_grape_needs_region CHECK (((picked_grape_id IS NULL) OR (picked_region_id IS NOT NULL))); '
       || 'training_attempts_guessed_vintage_year_check CHECK (((guessed_vintage_year >= 1900) AND (guessed_vintage_year <= 2100))); '
       || 'training_attempts_note_id_fkey FOREIGN KEY (note_id) REFERENCES wset_notes(id) ON DELETE CASCADE; '
       || 'training_attempts_note_id_key UNIQUE (note_id); '
       || 'training_attempts_one_pick CHECK (((picked_archetype_id IS NULL) OR (picked_region_id IS NULL))); '
       || 'training_attempts_picked_archetype_id_fkey FOREIGN KEY (picked_archetype_id) REFERENCES wine_archetypes(id) ON DELETE SET NULL; '
       || 'training_attempts_picked_grape_id_fkey FOREIGN KEY (picked_grape_id) REFERENCES grapes(id) ON DELETE SET NULL; '
       || 'training_attempts_picked_region_id_fkey FOREIGN KEY (picked_region_id) REFERENCES regions(id) ON DELETE SET NULL; '
       || 'training_attempts_pkey PRIMARY KEY (id); '
       || 'training_attempts_scored_when_revealed CHECK (((actual_catalog_wine_id IS NULL) = (scored_at IS NULL))); '
       || 'training_attempts_snapshot_is_array CHECK ((jsonb_typeof(candidates_snapshot) = ''array''::text)); '
       || 'training_attempts_vintage_tawny_shape CHECK (((guessed_vintage_kind IS DISTINCT FROM ''TAWNY''::vintage_kind) OR (guessed_vintage_tawny_years IS NOT NULL))); '
       || 'training_attempts_vintage_year_shape CHECK (((guessed_vintage_kind IS NULL) OR ((guessed_vintage_kind = ''YEAR''::vintage_kind) = (guessed_vintage_year IS NOT NULL))))' then
    raise exception 'training_attempts constraints differ from R7: %', v_text;
  end if;
  if exists (select 1 from public.training_attempts where picked_region_id is not null or picked_grape_id is not null) then
    raise exception 'an existing attempt gained a region or grape pick';
  end if;
  -- Still no client write and no column grant (20260925120000's lockdown).
  if exists (select 1 from pg_attribute t
             where t.attrelid = 'public.training_attempts'::regclass and t.attnum > 0 and t.attacl is not null) then
    raise exception 'training_attempts carries a column-level grant';
  end if;
  select string_agg(a.privilege_type, ',' order by a.privilege_type collate "C") into v_text
  from pg_class c, aclexplode(c.relacl) a
  where c.oid = 'public.training_attempts'::regclass and a.grantee = 'authenticated'::regrole;
  if v_text is distinct from 'SELECT' then
    raise exception 'authenticated table privileges on training_attempts are %, expected SELECT only', coalesce(v_text, '-');
  end if;

  -- 3. The RPC: attributes, the body this file wrote (md5 of prosrc with any
  --    CR stripped), and EXECUTE for its owner and authenticated only.
  if not exists (select 1 from pg_proc p
                 join pg_language l on l.oid = p.prolang
                 where p.oid = 'public.record_training_attempt(jsonb,jsonb,jsonb)'::regprocedure
                   and p.prosecdef and p.proconfig::text = '{search_path=public}' and p.provolatile = 'v'
                   and l.lanname = 'plpgsql' and format_type(p.prorettype, null) = 'jsonb' and not p.proretset
                   and pg_get_function_identity_arguments(p.oid) = 'p_note jsonb, p_aromas jsonb, p_attempt jsonb') then
    raise exception 'record_training_attempt attributes differ from 20260925120000';
  end if;
  select md5(replace(p.prosrc, chr(13), '')) into v_text
  from pg_proc p where p.oid = 'public.record_training_attempt(jsonb,jsonb,jsonb)'::regprocedure;
  if v_text is distinct from 'f6a24c83c24aaab34ab568dc6280083f' then
    raise exception 'record_training_attempt body is not the one this migration was written with (md5 %)', v_text;
  end if;
  select string_agg(x.g, ',' order by x.g collate "C") into v_text
  from (select distinct case when a.grantee = 0 then 'PUBLIC'
                             when a.grantee = p.proowner then 'OWNER'
                             else pg_get_userbyid(a.grantee)::text end as g
        from pg_proc p, aclexplode(p.proacl) a
        where p.oid = 'public.record_training_attempt(jsonb,jsonb,jsonb)'::regprocedure
          and a.privilege_type = 'EXECUTE') x;
  if v_text is distinct from 'OWNER,authenticated' then
    raise exception 'record_training_attempt EXECUTE is held by %, expected OWNER,authenticated', v_text;
  end if;
  if has_function_privilege('anon', 'public.record_training_attempt(jsonb,jsonb,jsonb)', 'EXECUTE')
     or has_function_privilege('service_role', 'public.record_training_attempt(jsonb,jsonb,jsonb)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.record_training_attempt(jsonb,jsonb,jsonb)', 'EXECUTE') then
    raise exception 'EXECUTE on record_training_attempt is not authenticated-only';
  end if;

  -- 4. What the RPC calls without changing it.
  select string_agg(s.sig, ', ') into v_text
  from (values
    ('public.save_wset_note(jsonb,jsonb)',                       '9ac29b18bbda5b08bcd9a12e19beb932'),
    ('public.wset_hue_fits_colour(wset_colour_hue,wine_colour)', '96339c7d5a5a84074ffc33db8e89d6ba')
  ) as s (sig, md5)
  left join pg_proc p on p.oid = to_regprocedure(s.sig)
  where p.oid is null or md5(replace(p.prosrc, chr(13), '')) <> s.md5;
  if v_text is not null then
    raise exception 'a function the RPC calls changed: %', v_text;
  end if;

  raise notice 'training region guess: % attempts, record_training_attempt md5 %',
    (select count(*) from public.training_attempts),
    (select md5(replace(p.prosrc, chr(13), '')) from pg_proc p
      where p.oid = 'public.record_training_attempt(jsonb,jsonb,jsonb)'::regprocedure);
end $$;
