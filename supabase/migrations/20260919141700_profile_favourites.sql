-- profile_favourites: favourite regions and favourite producers on a profile
-- (several of each, picked from the reference tables), in place of the
-- retired favourite wine type.
--
-- Spec: docs/superpowers/specs/2026-09-19-profile-favourites.md (§3 is the
-- SQL design this file implements, the SQL between the banners below
-- verbatim; D1-D14 are its decisions). Owner, 2026-09-19: "instead of having
-- the favorite wine type - i really dont like that, delete it - it would be
-- nice to be able to add favourite regions and favourite producers (multiple
-- both) from a dropdown."
--
-- Written against the LIVE state (read-only queries, 2026-09-19), never an
-- older migration file:
-- * Latest live migration 20260919101300 (account deletion); no
--   schema_migrations row for 20260919141700; no table, function or trigger
--   of any name this file creates.
-- * profiles: PRIMARY KEY (id); deleted_at timestamptz, nullable, stamped
--   once by scrub_deleted_account (its last statement) and made write-once
--   by profiles_deleted_guard; exactly two non-internal triggers,
--   profiles_deleted_guard (BEFORE INSERT OR UPDATE, tgtype 23) and
--   profiles_sync_is_curator (BEFORE INSERT OR UPDATE OF role, tgtype 23);
--   client UPDATE is the nine-column grant pinned below (favorite_wine_type
--   stays in it: the column is kept, D1).
-- * scrub_deleted_account(uuid) (md5 bad163a7d72fcab774936383dc1b6f2a) takes
--   the profile row FOR UPDATE at step 0 and stamps deleted_at last;
--   profiles_deleted_guard() md5 605da26c81c9a0a4ff813595c10b79f1. Neither is
--   recreated here: the scrub's body stays pinned, and a person's favourites
--   leave with the account through a trigger on profiles instead (D5).
-- * regions (427 rows = 381 named + 46 per-country "None" sentinels),
--   producers (33,771) and countries (46): id uuid PRIMARY KEY, name text not
--   null (regions.country_id uuid not null); each readable by authenticated
--   through "reference read" (true).
-- * Supabase's default privileges (pg_default_acl for postgres in public)
--   grant anon, authenticated and service_role every privilege on a new table
--   and EXECUTE on a new function (plus PUBLIC): the revokes below undo that,
--   and the post-state block asserts the result, not the default.
--
-- What this migration does (spec §3.2-§3.6):
-- 1. profile_favourite_regions (profile_id, region_id, position, created_at)
--    and profile_favourite_producers (profile_id, producer_id, position,
--    created_at): primary key (profile_id, region_id|producer_id), so one row
--    per favourite; profile_id -> profiles ON DELETE CASCADE; region_id /
--    producer_id -> regions / producers NO ACTION, indexed, so a merge or
--    cleanup that forgets these tables fails loudly instead of silently
--    dropping someone's favourite (D8); position 1..10, unique per person and
--    deferrable (checked per statement, so one update can reorder a full
--    set): at most 10 rows per person per table, whoever writes (D2, D3).
-- 2. RLS: every signed-in viewer reads (public like the rest of a profile;
--    phone is the only private profile field); insert, update and delete own
--    rows only. authenticated holds SELECT and DELETE, INSERT on exactly
--    (profile_id, region_id|producer_id, position) and UPDATE on position
--    only; anon and PUBLIC nothing; service_role keeps the defaults (D4).
-- 3. A BEFORE INSERT guard per table (SECURITY DEFINER): no row for a deleted
--    profile ("this account has been deleted"), no "None" sentinel region
--    ("that region cannot be a favourite", D7), and the friendly 10-limit
--    message; the position range and unique stay the race-free floor (D3).
-- 4. profiles_deleted_drop_favourites: AFTER UPDATE OF deleted_at on
--    profiles, only when it goes from null to set, deletes both favourite
--    sets inside the stamping transaction (D5).
-- 5. set_profile_favourites(p_region_ids uuid[], p_producer_ids uuid[]):
--    SECURITY INVOKER; locks the caller's profile row FOR UPDATE, then
--    replaces both sets in list order (position = list index). EXECUTE for
--    authenticated only (revoked from PUBLIC, anon and service_role:
--    auth.uid() is null for it; the transfer_tasting_host OD-1 precedent)
--    (D6).
--
-- Security (spec §3.8):
-- * Nothing here reaches a hidden glass (rule 1): these tables reference only
--   profiles, regions and producers.
-- * The RPC adds no privilege: it is SECURITY INVOKER, so RLS, the column
--   grants and the guards are the floor; it only makes "replace the set"
--   atomic. A client can never move a favourite onto another profile, region
--   or producer (UPDATE is on position alone) and never sets created_at.
-- * Deletion versus a leftover access token: the guard reads the profile row
--   FOR SHARE, which conflicts with the scrub's step-0 FOR UPDATE (and any
--   other UPDATE of that row), so an insert either commits first and is
--   removed by the drop trigger, or waits and then sees deleted_at.
--
-- Deployed code once applied: nothing in src/ reads or writes these tables or
-- calls the RPC yet (the app half of the spec adds the settings fields and
-- the read helper); the migration is applied before that deploy. Every
-- existing profiles write is unaffected: the new trigger fires only on an
-- UPDATE whose SET names deleted_at, and only when it goes from null to set.
--
-- No begin/commit: the applier owns the transaction.

