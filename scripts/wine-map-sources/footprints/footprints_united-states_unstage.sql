-- Footprint cleanup fp-1, wave united-states: unstage (rollback before the promote; re-appliable).
-- RENDERED by scripts/wine-map-sources/footprint-pass.mjs --render-sql from the
-- approved review file — do not hand-edit. Approval: Owner 2026-10-04: "Yes, go ahead (Recommended)" (ship fp-1 after review); crumb cap 1,000 m² ("Keep parcels over 0.1 ha (Recommended)"); harbours "Keep water out (Recommended)" (Migration W 20261005122000, applied); owner 2026-10-05 chose "Now" for the coastal run; this --wave united-states dry run computed by 064e673 (inline step = the live function, byte-identical).
-- Run with node --env-file=.env.local scripts/usa-map/apply-rollback.mjs <this file> --check, then --dry, then with no flag

do $unstage$
declare
  v_expect jsonb := '[{"place_id":"b0a3fa02-400b-4671-ae24-bc94e7a11bb5","key":"united-states.washington.columbia-valley.the-burn-of-columbia-valley","current_boundary_id":"32276060-820d-4b54-b3b5-3e1e5d9047b0","current_sha":"21dd143b460bf36da419e7c753f303d0975aef5ae777ef7a5b6cca8080511181","output_sha":"986c12d613a4ecd2f794726c8727b9b71735fc1a1a55dea67980228c4ef589b1"},{"place_id":"b3937ae8-cba7-4254-8679-e19509775223","key":"united-states.california.north-coast.mendocino-ridge","current_boundary_id":"3f6b055e-b84b-49a7-8b61-2a07db5512d7","current_sha":"b91c8cd49829c5679118935f9adee9ca23e8e6ca2b7a2a59ce286c5b5bf9bf90","output_sha":"89be9f60d7393fbfbd12a01928076fe56a2b095a37dd6d03e2315a0720c258cb"},{"place_id":"8ed32720-da0d-4fb4-a78f-5ab5e72a5dbe","key":"united-states.california.south-coast.san-luis-rey","current_boundary_id":"87f6b887-a012-4f45-9e80-94b3c194b665","current_sha":"24b66a320dcbc977d87a56fac098a353f44ad07bf7d91563815635dddb3ab53b","output_sha":"f7bbacedeebd6e7deb3aa656c21e20025f1334b4c853760c5bb7ef6d3946fe9f"},{"place_id":"9565c840-3cac-4291-92ee-61413f4dcd71","key":"united-states.washington.columbia-valley.walla-walla-valley","current_boundary_id":"083f2cd0-1889-4cd2-8b0e-bfaa74034f7f","current_sha":"09f91ffa5548a7b451095e6f74277589b60e8d1db4fa6b129d80fc8580fbba45","output_sha":"be2a0323abe2c11516aff5bbf540cb0d4577ad9bcf69f3fcb1f9bb0f38fb4b6d"}]'::jsonb;
  v_bad int;
begin
  select count(*) into v_bad
    from jsonb_to_recordset(v_expect) e(place_id uuid)
    join public.wine_place_boundaries b on b.wine_place_id = e.place_id and b.revision like '%+fp1' and b.is_current;
  if v_bad > 0 then raise exception 'footprints unstage: % staged row(s) are already current: use the revert file', v_bad; end if;
  delete from public.wine_place_boundaries b
   using jsonb_to_recordset(v_expect) e(place_id uuid)
   where b.wine_place_id = e.place_id and b.revision like '%+fp1' and b.quality_status = 'DRAFT' and not b.is_current;
  if public.refresh_wine_place_neighbours() < 0 then raise exception 'footprints unstage: neighbour refresh refused'; end if;
end
$unstage$;
