-- WSET aroma/flavour lexicon: the 89 WSET Level 3 SAT descriptors, grouped
-- family -> group -> term, with sort_order = overall sheet position 1..89.
-- Reference data: readable + insertable by authenticated, no update/delete.
-- Completes 20260829194000 by adding the deferred FK from
-- wset_note_aromas.term_id to this table.

do $$
begin
  if to_regtype('public.wset_aroma_family') is null then
    create type wset_aroma_family as enum
      ('FRUIT', 'FLORAL', 'SPICE', 'VEGETAL_OAK', 'OTHER');
  end if;
end $$;

create table if not exists wset_aroma_terms (
  id uuid primary key default gen_random_uuid(),
  family wset_aroma_family not null,
  group_name text not null,
  term text not null unique,
  sort_order int not null
);

alter table wset_aroma_terms enable row level security;

drop policy if exists "wset aroma terms read" on wset_aroma_terms;
create policy "wset aroma terms read" on wset_aroma_terms
  for select to authenticated using (true);
drop policy if exists "wset aroma terms insert" on wset_aroma_terms;
create policy "wset aroma terms insert" on wset_aroma_terms
  for insert to authenticated with check (true);

insert into wset_aroma_terms (family, group_name, term, sort_order)
select v.family::wset_aroma_family, v.group_name, v.term, v.sort_order
from (values
  ('FRUIT', 'Citrus', 'grapefruit', 1),
  ('FRUIT', 'Citrus', 'lemon', 2),
  ('FRUIT', 'Citrus', 'lime', 3),
  ('FRUIT', 'Green fruit', 'green apple', 4),
  ('FRUIT', 'Green fruit', 'red apple', 5),
  ('FRUIT', 'Green fruit', 'gooseberry', 6),
  ('FRUIT', 'Green fruit', 'pear', 7),
  ('FRUIT', 'Stone fruit', 'apricot', 8),
  ('FRUIT', 'Stone fruit', 'peach', 9),
  ('FRUIT', 'Red fruit', 'raspberry', 10),
  ('FRUIT', 'Red fruit', 'red cherry', 11),
  ('FRUIT', 'Red fruit', 'plum', 12),
  ('FRUIT', 'Red fruit', 'redcurrant', 13),
  ('FRUIT', 'Red fruit', 'strawberry', 14),
  ('FRUIT', 'Black fruit', 'blackberry', 15),
  ('FRUIT', 'Black fruit', 'black cherry', 16),
  ('FRUIT', 'Black fruit', 'blackcurrant', 17),
  ('FRUIT', 'Tropical', 'banana', 18),
  ('FRUIT', 'Tropical', 'kiwi', 19),
  ('FRUIT', 'Tropical', 'lychee', 20),
  ('FRUIT', 'Tropical', 'mango', 21),
  ('FRUIT', 'Tropical', 'melon', 22),
  ('FRUIT', 'Tropical', 'passion fruit', 23),
  ('FRUIT', 'Tropical', 'pineapple', 24),
  ('FRUIT', 'Dried fruit', 'fig', 25),
  ('FRUIT', 'Dried fruit', 'prune', 26),
  ('FRUIT', 'Dried fruit', 'raisin', 27),
  ('FRUIT', 'Dried fruit', 'sultana', 28),
  ('FLORAL', 'Blossom', 'elderflower', 29),
  ('FLORAL', 'Blossom', 'orange blossom', 30),
  ('FLORAL', 'Flowers', 'perfume', 31),
  ('FLORAL', 'Flowers', 'rose', 32),
  ('FLORAL', 'Flowers', 'violet', 33),
  ('SPICE', 'Sweet', 'cinnamon', 34),
  ('SPICE', 'Sweet', 'cloves', 35),
  ('SPICE', 'Sweet', 'ginger', 36),
  ('SPICE', 'Sweet', 'nutmeg', 37),
  ('SPICE', 'Sweet', 'vanilla', 38),
  ('SPICE', 'Pungent', 'black pepper', 39),
  ('SPICE', 'Pungent', 'white pepper', 40),
  ('SPICE', 'Pungent', 'liquorice', 41),
  ('SPICE', 'Pungent', 'juniper', 42),
  ('VEGETAL_OAK', 'Fresh', 'asparagus', 43),
  ('VEGETAL_OAK', 'Fresh', 'green bell pepper', 44),
  ('VEGETAL_OAK', 'Fresh', 'mushroom', 45),
  ('VEGETAL_OAK', 'Cooked', 'cabbage', 46),
  ('VEGETAL_OAK', 'Cooked', 'tinned vegetables', 47),
  ('VEGETAL_OAK', 'Cooked', 'black olive', 48),
  ('VEGETAL_OAK', 'Herbaceous', 'eucalyptus', 49),
  ('VEGETAL_OAK', 'Herbaceous', 'grass', 50),
  ('VEGETAL_OAK', 'Herbaceous', 'hay', 51),
  ('VEGETAL_OAK', 'Herbaceous', 'mint', 52),
  ('VEGETAL_OAK', 'Herbaceous', 'blackcurrant leaf', 53),
  ('VEGETAL_OAK', 'Herbaceous', 'wet leaves', 54),
  ('VEGETAL_OAK', 'Kernel', 'almond', 55),
  ('VEGETAL_OAK', 'Kernel', 'coconut', 56),
  ('VEGETAL_OAK', 'Kernel', 'hazelnut', 57),
  ('VEGETAL_OAK', 'Kernel', 'walnut', 58),
  ('VEGETAL_OAK', 'Kernel', 'chocolate', 59),
  ('VEGETAL_OAK', 'Kernel', 'coffee', 60),
  ('VEGETAL_OAK', 'Oak', 'cedar', 61),
  ('VEGETAL_OAK', 'Oak', 'medicinal', 62),
  ('VEGETAL_OAK', 'Oak', 'resinous', 63),
  ('VEGETAL_OAK', 'Oak', 'smoke', 64),
  ('VEGETAL_OAK', 'Oak', 'tobacco', 65),
  ('OTHER', 'Animal', 'leather', 66),
  ('OTHER', 'Animal', 'wet wool', 67),
  ('OTHER', 'Animal', 'meaty', 68),
  ('OTHER', 'Autolytic', 'yeast', 69),
  ('OTHER', 'Autolytic', 'biscuit', 70),
  ('OTHER', 'Autolytic', 'bread', 71),
  ('OTHER', 'Autolytic', 'toast', 72),
  ('OTHER', 'Dairy', 'butter', 73),
  ('OTHER', 'Dairy', 'cheese', 74),
  ('OTHER', 'Dairy', 'cream', 75),
  ('OTHER', 'Dairy', 'yoghurt', 76),
  ('OTHER', 'Mineral', 'earth', 77),
  ('OTHER', 'Mineral', 'petrol', 78),
  ('OTHER', 'Mineral', 'rubber', 79),
  ('OTHER', 'Mineral', 'tar', 80),
  ('OTHER', 'Mineral', 'stony / steely', 81),
  ('OTHER', 'Ripeness', 'caramel', 82),
  ('OTHER', 'Ripeness', 'candy', 83),
  ('OTHER', 'Ripeness', 'honey', 84),
  ('OTHER', 'Ripeness', 'jam', 85),
  ('OTHER', 'Ripeness', 'marmalade', 86),
  ('OTHER', 'Ripeness', 'treacle', 87),
  ('OTHER', 'Ripeness', 'cooked / baked', 88),
  ('OTHER', 'Ripeness', 'stewed', 89)
) as v(family, group_name, term, sort_order)
where not exists (select 1 from wset_aroma_terms);

