-- Public tile bucket for the world wine map (Phase 2A).
-- Public read happens via /storage/v1/object/public/...; there are no
-- storage.objects policies, so anon/authenticated cannot write. Uploads go
-- through the service role in CI, which bypasses RLS.
insert into storage.buckets (id, name, public)
values ('wine-map-tiles', 'wine-map-tiles', true)
on conflict (id) do update set public = true;
