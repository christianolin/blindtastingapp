-- Training room: the archetype scoring identity, signature aromas, archetype
-- designations, training attempts, the TRAINING note shape and the one RPC
-- that writes a session's result.
--
-- Spec: docs/superpowers/specs/2026-09-25-training-room-design.md (§4.1-§4.3,
-- §6.1-§6.4; D5, D7-D10, D14-D17). Plan:
-- docs/superpowers/plans/2026-09-25-training-room.md, Task 1. Additive for the
-- deployed app (D22): nothing it runs reads the new columns or tables, and
-- every live archetype keeps its map place.
--
-- Written against the LIVE state (read-only, 2026-09-25), never an older
-- migration file alone:
-- * wine_archetypes: 15 rows, all with a wine_place_id; primary_grape_id is
--   null on "A typical Sauternes" alone. The live names differ from the
--   spec's table in two places: "A typical Côte de Nuits" (not "... red") and
--   "A typical Côte de Beaune" (not "... (red)"; it is a WHITE, Chardonnay
--   archetype). Its constraints are the pkey, the two quality checks and
--   three foreign keys (wine_place_id ON DELETE CASCADE, primary and
--   secondary grape ON DELETE SET NULL).
-- * wine_archetype_aromas: 157 rows, primary key (archetype_id, term_id, kind).
-- * The back-fill's live spellings: regions Bourgogne, Champagne, Bordeaux,
--   Loire, Alsace, Rhône, Provence (France); appellations "Vosne-Romanée AOC",
--   "Bourgogne AOC", "Chablis AOC", "Petit Chablis AOC", "Cote Chalonnaise
--   AOC", "Macon AOC", "Champagne AOC", "Margaux AOC" (Bordeaux also holds a
--   bare "Margaux" that nothing references), "Sauternes AOC", "Sancerre AOC",
--   "Alsace AOC", "Côte-Rôtie AOC", "Châteauneuf-du-Pape AOC", "Bandol AOC";
--   grapes "Semillon" (no accent) and "Sauvignon Blanc". All NFC.
-- * wset_notes_one_identity admits exactly one identity, or none on a BLIND
--   note tied to a glass (20260914094500). wset_notes: 10 OPEN, 5 BLIND, 0
--   TRAINING rows.
-- * scrub_deleted_account(uuid) md5 5a08d60e3af617b6368d3a85cbe05f94 (the
--   20260925003000 body): recreated below with one statement added.
--   save_wset_note(jsonb,jsonb) md5 9ac29b18bbda5b08bcd9a12e19beb932 (SECURITY
--   INVOKER) and wset_hue_fits_colour(wset_colour_hue,wine_colour) md5
--   96339c7d5a5a84074ffc33db8e89d6ba are called, not changed.
-- * No training_attempts, wine_archetype_designations or
--   record_training_attempt in any signature.
--
-- What this migration does:
-- 1. wine_archetypes: wine_place_id nullable (D9); country_id, region_id,
--    appellation_id (D8) and typical_age_low/high (D10); the 15 live rows
--    back-filled by exact live name (spec §4.1), Sauternes' grapes
--    (Semillon, Sauvignon Blanc); then the three FKs and primary_grape_id
--    NOT NULL. primary_grape_id's foreign key becomes ON DELETE RESTRICT: SET
--    NULL on a NOT NULL column could only ever fail with a not-null error.
-- 2. wine_archetype_aromas.signature (D5).
-- 3. wine_archetype_designations (§4.3), RLS as wine_archetype_aromas.
-- 4. training_attempts (§6.1): SELECT own for authenticated, no client write.
-- 5. wset_notes_one_identity gains the TRAINING branch (§6.3, D15).
-- 6. scrub_deleted_account deletes the person's attempts (§6.4).
-- 7. record_training_attempt(jsonb, jsonb, jsonb) (§6.2), SECURITY DEFINER,
--    EXECUTE for authenticated only.
--
-- Rule 1: an attempt names a wine only after its taster revealed it, and only
-- to that taster; the note it writes is an ordinary note (public once it has
-- an identity, author-only before). No tasting, glass, guess or answer key is
-- read or written.
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
  -- 1. Nothing this migration creates exists yet.
  if to_regclass('public.training_attempts') is not null
     or to_regclass('public.wine_archetype_designations') is not null then
    raise exception 'training_attempts or wine_archetype_designations already exists; re-read live before applying';
  end if;
  select string_agg(p.oid::regprocedure::text, ', ') into v_text
  from pg_proc p
  where p.pronamespace = 'public'::regnamespace and p.proname = 'record_training_attempt';
  if v_text is not null then
    raise exception 'record_training_attempt already exists: %; re-read live before applying', v_text;
  end if;
  if exists (select 1 from information_schema.columns
             where table_schema = 'public'
               and ((table_name = 'wine_archetypes'
                     and column_name in ('country_id', 'region_id', 'appellation_id',
                                         'typical_age_low', 'typical_age_high'))
                    or (table_name = 'wine_archetype_aromas' and column_name = 'signature'))) then
    raise exception 'an archetype column this migration adds already exists';
  end if;

  -- 2. The 15 live archetypes, by name.
  select string_agg(a.name, ' | ' order by a.name collate "C") into v_text from public.wine_archetypes a;
  if v_text is distinct from
       'A typical Alsace Riesling | A typical Bandol | A typical Chablis | A typical Champagne | '
       || 'A typical Châteauneuf-du-Pape | A typical Côte Chalonnaise | A typical Côte de Beaune | '
       || 'A typical Côte de Nuits | A typical Côte-Rôtie | A typical Margaux | A typical Mâconnais | '
       || 'A typical Petit Chablis | A typical Sancerre | A typical Sauternes | A typical Vosne-Romanée' then
    raise exception 'wine_archetypes is not the 15 live rows this file back-fills: %', v_text;
  end if;
  if exists (select 1 from public.wine_archetypes where wine_place_id is null)
     or (select string_agg(name, ',') from public.wine_archetypes where primary_grape_id is null)
          is distinct from 'A typical Sauternes' then
    raise exception 'wine_archetypes place/grape nullability is not the live state (Sauternes alone lacks a grape)';
  end if;

  -- 3. Their constraints, and the aroma links' key.
  select string_agg(format('%s %s', k.conname, regexp_replace(pg_get_constraintdef(k.oid), '\mpublic\.', '', 'g')),
                    '; ' order by k.conname::text collate "C")
    into v_text
  from pg_constraint k
  where k.conrelid = 'public.wine_archetypes'::regclass;
  if v_text is distinct from
       'wine_archetypes_pkey PRIMARY KEY (id); '
       || 'wine_archetypes_primary_grape_id_fkey FOREIGN KEY (primary_grape_id) REFERENCES grapes(id) ON DELETE SET NULL; '
       || 'wine_archetypes_quality_high_check CHECK (((quality_high IS NULL) OR ((quality_high >= 50) AND (quality_high <= 100)))); '
       || 'wine_archetypes_quality_low_check CHECK (((quality_low IS NULL) OR ((quality_low >= 50) AND (quality_low <= 100)))); '
       || 'wine_archetypes_secondary_grape_id_fkey FOREIGN KEY (secondary_grape_id) REFERENCES grapes(id) ON DELETE SET NULL; '
       || 'wine_archetypes_wine_place_id_fkey FOREIGN KEY (wine_place_id) REFERENCES wine_places(id) ON DELETE CASCADE' then
    raise exception 'wine_archetypes constraints differ from the live state this file was written against: %', v_text;
  end if;
  if (select pg_get_constraintdef(k.oid) from pg_constraint k
       where k.conrelid = 'public.wine_archetype_aromas'::regclass and k.contype = 'p')
     is distinct from 'PRIMARY KEY (archetype_id, term_id, kind)' then
    raise exception 'wine_archetype_aromas primary key is not (archetype_id, term_id, kind)';
  end if;

  -- 4. The note constraint this file recreates.
  if (select pg_get_constraintdef(c.oid) from pg_constraint c
      where c.conrelid = 'public.wset_notes'::regclass and c.conname = 'wset_notes_one_identity')
     is distinct from
       'CHECK (((num_nonnulls(catalog_wine_id, unidentified_wine_id) = 1) OR '
       || '((num_nonnulls(catalog_wine_id, unidentified_wine_id) = 0) AND (tasting_wine_id IS NOT NULL) '
       || 'AND (context_kind = ''BLIND''::wset_note_context))))' then
    raise exception 'wset_notes_one_identity is not the live constraint this file was written against';
  end if;

  -- 5. The bodies recreated or called below.
  select string_agg(format('%s %s', s.sig, coalesce(md5(replace(p.prosrc, chr(13), '')), 'missing')), '; ')
    into v_text
  from (values
    ('public.scrub_deleted_account(uuid)',                     '5a08d60e3af617b6368d3a85cbe05f94'),
    ('public.save_wset_note(jsonb,jsonb)',                     '9ac29b18bbda5b08bcd9a12e19beb932'),
    ('public.wset_hue_fits_colour(wset_colour_hue,wine_colour)', '96339c7d5a5a84074ffc33db8e89d6ba')
  ) as s (sig, md5)
  left join pg_proc p on p.oid = to_regprocedure(s.sig)
  where p.oid is null or md5(replace(p.prosrc, chr(13), '')) <> s.md5;
  if v_text is not null then
    raise exception 'function bodies differ from the live ones this file was written against: %', v_text;
  end if;

  -- 6. The enum labels the RPC writes.
  if not ('TRAINING' = any (enum_range(null::wset_note_context)::text[]))
     or enum_range(null::vintage_kind)::text[] is distinct from array['YEAR', 'NV', 'TAWNY'] then
    raise exception 'wset_note_context lacks TRAINING or vintage_kind is not YEAR, NV, TAWNY';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1. wine_archetypes: the scoring identity (D8), typical age (D10), an
