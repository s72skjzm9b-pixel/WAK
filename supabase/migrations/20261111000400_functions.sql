-- =============================================================================
-- WAK · 04 · Business logic functions
-- Every function re-checks who is calling. Functions marked "server only" can
-- only be executed with the service-role key, which never leaves the server.
-- =============================================================================

-- ----------------------------------------------------------------------------
-- Internal helpers (no client grants)
-- ----------------------------------------------------------------------------
create function public.audit(p_action text, p_target_type text, p_target_id text, p_details jsonb default '{}'::jsonb)
returns void language sql security definer set search_path = '' as $$
  insert into public.audit_log (actor_id, action, target_type, target_id, details)
  values (auth.uid(), p_action, p_target_type, p_target_id, coalesce(p_details, '{}'::jsonb));
$$;

create function public.raise_wak(p_code text) returns void
language plpgsql as $$
begin
  -- Error codes are stable strings the app maps to friendly Danish messages.
  raise exception using message = p_code, errcode = 'P0001';
end $$;

-- Pending registrations whose guardian did not answer in time.
create function public.expire_stale_registrations() returns integer
language plpgsql security definer set search_path = '' as $$
declare v_count integer;
begin
  update public.event_registrations
     set status = 'expired'
   where status = 'pending_guardian' and expires_at <= now();
  get diagnostics v_count = row_count;
  return v_count;
end $$;

-- Move waitlisted registrations to confirmed while there is space.
-- Caller must already hold the event row lock (SELECT ... FOR UPDATE).
create function public.fill_from_waitlist(p_event uuid) returns uuid[]
language plpgsql security definer set search_path = '' as $$
declare
  v_event public.events;
  v_confirmed integer;
  v_promoted uuid[] := '{}';
  v_reg uuid;
begin
  select * into v_event from public.events where id = p_event;
  if v_event.status <> 'published' or v_event.starts_at <= now() then
    return v_promoted;
  end if;
  loop
    select count(*) into v_confirmed from public.event_registrations
     where event_id = p_event and status = 'confirmed';
    exit when v_confirmed >= v_event.capacity;
    select id into v_reg from public.event_registrations
     where event_id = p_event and status = 'waitlisted'
     order by guardian_decided_at, requested_at
     limit 1;
    exit when v_reg is null;
    update public.event_registrations
       set status = 'confirmed', confirmed_at = now()
     where id = v_reg;
    v_promoted := v_promoted || v_reg;
    perform public.audit('registration.promoted', 'event_registration', v_reg::text, '{}'::jsonb);
    v_reg := null;
  end loop;
  return v_promoted;
end $$;

