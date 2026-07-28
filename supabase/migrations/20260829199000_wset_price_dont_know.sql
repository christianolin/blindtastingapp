-- Add a "don't know" option to price category, distinct from "not yet answered"
-- (which stays null). Keeping it structured lets stats / the training room tell
-- an explicit "unsure" apart from an untouched field.
--
-- Idempotent: ADD VALUE IF NOT EXISTS; final-state block asserts the label
-- exists. (PG15 permits ADD VALUE inside a transaction; we only read pg_enum
-- here, never use the new value in-transaction.)

alter type wset_price_category add value if not exists 'DONT_KNOW';

do $$
begin
  if not exists (
    select 1
    from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    where t.typname = 'wset_price_category'
      and e.enumlabel = 'DONT_KNOW'
  ) then
    raise exception 'final-state: wset_price_category missing DONT_KNOW';
  end if;
end $$;