--    optional map place (D9).
-- ---------------------------------------------------------------------------
alter table public.wine_archetypes
  alter column wine_place_id drop not null,
  add column country_id uuid,
  add column region_id uuid,
  add column appellation_id uuid,
  add column typical_age_low smallint,
  add column typical_age_high smallint,
  add constraint wine_archetypes_typical_age_check check (
    (typical_age_low is null or typical_age_low >= 0)
    and (typical_age_high is null or typical_age_high >= 0)
    and (typical_age_low is null or typical_age_high is null or typical_age_low <= typical_age_high)
  );

-- The spec §4.1 back-fill, by the live spellings (header). District
-- archetypes take the regional row: "Cote de Nuits-Villages AOC" and "Cote de
-- Beaune AOC" are minor appellations, not the districts.
drop table if exists pg_temp._archetype_backfill;
create temp table _archetype_backfill on commit drop as
select f.archetype,
       array(select a.id from public.wine_archetypes a where a.name = f.archetype) as archetype_ids,
       array(select c.id from public.countries c where c.name = f.country) as country_ids,
       array(select r.id from public.regions r join public.countries c on c.id = r.country_id
              where c.name = f.country and r.name = f.region) as region_ids,
       array(select ap.id from public.appellations ap
               join public.regions r on r.id = ap.region_id
               join public.countries c on c.id = r.country_id
              where c.name = f.country and r.name = f.region and ap.name = f.appellation) as appellation_ids
