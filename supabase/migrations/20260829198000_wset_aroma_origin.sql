-- Aroma origin: tag each of the 89 WSET lexicon terms with its provenance so
-- the picker can group by how the aroma arises (and the future training room
-- can reason about it):
--   PRIMARY   - grape & fermentation (fruit, floral, herbal, pungent spice, ...)
--   SECONDARY - winemaking (oak / 'sweet' baking spice, autolysis, MLF / dairy)
--   TERTIARY  - ageing (dried & cooked fruit, oxidative nuts, bottle-age
--               animal / mineral / development notes)
-- Single best-fit origin per term for v1. A handful are genuinely dual-origin
-- (dried fruit, oak vs bottle-age, honey, banana) and are placed in their most
-- diagnostic bucket.
--
-- Idempotent: enum guarded by to_regtype; column add is IF NOT EXISTS; the
-- UPDATE only touches rows whose origin differs (no-op on re-apply); final-state
-- block asserts no nulls and the P/S/T split (45 / 21 / 23).

do $$
begin
  if to_regtype('public.wset_aroma_origin') is null then
    create type wset_aroma_origin as enum ('PRIMARY', 'SECONDARY', 'TERTIARY');
  end if;
end $$;

alter table wset_aroma_terms add column if not exists origin wset_aroma_origin;

update wset_aroma_terms t set origin = m.origin::wset_aroma_origin
from (values
  ('grapefruit', 'PRIMARY'),
  ('lemon', 'PRIMARY'),
  ('lime', 'PRIMARY'),
  ('green apple', 'PRIMARY'),
  ('red apple', 'PRIMARY'),
  ('gooseberry', 'PRIMARY'),
  ('pear', 'PRIMARY'),
  ('apricot', 'PRIMARY'),
  ('peach', 'PRIMARY'),
  ('raspberry', 'PRIMARY'),
  ('red cherry', 'PRIMARY'),
  ('plum', 'PRIMARY'),
  ('redcurrant', 'PRIMARY'),
  ('strawberry', 'PRIMARY'),
  ('blackberry', 'PRIMARY'),
  ('black cherry', 'PRIMARY'),
  ('blackcurrant', 'PRIMARY'),
  ('banana', 'PRIMARY'),
  ('kiwi', 'PRIMARY'),
  ('lychee', 'PRIMARY'),
  ('mango', 'PRIMARY'),
  ('melon', 'PRIMARY'),
  ('passion fruit', 'PRIMARY'),
  ('pineapple', 'PRIMARY'),
  ('fig', 'TERTIARY'),
  ('prune', 'TERTIARY'),
  ('raisin', 'TERTIARY'),
  ('sultana', 'TERTIARY'),
  ('elderflower', 'PRIMARY'),
  ('orange blossom', 'PRIMARY'),
  ('perfume', 'PRIMARY'),
  ('rose', 'PRIMARY'),
  ('violet', 'PRIMARY'),
  ('cinnamon', 'SECONDARY'),
  ('cloves', 'SECONDARY'),
  ('ginger', 'SECONDARY'),
  ('nutmeg', 'SECONDARY'),
  ('vanilla', 'SECONDARY'),
  ('black pepper', 'PRIMARY'),
  ('white pepper', 'PRIMARY'),
  ('liquorice', 'PRIMARY'),
  ('juniper', 'PRIMARY'),
  ('asparagus', 'PRIMARY'),
  ('green bell pepper', 'PRIMARY'),
  ('mushroom', 'TERTIARY'),
  ('cabbage', 'TERTIARY'),
  ('tinned vegetables', 'TERTIARY'),
  ('black olive', 'PRIMARY'),
  ('eucalyptus', 'PRIMARY'),
  ('grass', 'PRIMARY'),
  ('hay', 'PRIMARY'),
  ('mint', 'PRIMARY'),
  ('blackcurrant leaf', 'PRIMARY'),
  ('wet leaves', 'TERTIARY'),
  ('almond', 'TERTIARY'),
  ('coconut', 'SECONDARY'),
  ('hazelnut', 'TERTIARY'),
  ('walnut', 'TERTIARY'),
  ('chocolate', 'SECONDARY'),
  ('coffee', 'SECONDARY'),
  ('cedar', 'SECONDARY'),
  ('medicinal', 'SECONDARY'),
  ('resinous', 'SECONDARY'),
  ('smoke', 'SECONDARY'),
  ('tobacco', 'TERTIARY'),
  ('leather', 'TERTIARY'),
  ('wet wool', 'TERTIARY'),
  ('meaty', 'TERTIARY'),
  ('yeast', 'SECONDARY'),
  ('biscuit', 'SECONDARY'),
  ('bread', 'SECONDARY'),
  ('toast', 'SECONDARY'),
  ('butter', 'SECONDARY'),
  ('cheese', 'SECONDARY'),
  ('cream', 'SECONDARY'),
  ('yoghurt', 'SECONDARY'),
  ('earth', 'TERTIARY'),
  ('petrol', 'TERTIARY'),
  ('rubber', 'TERTIARY'),
  ('tar', 'PRIMARY'),
  ('stony / steely', 'PRIMARY'),
  ('caramel', 'SECONDARY'),
  ('candy', 'PRIMARY'),
  ('honey', 'TERTIARY'),
  ('jam', 'PRIMARY'),
  ('marmalade', 'TERTIARY'),
  ('treacle', 'TERTIARY'),
  ('cooked / baked', 'TERTIARY'),
  ('stewed', 'TERTIARY')
) as m(term, origin)
where t.term = m.term
  and t.origin is distinct from m.origin::wset_aroma_origin;

alter table wset_aroma_terms alter column origin set not null;

-- Final-state asserts: every term tagged, P/S/T split = 45 / 21 / 23.
do $$
declare
  v_null int;
  v_primary int;
  v_secondary int;
  v_tertiary int;
begin
  select count(*) into v_null from wset_aroma_terms where origin is null;
  if v_null <> 0 then
    raise exception 'final-state: % aroma terms have null origin', v_null;
  end if;
  select
    count(*) filter (where origin = 'PRIMARY'),
    count(*) filter (where origin = 'SECONDARY'),
    count(*) filter (where origin = 'TERTIARY')
  into v_primary, v_secondary, v_tertiary
  from wset_aroma_terms;
  if v_primary <> 45 or v_secondary <> 21 or v_tertiary <> 23 then
    raise exception
      'final-state: origin counts PRIMARY=% SECONDARY=% TERTIARY=% (expected 45/21/23)',
      v_primary, v_secondary, v_tertiary;
  end if;
end $$;
