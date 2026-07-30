-- Fix wine-images uploads for the catalog wine hub (and create-time staging).
--
-- The original policies (20260714120000) required the first path segment to be
-- a tasting id via (storage.foldername(name))[1]::uuid + is_tasting_host /
-- is_tasting_participant. The catalog hub uploads under `catalog/{wineId}/...`;
-- casting the literal "catalog" to uuid THROWS during RLS evaluation (permissive
-- policies are OR-combined with no guaranteed short-circuit), so catalog uploads
-- failed regardless of file type. Replace the three write policies with
-- CASE-guarded versions: allow the `catalog/` prefix outright, and only cast to
-- uuid when the first segment is actually uuid-shaped. Public read is unchanged.

drop policy if exists "wine image participant folder insert" on storage.objects;
drop policy if exists "wine image participant folder update" on storage.objects;
drop policy if exists "wine image participant folder delete" on storage.objects;

create policy "wine image write insert" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'wine-images'
    and case
      when (storage.foldername(name))[1] = 'catalog' then true
      when (storage.foldername(name))[1] ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
        then is_tasting_host((storage.foldername(name))[1]::uuid)
          or is_tasting_participant((storage.foldername(name))[1]::uuid)
      else false
    end
  );

create policy "wine image write update" on storage.objects for update to authenticated
  using (
    bucket_id = 'wine-images'
    and case
      when (storage.foldername(name))[1] = 'catalog' then true
      when (storage.foldername(name))[1] ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
        then is_tasting_host((storage.foldername(name))[1]::uuid)
          or is_tasting_participant((storage.foldername(name))[1]::uuid)
      else false
    end
  );

create policy "wine image write delete" on storage.objects for delete to authenticated
  using (
    bucket_id = 'wine-images'
    and case
      when (storage.foldername(name))[1] = 'catalog' then true
      when (storage.foldername(name))[1] ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
        then is_tasting_host((storage.foldername(name))[1]::uuid)
          or is_tasting_participant((storage.foldername(name))[1]::uuid)
      else false
    end
  );
