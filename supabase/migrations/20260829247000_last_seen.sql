-- Last seen: a nullable timestamp bumped (throttled) on authenticated
-- navigation, surfaced in Community as "Active Nd ago" + a status dot. Readable
-- because profiles are already public-read; only self can write it (the existing
-- profiles self-update policy covers the throttled touch).
alter table profiles add column if not exists last_seen_at timestamptz;

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'last_seen_at'
  ) then
    raise exception 'final-state: profiles.last_seen_at missing';
  end if;
end $$;
