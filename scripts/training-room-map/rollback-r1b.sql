-- Undo R1b (supabase/migrations/<version>_training_region_placements.sql):
-- spec docs/superpowers/specs/2026-09-29-training-room-map-design.md §4.5.
-- NEVER under supabase/migrations. Run with scripts/training-room-map/run-sql.mjs,
-- --dry first, then for real, only with the owner's go-ahead. Deletes EXACTLY the
-- 50 (archetype, region) pairs R1b inserted, by literal — never by rule, so a
-- curator's own placements survive. Also removes R1b's schema_migrations row.
-- The app needs no revert for this: the explorer reads placements live.

set local lock_timeout = '5s';

drop table if exists pg_temp._r1b_list;
create temp table _r1b_list (
  archetype_id uuid not null,
  place_key text not null,
  primary key (archetype_id, place_key)
) on commit drop;

insert into _r1b_list (archetype_id, place_key) values
    ('bfa9c61a-aa83-4294-bac3-3320b75db875'::uuid, 'france.beaujolais'), -- A typical Beaujolais cru
    ('feb10b4c-df2b-4516-9085-37398e9f994d'::uuid, 'france.bordeaux'), -- A typical Margaux
    ('d070d08c-0cc8-4d12-8bee-776de0c0e7e2'::uuid, 'france.bordeaux'), -- A typical Sauternes
    ('fa5486e6-2d70-4235-8d0a-631734ba89e4'::uuid, 'france.bordeaux'), -- A typical Pauillac
    ('2f7a4e51-9900-451e-a931-e5440d725a83'::uuid, 'france.bordeaux'), -- A typical Saint-Julien
    ('9bda65b1-cc02-40d8-b1ad-80084ae6aa63'::uuid, 'france.bordeaux'), -- A typical Saint-Estèphe
    ('3f4a3124-f6ad-4bd6-938f-73bf6ea5e949'::uuid, 'france.bordeaux'), -- A typical Pessac-Léognan red
    ('f10ffd0b-a716-40f4-a9f4-c11fbf490f8a'::uuid, 'france.bordeaux'), -- A typical Pessac-Léognan white
    ('9a23b813-7e70-4959-b7bd-9b4ab4498894'::uuid, 'france.bordeaux'), -- A typical Saint-Émilion
    ('86cc1784-23bf-469e-b71c-9fd9dc2ed7dc'::uuid, 'france.bordeaux'), -- A typical Pomerol
    ('df0ee4f7-c7f3-4883-b6cc-9abfde11b5c2'::uuid, 'france.loire'), -- A typical Sancerre
    ('e708bae1-d941-40e8-b888-bb2713d9620c'::uuid, 'france.loire'), -- A typical Pouilly-Fumé
    ('2deafac2-c5e1-429c-903b-0b37ddd4c9b4'::uuid, 'france.loire'), -- A typical Vouvray
    ('d67a15ff-a0c9-44a1-90b2-75b83e8bf179'::uuid, 'france.loire'), -- A typical Muscadet
    ('015e0941-50a1-4d9f-bf07-a65e70a90d83'::uuid, 'france.loire'), -- A typical Chinon
    ('6c3ae593-74d8-44ee-9abb-86e093bcc865'::uuid, 'france.provence'), -- A typical Bandol
    ('9e9984e6-65dd-4b62-8c26-7a106ec2eec6'::uuid, 'france.provence'), -- A typical Provence rosé
    ('a89863b4-c56c-4a58-94fd-c9e06ff3f6ba'::uuid, 'france.rhone'), -- A typical Châteauneuf-du-Pape
    ('57f5ce3b-5e1c-45f0-b82d-a7284a5f5e26'::uuid, 'france.rhone'), -- A typical Côte-Rôtie
    ('1e7997df-a99a-4745-8ab8-df762866d2bf'::uuid, 'france.rhone'), -- A typical Condrieu
    ('50773b81-cc55-4ec2-9c92-b46908a7be2e'::uuid, 'france.rhone'), -- A typical Hermitage
    ('3ea58a94-99ee-4fec-beba-308b01fd3642'::uuid, 'france.rhone'), -- A typical Crozes-Hermitage
    ('d3ffdbcb-84aa-4505-8329-7d624a783bdc'::uuid, 'france.rhone'), -- A typical Gigondas
    ('4620727a-0ad2-411d-826e-6831a079fea7'::uuid, 'france.rhone'), -- A typical Côtes du Rhône
    ('3758fca9-b5d9-470e-91d0-1cea3d91fef3'::uuid, 'france.sud-ouest'), -- A typical Cahors
    ('fcf7911c-119e-41b3-a769-edccd352d205'::uuid, 'italy.abruzzo'), -- A typical Montepulciano d'Abruzzo
    ('fa07e2eb-423b-499d-a517-ee524b97594a'::uuid, 'italy.campania'), -- A typical Taurasi
    ('dc4e44ca-b30a-4ff4-b8e4-d5aef291f793'::uuid, 'italy.lombardia'), -- A typical Franciacorta
    ('adc30ad9-017e-4c6e-9984-923bb8388035'::uuid, 'italy.piemonte'), -- A typical Barolo
    ('0e3e1b61-2fcb-43a3-be2d-48061ebc7340'::uuid, 'italy.piemonte'), -- A typical Barbaresco
    ('0c99c524-4f62-4e07-888f-1618e64ea10d'::uuid, 'italy.piemonte'), -- A typical Barbera d'Asti
    ('54d7adc3-1491-4497-af3d-3e1420e7c037'::uuid, 'italy.piemonte'), -- A typical Gavi
    ('f22f6fed-5048-4e55-81cc-c2c8d6534e10'::uuid, 'italy.puglia'), -- A typical Primitivo
    ('64f7d91b-fe81-4802-b4ee-2e52b310bd98'::uuid, 'italy.sicilia'), -- A typical Etna Rosso
    ('517e05e5-030d-4069-8c34-4051d7881627'::uuid, 'italy.toscana'), -- A typical Chianti Classico
    ('ee53d280-42da-4728-8856-e5d93a5808bb'::uuid, 'italy.toscana'), -- A typical Brunello di Montalcino
    ('3c46122a-5820-416f-b9d5-796e2e8f3fc0'::uuid, 'italy.toscana'), -- A typical Bolgheri
    ('d0db791a-0448-4f14-8e77-93438f404589'::uuid, 'italy.veneto'), -- A typical Amarone
    ('f07b6310-1e4b-4fd2-8a1f-c954db04292a'::uuid, 'italy.veneto'), -- A typical Valpolicella Ripasso
    ('caa2cf27-49fe-4034-849a-398578e4d147'::uuid, 'italy.veneto'), -- A typical Soave
    ('3457ea81-4596-400d-bb72-1357c355d52f'::uuid, 'italy.veneto'), -- A typical Prosecco
    ('ee42c150-5577-4d8b-b57f-c69bd31e3dc8'::uuid, 'portugal.douro'), -- A typical Vintage Port
    ('44c4527b-5c53-4c02-a220-69b8f7c59447'::uuid, 'portugal.douro'), -- A typical Tawny Port
    ('217ed3e1-e9e9-4008-9c79-f750ff173587'::uuid, 'spain.andalucia'), -- A typical Fino
    ('fdd58936-2d0b-4ee2-b4ea-f8ffd09bef05'::uuid, 'spain.andalucia'), -- A typical Oloroso
    ('dfae084d-8f7d-40d6-a053-aa61e31f1034'::uuid, 'spain.castilla-y-leon'), -- A typical Ribera del Duero
    ('3aa90255-1b01-4ec0-b1d3-8dd8e7138e25'::uuid, 'spain.castilla-y-leon'), -- A typical Bierzo
    ('1c42533d-1716-41c0-8983-81d8a1f9eadc'::uuid, 'spain.castilla-y-leon'), -- A typical Rueda Verdejo
    ('ec9865f8-4248-4fb2-b578-ee6e7f1f7610'::uuid, 'spain.cataluna'), -- A typical Priorat
    ('4cba1205-a43c-4b1a-be27-68224c21ed4d'::uuid, 'spain.galicia'); -- A typical Rías Baixas Albariño

do $$
declare
  v_deleted int;
begin
  with gone as (
    delete from public.wine_archetype_placements x
     using _r1b_list l, public.wine_places p
     where p.canonical_key = l.place_key
       and x.archetype_id = l.archetype_id
       and x.wine_place_id = p.id
    returning 1
  )
  select count(*) into v_deleted from gone;
  if v_deleted <> 50 then
    raise exception 'rollback-r1b deleted % placements, expected exactly 50', v_deleted;
  end if;
  raise notice 'rollback-r1b: 50 placements removed; % remain',
    (select count(*) from public.wine_archetype_placements);
end $$;

-- R1b's history row, by name: its version is re-picked at apply time (spec §4).
delete from supabase_migrations.schema_migrations where name = 'training_region_placements';

do $$
begin
  if exists (select 1 from supabase_migrations.schema_migrations where name = 'training_region_placements') then
    raise exception 'R1b''s history row is still recorded';
  end if;
end $$;
