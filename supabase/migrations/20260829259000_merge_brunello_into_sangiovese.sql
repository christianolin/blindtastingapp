-- Merge the stray "Sangiovese Grosso (Brunello)" grape into canonical
-- "Sangiovese". It was created by an early label scan (before scans held
-- unmatched grapes as pending). Brunello / Sangiovese Grosso / Prugnolo Gentile
-- / Morellino are all local names for Sangiovese; the app is canonical-only
-- (one row per variety) so blind-tasting scoring, filters and stats don't
-- fragment across synonyms. Repoint every reference onto the canonical row —
-- swept dynamically across every foreign key on grapes(id) so no table is
-- missed — then delete the variant. Idempotent: a no-op once the row is gone.

do $$
declare
  v_variant uuid;
  v_canon uuid;
  fk record;
begin
  select id into v_variant
    from grapes where name = 'Sangiovese Grosso (Brunello)'
    order by id limit 1;
  if v_variant is null then
    raise notice 'variant grape not present; nothing to do';
    return;
  end if;

  select id into v_canon
    from grapes where name = 'Sangiovese'
    order by id limit 1;
  if v_canon is null then
    -- Nothing to merge into — rename rather than lose the grape entirely.
    update grapes set name = 'Sangiovese' where id = v_variant;
    raise notice 'no canonical Sangiovese; renamed variant -> Sangiovese';
    return;
  end if;

  if v_variant = v_canon then
    raise notice 'variant already canonical; nothing to do';
    return;
  end if;

  -- Grape junctions carry a UNIQUE(parent, grape_id): if a parent already lists
  -- the canonical grape, drop the colliding variant row (canonical wins) so the
  -- repoint below can't trip the unique key. No-op unless a parent references
  -- both grapes.
  delete from catalog_wine_grapes v
    where v.grape_id = v_variant
      and exists (
        select 1 from catalog_wine_grapes k
        where k.catalog_wine_id = v.catalog_wine_id and k.grape_id = v_canon
      );
  delete from wine_place_grapes v
    where v.grape_id = v_variant
      and exists (
        select 1 from wine_place_grapes k
        where k.wine_place_id = v.wine_place_id and k.grape_id = v_canon
      );

  -- Repoint every single-column FK that references grapes(id) from the variant
  -- to the canonical row. User triggers are suspended per table for the rewrite
  -- (guesses/wine_answers carry a "no edits after the wine is revealed" trigger,
  -- and the catalog audit trigger would mis-fire on a pure reference-id merge).
  -- FK integrity is still enforced (only USER triggers are off), and the
  -- disable/enable rolls back with the transaction on any failure.
  for fk in
    select c.conrelid::regclass::text as tbl, a.attname as col
    from pg_constraint c
    join pg_attribute a
      on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
    where c.contype = 'f'
      and c.confrelid = 'grapes'::regclass
      and array_length(c.conkey, 1) = 1
  loop
    execute format('alter table %s disable trigger user', fk.tbl);
    execute format('update %s set %I = $1 where %I = $2', fk.tbl, fk.col, fk.col)
      using v_canon, v_variant;
    execute format('alter table %s enable trigger user', fk.tbl);
  end loop;

  delete from grapes where id = v_variant;
  raise notice 'Merged Sangiovese Grosso (Brunello) into Sangiovese';
end $$;
