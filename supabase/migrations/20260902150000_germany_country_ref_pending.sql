-- Correction to 20260902130000.
--
-- That migration set countries('Germany').map_status = 'VERIFIED' with
-- map_match_method = 'MIGRATED_EXACT'. That was wrong: map_status on the
-- countries REFERENCE table records that a human reviewed the reference-row ->
-- wine_place match, which is why Italy and Spain are still PENDING even though
-- both are fully mapped. Only France has been through that review.
--
-- Claiming VERIFIED asserted a review that never happened (and broke the
-- "only exact current Bordeaux references are verified" foundation test, which
-- exists precisely to catch this).
--
-- The link cannot simply be kept while downgrading the status: the
-- countries_map_link_state_check constraint couples them — VERIFIED/SYNTHETIC/
-- DUPLICATE require a wine_place_id, anything else requires NULL. So Germany
-- reverts to exactly the state Italy and Spain are in: unlinked and PENDING,
-- awaiting the same reference-match review France went through.

begin;

update countries
   set map_status = 'PENDING',
       map_match_method = null,
       wine_place_id = null
 where name = 'Germany';

do $$
declare v_verified int; v_de int;
begin
  select count(*) into v_verified from countries where map_status = 'VERIFIED';
  if v_verified <> 1 then
    raise exception 'expected exactly 1 VERIFIED country reference (France), got %', v_verified;
  end if;

  select count(*) into v_de from countries
   where name = 'Germany' and map_status = 'PENDING' and wine_place_id is null;
  if v_de <> 1 then raise exception 'germany country reference not reverted to PENDING/unlinked'; end if;
end $$;

commit;
