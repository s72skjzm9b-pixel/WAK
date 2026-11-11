-- =============================================================================
-- WAK – Weird Art Klub · 01 · Schema
-- Tables, enums and indexes. Security (RLS, grants) lives in the next file.
-- Personal data is split into small "private" tables so that the tables other
-- members can (indirectly) read never contain contact details or ages.
-- =============================================================================

create extension if not exists pgcrypto with schema extensions;

-- ----------------------------------------------------------------------------
-- Enums
-- ----------------------------------------------------------------------------
create type public.user_role as enum ('child', 'guardian', 'admin');

create type public.membership_status as enum (
  'pending_guardian', -- venter på forældregodkendelse
  'pending_admin',    -- venter på WAK-godkendelse
  'active',           -- aktivt medlem
  'suspended',        -- suspenderet
  'rejected'          -- afvist
);

create type public.artwork_status as enum ('pending', 'approved', 'rejected', 'removed');

create type public.event_status as enum ('draft', 'published', 'cancelled');

create type public.registration_status as enum (
  'pending_guardian', -- barnet har trykket "Jeg vil med!", venter på voksen
  'confirmed',        -- voksen har sagt ja og der var plads
  'waitlisted',       -- voksen har sagt ja, men turen var fuld
  'declined',         -- voksen har sagt nej
  'cancelled',        -- afmeldt (barn, voksen eller admin)
  'expired'           -- voksen svarede ikke i tide
);

create type public.report_status as enum ('open', 'resolved', 'dismissed');

create type public.deletion_status as enum ('open', 'completed', 'rejected');

-- ----------------------------------------------------------------------------
-- Profiles: one row per auth user. Holds ONLY what other members may ever see
-- (nickname, illustrated avatar, short bio) plus role/status.
-- ----------------------------------------------------------------------------
create table public.profiles (
  id               uuid primary key references auth.users (id) on delete cascade,
  role             public.user_role not null,
  status           public.membership_status not null default 'pending_guardian',
  nickname         text,
  avatar           text not null default 'can:lavender',
  bio              text,
  pending_nickname text,
  pending_bio      text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint profiles_child_nickname check (role <> 'child' or nickname is not null),
  constraint profiles_nickname_len check (nickname is null or char_length(nickname) between 2 and 24),
  constraint profiles_pending_nickname_len check (pending_nickname is null or char_length(pending_nickname) between 2 and 24),
  constraint profiles_bio_len check (bio is null or char_length(bio) <= 140),
  constraint profiles_pending_bio_len check (pending_bio is null or char_length(pending_bio) <= 140),
  constraint profiles_avatar_format check (
    avatar ~ '^(can|eyes|peace|star|mascot|wak):(cobalt|orange|cream|lavender)$'
  )
);
create index profiles_role_status_idx on public.profiles (role, status);

-- Child-only private data. Never visible to other members.
create table public.child_private (
  child_id   uuid primary key references public.profiles (id) on delete cascade,
  username   text not null unique,       -- login name (lowercase)
  birth_year integer not null,           -- only to check the 10–13 age range
  created_at timestamptz not null default now(),
  constraint child_private_username_format check (username ~ '^[a-z0-9_]{3,20}$'),
  constraint child_private_birth_year check (birth_year between 2000 and 2030)
);

-- Guardian-only private data. Visible to the guardian themself and admins.
create table public.guardian_private (
  guardian_id uuid primary key references public.profiles (id) on delete cascade,
  full_name   text not null,
  email       text not null unique,
  phone       text,
  created_at  timestamptz not null default now(),
  constraint guardian_private_email_lower check (email = lower(email)),
  constraint guardian_private_name_len check (char_length(full_name) between 2 and 100)
);

