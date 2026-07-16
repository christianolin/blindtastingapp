-- Lets every participant (not just the host) see WHO has submitted a guess for
-- each wine — so the host knows when everyone's ready to reveal, and everyone
-- can see who's still thinking. The guesses RLS hides other people's guess
-- *content* until reveal; this exposes only the (wine, participant) pairs that
-- a guess exists for, gated to the tasting's host/participants via the
-- existing SECURITY DEFINER helpers (no recursion).
create or replace function public.tasting_guess_status(p_tasting_id uuid)
returns table (wine_id uuid, participant_id uuid)
language sql
stable
security definer
set search_path = public
as $func$
  select g.wine_id, g.participant_id
  from guesses g
  join wines w on w.id = g.wine_id
  where w.tasting_id = p_tasting_id
    and (is_tasting_host(p_tasting_id) or is_tasting_participant(p_tasting_id))
$func$;

grant execute on function public.tasting_guess_status(uuid) to authenticated;