set local lock_timeout = '10s';

-- ---------------------------------------------------------------------------
-- Pre-state: fail closed unless live is what this file was written against.
-- ---------------------------------------------------------------------------
do $$
declare
  v_text text;
  v_bad text;
begin
  -- 1. Nothing this migration creates exists yet: create table would fail
  --    halfway, and a same-named function or trigger would be ambiguous.
  if to_regclass('public.profile_favourite_regions') is not null
     or to_regclass('public.profile_favourite_producers') is not null then
    raise exception 'a profile favourites table already exists; re-read live before applying';
  end if;
  select string_agg(p.oid::regprocedure::text, ', ') into v_text
  from pg_proc p
  where p.pronamespace = 'public'::regnamespace
    and p.proname in ('profile_favourite_regions_guard', 'profile_favourite_producers_guard',
                      'drop_deleted_profile_favourites', 'set_profile_favourites');
  if v_text is not null then
    raise exception 'a function this migration creates already exists: %; re-read live before applying', v_text;
  end if;
  select string_agg(format('%s.%s', t.tgrelid::regclass::text, t.tgname), ', ') into v_text
  from pg_trigger t
  where t.tgname in ('profiles_deleted_drop_favourites', 'profile_favourite_regions_guard', 'profile_favourite_producers_guard');
  if v_text is not null then
    raise exception 'a trigger this migration creates already exists: %', v_text;
  end if;

  -- 2. profiles as account deletion left it: the key the tables reference,
  --    deleted_at, exactly its two triggers, the nine-column client UPDATE grant.
  if not exists (select 1 from pg_constraint k
                 where k.conrelid = 'public.profiles'::regclass and k.contype = 'p'
                   and pg_get_constraintdef(k.oid) = 'PRIMARY KEY (id)')
     or not exists (select 1 from pg_attribute a
                    where a.attrelid = 'public.profiles'::regclass and a.attname = 'deleted_at' and not a.attisdropped
                      and a.atttypid = 'timestamptz'::regtype and not a.attnotnull) then
    raise exception 'profiles has no PRIMARY KEY (id) or no nullable deleted_at timestamptz';
  end if;
  select string_agg(format('%s %s %s', t.tgname, t.tgtype, t.tgfoid::regprocedure::text), '; ' order by t.tgname::text collate "C")
    into v_text
  from pg_trigger t
  where t.tgrelid = 'public.profiles'::regclass and not t.tgisinternal;
  if v_text is distinct from
       'profiles_deleted_guard 23 profiles_deleted_guard(); profiles_sync_is_curator 23 sync_is_curator_from_role()' then
    raise exception 'profiles triggers differ from the live state this file was written against: %', v_text;
  end if;
  select string_agg(format('%s:%s', a.attname, x.privilege_type), ',' order by a.attname::text collate "C", x.privilege_type collate "C")
    into v_text
  from pg_attribute a, aclexplode(a.attacl) x
  where a.attrelid = 'public.profiles'::regclass and a.attnum > 0 and not a.attisdropped;
  if v_text is distinct from
       'avatar_url:UPDATE,bio:UPDATE,cellar_visibility:UPDATE,display_name:UPDATE,favorite_wine_type:UPDATE,'
       || 'last_seen_at:UPDATE,location:UPDATE,phone:UPDATE,preferred_currency:UPDATE' then
    raise exception 'profiles column privileges differ from the nine-column grant: %', coalesce(v_text, '-');
  end if;

  -- 3. The account-deletion bodies this relies on: the scrub takes the profile
  --    row FOR UPDATE first and stamps deleted_at last; the guard refuses a
  --    client write to a deleted row (md5 of prosrc with any CR stripped).
  select string_agg(format('%s %s', s.sig, coalesce(md5(replace(p.prosrc, chr(13), '')), 'missing')), '; ')
    into v_bad
  from (values
    ('public.scrub_deleted_account(uuid)', 'bad163a7d72fcab774936383dc1b6f2a'),
    ('public.profiles_deleted_guard()',    '605da26c81c9a0a4ff813595c10b79f1')
  ) as s (sig, md5)
  left join pg_proc p on p.oid = to_regprocedure(s.sig)
  where p.oid is null or md5(replace(p.prosrc, chr(13), '')) <> s.md5;
  if v_bad is not null then
    raise exception 'account-deletion bodies differ from the live ones this file was written against: %', v_bad;
  end if;

  -- 4. The reference tables the favourites point at, and their read policy
  --    (the pickers and the read helper need it).
  select string_agg(format('%s.%s %s%s', c.relname, a.attname, t.typname, case when a.attnotnull then ' not null' else '' end),
                    ', ' order by c.relname::text collate "C", a.attname::text collate "C")
    into v_text
  from pg_attribute a
  join pg_class c on c.oid = a.attrelid
  join pg_type t on t.oid = a.atttypid
  where a.attrelid in ('public.regions'::regclass, 'public.producers'::regclass, 'public.countries'::regclass)
    and a.attname in ('id', 'name', 'country_id') and not a.attisdropped;
  if v_text is distinct from
       'countries.id uuid not null, countries.name text not null, producers.id uuid not null, producers.name text not null, '
       || 'regions.country_id uuid not null, regions.id uuid not null, regions.name text not null' then
    raise exception 'reference columns differ: %', v_text;
  end if;
  select string_agg(format('%s %s', c.relname, pg_get_constraintdef(k.oid)), '; ' order by c.relname::text collate "C")
    into v_text
  from pg_constraint k join pg_class c on c.oid = k.conrelid
  where k.conrelid in ('public.regions'::regclass, 'public.producers'::regclass) and k.contype = 'p';
  if v_text is distinct from 'producers PRIMARY KEY (id); regions PRIMARY KEY (id)' then
    raise exception 'regions/producers primary keys differ: %', v_text;
  end if;
  select string_agg(format('%s %s %s %s', c.relname, p.polcmd, p.polroles::regrole[]::text, pg_get_expr(p.polqual, p.polrelid)),
                    '; ' order by c.relname::text collate "C")
    into v_text
  from pg_policy p join pg_class c on c.oid = p.polrelid
  where p.polrelid in ('public.regions'::regclass, 'public.producers'::regclass, 'public.countries'::regclass)
    and p.polcmd = 'r';
  if v_text is distinct from
       'countries r {authenticated} true; producers r {authenticated} true; regions r {authenticated} true' then
    raise exception 'reference read policies differ: %', v_text;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Spec §3.2, verbatim: the two tables, RLS and grants (D2, D3, D4, D8).
