-- Phase 2B retirement: the tile map is the only map UI and reads the
-- canonical catalog exclusively; wine_map_nodes has no remaining readers.
-- Guards fail closed if the canonical catalog is not fully in place.
do $$
declare
  v_count int;
begin
  select count(*) into v_count
  from wine_places where publication_status = 'VERIFIED';
  if v_count < 14 then
    raise exception 'expected at least 14 verified wine places, got %', v_count;
  end if;

  select count(*) into v_count
  from wine_place_boundaries
  where is_current and quality_status = 'VALIDATED';
  if v_count < 14 then
    raise exception 'expected at least 14 current validated boundaries, got %', v_count;
  end if;

  select count(*) into v_count from wine_map_nodes;
  if v_count <> 14 then
    raise exception 'expected exactly 14 legacy wine map nodes, got %', v_count;
  end if;
end;
$$;

drop table wine_map_nodes;
