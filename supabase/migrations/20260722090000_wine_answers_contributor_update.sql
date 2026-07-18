-- Wines are now editable after being added (while the tasting hasn't
-- started): the host edits the wines they entered, a BYO contributor edits
-- their own bottle. The original update policy was host-only, which would
-- silently no-op a contributor saving changes to their own wine's answer
-- key. Mirror the insert policy's host-or-contributor shape, with a
-- not-revealed guard on the contributor branch (the host could already
-- update revealed rows; contributors should never rewrite an answer people
-- have been scored against). The app additionally gates editing to DRAFT
-- tastings — this policy is the defense-in-depth floor, not the UX rule.
drop policy "wine_answers update host" on wine_answers;
create policy "wine_answers update" on wine_answers for update to authenticated
  using (exists (
    select 1 from wines w
    join tastings t on t.id = w.tasting_id
    left join tasting_participants p on p.id = w.contributor_participant_id
    where w.id = wine_id
      and (t.host_id = auth.uid() or (p.user_id = auth.uid() and not w.is_revealed))
  ))
  with check (exists (
    select 1 from wines w
    join tastings t on t.id = w.tasting_id
    left join tasting_participants p on p.id = w.contributor_participant_id
    where w.id = wine_id
      and (t.host_id = auth.uid() or (p.user_id = auth.uid() and not w.is_revealed))
  ));
