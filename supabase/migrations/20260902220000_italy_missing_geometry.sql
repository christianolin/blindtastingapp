-- Italian appellations that rendered as nothing: 3 Alba varietal DOCs that were
-- catalogued without their (existing, official) footprints, and 13 type
-- appellations that legally share their parent's production zone.
--
-- Selecting Brunello di Montalcino gave no outline, no camera fly and no
-- highlight, because it carried no geometry — the same complaint raised about
-- clicking places on the map generally.

begin;

-- 1. The three Alba varietal DOCs. Each is its own delimited zone in the
--    Regione Piemonte layer (staged from the committed artifact).
do $$
declare r record; n int;
  alba text[] := array[
    'italy.piemonte.barbera-dalba',
    'italy.piemonte.dolcetto-dalba',
    'italy.piemonte.nebbiolo-dalba'
  ];
begin
  select count(*) into n from wine_place_boundaries b
    join wine_places p on p.id = b.wine_place_id
   where p.canonical_key = any(alba) and b.quality_status = 'DRAFT';
  if n <> 3 then raise exception 'expected 3 DRAFT Alba boundaries, got %', n; end if;

  n := 0;
  for r in
    select b.id, p.canonical_key ck, b.bbox from wine_place_boundaries b
      join wine_places p on p.id = b.wine_place_id
     where p.canonical_key = any(alba) and b.quality_status = 'DRAFT'
  loop
    if r.bbox[1] < 6.5 or r.bbox[2] < 44.0 or r.bbox[3] > 9.3 or r.bbox[4] > 46.6 then
      raise exception 'Alba boundary % bbox %,%,%,% escapes the Piemonte window',
        r.ck, r.bbox[1], r.bbox[2], r.bbox[3], r.bbox[4];
    end if;
    update wine_place_boundaries
       set quality_status = 'VALIDATED', is_current = true, reviewed_at = now()
     where id = r.id;
    n := n + 1;
  end loop;
  if n <> 3 then raise exception 'expected to promote 3 Alba boundaries, got %', n; end if;
end $$;

-- 2. Type appellations sharing their parent's zone. Brunello IS the Montalcino
--    comune zone; Amarone IS the Valpolicella zone. They reuse the parent's
--    snapshot and geometry verbatim rather than inventing a footprint, so the
--    provenance stays the parent's official source.
insert into wine_place_boundaries (
  wine_place_id, source_snapshot_id, boundary_method, quality_status,
  display_geometry, label_point, bbox, source_feature_refs,
  generation_parameters, revision, is_current, reviewed_at
)
select child.id, pb.source_snapshot_id, pb.boundary_method, 'VALIDATED',
       pb.display_geometry, pb.label_point, pb.bbox, pb.source_feature_refs,
       jsonb_build_object(
         'engine', 'shared-zone',
         'shares_zone_with', v.parent,
         'note', 'This denomination is produced in the same delimited zone as its '
              || 'parent; the geometry is the parent''s official footprint, reused '
              || 'verbatim rather than re-derived.'
       ),
       pb.revision, true, now()
  from (values
    ('italy.toscana.brunello-di-montalcino',        'italy.toscana.montalcino'),
    ('italy.toscana.rosso-di-montalcino',           'italy.toscana.montalcino'),
    ('italy.toscana.moscadello-di-montalcino',      'italy.toscana.montalcino'),
    ('italy.toscana.sant-antimo',                   'italy.toscana.montalcino'),
    ('italy.toscana.vino-nobile-di-montepulciano',  'italy.toscana.montepulciano'),
    ('italy.toscana.rosso-di-montepulciano',        'italy.toscana.montepulciano'),
    ('italy.toscana.vin-santo-di-montepulciano',    'italy.toscana.montepulciano'),
    ('italy.veneto.amarone-della-valpolicella',     'italy.veneto.valpolicella'),
    ('italy.veneto.recioto-della-valpolicella',     'italy.veneto.valpolicella'),
    ('italy.veneto.valpolicella-ripasso',           'italy.veneto.valpolicella'),
    ('italy.veneto.soave-superiore',                'italy.veneto.soave'),
    ('italy.veneto.recioto-di-soave',               'italy.veneto.soave'),
    ('italy.veneto.bardolino-superiore',            'italy.veneto.bardolino')
  ) as v(child_key, parent)
  join wine_places child on child.canonical_key = v.child_key
  join wine_places parent on parent.canonical_key = v.parent
  join wine_place_boundaries pb
    on pb.wine_place_id = parent.id and pb.is_current
 where not exists (
   select 1 from wine_place_boundaries existing
    where existing.wine_place_id = child.id and existing.is_current
 );

do $$
declare n int;
  children text[] := array[
    'italy.toscana.brunello-di-montalcino','italy.toscana.rosso-di-montalcino',
    'italy.toscana.moscadello-di-montalcino','italy.toscana.sant-antimo',
    'italy.toscana.vino-nobile-di-montepulciano','italy.toscana.rosso-di-montepulciano',
    'italy.toscana.vin-santo-di-montepulciano','italy.veneto.amarone-della-valpolicella',
    'italy.veneto.recioto-della-valpolicella','italy.veneto.valpolicella-ripasso',
    'italy.veneto.soave-superiore','italy.veneto.recioto-di-soave',
    'italy.veneto.bardolino-superiore'
  ];
  alba text[] := array['italy.piemonte.barbera-dalba','italy.piemonte.dolcetto-dalba','italy.piemonte.nebbiolo-dalba'];
begin
  select count(*) into n from wine_place_boundaries b
    join wine_places p on p.id = b.wine_place_id
   where p.canonical_key = any(children) and b.is_current and b.quality_status = 'VALIDATED';
  if n <> 13 then raise exception 'expected 13 shared-zone boundaries, got %', n; end if;

  select count(*) into n from wine_place_boundaries b
    join wine_places p on p.id = b.wine_place_id
   where p.canonical_key = any(alba) and b.is_current and b.quality_status = 'VALIDATED';
  if n <> 3 then raise exception 'expected 3 current Alba boundaries, got %', n; end if;

  -- Exactly one current boundary per place, parents included.
  select count(*) into n from (
    select b.wine_place_id from wine_place_boundaries b
      join wine_places p on p.id = b.wine_place_id
     where b.is_current and p.canonical_key like 'italy.%'
     group by b.wine_place_id having count(*) > 1
  ) dupes;
  if n <> 0 then raise exception '% Italian places have more than one current boundary', n; end if;
end $$;

commit;