-- ---------------------------------------------------------------------------
create table public.profile_favourite_regions (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  region_id uuid not null references public.regions(id),
  position smallint not null,
  created_at timestamptz not null default now(),
  constraint profile_favourite_regions_pkey primary key (profile_id, region_id),
  constraint profile_favourite_regions_position_range check (position between 1 and 10),
  constraint profile_favourite_regions_position_key unique (profile_id, position) deferrable initially immediate
);
create index profile_favourite_regions_region_idx on public.profile_favourite_regions (region_id);

create table public.profile_favourite_producers (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  producer_id uuid not null references public.producers(id),
  position smallint not null,
  created_at timestamptz not null default now(),
  constraint profile_favourite_producers_pkey primary key (profile_id, producer_id),
  constraint profile_favourite_producers_position_range check (position between 1 and 10),
  constraint profile_favourite_producers_position_key unique (profile_id, position) deferrable initially immediate
);
create index profile_favourite_producers_producer_idx on public.profile_favourite_producers (producer_id);

alter table public.profile_favourite_regions enable row level security;
create policy "profile favourite regions read" on public.profile_favourite_regions
  for select to authenticated using (true);
create policy "profile favourite regions insert own" on public.profile_favourite_regions
  for insert to authenticated with check (profile_id = auth.uid());
create policy "profile favourite regions update own" on public.profile_favourite_regions
  for update to authenticated using (profile_id = auth.uid()) with check (profile_id = auth.uid());
create policy "profile favourite regions delete own" on public.profile_favourite_regions
  for delete to authenticated using (profile_id = auth.uid());

alter table public.profile_favourite_producers enable row level security;
create policy "profile favourite producers read" on public.profile_favourite_producers
  for select to authenticated using (true);
