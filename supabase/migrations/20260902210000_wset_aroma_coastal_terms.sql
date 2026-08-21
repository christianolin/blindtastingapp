-- Aroma lexicon upkeep, driven by use of the sheet:
--   - "pear drop" leaves. It is an acetate/amyl-acetate fault-adjacent note that
--     duplicates what "candy" already covers, and no saved note referenced it.
--   - "minerality" and "saltiness" join the PRIMARY "Other" cluster, next to wet
--     stones and flint. Coastal whites (Albarino, Muscadet, Assyrtiko, Chablis)
--     are described with these two constantly and the WSET lexicon omits both.
-- Placed at 67/68 so the mineral notes stay adjacent; everything from the old 67
-- up shifts by two. Guarded on 'minerality': re-apply is a no-op.

do $$
begin
  if not exists (select 1 from wset_aroma_terms where term = 'minerality') then
    -- Any note that had selected pear drop must let go of it first (the FK from
    -- wset_note_aromas). At time of writing that is zero rows.
    delete from wset_note_aromas
    where term_id in (select id from wset_aroma_terms where term = 'pear drop');
    delete from wset_aroma_terms where term = 'pear drop';

    update wset_aroma_terms set sort_order = sort_order + 2 where sort_order >= 67;

    insert into wset_aroma_terms (family, origin, group_name, term, sort_order) values
      ('OTHER', 'PRIMARY', 'Other', 'minerality', 67),
      ('OTHER', 'PRIMARY', 'Other', 'saltiness', 68);
  end if;
end $$;

-- Final-state asserts.
do $$
declare
  v_total int; v_p int; v_s int; v_t int; v_g int; v_other text[];
begin
  select count(*) into v_total from wset_aroma_terms;
  if v_total <> 144 then
    raise exception 'final-state: expected 144 aroma terms, found %', v_total;
  end if;

  if exists (select 1 from wset_aroma_terms where term = 'pear drop') then
    raise exception 'final-state: "pear drop" still present';
  end if;

  select
    count(*) filter (where origin = 'PRIMARY'),
    count(*) filter (where origin = 'SECONDARY'),
    count(*) filter (where origin = 'TERTIARY')
  into v_p, v_s, v_t from wset_aroma_terms;
  if v_p <> 69 or v_s <> 25 or v_t <> 50 then
    raise exception 'final-state: origin split %/%/% (expected 69/25/50)', v_p, v_s, v_t;
  end if;

  select count(distinct group_name) into v_g from wset_aroma_terms;
  if v_g <> 18 then
    raise exception 'final-state: expected 18 groups, found %', v_g;
  end if;

  -- The new pair must sit inside the mineral run of the Other cluster.
  select array_agg(term order by sort_order) into v_other
  from wset_aroma_terms where origin = 'PRIMARY' and group_name = 'Other';
  if v_other <> array['simple', 'wet stones', 'flint', 'minerality', 'saltiness', 'candy', 'wet wool'] then
    raise exception 'final-state: Other cluster is %', v_other;
  end if;
end $$;
