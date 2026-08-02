-- Use the French "AOC" naming for French appellations instead of the EU "AOP"
-- (owner preference: AOC for France, DOC for Italy, DO for Spain, …). Renames
-- the trailing " AOP" -> " AOC" for every appellation whose region sits in
-- France. If a same-region "… AOC" already exists (a genuine duplicate), the
-- "AOP" row is merged into it — references repointed (user triggers suspended
-- per table for the pure id rewrite, as in 20260829256000) then the AOP row
-- deleted — so no unique-name collision is created. Idempotent.

do $$
declare
  rec record;
  v_target text;
  v_existing uuid;
  fk record;
begin
  for rec in
    select a.id, a.name, a.region_id
    from appellations a
    join regions r on r.id = a.region_id
    join countries c on c.id = r.country_id
    where c.name = 'France'
      and a.name like '% AOP'
  loop
    v_target := regexp_replace(rec.name, ' AOP$', ' AOC');

    -- A real duplicate only if the "… AOC" spelling already exists in the
    -- SAME region (generic names like "Muscat" can legitimately repeat across
    -- regions, so a global name match would over-merge).
    select id into v_existing
      from appellations
      where name = v_target
        and id <> rec.id
        and region_id is not distinct from rec.region_id
      order by id
      limit 1;

    if v_existing is not null then
      for fk in
        select con.conrelid::regclass::text as tbl, att.attname as col
        from pg_constraint con
        join pg_attribute att
          on att.attrelid = con.conrelid and att.attnum = con.conkey[1]
        where con.contype = 'f'
          and con.confrelid = 'appellations'::regclass
          and array_length(con.conkey, 1) = 1
      loop
        execute format('alter table %s disable trigger user', fk.tbl);
        execute format('update %s set %I = $1 where %I = $2', fk.tbl, fk.col, fk.col)
          using v_existing, rec.id;
        execute format('alter table %s enable trigger user', fk.tbl);
      end loop;
      delete from appellations where id = rec.id;
    else
      update appellations set name = v_target where id = rec.id;
    end if;
  end loop;
end $$;
