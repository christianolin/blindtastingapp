-- Progressive reveal: per-category reveal progression + a leaderboard-timing
-- toggle. reveal_step counts revealed in-play steps; is_revealed keeps its
-- meaning ("fully revealed"). All additive; no scoring value or reference id
-- changes.
create type wine_leaderboard_reveal as enum ('PER_ATTRIBUTE', 'PER_WINE');

alter table wines
  add column if not exists reveal_step smallint not null default 0;
alter table guesses
  add column if not exists reveal_step smallint not null default 0;
alter table tastings
  add column if not exists leaderboard_reveal wine_leaderboard_reveal
    not null default 'PER_ATTRIBUTE';

-- Same-transaction assertions (never trust "version recorded").
do $$
begin
  if not exists (select 1 from information_schema.columns
    where table_name = 'wines' and column_name = 'reveal_step') then
    raise exception 'wines.reveal_step missing post-migration';
  end if;
  if not exists (select 1 from information_schema.columns
    where table_name = 'guesses' and column_name = 'reveal_step') then
    raise exception 'guesses.reveal_step missing post-migration';
  end if;
  if not exists (select 1 from information_schema.columns
    where table_name = 'tastings' and column_name = 'leaderboard_reveal') then
    raise exception 'tastings.leaderboard_reveal missing post-migration';
  end if;
end $$;
