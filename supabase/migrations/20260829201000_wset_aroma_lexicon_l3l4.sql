-- WSET aroma/flavour lexicon rebuilt from the combined WSET Level 3 + Level 4
-- Wine-Lexicon: origin -> cluster (group_name) -> term, deduped within a cluster;
-- cross-origin repeats are intentional (e.g. cinnamon as a Primary grape spice
-- AND a Tertiary bottle-age note). "black olive" dropped (not in the lexicon).
-- Uniqueness relaxed from term to (origin, group_name, term). Guarded on the new
-- 'jasmine' term: first apply reseeds (clearing old note-aroma links); re-apply
-- is a no-op.

alter table wset_aroma_terms drop constraint if exists wset_aroma_terms_term_key;
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'wset_aroma_terms_natural_key'
      and conrelid = 'public.wset_aroma_terms'::regclass
  ) then
    alter table wset_aroma_terms
      add constraint wset_aroma_terms_natural_key unique (origin, group_name, term);
  end if;
end $$;

do $$
begin
  if not exists (select 1 from wset_aroma_terms where term = 'jasmine') then
    delete from wset_note_aromas where term_id in (select id from wset_aroma_terms);
    delete from wset_aroma_terms;
    insert into wset_aroma_terms (family, origin, group_name, term, sort_order) values
      ('FLORAL', 'PRIMARY', 'Floral', 'blossom', 1),
      ('FLORAL', 'PRIMARY', 'Floral', 'acacia', 2),
      ('FLORAL', 'PRIMARY', 'Floral', 'elderflower', 3),
      ('FLORAL', 'PRIMARY', 'Floral', 'honeysuckle', 4),
      ('FLORAL', 'PRIMARY', 'Floral', 'jasmine', 5),
      ('FLORAL', 'PRIMARY', 'Floral', 'chamomile', 6),
      ('FLORAL', 'PRIMARY', 'Floral', 'geranium', 7),
      ('FLORAL', 'PRIMARY', 'Floral', 'rose', 8),
      ('FLORAL', 'PRIMARY', 'Floral', 'violet', 9),
      ('FRUIT', 'PRIMARY', 'Green fruit', 'apple', 10),
      ('FRUIT', 'PRIMARY', 'Green fruit', 'pear', 11),
      ('FRUIT', 'PRIMARY', 'Green fruit', 'gooseberry', 12),
      ('FRUIT', 'PRIMARY', 'Green fruit', 'grape', 13),
      ('FRUIT', 'PRIMARY', 'Green fruit', 'pear drop', 14),
      ('FRUIT', 'PRIMARY', 'Green fruit', 'quince', 15),
      ('FRUIT', 'PRIMARY', 'Citrus fruit', 'grapefruit', 16),
      ('FRUIT', 'PRIMARY', 'Citrus fruit', 'lemon', 17),
      ('FRUIT', 'PRIMARY', 'Citrus fruit', 'lime', 18),
      ('FRUIT', 'PRIMARY', 'Citrus fruit', 'orange', 19),
      ('FRUIT', 'PRIMARY', 'Citrus fruit', 'lemon peel', 20),
      ('FRUIT', 'PRIMARY', 'Citrus fruit', 'orange peel', 21),
      ('FRUIT', 'PRIMARY', 'Stone fruit', 'peach', 22),
      ('FRUIT', 'PRIMARY', 'Stone fruit', 'apricot', 23),
      ('FRUIT', 'PRIMARY', 'Stone fruit', 'nectarine', 24),
      ('FRUIT', 'PRIMARY', 'Tropical fruit', 'banana', 25),
      ('FRUIT', 'PRIMARY', 'Tropical fruit', 'lychee', 26),
      ('FRUIT', 'PRIMARY', 'Tropical fruit', 'mango', 27),
      ('FRUIT', 'PRIMARY', 'Tropical fruit', 'melon', 28),
      ('FRUIT', 'PRIMARY', 'Tropical fruit', 'passion fruit', 29),
      ('FRUIT', 'PRIMARY', 'Tropical fruit', 'pineapple', 30),
      ('FRUIT', 'PRIMARY', 'Red fruit', 'redcurrant', 31),
      ('FRUIT', 'PRIMARY', 'Red fruit', 'cranberry', 32),
      ('FRUIT', 'PRIMARY', 'Red fruit', 'raspberry', 33),
      ('FRUIT', 'PRIMARY', 'Red fruit', 'strawberry', 34),
      ('FRUIT', 'PRIMARY', 'Red fruit', 'red cherry', 35),
      ('FRUIT', 'PRIMARY', 'Red fruit', 'red plum', 36),
      ('FRUIT', 'PRIMARY', 'Black fruit', 'blackcurrant', 37),
      ('FRUIT', 'PRIMARY', 'Black fruit', 'blackberry', 38),
      ('FRUIT', 'PRIMARY', 'Black fruit', 'blueberry', 39),
      ('FRUIT', 'PRIMARY', 'Black fruit', 'black cherry', 40),
      ('FRUIT', 'PRIMARY', 'Black fruit', 'black plum', 41),
      ('FRUIT', 'PRIMARY', 'Black fruit', 'bramble', 42),
      ('VEGETAL_OAK', 'PRIMARY', 'Herbaceous', 'green bell pepper', 43),
      ('VEGETAL_OAK', 'PRIMARY', 'Herbaceous', 'grass', 44),
      ('VEGETAL_OAK', 'PRIMARY', 'Herbaceous', 'tomato leaf', 45),
      ('VEGETAL_OAK', 'PRIMARY', 'Herbaceous', 'asparagus', 46),
      ('VEGETAL_OAK', 'PRIMARY', 'Herbaceous', 'blackcurrant leaf', 47),
      ('VEGETAL_OAK', 'PRIMARY', 'Herbal', 'eucalyptus', 48),
      ('VEGETAL_OAK', 'PRIMARY', 'Herbal', 'mint', 49),
      ('VEGETAL_OAK', 'PRIMARY', 'Herbal', 'fennel', 50),
      ('VEGETAL_OAK', 'PRIMARY', 'Herbal', 'dill', 51),
      ('VEGETAL_OAK', 'PRIMARY', 'Herbal', 'dried herbs', 52),
      ('VEGETAL_OAK', 'PRIMARY', 'Herbal', 'medicinal', 53),
      ('VEGETAL_OAK', 'PRIMARY', 'Herbal', 'lavender', 54),
      ('SPICE', 'PRIMARY', 'Spice', 'black pepper', 55),
      ('SPICE', 'PRIMARY', 'Spice', 'white pepper', 56),
      ('SPICE', 'PRIMARY', 'Spice', 'liquorice', 57),
      ('SPICE', 'PRIMARY', 'Spice', 'cinnamon', 58),
      ('FRUIT', 'PRIMARY', 'Fruit ripeness', 'unripe fruit', 59),
      ('FRUIT', 'PRIMARY', 'Fruit ripeness', 'ripe fruit', 60),
      ('FRUIT', 'PRIMARY', 'Fruit ripeness', 'dried fruit', 61),
      ('FRUIT', 'PRIMARY', 'Fruit ripeness', 'cooked fruit', 62),
      ('FRUIT', 'PRIMARY', 'Fruit ripeness', 'jammy', 63),
      ('OTHER', 'PRIMARY', 'Other', 'simple', 64),
      ('OTHER', 'PRIMARY', 'Other', 'wet stones', 65),
      ('OTHER', 'PRIMARY', 'Other', 'flint', 66),
      ('OTHER', 'PRIMARY', 'Other', 'candy', 67),
      ('OTHER', 'PRIMARY', 'Other', 'wet wool', 68),
      ('VEGETAL_OAK', 'SECONDARY', 'Yeast', 'biscuit', 69),
      ('VEGETAL_OAK', 'SECONDARY', 'Yeast', 'graham cracker', 70),
      ('VEGETAL_OAK', 'SECONDARY', 'Yeast', 'bread', 71),
      ('VEGETAL_OAK', 'SECONDARY', 'Yeast', 'toast', 72),
      ('VEGETAL_OAK', 'SECONDARY', 'Yeast', 'pastry', 73),
      ('VEGETAL_OAK', 'SECONDARY', 'Yeast', 'brioche', 74),
      ('VEGETAL_OAK', 'SECONDARY', 'Yeast', 'bread dough', 75),
      ('VEGETAL_OAK', 'SECONDARY', 'Yeast', 'cheese', 76),
      ('VEGETAL_OAK', 'SECONDARY', 'Yeast', 'yogurt', 77),
      ('VEGETAL_OAK', 'SECONDARY', 'Yeast', 'acetaldehyde', 78),
      ('VEGETAL_OAK', 'SECONDARY', 'Malolactic', 'butter', 79),
      ('VEGETAL_OAK', 'SECONDARY', 'Malolactic', 'cream', 80),
      ('VEGETAL_OAK', 'SECONDARY', 'Malolactic', 'cheese', 81),
      ('VEGETAL_OAK', 'SECONDARY', 'Oak', 'vanilla', 82),
      ('VEGETAL_OAK', 'SECONDARY', 'Oak', 'cloves', 83),
      ('VEGETAL_OAK', 'SECONDARY', 'Oak', 'nutmeg', 84),
      ('VEGETAL_OAK', 'SECONDARY', 'Oak', 'coconut', 85),
      ('VEGETAL_OAK', 'SECONDARY', 'Oak', 'butterscotch', 86),
      ('VEGETAL_OAK', 'SECONDARY', 'Oak', 'toast', 87),
      ('VEGETAL_OAK', 'SECONDARY', 'Oak', 'cedar', 88),
      ('VEGETAL_OAK', 'SECONDARY', 'Oak', 'charred wood', 89),
      ('VEGETAL_OAK', 'SECONDARY', 'Oak', 'smoke', 90),
      ('VEGETAL_OAK', 'SECONDARY', 'Oak', 'chocolate', 91),
      ('VEGETAL_OAK', 'SECONDARY', 'Oak', 'coffee', 92),
      ('VEGETAL_OAK', 'SECONDARY', 'Oak', 'resinous', 93),
      ('OTHER', 'TERTIARY', 'Red wine', 'prune', 94),
      ('OTHER', 'TERTIARY', 'Red wine', 'raisin', 95),
      ('OTHER', 'TERTIARY', 'Red wine', 'fig', 96),
      ('OTHER', 'TERTIARY', 'Red wine', 'cooked plum', 97),
      ('OTHER', 'TERTIARY', 'Red wine', 'cooked cherry', 98),
      ('OTHER', 'TERTIARY', 'Red wine', 'cooked red plum', 99),
      ('OTHER', 'TERTIARY', 'Red wine', 'dried blackberry', 100),
      ('OTHER', 'TERTIARY', 'Red wine', 'dried cranberry', 101),
      ('OTHER', 'TERTIARY', 'Red wine', 'cooked blackberry', 102),
      ('OTHER', 'TERTIARY', 'Red wine', 'kirsch', 103),
      ('OTHER', 'TERTIARY', 'Red wine', 'leather', 104),
      ('OTHER', 'TERTIARY', 'Red wine', 'earth', 105),
      ('OTHER', 'TERTIARY', 'Red wine', 'mushroom', 106),
      ('OTHER', 'TERTIARY', 'Red wine', 'meat', 107),
      ('OTHER', 'TERTIARY', 'Red wine', 'game', 108),
      ('OTHER', 'TERTIARY', 'Red wine', 'tobacco', 109),
      ('OTHER', 'TERTIARY', 'Red wine', 'wet leaves', 110),
      ('OTHER', 'TERTIARY', 'Red wine', 'forest floor', 111),
      ('OTHER', 'TERTIARY', 'Red wine', 'vegetal', 112),
      ('OTHER', 'TERTIARY', 'Red wine', 'savoury', 113),
      ('OTHER', 'TERTIARY', 'Red wine', 'farmyard', 114),
      ('OTHER', 'TERTIARY', 'Red wine', 'tar', 115),
      ('OTHER', 'TERTIARY', 'Red wine', 'caramel', 116),
      ('OTHER', 'TERTIARY', 'White wine', 'dried apricot', 117),
      ('OTHER', 'TERTIARY', 'White wine', 'sultana', 118),
      ('OTHER', 'TERTIARY', 'White wine', 'raisin', 119),
      ('OTHER', 'TERTIARY', 'White wine', 'orange marmalade', 120),
      ('OTHER', 'TERTIARY', 'White wine', 'petrol', 121),
      ('OTHER', 'TERTIARY', 'White wine', 'kerosene', 122),
      ('OTHER', 'TERTIARY', 'White wine', 'cinnamon', 123),
      ('OTHER', 'TERTIARY', 'White wine', 'ginger', 124),
      ('OTHER', 'TERTIARY', 'White wine', 'nutmeg', 125),
      ('OTHER', 'TERTIARY', 'White wine', 'almond', 126),
      ('OTHER', 'TERTIARY', 'White wine', 'hazelnut', 127),
      ('OTHER', 'TERTIARY', 'White wine', 'honey', 128),
      ('OTHER', 'TERTIARY', 'White wine', 'caramel', 129),
      ('OTHER', 'TERTIARY', 'White wine', 'toast', 130),
      ('OTHER', 'TERTIARY', 'White wine', 'nutty', 131),
      ('OTHER', 'TERTIARY', 'White wine', 'mushroom', 132),
      ('OTHER', 'TERTIARY', 'White wine', 'hay', 133),
      ('OTHER', 'TERTIARY', 'White wine', 'dried apple', 134),
      ('OTHER', 'TERTIARY', 'White wine', 'dried banana', 135),
      ('OTHER', 'TERTIARY', 'Deliberately oxidised', 'almond', 136),
      ('OTHER', 'TERTIARY', 'Deliberately oxidised', 'marzipan', 137),
      ('OTHER', 'TERTIARY', 'Deliberately oxidised', 'hazelnut', 138),
      ('OTHER', 'TERTIARY', 'Deliberately oxidised', 'walnut', 139),
      ('OTHER', 'TERTIARY', 'Deliberately oxidised', 'chocolate', 140),
      ('OTHER', 'TERTIARY', 'Deliberately oxidised', 'coffee', 141),
      ('OTHER', 'TERTIARY', 'Deliberately oxidised', 'toffee', 142),
      ('OTHER', 'TERTIARY', 'Deliberately oxidised', 'caramel', 143);
  end if;
end $$;

do $$
declare
  v_total int; v_p int; v_s int; v_t int; v_g int;
begin
  select count(*) into v_total from wset_aroma_terms;
  if v_total <> 143 then
    raise exception 'final-state: expected 143 aroma terms, found %', v_total;
  end if;
  select
    count(*) filter (where origin = 'PRIMARY'),
    count(*) filter (where origin = 'SECONDARY'),
    count(*) filter (where origin = 'TERTIARY')
  into v_p, v_s, v_t from wset_aroma_terms;
  if v_p <> 68 or v_s <> 25 or v_t <> 50 then
    raise exception 'final-state: origin split %/%/% (expected 68/25/50)', v_p, v_s, v_t;
  end if;
  select count(distinct group_name) into v_g from wset_aroma_terms;
  if v_g <> 18 then
    raise exception 'final-state: expected 18 groups, found %', v_g;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'wset_note_aromas_term_fk'
      and conrelid = 'public.wset_note_aromas'::regclass
  ) then
    raise exception 'final-state: wset_note_aromas_term_fk missing';
  end if;
end $$;
