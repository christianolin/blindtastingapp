-- Archetypes carry palate flavours as well as nose aromas. wine_archetype_aromas
-- gains a kind ('NOSE' | 'PALATE'); existing rows are nose. The primary key is
-- repointed to include kind so a term can be tasted as well as smelt. A baseline
-- palate is seeded as a copy of the nose set (the flavours you taste mirror the
-- nose) and can be diverged per archetype later.

alter table wine_archetype_aromas
  add column if not exists kind text not null default 'NOSE'
  check (kind in ('NOSE', 'PALATE'));

-- Repoint the primary key (archetype_id, term_id) -> (archetype_id, term_id, kind),
-- dropping whatever the existing PK is named.
do $$
declare c text;
begin
  select conname into c from pg_constraint
  where conrelid = 'public.wine_archetype_aromas'::regclass and contype = 'p';
  if c is not null then
    execute format('alter table wine_archetype_aromas drop constraint %I', c);
  end if;
end $$;
alter table wine_archetype_aromas
  add constraint wine_archetype_aromas_pkey primary key (archetype_id, term_id, kind);

-- Baseline palate = nose copy for every archetype.
insert into wine_archetype_aromas (archetype_id, term_id, kind)
select archetype_id, term_id, 'PALATE' from wine_archetype_aromas where kind = 'NOSE'
on conflict do nothing;

do $$
declare v_palate int; v_nose int;
begin
  select count(*) into v_palate from wine_archetype_aromas where kind = 'PALATE';
  select count(*) into v_nose from wine_archetype_aromas where kind = 'NOSE';
  if v_palate < v_nose then
    raise exception 'final-state: palate flavours (%) should mirror nose aromas (%)', v_palate, v_nose;
  end if;
end $$;