from (values
  ('A typical Vosne-Romanée',       'France', 'Bourgogne', 'Vosne-Romanée AOC'),
  ('A typical Côte de Nuits',       'France', 'Bourgogne', 'Bourgogne AOC'),
  ('A typical Côte de Beaune',      'France', 'Bourgogne', 'Bourgogne AOC'),
  ('A typical Chablis',             'France', 'Bourgogne', 'Chablis AOC'),
  ('A typical Petit Chablis',       'France', 'Bourgogne', 'Petit Chablis AOC'),
  ('A typical Côte Chalonnaise',    'France', 'Bourgogne', 'Cote Chalonnaise AOC'),
  ('A typical Mâconnais',           'France', 'Bourgogne', 'Macon AOC'),
  ('A typical Champagne',           'France', 'Champagne', 'Champagne AOC'),
  ('A typical Margaux',             'France', 'Bordeaux',  'Margaux AOC'),
  ('A typical Sauternes',           'France', 'Bordeaux',  'Sauternes AOC'),
  ('A typical Sancerre',            'France', 'Loire',     'Sancerre AOC'),
  ('A typical Alsace Riesling',     'France', 'Alsace',    'Alsace AOC'),
  ('A typical Côte-Rôtie',          'France', 'Rhône',     'Côte-Rôtie AOC'),
  ('A typical Châteauneuf-du-Pape', 'France', 'Rhône',     'Châteauneuf-du-Pape AOC'),
  ('A typical Bandol',              'France', 'Provence',  'Bandol AOC')
) as f (archetype, country, region, appellation);

do $$
declare
  v_text text;
begin
  select string_agg(format('%s: archetype %s, country %s, region %s, appellation %s',
                           b.archetype, cardinality(b.archetype_ids), cardinality(b.country_ids),
                           cardinality(b.region_ids), cardinality(b.appellation_ids)), '; ')
    into v_text
  from _archetype_backfill b
  where cardinality(b.archetype_ids) <> 1 or cardinality(b.country_ids) <> 1
     or cardinality(b.region_ids) <> 1 or cardinality(b.appellation_ids) <> 1;
  if v_text is not null or (select count(*) from _archetype_backfill) <> 15 then
    raise exception 'a back-fill name does not resolve to exactly one live row: %', coalesce(v_text, 'row count');
  end if;
  if (select count(*) from public.grapes where name in ('Semillon', 'Sauvignon Blanc')) <> 2 then
    raise exception 'grapes Semillon and Sauvignon Blanc are not both live';
  end if;
end $$;

update public.wine_archetypes a
   set country_id = b.country_ids[1],
       region_id = b.region_ids[1],
       appellation_id = b.appellation_ids[1]
  from _archetype_backfill b
 where a.id = b.archetype_ids[1];

update public.wine_archetypes
   set primary_grape_id = (select g.id from public.grapes g where g.name = 'Semillon'),
       secondary_grape_id = (select g.id from public.grapes g where g.name = 'Sauvignon Blanc')
 where name = 'A typical Sauternes' and primary_grape_id is null;

alter table public.wine_archetypes
  alter column country_id set not null,
  alter column region_id set not null,
  alter column appellation_id set not null,
  alter column primary_grape_id set not null,
  add constraint wine_archetypes_country_id_fkey foreign key (country_id) references public.countries(id),
  add constraint wine_archetypes_region_id_fkey foreign key (region_id) references public.regions(id),
  add constraint wine_archetypes_appellation_id_fkey foreign key (appellation_id) references public.appellations(id);
alter table public.wine_archetypes drop constraint wine_archetypes_primary_grape_id_fkey;
alter table public.wine_archetypes add constraint wine_archetypes_primary_grape_id_fkey
  foreign key (primary_grape_id) references public.grapes(id) on delete restrict;
create index wine_archetypes_country_idx on public.wine_archetypes (country_id);
create index wine_archetypes_region_idx on public.wine_archetypes (region_id);
create index wine_archetypes_appellation_idx on public.wine_archetypes (appellation_id);

-- ---------------------------------------------------------------------------
-- 2. Signature aromas (D5): picking that exact term earns the bonus.
-- ---------------------------------------------------------------------------
alter table public.wine_archetype_aromas add column signature boolean not null default false;

-- ---------------------------------------------------------------------------
-- 3. Archetype designations (§4.3), RLS as wine_archetype_aromas.
-- ---------------------------------------------------------------------------
create table public.wine_archetype_designations (
  archetype_id uuid not null references public.wine_archetypes(id) on delete cascade,
  type_designation_id uuid not null references public.type_designations(id) on delete cascade,
  primary key (archetype_id, type_designation_id)
);
create index wine_archetype_designations_designation_idx
  on public.wine_archetype_designations (type_designation_id);
alter table public.wine_archetype_designations enable row level security;
create policy "archetype designations read" on public.wine_archetype_designations
  for select to authenticated using (true);
create policy "archetype designations write" on public.wine_archetype_designations
  for all to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_curator))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_curator));
