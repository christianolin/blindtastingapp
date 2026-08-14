-- Veneto round 1 catalog (DRAFT). New REGION with its major zones. The famous
-- variants that share a footprint (Amarone/Recioto/Ripasso in Valpolicella,
-- Soave Superiore/Recioto in Soave, Bardolino Superiore, Cartizze in Conegliano
-- Valdobbiadene) are tree/Details-only. Footprints from the official Regione
-- del Veneto dataset, staged separately.
--
--   italy
--   └─ Veneto (REGION)                                    [ISTAT blob]
--      ├─ Valpolicella (SUBREGION)  [footprint] → Amarone, Recioto, Ripasso
--      ├─ Soave (SUBREGION)         [footprint] → Soave Superiore, Recioto di Soave
--      ├─ Bardolino (SUBREGION)     [footprint] → Bardolino Superiore
--      ├─ Conegliano Valdobbiadene Prosecco (SUBREGION) [footprint] → Cartizze
--      └─ Prosecco, Lugana, Bianco di Custoza, Colli Euganei, Colli Berici,
--         Breganze, Gambellara, Piave, Garda, Lison-Pramaggiore   [footprints]

begin;

-- REGION.
insert into wine_places (slug, canonical_key, name, kind, display_tier, min_zoom, label_min_zoom, is_appellation, appellation_system, appellation_level, publication_status, sort_order, primary_parent_id)
select 'veneto', 'italy.veneto', 'Veneto', 'REGION'::wine_place_kind, 1, 4, 4, false, null, null, 'DRAFT', 40, p.id
  from (select id from wine_places where canonical_key = 'italy') p;

-- SUBREGIONs (footprint zones that head a small family of variants).
insert into wine_places (slug, canonical_key, name, kind, display_tier, min_zoom, label_min_zoom, is_appellation, appellation_system, appellation_level, publication_status, sort_order, primary_parent_id)
select v.slug, v.ckey, v.name, 'SUBREGION'::wine_place_kind, 2, 5, 5, true, v.sys, 'subregional', 'DRAFT', v.so, p.id
  from (values
    ('valpolicella','italy.veneto.valpolicella','Valpolicella','DOC',10),
    ('soave','italy.veneto.soave','Soave','DOC',20),
    ('bardolino','italy.veneto.bardolino','Bardolino','DOC',30),
    ('conegliano-valdobbiadene-prosecco','italy.veneto.conegliano-valdobbiadene-prosecco','Conegliano Valdobbiadene Prosecco','DOCG',40)
  ) as v(slug, ckey, name, sys, so)
  cross join (select id from wine_places where canonical_key = 'italy.veneto') p;

-- Tier-2 appellations under the region.
insert into wine_places (slug, canonical_key, name, kind, display_tier, min_zoom, label_min_zoom, is_appellation, appellation_system, appellation_level, publication_status, sort_order, primary_parent_id)
select v.slug, v.ckey, v.name, 'APPELLATION'::wine_place_kind, 2, 6, 6, true, v.sys, v.lvl, 'DRAFT', v.so, p.id
  from (values
    ('prosecco','italy.veneto.prosecco','Prosecco','DOC','regional',50),
    ('lugana','italy.veneto.lugana','Lugana','DOC','communal',60),
    ('bianco-di-custoza','italy.veneto.bianco-di-custoza','Bianco di Custoza','DOC','communal',70),
    ('colli-euganei','italy.veneto.colli-euganei','Colli Euganei','DOC','subregional',80),
    ('colli-berici','italy.veneto.colli-berici','Colli Berici','DOC','subregional',90),
    ('breganze','italy.veneto.breganze','Breganze','DOC','subregional',100),
    ('gambellara','italy.veneto.gambellara','Gambellara','DOC','communal',110),
    ('piave','italy.veneto.piave','Piave','DOC','regional',120),
    ('garda','italy.veneto.garda','Garda','DOC','regional',130),
    ('lison-pramaggiore','italy.veneto.lison-pramaggiore','Lison-Pramaggiore','DOC','subregional',140)
  ) as v(slug, ckey, name, sys, lvl, so)
  cross join (select id from wine_places where canonical_key = 'italy.veneto') p;

-- Tree-only variants (no footprint).
insert into wine_places (slug, canonical_key, name, kind, display_tier, min_zoom, label_min_zoom, is_appellation, appellation_system, appellation_level, publication_status, sort_order, primary_parent_id)
select v.slug, v.ckey, v.name, 'APPELLATION'::wine_place_kind, 3, 7, 7, true, v.sys, 'communal', 'DRAFT', v.so, wp.id
  from (values
    ('amarone-della-valpolicella','italy.veneto.amarone-della-valpolicella','Amarone della Valpolicella','DOCG','italy.veneto.valpolicella',10),
    ('recioto-della-valpolicella','italy.veneto.recioto-della-valpolicella','Recioto della Valpolicella','DOCG','italy.veneto.valpolicella',20),
    ('valpolicella-ripasso','italy.veneto.valpolicella-ripasso','Valpolicella Ripasso','DOC','italy.veneto.valpolicella',30),
    ('soave-superiore','italy.veneto.soave-superiore','Soave Superiore','DOCG','italy.veneto.soave',10),
    ('recioto-di-soave','italy.veneto.recioto-di-soave','Recioto di Soave','DOCG','italy.veneto.soave',20),
    ('bardolino-superiore','italy.veneto.bardolino-superiore','Bardolino Superiore','DOCG','italy.veneto.bardolino',10),
    ('cartizze','italy.veneto.cartizze','Superiore di Cartizze','DOCG','italy.veneto.conegliano-valdobbiadene-prosecco',10)
  ) as v(slug, ckey, name, sys, parent, so)
  join wine_places wp on wp.canonical_key = v.parent;

do $$
declare n int;
begin
  select count(*) into n from wine_places where canonical_key like 'italy.veneto%' and publication_status = 'DRAFT';
  if n <> 22 then raise exception 'expected 22 new DRAFT Veneto places, got %', n; end if;
end $$;

commit;
