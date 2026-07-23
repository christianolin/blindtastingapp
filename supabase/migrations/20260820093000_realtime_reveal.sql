-- Progressive reveal realtime: broadcast wines (reveal_step / is_revealed) and
-- guesses changes so the RevealSync client re-fetches on each step. Realtime
-- honours RLS, so only the safe reveal_step counter reaches non-privileged
-- clients. Wrapped so a re-run is a no-op.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'wines')
  then alter publication supabase_realtime add table wines; end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'guesses')
  then alter publication supabase_realtime add table guesses; end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'wines')
     or not exists (select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'guesses')
  then raise exception 'realtime publication membership missing post-migration'; end if;
end $$;