revoke all on table public.wine_archetype_designations from public, anon;

-- ---------------------------------------------------------------------------
-- 4. training_attempts (§6.1, verbatim, with explicit constraint names).
-- ---------------------------------------------------------------------------
create table public.training_attempts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(id) on delete cascade,
  session_key uuid not null,
  note_id uuid not null unique references public.wset_notes(id) on delete cascade,
  picked_archetype_id uuid references public.wine_archetypes(id) on delete set null,
  guessed_vintage_kind vintage_kind,
  guessed_vintage_year smallint
    constraint training_attempts_guessed_vintage_year_check check (guessed_vintage_year between 1900 and 2100),
  guessed_vintage_tawny_years smallint,
  actual_catalog_wine_id uuid references public.catalog_wines(id) on delete restrict,
  actual_archetype_id uuid references public.wine_archetypes(id) on delete set null,
  note_colour_hue wset_colour_hue,
  hue_cleared boolean not null default false,
  candidates_snapshot jsonb not null default '[]',
  country_points smallint,
  region_points smallint,
  appellation_points smallint,
  primary_grape_points smallint,
  secondary_grape_points smallint,
  type_designation_points smallint,
  vintage_points smallint,
  total_points smallint,
  possible_points smallint,
  scored_at timestamptz,
  created_at timestamptz not null default now(),
  constraint training_attempts_author_id_session_key_key unique (author_id, session_key),
  constraint training_attempts_scored_when_revealed check ((actual_catalog_wine_id is null) = (scored_at is null)),
  constraint training_attempts_vintage_year_shape
    check (guessed_vintage_kind is null or (guessed_vintage_kind = 'YEAR') = (guessed_vintage_year is not null)),
  constraint training_attempts_vintage_tawny_shape
    check (guessed_vintage_kind is distinct from 'TAWNY' or guessed_vintage_tawny_years is not null),
  constraint training_attempts_snapshot_is_array check (jsonb_typeof(candidates_snapshot) = 'array')
);
create index training_attempts_history_idx on public.training_attempts (author_id, created_at desc, id desc);
alter table public.training_attempts enable row level security;
create policy "training attempts read own" on public.training_attempts
  for select to authenticated using (author_id = auth.uid());
revoke all on table public.training_attempts from public, anon, authenticated;
grant select on public.training_attempts to authenticated;

-- ---------------------------------------------------------------------------
-- 5. The TRAINING note shape (§6.3, D15): no identity and no glass until the
--    reveal. Every other shape is unchanged; the read policy already makes an
--    identity-less note author-only.
-- ---------------------------------------------------------------------------
alter table public.wset_notes drop constraint wset_notes_one_identity;
alter table public.wset_notes add constraint wset_notes_one_identity check (
  num_nonnulls(catalog_wine_id, unidentified_wine_id) = 1
  or (num_nonnulls(catalog_wine_id, unidentified_wine_id) = 0
      and tasting_wine_id is not null
      and context_kind = 'BLIND')
  or (num_nonnulls(catalog_wine_id, unidentified_wine_id) = 0
      and tasting_wine_id is null
      and context_kind = 'TRAINING')
);

-- ---------------------------------------------------------------------------
-- 6. scrub_deleted_account: 20260925003000's body with one addition, the
--    training_attempts delete in step 6 (every call), before the notes. The
--    note cascade would remove them anyway; explicit is clearer (§6.4).
--    `create or replace` keeps its ACL (owner only).
-- ---------------------------------------------------------------------------
create or replace function public.scrub_deleted_account(p_user_id uuid)
returns void language plpgsql volatile security definer set search_path = public as $$
declare
  v_deleted_at timestamptz;
  v_tasting uuid;
  v_gone int;
