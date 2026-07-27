-- WSET tasting notes: a taster's structured note on a catalog wine,
-- following the WSET Level 3 Systematic Approach to Tasting Wine. Notes are
-- author-owned (RLS below) and publicly readable. wset_note_aromas.term_id
-- deliberately has NO foreign key yet: the aroma/flavour terms table lands
-- in 20260829195000, which adds the constraint there.

do $$
begin
  if to_regtype('public.wset_clarity') is null then
    create type wset_clarity as enum ('CLEAR', 'HAZY');
  end if;
  if to_regtype('public.wset_condition') is null then
    create type wset_condition as enum ('CLEAN', 'UNCLEAN');
  end if;
  if to_regtype('public.wset_appearance_intensity') is null then
    create type wset_appearance_intensity as enum
      ('PALE', 'MEDIUM_MINUS', 'MEDIUM', 'MEDIUM_PLUS', 'DEEP');
  end if;
  if to_regtype('public.wset_intensity') is null then
    create type wset_intensity as enum
      ('LIGHT', 'MEDIUM_MINUS', 'MEDIUM', 'MEDIUM_PLUS', 'PRONOUNCED');
  end if;
  if to_regtype('public.wset_development') is null then
    create type wset_development as enum
      ('YOUTHFUL', 'DEVELOPING', 'FULLY_DEVELOPED', 'TIRED_PAST_BEST');
  end if;
  if to_regtype('public.wset_sweetness') is null then
    create type wset_sweetness as enum
      ('DRY', 'OFF_DRY', 'MEDIUM_DRY', 'MEDIUM', 'MEDIUM_SWEET', 'SWEET', 'LUSCIOUS');
  end if;
  if to_regtype('public.wset_level') is null then
    create type wset_level as enum
      ('LOW', 'MEDIUM_MINUS', 'MEDIUM', 'MEDIUM_PLUS', 'HIGH');
  end if;
  if to_regtype('public.wset_body') is null then
    create type wset_body as enum
      ('LIGHT', 'MEDIUM_MINUS', 'MEDIUM', 'MEDIUM_PLUS', 'FULL');
  end if;
end $$;

do $$
begin
  if to_regtype('public.wset_finish') is null then
    create type wset_finish as enum
      ('SHORT', 'MEDIUM_MINUS', 'MEDIUM', 'MEDIUM_PLUS', 'LONG');
  end if;
  if to_regtype('public.wset_mousse') is null then
    create type wset_mousse as enum ('DELICATE', 'CREAMY', 'AGGRESSIVE');
  end if;
  if to_regtype('public.wset_colour_hue') is null then
    create type wset_colour_hue as enum
      ('LEMON_GREEN', 'LEMON', 'GOLD', 'AMBER', 'BROWN',
       'PINK', 'SALMON', 'ORANGE',
       'PURPLE', 'RUBY', 'GARNET', 'TAWNY');
  end if;
  if to_regtype('public.wset_observation') is null then
    create type wset_observation as enum
      ('LEGS_TEARS', 'DEPOSIT', 'PETILLANCE', 'RIM_VARIATION', 'TINTS_HIGHLIGHTS');
  end if;
  if to_regtype('public.wset_fault') is null then
    create type wset_fault as enum
      ('OXIDISED', 'OUT_OF_CONDITION', 'CORK_TAINT', 'OTHER');
  end if;
  if to_regtype('public.wset_price_category') is null then
    create type wset_price_category as enum
      ('INEXPENSIVE', 'MID_PRICED', 'HIGH_PRICED', 'PREMIUM');
  end if;
  if to_regtype('public.wset_readiness') is null then
    create type wset_readiness as enum
      ('NEEDS_TIME', 'READY_CAN_IMPROVE', 'READY_WONT_IMPROVE', 'TOO_OLD');
  end if;
end $$;

create table if not exists wset_notes (
  id uuid primary key default gen_random_uuid(),
  catalog_wine_id uuid not null references catalog_wines(id) on delete restrict,
  author_id uuid not null references profiles(id) on delete restrict,
  tasted_on date not null default current_date,
  clarity wset_clarity,
  appearance_intensity wset_appearance_intensity,
  colour_hue wset_colour_hue,
  observations wset_observation[] not null default '{}',
  condition wset_condition,
  faults wset_fault[] not null default '{}',
  nose_intensity wset_intensity,
  development wset_development,
  sweetness wset_sweetness,
  acidity wset_level,
  tannin wset_level,
  alcohol wset_level,
  body wset_body,
  mousse wset_mousse,
  flavour_intensity wset_intensity,
  finish wset_finish,
  quality_score smallint,
  price_category wset_price_category,
  readiness wset_readiness,
  taster_notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint wset_notes_quality_score_range check (quality_score between 50 and 100)
);

drop trigger if exists wset_notes_set_updated_at on wset_notes;
create trigger wset_notes_set_updated_at
  before update on wset_notes
  for each row execute function set_updated_at();

alter table wset_notes enable row level security;

