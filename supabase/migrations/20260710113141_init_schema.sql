-- Blind tasting app: reference data, tastings, wines, guesses, scoring RPC.

create extension if not exists pgcrypto with schema extensions;

-- ============================================================================
-- Reference tables (power every dropdown; host can add new rows inline)
-- ============================================================================

create table countries (
  id uuid primary key default gen_random_uuid(),
  name text not null unique
);

create table regions (
  id uuid primary key default gen_random_uuid(),
  country_id uuid not null references countries(id) on delete restrict,
  name text not null,
  unique (country_id, name)
);

create table appellations (
  id uuid primary key default gen_random_uuid(),
  region_id uuid not null references regions(id) on delete restrict,
  name text not null,
  unique (region_id, name)
);

create table grapes (
  id uuid primary key default gen_random_uuid(),
  name text not null unique
);

create table producers (
  id uuid primary key default gen_random_uuid(),
  name text not null unique
);

create table type_designations (
  id uuid primary key default gen_random_uuid(),
  name text not null unique
);

-- ============================================================================
-- Profiles (mirrors auth.users, auto-created on signup/invite)
-- ============================================================================

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  email text not null,
  created_at timestamptz not null default now()
);

create function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)),
    new.email
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ============================================================================
-- Tastings
-- ============================================================================

create type timing_mode as enum ('LIVE', 'ASYNC');
create type wine_source_mode as enum ('HOST_PROVIDES', 'PARTICIPANT_CONTRIBUTED');
create type tasting_status as enum ('DRAFT', 'OPEN', 'IN_PROGRESS', 'CLOSED');
create type participant_status as enum ('INVITED', 'JOINED', 'DECLINED');
create type vintage_kind as enum ('YEAR', 'NV', 'TAWNY');

create table tastings (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  host_id uuid not null references profiles(id) on delete cascade,
  timing_mode timing_mode not null,
  wine_source wine_source_mode not null,
  status tasting_status not null default 'DRAFT',
  current_wine_id uuid, -- FK added after `wines` exists; used by LIVE mode pacing
  opens_at timestamptz,
  closes_at timestamptz,
  created_at timestamptz not null default now()
);

