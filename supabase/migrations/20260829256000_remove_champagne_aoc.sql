-- Remove the duplicate "Champagne AOC" appellation. Every French appellation in
-- the catalog uses the modern "AOP" naming; "Champagne AOC" was a stray from the
-- early reference seed (20260710141617_expand_reference_data.sql). Repoint any
-- rows that reference it onto "Champagne AOP" — swept dynamically across every
-- foreign key on appellations so no referencing table is missed — then delete
-- it. Idempotent: a no-op once the row is gone.

do $$
declare
  v_aoc uuid;
  v_aop uuid;
  fk record;
begin
  select id into v_aoc
    from appellations
    where name = 'Champagne AOC'
    order by id
    limit 1;
  if v_aoc is null then
    raise notice 'Champagne AOC not present; nothing to do';
    return;
  end if;

  select id into v_aop
    from appellations
    where name = 'Champagne AOP'
    order by id
    limit 1;
  if v_aop is null then
    -- Nothing to merge into — rename rather than lose the appellation entirely.
    update appellations set name = 'Champagne AOP' where id = v_aoc;
    raise notice 'No Champagne AOP found; renamed Champagne AOC -> Champagne AOP';
    return;
  end if;

  -- Repoint every single-column FK that references appellations(id) from the
  -- AOC row to the AOP row. User triggers are suspended per table for the
  -- rewrite: some referencing rows are historical guesses/answers whose "no
  -- edits after the wine is revealed" trigger (and the catalog audit trigger)
  -- would otherwise block or mis-fire on what is a pure reference-id merge.
  -- FK integrity is still enforced (only USER triggers are disabled), and the
  -- disable/enable is rolled back with the transaction if anything fails.
  for fk in
    select c.conrelid::regclass::text as tbl, a.attname as col
    from pg_constraint c
    join pg_attribute a
      on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
    where c.contype = 'f'
      and c.confrelid = 'appellations'::regclass
      and array_length(c.conkey, 1) = 1
  loop
    execute format('alter table %s disable trigger user', fk.tbl);
    execute format('update %s set %I = $1 where %I = $2', fk.tbl, fk.col, fk.col)
      using v_aop, v_aoc;
    execute format('alter table %s enable trigger user', fk.tbl);
  end loop;

  delete from appellations where id = v_aoc;
  raise notice 'Removed duplicate Champagne AOC (references repointed to Champagne AOP)';
end $$;
