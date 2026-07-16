-- Tasting cover image + description, and a per-wine image revealed
-- alongside the rest of the answer key.
alter table tastings add column image_url text;
alter table tastings add column description text;
alter table wine_answers add column image_url text;

-- Tasting images: uploaded before the tasting row exists (the create form is
-- one step), so scoped by the host's own user-id folder, same pattern as
-- avatars. Public read since tasting overview is visible to host+participants
-- anyway and the image itself isn't secret.
insert into storage.buckets (id, name, public)
values ('tasting-images', 'tasting-images', true);

create policy "tasting image public read" on storage.objects for select
  using (bucket_id = 'tasting-images');

create policy "tasting image own folder insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'tasting-images' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "tasting image own folder update" on storage.objects for update to authenticated
  using (bucket_id = 'tasting-images' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "tasting image own folder delete" on storage.objects for delete to authenticated
  using (bucket_id = 'tasting-images' and (storage.foldername(name))[1] = auth.uid()::text);

-- Wine images: the wine doesn't exist yet when the host is filling out the
-- form, but the tasting does — scoped by tasting_id folder instead. Public
-- read at the storage layer (the image blob itself), same as the mark's
-- SVGs; actual secrecy until reveal is enforced by wine_answers RLS, which
-- already covers the new image_url column since it's just another column
-- on the same row.
insert into storage.buckets (id, name, public)
values ('wine-images', 'wine-images', true);

create policy "wine image public read" on storage.objects for select
  using (bucket_id = 'wine-images');

create policy "wine image participant folder insert" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'wine-images'
    and (
      is_tasting_host((storage.foldername(name))[1]::uuid)
      or is_tasting_participant((storage.foldername(name))[1]::uuid)
    )
  );

create policy "wine image participant folder update" on storage.objects for update to authenticated
  using (
    bucket_id = 'wine-images'
    and (
      is_tasting_host((storage.foldername(name))[1]::uuid)
      or is_tasting_participant((storage.foldername(name))[1]::uuid)
    )
  );

create policy "wine image participant folder delete" on storage.objects for delete to authenticated
  using (
    bucket_id = 'wine-images'
    and (
      is_tasting_host((storage.foldername(name))[1]::uuid)
      or is_tasting_participant((storage.foldername(name))[1]::uuid)
    )
  );