create policy "profile favourite producers insert own" on public.profile_favourite_producers
  for insert to authenticated with check (profile_id = auth.uid());
create policy "profile favourite producers update own" on public.profile_favourite_producers
  for update to authenticated using (profile_id = auth.uid()) with check (profile_id = auth.uid());
create policy "profile favourite producers delete own" on public.profile_favourite_producers
  for delete to authenticated using (profile_id = auth.uid());

revoke all on table public.profile_favourite_regions from public, anon, authenticated;
grant select, delete on public.profile_favourite_regions to authenticated;
grant insert (profile_id, region_id, position) on public.profile_favourite_regions to authenticated;
grant update (position) on public.profile_favourite_regions to authenticated;

revoke all on table public.profile_favourite_producers from public, anon, authenticated;
grant select, delete on public.profile_favourite_producers to authenticated;
grant insert (profile_id, producer_id, position) on public.profile_favourite_producers to authenticated;
grant update (position) on public.profile_favourite_producers to authenticated;

-- ---------------------------------------------------------------------------
-- Spec §3.3, verbatim: the insert guards (D3, D5, D7).
-- ---------------------------------------------------------------------------
create function public.profile_favourite_regions_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_deleted_at timestamptz;
begin
  -- FOR SHARE waits out an account-deletion scrub in flight (it holds this
  -- row FOR UPDATE until it commits) and then reads the committed deleted_at.
  select p.deleted_at into v_deleted_at from profiles p where p.id = new.profile_id for share;
  if v_deleted_at is not null then
    raise exception 'this account has been deleted' using errcode = 'insufficient_privilege';
  end if;
  if exists (select 1 from regions r where r.id = new.region_id and r.name = 'None') then
    raise exception 'that region cannot be a favourite' using errcode = 'check_violation';
  end if;
  if (select count(*) from profile_favourite_regions f where f.profile_id = new.profile_id) >= 10 then
    raise exception 'you can pick up to 10 favourite regions' using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger profile_favourite_regions_guard before insert on public.profile_favourite_regions
  for each row execute function public.profile_favourite_regions_guard();

create function public.profile_favourite_producers_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_deleted_at timestamptz;
begin
  -- FOR SHARE waits out an account-deletion scrub in flight (it holds this
  -- row FOR UPDATE until it commits) and then reads the committed deleted_at.
  select p.deleted_at into v_deleted_at from profiles p where p.id = new.profile_id for share;
  if v_deleted_at is not null then
    raise exception 'this account has been deleted' using errcode = 'insufficient_privilege';
  end if;
  if (select count(*) from profile_favourite_producers f where f.profile_id = new.profile_id) >= 10 then
    raise exception 'you can pick up to 10 favourite producers' using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger profile_favourite_producers_guard before insert on public.profile_favourite_producers
  for each row execute function public.profile_favourite_producers_guard();

-- ---------------------------------------------------------------------------
-- Spec §3.4, verbatim: account deletion takes a person's favourites with it
-- (D5). scrub_deleted_account is not recreated.
-- ---------------------------------------------------------------------------
create function public.drop_deleted_profile_favourites()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  delete from profile_favourite_regions where profile_id = new.id;
  delete from profile_favourite_producers where profile_id = new.id;
  return null;
end $$;
create trigger profiles_deleted_drop_favourites after update of deleted_at on public.profiles
  for each row when (old.deleted_at is null and new.deleted_at is not null)
  execute function public.drop_deleted_profile_favourites();

-- ---------------------------------------------------------------------------
-- Spec §3.5, verbatim: replace both sets in one call (D6).
-- ---------------------------------------------------------------------------
create function public.set_profile_favourites(p_region_ids uuid[], p_producer_ids uuid[])
returns void language plpgsql volatile security invoker set search_path = public as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not signed in' using errcode = 'insufficient_privilege';
  end if;
  if p_region_ids is null or p_producer_ids is null
     or array_ndims(p_region_ids) > 1 or array_ndims(p_producer_ids) > 1 then
    raise exception 'favourites must be two lists of ids' using errcode = 'invalid_parameter_value';
  end if;
  if cardinality(p_region_ids) > 10 then
    raise exception 'you can pick up to 10 favourite regions' using errcode = 'check_violation';
  end if;
  if cardinality(p_producer_ids) > 10 then
    raise exception 'you can pick up to 10 favourite producers' using errcode = 'check_violation';
  end if;
  if exists (select 1 from unnest(p_region_ids) x group by x having count(*) > 1) then
    raise exception 'each region can be picked once' using errcode = 'unique_violation';
  end if;
  if exists (select 1 from unnest(p_producer_ids) x group by x having count(*) > 1) then
    raise exception 'each producer can be picked once' using errcode = 'unique_violation';
  end if;
  -- One save at a time per person, and never alongside the account-deletion scrub.
  perform 1 from profiles where id = v_uid for update;
  delete from profile_favourite_regions where profile_id = v_uid;
  delete from profile_favourite_producers where profile_id = v_uid;
  insert into profile_favourite_regions (profile_id, region_id, position)
    select v_uid, x.id, x.ord::smallint from unnest(p_region_ids) with ordinality as x (id, ord);
  insert into profile_favourite_producers (profile_id, producer_id, position)
    select v_uid, x.id, x.ord::smallint from unnest(p_producer_ids) with ordinality as x (id, ord);
