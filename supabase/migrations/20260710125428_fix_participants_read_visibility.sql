-- Any participant of a tasting (not just the host) should see the full guest
-- list, not only their own row — that's just the social roster of who's in
-- the tasting, not a secret. is_tasting_participant(tasting_id) already
-- covers "this is my own row" (my row is what makes me a participant), so
-- the separate `user_id = auth.uid()` clause is redundant once combined.
drop policy "participants read" on tasting_participants;
create policy "participants read" on tasting_participants for select to authenticated using (
  is_tasting_host(tasting_id) or is_tasting_participant(tasting_id)
);
