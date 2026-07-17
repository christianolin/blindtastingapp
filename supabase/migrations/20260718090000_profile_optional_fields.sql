-- Optional profile details a user can fill in themselves: where they're
-- from, a phone number, and a favorite wine style. All nullable — nothing
-- here is required or used in scoring, purely profile flavor shown on
-- /u/[id] and /people.
alter table profiles
  add column if not exists location text,
  add column if not exists phone text,
  add column if not exists favorite_wine_type text;