-- FK deferred from 20260829194000: note aromas must point at a real term.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'wset_note_aromas_term_fk'
      and conrelid = 'public.wset_note_aromas'::regclass
  ) then
    alter table wset_note_aromas
      add constraint wset_note_aromas_term_fk
      foreign key (term_id) references wset_aroma_terms(id);
  end if;
end $$;

-- Final-state asserts.
do $$
declare
  v_total int;
  v_fruit int;
  v_floral int;
  v_spice int;
  v_vegetal int;
  v_other int;
begin
  select count(*) into v_total from wset_aroma_terms;
  if v_total <> 89 then
    raise exception 'final-state: expected 89 aroma terms, found %', v_total;
  end if;
  select
    count(*) filter (where family = 'FRUIT'),
    count(*) filter (where family = 'FLORAL'),
    count(*) filter (where family = 'SPICE'),
    count(*) filter (where family = 'VEGETAL_OAK'),
    count(*) filter (where family = 'OTHER')
  into v_fruit, v_floral, v_spice, v_vegetal, v_other
  from wset_aroma_terms;
  if v_fruit <> 28 or v_floral <> 5 or v_spice <> 9
     or v_vegetal <> 23 or v_other <> 24 then
    raise exception
      'final-state: family counts FRUIT=% FLORAL=% SPICE=% VEGETAL_OAK=% OTHER=% (expected 28/5/9/23/24)',
      v_fruit, v_floral, v_spice, v_vegetal, v_other;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'wset_note_aromas_term_fk'
      and conrelid = 'public.wset_note_aromas'::regclass
  ) then
    raise exception 'final-state: wset_note_aromas_term_fk missing';
  end if;
end $$;
