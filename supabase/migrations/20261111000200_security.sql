-- =============================================================================
-- WAK · 02 · Security: helper functions, grants and Row Level Security
--
-- Principle: deny by default. The anon role gets nothing. Authenticated users
-- get narrow grants, and every row is filtered by RLS. Anything with business
-- rules (approvals, capacity, moderation) goes through SECURITY DEFINER
-- functions in 04_functions.sql that re-check authorisation themselves.
-- =============================================================================

-- ----------------------------------------------------------------------------
-- Helper functions (SECURITY DEFINER so they can read profiles without
-- recursing into RLS; they only ever return booleans about the caller).
-- ----------------------------------------------------------------------------
create function public.my_role() returns public.user_role
language sql stable security definer set search_path = '' as $$
  select p.role from public.profiles p where p.id = auth.uid()
$$;

create function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin' and p.status = 'active'
  )
$$;

create function public.is_active_child() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'child' and p.status = 'active'
  )
$$;

-- Can the caller see community content (gallery, events)? Active children + admins.
create function public.can_view_community() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.status = 'active' and p.role in ('child', 'admin')
  )
$$;

create function public.is_active_guardian() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'guardian' and p.status = 'active'
  )
$$;

create function public.is_guardian_of(p_child uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.guardian_children gc
    join public.profiles g on g.id = gc.guardian_id
    where gc.guardian_id = auth.uid() and gc.child_id = p_child and g.status = 'active'
  )
$$;

-- Current state of a consent (newest record wins). Default: not given.
create function public.has_consent(p_child uuid, p_type text) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select c.granted from public.consent_records c
    where c.child_id = p_child and c.consent_type = p_type and c.event_id is null
    order by c.created_at desc, c.id desc
    limit 1
  ), false)
$$;

-- Is this artwork visible in the shared gallery right now? Single source of
-- truth used by RLS, the storage policy and the feed function.
create function public.artwork_is_shared(p_artwork uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.artworks a
    join public.profiles o on o.id = a.owner_id
    where a.id = p_artwork
      and a.status = 'approved'
      and o.status = 'active'
      and public.has_consent(o.id, 'image_sharing')
      -- two or more open reports hide a work until an admin has looked at it
      and (select count(*) from public.content_reports r
           where r.artwork_id = a.id and r.status = 'open') < 2
  )
$$;

-- Storage object access for the private "artwork" bucket.
create function public.can_read_artwork_object(p_name text) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_folder text := split_part(p_name, '/', 1);
  v_art uuid;
  v_owner uuid;
begin
  if v_uid is null then
    return false;
  end if;
  select a.id, a.owner_id into v_art, v_owner
  from public.artworks a
  where a.image_path = p_name or a.thumb_path = p_name;

  if v_art is null then
    -- Object without a row (upload in progress): active owner or admin only.
    return (v_folder = v_uid::text and public.is_active_child()) or public.is_admin();
  end if;
  if (v_owner = v_uid and public.is_active_child()) or public.is_admin() or public.is_guardian_of(v_owner) then
    return true;
  end if;
  return public.can_view_community() and public.artwork_is_shared(v_art);
end $$;

-- ----------------------------------------------------------------------------
-- Grants: start from nothing.
-- ----------------------------------------------------------------------------
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on functions from public, anon, authenticated;

grant usage on schema public to authenticated;

grant execute on function
  public.my_role(), public.is_admin(), public.is_active_child(),
  public.can_view_community(), public.is_active_guardian(),
  public.is_guardian_of(uuid), public.has_consent(uuid, text),
  public.artwork_is_shared(uuid), public.can_read_artwork_object(text)
to authenticated;

-- Read access (rows still filtered by RLS below)
grant select on public.profiles, public.child_private, public.guardian_private,
  public.guardian_children, public.membership_applications, public.consent_records,
  public.artworks, public.reactions, public.content_reports, public.events,
  public.event_registrations, public.audit_log, public.deletion_requests
to authenticated;

-- Direct writes that are safe with RLS. Everything else goes through functions.
grant insert (owner_id, title, description, image_path, thumb_path, width, height)
  on public.artworks to authenticated;
grant delete on public.artworks to authenticated;
grant insert (artwork_id, user_id, emoji), update (emoji), delete on public.reactions to authenticated;
grant insert (artwork_id, reporter_id, reason, details) on public.content_reports to authenticated;
grant insert, update, delete on public.events to authenticated; -- admins only, via RLS

