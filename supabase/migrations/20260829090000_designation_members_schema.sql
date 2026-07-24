-- Phase 3F: classification MEMBERS. One row per chateau (ESTATE) or Grand Cru
-- vineyard (SITE) under a wine_designations system. Rendered in the Designation
-- library's Classifications section. Seeded PUBLISHED (published-read RLS, no
-- place-verified gate) so it renders without the promote workflow.
alter table public.wine_designations
  add column if not exists display_group text,
  add column if not exists sort_order int not null default 0;

create table if not exists public.wine_designation_members (
  id uuid primary key default gen_random_uuid(),
  designation_id uuid not null references public.wine_designations(id) on delete cascade,
  member_kind text not null check (member_kind in ('ESTATE','SITE')),
  name text not null,
  tier text,
  tier_rank int not null default 0,
  commune text,
  sort_order int not null default 0,
  producer_id uuid references public.producers(id),
  wine_place_id uuid references public.wine_places(id),
  local_note text,
  editorial_status wine_article_status not null default 'DRAFT',
  created_at timestamptz not null default now(),
  unique (designation_id, name)
);

create index if not exists wine_designation_members_designation_idx
  on public.wine_designation_members (designation_id);

alter table public.wine_designation_members enable row level security;

drop policy if exists "wine designation members published read" on public.wine_designation_members;
create policy "wine designation members published read"
  on public.wine_designation_members
  for select to authenticated
  using (editorial_status = 'PUBLISHED');

-- New system: Alsace Grand Cru (51 delimited lieux-dits). Seeded PUBLISHED.
insert into public.wine_designations (key, name, appellation_system, description, editorial_status, display_group, sort_order)
values ('alsace-grand-cru', 'Grand Cru (Alsace)', 'AOC/AOP',
  'Alsace''s 51 delimited Grand Cru vineyards, each its own AOC, generally for the four noble varieties (Riesling, Gewurztraminer, Pinot Gris, Muscat). The vineyard name appears on the label.',
  'PUBLISHED', 'Alsace', 30)
on conflict (key) do update set
  name = excluded.name, appellation_system = excluded.appellation_system,
  description = excluded.description, editorial_status = 'PUBLISHED',
  display_group = excluded.display_group, sort_order = excluded.sort_order;

-- Backfill display_group / sort_order for member-bearing systems.
update public.wine_designations set display_group = 'Bordeaux', sort_order = 10 where key = 'medoc-1855';
update public.wine_designations set display_group = 'Bordeaux', sort_order = 11 where key = 'sauternes-1855';
update public.wine_designations set display_group = 'Bordeaux', sort_order = 12 where key = 'saint-emilion-grand-cru-classe';
update public.wine_designations set display_group = 'Bordeaux', sort_order = 13 where key = 'graves-cru-classe';
update public.wine_designations set display_group = 'Burgundy', sort_order = 20 where key = 'burgundy-grand-cru';

do $$
declare v_designations int; v_alsace int; v_cols int;
begin
  select count(*) into v_designations from wine_designations;
  if v_designations <> 9 then raise exception 'expected 9 wine_designations, got %', v_designations; end if;
  select count(*) into v_alsace from wine_designations where key = 'alsace-grand-cru' and editorial_status = 'PUBLISHED';
  if v_alsace <> 1 then raise exception 'alsace-grand-cru missing/not published'; end if;
  select count(*) into v_cols from information_schema.columns
    where table_name = 'wine_designation_members' and column_name in ('member_kind','producer_id','wine_place_id','tier_rank');
  if v_cols <> 4 then raise exception 'wine_designation_members schema incomplete, got % of 4 cols', v_cols; end if;
end $$;
