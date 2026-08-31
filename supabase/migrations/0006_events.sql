create type public.event_status as enum ('scheduled','cancelled');
create type public.rsvp_response as enum ('going','maybe','no');

create table public.events (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(trim(title)) > 0),
  description text,
  location text,
  starts_at timestamptz not null,
  ends_at timestamptz,
  status public.event_status not null default 'scheduled',
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  check (ends_at is null or ends_at > starts_at)
);

create index events_starts_at_idx on public.events (starts_at);

-- RSVPs cascade on both FKs: attendance intent is disposable. This differs
-- deliberately from matches, which never cascade from profiles because results
-- and rating history must survive a member leaving.
create table public.rsvps (
  event_id uuid not null references public.events(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  response public.rsvp_response not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (event_id, profile_id)
);

create index rsvps_event_idx on public.rsvps (event_id);

alter table public.events enable row level security;
alter table public.rsvps enable row level security;

create policy "approved read events"
  on public.events for select to authenticated
  using (public.is_approved());

create policy "admins insert events"
  on public.events for insert to authenticated
  with check (public.is_admin() and created_by = auth.uid());

create policy "admins update events"
  on public.events for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy "admins delete events"
  on public.events for delete to authenticated
  using (public.is_admin());

create policy "approved read rsvps"
  on public.rsvps for select to authenticated
  using (public.is_approved());

-- Members write only their own row, and only for a scheduled event. Blocking
-- RSVPs to *past* events stays in the server action, not here: that is a
-- product timing decision, not a security boundary.
create policy "members insert own rsvp"
  on public.rsvps for insert to authenticated
  with check (
    public.is_approved()
    and profile_id = auth.uid()
    and exists (
      select 1 from public.events e
      where e.id = event_id and e.status = 'scheduled'
    )
  );

create policy "members update own rsvp"
  on public.rsvps for update to authenticated
  using (public.is_approved() and profile_id = auth.uid())
  with check (
    public.is_approved()
    and profile_id = auth.uid()
    and exists (
      select 1 from public.events e
      where e.id = event_id and e.status = 'scheduled'
    )
  );

create policy "members delete own rsvp"
  on public.rsvps for delete to authenticated
  using (public.is_approved() and profile_id = auth.uid());
