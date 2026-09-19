# Profile favourites — design

Date 2026-09-19. Base: branch `favourites` at `c6938f7` (= `origin/master`). The owner's request, verbatim: "instead of having the favorite wine type - i really dont like that, delete it - it would be nice to be able to add favourite regions and favourite producers (multiple both) from a dropdown."

Every live fact here was read on 2026-09-19 with read-only queries. §3's SQL (pre-state, core and post-state) was then applied to live inside one transaction, every §4 scenario was run against it in savepoints on the seeded `demo.*@blindr.invalid` accounts, and the transaction was rolled back. A live read afterwards showed nothing kept: no favourites table, no `set_profile_favourites`, no `profiles_deleted_drop_favourites` trigger, and 0 deleted profiles. The validated drafts are in this session's scratchpad (`…\scratchpad\favs-spec\pre.sql`, `core.sql`, `post.sql`, `dry.mjs`). They are a starting point only; this document is the contract.

## 1. Decisions

The task's decisions, as given, with the details this spec adds:

- **D1 Favourite wine type leaves the app; the column stays.** The settings field, its write in `updateProfile`, the Participants card info line and the `/u/<id>` badge all go (§5.7). `profiles.favorite_wine_type` stays in the database. Dropping it would permanently delete people's answers (10 of 33 live profiles have one: 6 `RED`, 1 each of `ORANGE`, `ROSE`, `WHITE`, `SPARKLING`), and the owner may drop it later. It also stays in the nine-column client UPDATE grant, and `scrub_deleted_account` still nulls it. Nothing in `src/` or `scripts/` reads or writes it any more. `src/lib/wine-types.ts` is still imported by `src/app/u/[id]/page.tsx`, which this build must not edit, so **this build keeps the file**. The main session deletes it at merge, in the same change that edits that page (§5.8).
- **D2 Two tables, same shape.** `profile_favourite_regions (profile_id, region_id, position, created_at)` and `profile_favourite_producers (profile_id, producer_id, position, created_at)`:
  - The primary key is `(profile_id, region_id)` / `(profile_id, producer_id)`, so a person cannot favourite the same row twice.
  - `profile_id` references `profiles` ON DELETE CASCADE. Profiles are never deleted (account deletion scrubs and keeps them), so the cascade only matters on a clean replay or for a future hard delete.
  - `position smallint` is 1-based and gives the order the person chose.
  - `created_at` defaults to `now()` and has no client grant. The RPC rewrites a person's whole set on every save (D6), so in practice it records when that set was last saved.
- **D3 At most 10 per person per table, enforced twice in the database.**
  - The floor is declarative and race-free: `check (position between 1 and 10)` plus `unique (profile_id, position)`. Ten slots and one row per slot means no more than 10 rows can exist, whoever writes, however many at once.
  - The unique is `DEFERRABLE INITIALLY IMMEDIATE`, so it is checked at the end of each statement. A single `update … set position = case …` can then reorder a full set of 10 (probe P8f).
  - The friendly message comes from the BEFORE INSERT guard (D5), which counts the person's rows and refuses the 11th with "you can pick up to 10 favourite regions" (or "producers").
  - `set_profile_favourites` checks the list length first, with the same message.
  - The UI hides the add control at 10.
- **D4 RLS and grants.**
  - `SELECT` for `authenticated` uses `true`: favourites are public to signed-in viewers, like the rest of a profile (phone is the only private field). A deleted profile has no rows (D5), so nothing needs a deleted-profile clause.
  - `INSERT`, `UPDATE` and `DELETE` are allowed only on the caller's own rows (`profile_id = auth.uid()`).
  - `anon` and PUBLIC hold nothing.
  - `authenticated` holds table-level `SELECT` and `DELETE`, `INSERT` on exactly `(profile_id, region_id|producer_id, position)`, and `UPDATE` on `(position)` only. It can never move a favourite onto another profile or another region or producer, and never sets `created_at`.
  - `service_role` keeps Supabase's defaults.
- **D5 Account deletion.**
  - `profiles_deleted_drop_favourites` is an AFTER UPDATE OF `deleted_at` trigger on `profiles`, firing only when `deleted_at` goes from null to set. It deletes the person's rows from both tables. The scrub's last statement stamps `deleted_at`, so this runs inside the scrub's own transaction. Stamping `deleted_at` any other way (only `service_role` or a SECURITY DEFINER function can) fires it too (P13).
  - **`scrub_deleted_account` is not recreated**; its body stays md5-pinned (`bad163a7d72fcab774936383dc1b6f2a`).
  - A per-table BEFORE INSERT guard refuses any insert for a deleted profile with the account-deletion string "this account has been deleted" (42501). That covers a leftover access token.
  - The guard reads the profile row `FOR SHARE`. The scrub takes that row `FOR UPDATE` first, at its step 0. The two therefore serialise: an insert that commits first is deleted by the trigger, and one that comes second waits and then sees `deleted_at`.
- **D6 One RPC replaces both sets: `set_profile_favourites(p_region_ids uuid[], p_producer_ids uuid[])`.**
  - SECURITY INVOKER, so RLS, the grants and the guards stay the floor, and the RPC adds atomicity and nothing else.
  - It locks the caller's profile row `FOR UPDATE` (one save at a time per person, and never alongside the scrub), deletes the caller's rows from both tables, and inserts both lists with `position` = list order.
  - EXECUTE is granted to `authenticated` only. It is revoked from PUBLIC, `anon` and `service_role`, as in the `transfer_tasting_host` OD-1 precedent: `auth.uid()` is null for `service_role`.
