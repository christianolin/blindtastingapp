-- Retire seven Italian comune-union footprints so they rebuild from lists
-- checked against the national disciplinari.
--
-- The eAmbrosia audit left four open questions. Answering them needed the text
-- eAmbrosia does not carry: its single document is the EU's summary, and the
-- links it gives to the national specification are dead. MASAF publishes every
-- disciplinare in force as three archives, and reading them settled all four --
-- and found a fifth error the EU summary could not have shown.
--
--   Etna             Article 3 names 20 comuni and Paterno is NOT among them.
--                    Ragalna was split off from Paterno in 1985 and took the
--                    Etna-facing territory; the current text lists Ragalna in
--                    its place. Our list carried BOTH, the old membership and
--                    the new. The EU single document still shows the pre-1985
--                    list, which is why the audit could not see this: its
--                    summary is the stale side. 21 -> 20.
--
--   Riviera del      Our 19 comuni were an exact match for the VALTENESI
--   Garda Classico   sub-zone, not the DOC. Article 3 gives the DOC "l'intero
--                    territorio dei seguenti comuni, in provincia di Brescia"
--                    and lists 30, delimiting Valtenesi separately over the 19
--                    we had. The current EU single document (OJ C 2024/1496)
--                    agrees; the one eAmbrosia attaches still describes the
--                    pre-2017 "Riviera del Garda Bresciano". 19 -> 30.
--
--   Copertino        "San Pietro in Lama" was a FALSE INCLUSION: article 3
--                    names it only inside the boundary walk, as part of a ROAD
--                    -- "la strada Monteroni-S. Pietro in Lama-Lequile". This
--                    is the third instance of the failure mode that produced
--                    "Ulea", a river, in the Bullas pliego, and "Martinengo",
--                    a street, in the Moscato di Scanzo zone. 7 -> 6.
--
--   Colline Teramane "Montefino" was a false inclusion; article 3 lists 31
--                    comuni of the province of Teramo without it, as does the
--                    single document republished at OJ C 198, 6.6.2023. 32 -> 31.
--
--   Vermentino di    Viddalba was missing. Article 3 closes "... in Provincia
--   Gallura          di Olbia-Tempio, e Viddalba in Provincia di Sassari".
--                    22 -> 23.
--
-- Two more are retired with no change of membership at all, because the
-- ARTIFACTS were wrong in a way the lists were not. These footprints dropped
-- every interior ring, on the assumption that a comune union has no genuine
-- holes. Four of them do, and each hole is land belonging to a comune that is
-- NOT a member, which the fill was putting inside the zone:
--
--   Vesuvio          0.2 km2, 1.8% of Pomigliano d'Arco, a protrusion that
--                    Sant'Anastasia and its neighbours wrap around.
--   Castel del Monte 2.8 km2, 16.1% of Binetto, enclosed by Bitonto, Palo del
--                    Colle and Toritto. Article 3 takes of Binetto only
--                    "completamente l'isola amministrativa D'Ameli", its
--                    detached exclave -- so the rest of Binetto is correctly
--                    absent from the list and was being filled in anyway.
--
-- Copertino and Colline Teramane have the other two, and there the ring is a
-- WHOLE comune: San Pietro in Lama (8.1 km2) and Montefino (19.2 km2) are each
-- entirely enclosed by members. Removing them from the list alone would have
-- changed nothing on the map -- the dropped ring would have filled them
-- straight back in. Copertino has a second ring besides, 0.4 km2 of Leverano.
--
-- The rebuild keeps rings above 1e-6 square degrees, about a hectare, and drops
-- only the rounding slivers 5dp leaves along a shared border, which are some
-- six orders of magnitude smaller.
--
-- Retires only. The staging adapters skip any place holding a current boundary,
-- so this is what lets them rebuild through the same fail-closed guards. Run,
-- in order, with --stage:
--   stage-sicily-official.mjs, stage-lombardia-official.mjs,
--   stage-wave5-region.mjs --region=abruzzo|puglia|campania,
--   stage-wave6-region.mjs --region=sardegna
-- then the promotion migration that follows this one.

begin;

update wine_place_boundaries b
set is_current = false
from wine_places p
where p.id = b.wine_place_id
  and p.canonical_key in (
    'italy.sicilia.etna',
    'italy.lombardia.riviera-del-garda-classico',
    'italy.puglia.copertino',
    'italy.puglia.castel-del-monte',
    'italy.abruzzo.montepulciano-d-abruzzo-colline-teramane',
    'italy.sardegna.vermentino-di-gallura',
    'italy.campania.vesuvio'
  )
  and b.is_current;

do $$
declare n int;
begin
  select count(*) into n
    from wine_place_boundaries b
    join wine_places p on p.id = b.wine_place_id
   where p.canonical_key in (
     'italy.sicilia.etna',
     'italy.lombardia.riviera-del-garda-classico',
     'italy.puglia.copertino',
     'italy.puglia.castel-del-monte',
     'italy.abruzzo.montepulciano-d-abruzzo-colline-teramane',
     'italy.sardegna.vermentino-di-gallura',
     'italy.campania.vesuvio')
     and b.is_current;
  if n <> 0 then
    raise exception 'expected 0 current boundaries for the seven retired footprints, got %', n;
  end if;
end $$;

commit;
