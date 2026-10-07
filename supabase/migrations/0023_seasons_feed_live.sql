-- Seasons, activity feed, live now
-- (docs/superpowers/specs/2026-10-06-seasons-feed-live-design.md)

-- ---------------------------------------------------------------------------
-- 1. Seasons: admin-managed semesters with their own 3/1-point scoreboard.
--    Ratings and XP are untouched; membership is by played_at (computed).
-- ---------------------------------------------------------------------------
create table public.seasons (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  starts_on date not null,
  ends_on date,
  status text not null default 'open' check (status in ('open', 'closed')),
  champion_id uuid references public.profiles(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  closed_at timestamptz,
  check (ends_on is null or ends_on >= starts_on),
  check ((status = 'closed') = (closed_at is not null))
);
create unique index seasons_one_open on public.seasons (status) where status = 'open';
create index seasons_starts_idx on public.seasons (starts_on desc);

alter table public.seasons enable row level security;
create policy "members read seasons"
  on public.seasons for select to authenticated
  using (public.is_approved());

-- ---------------------------------------------------------------------------
-- 2. Activity feed: one row per league moment. Written by triggers, the two
--    season functions and the service role; members only read.
-- ---------------------------------------------------------------------------
create type public.activity_kind as enum (
  'match', 'badge', 'streak', 'pass',
  'cup_started', 'cup_round', 'cup_won',
  'season_opened', 'season_week_left', 'season_closed',
  'member_joined'
);

create table public.activity (
  id uuid primary key default gen_random_uuid(),
  kind public.activity_kind not null,
  actor_id uuid references public.profiles(id) on delete cascade,
  other_id uuid references public.profiles(id) on delete cascade,
  match_id uuid references public.matches(id) on delete cascade,
  tournament_id uuid references public.tournaments(id) on delete cascade,
  season_id uuid references public.seasons(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index activity_created_idx on public.activity (created_at desc);
create index activity_match_idx on public.activity (match_id) where match_id is not null;
create unique index activity_one_match_row on public.activity (match_id) where kind = 'match';
create unique index activity_one_week_left on public.activity (season_id) where kind = 'season_week_left';

alter table public.activity enable row level security;
create policy "members read activity"
  on public.activity for select to authenticated
  using (public.is_approved());

alter publication supabase_realtime add table public.activity;

-- ---------------------------------------------------------------------------
-- 3. Live games: the scoreboard being played right now, one row per reporter.
-- ---------------------------------------------------------------------------
create table public.live_games (
  reporter_id uuid primary key references public.profiles(id) on delete cascade,
  opponent_id uuid not null references public.profiles(id) on delete cascade,
  game_type text not null,
  race_to smallint check (race_to between 1 and 25),
  spot smallint not null default 0 check (spot >= 0),
  spot_to uuid references public.profiles(id) on delete set null,
  reporter_score smallint not null default 0 check (reporter_score >= 0),
  opponent_score smallint not null default 0 check (opponent_score >= 0),
  started_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (reporter_id <> opponent_id)
);
alter table public.live_games replica identity full;

alter table public.live_games enable row level security;
create policy "members read live games"
  on public.live_games for select to authenticated
  using (public.is_approved());

alter publication supabase_realtime add table public.live_games;

-- ---------------------------------------------------------------------------
-- 4. League push category (season news)
-- ---------------------------------------------------------------------------
alter table public.notification_prefs add column league boolean not null default true;

-- ---------------------------------------------------------------------------
-- 5. Season functions: admin only, the only write path.
-- ---------------------------------------------------------------------------
create or replace function public.open_season(p_name text, p_starts_on date, p_ends_on date)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_id uuid;
  v_name text := trim(coalesce(p_name, ''));
begin
  if not public.is_admin() then
    raise exception 'only admins can open a season';
  end if;
  if length(v_name) = 0 then
    raise exception 'a season needs a name';
  end if;
  if p_starts_on is null then
    raise exception 'a season needs a start date';
  end if;
  if p_ends_on is not null and p_ends_on < p_starts_on then
    raise exception 'a season cannot end before it starts';
  end if;
  if exists (select 1 from seasons where status = 'open') then
    raise exception 'a season is already open — end it first';
  end if;
  if exists (select 1 from seasons where status = 'closed' and ends_on >= p_starts_on) then
    raise exception 'the last season ended on or after that start date';
  end if;
  insert into seasons (name, starts_on, ends_on, created_by)
  values (v_name, p_starts_on, p_ends_on, auth.uid())
  returning id into v_id;
  insert into activity (kind, season_id, data)
  values ('season_opened', v_id, jsonb_build_object('name', v_name, 'ends_on', p_ends_on));
  return v_id;
end;
$$;
revoke execute on function public.open_season(text, date, date) from public, anon;
grant execute on function public.open_season(text, date, date) to authenticated;

create or replace function public.close_season(
  p_season_id uuid, p_champion_id uuid, p_today date, p_podium jsonb
) returns void
language plpgsql security definer set search_path = public
as $$
declare
  s seasons%rowtype;
  v_end date;
begin
  if not public.is_admin() then
    raise exception 'only admins can end a season';
  end if;
  select * into s from seasons where id = p_season_id and status = 'open' for update;
  if not found then
    raise exception 'that season is not open';
  end if;
  if p_today is null or p_today < s.starts_on then
    raise exception 'a season cannot end before it starts';
  end if;
  if p_champion_id is not null and not exists (select 1 from profiles where id = p_champion_id) then
    raise exception 'champion not found';
  end if;
  -- Early close: the season ends today. Late close: the planned end stands.
  v_end := least(coalesce(s.ends_on, p_today), p_today);
  update seasons
  set status = 'closed', closed_at = now(), ends_on = v_end, champion_id = p_champion_id
  where id = p_season_id;
  insert into activity (kind, actor_id, season_id, data)
  values (
    'season_closed', p_champion_id, p_season_id,
    jsonb_build_object(
      'name', s.name,
      'points', coalesce((p_podium -> 0 ->> 'points')::int, 0),
      'podium', coalesce(p_podium, '[]'::jsonb)
    )
  );
end;
$$;
revoke execute on function public.close_season(uuid, uuid, date, jsonb) from public, anon;
grant execute on function public.close_season(uuid, uuid, date, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Triggers that write the feed
-- ---------------------------------------------------------------------------
-- A confirmed match is one feed row, whichever function confirmed it. Leaving
-- 'confirmed' (a void) removes that row and every derived moment it caused.
create or replace function public.matches_activity()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.status = 'confirmed' then
    insert into activity (kind, actor_id, other_id, match_id, created_at)
    values (
      'match', new.winner_id,
      case when new.winner_id = new.reporter_id then new.opponent_id else new.reporter_id end,
      new.id, coalesce(new.confirmed_at, now())
    )
    on conflict (match_id) where kind = 'match'
    do update set actor_id = excluded.actor_id, other_id = excluded.other_id;
  elsif tg_op = 'UPDATE' and old.status = 'confirmed' then
    delete from activity where match_id = new.id;
  end if;
  return new;
end;
$$;
create trigger matches_activity
  after insert or update of status, winner_id on public.matches
  for each row execute function public.matches_activity();

create or replace function public.tournaments_activity()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_players int;
  v_winner uuid;
begin
  if new.status = 'live' and old.status = 'setup' then
    select count(*) into v_players from tournament_players where tournament_id = new.id;
    insert into activity (kind, tournament_id, data)
    values ('cup_started', new.id,
            jsonb_build_object('name', new.name, 'players', v_players, 'race_to', new.race_to));
  elsif new.status = 'complete' and old.status <> 'complete' then
    select winner_id into v_winner
    from tournament_matches
    where tournament_id = new.id and winner_advances_to is null and winner_id is not null
    limit 1;
    insert into activity (kind, actor_id, tournament_id, data)
    values ('cup_won', v_winner, new.id, jsonb_build_object('name', new.name));
  elsif old.status = 'complete' and new.status <> 'complete' then
    delete from activity where tournament_id = new.id and kind = 'cup_won';
  end if;
  return new;
end;
$$;
create trigger tournaments_activity
  after update of status on public.tournaments
  for each row execute function public.tournaments_activity();

-- A round is complete when every match in it has a winner. The final is
-- skipped (cup_won covers it). Clearing a winner removes the round's row.
create or replace function public.tournament_matches_activity()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_rounds int;
  v_name text;
begin
  if new.winner_id is not null and (old.winner_id is null or old.winner_id <> new.winner_id) then
    if new.winner_advances_to is null then
      return new;
    end if;
    if not exists (
         select 1 from tournament_matches
         where tournament_id = new.tournament_id and bracket = new.bracket
           and round = new.round and winner_id is null)
       and not exists (
         select 1 from activity
         where tournament_id = new.tournament_id and kind = 'cup_round'
           and (data ->> 'round')::int = new.round) then
      select count(distinct round) into v_rounds
      from tournament_matches where tournament_id = new.tournament_id and bracket = new.bracket;
      select name into v_name from tournaments where id = new.tournament_id;
      insert into activity (kind, tournament_id, data)
      values ('cup_round', new.tournament_id,
              jsonb_build_object('name', v_name, 'round', new.round, 'rounds', v_rounds));
    end if;
  elsif new.winner_id is null and old.winner_id is not null then
    delete from activity
    where tournament_id = new.tournament_id and kind = 'cup_round'
      and (data ->> 'round')::int = old.round;
  end if;
  return new;
end;
$$;
create trigger tournament_matches_activity
  after update of winner_id on public.tournament_matches
  for each row execute function public.tournament_matches_activity();

create or replace function public.profiles_activity()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.status = 'approved' then
    insert into activity (kind, actor_id) values ('member_joined', new.id);
  end if;
  return new;
end;
$$;
create trigger profiles_activity
  after insert on public.profiles
  for each row execute function public.profiles_activity();

-- ---------------------------------------------------------------------------
-- 7. Backfill: the feed is not empty on day one
-- ---------------------------------------------------------------------------
insert into public.activity (kind, actor_id, other_id, match_id, created_at)
select 'match', m.winner_id,
       case when m.winner_id = m.reporter_id then m.opponent_id else m.reporter_id end,
       m.id, coalesce(m.confirmed_at, m.created_at)
from public.matches m
where m.status = 'confirmed'
on conflict do nothing;

insert into public.activity (kind, actor_id, tournament_id, data, created_at)
select 'cup_won', tm.winner_id, t.id, jsonb_build_object('name', t.name), coalesce(t.completed_at, now())
from public.tournaments t
join public.tournament_matches tm
  on tm.tournament_id = t.id and tm.winner_advances_to is null and tm.winner_id is not null
where t.status = 'complete';