create table public.guardian_children (
  guardian_id uuid not null references public.profiles (id) on delete cascade,
  child_id    uuid not null references public.profiles (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (guardian_id, child_id)
);
create index guardian_children_child_idx on public.guardian_children (child_id);

-- ----------------------------------------------------------------------------
-- Membership applications and consent
-- ----------------------------------------------------------------------------
create table public.membership_applications (
  id                    uuid primary key default gen_random_uuid(),
  child_id              uuid not null unique references public.profiles (id) on delete cascade,
  guardian_email        text not null,
  token_hash            text unique,           -- sha256 of the emailed token; cleared after use
  token_expires_at      timestamptz,
  status                public.membership_status not null default 'pending_guardian',
  guardian_id           uuid references public.profiles (id) on delete set null,
  guardian_confirmed_at timestamptz,
  decided_by            uuid references public.profiles (id) on delete set null,
  decided_at            timestamptz,
  decision_note         text,
  created_at            timestamptz not null default now(),
  constraint membership_applications_email_lower check (guardian_email = lower(guardian_email))
);
create index membership_applications_status_idx on public.membership_applications (status);
create index membership_applications_email_idx on public.membership_applications (guardian_email);

-- Append-only consent log. The newest row per (child, type[, event]) is the
-- current state. Withdrawal = a new row with granted = false.
create table public.consent_records (
  id             uuid primary key default gen_random_uuid(),
  child_id       uuid not null references public.profiles (id) on delete cascade,
  guardian_id    uuid references public.profiles (id) on delete set null,
  consent_type   text not null,
  event_id       uuid,
  granted        boolean not null,
  policy_version text not null,
  created_at     timestamptz not null default now(),
  constraint consent_records_type check (
    consent_type in ('membership', 'image_sharing', 'privacy_notice', 'event_participation')
  )
);
create index consent_records_child_idx on public.consent_records (child_id, consent_type, created_at desc);

-- ----------------------------------------------------------------------------
-- Art
-- ----------------------------------------------------------------------------
create table public.artworks (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid not null references public.profiles (id) on delete cascade,
  title           text,
  description     text,
  image_path      text not null unique,   -- storage object in the private "artwork" bucket
  thumb_path      text not null unique,
  width           integer not null check (width > 0),
  height          integer not null check (height > 0),
  status          public.artwork_status not null default 'pending',
  moderation_note text,
  reviewed_by     uuid references public.profiles (id) on delete set null,
  reviewed_at     timestamptz,
  approved_at     timestamptz,
  created_at      timestamptz not null default now(),
  constraint artworks_title_len check (title is null or char_length(title) <= 60),
  constraint artworks_description_len check (description is null or char_length(description) <= 300)
);
create index artworks_owner_idx on public.artworks (owner_id, created_at desc);
create index artworks_feed_idx on public.artworks (status, approved_at desc);

create table public.reactions (
  artwork_id uuid not null references public.artworks (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  emoji      text not null,
  created_at timestamptz not null default now(),
  primary key (artwork_id, user_id),       -- one reaction per member per artwork (changeable)
  constraint reactions_emoji check (emoji in ('❤️', '🔥', '😮', '👀', '😂', '🤯', '🌀'))
);
create index reactions_user_idx on public.reactions (user_id);

create table public.content_reports (
  id          uuid primary key default gen_random_uuid(),
  artwork_id  uuid not null references public.artworks (id) on delete cascade,
  reporter_id uuid references public.profiles (id) on delete set null,
  reason      text not null,
  details     text,
  status      public.report_status not null default 'open',
  resolved_by uuid references public.profiles (id) on delete set null,
  resolved_at timestamptz,
  created_at  timestamptz not null default now(),
  unique (artwork_id, reporter_id),
  constraint content_reports_reason check (
    reason in ('personal_info', 'identifiable_person', 'unsafe', 'mean', 'other')
  ),
  constraint content_reports_details_len check (details is null or char_length(details) <= 300)
);
create index content_reports_open_idx on public.content_reports (artwork_id) where status = 'open';

-- ----------------------------------------------------------------------------
-- WAKT – Weird Art Klub Tur
-- ----------------------------------------------------------------------------
create table public.events (
  id                    uuid primary key default gen_random_uuid(),
  title                 text not null,
  description           text not null default '',
  starts_at             timestamptz not null,
  ends_at               timestamptz not null,
  meeting_point         text not null,
  address               text,
  cover_path            text,          -- object in the private "event-covers" bucket
  organizer_name        text not null,
  organizer_email       text,
  organizer_phone       text,
  capacity              integer not null,
  registration_deadline timestamptz not null,
  practical_info        text,
  status                public.event_status not null default 'draft',
  created_by            uuid references public.profiles (id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint events_title_len check (char_length(title) between 2 and 80),
  constraint events_time_order check (ends_at > starts_at),
  constraint events_deadline check (registration_deadline <= starts_at),
  constraint events_capacity check (capacity between 1 and 500)
);
create index events_starts_idx on public.events (status, starts_at);

create table public.event_registrations (
  id                  uuid primary key default gen_random_uuid(),
  event_id            uuid not null references public.events (id) on delete cascade,
  child_id            uuid not null references public.profiles (id) on delete cascade,
  status              public.registration_status not null default 'pending_guardian',
  requested_at        timestamptz not null default now(),
  expires_at          timestamptz not null,
  guardian_id         uuid references public.profiles (id) on delete set null,
  guardian_decided_at timestamptz,
  confirmed_at        timestamptz,
  cancelled_at        timestamptz,
  cancelled_by        uuid references public.profiles (id) on delete set null
);
-- A child can only have one "live" registration per event.
create unique index event_registrations_one_active
  on public.event_registrations (event_id, child_id)
  where status in ('pending_guardian', 'confirmed', 'waitlisted');
create index event_registrations_event_idx on public.event_registrations (event_id, status);
create index event_registrations_child_idx on public.event_registrations (child_id);

-- ----------------------------------------------------------------------------
-- Administration
-- ----------------------------------------------------------------------------
create table public.audit_log (
  id          bigint generated always as identity primary key,
  actor_id    uuid,            -- no FK: entries must survive account deletion
  action      text not null,
  target_type text,
  target_id   text,
  details     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index audit_log_created_idx on public.audit_log (created_at desc);

create table public.deletion_requests (
  id           uuid primary key default gen_random_uuid(),
  guardian_id  uuid references public.profiles (id) on delete set null,
  child_id     uuid references public.profiles (id) on delete set null,
  kind         text not null,
  note         text,
  status       public.deletion_status not null default 'open',
  processed_by uuid references public.profiles (id) on delete set null,
  processed_at timestamptz,
  created_at   timestamptz not null default now(),
  constraint deletion_requests_kind check (kind in ('child_account', 'guardian_account')),
  constraint deletion_requests_note_len check (note is null or char_length(note) <= 500)
);

-- updated_at helper
create function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();
create trigger events_touch before update on public.events
  for each row execute function public.touch_updated_at();