drop policy if exists "wset notes read" on wset_notes;
create policy "wset notes read" on wset_notes for select to authenticated using (true);
drop policy if exists "wset notes insert" on wset_notes;
create policy "wset notes insert" on wset_notes for insert to authenticated
  with check (author_id = auth.uid());
drop policy if exists "wset notes update" on wset_notes;
create policy "wset notes update" on wset_notes for update to authenticated
  using (author_id = auth.uid()) with check (author_id = auth.uid());
drop policy if exists "wset notes delete" on wset_notes;
create policy "wset notes delete" on wset_notes for delete to authenticated
  using (author_id = auth.uid());

create table if not exists wset_note_aromas (
  note_id uuid not null references wset_notes(id) on delete cascade,
  -- term_id references the aroma/flavour terms table that lands in
  -- 20260829195000; that migration adds the FK constraint.
  term_id uuid not null,
  sensed_on_nose boolean not null default false,
  sensed_on_palate boolean not null default false,
  primary key (note_id, term_id),
  constraint wset_note_aromas_sensed_somewhere check (sensed_on_nose or sensed_on_palate)
);

alter table wset_note_aromas enable row level security;

drop policy if exists "wset note aromas read" on wset_note_aromas;
create policy "wset note aromas read" on wset_note_aromas
  for select to authenticated using (true);
drop policy if exists "wset note aromas insert" on wset_note_aromas;
create policy "wset note aromas insert" on wset_note_aromas
  for insert to authenticated
  with check (exists (
    select 1 from wset_notes n where n.id = note_id and n.author_id = auth.uid()
  ));
drop policy if exists "wset note aromas update" on wset_note_aromas;
create policy "wset note aromas update" on wset_note_aromas
  for update to authenticated
  using (exists (
    select 1 from wset_notes n where n.id = note_id and n.author_id = auth.uid()
  ))
  with check (exists (
    select 1 from wset_notes n where n.id = note_id and n.author_id = auth.uid()
  ));
drop policy if exists "wset note aromas delete" on wset_note_aromas;
create policy "wset note aromas delete" on wset_note_aromas
  for delete to authenticated
  using (exists (
    select 1 from wset_notes n where n.id = note_id and n.author_id = auth.uid()
  ));

-- Hue must match the wine's colour: WHITE hues lemon-green..brown, ROSE
-- pink/salmon/orange, RED purple..tawny + brown (WSET L3 SAT).
create or replace function wset_notes_check_hue()
returns trigger
language plpgsql
as $$
declare
  v_colour wine_colour;
begin
  if new.colour_hue is null then
    return new;
  end if;
  select colour into v_colour from catalog_wines where id = new.catalog_wine_id;
  if v_colour = 'WHITE' and new.colour_hue not in
       ('LEMON_GREEN', 'LEMON', 'GOLD', 'AMBER', 'BROWN') then
    raise exception 'colour_hue % not valid for WHITE wine', new.colour_hue
      using errcode = '23514';
  elsif v_colour = 'ROSE' and new.colour_hue not in
       ('PINK', 'SALMON', 'ORANGE') then
    raise exception 'colour_hue % not valid for ROSE wine', new.colour_hue
      using errcode = '23514';
  elsif v_colour = 'RED' and new.colour_hue not in
       ('PURPLE', 'RUBY', 'GARNET', 'TAWNY', 'BROWN') then
    raise exception 'colour_hue % not valid for RED wine', new.colour_hue
      using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists wset_notes_hue_matches_colour on wset_notes;
create trigger wset_notes_hue_matches_colour
  before insert or update on wset_notes
  for each row execute function wset_notes_check_hue();

-- Final-state asserts.
do $$
declare
  v_notes_policies int;
  v_aroma_policies int;
begin
  if to_regclass('public.wset_notes') is null then
    raise exception 'final-state: wset_notes table missing';
  end if;
  if to_regclass('public.wset_note_aromas') is null then
    raise exception 'final-state: wset_note_aromas table missing';
  end if;
  select count(*) into v_notes_policies
  from pg_policies
  where schemaname = 'public' and tablename = 'wset_notes';
  if v_notes_policies <> 4 then
    raise exception 'final-state: expected 4 wset_notes policies, found %', v_notes_policies;
  end if;
  select count(*) into v_aroma_policies
  from pg_policies
  where schemaname = 'public' and tablename = 'wset_note_aromas';
  if v_aroma_policies <> 4 then
    raise exception 'final-state: expected 4 wset_note_aromas policies, found %', v_aroma_policies;
  end if;
  if not exists (
    select 1 from pg_trigger
    where tgname = 'wset_notes_hue_matches_colour'
      and tgrelid = 'public.wset_notes'::regclass
  ) then
    raise exception 'final-state: wset_notes_hue_matches_colour trigger missing';
  end if;
  if not exists (
    select 1 from pg_trigger
    where tgname = 'wset_notes_set_updated_at'
      and tgrelid = 'public.wset_notes'::regclass
  ) then
    raise exception 'final-state: wset_notes_set_updated_at trigger missing';
  end if;
end $$;
