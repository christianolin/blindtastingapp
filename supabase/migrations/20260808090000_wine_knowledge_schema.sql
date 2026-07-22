-- Phase 3K (Wine Knowledge Explorer) V1 schema.
--
-- Modular knowledge: a grape or designation exists once and is referenced
-- everywhere. New junctions link places to grapes/styles/designations with
-- an editorial lifecycle (reusing wine_article_status: content seeds as
-- DRAFT, the owner review flips it PUBLISHED; RLS exposes PUBLISHED only,
-- and only on VERIFIED places — mirroring the Phase 1 article policy).

create type wine_grape_role as enum ('PRINCIPAL', 'ACCESSORY');
create type wine_style_kind as enum (
  'RED', 'WHITE', 'ROSE', 'SPARKLING', 'SWEET', 'FORTIFIED'
);

-- Actual skin colour ("blue-black", "grey-pink") — the text color field
-- stays for filters/scoring. Soils joins climate as structured overview.
alter table public.grapes add column skin_color text;
alter table public.wine_place_articles add column soils text;

create table public.wine_place_grapes (
  id uuid primary key default gen_random_uuid(),
  wine_place_id uuid not null references public.wine_places(id) on delete cascade,
  grape_id uuid not null references public.grapes(id),
  role wine_grape_role not null,
  permitted boolean not null default true,
  share_pct numeric check (share_pct between 0 and 100),
  local_note text,
  editorial_status wine_article_status not null default 'DRAFT',
  created_at timestamptz not null default now(),
  unique (wine_place_id, grape_id)
);

create table public.wine_place_styles (
  id uuid primary key default gen_random_uuid(),
  wine_place_id uuid not null references public.wine_places(id) on delete cascade,
  style wine_style_kind not null,
  note text,
  sort_order int not null default 0,
  editorial_status wine_article_status not null default 'DRAFT',
  created_at timestamptz not null default now(),
  unique (wine_place_id, style)
);

-- One catalogue entry PER SYSTEM: Burgundy Grand Cru, Alsace Grand Cru and
-- Saint-Emilion Grand Cru are different legal things with different keys.
create table public.wine_designations (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  name text not null,
  appellation_system text,
  description text not null,
  editorial_status wine_article_status not null default 'DRAFT',
  created_at timestamptz not null default now()
);

create table public.wine_place_designations (
  id uuid primary key default gen_random_uuid(),
  wine_place_id uuid not null references public.wine_places(id) on delete cascade,
  designation_id uuid not null references public.wine_designations(id) on delete cascade,
  local_note text,
  editorial_status wine_article_status not null default 'DRAFT',
  created_at timestamptz not null default now(),
  unique (wine_place_id, designation_id)
);

create index wine_place_grapes_place_idx on public.wine_place_grapes (wine_place_id);
create index wine_place_grapes_grape_idx on public.wine_place_grapes (grape_id);
create index wine_place_styles_place_idx on public.wine_place_styles (wine_place_id);
create index wine_place_designations_place_idx on public.wine_place_designations (wine_place_id);

alter table public.wine_place_grapes enable row level security;
alter table public.wine_place_styles enable row level security;
alter table public.wine_designations enable row level security;
alter table public.wine_place_designations enable row level security;

create policy "wine place grapes published read" on public.wine_place_grapes
  for select to authenticated
  using (
    editorial_status = 'PUBLISHED'
    and exists (
      select 1 from public.wine_places p
      where p.id = wine_place_grapes.wine_place_id
        and p.publication_status = 'VERIFIED'
    )
  );

create policy "wine place styles published read" on public.wine_place_styles
  for select to authenticated
  using (
    editorial_status = 'PUBLISHED'
    and exists (
      select 1 from public.wine_places p
      where p.id = wine_place_styles.wine_place_id
        and p.publication_status = 'VERIFIED'
    )
  );

create policy "wine designations published read" on public.wine_designations
  for select to authenticated
  using (editorial_status = 'PUBLISHED');

create policy "wine place designations published read" on public.wine_place_designations
  for select to authenticated
  using (
    editorial_status = 'PUBLISHED'
    and exists (
      select 1 from public.wine_places p
      where p.id = wine_place_designations.wine_place_id
        and p.publication_status = 'VERIFIED'
    )
  );

-- DUAL_LABEL seeds surfaced by the sibling-trim tool (legally shared land).
-- Direction matches the existing Barsac -> Sauternes edge: source may also
-- be sold under the target's appellation.
do $$
declare
  v_source uuid;
  v_target uuid;
begin
  select id into v_source from wine_places
   where canonical_key = 'france.bourgogne.cote-de-nuits.gevrey-chambertin.chambertin-clos-de-beze';
  select id into v_target from wine_places
   where canonical_key = 'france.bourgogne.cote-de-nuits.gevrey-chambertin.chambertin';
  if v_source is null or v_target is null then
    raise exception 'Chambertin dual-label pair not found';
  end if;
  insert into wine_place_relationships (source_place_id, target_place_id, relationship_type, note)
  values (v_source, v_target, 'DUAL_LABEL',
          'Chambertin-Clos de Beze may legally be sold as Chambertin (shared footprint in INAO parcels).')
  on conflict do nothing;

  select id into v_source from wine_places
   where canonical_key = 'france.bourgogne.cote-de-nuits.gevrey-chambertin.mazoyeres-chambertin';
  select id into v_target from wine_places
   where canonical_key = 'france.bourgogne.cote-de-nuits.gevrey-chambertin.charmes-chambertin';
  if v_source is null or v_target is null then
    raise exception 'Charmes dual-label pair not found';
  end if;
  insert into wine_place_relationships (source_place_id, target_place_id, relationship_type, note)
  values (v_source, v_target, 'DUAL_LABEL',
          'Mazoyeres-Chambertin may legally be sold as Charmes-Chambertin (fully shared footprint in INAO parcels).')
  on conflict do nothing;
end $$;