begin
  -- 0. Serialise on the profile. No profile: nothing of theirs is in public.
  select deleted_at into v_deleted_at from profiles where id = p_user_id for update;
  if not found then
    return;
  end if;

  if v_deleted_at is null then
    -- 1. Hosted, never started, nobody else JOINED or INVITED: nothing is recorded yet (D6a).
    delete from tastings t
     where t.host_id = p_user_id and t.status = 'DRAFT' and t.started_at is null
       and not exists (select 1 from tasting_participants p
                        where p.tasting_id = t.id and p.user_id <> p_user_id
                          and p.status in ('JOINED', 'INVITED'));
    -- 2. Every other hosted tasting that is not finished: finish it, reveal nothing (D6b).
    update tastings set status = 'CLOSED' where host_id = p_user_id and status <> 'CLOSED';
    -- 3. Their places (D6c).
    delete from tasting_places tp using tastings t
     where tp.tasting_id = t.id and t.host_id = p_user_id;
    -- 4. Seats in other people's never-started tastings: their glasses, then the seat (D7a).
    for v_tasting in
      select tp.tasting_id from tasting_participants tp join tastings t on t.id = tp.tasting_id
       where tp.user_id = p_user_id and t.host_id <> p_user_id
         and t.status = 'DRAFT' and t.started_at is null
    loop
      perform 1 from wines where tasting_id = v_tasting for update;
      delete from wines w using tasting_participants tp
       where w.tasting_id = v_tasting and w.contributor_participant_id = tp.id
         and tp.tasting_id = v_tasting and tp.user_id = p_user_id;
      get diagnostics v_gone = row_count;
      if v_gone > 0 then
        -- remove_flight_glass's two statements, so (tasting_id, position) never collides.
        with ordered as (select id, row_number() over (order by position) as ord
                           from wines where tasting_id = v_tasting)
        update wines w set position = -o.ord from ordered o where w.id = o.id;
        update wines set position = -position where tasting_id = v_tasting and position < 0;
      end if;
      delete from tasting_participants where tasting_id = v_tasting and user_id = p_user_id;
    end loop;
    -- 5. Started, unfinished tastings of others: an unanswered seat nothing points at (D7b).
    delete from tasting_participants tp using tastings t
     where tp.tasting_id = t.id and tp.user_id = p_user_id and t.host_id <> p_user_id
       and t.status <> 'CLOSED' and tp.status <> 'JOINED'
       and not exists (select 1 from guesses g where g.participant_id = tp.id)
       and not exists (select 1 from wines w where w.contributor_participant_id = tp.id);
  end if;

  -- 6. Only theirs; every call, so a later call sweeps what a leftover token wrote (D8, D12).
  -- The training room (20260925120000): attempts go before the notes they point at.
  delete from training_attempts where author_id = p_user_id;
  delete from wset_notes where author_id = p_user_id;
  delete from cellar_consumptions where owner_id = p_user_id;
  delete from cellar_lots where owner_id = p_user_id;
  delete from friend_requests where requester_id = p_user_id or recipient_id = p_user_id;
  delete from friendships where user_id = p_user_id or friend_id = p_user_id;
  delete from platform_invites where inviter_id = p_user_id;
  delete from wine_pour_intents where owner_id = p_user_id;
  delete from wine_identity_drafts where owner_id = p_user_id;
  delete from label_reads where user_id = p_user_id;
  if to_regclass('public.auth_sessions') is not null then
    execute 'delete from public.auth_sessions where user_id = $1' using p_user_id;
  end if;
  if to_regclass('public.auth_tokens') is not null then
    execute 'delete from public.auth_tokens where user_id = $1' using p_user_id;
  end if;
  if to_regclass('public.auth_credentials') is not null then
    execute 'delete from public.auth_credentials where user_id = $1' using p_user_id;
  end if;

  -- 7. Scrub and stamp last: deleted_at marks a completed run (D5).
  if v_deleted_at is null then
    update profiles
       set display_name = 'Deleted user',
           email = 'deleted+' || p_user_id::text || '@blindr.invalid',
           avatar_url = null, bio = null, location = null, phone = null,
           favorite_wine_type = null, last_seen_at = null,
           role = 'MEMBER', cellar_visibility = 'PRIVATE', preferred_currency = 'DKK',
           deleted_at = now()
     where id = p_user_id;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 7. record_training_attempt (§6.2, steps 1-5). SECURITY DEFINER: the note is
