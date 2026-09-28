-- Training room: "A typical Châteauneuf-du-Pape" gains its red fruit.
--
-- Owner, 2026-09-28: "I think red fruit is typical for chateauneuf du pape.
-- Raspberry is very common. Fix that" — the room told a taster who named
-- raspberry "Red fruit isn't typical" for Châteauneuf. Its profile (from the
-- training-room back-fill) listed only black fruit, dried herbs, spice, leather
-- and tar; Grenache-led Châteauneuf is classically raspberry, red cherry and
-- strawberry (kirsch-like), as its neighbours Gigondas and Côtes du Rhône
-- already say. Added as typical aromas, not signatures, so a raspberry note
-- does not tip Châteauneuf over Gigondas on its own.
--
-- Written against the live state of 2026-09-28: the archetype holds 12 aroma
-- rows and none in "Red fruit". Data only; the pool is read per request, so the
-- room reflects it at once. No begin/commit: the applier owns the transaction.

set local lock_timeout = '10s';

-- Pre-state.
do $$
declare
  v_arch uuid;
  v_n int;
begin
  select count(*) into v_n from wine_archetypes where name = 'A typical Châteauneuf-du-Pape';
  if v_n <> 1 then
    raise exception 'pre-state: expected one "A typical Châteauneuf-du-Pape", found %', v_n;
  end if;
  select id into v_arch from wine_archetypes where name = 'A typical Châteauneuf-du-Pape';

  select count(*) into v_n
    from wine_archetype_aromas x join wset_aroma_terms t on t.id = x.term_id
   where x.archetype_id = v_arch and t.group_name = 'Red fruit';
  if v_n <> 0 then
    raise exception 'pre-state: Châteauneuf already has % red fruit rows', v_n;
  end if;

  select count(*) into v_n from wine_archetype_aromas where archetype_id = v_arch;
  if v_n <> 12 then
    raise exception 'pre-state: expected 12 aroma rows on Châteauneuf, found %', v_n;
  end if;

  select count(*) into v_n from wset_aroma_terms
   where origin = 'PRIMARY' and group_name = 'Red fruit' and term in ('raspberry', 'red cherry', 'strawberry');
  if v_n <> 3 then
    raise exception 'pre-state: expected the three PRIMARY red fruit terms, found %', v_n;
  end if;
end $$;

insert into wine_archetype_aromas (archetype_id, term_id, kind, signature)
select a.id, t.id, v.kind, false
  from wine_archetypes a
  cross join (values ('raspberry', 'NOSE'), ('raspberry', 'PALATE'),
                     ('red cherry', 'NOSE'), ('red cherry', 'PALATE'),
                     ('strawberry', 'NOSE')) as v(term, kind)
  join wset_aroma_terms t on t.term = v.term and t.origin = 'PRIMARY' and t.group_name = 'Red fruit'
 where a.name = 'A typical Châteauneuf-du-Pape'
on conflict (archetype_id, term_id, kind) do nothing;

-- Post-state.
do $$
declare
  v_arch uuid;
  v_rows text[];
  v_n int;
begin
  select id into v_arch from wine_archetypes where name = 'A typical Châteauneuf-du-Pape';

  select array_agg(t.term || ':' || x.kind || ':' || x.signature::text order by t.term, x.kind) into v_rows
    from wine_archetype_aromas x join wset_aroma_terms t on t.id = x.term_id
   where x.archetype_id = v_arch and t.group_name = 'Red fruit';
  if v_rows is distinct from array[
       'raspberry:NOSE:false', 'raspberry:PALATE:false',
       'red cherry:NOSE:false', 'red cherry:PALATE:false',
       'strawberry:NOSE:false'] then
    raise exception 'post-state: Châteauneuf red fruit rows are %', v_rows;
  end if;

  select count(*) into v_n from wine_archetype_aromas where archetype_id = v_arch;
  if v_n <> 17 then
    raise exception 'post-state: expected 17 aroma rows on Châteauneuf, found %', v_n;
  end if;
end $$;
