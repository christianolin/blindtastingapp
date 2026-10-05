-- Footprint cleanup fp-1, wave germany.ahr: promote.
-- RENDERED by scripts/wine-map-sources/footprint-pass.mjs --render-sql from the
-- approved review file — do not hand-edit. Approval: Owner 2026-10-04: "Yes, go ahead (Recommended)" (ship fp-1 after review), with the crumb cap at 1,000 m² ("Keep parcels over 0.1 ha (Recommended)"); review fixes cded7a3, crumb cap 851c21c; this full dry run computed by f48e0b5 (step unchanged from 851c21c).

do $promote$
declare
  v_expect jsonb := '[{"place_id":"8315bc05-2282-4ca5-90ec-470c2deb0779","key":"germany.ahr.walporzheim-ahrtal.klosterberg.bad-neuenahr-ahrweiler-berg","current_boundary_id":"e8bea14d-2cb0-41dd-8af8-39ded5984cb5","current_sha":"a0aa2f657b1bb2d515e92d6f86142681fe505ac404fe817fd7f5292f5cd8811d","output_sha":"1e6fc9154ad367b7f4145a2b9e4171511ca4ca0ff4dcff8a5c4192f35f268db3"},{"place_id":"a6910127-f39d-49f9-87ec-06cbfd094697","key":"germany.ahr.walporzheim-ahrtal.klosterberg.altenahr-uebigberg","current_boundary_id":"72fbab39-5cfb-46a1-bd3f-5be3c3af76a3","current_sha":"ad36754fe123cf1d5b5e188118cf8873ffff29b78182e16e720977bd79738cd9","output_sha":"91926d79a3dda22dda2e59b83c517ef07bcd235d954c22e0f6952bec1a8f58df"},{"place_id":"c58d3a47-5f2c-4956-8641-860256f555f9","key":"germany.ahr.walporzheim-ahrtal.klosterberg.bad-neuenahr-ahrweiler-trotzenberg","current_boundary_id":"1fd50e20-f0ef-4faf-a3f0-ee48e6382e29","current_sha":"17e5476d01944e52c33a5943b10d967eb3642a9433cc41c7c4cb23bf8ff865d7","output_sha":"9081504c8219085c24f4dec67d3d38438b571621ab26c2cd01bfb095d3d8b554"},{"place_id":"c9009d08-9b20-484f-a559-b89180b338cb","key":"germany.ahr.walporzheim-ahrtal.klosterberg.dernau-pfarrwingert","current_boundary_id":"80a8fb2e-674f-4914-96fe-40124ed97009","current_sha":"b4661c741bc29ff55dc889229ae120cadf8e30c7ba753e01ead1018e0d4373f9","output_sha":"ff9d79891f5ddf3f66783bbbc5ba28161bcc778b188c47963cd435075a2261cf"},{"place_id":"835bb18e-ca36-48d8-bb35-247421390f98","key":"germany.ahr.walporzheim-ahrtal.klosterberg.bad-neuenahr-ahrweiler-grafschaft-stiftsberg","current_boundary_id":"065b5f90-21f7-4015-861f-1d5512e8eebf","current_sha":"1ff7e07d41354f2b989968d9b768ba0b45e57544fbf983000a467765acffa225","output_sha":"04253bb147b905047ad76f8a15c8c38f2bf1399a0c62b74531583be55cd11aee"},{"place_id":"8abdee70-ad86-4daa-b859-11919d1449de","key":"germany.ahr.walporzheim-ahrtal.klosterberg.bad-neuenahr-ahrweiler-karlskopf","current_boundary_id":"95485297-90ce-4a59-b59d-616e4d618c0d","current_sha":"e906d40b837715c1630f80304cdf3540e7487642e133a129fe7846e7c1141a35","output_sha":"ebc7b41fab773e77452f7f335d4a92744d07e1ff17a429e45a609fd4030367cb"},{"place_id":"8daa0d0d-baac-4f37-8fcc-9f5dc2a706c9","key":"germany.ahr.walporzheim-ahrtal.klosterberg.bad-neuenahr-ahrweiler-steinkaul","current_boundary_id":"be29342b-c6c5-472d-975c-7fd70795960d","current_sha":"df8b90150e3625082fa873b3370c7e138da8bdb5e2208d4dd5dafbf3fba1bfab","output_sha":"71ced833728d528c25c6adb03ae038e5649b8e5c0352ab73ab857cea24773bcc"},{"place_id":"83eaa516-1a69-4ea2-923d-0c9812b02b5e","key":"germany.ahr.walporzheim-ahrtal.klosterberg.bad-neuenahr-ahrweiler-dernau-grafschaft-klostergarten","current_boundary_id":"8dec5d31-fce7-4e3b-844c-823dcbbf9a94","current_sha":"39ab92aecb45b425a54c5c72679e89967081a621e804723a0f055375010f6e95","output_sha":"01884d1c2c7f775fecba1e475983b37e02e0bbe790b8204eeabcf583302ecdc5"},{"place_id":"ffe4e36c-392a-4a93-840f-fff29007e3a6","key":"germany.ahr.walporzheim-ahrtal.klosterberg.bad-neuenahr-ahrweiler-daubhaus","current_boundary_id":"d1fc6db8-72ee-41db-befe-f63fc78f261f","current_sha":"3222da63ec31b7a068325141c9fa13ec0c8e735c4d34b33b606ef11d53bcb5dd","output_sha":"fa42355405b15f639cbeb87d3a319d3c88a7dd305faa4d64cb30fd34e28f0a26"},{"place_id":"82f1d061-68f7-4b2a-b444-178a77ad7828","key":"germany.ahr.walporzheim-ahrtal.klosterberg.bad-neuenahr-ahrweiler-burggarten","current_boundary_id":"71e1e325-13c8-4821-8830-292b17fab35d","current_sha":"afac1e0b5362733da37a3867d3752bbe939f321b5e690f9691a9e06a1e6a51b9","output_sha":"3a7552d9a6717516a425e815db138a3d752e4eee8449da0652684fa45a588e91"},{"place_id":"084dad9a-0510-4dfe-8d89-5dd8ac62f9d8","key":"germany.ahr.walporzheim-ahrtal.klosterberg.bad-neuenahr-ahrweiler-schieferley","current_boundary_id":"d0c35f40-fd1e-49ca-9de3-b6d5c2996ccc","current_sha":"c53d7775e3571cfe2cce26503696c072fe2d4e6334eed41fb2a5f9e21e2410e6","output_sha":"dc2207977ebd344fbd19b8e51869d58aac6f4baa439b3f04a5664424a5668fb1"},{"place_id":"0b2cbe2e-9504-4a3e-9050-35f9424672b5","key":"germany.ahr.walporzheim-ahrtal.klosterberg.bad-neuenahr-ahrweiler-himmelchen","current_boundary_id":"a73d2994-d7ee-4f9b-9ec8-93687474a5db","current_sha":"038e13af7457932f8444b6887aeb26969c72ba96f94f65a9d560bb067041805c","output_sha":"961345ee5a2adc3047fb095b6feb4ea795b7eced401307d6ce3877c08991b385"},{"place_id":"0c0f6551-3ec0-4a2a-a233-ca6b0d042db4","key":"germany.ahr.walporzheim-ahrtal.klosterberg.bad-neuenahr-ahrweiler-sonnenschein","current_boundary_id":"7672d6e9-8929-46df-acb5-37ff8640bf91","current_sha":"68ec6e302c24c4feb1264201dc47566a05cd217ab6106a0a36d094de992c7cd4","output_sha":"bd07e17c9360b58f7674b4dce40f60648a974426a8b3d21c25cadf5e2c613e28"},{"place_id":"2ffe4290-8da1-4bf0-a3b9-4592b953c679","key":"germany.ahr.walporzheim-ahrtal.klosterberg.bad-neuenahr-ahrweiler-ursulinengarten","current_boundary_id":"48e49ede-2e30-4d59-89ab-2fd99f6d5025","current_sha":"a27334ea8add1067fda11e57a4a703f20d573be180d63da7b864a4006005a0ad","output_sha":"68f2936f9d86c1ba1771822e8585e67fedbee7018d045cf196c7d34da12ebbc3"},{"place_id":"27e21ec8-61d2-49d5-af4e-ddfa3a773459","key":"germany.ahr.walporzheim-ahrtal.klosterberg.bad-neuenahr-ahrweiler-alte-lay","current_boundary_id":"f5f9d4d5-44c5-453b-9908-152037245178","current_sha":"5dee4c36f654dd6ef2a7fad1c9321d1127b045cb427c45d4d0662bad8d467ce4","output_sha":"21100a383bc5bd1de2c6adbc51a14ed18569967b668124a4dcf7d2c392ccc47f"},{"place_id":"3d711c1e-2ed4-4cdf-a23c-e75a5e424019","key":"germany.ahr.walporzheim-ahrtal.klosterberg.bad-neuenahr-ahrweiler-silberberg","current_boundary_id":"2ec9d5b4-66de-40f5-8db1-9d9a6e49db4e","current_sha":"72433f99e126c0a3f11d9ac39af6a7f52584d94bcb16a8d0eb3db0874be34d10","output_sha":"85d2b46b0dd4e78ded9a48992c890ce4cca965a9b3f9654e9432ed525aff1f0e"},{"place_id":"c8c22fdf-4168-4940-860b-365d087ab73a","key":"germany.ahr.walporzheim-ahrtal.klosterberg.bad-neuenahr-ahrweiler-kapellenberg","current_boundary_id":"6296cecc-11bc-409f-b505-611f75771b37","current_sha":"2bbee7bf22ece4b4be6b124e04226102d9b1c0cb9715cbf3f200be2eb078834a","output_sha":"bbf6a93a1a237a70ca295650a9ac563923dc84c2567470881517579e9c7a6325"},{"place_id":"d5c64240-2168-4168-8c1e-ea63970733d6","key":"germany.ahr.walporzheim-ahrtal.klosterberg.bad-neuenahr-ahrweiler-landskrone","current_boundary_id":"6f114b49-6b8e-4772-8317-9ff2125c5389","current_sha":"51fcd65cefc81272372bb5173420eab7cb2cc7387fd107108249dbb438ea19f5","output_sha":"48844ba03cbcf4f95e4b881b91ccb8e096289f4a79b5889349d93d88eb200daa"},{"place_id":"b70e62b3-a2ce-4cf6-94b9-255540ef7afc","key":"germany.ahr.walporzheim-ahrtal.klosterberg.bad-neuenahr-ahrweiler-pfaffenberg","current_boundary_id":"cadf5833-2d38-4c6e-a001-7c89d33fbb8e","current_sha":"b75c31c69f3ced6dcac3c8c988c2f83de108ba4cb6736e502e1fb547b38b0f4a","output_sha":"f216ada5b70bb245abe27164625318898202aa932ce3f75977ad24a5421f8ac4"},{"place_id":"5cbf579a-21ca-4a05-97e9-bbaf5df89968","key":"germany.ahr.walporzheim-ahrtal.klosterberg.dernau-schieferlay","current_boundary_id":"fe26b698-0e02-4475-a66b-be6420f1b51e","current_sha":"5c9e017ab86a6f4ab71613a283e5a7623df90613e631109a013f80a75c13d516","output_sha":"35cb117ccab2f77a3b062053a05c22c946549104a95d0a13b09f10bd0b5557d8"},{"place_id":"a594e2be-3311-4530-a97f-1bd8aa340e26","key":"germany.ahr.walporzheim-ahrtal.klosterberg.bad-neuenahr-ahrweiler-rosenberg","current_boundary_id":"1f21ade6-8e3c-4c9a-801e-b95af30b4cc2","current_sha":"13b2dd8fd1ef239018820a2be8fecdbaa9ab960714f3f7eba0d9ffa268a51227","output_sha":"81b0e29bbbdc0939e19fff94325962537d377e16c5e21ef71c4a642a8aa69ac9"},{"place_id":"54f840f3-834c-4dfc-bc88-38b877747181","key":"germany.ahr.walporzheim-ahrtal.klosterberg.dernau-hardtberg","current_boundary_id":"1a4817b5-d5c1-482c-ac7a-0d609c8c6476","current_sha":"dcb5e69011c80bc8d0729931bbfae594bde7a1e92acf68b9f0a272d741319681","output_sha":"ca7947305145472cc74dd1a4b058cb7514aae8de9ccfb21ad5900a4eac20110e"},{"place_id":"28c182fc-d07e-44a6-a69c-ebb9a72d84eb","key":"germany.ahr.walporzheim-ahrtal.klosterberg.bad-neuenahr-ahrweiler-sonnenberg","current_boundary_id":"b14213df-ec7b-42e1-90ca-430f6c51f48a","current_sha":"fd3a3216729abe25897bb01eb6f545c6ce7ea676f78528c159f7d96ab0d2132b","output_sha":"ec5d53fdba12f8b85a604cbad0f5d3e9fbb1553469dd289a58b30499857ff2ad"},{"place_id":"941e0bfd-3ae7-414f-9280-fb940986f98e","key":"germany.ahr.walporzheim-ahrtal.klosterberg.bad-neuenahr-ahrweiler-rosenthal","current_boundary_id":"e5a64a06-c989-421e-9cc8-91e60b2e9cc3","current_sha":"407321d667627c084ea1c962f5ec932595889356050b390d0ffcc11b76c344b3","output_sha":"a33aca0770e8dc34502bfeb02461739cc5ee11bb10657b9513d9148b95a252bf"},{"place_id":"8ba8cd91-c840-4ce0-b2d8-20babef3f2cb","key":"germany.ahr.walporzheim-ahrtal.klosterberg.rech-blume","current_boundary_id":"f66c27ea-906c-4dc3-89d3-e9e790b347c2","current_sha":"e4b819f0903ddf4c49a3044719d6cca9aee71f2f254e63a7c7f74f50a9f5a020","output_sha":"726794eb27e4597e670990f5ff9a763c400835d9086a050a396910995b345781"},{"place_id":"d1469d67-7b27-4b58-a6c5-da5800c681f6","key":"germany.ahr.walporzheim-ahrtal.klosterberg.dernau-goldkaul","current_boundary_id":"adbaab60-f9e1-44db-b2cc-52ee51e6f930","current_sha":"88162bef3b824b17e88e927c395ba58a8cf89c2918578f648d17c1b6b63d0942","output_sha":"655d9910f3098d4c894167ae9d5b6c631305be2faf2d222f3ee3d7692f67019b"},{"place_id":"89ddec74-3661-4e08-8e24-2e90764e2e96","key":"germany.ahr.walporzheim-ahrtal.klosterberg.rech-hardtberg","current_boundary_id":"b1efb3c7-9a6f-4e0b-bea0-86cf2af1c93f","current_sha":"68397e07cedced95e095bc14de8ef97da45bff9808ddfe95e75f5f4367858c20","output_sha":"6e5ef8ec10159c4790c619e9bf44f3635e3e2d6de7057878f62aa30677db8292"},{"place_id":"3149c2ef-e723-494e-91e8-ee5dce2f68a7","key":"germany.ahr.walporzheim-ahrtal.klosterberg.dernau-burggarten","current_boundary_id":"7852f68d-6cbf-4ed6-ad7a-2e2a6973609b","current_sha":"7d4d8dc31c5aba90d3798d07a45a87d6d956506786d49f6c8cebbee0cdb44e75","output_sha":"0d069b26d1f1d53e5f76698a9d0880d52386e641373de1941b2a8fccf0b14b55"},{"place_id":"2cb8103f-04ac-4a3a-8209-69fee8a5e5e6","key":"germany.ahr.walporzheim-ahrtal.klosterberg.mayschoss-moenchberg","current_boundary_id":"8894a90a-5238-4a44-8b3d-b68cebd1089d","current_sha":"498d468967656a5a2b3162141e9c1263ff3026b0a1f043f7ec9cbcea2cc7202a","output_sha":"b645eb4d1702e065cfefcf263e1fe3efef4f7cc8daa27832eb048e2e16c8bbf2"},{"place_id":"8262b1ab-5ed7-4520-a9a9-410b8b8cb1ef","key":"germany.ahr.walporzheim-ahrtal.klosterberg","current_boundary_id":"32ce4bb3-07e3-487a-9e9b-32577b32c715","current_sha":"533ade810622b59aaa533ae4f5a46139367591de4b9c1fe0b20ec659d7b3f259","output_sha":"352d51205d57cdd121697c3a9719747df57f2d07ce19fa54c2b267a5587a960d"}]'::jsonb;
  v_n int := jsonb_array_length(v_expect);
  v_bad int;
  v_refreshed int;
  v_list text;