-- ----------------------------------------------------------------------------
-- Membership (server only: called by the Next.js server with the service key
-- because the child / guardian has no session yet at these steps)
-- ----------------------------------------------------------------------------
create function public.register_child(
  p_user_id uuid, p_nickname text, p_avatar text, p_username text, p_birth_year integer,
  p_guardian_email text, p_token_hash text, p_token_expires_at timestamptz
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_app uuid;
begin
  if (select count(*) from public.membership_applications
       where guardian_email = lower(p_guardian_email) and status = 'pending_guardian') >= 3 then
    perform public.raise_wak('too_many_pending');
  end if;

  insert into public.profiles (id, role, status, nickname, avatar)
  values (p_user_id, 'child', 'pending_guardian', p_nickname, p_avatar);

  insert into public.child_private (child_id, username, birth_year)
  values (p_user_id, lower(p_username), p_birth_year);

  insert into public.membership_applications (child_id, guardian_email, token_hash, token_expires_at)
  values (p_user_id, lower(p_guardian_email), p_token_hash, p_token_expires_at)
  returning id into v_app;

  perform public.audit('membership.requested', 'profile', p_user_id::text, '{}'::jsonb);
  return v_app;
end $$;

create function public.guardian_confirm_application(
  p_token_hash text, p_guardian_id uuid, p_full_name text, p_phone text,
  p_image_sharing boolean, p_policy_version text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_app public.membership_applications;
begin
  select * into v_app from public.membership_applications
   where token_hash = p_token_hash for update;
  if v_app.id is null then perform public.raise_wak('invalid_token'); end if;
  if v_app.status <> 'pending_guardian' then perform public.raise_wak('already_handled'); end if;
  if v_app.token_expires_at < now() then perform public.raise_wak('token_expired'); end if;

  -- Guardian profile (created on first confirmation, reused for siblings)
  insert into public.profiles (id, role, status)
  values (p_guardian_id, 'guardian', 'active')
  on conflict (id) do nothing;
  if (select role from public.profiles where id = p_guardian_id) <> 'guardian' then
    perform public.raise_wak('email_not_guardian');
  end if;

  insert into public.guardian_private (guardian_id, full_name, email, phone)
  values (p_guardian_id, p_full_name, v_app.guardian_email, nullif(p_phone, ''))
  on conflict (guardian_id) do update
    set full_name = excluded.full_name, phone = coalesce(excluded.phone, public.guardian_private.phone);

  insert into public.guardian_children (guardian_id, child_id)
  values (p_guardian_id, v_app.child_id) on conflict do nothing;

  insert into public.consent_records (child_id, guardian_id, consent_type, granted, policy_version)
  values
    (v_app.child_id, p_guardian_id, 'privacy_notice', true, p_policy_version),
    (v_app.child_id, p_guardian_id, 'membership', true, p_policy_version),
    (v_app.child_id, p_guardian_id, 'image_sharing', coalesce(p_image_sharing, false), p_policy_version);

  update public.membership_applications
     set status = 'pending_admin', guardian_id = p_guardian_id, guardian_confirmed_at = now(),
         token_hash = null, token_expires_at = null
   where id = v_app.id;

  update public.profiles set status = 'pending_admin' where id = v_app.child_id;

  perform public.audit('membership.guardian_confirmed', 'profile', v_app.child_id::text,
    jsonb_build_object('image_sharing', coalesce(p_image_sharing, false), 'policy_version', p_policy_version));
  return v_app.child_id;
end $$;

-- Guardian says no: the application is closed and the server deletes the
-- child's login completely (nothing is kept about the child).
create function public.guardian_decline_application(p_token_hash text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_app public.membership_applications;
begin
  select * into v_app from public.membership_applications
   where token_hash = p_token_hash for update;
  if v_app.id is null then perform public.raise_wak('invalid_token'); end if;
  if v_app.status <> 'pending_guardian' then perform public.raise_wak('already_handled'); end if;
  update public.membership_applications
     set status = 'rejected', token_hash = null, token_expires_at = null, decided_at = now(),
         decision_note = 'Afvist af voksen'
   where id = v_app.id;
  update public.profiles set status = 'rejected' where id = v_app.child_id;
  perform public.audit('membership.guardian_declined', 'profile', v_app.child_id::text, '{}'::jsonb);
  return v_app.child_id;
end $$;

-- ----------------------------------------------------------------------------
-- Admin: memberships and members
-- ----------------------------------------------------------------------------
create function public.admin_decide_membership(p_child uuid, p_approve boolean, p_note text default null)
returns public.membership_status language plpgsql security definer set search_path = '' as $$
declare
  v_profile public.profiles;
  v_new public.membership_status;
begin
  if not public.is_admin() then perform public.raise_wak('forbidden'); end if;
  select * into v_profile from public.profiles where id = p_child and role = 'child' for update;
  if v_profile.id is null then perform public.raise_wak('not_found'); end if;
  if v_profile.status <> 'pending_admin' then perform public.raise_wak('not_pending_admin'); end if;
  if p_approve and not (public.has_consent(p_child, 'membership') and public.has_consent(p_child, 'privacy_notice')) then
    perform public.raise_wak('missing_consent');
  end if;

  v_new := case when p_approve then 'active' else 'rejected' end;
  update public.profiles set status = v_new where id = p_child;
  update public.membership_applications
     set status = v_new, decided_by = auth.uid(), decided_at = now(), decision_note = p_note
   where child_id = p_child;
  perform public.audit(case when p_approve then 'membership.approved' else 'membership.rejected' end,
    'profile', p_child::text, jsonb_build_object('note', p_note));
  return v_new;
end $$;

create function public.admin_set_member_status(p_child uuid, p_status public.membership_status, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_profile public.profiles;
begin
  if not public.is_admin() then perform public.raise_wak('forbidden'); end if;
  if p_status not in ('active', 'suspended') then perform public.raise_wak('invalid_status'); end if;
  select * into v_profile from public.profiles where id = p_child and role = 'child' for update;
  if v_profile.id is null then perform public.raise_wak('not_found'); end if;
  if v_profile.status not in ('active', 'suspended') then perform public.raise_wak('invalid_status'); end if;
  if p_status = 'active' and not public.has_consent(p_child, 'membership') then
    perform public.raise_wak('missing_consent');
  end if;
  update public.profiles set status = p_status where id = p_child;
  if p_status = 'suspended' then
    -- A suspended child cannot keep open event requests.
    update public.event_registrations set status = 'cancelled', cancelled_at = now(), cancelled_by = auth.uid()
     where child_id = p_child and status in ('pending_guardian', 'waitlisted');
  end if;
  perform public.audit('member.' || p_status::text, 'profile', p_child::text, jsonb_build_object('note', p_note));
end $$;

create function public.admin_review_profile(p_child uuid, p_approve boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then perform public.raise_wak('forbidden'); end if;
  if p_approve then
    update public.profiles
       set nickname = coalesce(pending_nickname, nickname),
           bio = case when pending_bio is null then bio when pending_bio = '' then null else pending_bio end,
           pending_nickname = null, pending_bio = null
     where id = p_child and role = 'child';
  else
    update public.profiles set pending_nickname = null, pending_bio = null
     where id = p_child and role = 'child';
  end if;
  perform public.audit(case when p_approve then 'profile.change_approved' else 'profile.change_rejected' end,
    'profile', p_child::text, '{}'::jsonb);
end $$;

-- ----------------------------------------------------------------------------
-- Child: profile
-- Avatar is a preset illustration → applied at once. Nickname and bio are
-- free text → stored as pending until an admin approves them.
-- ----------------------------------------------------------------------------
create function public.update_my_profile(p_avatar text, p_nickname text, p_bio text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_profile public.profiles;
begin
  select * into v_profile from public.profiles where id = auth.uid() and role = 'child' for update;
  if v_profile.id is null or v_profile.status <> 'active' then perform public.raise_wak('forbidden'); end if;

  update public.profiles set
    avatar = coalesce(p_avatar, avatar),
    pending_nickname = case
      when p_nickname is null or btrim(p_nickname) = nickname then pending_nickname
      else btrim(p_nickname) end,
    pending_bio = case
      when p_bio is null or btrim(p_bio) = coalesce(bio, '') then pending_bio
      else btrim(p_bio) end
  where id = auth.uid();
end $$;

-- ----------------------------------------------------------------------------
-- Gallery
-- ----------------------------------------------------------------------------
create function public.gallery_feed(p_before timestamptz default null, p_limit integer default 24, p_artwork uuid default null)
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
    -- works you reported disappear for you straight away
    and not exists (select 1 from public.content_reports r
                    where r.artwork_id = a.id and r.reporter_id = auth.uid())
  order by a.approved_at desc
  limit least(greatest(coalesce(p_limit, 24), 1), 48)
$$;

-- Emoji totals per artwork (no names – nobody can see who reacted).
create function public.reaction_summary(p_ids uuid[])
returns table (artwork_id uuid, emoji text, total integer, mine boolean)
language sql stable security definer set search_path = '' as $$
  select r.artwork_id, r.emoji, count(*)::integer, bool_or(r.user_id = auth.uid())
  from public.reactions r
  join public.artworks a on a.id = r.artwork_id
  where r.artwork_id = any (p_ids)
    and (
      (public.can_view_community() and public.artwork_is_shared(r.artwork_id))
      or (a.owner_id = auth.uid() and public.is_active_child())
      or public.is_guardian_of(a.owner_id)
      or public.is_admin()
    )
  group by r.artwork_id, r.emoji
$$;

create function public.admin_moderate_artwork(p_artwork uuid, p_status public.artwork_status, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then perform public.raise_wak('forbidden'); end if;
  if p_status = 'pending' then perform public.raise_wak('invalid_status'); end if;
  update public.artworks
     set status = p_status, moderation_note = p_note, reviewed_by = auth.uid(), reviewed_at = now(),
         approved_at = case when p_status = 'approved' then coalesce(approved_at, now()) else approved_at end
   where id = p_artwork;
  if not found then perform public.raise_wak('not_found'); end if;
  if p_status = 'approved' then
    -- An explicit approval clears earlier open reports on the same work.
    update public.content_reports set status = 'dismissed', resolved_by = auth.uid(), resolved_at = now()
     where artwork_id = p_artwork and status = 'open';
  end if;
  perform public.audit('artwork.' || p_status::text, 'artwork', p_artwork::text, jsonb_build_object('note', p_note));
end $$;

create function public.admin_resolve_report(p_report uuid, p_status public.report_status, p_remove_artwork boolean default false)
returns void language plpgsql security definer set search_path = '' as $$
declare v_artwork uuid;
begin
  if not public.is_admin() then perform public.raise_wak('forbidden'); end if;
  if p_status = 'open' then perform public.raise_wak('invalid_status'); end if;
  update public.content_reports set status = p_status, resolved_by = auth.uid(), resolved_at = now()
   where id = p_report returning artwork_id into v_artwork;
  if v_artwork is null then perform public.raise_wak('not_found'); end if;
  if p_remove_artwork then
    update public.artworks set status = 'removed', reviewed_by = auth.uid(), reviewed_at = now(),
           moderation_note = 'Fjernet efter anmeldelse'
     where id = v_artwork;
    update public.content_reports set status = 'resolved', resolved_by = auth.uid(), resolved_at = now()
     where artwork_id = v_artwork and status = 'open';
  end if;
  perform public.audit('report.' || p_status::text, 'content_report', p_report::text,
    jsonb_build_object('artwork', v_artwork, 'removed', p_remove_artwork));
end $$;

-- ----------------------------------------------------------------------------
-- WAKT: events and registrations
-- ----------------------------------------------------------------------------
create function public.event_availability(p_ids uuid[])
returns table (event_id uuid, capacity integer, confirmed integer, spaces_left integer)
language sql stable security definer set search_path = '' as $$
  select e.id, e.capacity, coalesce(c.n, 0)::integer, greatest(e.capacity - coalesce(c.n, 0), 0)::integer
  from public.events e
  left join (select r.event_id, count(*) as n from public.event_registrations r
             where r.status = 'confirmed' group by r.event_id) c on c.event_id = e.id
  where e.id = any (p_ids)
    and (public.is_admin()
         or (e.status in ('published', 'cancelled')
             and (public.can_view_community() or public.is_active_guardian())))
$$;

-- Child presses "Jeg vil med!"
create function public.request_event_registration(p_event uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_event public.events;
  v_reg uuid;
begin
  if not public.is_active_child() then perform public.raise_wak('forbidden'); end if;
  perform public.expire_stale_registrations();

  select * into v_event from public.events where id = p_event and status = 'published';
  if v_event.id is null then perform public.raise_wak('not_found'); end if;
  if v_event.registration_deadline <= now() then perform public.raise_wak('deadline_passed'); end if;

  begin
    insert into public.event_registrations (event_id, child_id, expires_at)
    values (p_event, auth.uid(), least(now() + interval '72 hours', v_event.registration_deadline))
    returning id into v_reg;
  exception when unique_violation then
    perform public.raise_wak('already_registered');
  end;

  perform public.audit('registration.requested', 'event_registration', v_reg::text,
    jsonb_build_object('event', p_event));
  return v_reg;
end $$;

-- Guardian approves or declines. Approval confirms only if there is space;
-- the event row lock serialises concurrent approvals so we never overbook.
create function public.guardian_decide_registration(p_reg uuid, p_approve boolean)
returns public.registration_status language plpgsql security definer set search_path = '' as $$
declare
  v_reg public.event_registrations;
  v_event public.events;
  v_confirmed integer;
  v_new public.registration_status;
begin
  select * into v_reg from public.event_registrations where id = p_reg;
  if v_reg.id is null or not public.is_guardian_of(v_reg.child_id) then
    perform public.raise_wak('forbidden');
  end if;

  -- Lock the event first, then the registration (same order everywhere).
  select * into v_event from public.events where id = v_reg.event_id for update;
  select * into v_reg from public.event_registrations where id = p_reg for update;

  if v_reg.status <> 'pending_guardian' then perform public.raise_wak('already_handled'); end if;
  if v_reg.expires_at <= now() then
    update public.event_registrations set status = 'expired' where id = p_reg;
    return 'expired';
  end if;

  if not p_approve then
    v_new := 'declined';
  else
    if v_event.status <> 'published' or v_event.starts_at <= now() then
      perform public.raise_wak('event_closed');
    end if;
    select count(*) into v_confirmed from public.event_registrations
     where event_id = v_event.id and status = 'confirmed';
    v_new := case when v_confirmed < v_event.capacity then 'confirmed' else 'waitlisted' end;
  end if;

  update public.event_registrations
     set status = v_new, guardian_id = auth.uid(), guardian_decided_at = now(),
         confirmed_at = case when v_new = 'confirmed' then now() else null end
   where id = p_reg;

  insert into public.consent_records (child_id, guardian_id, consent_type, event_id, granted, policy_version)
  values (v_reg.child_id, auth.uid(), 'event_participation', v_event.id, p_approve, 'event');

  perform public.audit('registration.' || v_new::text, 'event_registration', p_reg::text,
    jsonb_build_object('event', v_event.id));
  return v_new;
end $$;

-- Cancel a registration (child, guardian or admin). Returns registrations that
-- were promoted from the waitlist so the server can notify their guardians.
create function public.cancel_registration(p_reg uuid) returns uuid[]
language plpgsql security definer set search_path = '' as $$
declare
  v_reg public.event_registrations;
  v_promoted uuid[] := '{}';
begin
  select * into v_reg from public.event_registrations where id = p_reg;
  if v_reg.id is null or not (
       (v_reg.child_id = auth.uid() and public.is_active_child())
       or public.is_guardian_of(v_reg.child_id)
       or public.is_admin()) then
    perform public.raise_wak('forbidden');
  end if;

  perform 1 from public.events where id = v_reg.event_id for update;
  select * into v_reg from public.event_registrations where id = p_reg for update;
  if v_reg.status not in ('pending_guardian', 'confirmed', 'waitlisted') then
    perform public.raise_wak('already_handled');
  end if;

  update public.event_registrations
     set status = 'cancelled', cancelled_at = now(), cancelled_by = auth.uid()
   where id = p_reg;
  perform public.audit('registration.cancelled', 'event_registration', p_reg::text,
    jsonb_build_object('event', v_reg.event_id, 'was', v_reg.status));

  if v_reg.status = 'confirmed' then
    v_promoted := public.fill_from_waitlist(v_reg.event_id);
  end if;
  return v_promoted;
end $$;

-- Admin cancels a whole WAKT.
create function public.admin_cancel_event(p_event uuid) returns integer
language plpgsql security definer set search_path = '' as $$
declare v_count integer;
begin
  if not public.is_admin() then perform public.raise_wak('forbidden'); end if;
  update public.events set status = 'cancelled' where id = p_event;
  if not found then perform public.raise_wak('not_found'); end if;
  update public.event_registrations
     set status = 'cancelled', cancelled_at = now(), cancelled_by = auth.uid()
   where event_id = p_event and status in ('pending_guardian', 'confirmed', 'waitlisted');
  get diagnostics v_count = row_count;
  perform public.audit('event.cancelled', 'event', p_event::text, jsonb_build_object('registrations', v_count));
  return v_count;
end $$;

-- Audit + waitlist handling whenever an admin edits events directly.
create function public.events_after_write() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    perform public.audit('event.created', 'event', new.id::text, jsonb_build_object('title', new.title));
  elsif tg_op = 'UPDATE' then
    perform public.audit('event.updated', 'event', new.id::text,
      jsonb_build_object('status', new.status, 'capacity', new.capacity));
    if new.capacity > old.capacity then
      perform public.fill_from_waitlist(new.id);
    end if;
  elsif tg_op = 'DELETE' then
    perform public.audit('event.deleted', 'event', old.id::text, jsonb_build_object('title', old.title));
    return old;
  end if;
  return new;
end $$;

create trigger events_audit after insert or update or delete on public.events
  for each row execute function public.events_after_write();

-- ----------------------------------------------------------------------------
-- Guardian: consent and deletion
-- ----------------------------------------------------------------------------
create function public.guardian_set_consent(p_child uuid, p_type text, p_granted boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_guardian_of(p_child) then perform public.raise_wak('forbidden'); end if;
  if p_type not in ('membership', 'image_sharing') then perform public.raise_wak('invalid_consent'); end if;

  insert into public.consent_records (child_id, guardian_id, consent_type, granted, policy_version)
  values (p_child, auth.uid(), p_type, p_granted,
          coalesce((select c.policy_version from public.consent_records c
                    where c.child_id = p_child and c.consent_type = 'privacy_notice'
                    order by c.created_at desc limit 1), 'unknown'));

  if p_type = 'membership' and not p_granted then
    update public.profiles set status = 'suspended' where id = p_child and status = 'active';
    update public.event_registrations set status = 'cancelled', cancelled_at = now(), cancelled_by = auth.uid()
     where child_id = p_child and status in ('pending_guardian', 'confirmed', 'waitlisted');
  elsif p_type = 'membership' and p_granted then
    -- Re-joining after a withdrawal needs a fresh look from WAK.
    update public.profiles set status = 'pending_admin' where id = p_child and status = 'suspended';
    update public.membership_applications set status = 'pending_admin' where child_id = p_child;
  end if;

  perform public.audit('consent.' || p_type || case when p_granted then '.granted' else '.withdrawn' end,
    'profile', p_child::text, '{}'::jsonb);
end $$;

create function public.guardian_request_deletion(p_child uuid, p_kind text, p_note text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not public.is_active_guardian() then perform public.raise_wak('forbidden'); end if;
  if p_kind = 'child_account' and not public.is_guardian_of(p_child) then perform public.raise_wak('forbidden'); end if;
  if p_kind not in ('child_account', 'guardian_account') then perform public.raise_wak('invalid_kind'); end if;
  if exists (select 1 from public.deletion_requests
             where guardian_id = auth.uid() and status = 'open' and kind = p_kind
               and child_id is not distinct from (case when p_kind = 'child_account' then p_child end)) then
    perform public.raise_wak('already_requested');
  end if;

  insert into public.deletion_requests (guardian_id, child_id, kind, note)
  values (auth.uid(), case when p_kind = 'child_account' then p_child end, p_kind, p_note)
  returning id into v_id;

  -- Stop all activity right away while WAK processes the deletion.
  if p_kind = 'child_account' then
    update public.profiles set status = 'suspended' where id = p_child and status in ('active', 'pending_admin');
    update public.event_registrations set status = 'cancelled', cancelled_at = now(), cancelled_by = auth.uid()
     where child_id = p_child and status in ('pending_guardian', 'confirmed', 'waitlisted');
  end if;
  perform public.audit('deletion.requested', 'deletion_request', v_id::text, jsonb_build_object('kind', p_kind));
  return v_id;
end $$;

-- Called by the server (admin session) right before it deletes the auth user.
create function public.admin_mark_deletion(p_request uuid, p_status public.deletion_status)
returns public.deletion_requests language plpgsql security definer set search_path = '' as $$
declare v_req public.deletion_requests;
begin
  if not public.is_admin() then perform public.raise_wak('forbidden'); end if;
  update public.deletion_requests
     set status = p_status, processed_by = auth.uid(), processed_at = now()
   where id = p_request and status = 'open'
  returning * into v_req;
  if v_req.id is null then perform public.raise_wak('not_found'); end if;
  perform public.audit('deletion.' || p_status::text, 'deletion_request', p_request::text,
    jsonb_build_object('kind', v_req.kind));
  return v_req;
end $$;

-- ----------------------------------------------------------------------------
-- Grants for functions
-- ----------------------------------------------------------------------------
revoke all on all functions in schema public from public, anon, authenticated;

grant execute on function
  public.my_role(), public.is_admin(), public.is_active_child(),
  public.can_view_community(), public.is_active_guardian(),
  public.is_guardian_of(uuid), public.has_consent(uuid, text),
  public.artwork_is_shared(uuid), public.can_read_artwork_object(text),
  public.update_my_profile(text, text, text),
  public.gallery_feed(timestamptz, integer, uuid),
  public.reaction_summary(uuid[]),
  public.event_availability(uuid[]),
  public.request_event_registration(uuid),
  public.guardian_decide_registration(uuid, boolean),
  public.cancel_registration(uuid),
  public.guardian_set_consent(uuid, text, boolean),
  public.guardian_request_deletion(uuid, text, text),
  public.admin_decide_membership(uuid, boolean, text),
  public.admin_set_member_status(uuid, public.membership_status, text),
  public.admin_review_profile(uuid, boolean),
  public.admin_moderate_artwork(uuid, public.artwork_status, text),
  public.admin_resolve_report(uuid, public.report_status, boolean),
  public.admin_cancel_event(uuid),
  public.admin_mark_deletion(uuid, public.deletion_status)
to authenticated;

-- Server-only functions (service-role key).
grant execute on function
  public.register_child(uuid, text, text, text, integer, text, text, timestamptz),
  public.guardian_confirm_application(text, uuid, text, text, boolean, text),
  public.guardian_decline_application(text),
  public.expire_stale_registrations(),
  public.audit(text, text, text, jsonb)
to service_role;

-- Optional: if the pg_cron extension is enabled in Supabase, expire stale
-- permission requests every 15 minutes (they also expire lazily on use):
--   select cron.schedule('wak-expire', '*/15 * * * *', 'select public.expire_stale_registrations()');