- **D7 The per-country "None" sentinel is never a favourite.** 46 of the 427 live regions are the `None` sentinel, one per country (`20260829263700_none_region_appellation.sql`). The region guard refuses one ("that region cannot be a favourite"), and the picker never offers one. "Vin de France" (France's national tier) is a real, pickable region.
- **D8 Foreign keys to `regions`/`producers` are NO ACTION** (the default), with an index on `region_id` / `producer_id`. A producer or region merge or cleanup that forgets these tables fails loudly with 23503 (P14b) instead of silently dropping someone's favourite. Any merge script must move favourites to the surviving row. If the person already favourites the target, it deletes the duplicate row instead of colliding on the primary key. `scripts/dedupe-producer-orthographic-variants.mjs` is historical and already misses `catalog_wines`. It needs no change now, but a future merge must include both favourites tables.
- **D9 Pick only, never create.** Neither picker is given `onCreate`. Settings can only choose existing reference rows, like a guesser, never add new ones.
- **D10 Save order.** In `updateProfile`:
  1. The name check.
  2. Parse both hidden id lists. An absent field means "leave favourites alone".
  3. `set_profile_favourites`.
  4. The existing `profiles` update.
  5. Revalidate and redirect.

  The likely refusals (limit, duplicate, deleted account) therefore happen before any profile write. Both writes are idempotent, and the form's fields become controlled (§5.2), so after any error the person still sees exactly what they entered and Save retries safely.
- **D11 A failed read never becomes a wipe.**
  - `getProfileFavourites` returns `null` when it cannot read, never an empty set. When the settings page gets `null`, it shows a one-line notice in place of the two fields and renders no hidden inputs, and the action then leaves favourites untouched.
  - This departs from the task's example signature (which returns `{ regions, producers }`) on purpose. Without it, a transient read error on the settings page would show no favourites, and the next Save would clear them.
- **D12 Types.** Both tables are added with `Relationships: []`, plus `set_profile_favourites` under `Functions`. `profiles.favorite_wine_type` stays in `Row`, because the column exists, and leaves `Insert`/`Update`, so an app write becomes a compile error (the D18 pattern from account deletion).
- **D13 Version `20260919141700`**, `supabase/migrations/20260919141700_profile_favourites.sql`. The latest live version is `20260919101300`. No `20260919141700` exists live, on `origin/master`, or on any local branch (`git ls-tree` over every ref, 2026-09-19). The probe's before-phase and `scratch-apply --mode dry` check the live `schema_migrations` row again before any apply.
- **D14 Out of scope.**
  - Showing favourites on the Participants card or in the People directory.
  - Reordering chips in the UI: order is the order added, and the database already allows a position reorder.
  - Linking chips to a region or producer page.
  - Seeding demo favourites.
  - Dropping `profiles.favorite_wine_type`.

## 2. Live facts (read-only, 2026-09-19)

| Fact | Value |
|---|---|
| Latest live migration | `20260919101300` (account deletion); `20260918130500` before it |
| `profiles` columns | 15, including `favorite_wine_type text` and `deleted_at timestamptz` (nullable) |
| `profiles` triggers | `profiles_deleted_guard` (BEFORE INSERT OR UPDATE, tgtype 23) and `profiles_sync_is_curator` (BEFORE INSERT OR UPDATE OF `role`, 23, tgattr 11) |
| `profiles` policies | `profiles read` (authenticated, `true`), `profiles update own` (`id = auth.uid()` both ways) |
| `profiles` client UPDATE | authenticated, on exactly `avatar_url, bio, cellar_visibility, display_name, favorite_wine_type, last_seen_at, location, phone, preferred_currency`; no table-level UPDATE for anon or authenticated |
| Profiles | 33, 0 deleted |
| `scrub_deleted_account(uuid)` | SECURITY DEFINER, md5 `bad163a7d72fcab774936383dc1b6f2a`, owner-only EXECUTE. Step 0 is `select … from profiles where id = p_user_id for update`; its last statement stamps `deleted_at` |
| `profiles_deleted_guard()` | invoker, md5 `605da26c81c9a0a4ff813595c10b79f1` |
| `regions` | 427 rows = 381 named + 46 `None` sentinels (one per country); `unique (country_id, name)`; `id uuid`, `country_id uuid not null`, `name text not null` |
| "Region, Country" labels | 381 over the named regions, all distinct, no commas in any region or country name, longest 39 characters ("Zapadna kontinentalna Hrvatska, Croatia") |
| `countries` | 46 |
| `producers` | 33,771 (1,655 with no region); `producers_name_key UNIQUE (name)`; longest name 80 characters |
| Reference reads | `countries`, `regions` and `producers` each have `reference read` (authenticated, `true`) |
| FKs into `producers` | `catalog_wines` RESTRICT; `catalog_wines_unidentified`, `guesses`, `wine_answers`, `wine_designation_members` NO ACTION; `producer_aliases` CASCADE |
| FKs into `regions` | `appellations`, `catalog_wines` RESTRICT; `region_grapes` CASCADE; `type_designations` SET NULL; the rest NO ACTION |
| Default privileges (postgres, public) | tables: `arwdDxtm` to anon, authenticated and service_role; functions: EXECUTE to anon, authenticated, service_role, plus PUBLIC by default |
| Publications | `supabase_realtime` (not FOR ALL TABLES) holds `guesses` and `wines` only |
| `search_producers(p_query text, p_region_id uuid)` | SECURITY DEFINER; returns `id, name, in_region`. With an empty query and no region it returns nothing; a typed query returns up to 25, by name, accent-folded |
| Demo accounts (probe fixtures) | Priya `10f2f036-…`, Marcus `caa708a1-…`, Sofia `114a760a-…`, Diego `95584be2-…`, Isabelle `f9d82d2a-…`; each has a profile and an `auth.users` row |

## 3. The SQL design (`20260919141700_profile_favourites.sql`)

The file opens with a header comment in the style of `20260918130500_platform_invites.sql`: what it does, "written against the LIVE state" with §2's facts, the security reasoning, what deployed code does meanwhile, and "No begin/commit: the applier owns the transaction." Then `set local lock_timeout = '10s';`.

### 3.1 Pre-state (one `do` block, each check a `raise exception`)

1. Nothing this migration creates exists yet:
   - `to_regclass` of both tables is null;
   - no `public` function is named `profile_favourite_regions_guard`, `profile_favourite_producers_guard`, `drop_deleted_profile_favourites` or `set_profile_favourites` (any signature);
   - no trigger is named `profiles_deleted_drop_favourites`, `profile_favourite_regions_guard` or `profile_favourite_producers_guard`.
2. `profiles` is as account deletion left it:
   - it has `PRIMARY KEY (id)` and a nullable `deleted_at timestamptz`;
   - its non-internal triggers are exactly `profiles_deleted_guard 23 profiles_deleted_guard(); profiles_sync_is_curator 23 sync_is_curator_from_role()`;
   - its column privileges are exactly `avatar_url:UPDATE,bio:UPDATE,cellar_visibility:UPDATE,display_name:UPDATE,favorite_wine_type:UPDATE,last_seen_at:UPDATE,location:UPDATE,phone:UPDATE,preferred_currency:UPDATE`.
3. The account-deletion bodies this relies on are unchanged: `scrub_deleted_account(uuid)` md5 `bad163a7d72fcab774936383dc1b6f2a` and `profiles_deleted_guard()` md5 `605da26c81c9a0a4ff813595c10b79f1` (md5 of `prosrc` with any CR stripped). D5's serialisation depends on the scrub locking the profile `FOR UPDATE` first and stamping `deleted_at` last.
4. The reference tables:
   - `countries.id`, `countries.name`, `producers.id`, `producers.name`, `regions.country_id`, `regions.id` and `regions.name` are `uuid`/`text not null` as in §2;
   - `regions` and `producers` have `PRIMARY KEY (id)`;
   - the SELECT policy on `countries`, `producers` and `regions` is `{authenticated} true`, which the pickers and the read helper need.

### 3.2 Tables, RLS and grants (verbatim)

```sql
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
```

`position` is a column-name keyword, and Postgres deparses it quoted (`"position"`). `wines.position` already uses the same name, and PostgREST's `.order("position")` works on it.

### 3.3 The insert guards (verbatim; the md5 pins in §3.7 hold only for these exact bodies, LF line endings)

```sql
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
```

Why they are shaped this way:

- **SECURITY DEFINER.** The guard takes a row lock on `profiles` and counts rows, whoever inserts.
- **INSERT only.** A client can UPDATE only `position`, which changes neither the count nor the owner.
- **Two functions, not one keyed on `tg_table_name`.** Each body names only its own table's columns.
- **The count sees earlier rows.** A plpgsql trigger is volatile, so the count also sees the rows an earlier part of the same INSERT statement wrote: the RPC's 11th row, if it ever got that far, would be refused.

### 3.4 Account deletion takes a person's favourites with it (verbatim)

```sql
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
```

`profiles_deleted_guard` makes `deleted_at` write-once, so this fires at most once per profile. A second scrub call (D12's sweep in the account-deletion spec) never updates `deleted_at` and does not fire it. There is also nothing left to sweep, because the guards refuse new rows.

### 3.5 Replace both sets in one call (verbatim)

```sql
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
```

Notes:

- Empty arrays (`'{}'`) clear a set; `array_ndims('{}')` is null, which passes.
- A null element, or an id with no row, reaches the constraints and comes back verbatim ("null value in column "region_id" …" / "… violates foreign key constraint …"). Only a crafted request can send one.
- As `authenticated`, `perform … for update` on the caller's own profile is allowed: the role holds UPDATE on nine columns, and `profiles update own` admits the row.

### 3.6 EXECUTE (verbatim)

```sql
revoke all on function public.profile_favourite_regions_guard()   from public, anon, authenticated, service_role;
revoke all on function public.profile_favourite_producers_guard() from public, anon, authenticated, service_role;
revoke all on function public.drop_deleted_profile_favourites()   from public, anon, authenticated, service_role;
revoke all on function public.set_profile_favourites(uuid[], uuid[]) from public, anon, service_role;
grant execute on function public.set_profile_favourites(uuid[], uuid[]) to authenticated;
```

Firing a trigger never checks EXECUTE, so the three trigger functions are owner-only.

### 3.7 Post-state (same transaction, each check a `raise exception`)

Every expected string below is what the rolled-back dry run deparsed on live.

1. **Columns**, per table in `attnum` order: `profile_id uuid not null`, `region_id` / `producer_id uuid not null`, `position int2 not null`, `created_at timestamptz not null default now()`.
2. **Constraints**, by name (sorted with `collate "C"`):
   - `…_pkey PRIMARY KEY (profile_id, region_id)` / `(profile_id, producer_id)`
   - `…_position_key UNIQUE (profile_id, "position") DEFERRABLE`
   - `…_position_range CHECK ((("position" >= 1) AND ("position" <= 10)))`
   - `profile_favourite_regions_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE` (the same on producers)
   - `profile_favourite_regions_region_id_fkey FOREIGN KEY (region_id) REFERENCES regions(id)`
   - `profile_favourite_producers_producer_id_fkey FOREIGN KEY (producer_id) REFERENCES producers(id)`

   The indexes `profile_favourite_regions_region_idx` (`USING btree (region_id)`) and `profile_favourite_producers_producer_idx` (`USING btree (producer_id)`) exist.
3. **RLS** is enabled and not forced on both tables. Exactly eight policies, formatted as `polname polcmd permissive roles qual check`:
   - `profile favourite producers delete own d permissive {authenticated} (profile_id = auth.uid()) -`
   - `… insert own a … - (profile_id = auth.uid())`
   - `… read r … true -`
   - `… update own w … (profile_id = auth.uid()) (profile_id = auth.uid())`
   - the same four for regions.
4. **Privileges.**
   - No ACL entry anywhere (table or column) for PUBLIC or `anon`, and no column ACL entry for any role but `authenticated`.
   - `authenticated`'s table privileges are exactly `DELETE,SELECT` on each table.
   - Its column privileges are exactly `profile_id:INSERT, region_id|producer_id:INSERT, position:INSERT, position:UPDATE` per table.
   - It holds no `created_at` INSERT, no `region_id`/`producer_id`/`profile_id` UPDATE and no TRUNCATE.
   - `service_role` holds SELECT, INSERT, UPDATE and DELETE on both tables, checked one privilege at a time: `has_table_privilege` with a comma list is true if any one is held.
   - The live table ACL reads `{postgres=arwdDxtm/postgres,service_role=arwdDxtm/postgres,authenticated=rd/postgres}`.
5. **Functions** (all `plpgsql`, `volatile`, `proconfig = {search_path=public}`, EXECUTE holders written as `OWNER` for the function owner):

   | Signature | SECURITY DEFINER | Returns | Body md5 (prosrc, CR stripped) | EXECUTE |
   |---|---|---|---|---|
   | `profile_favourite_regions_guard()` | yes | trigger | `feeb1b66770a48b5ca9574c12d80fe01` | OWNER |
   | `profile_favourite_producers_guard()` | yes | trigger | `c48de703f2d2ecd12a276b0b743d90d9` | OWNER |
   | `drop_deleted_profile_favourites()` | yes | trigger | `493c75a30f9cd62145bc8e4f1685dcf4` | OWNER |
   | `set_profile_favourites(uuid[],uuid[])` | no | void | `a5ab6b12e7484badfc0d5a7880cbfc2c` | OWNER, authenticated |

   Also `has_function_privilege` on `set_profile_favourites` is false for `anon` and `service_role` and true for `authenticated`.
6. **Triggers.** The non-internal triggers on the three tables are exactly:
   - `profile_favourite_producers.profile_favourite_producers_guard 7 O profile_favourite_producers_guard() -`
   - `profile_favourite_regions.profile_favourite_regions_guard 7 O profile_favourite_regions_guard() -`
   - `profiles.profiles_deleted_drop_favourites 17 O drop_deleted_profile_favourites() <attnum of deleted_at>` (15 live)
   - `profiles.profiles_deleted_guard 23 O profiles_deleted_guard() -`
   - `profiles.profiles_sync_is_curator 23 O sync_is_curator_from_role() 11`

   The drop trigger's definition contains ` WHEN (((old.deleted_at IS NULL) AND (new.deleted_at IS NOT NULL))) EXECUTE `.
7. **Unchanged.** The two account-deletion md5s from §3.1, and the nine-column `profiles` grant string from §3.1, which still includes `favorite_wine_type`.
8. **Publications.** Neither table is in any publication.

The probe proves the block bites: in a savepoint, `grant update (producer_id) on public.profile_favourite_producers to authenticated` and then re-running the block raises "column privileges on the profile favourites tables are …" (P15).

### 3.8 Security and concurrency reasoning

- **Public read is intended.** Favourite regions and producers are profile content like location, and every people-facing profile field except phone is public to signed-in viewers. `anon` gets nothing, and `/u/<id>` requires a session anyway.
- **Nothing reaches a hidden glass (rule 1).** These tables reference only `profiles`, `regions` and `producers`, never a tasting, glass, answer key or guess.
- **The RPC adds no privilege.** It is SECURITY INVOKER, and a client could make each of its writes directly under the same RLS, grants and guards. It only makes "replace the set" atomic.
- **The 10-limit cannot be raced.** The position range and the per-person position unique allow at most 10 rows regardless of the guard's count. Two concurrent inserts into a set of 9 compete for the one free position, and the second fails with 23505 (P8d/P8e show the floor holding with the guard disabled).
- **Two saves at once.** Two tabs saving together serialise on the RPC's `FOR UPDATE` of the profile row. The second waits and then replaces, so there is no primary-key collision.
- **Deletion versus a leftover token.** The guard's `FOR SHARE` conflicts with the scrub's step-0 `FOR UPDATE`, and also with any other UPDATE of the profile row, so it does not depend on the scrub alone.
  - Guard first: the scrub waits, and its AFTER trigger's `delete` (a new statement with a new snapshot) sees and removes the committed favourite.
  - Scrub first: the insert waits, then re-reads the locked row's latest version and sees `deleted_at`.
  - This cannot be probed in a rolled-back run, because a second connection cannot see uncommitted tables. The main session can check it after the live apply (§8 step 4).
- **Lock cost.** `FOR SHARE` briefly blocks a concurrent UPDATE of the same person's profile row (for example `last_seen_at`), only for the length of one insert statement.

## 4. Probe scenarios

The probe is `.superpowers/profile-favourites/probes/20260919141700-profile-favourites.mjs` (gitignored), in the pattern of the account-deletion probe; the scratchpad's `dry.mjs` is its first draft:

- One `pg` client using `pgConfig()` from `scripts/wine-map-tiles/lib.mjs`.
- A before-phase re-reads §2 and §3.1's facts.
- An after-phase applies the migration file in one transaction, then runs each scenario in a savepoint:
  - clients are simulated with `set local role authenticated|anon|service_role` plus `set_config('request.jwt.claims', …, true)`;
  - `null` in the Who column means the connection's own role (`postgres`).
- Both phases end in ROLLBACK, followed by a live read showing nothing persisted.
- The EXPECT column is what the 2026-09-19 dry run returned, so it is the table to match.
- Agents run the probe, since it only ever rolls back. `scratch-apply --mode dry` must report `DRY-OK 20260919141700 profile_favourites`. The main session applies live.

| # | Who | Scenario | EXPECT |
|---|---|---|---|
| P1 | Priya | Insert her own region favourite (Bordeaux, position 1) | 1 row |
| P2a | Priya | `update … set position = 2` on her own row | 1 row |
| P2b | Priya | `update … set region_id = …` on her own row | 42501 permission denied for table profile_favourite_regions |
| P2c | Priya | Insert with `created_at` | 42501 permission denied for table profile_favourite_regions |
| P3 | Priya | Delete her own row | 1 row |
| P4 | Priya | Insert with `profile_id` = Marcus | 42501 new row violates row-level security policy for table "profile_favourite_regions" |
| P5 | Marcus, then Priya | Marcus inserts Bordeaux and Ridge Vineyards; Priya deletes, then updates, Marcus's rows | Marcus: 1 row each. Priya: 0 rows each, and Marcus's rows are unchanged |
| P6a | Priya | Read Marcus's favourites | regions 1, producers 1 |
| P6b–d | anon | select; insert; `set_profile_favourites('{}','{}')` | 42501 permission denied for table … (×2); 42501 permission denied for function set_profile_favourites |
| P7 | Priya | RPC `[Bordeaux, Bourgogne, Rioja]` + `[Ridge, Gaja]`, read back; then RPC `[Rioja, Bordeaux]` + `[]`, read back | Positions 1–3 and 1–2 in list order; then exactly Rioja@1, Bordeaux@2 and no producers |
| P8a | Priya | RPC with 11 region ids | 23514 you can pick up to 10 favourite regions |
| P8b | Priya | RPC with 10 region ids | ok, 10 rows |
| P8c | Priya | A direct 11th insert | 23514 you can pick up to 10 favourite regions (guard) |
| P8d | postgres | Guard disabled in the savepoint; insert at position 11 | 23514 … violates check constraint "profile_favourite_regions_position_range" |
| P8e | postgres | Guard disabled; insert at taken position 5 | 23505 … violates unique constraint "profile_favourite_regions_position_key" |
| P8f | Priya | With 10 rows, one statement swapping positions 1 and 2 | 2 rows (the deferrable unique allows it) |
| P9 | Priya | RPC `[Bordeaux]`, then a direct insert of Bordeaux again; RPC `[Bordeaux, Rioja, Bordeaux]`; RPC producers `[Gaja, Gaja]` | 23505 … "profile_favourite_regions_pkey"; 23505 each region can be picked once; 23505 each producer can be picked once |
| P10 | Priya | RPC with France's `None` region | 23514 that region cannot be a favourite |
| P11a | service_role | Call the RPC | 42501 permission denied for function set_profile_favourites |
| P11b | authenticated, no `sub` | Call the RPC | 42501 not signed in |
| P11c–f | Priya | RPC with a null list; a 2-d array; a null element; an unknown id | 22023 favourites must be two lists of ids (×2); 23502 null value in column "region_id" …; 23503 … "profile_favourite_regions_region_id_fkey" |
| P12 | Sofia, Priya, postgres | Sofia sets 3 regions + 2 producers; Priya sets 1 + 1; `select scrub_deleted_account(sofia)` as postgres | Sofia 0 + 0; Priya still 1 + 1; Sofia `deleted_at` set |
| P12e–h | Sofia (leftover token) | Direct region insert; direct producer insert; RPC with a region; RPC with empty lists | 42501 this account has been deleted (×3); the empty RPC succeeds and writes nothing |
| P12i | postgres | Scrub Sofia again | ok, a no-op |
| P13 | Diego, service_role, postgres | Diego sets 2 regions + 1 producer; `service_role` stamps his `deleted_at` directly; then `update profiles set bio = bio` for Priya | Diego 0 + 0 (the trigger does not depend on the scrub); Priya's favourites untouched |
| P14 | Marcus, postgres | Marcus favourites a producer that nothing else references; postgres deletes that producer | 23503 update or delete on table "producers" violates foreign key constraint "profile_favourite_producers_producer_id_fkey" |
| P15 | postgres | Extra `grant update (producer_id)`, then the §3.7 block | raises (P0001 column privileges …) |

## 5. The app

Read the relevant guide in `node_modules/next/dist/docs/` before writing code (AGENTS.md), in particular server actions with `useActionState` and `redirect`. Base UI rules from CLAUDE.md apply: `render`, not `asChild`, and `nativeButton` describes the innermost element.

### 5.1 `src/lib/profile-favourites.ts` (new; the one module for favourites)

Shaped like `src/app/tastings/new/place.ts`:

- Type-only imports (`SupabaseClient`, `Database`), no `"use server"` and no server-only import. vitest can load it, and a client component may import its constants and pure helpers.
- vitest has no `@/` alias, so any runtime import is relative. It needs none.

Exports:

- `FAVOURITES_LIMIT = 10`, `NONE_REGION_NAME = "None"`.
- `FAVOURITE_REGION_IDS_FIELD = "favourite_region_ids"`, `FAVOURITE_PRODUCER_IDS_FIELD = "favourite_producer_ids"`.
- The §6 copy constants, and `FAVOURITES_DB_REFUSALS` (the migration's refusal strings, in §6's order).
- Types: `FavouriteRegion = { id: string; name: string; country: string }`, `FavouriteProducer = { id: string; name: string }`, `ProfileFavourites = { regions: FavouriteRegion[]; producers: FavouriteProducer[] }`.
- `regionLabel({ name, country })` → `` `${name}, ${country}` ``.
- `favouriteRegionOptions(regions: { id; name; country_id }[], countries: { id; name }[]): FavouriteRegion[]`:
  - drops `NONE_REGION_NAME`, and any region whose country is not in the list;
  - sorts by `regionLabel`, using `new Intl.Collator("en", { sensitivity: "base" })`, with id as the tiebreak.
- `withFavourite<T extends { id: string }>(list, item)` appends `item`. It returns **the same array** when `item.id` is already in the list or the list is at `FAVOURITES_LIMIT`.
- `withoutFavourite(list, id)` removes by id and keeps order.
- `canAddFavourite(list)` is `list.length < FAVOURITES_LIMIT`.
- `unchosen(options, chosen)` returns the options whose id is not chosen.
- `serializeFavouriteIds(list)` returns the ids joined with `"\n"`.
- `parseFavouriteIds(value: unknown): string[] | null`:
  - `null` when `value` is not a string (the field was absent: an old form, or favourites that failed to load, D11);
  - otherwise split on `/\r?\n/`, trim, and drop blanks, keeping order;
  - no dedupe and no id validation. The database refuses those, and the UI never sends them.
- `favouritesFromRows({ regionRows, producerRows, regions, countries, producers })` is the pure mapper:
  - favourite rows (`region_id` or `producer_id` plus `position`) come back ordered by `position`, joined to their names;
  - a row whose region, country or producer is missing from the reads is dropped.
- `getProfileFavourites(supabase, profileId): Promise<ProfileFavourites | null>`:
  - Round 1, in parallel: `profile_favourite_regions` `.select("region_id, position").eq("profile_id", id).order("position")`, and the same on producers with `producer_id`.
  - With no rows, return empty lists without reading further.
  - Round 2, in parallel and each only when needed: `regions` `.select("id, name, country_id").in("id", regionIds)`, `countries` `.select("id, name")` (46 rows, a small table read in full), and `producers` `.select("id, name").in("id", producerIds)`. It never reads the whole producers table (CLAUDE.md).
  - Any error in any read returns `null`. It never throws.
- `loadFavouriteRegionOptions(supabase): Promise<FavouriteRegion[] | null>`:
  - pages `countries` and `regions` 1,000 rows at a time (`.order("name").order("id").range(from, to)`, as `loadByHandReferences` does), so the page cap can never truncate them, then maps through `favouriteRegionOptions`;
  - returns `null` on any error.
- `setProfileFavourites(supabase, regionIds, producerIds): Promise<{ ok: true } | { error: string }>` calls `supabase.rpc("set_profile_favourites", { p_region_ids, p_producer_ids })` and returns `error.message` verbatim.

### 5.2 Settings — `/profile/edit`

**`src/app/profile/edit/page.tsx`**

- Drop `favorite_wine_type` from the profile select (line 21) and the `favoriteWineType` prop (line 47).
- Load in parallel with the profile: `getProfileFavourites(supabase, user.id)` and `loadFavouriteRegionOptions(supabase)`.
- Pass `favourites` (`ProfileFavourites | null`) and `regionOptions` (`FavouriteRegion[] | null`) to `EditProfileForm`.

**`src/app/profile/edit/edit-profile-form.tsx`** (client):

- **Imports and props.** Remove the `Select*` imports (lines 9–15) and the `FAVORITE_WINE_TYPE_ITEMS` import (line 16). Remove the `favoriteWineType` prop (lines 24 and 30) and the whole favourite wine type field (lines 77–95).
- **Controlled fields.** Name, bio, location and phone become controlled (`useState` from the props, `value`/`onChange`). React resets uncontrolled fields after a form action even when it returns an error. With D10's two writes, a favourites refusal after a successful write, or the reverse, would otherwise show stale values that the next Save would write back.
- **Bio placeholder.** Line 55's placeholder no longer suggests regions, which now have their own field. It becomes "Go-to grape, how you got into wine, anything you'd like other tasters to know" (spec copy).
- **Position.** `<FavouritesFields … />` goes where the favourite wine type field was, after Phone and before the error line.

**`src/app/profile/edit/favourites-fields.tsx`** (new, client). It owns two lists in state, initialised from `favourites`. If `favourites === null || regionOptions === null`, it renders only `<p className="text-sm text-muted-foreground">{FAVOURITES_LOAD_ERROR}</p>` and **no hidden inputs** (D11). Otherwise it renders two groups.

- **Regions:**
  - A `<fieldset className="flex flex-col gap-2">`, with a `<legend>` "Favourite regions" styled like `Label` (`text-sm leading-none font-medium`), then the hint "Up to 10." (`text-xs text-muted-foreground`).
  - The chosen chips, when there are any: a `<ul className="flex flex-wrap gap-2">`. Each `<li>` is `inline-flex min-h-11 items-center gap-1 rounded-full bg-secondary pl-3 pr-1 text-sm text-secondary-foreground md:pointer-fine:min-h-8`. It holds `regionLabel(r)` and a real `<button type="button" aria-label={`Remove ${label}`}>` with `inline-flex size-11 shrink-0 items-center justify-center rounded-full text-secondary-foreground/70 hover:text-secondary-foreground focus-visible:ring-3 focus-visible:ring-ring/50 md:pointer-fine:size-8` and `<X aria-hidden className="size-3.5" />`. This is the invite-field chip, with 44 px targets on phones.
  - While `canAddFavourite(regions)`, a `ReferenceCombobox` configured as follows:
    - `formFieldName="__favourite_region_pick"` (ignored by the action, like invite-field's `__friend_pick`);
    - `options={unchosen(regionOptions, regions).map((r) => ({ id: r.id, name: regionLabel(r) }))}`;
    - `value=""`;
    - `onValueChange={(id) => { const r = regionOptions.find((o) => o.id === id); if (r) setRegions((l) => withFavourite(l, r)); }}`;
    - `placeholder="Add a region"` and `createLabel="Regions"`, so the search box reads "Search regions…";
    - no `onCreate` (D9), and `triggerClassName="min-h-11 md:pointer-fine:min-h-8"` (§5.5).

    cmdk matches on the whole label, so typing a country ("france") narrows to that country's regions, and `deaccent` keywords make "rhone" find "Rhône, France".
  - A hidden `<input type="hidden" name="favourite_region_ids" value={serializeFavouriteIds(regions)} />`, always rendered in this branch.
- **Producers:** the same shape with "Favourite producers" and `name="favourite_producer_ids"`. The picker is a `SearchableCombobox`:
  - `formFieldName="__favourite_producer_pick"`, `value=""`, `selectedLabel={null}`;
  - `onValueChange={(id, name) => { if (id) setProducers((l) => withFavourite(l, { id, name })); }}`;
  - `search={async (q) => unchosen((await searchProducers(q)).map(({ id, name }) => ({ id, name })), producers)}`, where `searchProducers` comes from `@/lib/reference-search` with no region. An empty query shows "Type to search…", and a typed one returns up to 25 accent-folded matches;
  - `placeholder="Add a producer"` and `createLabel="Producers"` ("Search producers…");
  - no `onCreate`, no `allowClear`, and the same `triggerClassName`.

  Producer names are globally unique, so the chip shows the name alone.
- **Behaviour:**
  - A duplicate is impossible: picked rows leave the options, and `withFavourite` ignores a repeat.
  - The add control is not rendered at 10.
  - Chips appear in the order added. That order is the saved `position`.
  - Both comboboxes keep their existing synchronous focus in `onOpenChange` (CLAUDE.md's combobox rule); nothing here defers focus.
  - When the add control disappears at 10, move focus to the last chip's remove button. When a chip is removed, focus the next chip's remove button, else the previous one, else the add control. Keyboard users should never land on `<body>`.
  - Theme tokens only, in light and dark.

### 5.3 The save — `src/app/profile/edit/actions.ts`

`updateProfile` keeps its signature and its one export (`"use server"`: async functions only, with the existing `export type EditProfileFormState` left as is). New body order (D10):

```ts
const displayName = String(formData.get("display_name") ?? "").trim();
const bio = String(formData.get("bio") ?? "").trim();
const location = String(formData.get("location") ?? "").trim();
const phone = String(formData.get("phone") ?? "").trim();
if (!displayName) return { error: "Name is required." };

const regionIds = parseFavouriteIds(formData.get(FAVOURITE_REGION_IDS_FIELD));
const producerIds = parseFavouriteIds(formData.get(FAVOURITE_PRODUCER_IDS_FIELD));
if (regionIds !== null && producerIds !== null) {
  const saved = await setProfileFavourites(supabase, regionIds, producerIds);
  if ("error" in saved) return { error: saved.error }; // verbatim
}

const { error } = await supabase
  .from("profiles")
  .update({ display_name: displayName, bio: bio || null, location: location || null, phone: phone || null })
  .eq("id", user.id);
if (error) return { error: error.message };

revalidatePath(`/u/${user.id}`);
redirect(`/u/${user.id}`);
```

- `favorite_wine_type` is gone from the update (lines 25–26 and 39). An old cached form that still posts it is ignored, and existing values stay in the column untouched.
- If only one of the two id fields is present, both sets are left alone: the RPC replaces both, and a half-posted form is never trusted.
- **Rollout.** Apply the migration before the deploy. If the deploy lands first, `getProfileFavourites` returns `null`, the fields show the load notice, no hidden inputs are posted, and the action skips the RPC. Nothing breaks, and nothing is lost.

### 5.4 Display — `src/components/profile/favourites-chips.tsx` (new) and the read helper

`FavouritesChips({ favourites, align = "start", className }: { favourites: ProfileFavourites | null; align?: "start" | "center"; className?: string })`:

- It is a plain component: no `"use client"`, no hooks, so it renders in a server page.
- It renders **nothing** when `favourites` is null or both lists are empty (the owner's empty state).
- Otherwise it renders a `div` (`flex flex-col gap-3`, plus `className`) with up to two groups, each only when non-empty and in this order: "Favourite regions", then "Favourite producers".
- A group is a `<p className="text-xs font-medium text-muted-foreground">{label}</p>`, followed by a `<ul aria-label={label} className="mt-1.5 flex flex-wrap gap-1.5">` (plus `justify-center` when `align === "center"`).
- Each item is `<li className="rounded-full bg-secondary px-2.5 py-1 text-xs text-secondary-foreground">`, holding `regionLabel(r)` or the producer name. The chips link nowhere for now. They are not interactive, so no tap-size rule applies.
- Theme tokens only.

The main session renders it on `/u/<id>` at merge (§5.8), with data from `getProfileFavourites(supabase, profile.id)` (§5.1).

### 5.5 Combobox trigger class — `src/components/reference-combobox.tsx` and `src/components/searchable-combobox.tsx`

Each gets one optional prop, `triggerClassName?: string`, merged into the trigger `Button`: `className={cn("w-full justify-between font-normal", triggerClassName)}`. Defaults are unchanged, so no existing caller changes. This is the only edit to either shared component, and it gives the favourites pickers their 44 px phone targets.

### 5.6 Types — `src/lib/supabase/database.types.ts`

- **`profiles`.** Keep `favorite_wine_type: string | null` in `Row` (line 340), with a comment:

  ```ts
  // Retired from the app 2026-09-19 (profile-favourites spec D1): the column
  // stays so people's answers are not lost; nothing in src reads or writes it.
  ```

  Remove it from `Insert` (line 361) and `Update` (line 377).
- **New tables**, next to `friendships`, with a comment naming the migration and D2–D4:

  ```ts
  profile_favourite_regions: {
    Row: { profile_id: string; region_id: string; position: number; created_at: string };
    Insert: { profile_id: string; region_id: string; position: number; created_at?: never };
    Update: { position?: number };
    Relationships: [];
  };
  profile_favourite_producers: {
    Row: { profile_id: string; producer_id: string; position: number; created_at: string };
    Insert: { profile_id: string; producer_id: string; position: number; created_at?: never };
    Update: { position?: number };
    Relationships: [];
  };
  ```

- **`Functions`:** `set_profile_favourites: { Args: { p_region_ids: string[]; p_producer_ids: string[] }; Returns: void };`
- The three trigger functions are not listed, because no client can call them. `Views: {}` is unchanged.

### 5.7 Every place favourite wine type is removed

Line numbers are at `c6938f7`.

| File | Lines | Change | Who |
|---|---|---|---|
| `src/app/profile/edit/edit-profile-form.tsx` | 9–15, 16, 24, 30, 77–95 | `Select` and `FAVORITE_WINE_TYPE_ITEMS` imports, the prop, the field (§5.2) | this build |
| `src/app/profile/edit/page.tsx` | 21, 47 | `favorite_wine_type` in the select; the prop | this build |
| `src/app/profile/edit/actions.ts` | 25–26, 39 | Parse and write (§5.3) | this build |
| `src/app/tastings/[id]/participants-card.tsx` | 2 | `import { MapPin, Wine } from "lucide-react";` → `import { MapPin } from "lucide-react";` | this build |
| same | 41 | Comment "a location/favorite-wine info line" → "a location info line" | this build |
| same | 66 | Select `"id, display_name, email, avatar_url, location, favorite_wine_type, deleted_at"` → drop `favorite_wine_type, ` | this build |
| same | 122–127 | Delete the `favorite_wine_type` entry of `infoBits` (which also showed the raw key, e.g. "RED") | this build |
| `src/lib/supabase/database.types.ts` | 361, 377 (340 stays) | §5.6 | this build |
| `scripts/seed-demo-people.mjs` | 71–72, 76, 86, 94, 102, 110, 118, 687–689, 697 | Drop the `FAVORITE_WINE_TYPES` set and its comment; drop `favorite_wine_type` from `PUBLIC_PROFILE_FIELDS`, from each of the five people, from the validation and from the profile select | this build |
| `src/app/u/[id]/page.tsx` | 2, 12, 50, 147–153 | §5.8 | **main session at merge** |
| `src/lib/wine-types.ts` | whole file | Delete, once `src/app/u/[id]/page.tsx` no longer imports it (D1) | **main session at merge** |
| `CLAUDE.md` | the "Profiles carry optional `location`, `phone`, `favorite_wine_type`…" bullet | §5.9 | this build (or the main session at merge) |

### 5.8 `src/app/u/[id]/page.tsx` — for the main session at merge

Another build is redesigning this page, so apply the intent to whatever the page looks like after that merge. At `c6938f7`:

- **Line 2:** `import { MapPin, Wine as WineIcon } from "lucide-react";` → `import { MapPin } from "lucide-react";` (`WineIcon` is used only at line 149).
- **Line 12:** delete `import { FAVORITE_WINE_TYPE_ITEMS } from "@/lib/wine-types";`, then delete `src/lib/wine-types.ts`.
- **Line 50:** `"id, display_name, bio, avatar_url, location, favorite_wine_type, created_at, deleted_at",` → `"id, display_name, bio, avatar_url, location, created_at, deleted_at",`.
- **Lines 147–153:** delete the whole `{profile.favorite_wine_type ? ( <Badge …><WineIcon …/>{FAVORITE_WINE_TYPE_ITEMS[…] ?? …}</Badge> ) : null}` block. The badge row keeps the location badge.
- **Add** the favourites:
  - After the `view === "deleted"` early return, change line 107 to `const [{ summary, tastings }, favourites] = await Promise.all([getProfileStats(profile.id), getProfileFavourites(supabase, profile.id)]);`.
  - Render `<FavouritesChips favourites={favourites} align="center" className="mt-3" />` in the header card, under the badge row (inside the `<div>` that holds the name, bio and badges, before "Joined …").
  - A deleted profile never reaches this, and has no rows anyway.
- Remove the two exemptions from `favourite-wine-type-retired.test.ts` (§7) in the same change.

### 5.9 CLAUDE.md

- **Replace** the "Profiles carry optional `location`, `phone`, `favorite_wine_type`" bullet. Location and phone stay as described, and phone stays private. Favourite wine type is retired from the app (2026-09-19): the column is kept, nothing reads or writes it, it stays in the nine-column grant, and the scrub still nulls it. Do not bring it back in the UI; the owner may drop the column later.
- **Add a "Profile favourites" bullet** under Domain rules. Cover:
  - the two tables, public to signed-in viewers and written only by their owner;
  - the 10-limit, whose floor is the position range plus the per-person position unique, with the guard giving the friendly message;
  - `set_profile_favourites`: SECURITY INVOKER, replaces both sets, locks the profile row;
  - the `None` sentinel refusal;
  - the AFTER UPDATE OF `deleted_at` drop trigger. `scrub_deleted_account` was not touched, and a future profile-owned table should get the same kind of trigger rather than a scrub edit;
  - the NO ACTION FKs: a producer or region merge must move favourites too;
  - `getProfileFavourites` returns `null` on a read failure, and the settings page then posts no favourites (never an empty set);
  - `FavouritesChips` renders nothing when there is nothing to show.

## 6. Copy

Owner copy (verbatim, from the task's decisions):

- Field labels: "Favourite regions", "Favourite producers"
- Add controls (combobox placeholders): "Add a region", "Add a producer"
- Hint: "Up to 10."
- Profile page empty state: nothing rendered.

(spec copy), marked `(spec copy)` in code:

- Load failure on settings: "Your favourites could not be loaded. Reload the page to change them."
- Bio placeholder: "Go-to grape, how you got into wine, anything you'd like other tasters to know"
- Search box placeholders, derived by the existing components from `createLabel`: "Search regions…", "Search producers…"
- Chip remove button name: "Remove {label}", e.g. "Remove Bordeaux, France"
- Database refusals (lower-case, the repo's SQL style, shown verbatim through the action), in this order in `FAVOURITES_DB_REFUSALS`:
  - "you can pick up to 10 favourite regions"
  - "you can pick up to 10 favourite producers"
  - "each region can be picked once"
  - "each producer can be picked once"
  - "that region cannot be a favourite"
  - "favourites must be two lists of ids"
  - "not signed in"

Reused, not new: "this account has been deleted" (account deletion's `DB_REFUSALS`).

The existing components already show "Type to search…", "No results." and "Searching…".

## 7. Vitest cases to write first

All in `node` (no DOM). The copy lives in `src/lib/profile-favourites.ts`, so `profile-favourites.test.ts` pins it too.

**`src/lib/profile-favourites.test.ts`**

- **Copy and constants.**
  - `FAVOURITES_LIMIT` is 10 and `NONE_REGION_NAME` is `"None"`.
  - The two field names are `favourite_region_ids` and `favourite_producer_ids`.
  - Every §6 string matches character for character, and `FAVOURITES_DB_REFUSALS` equals §6's list in order.
- **`regionLabel`.** `{ name: "Bordeaux", country: "France" }` gives `"Bordeaux, France"`.
- **`favouriteRegionOptions`.**
  - It drops every `None` region, including one per country across two countries.
  - It keeps `"Vin de France, France"`.
  - It drops a region whose `country_id` is not among the countries.
  - It sorts by label accent-insensitively and case-insensitively, as `Intl.Collator("en", { sensitivity: "base" })` orders them: `"Ahr, Germany"` < `"Álava, Spain"` < `"Alsace, France"` (the accent on Á does not push it after Alsace), with id breaking a tie.
- **`withFavourite` / `withoutFavourite` / `canAddFavourite` / `unchosen`.**
  - Adding keeps insertion order.
  - A duplicate id returns the same array instance (`toBe`).
  - At 10 items, adding returns the same instance.
  - Removing by id keeps the others in order.
  - Removing an absent id changes nothing.
  - `canAddFavourite` is true at 9 and false at 10.
  - After a removal from 10, adding works again.
  - `unchosen` drops exactly the chosen ids and keeps option order.
- **`serializeFavouriteIds` / `parseFavouriteIds`.**
  - They round-trip.
  - `null`, `undefined` and a `File`-like object give `null`.
  - `""` and `"\n \n"` give `[]`.
  - `" a \r\n\n b "` gives `["a", "b"]`.
  - Duplicates are kept as sent (the database refuses them).
- **`favouritesFromRows`.**
  - Rows given out of order come back ordered by `position`.
  - A region row whose region, or whose region's country, is missing is dropped, as is a producer row whose producer is missing.
  - Names and countries are joined correctly.
- **`getProfileFavourites`**, with a recording fake client in the pattern of `place.test.ts`:
  - it reads both favourites tables with `.eq("profile_id", id)` and `.order("position")`;
  - with no favourite rows it makes no reference reads;
  - with rows it reads `regions`/`producers` with `.in("id", ids)` and `countries` in full;
  - an error in any read gives `null`, not an empty set (D11).
- **`loadFavouriteRegionOptions`.**
  - It pages with `.range(0, 999)` and then `.range(1000, 1999)` when a page comes back full.
  - It maps through `favouriteRegionOptions`.
  - An error gives `null`.
- **`setProfileFavourites`.**
  - It calls `rpc("set_profile_favourites", { p_region_ids, p_producer_ids })` with the arrays in order, and returns `{ ok: true }`.
  - A PostgREST error comes back as `{ error: message }`, verbatim.

**`src/lib/profile-favourites-migration.test.ts`** reads `supabase/migrations/20260919141700_profile_favourites.sql` with `readFileSync`, normalising CRLF, and asserts:

- **The limit.**
  - It contains `check (position between 1 and ${FAVOURITES_LIMIT})` twice.
  - It contains `>= ${FAVOURITES_LIMIT} then` twice (the guards).
  - It contains `cardinality(p_region_ids) > ${FAVOURITES_LIMIT}` and `cardinality(p_producer_ids) > ${FAVOURITES_LIMIT}`.
- **Strings shared with the app.**
  - It contains `r.name = '${NONE_REGION_NAME}'`.
  - It contains `'${line}'` for every `FAVOURITES_DB_REFUSALS` line, and `'this account has been deleted'`.
  - It contains `create function public.set_profile_favourites(p_region_ids uuid[], p_producer_ids uuid[])`, so the RPC name and argument names match `setProfileFavourites`.
- **What it must not touch.**
  - It does not match `/create (or replace )?function public\.scrub_deleted_account/` (D5).
  - It does not match `/drop column/i` (D1).

**`src/lib/favourite-wine-type-retired.test.ts`** walks `src/**/*.{ts,tsx}` with `fs` and fails on any file containing `favorite_wine_type`, `favoriteWineType`, `FAVORITE_WINE_TYPE` or `@/lib/wine-types`, except:

- `src/lib/supabase/database.types.ts`, which must contain `favorite_wine_type` exactly once (the `Row` line);
- the test file itself;
- `PENDING_MAIN_SESSION = ["src/app/u/[id]/page.tsx", "src/lib/wine-types.ts"]`. The test also asserts that each of these still exists and still contains a token, so the exemption list cannot go stale. The main session empties it at merge (§5.8).

## 8. Verification

- **Checks.**
  - `npx tsc --noEmit`, `npm run lint -- --max-warnings=0`, `npm test` (the three new test files plus the suite) and `npm run build`.
  - Before running them, confirm `node_modules\.bin\tsc` exists and `favs-npm-ci.log` ends with "npm ci exit 0".
- **Probe.** The §4 probe with every EXPECT row matching, then `DRY-OK 20260919141700 profile_favourites` from `scratch-apply --mode dry`. The main session applies live.
- **Main session, after the live apply** (a demo session minted with the `.superpowers/demo-session.mjs` pattern, never a typed password; a preview port other than 3000):
  1. On `/profile/edit` at 375 px and 1280 px, in both themes:
     - the favourite wine type field is gone;
     - add three regions (type "france" to narrow, "rhone" to find Rhône) and two producers ("chateau" finds Château …);
     - the chips show in the order added, a picked item leaves the list, `None` is never offered, and the add control disappears at 10;
     - every target is 44 px on the phone width;
     - Save lands on `/u/<id>`.
  2. Reopen settings: the same chips, in the same order.
  3. Remove all chips and save: the rows are gone. Refresh with the network tab open and check that a load failure (block `profile_favourite_regions`) shows the notice and that saving then leaves favourites untouched.
  4. Optional concurrency check (§3.8): with a throwaway account holding favourites, open a second database session (`pg` with `pgConfig()`) and run `begin; select 1 from profiles where id = '<id>' for update;`, then save favourites from the app. The save waits until that session rolls back.
  5. Delete a throwaway account through the real button: `select count(*)` on both tables for its id is 0.
  6. After merging §5.8: `/u/<id>` shows the chips under the badges, and shows nothing when there are none.