end $$;

-- ---------------------------------------------------------------------------
-- Spec §3.6, verbatim: EXECUTE. Firing a trigger never checks EXECUTE, so the
-- three trigger functions are owner-only.
-- ---------------------------------------------------------------------------
revoke all on function public.profile_favourite_regions_guard()   from public, anon, authenticated, service_role;
revoke all on function public.profile_favourite_producers_guard() from public, anon, authenticated, service_role;
revoke all on function public.drop_deleted_profile_favourites()   from public, anon, authenticated, service_role;
revoke all on function public.set_profile_favourites(uuid[], uuid[]) from public, anon, service_role;
grant execute on function public.set_profile_favourites(uuid[], uuid[]) to authenticated;

-- ---------------------------------------------------------------------------
-- Post-state, same transaction: every check a raise exception (spec §3.7).
-- ---------------------------------------------------------------------------
do $$
declare
  v_text text;
  v_bad text;
  v_deleted_attnum int2;
begin
  -- 1. Columns, in order, with types, nullability and defaults.
  select string_agg(format('%s.%s %s%s%s', c.relname, a.attname, t.typname,
                           case when a.attnotnull then ' not null' else '' end,
                           case when d.adbin is null then '' else ' default ' || pg_get_expr(d.adbin, d.adrelid) end),
                    ', ' order by c.relname::text collate "C", a.attnum)
    into v_text
  from pg_attribute a
  join pg_class c on c.oid = a.attrelid
  join pg_type t on t.oid = a.atttypid
  left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
  where a.attrelid in ('public.profile_favourite_regions'::regclass, 'public.profile_favourite_producers'::regclass)
    and a.attnum > 0 and not a.attisdropped;
  if v_text is distinct from
       'profile_favourite_producers.profile_id uuid not null, profile_favourite_producers.producer_id uuid not null, '
       || 'profile_favourite_producers.position int2 not null, profile_favourite_producers.created_at timestamptz not null default now(), '
       || 'profile_favourite_regions.profile_id uuid not null, profile_favourite_regions.region_id uuid not null, '
       || 'profile_favourite_regions.position int2 not null, profile_favourite_regions.created_at timestamptz not null default now()' then
    raise exception 'profile favourites columns differ from the spec: %', v_text;
  end if;

  -- 2. Constraints by name (the 10-limit floor is the position range plus the
  --    per-person position unique, deferrable so one statement can reorder),
  --    and the two reference indexes.
  select string_agg(format('%s %s', k.conname, pg_get_constraintdef(k.oid)), '; ' order by k.conname::text collate "C")
    into v_text
  from pg_constraint k
  where k.conrelid in ('public.profile_favourite_regions'::regclass, 'public.profile_favourite_producers'::regclass);
  if v_text is distinct from
       'profile_favourite_producers_pkey PRIMARY KEY (profile_id, producer_id); '
       || 'profile_favourite_producers_position_key UNIQUE (profile_id, "position") DEFERRABLE; '
       || 'profile_favourite_producers_position_range CHECK ((("position" >= 1) AND ("position" <= 10))); '
       || 'profile_favourite_producers_producer_id_fkey FOREIGN KEY (producer_id) REFERENCES producers(id); '
       || 'profile_favourite_producers_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE; '
       || 'profile_favourite_regions_pkey PRIMARY KEY (profile_id, region_id); '
       || 'profile_favourite_regions_position_key UNIQUE (profile_id, "position") DEFERRABLE; '
       || 'profile_favourite_regions_position_range CHECK ((("position" >= 1) AND ("position" <= 10))); '
       || 'profile_favourite_regions_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE; '
       || 'profile_favourite_regions_region_id_fkey FOREIGN KEY (region_id) REFERENCES regions(id)' then
    raise exception 'profile favourites constraints differ from the spec: %', v_text;
  end if;
  if not exists (select 1 from pg_indexes i where i.schemaname = 'public' and i.indexname = 'profile_favourite_regions_region_idx'
                   and i.indexdef like '% USING btree (region_id)')
     or not exists (select 1 from pg_indexes i where i.schemaname = 'public' and i.indexname = 'profile_favourite_producers_producer_idx'
                      and i.indexdef like '% USING btree (producer_id)') then
    raise exception 'a profile favourites reference index is missing';
  end if;

  -- 3. RLS on, not forced; exactly the four policies per table.
  if (select count(*) from pg_class c
      where c.oid in ('public.profile_favourite_regions'::regclass, 'public.profile_favourite_producers'::regclass)
        and c.relrowsecurity and not c.relforcerowsecurity) <> 2 then
    raise exception 'profile favourites row level security is not enabled on both tables, or is forced';
  end if;
  select string_agg(format('%s %s %s %s %s %s', p.polname, p.polcmd, case when p.polpermissive then 'permissive' else 'restrictive' end,
                           p.polroles::regrole[]::text,
                           coalesce(pg_get_expr(p.polqual, p.polrelid), '-'),
                           coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '-')),
                    '; ' order by p.polname::text collate "C")
    into v_text
  from pg_policy p
  where p.polrelid in ('public.profile_favourite_regions'::regclass, 'public.profile_favourite_producers'::regclass);
  if v_text is distinct from
       'profile favourite producers delete own d permissive {authenticated} (profile_id = auth.uid()) -; '
       || 'profile favourite producers insert own a permissive {authenticated} - (profile_id = auth.uid()); '
       || 'profile favourite producers read r permissive {authenticated} true -; '
       || 'profile favourite producers update own w permissive {authenticated} (profile_id = auth.uid()) (profile_id = auth.uid()); '
       || 'profile favourite regions delete own d permissive {authenticated} (profile_id = auth.uid()) -; '
       || 'profile favourite regions insert own a permissive {authenticated} - (profile_id = auth.uid()); '
       || 'profile favourite regions read r permissive {authenticated} true -; '
       || 'profile favourite regions update own w permissive {authenticated} (profile_id = auth.uid()) (profile_id = auth.uid())' then
    raise exception 'profile favourites policies differ from the spec: %', v_text;
  end if;

  -- 4. Privileges: anon and PUBLIC nothing; authenticated SELECT + DELETE at
  --    table level, INSERT on the three client columns, UPDATE on position;
  --    service_role keeps Supabase's defaults (checked one privilege at a
  --    time: has_table_privilege with a list is true if any one is held).
  if exists (select 1 from pg_class c, aclexplode(c.relacl) a
             where c.oid in ('public.profile_favourite_regions'::regclass, 'public.profile_favourite_producers'::regclass)
               and (a.grantee = 0 or a.grantee = 'anon'::regrole))
     or exists (select 1 from pg_attribute t, aclexplode(t.attacl) a
                where t.attrelid in ('public.profile_favourite_regions'::regclass, 'public.profile_favourite_producers'::regclass)
                  and a.grantee <> 'authenticated'::regrole) then
    raise exception 'anon, PUBLIC or another role holds a privilege on a profile favourites table';
  end if;
  select string_agg(format('%s:%s', c.relname, a.privilege_type), ',' order by c.relname::text collate "C", a.privilege_type collate "C")
    into v_text
  from pg_class c, aclexplode(c.relacl) a
  where c.oid in ('public.profile_favourite_regions'::regclass, 'public.profile_favourite_producers'::regclass)
    and a.grantee = 'authenticated'::regrole;
  if v_text is distinct from
       'profile_favourite_producers:DELETE,profile_favourite_producers:SELECT,'
       || 'profile_favourite_regions:DELETE,profile_favourite_regions:SELECT' then
    raise exception 'authenticated table privileges on the profile favourites tables are %', coalesce(v_text, '-');
  end if;
  select string_agg(format('%s.%s:%s', c.relname, t.attname, a.privilege_type), ','
                    order by c.relname::text collate "C", t.attnum, a.privilege_type collate "C")
    into v_text
  from pg_attribute t
  join pg_class c on c.oid = t.attrelid,
  lateral aclexplode(t.attacl) a
  where t.attrelid in ('public.profile_favourite_regions'::regclass, 'public.profile_favourite_producers'::regclass)
    and t.attnum > 0 and not t.attisdropped;
  if v_text is distinct from
       'profile_favourite_producers.profile_id:INSERT,profile_favourite_producers.producer_id:INSERT,'
       || 'profile_favourite_producers.position:INSERT,profile_favourite_producers.position:UPDATE,'
       || 'profile_favourite_regions.profile_id:INSERT,profile_favourite_regions.region_id:INSERT,'
       || 'profile_favourite_regions.position:INSERT,profile_favourite_regions.position:UPDATE' then
    raise exception 'column privileges on the profile favourites tables are %', coalesce(v_text, '-');
  end if;
  if has_column_privilege('authenticated', 'public.profile_favourite_regions', 'created_at', 'INSERT')
     or has_column_privilege('authenticated', 'public.profile_favourite_regions', 'region_id', 'UPDATE')
     or has_column_privilege('authenticated', 'public.profile_favourite_regions', 'profile_id', 'UPDATE')
     or has_column_privilege('authenticated', 'public.profile_favourite_producers', 'created_at', 'INSERT')
     or has_column_privilege('authenticated', 'public.profile_favourite_producers', 'producer_id', 'UPDATE')
     or has_column_privilege('authenticated', 'public.profile_favourite_producers', 'profile_id', 'UPDATE')
     or has_table_privilege('authenticated', 'public.profile_favourite_regions', 'TRUNCATE')
     or has_table_privilege('authenticated', 'public.profile_favourite_producers', 'TRUNCATE')
     or has_any_column_privilege('anon', 'public.profile_favourite_regions', 'SELECT')
     or has_any_column_privilege('anon', 'public.profile_favourite_producers', 'SELECT')
     or exists (select 1
                from unnest(array['public.profile_favourite_regions', 'public.profile_favourite_producers']) as tb (name),
                     unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE']) as pv (name)
                where not has_table_privilege('service_role', tb.name, pv.name)) then
    raise exception 'profile favourites privileges are not the spec''s';
  end if;

  -- 5. The four functions: attributes, arguments, body (md5 of prosrc, CR
  --    stripped), and who holds EXECUTE ("OWNER" is the function owner).
  select string_agg(format('%s (md5 %s, EXECUTE %s)', s.sig, coalesce(md5(replace(p.prosrc, chr(13), '')), 'missing'),
                           coalesce((select string_agg(x.g, ',' order by x.g collate "C")
                                     from (select case when a.grantee = 0 then 'PUBLIC'
                                                       when a.grantee = p.proowner then 'OWNER'
                                                       else pg_get_userbyid(a.grantee)::text end as g
                                           from aclexplode(p.proacl) a where a.privilege_type = 'EXECUTE') x), '-')), '; ')
    into v_bad
  from (values
    ('public.profile_favourite_regions_guard()',        true,  'trigger', '',                                         'feeb1b66770a48b5ca9574c12d80fe01', 'OWNER'),
    ('public.profile_favourite_producers_guard()',      true,  'trigger', '',                                         'c48de703f2d2ecd12a276b0b743d90d9', 'OWNER'),
    ('public.drop_deleted_profile_favourites()',        true,  'trigger', '',                                         '493c75a30f9cd62145bc8e4f1685dcf4', 'OWNER'),
    ('public.set_profile_favourites(uuid[],uuid[])',    false, 'void',    'p_region_ids uuid[], p_producer_ids uuid[]', 'a5ab6b12e7484badfc0d5a7880cbfc2c', 'OWNER,authenticated')
  ) as s (sig, secdef, rettype, args, md5, grantees)
  left join pg_proc p on p.oid = to_regprocedure(s.sig)
  left join pg_language l on l.oid = p.prolang
  where p.oid is null
     or p.prosecdef <> s.secdef
     or p.proconfig is distinct from array['search_path=public']
     or l.lanname <> 'plpgsql'
     or p.provolatile <> 'v'
     or p.proretset
     or format_type(p.prorettype, null) <> s.rettype
     or pg_get_function_identity_arguments(p.oid) <> s.args
     or md5(replace(p.prosrc, chr(13), '')) <> s.md5
     or p.proacl is null
     or (select string_agg(x.g, ',' order by x.g collate "C")
         from (select case when a.grantee = 0 then 'PUBLIC'
                           when a.grantee = p.proowner then 'OWNER'
                           else pg_get_userbyid(a.grantee)::text end as g
               from aclexplode(p.proacl) a where a.privilege_type = 'EXECUTE') x) is distinct from s.grantees;
  if v_bad is not null then
    raise exception 'profile favourites functions differ from the spec: %', v_bad;
  end if;
  if has_function_privilege('anon', 'public.set_profile_favourites(uuid[],uuid[])', 'EXECUTE')
     or has_function_privilege('service_role', 'public.set_profile_favourites(uuid[],uuid[])', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.set_profile_favourites(uuid[],uuid[])', 'EXECUTE') then
    raise exception 'set_profile_favourites EXECUTE is not authenticated only';
  end if;

  -- 6. Triggers: one BEFORE INSERT guard per table (tgtype 7); on profiles the
  --    two account-deletion triggers plus the AFTER UPDATE OF deleted_at drop
  --    (tgtype 17), firing only when deleted_at goes from null to set.
  select attnum into v_deleted_attnum from pg_attribute
   where attrelid = 'public.profiles'::regclass and attname = 'deleted_at' and not attisdropped;
  select string_agg(format('%s.%s %s %s %s %s', t.tgrelid::regclass::text, t.tgname, t.tgtype, t.tgenabled,
                           t.tgfoid::regprocedure::text, coalesce(nullif(t.tgattr::text, ''), '-')),
                    '; ' order by t.tgrelid::regclass::text collate "C", t.tgname::text collate "C")
    into v_text
  from pg_trigger t
  where not t.tgisinternal
    and t.tgrelid in ('public.profiles'::regclass, 'public.profile_favourite_regions'::regclass,
                      'public.profile_favourite_producers'::regclass);
  if v_text is distinct from
       'profile_favourite_producers.profile_favourite_producers_guard 7 O profile_favourite_producers_guard() -; '
       || 'profile_favourite_regions.profile_favourite_regions_guard 7 O profile_favourite_regions_guard() -; '
       || format('profiles.profiles_deleted_drop_favourites 17 O drop_deleted_profile_favourites() %s; ', v_deleted_attnum)
       || 'profiles.profiles_deleted_guard 23 O profiles_deleted_guard() -; '
       || 'profiles.profiles_sync_is_curator 23 O sync_is_curator_from_role() 11' then
    raise exception 'profile favourites triggers are "%"', v_text;
  end if;
  if not exists (select 1 from pg_trigger t
                 where t.tgrelid = 'public.profiles'::regclass and t.tgname = 'profiles_deleted_drop_favourites'
                   and pg_get_triggerdef(t.oid) like '% WHEN (((old.deleted_at IS NULL) AND (new.deleted_at IS NOT NULL))) EXECUTE %') then
    raise exception 'profiles_deleted_drop_favourites does not fire only when deleted_at goes from null to set';
  end if;

  -- 7. What this relies on without changing it: the account-deletion bodies
  --    and the nine-column profiles grant (favorite_wine_type stays in it).
  select string_agg(s.sig, ', ') into v_bad
  from (values
    ('public.scrub_deleted_account(uuid)', 'bad163a7d72fcab774936383dc1b6f2a'),
    ('public.profiles_deleted_guard()',    '605da26c81c9a0a4ff813595c10b79f1')
  ) as s (sig, md5)
  left join pg_proc p on p.oid = to_regprocedure(s.sig)
  where p.oid is null or md5(replace(p.prosrc, chr(13), '')) <> s.md5;
  if v_bad is not null then
    raise exception 'account-deletion bodies changed: %', v_bad;
  end if;
  select string_agg(format('%s:%s', a.attname, x.privilege_type), ',' order by a.attname::text collate "C", x.privilege_type collate "C")
    into v_text
  from pg_attribute a, aclexplode(a.attacl) x
  where a.attrelid = 'public.profiles'::regclass and a.attnum > 0 and not a.attisdropped;
  if v_text is distinct from
       'avatar_url:UPDATE,bio:UPDATE,cellar_visibility:UPDATE,display_name:UPDATE,favorite_wine_type:UPDATE,'
       || 'last_seen_at:UPDATE,location:UPDATE,phone:UPDATE,preferred_currency:UPDATE' then
    raise exception 'profiles column privileges changed: %', coalesce(v_text, '-');
  end if;

  -- 8. Neither table is in a publication (nothing streams favourites).
  if exists (select 1 from pg_publication_tables pt
             where pt.schemaname = 'public' and pt.tablename in ('profile_favourite_regions', 'profile_favourite_producers')) then
    raise exception 'a profile favourites table is in a publication';
  end if;

  -- Informational: the two tables' ACLs.
  select string_agg(format('%s %s', c.relname, c.relacl), '; ' order by c.relname::text collate "C") into v_text
  from pg_class c
  where c.oid in ('public.profile_favourite_regions'::regclass, 'public.profile_favourite_producers'::regclass);
  raise notice 'profile favourites: table acl %', v_text;
end $$;
