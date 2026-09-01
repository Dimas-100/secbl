create type public.tournament_format as enum ('single_elim','double_elim');
create type public.tournament_status as enum ('setup','live','complete');
create type public.bracket_side as enum ('winners','losers','grand_final');

create table public.tournaments (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  format public.tournament_format not null default 'single_elim',
  status public.tournament_status not null default 'setup',
  -- Deleting an event must not delete the tournament played at it.
  event_id uuid references public.events(id) on delete set null,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz
);

create index tournaments_status_idx on public.tournaments (status, created_at desc);

create table public.tournament_players (
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  seed int not null check (seed > 0),
  primary key (tournament_id, profile_id),
  unique (tournament_id, seed)
);

create table public.tournament_matches (
  id uuid primary key,
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  bracket public.bracket_side not null default 'winners',
  round int not null check (round > 0),
  position int not null check (position >= 0),
  player1_id uuid references public.profiles(id),
  player2_id uuid references public.profiles(id),
  player1_score int check (player1_score >= 0),
  player2_score int check (player2_score >= 0),
  winner_id uuid references public.profiles(id),
  -- Wired in a second pass after insert, so the self-FK never needs to be
  -- DEFERRABLE (which would weaken it permanently to serve one insert).
  winner_advances_to uuid references public.tournament_matches(id) on delete set null,
  winner_advances_slot smallint check (winner_advances_slot in (1,2)),
  loser_advances_to uuid references public.tournament_matches(id) on delete set null,
  loser_advances_slot smallint check (loser_advances_slot in (1,2)),
  created_at timestamptz not null default now(),
  unique (tournament_id, bracket, round, position),
  check (winner_id is null or winner_id in (player1_id, player2_id))
);

create index tournament_matches_tournament_idx
  on public.tournament_matches (tournament_id, round, position);

alter table public.tournaments enable row level security;
alter table public.tournament_players enable row level security;
alter table public.tournament_matches enable row level security;

-- READ ONLY for clients. Every write goes through a SECURITY DEFINER function
-- that checks is_admin() internally: recording one result touches five tables
-- and cannot be expressed as a client-side write.
create policy "approved read tournaments"
  on public.tournaments for select to authenticated using (public.is_approved());
create policy "approved read tournament players"
  on public.tournament_players for select to authenticated using (public.is_approved());
create policy "approved read tournament matches"
  on public.tournament_matches for select to authenticated using (public.is_approved());
