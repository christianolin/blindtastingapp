-- The previous migration's "tastings"/"tasting_participants" policies raw-
-- subqueried `wines`, and the (never-updated-to-use-helper-functions)
-- "wines read" policy raw-subqueries `tasting_participants` — together that
-- forms the exact "infinite recursion detected in policy" cycle already
-- documented for tastings<->tasting_participants, just one hop further out.
-- Same fix as 20260710120957_fix_rls_recursion.sql: a SECURITY DEFINER
-- helper bypasses RLS internally, breaking the cycle.
create function tasting_has_revealed_wine(p_tasting_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from wines w where w.tasting_id = p_tasting_id and w.is_revealed = true
  );
$$;

grant execute on function tasting_has_revealed_wine(uuid) to authenticated;

drop policy "tastings with revealed wines are public" on tastings;
create policy "tastings with revealed wines are public" on tastings for select to authenticated
  using (tasting_has_revealed_wine(id));

drop policy "participants of tastings with revealed wines are public" on tasting_participants;
create policy "participants of tastings with revealed wines are public" on tasting_participants for select to authenticated
  using (tasting_has_revealed_wine(tasting_id));