create table tasting_participants (
  id uuid primary key default gen_random_uuid(),
  tasting_id uuid not null references tastings(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  status participant_status not null default 'INVITED',
  joined_at timestamptz,
  created_at timestamptz not null default now(),
  unique (tasting_id, user_id)
);

-- ============================================================================
-- Wines, split into metadata (readable by all joined participants) and
-- answers (the actual correct-answer FKs, hidden from participants until the
-- wine is revealed or it's their own contributed wine) -- Postgres RLS is
-- row-level, so hiding a few columns pre-reveal requires a separate table.
-- ============================================================================

create table wines (
  id uuid primary key default gen_random_uuid(),
  tasting_id uuid not null references tastings(id) on delete cascade,
  position int not null,
  contributor_participant_id uuid references tasting_participants(id) on delete set null,
  is_revealed boolean not null default false,
  created_at timestamptz not null default now(),
  unique (tasting_id, position)
);

alter table tastings
  add constraint tastings_current_wine_id_fkey
  foreign key (current_wine_id) references wines(id) on delete set null;

create table wine_answers (
  wine_id uuid primary key references wines(id) on delete cascade,
  country_id uuid not null references countries(id),
  region_id uuid not null references regions(id),
  appellation_id uuid not null references appellations(id),
  primary_grape_id uuid not null references grapes(id),
  secondary_grape_id uuid references grapes(id),
  producer_id uuid not null references producers(id),
  type_designation_id uuid references type_designations(id),
  vintage_kind vintage_kind not null,
  vintage_year int,
  vintage_tawny_years int,
  constraint wine_answers_vintage_shape check (
    (vintage_kind = 'YEAR' and vintage_year is not null and vintage_tawny_years is null) or
    (vintage_kind = 'NV' and vintage_year is null and vintage_tawny_years is null) or
    (vintage_kind = 'TAWNY' and vintage_tawny_years is not null and vintage_year is null)
  )
);

-- ============================================================================
-- Guesses (same FK shape as wine_answers, plus computed points once revealed)
-- ============================================================================

create table guesses (
  id uuid primary key default gen_random_uuid(),
  wine_id uuid not null references wines(id) on delete cascade,
  participant_id uuid not null references tasting_participants(id) on delete cascade,
  country_id uuid references countries(id),
  region_id uuid references regions(id),
  appellation_id uuid references appellations(id),
  primary_grape_id uuid references grapes(id),
  secondary_grape_id uuid references grapes(id),
  producer_id uuid references producers(id),
  type_designation_id uuid references type_designations(id),
  vintage_kind vintage_kind,
  vintage_year int,
  vintage_tawny_years int,
  country_points int,
  region_points int,
  appellation_points int,
  primary_grape_points int,
  secondary_grape_points int,
  producer_points int,
  type_designation_points int,
  vintage_points int,
  total_points int,
  scored_at timestamptz,
  submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (wine_id, participant_id)
);

create function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger guesses_set_updated_at
  before update on guesses
  for each row execute function set_updated_at();

create function block_guess_writes_after_reveal()
returns trigger
language plpgsql
as $$
begin
  if exists (select 1 from wines where id = new.wine_id and is_revealed) then
    raise exception 'Cannot submit or edit a guess after the wine has been revealed';
  end if;
  return new;
end;
$$;

create trigger guesses_block_after_reveal
  before insert or update on guesses
  for each row execute function block_guess_writes_after_reveal();

-- ============================================================================
-- reveal_wine RPC: single source of truth for scoring. Host-only.
-- ============================================================================

create function reveal_wine(p_wine_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_answer wine_answers%rowtype;
  v_is_host boolean;
begin
  select exists (
    select 1
    from wines w
    join tastings t on t.id = w.tasting_id
    where w.id = p_wine_id and t.host_id = auth.uid()
  ) into v_is_host;

  if not v_is_host then
    raise exception 'Only the host can reveal a wine';
  end if;

  select * into v_answer from wine_answers where wine_id = p_wine_id;
  if not found then
    raise exception 'Wine % has no answer key recorded', p_wine_id;
  end if;

  update guesses g
  set
    country_points = case when g.country_id = v_answer.country_id then 2 else 0 end,
    region_points = case when g.region_id = v_answer.region_id then 3 else 0 end,
    appellation_points = case when g.appellation_id = v_answer.appellation_id then 5 else 0 end,
    primary_grape_points = case when g.primary_grape_id = v_answer.primary_grape_id then 8 else 0 end,
    secondary_grape_points = case
      when v_answer.secondary_grape_id is null then null
      when g.secondary_grape_id = v_answer.secondary_grape_id then 2
      else 0
    end,
    producer_points = case when g.producer_id = v_answer.producer_id then 6 else 0 end,
    type_designation_points = case
      when v_answer.type_designation_id is null then null
      when g.type_designation_id = v_answer.type_designation_id then 2
      else 0
    end,
    vintage_points = case
      when g.vintage_kind is null then 0
      when g.vintage_kind = v_answer.vintage_kind
        and g.vintage_kind = 'NV' then 2
      when g.vintage_kind = v_answer.vintage_kind
        and g.vintage_kind = 'TAWNY'
        and g.vintage_tawny_years = v_answer.vintage_tawny_years then 2
      when g.vintage_kind = v_answer.vintage_kind
        and g.vintage_kind = 'YEAR'
        and g.vintage_year = v_answer.vintage_year then 2
      when g.vintage_kind = v_answer.vintage_kind
        and g.vintage_kind = 'YEAR'
        and abs(g.vintage_year - v_answer.vintage_year) = 1 then 1
      else 0
    end,
    scored_at = now()
  where g.wine_id = p_wine_id;

  update guesses
  set total_points = coalesce(country_points, 0)
    + coalesce(region_points, 0)
    + coalesce(appellation_points, 0)
    + coalesce(primary_grape_points, 0)
    + coalesce(secondary_grape_points, 0)
    + coalesce(producer_points, 0)
    + coalesce(type_designation_points, 0)
    + coalesce(vintage_points, 0)
  where wine_id = p_wine_id;

  update wines set is_revealed = true where id = p_wine_id;
end;
$$;

-- ============================================================================
-- RLS
-- ============================================================================

alter table countries enable row level security;
alter table regions enable row level security;
alter table appellations enable row level security;
alter table grapes enable row level security;
alter table producers enable row level security;
alter table type_designations enable row level security;
alter table profiles enable row level security;
alter table tastings enable row level security;
alter table tasting_participants enable row level security;
alter table wines enable row level security;
alter table wine_answers enable row level security;
alter table guesses enable row level security;

-- Reference tables: any authenticated user can read; any authenticated user
-- can add a new entry (the host "add new option" flow), never update/delete
-- (renames could silently invalidate past scoring).
create policy "reference read" on countries for select to authenticated using (true);
create policy "reference insert" on countries for insert to authenticated with check (true);
create policy "reference read" on regions for select to authenticated using (true);
create policy "reference insert" on regions for insert to authenticated with check (true);
create policy "reference read" on appellations for select to authenticated using (true);
create policy "reference insert" on appellations for insert to authenticated with check (true);
create policy "reference read" on grapes for select to authenticated using (true);
create policy "reference insert" on grapes for insert to authenticated with check (true);
create policy "reference read" on producers for select to authenticated using (true);
create policy "reference insert" on producers for insert to authenticated with check (true);
create policy "reference read" on type_designations for select to authenticated using (true);
create policy "reference insert" on type_designations for insert to authenticated with check (true);

-- Profiles: readable by anyone authenticated (display names for leaderboards);
-- only the owner can update their own row. Insert happens via the trigger only.
create policy "profiles read" on profiles for select to authenticated using (true);
create policy "profiles update own" on profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- Tastings: host or an invited/joined participant can read; only host can write.
create policy "tastings read" on tastings for select to authenticated using (
  host_id = auth.uid()
  or exists (
    select 1 from tasting_participants p
    where p.tasting_id = tastings.id and p.user_id = auth.uid()
  )
);
create policy "tastings insert" on tastings for insert to authenticated
  with check (host_id = auth.uid());
create policy "tastings update host" on tastings for update to authenticated
  using (host_id = auth.uid()) with check (host_id = auth.uid());
create policy "tastings delete host" on tastings for delete to authenticated
  using (host_id = auth.uid());

-- Participants: readable by the participant themself or the tasting host;
-- writable (insert/status updates) only by the host, except a participant may
-- update their own row (e.g. accept an invite, status -> JOINED).
create policy "participants read" on tasting_participants for select to authenticated using (
  user_id = auth.uid()
  or exists (select 1 from tastings t where t.id = tasting_id and t.host_id = auth.uid())
);
create policy "participants insert host" on tasting_participants for insert to authenticated
  with check (exists (select 1 from tastings t where t.id = tasting_id and t.host_id = auth.uid()));
create policy "participants update own or host" on tasting_participants for update to authenticated
  using (
    user_id = auth.uid()
    or exists (select 1 from tastings t where t.id = tasting_id and t.host_id = auth.uid())
  )
  with check (
    user_id = auth.uid()
    or exists (select 1 from tastings t where t.id = tasting_id and t.host_id = auth.uid())
  );
create policy "participants delete host" on tasting_participants for delete to authenticated
  using (exists (select 1 from tastings t where t.id = tasting_id and t.host_id = auth.uid()));

-- Wines (metadata only): readable by host or any joined participant of the
-- tasting. Insert: host always; a participant may insert exactly one wine for
-- their own tasting when wine_source = PARTICIPANT_CONTRIBUTED (enforced by
-- contributor_participant_id pointing at their own participant row).
create policy "wines read" on wines for select to authenticated using (
  exists (
    select 1 from tastings t
    where t.id = tasting_id
      and (t.host_id = auth.uid() or exists (
        select 1 from tasting_participants p where p.tasting_id = t.id and p.user_id = auth.uid()
      ))
  )
);
create policy "wines insert" on wines for insert to authenticated with check (
  exists (select 1 from tastings t where t.id = tasting_id and t.host_id = auth.uid())
  or exists (
    select 1 from tasting_participants p
    join tastings t on t.id = p.tasting_id
    where p.id = contributor_participant_id
      and p.user_id = auth.uid()
      and t.wine_source = 'PARTICIPANT_CONTRIBUTED'
  )
);
create policy "wines update host" on wines for update to authenticated
  using (exists (select 1 from tastings t where t.id = tasting_id and t.host_id = auth.uid()))
  with check (exists (select 1 from tastings t where t.id = tasting_id and t.host_id = auth.uid()));
create policy "wines delete host" on wines for delete to authenticated
  using (exists (select 1 from tastings t where t.id = tasting_id and t.host_id = auth.uid()));

-- Wine answers: the secret bit. Visible to the host, to the contributor who
-- entered it, or to anyone once the wine is revealed. Writable by host, or by
-- the contributing participant (their one wine, PARTICIPANT_CONTRIBUTED mode).
create policy "wine_answers read" on wine_answers for select to authenticated using (
  exists (
    select 1 from wines w
    join tastings t on t.id = w.tasting_id
    left join tasting_participants p on p.id = w.contributor_participant_id
    where w.id = wine_id
      and (
        t.host_id = auth.uid()
        or w.is_revealed
        or p.user_id = auth.uid()
      )
  )
);
create policy "wine_answers insert" on wine_answers for insert to authenticated with check (
  exists (
    select 1 from wines w
    join tastings t on t.id = w.tasting_id
    left join tasting_participants p on p.id = w.contributor_participant_id
    where w.id = wine_id
      and (t.host_id = auth.uid() or p.user_id = auth.uid())
  )
);
create policy "wine_answers update host" on wine_answers for update to authenticated
  using (exists (
    select 1 from wines w join tastings t on t.id = w.tasting_id
    where w.id = wine_id and t.host_id = auth.uid()
  ))
  with check (exists (
    select 1 from wines w join tastings t on t.id = w.tasting_id
    where w.id = wine_id and t.host_id = auth.uid()
  ));

-- Guesses: a participant always sees their own; everyone in the tasting sees
-- guesses once the wine is revealed; the host can see everything (to run the
-- reveal and moderate). Insert/update restricted to the participant's own row
-- (the "no revealed edits" rule is enforced by the trigger above).
create policy "guesses read" on guesses for select to authenticated using (
  exists (select 1 from tasting_participants p where p.id = participant_id and p.user_id = auth.uid())
  or exists (select 1 from wines w where w.id = wine_id and w.is_revealed)
  or exists (
    select 1 from wines w join tastings t on t.id = w.tasting_id
    where w.id = wine_id and t.host_id = auth.uid()
  )
);
create policy "guesses insert own" on guesses for insert to authenticated with check (
  exists (select 1 from tasting_participants p where p.id = participant_id and p.user_id = auth.uid())
);
create policy "guesses update own" on guesses for update to authenticated
  using (exists (select 1 from tasting_participants p where p.id = participant_id and p.user_id = auth.uid()))
  with check (exists (select 1 from tasting_participants p where p.id = participant_id and p.user_id = auth.uid()));

-- reveal_wine runs as security definer and checks host-ship itself, so no
-- extra grant needed beyond default execute-to-authenticated.
grant execute on function reveal_wine(uuid) to authenticated;