begin
  perform set_config('search_path', 'public, extensions', true);
  -- 0. never alongside a tiles run: a release built from a half-flipped wave would
  --    publish it before Gate B
  select count(*) into v_bad from public.wine_map_releases
   where status = 'BUILDING' and created_at > now() - interval '1 hour';
  if v_bad > 0 then raise exception 'footprints promote: % tiles release(s) BUILDING in the last 1 hour: wait, then re-run', v_bad; end if;

  -- 1. every input is still current with the sha the owner approved against
  select count(*) into v_bad
    from jsonb_to_recordset(v_expect) e(place_id uuid, current_boundary_id uuid, current_sha text, output_sha text)
   where not exists (select 1 from public.wine_place_boundaries b
                      where b.id = e.current_boundary_id and b.wine_place_id = e.place_id and b.is_current
                        and b.quality_status = 'VALIDATED'
                        and encode(sha256(extensions.ST_AsEWKB(b.display_geometry)), 'hex') = e.current_sha);
  if v_bad > 0 then raise exception 'footprints promote: % input row(s) changed since approval', v_bad; end if;

  -- 2. exactly one staged +fp1 row per place, DRAFT, non-current, with the approved output sha
  select count(*) into v_bad
    from jsonb_to_recordset(v_expect) e(place_id uuid, output_sha text)
   where (select count(*) from public.wine_place_boundaries b
           where b.wine_place_id = e.place_id and b.quality_status = 'DRAFT' and not b.is_current
             and b.revision like '%+fp1'
             and encode(sha256(extensions.ST_AsEWKB(b.display_geometry)), 'hex') = e.output_sha
             and b.generation_parameters->'cleanup'->>'output_sha256' = e.output_sha) <> 1;
  if v_bad > 0 then raise exception 'footprints promote: % place(s) without exactly one approved staged row', v_bad; end if;

  -- 3. the stamp's own checks: no new overlap with a non-partner, no new ground
  --    outside the containment parent, no descendant ground lost (each <= 1 m²),
  --    area within [-3 %, +10 %]
  select count(*) into v_bad
    from jsonb_to_recordset(v_expect) e(place_id uuid, output_sha text)
    join public.wine_place_boundaries b
      on b.wine_place_id = e.place_id and b.quality_status = 'DRAFT' and not b.is_current
     and b.revision like '%+fp1'
   where (b.generation_parameters->'cleanup'->'metrics'->>'new_overlap_m2')::float8 > 1
      or (b.generation_parameters->'cleanup'->'metrics'->>'outside_parent_new_m2')::float8 > 1
      or (b.generation_parameters->'cleanup'->'metrics'->>'protected_lost_m2')::float8 > 1
      or (b.generation_parameters->'cleanup'->'metrics'->>'area_m2_after')::float8
           > (1 + 0.1) * (b.generation_parameters->'cleanup'->'metrics'->>'area_m2_before')::float8
      or (b.generation_parameters->'cleanup'->'metrics'->>'area_m2_after')::float8
           < (1 - 0.03) * (b.generation_parameters->'cleanup'->'metrics'->>'area_m2_before')::float8;
  if v_bad > 0 then raise exception 'footprints promote: % staged row(s) fail the stamp checks', v_bad; end if;

  -- 4. flip: demote the inputs, make the staged rows VALIDATED + current
  update public.wine_place_boundaries b set is_current = false
    from jsonb_to_recordset(v_expect) e(current_boundary_id uuid)
   where b.id = e.current_boundary_id;
  update public.wine_place_boundaries b set quality_status = 'VALIDATED', is_current = true, reviewed_at = now()
    from jsonb_to_recordset(v_expect) e(place_id uuid, output_sha text)
   where b.wine_place_id = e.place_id and b.quality_status = 'DRAFT' and not b.is_current
     and b.revision like '%+fp1'
     and encode(sha256(extensions.ST_AsEWKB(b.display_geometry)), 'hex') = e.output_sha;
  get diagnostics v_bad = row_count;
  if v_bad <> v_n then raise exception 'footprints promote: flipped % of % rows', v_bad, v_n; end if;

  -- 5. post-state: each place has exactly one current row, the approved one
  select count(*) into v_bad
    from jsonb_to_recordset(v_expect) e(place_id uuid, output_sha text)
   where (select count(*) from public.wine_place_boundaries b where b.wine_place_id = e.place_id and b.is_current) <> 1
      or not exists (select 1 from public.wine_place_boundaries b where b.wine_place_id = e.place_id and b.is_current
                       and encode(sha256(extensions.ST_AsEWKB(b.display_geometry)), 'hex') = e.output_sha);
  if v_bad > 0 then raise exception 'footprints promote: post-state wrong for % place(s)', v_bad; end if;

  -- 5b. the independent check (footprint-sql.mjs independentCheckSql), on the stored
  --     rows themselves, trusting no stamp: each place's new ground against the input
  --     row it replaces, on every same-tier non-partner place (old and new shapes),
  --     outside its containment parent, and descendant ground given up; > 1 m² refuses
  select count(*), string_agg(format('%s %s / %s %s m²', x.kind, x.key, coalesce(x.other_key, '-'), round(x.m2::numeric, 1)), '; ')
    into v_bad, v_list
    from (select * from (
    with recursive
    pend as (
      select (e.key)::uuid id, st_geomfromewkb(decode(e.value, 'hex')) g
        from jsonb_each_text(coalesce(('{}'::jsonb)::jsonb, '{}'::jsonb)) e),
    w as (select e.place_id, nb.display_geometry g_new, ob.display_geometry g_old
           from jsonb_to_recordset(v_expect) e(place_id uuid, current_boundary_id uuid, output_sha text)
           join public.wine_place_boundaries nb on nb.wine_place_id = e.place_id and nb.is_current
            and encode(sha256(extensions.ST_AsEWKB(nb.display_geometry)), 'hex') = e.output_sha
           join public.wine_place_boundaries ob on ob.id = e.current_boundary_id),
    wp as (
      select w.place_id id, p.canonical_key k, p.display_tier tier, p.primary_parent_id ppid, w.g_new,
             st_collectionextract(st_difference(st_reduceprecision(w.g_new, 0.000001), st_reduceprecision(w.g_old, 0.000001), 0.000001), 3) grown,
             st_collectionextract(st_difference(st_reduceprecision(w.g_old, 0.000001), st_reduceprecision(w.g_new, 0.000001), 0.000001), 3) lost
        from w join public.wine_places p on p.id = w.place_id),
    nb as (
      select a.id aid, o.id bid, st_unaryunion(st_collect(st_reduceprecision(o.g, 0.000001))) g
        from wp a
        cross join lateral (
      select b.wine_place_id id, b.display_geometry g
            from public.wine_place_boundaries b
           where b.display_geometry && a.grown
             and ((b.is_current and b.quality_status = 'VALIDATED')
                  or (not b.is_current and b.quality_status = 'DRAFT'
                      and b.generation_parameters->'cleanup'->>'version' = 'fp-1'))
             and (b.is_current or not exists (select 1 from pend where pend.id = b.wine_place_id and pend.g = b.display_geometry))
          union all
          select b.wine_place_id id, i.display_geometry g
            from public.wine_place_boundaries b
            join public.wine_place_boundaries i
              on i.id = (b.generation_parameters->'cleanup'->>'input_boundary_id')::uuid
             and i.wine_place_id = b.wine_place_id and i.id <> b.id
           where i.display_geometry && a.grown
             and b.is_current and b.quality_status = 'VALIDATED'
          union all select w2.place_id, w2.g_new from w w2 where w2.g_new && a.grown
          union all select w2.place_id, w2.g_old from w w2 where w2.g_old && a.grown
          union all select pend.id, pend.g from pend where pend.g && a.grown) o
        join public.wine_places q on q.id = o.id
       where not st_isempty(a.grown) and o.id <> a.id and q.display_tier = a.tier
         and not exists (select 1 from public.wine_place_relationships r
                          where r.relationship_type::text in ('DUAL_LABEL', 'OVERLAPS', 'REPLACES_WITHIN')
                            and ((r.source_place_id = a.id and r.target_place_id = o.id)
                              or (r.source_place_id = o.id and r.target_place_id = a.id)))
       group by a.id, o.id),
    anc as (
      select a.id aid, q.id, q.primary_parent_id ppid, 1 depth from wp a join public.wine_places q on q.id = a.ppid
      union all
      select anc.aid, q.id, q.primary_parent_id, anc.depth + 1 from anc join public.wine_places q on q.id = anc.ppid
       where anc.depth < 20),
    par as (
      select distinct on (anc.aid) anc.aid, q.canonical_key k, coalesce(w.g_new, pend.g, b.display_geometry) g
        from anc join public.wine_places q on q.id = anc.id
        left join w on w.place_id = anc.id
        left join pend on pend.id = anc.id
        left join public.wine_place_boundaries b
          on b.wine_place_id = anc.id and b.is_current and b.quality_status = 'VALIDATED'
       where (w.place_id is not null or pend.id is not null or b.id is not null)
         and coalesce(b.boundary_method::text, '') <> 'DERIVED_FROM_DESCENDANTS'
       order by anc.aid, anc.depth),
    des as (
      select a.id pid, q.id, 1 depth from wp a join public.wine_places q on q.primary_parent_id = a.id
       where not st_isempty(a.lost)
      union all
      select des.pid, q.id, des.depth + 1 from des join public.wine_places q on q.primary_parent_id = des.id
       where des.depth < 20),
    dg as (
      select des.pid, st_unaryunion(st_collect(st_reduceprecision(x.g, 0.000001))) g
        from des join wp a on a.id = des.pid
        cross join lateral (
          select w.g_new g from w where w.place_id = des.id
          union all
          select b.display_geometry from public.wine_place_boundaries b
           where b.wine_place_id = des.id and not exists (select 1 from w where w.place_id = des.id)
             and ((b.is_current and b.quality_status = 'VALIDATED')
              or (not b.is_current and b.quality_status = 'DRAFT'
                  and b.generation_parameters->'cleanup'->>'version' = 'fp-1'))) x
       where x.g && a.lost
       group by des.pid)
    select 'new_ground_on_neighbour' kind, a.k key, q.canonical_key other_key,
           (select coalesce(sum(st_area(d.geom::geography)) filter (
        where 2 * st_area(d.geom::geography) / nullif(st_perimeter(d.geom::geography), 0) >= 0.1), 0)
       from st_dump(st_collectionextract(st_intersection(a.grown, nb.g, 0.000001), 3)) d) m2
      from nb join wp a on a.id = nb.aid join public.wine_places q on q.id = nb.bid
    union all
    select 'outside_parent', a.k, par.k, (select coalesce(sum(st_area(d.geom::geography)) filter (
        where 2 * st_area(d.geom::geography) / nullif(st_perimeter(d.geom::geography), 0) >= 0.1), 0)
       from st_dump(st_collectionextract(st_difference(a.grown, st_reduceprecision(par.g, 0.000001), 0.000001), 3)) d)
      from wp a join par on par.aid = a.id
     where not st_isempty(a.grown)
    union all
    select 'descendant_ground_lost', a.k, null, (select coalesce(sum(st_area(d.geom::geography)) filter (
        where 2 * st_area(d.geom::geography) / nullif(st_perimeter(d.geom::geography), 0) >= 0.1), 0)
       from st_dump(st_collectionextract(st_intersection(a.lost, dg.g, 0.000001), 3)) d)
      from wp a join dg on dg.pid = a.id) x where x.m2 > 1 order by x.kind, x.key, x.other_key) x;
  if v_bad > 0 then raise exception 'footprints promote: % independent check failure(s): %', v_bad, left(v_list, 3000); end if;

  -- 6. the neighbour cache, in the same transaction
  v_refreshed := public.refresh_wine_place_neighbours();
  if v_refreshed < 0 then raise exception 'footprints promote: refresh_wine_place_neighbours() refused (%)', v_refreshed; end if;
end
$promote$;
