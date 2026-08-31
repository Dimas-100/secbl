create type public.game_type as enum ('8ball','9ball','10ball','other');
create type public.match_status as enum ('pending','confirmed','rejected','disputed');

create table public.matches (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id),
  opponent_id uuid not null references public.profiles(id),
  winner_id uuid not null references public.profiles(id),
  reporter_score int not null check (reporter_score >= 0),
  opponent_score int not null check (opponent_score >= 0),
  game_type public.game_type not null default '8ball',
  status public.match_status not null default 'pending',
  tournament_match_id uuid,
  played_at date not null default current_date,
  confirmed_at timestamptz,
  rating_delta_reporter int,
  rating_delta_opponent int,
  created_at timestamptz not null default now(),
  check (reporter_id <> opponent_id),
  check (winner_id in (reporter_id, opponent_id))
);

create index matches_opponent_pending_idx
  on public.matches (opponent_id) where status = 'pending';
create index matches_confirmed_at_idx on public.matches (confirmed_at desc);

create table public.rating_history (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id),
  match_id uuid not null references public.matches(id),
  rating_before int not null,
  rating_after int not null,
  created_at timestamptz not null default now()
);

create index rating_history_profile_idx
  on public.rating_history (profile_id, created_at desc);

alter table public.matches enable row level security;
alter table public.rating_history enable row level security;

create policy "approved read matches"
  on public.matches for select to authenticated
  using (public.is_approved());

-- Reporters create their own pending matches. No client UPDATE policy at all:
-- confirmation/rejection/dispute resolution go through server-side code.
create policy "approved report own matches"
  on public.matches for insert to authenticated
  with check (
    public.is_approved()
    and reporter_id = auth.uid()
    and status = 'pending'
    and tournament_match_id is null
  );

create policy "approved read rating history"
  on public.rating_history for select to authenticated
  using (public.is_approved());
