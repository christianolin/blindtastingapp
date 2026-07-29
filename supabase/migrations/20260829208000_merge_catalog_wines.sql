-- merge_catalog_wines: fold a duplicate (loser) into a canonical (winner).
-- Repoints notes and answer links, then tombstones the loser via merged_into.
-- SECURITY DEFINER because it must repoint rows owned by OTHER users (a curator
-- merging strangers' notes/answers); an explicit guard restricts callers to the
-- loser's creator or a curator. wine_answers snapshot columns are never touched,
-- so past scores are preserved.

create or replace function merge_catalog_wines(p_loser uuid, p_winner uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_loser = p_winner then
    raise exception 'cannot merge a catalog wine into itself';
  end if;
  if not exists (
    select 1 from catalog_wines c
    where c.id = p_loser
      and (
        c.created_by = auth.uid()
        or exists (select 1 from profiles p where p.id = auth.uid() and p.is_curator)
      )
  ) then
    raise exception 'not authorised to merge this catalog wine';
  end if;
  if not exists (select 1 from catalog_wines where id = p_winner and merged_into is null) then
    raise exception 'winner catalog wine not found or already merged';
  end if;

  update wset_notes    set catalog_wine_id = p_winner where catalog_wine_id = p_loser;
  update wine_answers  set catalog_wine_id = p_winner where catalog_wine_id = p_loser;
  update catalog_wines set merged_into = p_winner where id = p_loser;
end $$;

grant execute on function merge_catalog_wines(uuid, uuid) to authenticated;

do $$
begin
  if not exists (select 1 from pg_proc where proname = 'merge_catalog_wines') then
    raise exception 'final-state: merge_catalog_wines missing';
  end if;
end $$;
