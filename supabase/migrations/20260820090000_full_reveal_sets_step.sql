-- Skip-to-full alignment (guided): whenever a wine's is_revealed flips true —
-- by reveal_wine ("Reveal full answer") or reveal_next_category's final step —
-- force reveal_step up to the in-play count. That way reveal_next_category's
-- `reveal_step < count` guard can never advance again, and get_wine_reveal
-- (which already keys off is_revealed) stays consistent. Self-paced
-- score_own_guess sets the caller's guesses.reveal_step in the self-paced UI
-- work; this trigger only governs the shared wine reveal.
create or replace function wines_full_reveal_step() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.is_revealed and not coalesce(old.is_revealed, false) then
    new.reveal_step := greatest(
      new.reveal_step, coalesce(array_length(in_play_steps(new.id), 1), 0));
  end if;
  return new;
end $$;

drop trigger if exists wines_full_reveal_step on wines;
create trigger wines_full_reveal_step before update on wines
  for each row execute function wines_full_reveal_step();

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'wines_full_reveal_step') then
    raise exception 'wines_full_reveal_step trigger missing post-migration';
  end if;
end $$;
