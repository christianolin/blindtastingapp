-- Training room on the wine map, phase R1b (spec
-- docs/superpowers/specs/2026-09-29-training-room-map-design.md §4.2, RM9,
-- RM9a, Appendix A; owner answer O2 = "All 19 regions", 2026-09-29).
-- Region pages list the typical wines beneath them: every placed typical wine
-- whose REGION ancestor is not its home and is not france.bourgogne (which
-- keeps its curated representatives) gains a placement at that REGION, with
-- its own sort_order (the 20260829224000 back-fill's convention).
--
-- A LITERAL list (50 rows over 19 regions), generated once from that rule
-- against live on 2026-09-29, so scripts/training-room-map/rollback-r1b.sql
-- can delete exactly these pairs and never a curator's own row. If the USA
-- wave or a curator has already added one of them, the exact-count assert
-- fails: re-read the list against live, never loosen the assert.
--
-- Writes wine_archetype_placements only: no wine_places or
-- wine_place_boundaries write, no neighbour-cache refresh, no tiles run.
-- No begin/commit: the applier owns the transaction.

set local lock_timeout = '5s';

drop table if exists pg_temp._r1b_list, pg_temp._r1b_before;

create temp table _r1b_list (
  archetype_id uuid not null,
  place_key text not null,
  sort_order int not null,
  primary key (archetype_id, place_key)
) on commit drop;

insert into _r1b_list (archetype_id, place_key, sort_order) values
    ('bfa9c61a-aa83-4294-bac3-3320b75db875'::uuid, 'france.beaujolais', 38), -- A typical Beaujolais cru
    ('feb10b4c-df2b-4516-9085-37398e9f994d'::uuid, 'france.bordeaux', 6), -- A typical Margaux
    ('d070d08c-0cc8-4d12-8bee-776de0c0e7e2'::uuid, 'france.bordeaux', 7), -- A typical Sauternes
    ('fa5486e6-2d70-4235-8d0a-631734ba89e4'::uuid, 'france.bordeaux', 16), -- A typical Pauillac
    ('2f7a4e51-9900-451e-a931-e5440d725a83'::uuid, 'france.bordeaux', 17), -- A typical Saint-Julien
    ('9bda65b1-cc02-40d8-b1ad-80084ae6aa63'::uuid, 'france.bordeaux', 18), -- A typical Saint-Estèphe
    ('3f4a3124-f6ad-4bd6-938f-73bf6ea5e949'::uuid, 'france.bordeaux', 19), -- A typical Pessac-Léognan red
    ('f10ffd0b-a716-40f4-a9f4-c11fbf490f8a'::uuid, 'france.bordeaux', 20), -- A typical Pessac-Léognan white
    ('9a23b813-7e70-4959-b7bd-9b4ab4498894'::uuid, 'france.bordeaux', 21), -- A typical Saint-Émilion
    ('86cc1784-23bf-469e-b71c-9fd9dc2ed7dc'::uuid, 'france.bordeaux', 22), -- A typical Pomerol
    ('df0ee4f7-c7f3-4883-b6cc-9abfde11b5c2'::uuid, 'france.loire', 3), -- A typical Sancerre
    ('e708bae1-d941-40e8-b888-bb2713d9620c'::uuid, 'france.loire', 39), -- A typical Pouilly-Fumé
    ('2deafac2-c5e1-429c-903b-0b37ddd4c9b4'::uuid, 'france.loire', 40), -- A typical Vouvray
    ('d67a15ff-a0c9-44a1-90b2-75b83e8bf179'::uuid, 'france.loire', 41), -- A typical Muscadet
    ('015e0941-50a1-4d9f-bf07-a65e70a90d83'::uuid, 'france.loire', 42), -- A typical Chinon
    ('6c3ae593-74d8-44ee-9abb-86e093bcc865'::uuid, 'france.provence', 10), -- A typical Bandol
    ('9e9984e6-65dd-4b62-8c26-7a106ec2eec6'::uuid, 'france.provence', 50), -- A typical Provence rosé
    ('a89863b4-c56c-4a58-94fd-c9e06ff3f6ba'::uuid, 'france.rhone', 4), -- A typical Châteauneuf-du-Pape
    ('57f5ce3b-5e1c-45f0-b82d-a7284a5f5e26'::uuid, 'france.rhone', 5), -- A typical Côte-Rôtie
    ('1e7997df-a99a-4745-8ab8-df762866d2bf'::uuid, 'france.rhone', 43), -- A typical Condrieu
    ('50773b81-cc55-4ec2-9c92-b46908a7be2e'::uuid, 'france.rhone', 44), -- A typical Hermitage
    ('3ea58a94-99ee-4fec-beba-308b01fd3642'::uuid, 'france.rhone', 45), -- A typical Crozes-Hermitage
    ('d3ffdbcb-84aa-4505-8329-7d624a783bdc'::uuid, 'france.rhone', 46), -- A typical Gigondas
    ('4620727a-0ad2-411d-826e-6831a079fea7'::uuid, 'france.rhone', 47), -- A typical Côtes du Rhône
    ('3758fca9-b5d9-470e-91d0-1cea3d91fef3'::uuid, 'france.sud-ouest', 51), -- A typical Cahors
    ('fcf7911c-119e-41b3-a769-edccd352d205'::uuid, 'italy.abruzzo', 64), -- A typical Montepulciano d'Abruzzo
    ('fa07e2eb-423b-499d-a517-ee524b97594a'::uuid, 'italy.campania', 65), -- A typical Taurasi
    ('dc4e44ca-b30a-4ff4-b8e4-d5aef291f793'::uuid, 'italy.lombardia', 60), -- A typical Franciacorta
    ('adc30ad9-017e-4c6e-9984-923bb8388035'::uuid, 'italy.piemonte', 52), -- A typical Barolo
    ('0e3e1b61-2fcb-43a3-be2d-48061ebc7340'::uuid, 'italy.piemonte', 53), -- A typical Barbaresco
    ('0c99c524-4f62-4e07-888f-1618e64ea10d'::uuid, 'italy.piemonte', 54), -- A typical Barbera d'Asti
    ('54d7adc3-1491-4497-af3d-3e1420e7c037'::uuid, 'italy.piemonte', 55), -- A typical Gavi
    ('f22f6fed-5048-4e55-81cc-c2c8d6534e10'::uuid, 'italy.puglia', 67), -- A typical Primitivo
    ('64f7d91b-fe81-4802-b4ee-2e52b310bd98'::uuid, 'italy.sicilia', 66), -- A typical Etna Rosso
    ('517e05e5-030d-4069-8c34-4051d7881627'::uuid, 'italy.toscana', 61), -- A typical Chianti Classico
    ('ee53d280-42da-4728-8856-e5d93a5808bb'::uuid, 'italy.toscana', 62), -- A typical Brunello di Montalcino
    ('3c46122a-5820-416f-b9d5-796e2e8f3fc0'::uuid, 'italy.toscana', 63), -- A typical Bolgheri
    ('d0db791a-0448-4f14-8e77-93438f404589'::uuid, 'italy.veneto', 56), -- A typical Amarone
    ('f07b6310-1e4b-4fd2-8a1f-c954db04292a'::uuid, 'italy.veneto', 57), -- A typical Valpolicella Ripasso
    ('caa2cf27-49fe-4034-849a-398578e4d147'::uuid, 'italy.veneto', 58), -- A typical Soave
    ('3457ea81-4596-400d-bb72-1357c355d52f'::uuid, 'italy.veneto', 59), -- A typical Prosecco
    ('ee42c150-5577-4d8b-b57f-c69bd31e3dc8'::uuid, 'portugal.douro', 79), -- A typical Vintage Port
    ('44c4527b-5c53-4c02-a220-69b8f7c59447'::uuid, 'portugal.douro', 80), -- A typical Tawny Port
    ('217ed3e1-e9e9-4008-9c79-f750ff173587'::uuid, 'spain.andalucia', 75), -- A typical Fino
    ('fdd58936-2d0b-4ee2-b4ea-f8ffd09bef05'::uuid, 'spain.andalucia', 77), -- A typical Oloroso
    ('dfae084d-8f7d-40d6-a053-aa61e31f1034'::uuid, 'spain.castilla-y-leon', 70), -- A typical Ribera del Duero
    ('3aa90255-1b01-4ec0-b1d3-8dd8e7138e25'::uuid, 'spain.castilla-y-leon', 72), -- A typical Bierzo
    ('1c42533d-1716-41c0-8983-81d8a1f9eadc'::uuid, 'spain.castilla-y-leon', 74), -- A typical Rueda Verdejo
    ('ec9865f8-4248-4fb2-b578-ee6e7f1f7610'::uuid, 'spain.cataluna', 71), -- A typical Priorat
    ('4cba1205-a43c-4b1a-be27-68224c21ed4d'::uuid, 'spain.galicia', 73); -- A typical Rías Baixas Albariño

create temp table _r1b_before on commit drop as
select (select count(*) from public.wine_archetype_placements)::int as total;

-- Pre-state: every triple resolves, its place is the archetype's REGION
-- ancestor (the same walk as training_archetype_places), and it is not
-- placed there yet.
do $$
declare
  v_text text;
begin
  if (select count(*) from _r1b_list) <> 50 then
    raise exception 'R1b list has % rows, expected 50', (select count(*) from _r1b_list);
  end if;
  with recursive chain as (
    select a.id as archetype_id, p.id as place_id, p.canonical_key, p.kind, p.primary_parent_id, 0 as depth
      from public.wine_archetypes a join public.wine_places p on p.id = a.wine_place_id
    union all
    select c.archetype_id, p.id, p.canonical_key, p.kind, p.primary_parent_id, c.depth + 1
      from chain c join public.wine_places p on p.id = c.primary_parent_id where c.depth < 8
  ),
  reg as (
    select distinct on (archetype_id) archetype_id, canonical_key, depth
      from chain where kind = 'REGION' order by archetype_id, depth
  )
  select string_agg(format('%s -> %s', l.archetype_id, l.place_key), '; ') into v_text
    from _r1b_list l
    left join public.wine_archetypes a on a.id = l.archetype_id
    left join public.wine_places p on p.canonical_key = l.place_key
    left join reg r on r.archetype_id = l.archetype_id
   where a.id is null or p.id is null
      or r.canonical_key is distinct from l.place_key or r.depth = 0
      or a.sort_order <> l.sort_order;
  if v_text is not null then
    raise exception 'R1b triples that do not resolve to the archetype''s REGION ancestor: %', v_text;
  end if;
end $$;

insert into public.wine_archetype_placements (archetype_id, wine_place_id, sort_order)
select l.archetype_id, p.id, l.sort_order
  from _r1b_list l
  join public.wine_places p on p.canonical_key = l.place_key
on conflict (archetype_id, wine_place_id) do nothing;

-- Post-state, same transaction.
do $$
declare
  v_before int := (select total from _r1b_before);
  v_after int := (select count(*) from public.wine_archetype_placements);
  v_text text;
begin
  if v_after <> v_before + 50 then
    raise exception 'R1b inserted % placements, expected exactly 50 (was one already there?)', v_after - v_before;
  end if;

  -- Page totals (spec RM9): every listed region, and Bourgogne unchanged.
  select string_agg(format('%s %s (expected %s)', e.key, coalesce(x.n, 0), e.n), '; ') into v_text
    from (values
      ('france.bordeaux', 9), ('france.rhone', 7), ('france.loire', 5), ('italy.piemonte', 4),
      ('italy.veneto', 4), ('italy.toscana', 3), ('spain.castilla-y-leon', 3), ('spain.andalucia', 3),
      ('france.provence', 2), ('portugal.douro', 2), ('spain.cataluna', 2), ('france.beaujolais', 1),
      ('france.sud-ouest', 1), ('italy.abruzzo', 1), ('italy.campania', 1), ('italy.lombardia', 1),
      ('italy.puglia', 1), ('italy.sicilia', 1), ('spain.galicia', 1), ('france.bourgogne', 7)
    ) e(key, n)
    left join (
      select p.canonical_key, count(*)::int as n
        from public.wine_archetype_placements x join public.wine_places p on p.id = x.wine_place_id
       group by p.canonical_key
    ) x on x.canonical_key = e.key
   where coalesce(x.n, 0) <> e.n;
  if v_text is not null then
    raise exception 'R1b page totals are off: %', v_text;
  end if;

  -- RM9a, in-transaction: no placed archetype outside france.bourgogne lacks a
  -- placement at its REGION ancestor.
  with recursive chain as (
    select a.id as archetype_id, p.id as place_id, p.canonical_key, p.kind, p.primary_parent_id, 0 as depth
      from public.wine_archetypes a join public.wine_places p on p.id = a.wine_place_id
    union all
    select c.archetype_id, p.id, p.canonical_key, p.kind, p.primary_parent_id, c.depth + 1
      from chain c join public.wine_places p on p.id = c.primary_parent_id where c.depth < 8
  ),
  reg as (
    select distinct on (archetype_id) archetype_id, place_id, canonical_key
      from chain where kind = 'REGION' order by archetype_id, depth
  )
  select string_agg(format('%s (%s)', a.name, r.canonical_key), '; ') into v_text
    from reg r join public.wine_archetypes a on a.id = r.archetype_id
   where r.canonical_key <> 'france.bourgogne'
     and not exists (select 1 from public.wine_archetype_placements x
                      where x.archetype_id = r.archetype_id and x.wine_place_id = r.place_id);
  if v_text is not null then
    raise exception 'R1b: placed archetypes without a placement at their REGION ancestor: %', v_text;
  end if;
  raise notice 'R1b: % placements (was %)', v_after, v_before;
end $$;
