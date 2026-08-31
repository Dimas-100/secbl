-- Schools
create table public.schools (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  short_name text not null unique,
  primary_color text not null default '#1f2937',
  secondary_color text not null default '#6b7280'
);

-- Profiles
create type public.member_role as enum ('member','admin');
create type public.member_status as enum ('pending','approved','rejected');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  school_id uuid not null references public.schools(id),
  avatar_url text,
  role public.member_role not null default 'member',
  status public.member_status not null default 'pending',
  rating int not null default 450,
  matches_played int not null default 0,
  created_at timestamptz not null default now()
);

-- Auto-create a profile row on signup from the auth metadata.
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, school_id)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'display_name', 'Player'),
    (new.raw_user_meta_data->>'school_id')::uuid
  );
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- RLS helpers (SECURITY DEFINER so policies on profiles don't recurse).
create or replace function public.is_approved()
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from profiles where id = auth.uid() and status = 'approved'
  );
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and status = 'approved' and role = 'admin'
  );
$$;

-- RLS
alter table public.schools enable row level security;
alter table public.profiles enable row level security;

-- Schools are public info (the signup page lists them pre-auth).
create policy "schools readable by everyone"
  on public.schools for select to anon, authenticated using (true);

create policy "read own profile"
  on public.profiles for select to authenticated
  using (id = auth.uid());

create policy "approved read approved profiles"
  on public.profiles for select to authenticated
  using (public.is_approved() and status = 'approved');

create policy "admins read all profiles"
  on public.profiles for select to authenticated
  using (public.is_admin());

create policy "admins update profiles"
  on public.profiles for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Seed schools
insert into public.schools (name, short_name) values
  ('University of Georgia', 'UGA'),
  ('Georgia State University', 'GSU'),
  ('Florida State University', 'FSU');
