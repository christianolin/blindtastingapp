-- Group Taste & Rate: a third reveal mode where nothing is ever hidden.
-- Wines are visible from the start, every participant's score is shared, and
-- the tasting ranks wines by average score. Reuses the whole existing tasting
-- chassis: LIVE/ASYNC timing (ASYNC = can run for days), HOST_PROVIDES or
-- PARTICIPANT_CONTRIBUTED wines, and the invite flow (participants may join
-- after wines exist — nobody has guesses to protect in an OPEN tasting).
--
-- Enum-only first step; the launcher, tasting page and ranking UI consume it
-- in the follow-up commits. Solo Taste & Rate is untouched.
alter type reveal_mode_type add value if not exists 'OPEN';

do $$
begin
  if not exists (
    select 1 from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    where t.typname = 'reveal_mode_type' and e.enumlabel = 'OPEN'
  ) then
    raise exception 'final-state: reveal_mode_type is missing OPEN';
  end if;
end $$;
