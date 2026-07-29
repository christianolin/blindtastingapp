-- P5 Migration A (non-destructive): wine_name + unidentified wines + dual-FK identity.
--
-- 1) catalog_wines.cuvee -> wine_name (the bottling's name, LWIN "Wine" field; e.g.
--    "Chateau Lascombes"). Broader than "cuvee" — every wine has a name.
-- 2) catalog_wines_unidentified: a parking place for the rare pour that genuinely
--    cannot be identified. Same shape as catalog_wines but ALL columns nullable, so a
--    strict catalog can coexist with honest unknowns. Never listed in the public catalog.
-- 3) wine_answers and wset_notes gain unidentified_wine_id and a CHECK that EXACTLY ONE
--    of (catalog_wine_id, unidentified_wine_id) is set — every pour/note resolves to
--    exactly one real record, DB-enforced. catalog_wine_id loses NOT NULL (an
--    unidentified pour leaves it null); the CHECK preserves the invariant.
--
-- Strictness on catalog_wines (NOT NULL) + the dedup unique index land in Migration B,
-- after the event-data purge (current rows are incomplete).

-- 1) rename
alter table catalog_wines rename column cuvee to wine_name;

-- 2) unidentified table (mirror of catalog_wines, all identity columns nullable)
create table catalog_wines_unidentified (
  id uuid primary key default gen_random_uuid(),
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
  colour wine_colour,
  style wine_style,
  wine_name text,
  bottle_size_ml int not null default 750,
  reason text,
  created_by uuid not null references profiles(id),
  resolved_into_catalog_wine_id uuid references catalog_wines(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table catalog_wines_unidentified enable row level security;

create policy "unidentified read" on catalog_wines_unidentified
  for select to authenticated using (true);
create policy "unidentified insert" on catalog_wines_unidentified
  for insert to authenticated with check (created_by = auth.uid());
create policy "unidentified update creator or curator" on catalog_wines_unidentified
  for update to authenticated
  using (
    created_by = auth.uid()
    or exists (select 1 from profiles p where p.id = auth.uid() and p.is_curator)
  )
  with check (
    created_by = auth.uid()
    or exists (select 1 from profiles p where p.id = auth.uid() and p.is_curator)
  );

create trigger catalog_wines_unidentified_set_updated_at
  before update on catalog_wines_unidentified
  for each row execute function set_updated_at();

-- 3) dual FK + exactly-one CHECK on wine_answers
alter table wine_answers alter column catalog_wine_id drop not null;
alter table wine_answers add column unidentified_wine_id uuid references catalog_wines_unidentified(id);
alter table wine_answers add constraint wine_answers_one_identity
  check (num_nonnulls(catalog_wine_id, unidentified_wine_id) = 1);

-- 3) dual FK + exactly-one CHECK on wset_notes
alter table wset_notes alter column catalog_wine_id drop not null;
alter table wset_notes add column unidentified_wine_id uuid references catalog_wines_unidentified(id);
alter table wset_notes add constraint wset_notes_one_identity
  check (num_nonnulls(catalog_wine_id, unidentified_wine_id) = 1);

-- final-state assertions
do $$
begin
  if exists (select 1 from information_schema.columns where table_name='catalog_wines' and column_name='cuvee') then
    raise exception 'final-state: catalog_wines.cuvee should be renamed to wine_name';
  end if;
  if not exists (select 1 from information_schema.columns where table_name='catalog_wines' and column_name='wine_name') then
    raise exception 'final-state: catalog_wines.wine_name missing';
  end if;
  if to_regclass('public.catalog_wines_unidentified') is null then
    raise exception 'final-state: catalog_wines_unidentified missing';
  end if;
  if not exists (select 1 from information_schema.columns where table_name='wine_answers' and column_name='unidentified_wine_id') then
    raise exception 'final-state: wine_answers.unidentified_wine_id missing';
  end if;
  if not exists (select 1 from information_schema.columns where table_name='wset_notes' and column_name='unidentified_wine_id') then
    raise exception 'final-state: wset_notes.unidentified_wine_id missing';
  end if;
  if not exists (select 1 from pg_constraint where conname='wine_answers_one_identity') then
    raise exception 'final-state: wine_answers_one_identity check missing';
  end if;
  if not exists (select 1 from pg_constraint where conname='wset_notes_one_identity') then
    raise exception 'final-state: wset_notes_one_identity check missing';
  end if;
end $$;
