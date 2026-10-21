-- Table talk: anyone watching a live game can type to it, and the thread
-- lives exactly as long as the table.
-- Design: docs/superpowers/specs/2026-10-20-table-talk-design.md

-- ---------------------------------------------------------------------------
-- 1. A stable id per game. live_games stays keyed by reporter_id and the
--    scoreboard keeps upserting on it, so the id survives every score change
--    and only changes when the row is deleted (Send, Clear, or the scoreboard
--    starting a new game — see publishLiveGame).
-- ---------------------------------------------------------------------------
alter table public.live_games add column id uuid not null default gen_random_uuid();
alter table public.live_games add constraint live_games_id_key unique (id);

-- ---------------------------------------------------------------------------
-- 2. Comments. They cascade away with the game.
-- ---------------------------------------------------------------------------
create table public.live_comments (
  id bigint generated always as identity primary key,
  game_id uuid not null references public.live_games(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (length(trim(body)) between 1 and 280),
  created_at timestamptz not null default now()
);
create index live_comments_game_idx on public.live_comments (game_id, id);
create index live_comments_author_created_idx on public.live_comments (author_id, created_at desc);

alter table public.live_comments enable row level security;
create policy "members read live comments" on public.live_comments
  for select to authenticated using (public.is_approved());
create policy "members comment on live games" on public.live_comments
  for insert to authenticated
  with check (public.is_approved() and author_id = (select auth.uid()));

-- The game check comes first, so a game that ended a moment ago reads as
-- "over" rather than as a foreign-key error. Then the spam guard (tighter
-- than chat's 8 per 10 s: this lands on two players mid-game), and the clock
-- and the body are the server's.
create or replace function public.live_comments_before_insert()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if not exists (
    select 1 from live_games
    where id = new.game_id and updated_at > now() - interval '3 hours'
  ) then
    raise exception 'that game is over';
  end if;
  if (
    select count(*) from live_comments
    where author_id = new.author_id
      and created_at > now() - interval '10 seconds'
  ) >= 5 then
    raise exception 'slow down — you are commenting too quickly';
  end if;
  new.created_at := now();
  new.body := trim(new.body);
  return new;
end;
$$;

create trigger live_comments_before_insert
before insert on public.live_comments
for each row execute function public.live_comments_before_insert();

alter publication supabase_realtime add table public.live_comments;
