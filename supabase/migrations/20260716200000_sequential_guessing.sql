-- Optional "one wine at a time" pacing. When on (blind tastings only), the
-- host sets the serving order and participants can only guess the current
-- wine — the lowest-position wine that hasn't been revealed yet. Revealing the
-- current wine advances everyone to the next. Off by default (free order).
alter table tastings
  add column if not exists sequential_guessing boolean not null default false;
