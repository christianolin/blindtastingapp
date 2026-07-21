-- Private bucket for immutable raw source artifacts (WFS page responses,
-- fetch manifests, normalized dissolve outputs). No storage.objects
-- policies: anon/authenticated cannot read or write; the service role
-- (adapter scripts) bypasses RLS. Public URLs are never handed out —
-- snapshot rows store bucket-relative storage URIs.
insert into storage.buckets (id, name, public)
values ('wine-map-sources', 'wine-map-sources', false)
on conflict (id) do update set public = false;
