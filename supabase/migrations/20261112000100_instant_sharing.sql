-- =============================================================================
-- WAK · 05 · Instant sharing (product decision, Nov 2026)
-- Children's art is shown in the gallery straight away – no approval queue.
-- Safety now relies on removal after the fact:
--   * WAK admins can remove any work (admin_moderate_artwork / reports).
--   * A parent can remove their own child's work (guardian_remove_artwork).
--   * ONE open report from a member hides a work for everyone until an admin
--     has looked at it (was two while every work was checked first).
-- =============================================================================

alter table public.artworks
  alter column status set default 'approved',
  alter column approved_at set default now();

-- Anything still waiting from the old flow is published.
update public.artworks
   set status = 'approved', approved_at = coalesce(approved_at, created_at)
 where status = 'pending';

create or replace function public.artwork_is_shared(p_artwork uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.artworks a
    join public.profiles o on o.id = a.owner_id
    where a.id = p_artwork
      and a.status = 'approved'
      and o.status = 'active'
      and public.has_consent(o.id, 'image_sharing')
      -- a single open report hides a work until an admin has looked at it
      and not exists (select 1 from public.content_reports r
                      where r.artwork_id = a.id and r.status = 'open')
  )
$$;

-- A parent can take down their own child's work. It is kept (status
-- 'removed') so WAK can see what happened; the child sees it as removed.
create function public.guardian_remove_artwork(p_artwork uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_owner uuid;
begin
  select owner_id into v_owner from public.artworks where id = p_artwork for update;
  if v_owner is null then perform public.raise_wak('not_found'); end if;
  if not (public.is_active_guardian() and public.is_guardian_of(v_owner)) then
    perform public.raise_wak('forbidden');
  end if;
  update public.artworks
     set status = 'removed', moderation_note = 'Fjernet af din voksen',
         reviewed_by = auth.uid(), reviewed_at = now()
   where id = p_artwork;
  update public.content_reports set status = 'resolved', resolved_by = auth.uid(), resolved_at = now()
   where artwork_id = p_artwork and status = 'open';
  perform public.audit('artwork.removed_by_guardian', 'artwork', p_artwork::text, '{}'::jsonb);
end $$;

-- Previous / next work in gallery order, for swiping on the detail page.
-- Same visibility rules as gallery_feed.
create function public.gallery_neighbors(p_artwork uuid)
returns table (newer uuid, older uuid)
language sql stable security definer set search_path = '' as $$
  with visible as (
    select a.id, a.approved_at
    from public.artworks a
    where public.can_view_community()
      and public.artwork_is_shared(a.id)
      and not exists (select 1 from public.content_reports r
                      where r.artwork_id = a.id and r.reporter_id = auth.uid())
  ), cur as (
    select approved_at, id from visible where id = p_artwork
  )
  select
    (select v.id from visible v, cur
      where (v.approved_at, v.id) > (cur.approved_at, cur.id)
      order by v.approved_at, v.id limit 1),
    (select v.id from visible v, cur
      where (v.approved_at, v.id) < (cur.approved_at, cur.id)
      order by v.approved_at desc, v.id desc limit 1)
  from cur
$$;

revoke all on function public.guardian_remove_artwork(uuid), public.gallery_neighbors(uuid) from public, anon, authenticated;
grant execute on function public.guardian_remove_artwork(uuid), public.gallery_neighbors(uuid) to authenticated;

-- Stable order (ties broken by id) so the feed and swiping agree.
create or replace function public.gallery_feed(p_before timestamptz default null, p_limit integer default 24, p_artwork uuid default null)
returns table (
  id uuid, title text, description text, image_path text, thumb_path text,
  width integer, height integer, approved_at timestamptz,
  owner_id uuid, owner_nickname text, owner_avatar text, is_mine boolean
) language sql stable security definer set search_path = '' as $$
  select a.id, a.title, a.description, a.image_path, a.thumb_path, a.width, a.height, a.approved_at,
         a.owner_id, o.nickname, o.avatar, a.owner_id = auth.uid()
  from public.artworks a
  join public.profiles o on o.id = a.owner_id
  where public.can_view_community()
    and public.artwork_is_shared(a.id)
    and (p_artwork is null or a.id = p_artwork)
    and (p_before is null or a.approved_at < p_before)
    and not exists (select 1 from public.content_reports r
                    where r.artwork_id = a.id and r.reporter_id = auth.uid())
  order by a.approved_at desc, a.id desc
  limit least(greatest(coalesce(p_limit, 24), 1), 48)
$$;
