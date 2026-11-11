-- =============================================================================
-- WAK · 03 · Private storage
-- Both buckets are PRIVATE: there are no public URLs. Images are only served
-- through short-lived signed URLs, and Supabase only signs a URL when the
-- caller passes the SELECT policy below.
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('artwork', 'artwork', false, 5242880, array['image/webp']),
  ('event-covers', 'event-covers', false, 5242880, array['image/webp'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- artwork/<owner uuid>/<file>.webp ------------------------------------------
create policy wak_artwork_read on storage.objects for select to authenticated using (
  bucket_id = 'artwork' and public.can_read_artwork_object(name)
);

create policy wak_artwork_upload on storage.objects for insert to authenticated with check (
  bucket_id = 'artwork'
  and split_part(name, '/', 1) = auth.uid()::text
  and public.is_active_child()
  and public.has_consent(auth.uid(), 'image_sharing')
);

create policy wak_artwork_delete on storage.objects for delete to authenticated using (
  bucket_id = 'artwork'
  and ((split_part(name, '/', 1) = auth.uid()::text and public.is_active_child()) or public.is_admin())
);
-- No UPDATE policy: images cannot be swapped after moderation.

-- event-covers/<event uuid>/<file>.webp -----------------------------------------
create policy wak_event_cover_read on storage.objects for select to authenticated using (
  bucket_id = 'event-covers'
  and (public.can_view_community() or public.is_active_guardian())
);

create policy wak_event_cover_insert on storage.objects for insert to authenticated with check (
  bucket_id = 'event-covers' and public.is_admin()
);

create policy wak_event_cover_update on storage.objects for update to authenticated
  using (bucket_id = 'event-covers' and public.is_admin())
  with check (bucket_id = 'event-covers' and public.is_admin());

create policy wak_event_cover_delete on storage.objects for delete to authenticated using (
  bucket_id = 'event-covers' and public.is_admin()
);
