-- wine_answers/guesses already go public once a wine is_revealed (see the
-- "or w.is_revealed" / "or exists (... w.is_revealed)" clauses in the init
-- migration) — that was already enough to support the results page's
-- per-tasting visibility. But an arbitrary viewer (not host/participant)
-- couldn't reach that data at all, because tastings/tasting_participants/wines
-- themselves were still gated to host-or-participant only. These three
-- policies extend the same "revealed = public" rule up to those tables, so a
-- profile page can show *which* tastings someone attended and *which* wines
-- were poured, once at least one wine in that tasting has been revealed.
-- Wines still hidden in an otherwise-revealed tasting stay hidden (the
-- "wines read"/"wine_answers read" gates are still per-row).
create policy "revealed wines are public" on wines for select to authenticated
  using (is_revealed = true);

create policy "tastings with revealed wines are public" on tastings for select to authenticated
  using (
    exists (select 1 from wines w where w.tasting_id = tastings.id and w.is_revealed = true)
  );

create policy "participants of tastings with revealed wines are public" on tasting_participants for select to authenticated
  using (
    exists (select 1 from wines w where w.tasting_id = tasting_participants.tasting_id and w.is_revealed = true)
  );
