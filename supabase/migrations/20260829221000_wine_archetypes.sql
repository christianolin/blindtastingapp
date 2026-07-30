-- Wine-style archetypes: "a typical wine from here", hung off a map place. Each
-- carries an identity (colour / style / grapes), a per-scale SAT *range* profile
-- (sat jsonb: { "tannin": ["MEDIUM","HIGH"], "acidity": ["MEDIUM_PLUS","HIGH"], … }
-- using the same camelCase keys as the note-editor state), a typical point-score
-- range, and its typical aromas (join table). Powers map -> pre-filled reference
-- sheet now, and the training room / recommendations later. Reference data:
-- readable by all authenticated users; writes gated to curators.

create table if not exists wine_archetypes (
  id uuid primary key default gen_random_uuid(),
  wine_place_id uuid not null references wine_places(id) on delete cascade,
  name text not null,
  colour wine_colour not null,
  style wine_style not null default 'STILL',
  primary_grape_id uuid references grapes(id) on delete set null,
  secondary_grape_id uuid references grapes(id) on delete set null,
  description text,
  sat jsonb not null default '{}',
  quality_low smallint check (quality_low is null or quality_low between 50 and 100),
  quality_high smallint check (quality_high is null or quality_high between 50 and 100),
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists wine_archetypes_place_idx on wine_archetypes (wine_place_id);

create table if not exists wine_archetype_aromas (
  archetype_id uuid not null references wine_archetypes(id) on delete cascade,
  term_id uuid not null references wset_aroma_terms(id) on delete cascade,
  primary key (archetype_id, term_id)
);

alter table wine_archetypes enable row level security;
alter table wine_archetype_aromas enable row level security;

drop policy if exists "archetypes read" on wine_archetypes;
create policy "archetypes read" on wine_archetypes for select to authenticated using (true);
drop policy if exists "archetypes write" on wine_archetypes;
create policy "archetypes write" on wine_archetypes for all to authenticated
  using (exists (select 1 from profiles p where p.id = auth.uid() and p.is_curator))
  with check (exists (select 1 from profiles p where p.id = auth.uid() and p.is_curator));

drop policy if exists "archetype aromas read" on wine_archetype_aromas;
create policy "archetype aromas read" on wine_archetype_aromas for select to authenticated using (true);
drop policy if exists "archetype aromas write" on wine_archetype_aromas;
create policy "archetype aromas write" on wine_archetype_aromas for all to authenticated
  using (exists (select 1 from profiles p where p.id = auth.uid() and p.is_curator))
  with check (exists (select 1 from profiles p where p.id = auth.uid() and p.is_curator));

do $$
begin
  if not exists (select 1 from information_schema.tables where table_name = 'wine_archetypes') then
    raise exception 'final-state: wine_archetypes missing';
  end if;
  if not exists (select 1 from information_schema.tables where table_name = 'wine_archetype_aromas') then
    raise exception 'final-state: wine_archetype_aromas missing';
  end if;
end $$;
