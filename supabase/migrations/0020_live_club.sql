-- Live Club (docs/superpowers/specs/2026-10-06-live-club-design.md):
-- push notifications, school logos, race formats with spots.

-- ---------------------------------------------------------------------------
-- 1. Push
-- ---------------------------------------------------------------------------

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
create index push_subscriptions_profile_idx on public.push_subscriptions (profile_id);

-- Per-category switches. No row means everything on.
create table public.notification_prefs (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  messages boolean not null default true,
  matches boolean not null default true,
  events boolean not null default true,
  updated_at timestamptz not null default now()
);

-- Stamped by the server once a message's push has gone out, so a client can
-- never make the same message buzz twice. No client UPDATE policy on messages.
alter table public.messages add column notified_at timestamptz;

alter table public.push_subscriptions enable row level security;
alter table public.notification_prefs enable row level security;

create policy "members manage own push subscriptions"
  on public.push_subscriptions for all to authenticated
  using (public.is_approved() and profile_id = (select auth.uid()))
  with check (public.is_approved() and profile_id = (select auth.uid()));

create policy "members manage own notification prefs"
  on public.notification_prefs for all to authenticated
  using (public.is_approved() and profile_id = (select auth.uid()))
  with check (public.is_approved() and profile_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- 2. School logos
-- ---------------------------------------------------------------------------

alter table public.schools add column logo_url text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('school-logos', 'school-logos', true, 1048576,
        array['image/png', 'image/svg+xml', 'image/webp', 'image/jpeg'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "school logos are public" on storage.objects;
create policy "school logos are public"
  on storage.objects for select to public
  using (bucket_id = 'school-logos');

drop policy if exists "admins upload school logos" on storage.objects;
create policy "admins upload school logos"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'school-logos' and public.is_admin());

drop policy if exists "admins replace school logos" on storage.objects;
create policy "admins replace school logos"
  on storage.objects for update to authenticated
  using (bucket_id = 'school-logos' and public.is_admin())
  with check (bucket_id = 'school-logos' and public.is_admin());

drop policy if exists "admins delete school logos" on storage.objects;
create policy "admins delete school logos"
  on storage.objects for delete to authenticated
  using (bucket_id = 'school-logos' and public.is_admin());

-- A function, not an UPDATE policy on schools: the table carries names and
-- colours that only a migration should change.
create or replace function public.set_school_logo(p_school_id uuid, p_url text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'only admins can change a school logo';
  end if;
  if p_url is not null and p_url not like '%/storage/v1/object/public/school-logos/%' then
    raise exception 'logo must be uploaded to the school-logos bucket';
  end if;
  update schools set logo_url = p_url where id = p_school_id;
  if not found then
    raise exception 'school not found';
  end if;
end;
$$;
revoke execute on function public.set_school_logo(uuid, text) from public, anon;
grant execute on function public.set_school_logo(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Races and spots
-- ---------------------------------------------------------------------------
-- Scores are stored as the scoreboard shows them: the spot receiver's score
-- already includes the games they were given. winner_id stays the higher
-- score, so ratings, achievements and every existing row keep their meaning.
-- race_to null = open play (and every row written before this migration).

alter table public.matches
  add column race_to smallint check (race_to between 1 and 25),
  add column spot smallint not null default 0 check (spot >= 0),
  add column spot_to uuid references public.profiles(id);

alter table public.matches add constraint matches_spot_shape
  check ((spot = 0) = (spot_to is null)
         and (spot_to is null or spot_to in (reporter_id, opponent_id)));
alter table public.matches add constraint matches_race_shape
  check (race_to is null
         or (greatest(reporter_score, opponent_score) = race_to
             and least(reporter_score, opponent_score) < race_to));
alter table public.matches add constraint matches_spot_fits
  check (race_to is null or spot < race_to);

create index matches_spot_to_idx on public.matches (spot_to) where spot_to is not null;
