-- L4 alignment: reconcile four aroma origins with the official WSET Level 4
-- Wine-Lexicon, which classes these differently than 20260829198000's first
-- pass:
--   cinnamon  SECONDARY -> PRIMARY   (L4 lists it under primary Spice)
--   ginger    SECONDARY -> TERTIARY  (L4 white-wine maturation)
--   nutmeg    SECONDARY -> TERTIARY  (L4 white-wine maturation)
--   caramel   SECONDARY -> TERTIARY  (L4 maturation, all wine types)
-- New split: PRIMARY 46 / SECONDARY 17 / TERTIARY 26.
--
-- Idempotent: guarded UPDATE (only touches rows whose origin differs);
-- final-state block asserts the new counts.

update wset_aroma_terms t set origin = m.origin::wset_aroma_origin
from (values
  ('cinnamon', 'PRIMARY'),
  ('ginger', 'TERTIARY'),
  ('nutmeg', 'TERTIARY'),
  ('caramel', 'TERTIARY')
) as m(term, origin)
where t.term = m.term
  and t.origin is distinct from m.origin::wset_aroma_origin;

do $$
declare
  v_primary int;
  v_secondary int;
  v_tertiary int;
begin
  select
    count(*) filter (where origin = 'PRIMARY'),
    count(*) filter (where origin = 'SECONDARY'),
    count(*) filter (where origin = 'TERTIARY')
  into v_primary, v_secondary, v_tertiary
  from wset_aroma_terms;
  if v_primary <> 46 or v_secondary <> 17 or v_tertiary <> 26 then
    raise exception
      'final-state: origin counts PRIMARY=% SECONDARY=% TERTIARY=% (expected 46/17/26)',
      v_primary, v_secondary, v_tertiary;
  end if;
end $$;
