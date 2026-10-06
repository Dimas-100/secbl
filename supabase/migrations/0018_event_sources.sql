-- Event sources: iCal feeds from the schools' involvement systems (GSU's PIN
-- runs Anthology Engage, which publishes
-- https://pin.gsu.edu/organization/<key>/events.ics). A daily sync imports
-- each feed's events so admins stop re-typing what the club already posted.
-- Design: docs/superpowers/specs/2026-10-06-event-sources-design.md

create table public.event_sources (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  school_id uuid references public.schools(id) on delete set null,
  feed_url text not null unique check (feed_url ~ '^https://'),
  enabled boolean not null default true,
  last_synced_at timestamptz,
  last_status text,          -- 'ok' | 'error'
  last_error text,
  last_imported int,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

alter table public.events
  add column if not exists source_id uuid references public.event_sources(id) on delete set null,
  add column if not exists external_uid text,
  add column if not exists external_url text;

-- One row per feed event; re-syncs update in place.
create unique index if not exists events_source_uid_idx
  on public.events (source_id, external_uid) where source_id is not null;
create index if not exists events_source_id_idx on public.events (source_id);

alter table public.event_sources enable row level security;

create policy "approved read event sources"
  on public.event_sources for select to authenticated
  using (public.is_approved());

create policy "admins insert event sources"
  on public.event_sources for insert to authenticated
  with check (public.is_admin() and created_by = (select auth.uid()));

create policy "admins update event sources"
  on public.event_sources for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy "admins delete event sources"
  on public.event_sources for delete to authenticated
  using (public.is_admin());

-- The sync itself runs with the service role (cron route / admin action), so
-- imported events need no member-facing write policy. Members keep reading
-- events through the existing "approved read events" policy.