-- service_role (server-only key) keeps full access for account lifecycle tasks.
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;

-- ----------------------------------------------------------------------------
-- Row Level Security
-- ----------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.child_private enable row level security;
alter table public.guardian_private enable row level security;
alter table public.guardian_children enable row level security;
alter table public.membership_applications enable row level security;
alter table public.consent_records enable row level security;
alter table public.artworks enable row level security;
alter table public.reactions enable row level security;
alter table public.content_reports enable row level security;
alter table public.events enable row level security;
alter table public.event_registrations enable row level security;
alter table public.audit_log enable row level security;
alter table public.deletion_requests enable row level security;

-- profiles: yourself, your guardian, admins. Other members never read this
-- table directly; they get nickname + avatar through the gallery functions.
create policy profiles_select on public.profiles for select to authenticated using (
  id = auth.uid() or public.is_admin() or public.is_guardian_of(id)
);

create policy child_private_select on public.child_private for select to authenticated using (
  child_id = auth.uid() or public.is_admin() or public.is_guardian_of(child_id)
);

create policy guardian_private_select on public.guardian_private for select to authenticated using (
  guardian_id = auth.uid() or public.is_admin()
);

create policy guardian_children_select on public.guardian_children for select to authenticated using (
  guardian_id = auth.uid() or public.is_admin()
);

create policy membership_applications_select on public.membership_applications
  for select to authenticated using (
    child_id = auth.uid() or public.is_admin() or public.is_guardian_of(child_id)
  );

create policy consent_records_select on public.consent_records for select to authenticated using (
  public.is_admin() or public.is_guardian_of(child_id)
);

-- artworks
create policy artworks_select on public.artworks for select to authenticated using (
  (owner_id = auth.uid() and public.is_active_child())
  or public.is_admin()
  or public.is_guardian_of(owner_id)
  or (public.can_view_community() and public.artwork_is_shared(id))
);

create policy artworks_insert on public.artworks for insert to authenticated with check (
  owner_id = auth.uid()
  and public.is_active_child()
  and public.has_consent(auth.uid(), 'image_sharing')
  and split_part(image_path, '/', 1) = auth.uid()::text
  and split_part(thumb_path, '/', 1) = auth.uid()::text
);

create policy artworks_delete on public.artworks for delete to authenticated using (
  owner_id = auth.uid() or public.is_admin()
);

-- reactions: you only ever see your own rows; counts come from a function.
create policy reactions_select on public.reactions for select to authenticated using (
  user_id = auth.uid()
);
create policy reactions_insert on public.reactions for insert to authenticated with check (
  user_id = auth.uid() and public.is_active_child() and public.artwork_is_shared(artwork_id)
);
create policy reactions_update on public.reactions for update to authenticated
  using (user_id = auth.uid() and public.is_active_child())
  with check (user_id = auth.uid() and public.artwork_is_shared(artwork_id));
create policy reactions_delete on public.reactions for delete to authenticated using (
  user_id = auth.uid()
);

-- content reports
create policy content_reports_select on public.content_reports for select to authenticated using (
  reporter_id = auth.uid() or public.is_admin()
);
create policy content_reports_insert on public.content_reports for insert to authenticated with check (
  reporter_id = auth.uid() and public.is_active_child() and public.artwork_is_shared(artwork_id)
);

-- events: published/cancelled events for members and guardians; admins all.
create policy events_select on public.events for select to authenticated using (
  public.is_admin()
  or (status in ('published', 'cancelled')
      and (public.can_view_community() or public.is_active_guardian()))
);
create policy events_admin_insert on public.events for insert to authenticated with check (public.is_admin());
create policy events_admin_update on public.events for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy events_admin_delete on public.events for delete to authenticated using (public.is_admin());

-- registrations: the child, the child's guardian, admins. Never other children.
create policy event_registrations_select on public.event_registrations for select to authenticated using (
  (child_id = auth.uid() and public.is_active_child())
  or public.is_guardian_of(child_id)
  or public.is_admin()
);

create policy audit_log_select on public.audit_log for select to authenticated using (public.is_admin());

create policy deletion_requests_select on public.deletion_requests for select to authenticated using (
  guardian_id = auth.uid() or public.is_admin()
);