--    written through save_wset_note, which runs here as the table owner with
--    RLS bypassed, so this function enforces what the policies would (D14):
--    the caller is signed in; the note is forced to TRAINING, no glass, no
--    unidentified wine, the revealed catalog wine (or none); a fresh attempt
--    takes no client note id; a re-reveal touches only the caller's own row.
--    Points are the championship table's (D7), defined once here and pinned
--    to reveal_wine's by scripts/training-room.test.mjs.
-- ---------------------------------------------------------------------------
create function public.record_training_attempt(p_note jsonb, p_aromas jsonb, p_attempt jsonb)
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
        author_id, session_key, note_id, picked_archetype_id,
        guessed_vintage_kind, guessed_vintage_year, guessed_vintage_tawny_years,
        note_colour_hue, hue_cleared, candidates_snapshot
      ) values (
        v_uid, v_session, v_note_id, v_pick_id,
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
  --    and designations; a missing pick scores 0 on every category that applies.
  if v_score then
    if v_attempt.picked_archetype_id is not null then
      select * into v_pick from wine_archetypes where id = v_attempt.picked_archetype_id;
      v_has_pick := found;
    end if;
    v_country := case when v_has_pick and v_pick.country_id = v_wine.country_id then c_country else 0 end;
    v_region := case when v_has_pick and v_pick.region_id = v_wine.region_id then c_region else 0 end;
    v_appellation := case when v_has_pick and v_pick.appellation_id = v_wine.appellation_id then c_appellation else 0 end;
    v_primary := case when v_has_pick and v_pick.primary_grape_id = v_wine.primary_grape_id then c_primary_grape else 0 end;
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

-- Supabase's default privileges grant EXECUTE on a new function to PUBLIC,
-- anon, authenticated and service_role. auth.uid() is null for anon and
-- service_role, so they lose it too (the transfer_tasting_host OD-1 precedent).
revoke all on function public.record_training_attempt(jsonb, jsonb, jsonb) from public, anon, service_role;
grant execute on function public.record_training_attempt(jsonb, jsonb, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Post-state, same transaction: every check a raise exception.
-- ---------------------------------------------------------------------------
do $$
declare
  v_fn record;
  v_text text;
begin
  -- 1. wine_archetypes: the new and changed columns.
  select string_agg(format('%s %s%s', a.attname, t.typname, case when a.attnotnull then ' not null' else '' end),
                    ', ' order by a.attname::text collate "C")
    into v_text
  from pg_attribute a
  join pg_type t on t.oid = a.atttypid
  where a.attrelid = 'public.wine_archetypes'::regclass and not a.attisdropped
    and a.attname in ('wine_place_id', 'country_id', 'region_id', 'appellation_id', 'primary_grape_id',
                      'typical_age_low', 'typical_age_high');
  if v_text is distinct from
       'appellation_id uuid not null, country_id uuid not null, primary_grape_id uuid not null, '
       || 'region_id uuid not null, typical_age_high int2, typical_age_low int2, wine_place_id uuid' then
    raise exception 'wine_archetypes columns differ from spec §4.1: %', v_text;
  end if;

  -- 2. Its constraints and the three new indexes.
  select string_agg(format('%s %s', k.conname, regexp_replace(pg_get_constraintdef(k.oid), '\mpublic\.', '', 'g')),
                    '; ' order by k.conname::text collate "C")
    into v_text
  from pg_constraint k
  where k.conrelid = 'public.wine_archetypes'::regclass;
  if v_text is distinct from
       'wine_archetypes_appellation_id_fkey FOREIGN KEY (appellation_id) REFERENCES appellations(id); '
       || 'wine_archetypes_country_id_fkey FOREIGN KEY (country_id) REFERENCES countries(id); '
       || 'wine_archetypes_pkey PRIMARY KEY (id); '
       || 'wine_archetypes_primary_grape_id_fkey FOREIGN KEY (primary_grape_id) REFERENCES grapes(id) ON DELETE RESTRICT; '
       || 'wine_archetypes_quality_high_check CHECK (((quality_high IS NULL) OR ((quality_high >= 50) AND (quality_high <= 100)))); '
       || 'wine_archetypes_quality_low_check CHECK (((quality_low IS NULL) OR ((quality_low >= 50) AND (quality_low <= 100)))); '
       || 'wine_archetypes_region_id_fkey FOREIGN KEY (region_id) REFERENCES regions(id); '
       || 'wine_archetypes_secondary_grape_id_fkey FOREIGN KEY (secondary_grape_id) REFERENCES grapes(id) ON DELETE SET NULL; '
       || 'wine_archetypes_typical_age_check CHECK ((((typical_age_low IS NULL) OR (typical_age_low >= 0)) AND '
       || '((typical_age_high IS NULL) OR (typical_age_high >= 0)) AND '
       || '((typical_age_low IS NULL) OR (typical_age_high IS NULL) OR (typical_age_low <= typical_age_high)))); '
       || 'wine_archetypes_wine_place_id_fkey FOREIGN KEY (wine_place_id) REFERENCES wine_places(id) ON DELETE CASCADE' then
    raise exception 'wine_archetypes constraints differ from spec §4.1: %', v_text;
  end if;
  if (select count(*) from pg_indexes i
       where i.schemaname = 'public' and i.tablename = 'wine_archetypes'
         and i.indexname in ('wine_archetypes_country_idx', 'wine_archetypes_region_idx',
                             'wine_archetypes_appellation_idx')) <> 3 then
    raise exception 'an index on the three new wine_archetypes foreign keys is missing';
  end if;

  -- 3. The back-fill, row by row (spec §4.1), and Sauternes' grapes.
  select string_agg(format('%s -> %s / %s / %s', a.name, c.name, r.name, ap.name), '; ' order by a.name collate "C")
    into v_text
  from public.wine_archetypes a
  join public.countries c on c.id = a.country_id
  join public.regions r on r.id = a.region_id
  join public.appellations ap on ap.id = a.appellation_id;
  if v_text is distinct from
       'A typical Alsace Riesling -> France / Alsace / Alsace AOC; '
       || 'A typical Bandol -> France / Provence / Bandol AOC; '
       || 'A typical Chablis -> France / Bourgogne / Chablis AOC; '
       || 'A typical Champagne -> France / Champagne / Champagne AOC; '
       || 'A typical Châteauneuf-du-Pape -> France / Rhône / Châteauneuf-du-Pape AOC; '
       || 'A typical Côte Chalonnaise -> France / Bourgogne / Cote Chalonnaise AOC; '
       || 'A typical Côte de Beaune -> France / Bourgogne / Bourgogne AOC; '
       || 'A typical Côte de Nuits -> France / Bourgogne / Bourgogne AOC; '
       || 'A typical Côte-Rôtie -> France / Rhône / Côte-Rôtie AOC; '
       || 'A typical Margaux -> France / Bordeaux / Margaux AOC; '
       || 'A typical Mâconnais -> France / Bourgogne / Macon AOC; '
       || 'A typical Petit Chablis -> France / Bourgogne / Petit Chablis AOC; '
       || 'A typical Sancerre -> France / Loire / Sancerre AOC; '
       || 'A typical Sauternes -> France / Bordeaux / Sauternes AOC; '
       || 'A typical Vosne-Romanée -> France / Bourgogne / Vosne-Romanée AOC' then
    raise exception 'the back-fill is not spec §4.1''s table: %', v_text;
  end if;
  if (select format('%s / %s', g1.name, g2.name)
        from public.wine_archetypes a
        join public.grapes g1 on g1.id = a.primary_grape_id
        join public.grapes g2 on g2.id = a.secondary_grape_id
       where a.name = 'A typical Sauternes') is distinct from 'Semillon / Sauvignon Blanc' then
    raise exception 'A typical Sauternes is not Semillon / Sauvignon Blanc';
  end if;
  if exists (select 1 from public.wine_archetypes where wine_place_id is null) then
    raise exception 'a live archetype lost its map place';
  end if;

  -- 4. Signature aromas: a new column, false on every existing link.
  if not exists (select 1 from pg_attribute a
                 join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
                 where a.attrelid = 'public.wine_archetype_aromas'::regclass and a.attname = 'signature'
                   and a.atttypid = 'boolean'::regtype and a.attnotnull
                   and pg_get_expr(d.adbin, d.adrelid) = 'false')
     or exists (select 1 from public.wine_archetype_aromas where signature) then
    raise exception 'wine_archetype_aromas.signature is not boolean not null default false, false everywhere';
  end if;

  -- 5. wine_archetype_designations: its key, both cascades, RLS and the two policies.
  select string_agg(format('%s %s', k.conname, regexp_replace(pg_get_constraintdef(k.oid), '\mpublic\.', '', 'g')),
                    '; ' order by k.conname::text collate "C")
    into v_text
  from pg_constraint k
  where k.conrelid = 'public.wine_archetype_designations'::regclass;
  if v_text is distinct from
       'wine_archetype_designations_archetype_id_fkey FOREIGN KEY (archetype_id) REFERENCES wine_archetypes(id) ON DELETE CASCADE; '
       || 'wine_archetype_designations_pkey PRIMARY KEY (archetype_id, type_designation_id); '
       || 'wine_archetype_designations_type_designation_id_fkey FOREIGN KEY (type_designation_id) REFERENCES type_designations(id) ON DELETE CASCADE' then
    raise exception 'wine_archetype_designations constraints differ from spec §4.3: %', v_text;
  end if;
  select string_agg(format('%s %s %s %s', p.polname, p.polcmd, p.polroles::regrole[]::text,
                           case when p.polcmd = 'r' then pg_get_expr(p.polqual, p.polrelid)
                                when pg_get_expr(p.polqual, p.polrelid) like '%is_curator%'
                                     and pg_get_expr(p.polwithcheck, p.polrelid) like '%is_curator%' then 'curator'
                                else 'other' end),
                    '; ' order by p.polname::text collate "C")
    into v_text
  from pg_policy p
  where p.polrelid = 'public.wine_archetype_designations'::regclass;
  if v_text is distinct from
       'archetype designations read r {authenticated} true; archetype designations write * {authenticated} curator'
     or not (select c.relrowsecurity from pg_class c where c.oid = 'public.wine_archetype_designations'::regclass)
     or has_table_privilege('anon', 'public.wine_archetype_designations', 'SELECT') then
    raise exception 'wine_archetype_designations RLS is not "read: authenticated, write: curators": %', v_text;
  end if;

  -- 6. training_attempts: the columns of spec §6.1, in order.
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
       || 'scored_at timestamptz, created_at timestamptz not null default now()' then
    raise exception 'training_attempts columns differ from spec §6.1: %', v_text;
  end if;

  -- 7. Its constraints and the history index.
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
       || 'training_attempts_guessed_vintage_year_check CHECK (((guessed_vintage_year >= 1900) AND (guessed_vintage_year <= 2100))); '
       || 'training_attempts_note_id_fkey FOREIGN KEY (note_id) REFERENCES wset_notes(id) ON DELETE CASCADE; '
       || 'training_attempts_note_id_key UNIQUE (note_id); '
       || 'training_attempts_picked_archetype_id_fkey FOREIGN KEY (picked_archetype_id) REFERENCES wine_archetypes(id) ON DELETE SET NULL; '
       || 'training_attempts_pkey PRIMARY KEY (id); '
       || 'training_attempts_scored_when_revealed CHECK (((actual_catalog_wine_id IS NULL) = (scored_at IS NULL))); '
       || 'training_attempts_snapshot_is_array CHECK ((jsonb_typeof(candidates_snapshot) = ''array''::text)); '
       || 'training_attempts_vintage_tawny_shape CHECK (((guessed_vintage_kind IS DISTINCT FROM ''TAWNY''::vintage_kind) OR (guessed_vintage_tawny_years IS NOT NULL))); '
       || 'training_attempts_vintage_year_shape CHECK (((guessed_vintage_kind IS NULL) OR ((guessed_vintage_kind = ''YEAR''::vintage_kind) = (guessed_vintage_year IS NOT NULL))))' then
    raise exception 'training_attempts constraints differ from spec §6.1: %', v_text;
  end if;
  if not exists (select 1 from pg_indexes i
                 where i.schemaname = 'public' and i.tablename = 'training_attempts'
                   and i.indexname = 'training_attempts_history_idx'
                   and i.indexdef like '% USING btree (author_id, created_at DESC, id DESC)') then
    raise exception 'training_attempts_history_idx is missing or is not (author_id, created_at desc, id desc)';
  end if;

  -- 8. RLS on (not forced), exactly the one read policy; authenticated holds
  --    SELECT alone, anon and PUBLIC nothing, no column grant anywhere.
  if not exists (select 1 from pg_class c
                 where c.oid = 'public.training_attempts'::regclass and c.relrowsecurity and not c.relforcerowsecurity) then
    raise exception 'training_attempts row level security is not enabled, or is forced';
  end if;
  select string_agg(format('%s %s %s %s %s %s', p.polname, p.polcmd,
                           case when p.polpermissive then 'permissive' else 'restrictive' end,
                           p.polroles::regrole[]::text,
                           coalesce(pg_get_expr(p.polqual, p.polrelid), '-'),
                           coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '-')),
                    '; ' order by p.polname::text collate "C")
    into v_text
  from pg_policy p
  where p.polrelid = 'public.training_attempts'::regclass;
  if v_text is distinct from 'training attempts read own r permissive {authenticated} (author_id = auth.uid()) -' then
    raise exception 'training_attempts policies differ from spec §6.1: %', v_text;
  end if;
  if exists (select 1 from pg_class c, aclexplode(c.relacl) a
             where c.oid = 'public.training_attempts'::regclass and (a.grantee = 0 or a.grantee = 'anon'::regrole)) then
    raise exception 'anon or PUBLIC holds a table privilege on training_attempts';
  end if;
  select string_agg(a.privilege_type, ',' order by a.privilege_type collate "C") into v_text
  from pg_class c, aclexplode(c.relacl) a
  where c.oid = 'public.training_attempts'::regclass and a.grantee = 'authenticated'::regrole;
  if v_text is distinct from 'SELECT' then
    raise exception 'authenticated table privileges on training_attempts are %, expected SELECT only', coalesce(v_text, '-');
  end if;
  if exists (select 1 from pg_attribute t
             where t.attrelid = 'public.training_attempts'::regclass and t.attnum > 0 and t.attacl is not null) then
    raise exception 'training_attempts carries a column-level grant';
  end if;

  -- 9. The note constraint's three shapes (spec §6.3).
  if (select pg_get_constraintdef(c.oid) from pg_constraint c
      where c.conrelid = 'public.wset_notes'::regclass and c.conname = 'wset_notes_one_identity')
     is distinct from
       'CHECK (((num_nonnulls(catalog_wine_id, unidentified_wine_id) = 1) OR '
       || '((num_nonnulls(catalog_wine_id, unidentified_wine_id) = 0) AND (tasting_wine_id IS NOT NULL) '
       || 'AND (context_kind = ''BLIND''::wset_note_context)) OR '
       || '((num_nonnulls(catalog_wine_id, unidentified_wine_id) = 0) AND (tasting_wine_id IS NULL) '
       || 'AND (context_kind = ''TRAINING''::wset_note_context))))' then
    raise exception 'wset_notes_one_identity is not spec §6.3''s constraint';
  end if;

  -- 10. Every function this file creates or recreates: security, search_path,
  --     volatility, language, return type, arguments, body (md5 of prosrc with
  --     any CR stripped) and who holds EXECUTE ("OWNER" is the owner).
  for v_fn in
    select s.sig, s.rettype, s.args, s.body_md5, s.grantees,
           p.oid, p.prosecdef, p.proconfig::text as config_now, p.provolatile::text as volatile_now,
           l.lanname, format_type(p.prorettype, null) as rettype_now, p.proretset,
           pg_get_function_identity_arguments(p.oid) as args_now,
           md5(replace(p.prosrc, chr(13), '')) as md5_now,
           (select string_agg(x.g, ',' order by x.g collate "C")
            from (select distinct case when a.grantee = 0 then 'PUBLIC'
                                       when a.grantee = p.proowner then 'OWNER'
                                       else pg_get_userbyid(a.grantee)::text end as g
                  from aclexplode(p.proacl) a
                  where a.privilege_type = 'EXECUTE') x) as grantees_now
    from (values
      ('public.record_training_attempt(jsonb,jsonb,jsonb)', 'jsonb', 'p_note jsonb, p_aromas jsonb, p_attempt jsonb',
       '79b65a0e38ea00be8b8adcc771abcc60', 'OWNER,authenticated'),
      ('public.scrub_deleted_account(uuid)', 'void', 'p_user_id uuid', 'b9aa8d71a00dda3aec526a2ec6950f1d', 'OWNER')
    ) as s (sig, rettype, args, body_md5, grantees)
    left join pg_proc p on p.oid = to_regprocedure(s.sig)
    left join pg_language l on l.oid = p.prolang
  loop
    if v_fn.oid is null then
      raise exception '% does not exist post-migration', v_fn.sig;
    end if;
    if not v_fn.prosecdef
       or v_fn.config_now is distinct from '{search_path=public}'
       or v_fn.volatile_now is distinct from 'v'
       or v_fn.lanname is distinct from 'plpgsql'
       or v_fn.rettype_now is distinct from v_fn.rettype
       or v_fn.proretset
       or v_fn.args_now is distinct from v_fn.args then
      raise exception '% attributes differ: security definer %, config %, volatility %, language %, returns % (set %), arguments (%)',
        v_fn.sig, v_fn.prosecdef, v_fn.config_now, v_fn.volatile_now, v_fn.lanname, v_fn.rettype_now,
        v_fn.proretset, v_fn.args_now;
    end if;
    if v_fn.md5_now is distinct from v_fn.body_md5 then
      raise exception '% body is not the one this migration was written with (md5 %)', v_fn.sig, v_fn.md5_now;
    end if;
    if v_fn.grantees_now is distinct from v_fn.grantees then
      raise exception '% EXECUTE is held by %, expected %', v_fn.sig, v_fn.grantees_now, v_fn.grantees;
    end if;
  end loop;
  if has_function_privilege('anon', 'public.record_training_attempt(jsonb,jsonb,jsonb)', 'EXECUTE')
     or has_function_privilege('service_role', 'public.record_training_attempt(jsonb,jsonb,jsonb)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.record_training_attempt(jsonb,jsonb,jsonb)', 'EXECUTE') then
    raise exception 'EXECUTE on record_training_attempt is not authenticated-only';
  end if;

  -- 11. What the RPC calls without changing it.
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

  raise notice 'training room: % archetypes back-filled; training_attempts acl %',
    (select count(*) from public.wine_archetypes where appellation_id is not null),
    (select c.relacl::text from pg_class c where c.oid = 'public.training_attempts'::regclass);
end $$;
