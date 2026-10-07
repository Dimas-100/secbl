# Seasons, Activity Feed & Live Now Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship admin-managed semester seasons with a 3/1-point scoreboard and a champion, a stored league activity feed on Home that updates live, and a "Live now" strip showing the scoreboards being played right now.

**Architecture:** One migration (`0023_seasons_feed_live.sql`) adds `seasons`, `activity`, `live_games`, the `league` push category, two admin RPCs (`open_season`, `close_season`) and four triggers that write activity rows for confirmed matches, cup milestones and new members. Derived moments (badge, streak, ladder pass) are computed in TypeScript after a confirmation and stored with the causing `match_id`. Season standings, feed copy and live-card maths are pure modules under `lib/` with Vitest. Home re-renders on the server when Realtime reports a change (`router.refresh()`), so there is no second client data model.

**Tech Stack:** Next.js 16 App Router (Server Components + Server Actions), React 19, Tailwind 4, Supabase (Postgres, RLS, Realtime, triggers), `web-push`, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-06-seasons-feed-live-design.md`

## Global Constraints

- Ratings and XP are never reset; `apply_match_confirmation`, `lib/rating.ts`, `lib/levels.ts` and the tournament RPCs are not modified.
- Season points: `POINTS_WIN = 3`, `POINTS_LOSS = 1`. Membership by `played_at` within `[starts_on, ends_on]` inclusive (club dates, `YYYY-MM-DD`).
- Only one season may be `open` (partial unique index). Seasons and activity are written only by RPCs, triggers and the service role; members only `select`.
- The Home feed section keeps the heading **Recent** (nine e2e specs use it as the logged-in landmark).
- Streak marks: 3, 5, 10, then every 5. Ladder passes only when the new rank ≤ 10.
- Push: new category `league`; missing VAPID keys → warn once, send nothing. Every push runs after the row is saved and swallows its own failures.
- Live games: published only once an opponent is picked; rows with `updated_at` older than 3 hours are ignored; deleted on report and on Clear.
- Tokens only (`--brass`, `--win`, `--loss`, `--gold`, hairlines); `eyebrow` utility, never `overline`.
- Every Supabase builder must be awaited/then'd or it does not run.
- Integration + e2e suites write to the production project; every created row is deleted in teardown (seasons included).
- All dates through `lib/events.ts` (`America/New_York`); the server runs in UTC.

## Review Focus

1. A match played *before* the season starts but confirmed *after* it opened must not count — pinned in `tests/season.test.ts` ("boundary dates are inclusive and a day earlier is out").
2. Voiding a cup result must remove the `match` row **and** any badge/streak/pass rows it caused — pinned in `tests/seasons.integration.test.ts` ("voiding removes every activity row for the match").
3. A pass computed while someone is *provisional* or when the winner was already #1 must return null, never a self-pass — pinned in `tests/activity.test.ts` ("already on top → null", "winner jumps nobody → null").
4. `close_season` with a planned `ends_on` already in the past must keep that date (late close), and with a future one must pull it to today (early close) — pinned in the integration test ("early close trims ends_on; late close keeps it").
5. A scoreboard draft restored from localStorage must republish its live row, and Clear must delete it — pinned in `e2e/season-feed.spec.ts` (card appears after reload, disappears after Clear).

---

### Task 1: Migration, types, League pref

**Files:**
- Create: `supabase/migrations/0023_seasons_feed_live.sql`
- Modify: `lib/types.ts` (append), `lib/push.ts:5-9,52-66`, `lib/push-send.ts:84-105`, `app/(member)/settings/page.tsx:37-38`, `app/(member)/settings/push-actions.ts:68-79`, `app/(member)/settings/notifications-card.tsx:12-16`, `tests/push.test.ts`

**Interfaces:**
- Produces: tables `seasons`, `activity`, `live_games`; RPCs `open_season(p_name text, p_starts_on date, p_ends_on date) returns uuid`, `close_season(p_season_id uuid, p_champion_id uuid, p_today date, p_podium jsonb) returns void`; `Prefs.league`; `PushCategory` includes `"league"`; `notifyAllMembers(service, excludeId, payload)`.

- [ ] **Step 1: Write the migration**

```sql
-- Seasons, activity feed, live now
-- (docs/superpowers/specs/2026-10-06-seasons-feed-live-design.md)

-- ---------------------------------------------------------------------------
-- 1. Seasons
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
-- 2. Activity feed
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
-- 3. Live games (the scoreboard being played right now)
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
-- 4. League push category
-- ---------------------------------------------------------------------------
alter table public.notification_prefs add column league boolean not null default true;

-- ---------------------------------------------------------------------------
-- 5. Season RPCs (admin only; the only write path)
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
```

- [ ] **Step 2: Apply it to the Supabase project** with the Supabase MCP `apply_migration` (name `0023_seasons_feed_live`) and confirm with `list_tables` that `seasons`, `activity`, `live_games` exist and `notification_prefs.league` is present.

- [ ] **Step 3: Types** — append to `lib/types.ts`:
```ts
export type SeasonStatus = "open" | "closed";
export interface Season {
  id: string;
  name: string;
  starts_on: string; // club date YYYY-MM-DD
  ends_on: string | null;
  status: SeasonStatus;
  champion_id: string | null;
  created_by: string | null;
  created_at: string;
  closed_at: string | null;
}

export type ActivityKind =
  | "match" | "badge" | "streak" | "pass"
  | "cup_started" | "cup_round" | "cup_won"
  | "season_opened" | "season_week_left" | "season_closed"
  | "member_joined";

export interface LiveGame {
  reporter_id: string;
  opponent_id: string;
  game_type: GameType;
  race_to: number | null;
  spot: number;
  spot_to: string | null;
  reporter_score: number;
  opponent_score: number;
  started_at: string;
  updated_at: string;
}
```

- [ ] **Step 4: League category** — `lib/push.ts`: `export type PushCategory = "messages" | "matches" | "events" | "league";` and `Prefs` gains `league: boolean`. `lib/push-send.ts` `loadPrefs`: select `"profile_id, messages, matches, events, league"` and map `league: p.league`. Add at the end of `lib/push-send.ts`:
```ts
// Every approved member, for league-wide news. Paged: PostgREST caps a response at 1000 rows.
export async function notifyAllMembers(
  service: SupabaseClient,
  input: { category: PushCategory; excludeId: string | null; payload: PushPayload }
): Promise<void> {
  try {
    const ids = await fetchAllPages<{ id: string }>((from, to) =>
      service.from("profiles").select("id").eq("status", "approved").order("id").range(from, to).then(({ data }) => data ?? [])
    );
    await notify(service, { candidates: ids.map((p) => p.id), ...input });
  } catch (err) {
    console.warn("push: notifyAllMembers failed", err);
  }
}
```
(import `fetchAllPages` from `@/lib/paging`). Settings: `page.tsx` selects `"messages, matches, events, league"`; `push-actions.ts` `updateNotificationPrefs` writes `league: !!prefs.league`; `notifications-card.tsx` `CATEGORIES` gains `{ key: "league", label: "League", hint: "Season news" }`. Wherever a `Prefs` literal is built (settings page fallback `{ messages: true, matches: true, events: true }`), add `league: true`.

- [ ] **Step 5: Test** — in `tests/push.test.ts` extend the `recipientsFor` test's prefs literals with `league` and add:
```ts
it("honours the league switch", () => {
  const list = [c("a", null), c("b", { messages: true, matches: true, events: true, league: false })];
  expect(recipientsFor(list, "league", null)).toEqual(["a"]);
});
```
Run `npx vitest run tests/push.test.ts` → PASS. `npx tsc --noEmit` → clean.

- [ ] **Step 6: Commit** — `git add -A && git commit -m "feat(seasons): migration 0023 — seasons, activity feed, live games, League push category"`.

---

### Task 2: `lib/season.ts` (pure, test-first)

**Files:**
- Create: `lib/season.ts`, `tests/season.test.ts`

**Interfaces:**
- Produces:
```ts
export const POINTS_WIN = 3; export const POINTS_LOSS = 1;
export interface SeasonRange { starts_on: string; ends_on: string | null }
export interface SeasonMatch { id: string; reporter_id: string; opponent_id: string; winner_id: string; played_at: string }
export interface Standing { id: string; display_name: string; played: number; wins: number; losses: number; points: number; rank: number }
export function inSeason(playedAt: string, season: SeasonRange): boolean
export function seasonStandings(matches: SeasonMatch[], members: { id: string; display_name: string }[], season: SeasonRange): Standing[]
export function seasonChampion(standings: Standing[]): Standing | null
export function daysBetween(a: string, b: string): number           // b − a in whole days, club dates
export function daysLeft(season: SeasonRange, today: string): number | null
export function seasonProgress(season: SeasonRange, today: string): number | null
export function formatClubDate(date: string): string                  // "Aug 20"
export function seasonCountdownLabel(season: SeasonRange & { status: "open" | "closed" }, today: string): string
```

- [ ] **Step 1: Failing tests** — `tests/season.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import {
  POINTS_LOSS, POINTS_WIN, daysBetween, daysLeft, formatClubDate, inSeason,
  seasonChampion, seasonCountdownLabel, seasonProgress, seasonStandings, type SeasonMatch,
} from "@/lib/season";

const season = { starts_on: "2026-08-20", ends_on: "2026-12-12" };
const members = [
  { id: "a", display_name: "Ana" }, { id: "b", display_name: "Ben" },
  { id: "c", display_name: "Cy" }, { id: "d", display_name: "Dee" },
];
let n = 0;
const game = (winner: string, loser: string, played_at = "2026-09-01"): SeasonMatch => ({
  id: `m${++n}`, reporter_id: winner, opponent_id: loser, winner_id: winner, played_at,
});

describe("inSeason", () => {
  it("is inclusive at both ends and a day earlier is out", () => {
    expect(inSeason("2026-08-20", season)).toBe(true);
    expect(inSeason("2026-12-12", season)).toBe(true);
    expect(inSeason("2026-08-19", season)).toBe(false);
    expect(inSeason("2026-12-13", season)).toBe(false);
  });
  it("has no end while ends_on is null", () => {
    expect(inSeason("2030-01-01", { starts_on: "2026-08-20", ends_on: null })).toBe(true);
  });
});

describe("seasonStandings", () => {
  it("scores 3 a win and 1 a loss and lists everyone", () => {
    const rows = seasonStandings([game("a", "b"), game("a", "c"), game("b", "c")], members, season);
    expect(rows.map((r) => [r.id, r.points, r.wins, r.losses])).toEqual([
      ["a", 2 * POINTS_WIN, 2, 0], ["b", POINTS_WIN + POINTS_LOSS, 1, 1], ["c", 2 * POINTS_LOSS, 0, 2], ["d", 0, 0, 0],
    ]);
    expect(rows.map((r) => r.rank)).toEqual([1, 2, 3, 4]);
  });
  it("ranks more wins above on equal points", () => {
    // a: 3–0 = 9, b: 2–3 = 9
    const rows = seasonStandings(
      [game("b", "a"), game("b", "a"), game("b", "c"), game("b", "c"), game("b", "c"), game("a", "d"), game("a", "d"), game("a", "d")]
        .map((m, i) => ({ ...m, id: `w${i}` })),
      members, season
    );
    // b: wins over a,a,c,c,c = 5 wins... keep it simple with a clean fixture:
    expect(rows[0].wins).toBeGreaterThanOrEqual(rows[1].wins);
  });
  it("breaks equal points and wins by head-to-head, then name", () => {
    // a and b: one win each over d, and a beat b → both 1–1 = 4 pts? no: a 2–0 = 6, b 1–1 = 4.
    // Use: a beat b, b beat c, a beat c? a 6, b 4, c 2 — no tie. Build a true tie:
    // a beat c, b beat c, a beat b, b beat a → a 2–1 = 7, b 2–1 = 7; h2h 1–1 → name.
    const rows = seasonStandings([game("a", "c"), game("b", "c"), game("a", "b"), game("b", "a")], members, season);
    expect(rows.slice(0, 2).map((r) => r.id)).toEqual(["a", "b"]);
    // Now a beat b twice, b beat d twice: a 2–0 (6) vs b 2–2 (8)… tie needs equal wins too:
    const tie = seasonStandings([game("b", "a"), game("a", "c"), game("b", "c"), game("a", "d"), game("b", "d"), game("a", "b"), game("c", "a"), game("d", "b")], members, season);
    // a: W c,d,b L b,c = 3–2 = 11; b: W a,c,d L a,d = 3–2 = 11; h2h a–b 1–1 → by name a first
    expect(tie.slice(0, 2).map((r) => r.id)).toEqual(["a", "b"]);
    const decided = seasonStandings([game("b", "a"), game("a", "c"), game("b", "c"), game("a", "d"), game("b", "d"), game("b", "a"), game("c", "a"), game("d", "b")], members, season);
    // same totals, but b beat a twice → b first
    expect(decided.slice(0, 2).map((r) => r.id)).toEqual(["b", "a"]);
  });
  it("ignores games outside the season and players who are not members", () => {
    const rows = seasonStandings([game("a", "b", "2026-08-01"), game("zz", "a")], members, season);
    expect(rows.every((r) => r.points === 0)).toBe(true);
  });
  it("names the champion as the top row with games, or null", () => {
    expect(seasonChampion(seasonStandings([], members, season))).toBeNull();
    expect(seasonChampion(seasonStandings([game("c", "a")], members, season))?.id).toBe("c");
  });
});

describe("dates", () => {
  it("counts whole days between club dates", () => {
    expect(daysBetween("2026-08-20", "2026-08-27")).toBe(7);
    expect(daysBetween("2026-12-12", "2026-12-05")).toBe(-7);
  });
  it("daysLeft, progress and the label", () => {
    expect(daysLeft(season, "2026-12-05")).toBe(7);
    expect(daysLeft({ ...season, ends_on: null }, "2026-12-05")).toBeNull();
    expect(seasonProgress(season, "2026-08-20")).toBe(0);
    expect(seasonProgress(season, "2026-12-12")).toBe(1);
    expect(seasonProgress(season, "2027-01-01")).toBe(1);
    expect(formatClubDate("2026-08-20")).toBe("Aug 20");
    const open = { ...season, status: "open" as const };
    expect(seasonCountdownLabel(open, "2026-12-05")).toBe("7 days left");
    expect(seasonCountdownLabel(open, "2026-12-11")).toBe("1 day left");
    expect(seasonCountdownLabel(open, "2026-12-12")).toBe("Ends today");
    expect(seasonCountdownLabel(open, "2026-12-20")).toBe("Ended Dec 12");
    expect(seasonCountdownLabel({ ...open, ends_on: null }, "2026-09-01")).toBe("Started Aug 20");
    expect(seasonCountdownLabel({ ...season, status: "closed" }, "2027-01-01")).toBe("Ended Dec 12");
  });
});
```
Run `npx vitest run tests/season.test.ts` → FAIL (module not found).

- [ ] **Step 2: Implement `lib/season.ts`**
```ts
// Semester seasons (docs/superpowers/specs/2026-10-06-seasons-feed-live-design.md §1).
// Standings are computed from confirmed matches by played_at — nothing is
// stamped on a match, so the board can never disagree with the record.
export const POINTS_WIN = 3;
export const POINTS_LOSS = 1;

export interface SeasonRange { starts_on: string; ends_on: string | null }
export interface SeasonMatch { id: string; reporter_id: string; opponent_id: string; winner_id: string; played_at: string }
export interface Standing { id: string; display_name: string; played: number; wins: number; losses: number; points: number; rank: number }

// Club dates are YYYY-MM-DD, so string order is date order.
export function inSeason(playedAt: string, season: SeasonRange): boolean {
  return playedAt >= season.starts_on && (season.ends_on === null || playedAt <= season.ends_on);
}

export function seasonStandings(matches: SeasonMatch[], members: { id: string; display_name: string }[], season: SeasonRange): Standing[] {
  const rows = new Map<string, Standing>();
  for (const m of members) rows.set(m.id, { id: m.id, display_name: m.display_name, played: 0, wins: 0, losses: 0, points: 0, rank: 0 });
  const inRange = matches.filter((m) => inSeason(m.played_at, season) && rows.has(m.reporter_id) && rows.has(m.opponent_id));
  for (const m of inRange) {
    for (const id of [m.reporter_id, m.opponent_id]) {
      const r = rows.get(id)!;
      r.played += 1;
      if (m.winner_id === id) { r.wins += 1; r.points += POINTS_WIN; } else { r.losses += 1; r.points += POINTS_LOSS; }
    }
  }
  const byName = (a: Standing, b: Standing) => a.display_name.localeCompare(b.display_name) || a.id.localeCompare(b.id);
  const sorted = [...rows.values()].sort((a, b) => b.points - a.points || b.wins - a.wins || byName(a, b));
  // Tied groups (same points and wins) re-sort by points earned against each other.
  const out: Standing[] = [];
  let i = 0;
  while (i < sorted.length) {
    let j = i + 1;
    while (j < sorted.length && sorted[j].points === sorted[i].points && sorted[j].wins === sorted[i].wins) j++;
    const group = sorted.slice(i, j);
    if (group.length > 1) {
      const ids = new Set(group.map((g) => g.id));
      const h2h = new Map(group.map((g) => [g.id, 0]));
      for (const m of inRange) {
        if (!ids.has(m.reporter_id) || !ids.has(m.opponent_id)) continue;
        const loser = m.winner_id === m.reporter_id ? m.opponent_id : m.reporter_id;
        h2h.set(m.winner_id, h2h.get(m.winner_id)! + POINTS_WIN);
        h2h.set(loser, h2h.get(loser)! + POINTS_LOSS);
      }
      group.sort((a, b) => h2h.get(b.id)! - h2h.get(a.id)! || byName(a, b));
    }
    out.push(...group);
    i = j;
  }
  out.forEach((r, idx) => { r.rank = idx + 1; });
  return out;
}

export function seasonChampion(standings: Standing[]): Standing | null {
  return standings.find((s) => s.played > 0) ?? null;
}

function utc(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}
export function daysBetween(a: string, b: string): number {
  return Math.round((utc(b) - utc(a)) / 86_400_000);
}
export function daysLeft(season: SeasonRange, today: string): number | null {
  return season.ends_on === null ? null : daysBetween(today, season.ends_on);
}
export function seasonProgress(season: SeasonRange, today: string): number | null {
  if (season.ends_on === null) return null;
  const total = daysBetween(season.starts_on, season.ends_on);
  if (total <= 0) return 1;
  return Math.min(1, Math.max(0, daysBetween(season.starts_on, today) / total));
}
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export function formatClubDate(date: string): string {
  const [, m, d] = date.split("-").map(Number);
  return `${MONTHS[m - 1]} ${d}`;
}
export function seasonCountdownLabel(season: SeasonRange & { status: "open" | "closed" }, today: string): string {
  if (season.status === "closed") return `Ended ${formatClubDate(season.ends_on ?? today)}`;
  const left = daysLeft(season, today);
  if (left === null) return `Started ${formatClubDate(season.starts_on)}`;
  if (left < 0) return `Ended ${formatClubDate(season.ends_on!)}`;
  if (left === 0) return "Ends today";
  return `${left} day${left === 1 ? "" : "s"} left`;
}
```
Tidy the "more wins" test into a clean fixture: a beats d three times (a 3–0 = 9), b beats c twice and loses to c three times (b 2–3 = 9) → `rows[0].id === "a"`.

- [ ] **Step 3: Run** `npx vitest run tests/season.test.ts` → PASS.
- [ ] **Step 4: Commit** — `git commit -am "feat(seasons): pure standings, tiebreaks and countdown"`.

---

### Task 3: Derived moments (`lib/activity.ts`, `lib/activity-write.ts`) and their hooks

**Files:**
- Create: `lib/activity.ts`, `lib/activity-write.ts`, `tests/activity.test.ts`
- Modify: `lib/xp-data.ts` (extract `loadXpMatches`), `app/(member)/matches/actions.ts:35-40`, `app/(member)/admin/actions.ts:134-146`, `app/(member)/tournaments/actions.ts:190-205`

**Interfaces:**
- Produces: `isStreakMark(n)`, `PASS_TOP`, `badgeMoment(before: LevelInfo, after: LevelInfo)`, `streakMoment(newestFirst: StatMatch[], winnerId)`, `passMoment(before: BoardRow[], after: BoardRow[], winnerId)`, `recordMatchMoments(service, matchId): Promise<void>`, `loadXpMatches(supabase, memberId): Promise<XpMatch[]>`.

- [ ] **Step 1: Failing tests** — `tests/activity.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { PASS_TOP, badgeMoment, isStreakMark, passMoment, streakMoment } from "@/lib/activity";
import { levelFromXp } from "@/lib/levels";
import type { StatMatch } from "@/lib/stats";

const m = (winner: string, loser: string, i: number): StatMatch => ({
  id: `m${i}`, reporter_id: winner, opponent_id: loser, winner_id: winner, reporter_score: 5, opponent_score: 3, confirmed_at: `2026-09-0${i}T00:00:00Z`,
});

describe("badgeMoment", () => {
  it("fires only when the title changes", () => {
    const rookie = levelFromXp(0);
    const stillRookie = levelFromXp(200);
    expect(badgeMoment(rookie, stillRookie)).toBeNull();
    const regular = levelFromXp(1000); // level 5 = Regular
    expect(badgeMoment(stillRookie, regular)).toEqual({ title: "Regular", level: regular.level });
    expect(badgeMoment(regular, regular)).toBeNull();
  });
});

describe("streakMoment", () => {
  it("marks 3, 5, 10 and every 5 after", () => {
    expect([1, 2, 3, 4, 5, 6, 9, 10, 15, 20, 21].map(isStreakMark)).toEqual([false, false, true, false, true, false, false, true, true, true, false]);
  });
  it("reads the current win streak for the winner, newest first", () => {
    const three = [m("a", "b", 3), m("a", "c", 2), m("a", "d", 1)];
    expect(streakMoment(three, "a")).toEqual({ length: 3 });
    expect(streakMoment([m("a", "b", 4), ...three], "a")).toBeNull(); // 4
    expect(streakMoment([m("b", "a", 4), ...three], "a")).toBeNull(); // streak broken
  });
});

describe("passMoment", () => {
  const board = (ratings: Record<string, number>) => Object.entries(ratings).map(([id, rating]) => ({ id, rating }));
  it("names the highest player jumped and the new rank", () => {
    const before = board({ a: 600, b: 550, c: 540, d: 500 });
    const after = board({ a: 600, b: 550, c: 540, d: 560 });
    expect(passMoment(before, after, "d")).toEqual({ rank: 2, otherId: "b" });
  });
  it("is null when already on top, when nobody was jumped, or outside the top 10", () => {
    expect(passMoment(board({ a: 600, b: 500 }), board({ a: 620, b: 500 }), "a")).toBeNull();
    expect(passMoment(board({ a: 600, b: 500 }), board({ a: 600, b: 520 }), "b")).toBeNull();
    const big: Record<string, number> = {};
    for (let i = 0; i < PASS_TOP + 2; i++) big[`p${i}`] = 1000 - i * 10;
    const after = { ...big, [`p${PASS_TOP + 1}`]: big[`p${PASS_TOP}`] + 1 }; // climbs to #11
    expect(passMoment(board(big), board(after), `p${PASS_TOP + 1}`)).toBeNull();
  });
});
```
Run → FAIL.

- [ ] **Step 2: Implement `lib/activity.ts`**
```ts
// Derived feed moments (spec §2): computed once, right after a confirmation,
// from the same pure inputs the profile uses, then stored with the match that
// caused them so a void takes them away again.
import { TITLES, type LevelInfo, type TitleName } from "@/lib/levels";
import { currentStreak, type StatMatch } from "@/lib/stats";

export const PASS_TOP = 10;
export interface BoardRow { id: string; rating: number }

export function isStreakMark(n: number): boolean {
  return n === 3 || n === 5 || (n >= 10 && n % 5 === 0);
}

const titleIndex = (t: TitleName) => TITLES.findIndex((x) => x.name === t);

export function badgeMoment(before: LevelInfo, after: LevelInfo): { title: TitleName; level: number } | null {
  if (titleIndex(after.title) <= titleIndex(before.title)) return null;
  return { title: after.title, level: after.level };
}

export function streakMoment(newestFirst: StatMatch[], winnerId: string): { length: number } | null {
  const s = currentStreak(newestFirst, winnerId);
  if (!s || s.kind !== "W" || !isStreakMark(s.length)) return null;
  return { length: s.length };
}

const order = (board: BoardRow[]) => [...board].sort((a, b) => b.rating - a.rating || a.id.localeCompare(b.id)).map((r) => r.id);

export function passMoment(before: BoardRow[], after: BoardRow[], winnerId: string): { rank: number; otherId: string } | null {
  const b = order(before);
  const a = order(after);
  const rb = b.indexOf(winnerId) + 1;
  const ra = a.indexOf(winnerId) + 1;
  if (rb === 0 || ra === 0 || ra >= rb || ra > PASS_TOP) return null;
  const belowNow = new Set(a.slice(ra));
  const jumped = b.slice(0, rb - 1).filter((id) => belowNow.has(id));
  if (jumped.length === 0) return null;
  return { rank: ra, otherId: jumped[0] };
}
```
Run tests → PASS. Commit `feat(feed): pure badge, streak and pass moments`.

- [ ] **Step 3: Extract `loadXpMatches`** in `lib/xp-data.ts`: move the `fetchAllPages` + finals block of `loadXp` into
```ts
export async function loadXpMatches(supabase: SupabaseClient, memberId: string): Promise<XpMatch[]> { /* the existing body up to `const matches` */ return matches; }
export async function loadXp(supabase, memberId) {
  const matches = await loadXpMatches(supabase, memberId);
  const xp = xpFromMatches(memberId, matches, clubWeekOf);
  return { xp, level: levelFromXp(xp.total) };
}
```
`npx vitest run tests/levels.test.ts` and `npx tsc --noEmit` still clean.

- [ ] **Step 4: `lib/activity-write.ts`** (server only):
```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import { badgeMoment, passMoment, streakMoment, type BoardRow } from "@/lib/activity";
import { clubWeekOf } from "@/lib/events";
import { levelFromXp, xpFromMatches } from "@/lib/levels";
import { fetchAllPages } from "@/lib/paging";
import type { StatMatch } from "@/lib/stats";
import { loadXpMatches } from "@/lib/xp-data";

// Badge / streak / pass rows for a match that was just confirmed. Service role
// (activity has no client write policy). Runs after the confirmation is saved
// and never throws: a missing moment must not fail a result.
export async function recordMatchMoments(service: SupabaseClient, matchId: string): Promise<void> {
  try {
    const { data: m } = await service
      .from("matches")
      .select("id, reporter_id, opponent_id, winner_id, status")
      .eq("id", matchId)
      .single();
    if (!m || m.status !== "confirmed") return;
    const winner = m.winner_id as string;
    const rows: Record<string, unknown>[] = [];

    for (const pid of [m.reporter_id as string, m.opponent_id as string]) {
      const all = await loadXpMatches(service, pid);
      const after = levelFromXp(xpFromMatches(pid, all, clubWeekOf).total);
      const before = levelFromXp(xpFromMatches(pid, all.filter((x) => x.id !== matchId), clubWeekOf).total);
      const badge = badgeMoment(before, after);
      if (badge) rows.push({ kind: "badge", actor_id: pid, match_id: matchId, data: badge });
    }

    const { data: hist } = await service
      .from("matches")
      .select("id, reporter_id, opponent_id, winner_id, reporter_score, opponent_score, confirmed_at")
      .eq("status", "confirmed")
      .or(`reporter_id.eq.${winner},opponent_id.eq.${winner}`)
      .order("confirmed_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(60);
    const streak = streakMoment((hist ?? []) as StatMatch[], winner);
    if (streak) rows.push({ kind: "streak", actor_id: winner, match_id: matchId, data: streak });

    const board = await fetchAllPages<BoardRow>((from, to) =>
      service.from("profiles").select("id, rating").eq("status", "approved").order("id").range(from, to).then(({ data }) => (data ?? []) as BoardRow[])
    );
    const { data: hrows } = await service.from("rating_history").select("profile_id, rating_before").eq("match_id", matchId);
    const beforeRating = new Map((hrows ?? []).map((h) => [h.profile_id as string, h.rating_before as number]));
    const before = board.map((p) => (beforeRating.has(p.id) ? { id: p.id, rating: beforeRating.get(p.id)! } : p));
    const pass = passMoment(before, board, winner);
    if (pass) rows.push({ kind: "pass", actor_id: winner, other_id: pass.otherId, match_id: matchId, data: { rank: pass.rank } });

    if (rows.length > 0) {
      const { error } = await service.from("activity").insert(rows);
      if (error) console.warn("activity: insert failed", error.message);
    }
  } catch (err) {
    console.warn("activity: moments failed", err);
  }
}
```

- [ ] **Step 5: Hooks** — `app/(member)/matches/actions.ts` `confirmMatch`: right after the `try { await confirmPendingMatch(...) }` block add `await recordMatchMoments(service, match.id);`. `app/(member)/admin/actions.ts` `adminResolveMatch`: after the successful `confirmPendingMatch` add `await recordMatchMoments(service, matchId);`. `app/(member)/tournaments/actions.ts` `recordResult`: after `if (error) fail(error.message);` add `await recordMatchMoments(service, matchId);`.

- [ ] **Step 6:** `npx tsc --noEmit` clean; commit `feat(feed): record badge, streak and pass moments after every confirmation`.

---

### Task 4: Feed copy, `ActivityRow`, Home feed

**Files:**
- Create: `lib/feed.ts`, `tests/feed.test.ts`, `components/activity-row.tsx`
- Modify: `lib/bracket.ts` (export `roundName`), `app/(member)/tournaments/[id]/page.tsx:22-30` (import it), `app/(member)/page.tsx` (Recent section + query)

**Interfaces:**
- Produces: `FeedPerson`, `FeedMatch`, `FeedRow`, `one<T>()`, `feedStamp(createdAt, now)`, `describeActivity(row, viewerId): { title: string; meta: string | null; href: string | null }`, `FEED_SELECT` (the PostgREST select string), `roundName(index, count)`.

- [ ] **Step 1: Move `roundName`** into `lib/bracket.ts` as an export (same body) and import it in the tournament page (delete the local copy). `npx tsc --noEmit` clean.

- [ ] **Step 2: Failing tests** — `tests/feed.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { describeActivity, feedStamp, type FeedRow } from "@/lib/feed";

const p = (id: string, name: string, school = "GSU") => ({ id, display_name: name, avatar_url: null, ball: null, schools: { short_name: school } });
const base = { id: "x", match_id: null, tournament_id: null, season_id: null, other_id: null, match: null, created_at: "2026-10-06T15:00:00Z" };
const row = (over: Partial<FeedRow>): FeedRow => ({ ...base, kind: "badge", actor_id: "a", actor: p("a", "Maya Chen"), other: null, data: {}, ...over } as FeedRow);

describe("feedStamp", () => {
  const now = new Date("2026-10-06T15:30:00Z");
  it("reads just now, minutes, hours, yesterday, then a date", () => {
    expect(feedStamp("2026-10-06T15:29:40Z", now)).toBe("Just now");
    expect(feedStamp("2026-10-06T15:10:00Z", now)).toBe("20m");
    expect(feedStamp("2026-10-06T12:00:00Z", now)).toBe("3h");
    expect(feedStamp("2026-10-05T12:00:00Z", now)).toBe("Yesterday");
    expect(feedStamp("2026-10-01T12:00:00Z", now)).toBe("Oct 1");
  });
});

describe("describeActivity", () => {
  it("badge", () => {
    const d = describeActivity(row({ data: { title: "Shark", level: 10 } }), "z");
    expect(d.title).toBe("Maya is now a Shark");
    expect(d.meta).toBe("Level 10 · badge unlocked");
    expect(d.href).toBe("/players/a");
    expect(describeActivity(row({ data: { title: "Shark", level: 10 } }), "a").title).toBe("You are now a Shark");
  });
  it("streak and pass use first names and You", () => {
    expect(describeActivity(row({ kind: "streak", data: { length: 5 } }), "z").title).toBe("Maya is on a 5-game win streak");
    expect(describeActivity(row({ kind: "streak", data: { length: 5 } }), "a").title).toBe("You're on a 5-game win streak");
    const pass = row({ kind: "pass", other_id: "b", other: p("b", "Dennis Ro"), data: { rank: 4 } });
    expect(describeActivity(pass, "z").title).toBe("Maya passed Dennis for #4");
    expect(describeActivity(pass, "b").title).toBe("Maya passed you for #4");
    expect(describeActivity(pass, "z").href).toBe("/leaderboard?tab=players");
  });
  it("cups", () => {
    expect(describeActivity(row({ kind: "cup_started", actor: null, tournament_id: "t", data: { name: "Fall Cup", players: 8, race_to: 5 } }), "z")).toEqual({ title: "Fall Cup is under way", meta: "8 players · race to 5", href: "/tournaments/t" });
    expect(describeActivity(row({ kind: "cup_round", actor: null, tournament_id: "t", data: { name: "Fall Cup", round: 2, rounds: 3 } }), "z").title).toBe("Fall Cup · Semifinals complete");
    expect(describeActivity(row({ kind: "cup_won", tournament_id: "t", data: { name: "Fall Cup" } }), "z")).toEqual({ title: "Maya won the Fall Cup", meta: "Champion", href: "/tournaments/t" });
  });
  it("seasons and joins", () => {
    expect(describeActivity(row({ kind: "season_opened", actor: null, season_id: "s", data: { name: "Fall 2026", ends_on: "2026-12-12" } }), "z")).toEqual({ title: "Fall 2026 has begun", meta: "3 pts a win, 1 a loss · ends Dec 12", href: "/leaderboard?tab=season" });
    expect(describeActivity(row({ kind: "season_week_left", actor: null, season_id: "s", data: { name: "Fall 2026", leader_name: "Dennis", leader_points: 42 } }), "z").meta).toBe("Dennis leads with 42 pts");
    expect(describeActivity(row({ kind: "season_closed", season_id: "s", data: { name: "Fall 2026", points: 48 } }), "z")).toEqual({ title: "Maya is the Fall 2026 champion", meta: "48 pts · season closed", href: "/leaderboard?tab=season&season=s" });
    expect(describeActivity(row({ kind: "member_joined" }), "z")).toEqual({ title: "Maya joined from GSU", meta: null, href: "/players/a" });
  });
});
```
(`season_week_left` data carries `leader_name` as well as `leader_id`, written by the tick in Task 10.) Run → FAIL.

- [ ] **Step 3: Implement `lib/feed.ts`**
```ts
// The activity feed, pure half (spec §2): the select shape, the words, the
// stamp. Rendering lives in components/activity-row.tsx.
import { roundName } from "@/lib/bracket";
import { CLUB_TIMEZONE, clubDateOf } from "@/lib/events";
import { formatClubDate } from "@/lib/season";
import type { ActivityKind } from "@/lib/types";

export interface FeedPerson { id: string; display_name: string; avatar_url: string | null; ball: number | null; schools?: { short_name: string } | { short_name: string }[] | null }
export interface FeedMatch {
  id: string; reporter_id: string; opponent_id: string; winner_id: string; reporter_score: number; opponent_score: number;
  game_type: string; played_at: string; race_to: number | null; spot: number; spot_to: string | null;
  rating_delta_reporter: number | null; rating_delta_opponent: number | null;
  reporter: FeedPerson | FeedPerson[] | null; opponent: FeedPerson | FeedPerson[] | null;
}
export interface FeedRow {
  id: string; kind: ActivityKind; actor_id: string | null; other_id: string | null; match_id: string | null;
  tournament_id: string | null; season_id: string | null; data: Record<string, unknown>; created_at: string;
  actor: FeedPerson | FeedPerson[] | null; other: FeedPerson | FeedPerson[] | null; match: FeedMatch | FeedMatch[] | null;
}

const PERSON = "id, display_name, avatar_url, ball, schools(short_name)";
export const FEED_SELECT =
  `id, kind, actor_id, other_id, match_id, tournament_id, season_id, data, created_at, ` +
  `actor:profiles!activity_actor_id_fkey(${PERSON}), other:profiles!activity_other_id_fkey(${PERSON}), ` +
  `match:matches(id, reporter_id, opponent_id, winner_id, reporter_score, opponent_score, game_type, played_at, race_to, spot, spot_to, rating_delta_reporter, rating_delta_opponent, ` +
  `reporter:profiles!matches_reporter_id_fkey(${PERSON}), opponent:profiles!matches_opponent_id_fkey(${PERSON}))`;

export function one<T>(v: T | T[] | null | undefined): T | null {
  if (v == null) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}
export function schoolOf(p: FeedPerson | null): string | null {
  const s = one(p?.schools);
  return s?.short_name ?? null;
}

export function feedStamp(createdAt: string, now: Date): string {
  const ms = now.getTime() - Date.parse(createdAt);
  if (ms < 60_000) return "Just now";
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h`;
  const day = clubDateOf(createdAt);
  const yesterday = clubDateOf(new Date(now.getTime() - 86_400_000).toISOString());
  if (day === yesterday) return "Yesterday";
  return new Date(createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: CLUB_TIMEZONE });
}

const first = (p: FeedPerson | null) => (p?.display_name ?? "Member").trim().split(/\s+/)[0] || "Member";
const str = (v: unknown, fallback = "") => (typeof v === "string" ? v : fallback);
const num = (v: unknown, fallback = 0) => (typeof v === "number" ? v : fallback);

export function describeActivity(row: FeedRow, viewerId: string): { title: string; meta: string | null; href: string | null } {
  const actor = one(row.actor);
  const other = one(row.other);
  const me = actor?.id === viewerId;
  const you = me ? "You" : first(actor);
  const d = row.data ?? {};
  switch (row.kind) {
    case "badge":
      return { title: `${you} ${me ? "are" : "is"} now a ${str(d.title)}`, meta: `Level ${num(d.level)} · badge unlocked`, href: actor ? `/players/${actor.id}` : null };
    case "streak":
      return { title: `${me ? "You're" : `${first(actor)} is`} on a ${num(d.length)}-game win streak`, meta: "Rating ladder", href: actor ? `/players/${actor.id}` : null };
    case "pass": {
      const target = other?.id === viewerId ? "you" : first(other);
      return { title: `${you} passed ${target} for #${num(d.rank)}`, meta: "Rating ladder", href: "/leaderboard?tab=players" };
    }
    case "cup_started":
      return { title: `${str(d.name, "The cup")} is under way`, meta: `${num(d.players)} players · race to ${num(d.race_to)}`, href: row.tournament_id ? `/tournaments/${row.tournament_id}` : null };
    case "cup_round":
      return { title: `${str(d.name, "The cup")} · ${roundName(num(d.round, 1) - 1, num(d.rounds, 1))} complete`, meta: null, href: row.tournament_id ? `/tournaments/${row.tournament_id}` : null };
    case "cup_won":
      return { title: `${you} won the ${str(d.name, "cup")}`, meta: "Champion", href: row.tournament_id ? `/tournaments/${row.tournament_id}` : null };
    case "season_opened": {
      const ends = str(d.ends_on);
      return { title: `${str(d.name, "The season")} has begun`, meta: `3 pts a win, 1 a loss${ends ? ` · ends ${formatClubDate(ends)}` : ""}`, href: "/leaderboard?tab=season" };
    }
    case "season_week_left":
      return { title: `One week left in ${str(d.name, "the season")}`, meta: d.leader_name ? `${str(d.leader_name)} leads with ${num(d.leader_points)} pts` : null, href: "/leaderboard?tab=season" };
    case "season_closed":
      return { title: `${you} ${me ? "are" : "is"} the ${str(d.name)} champion`, meta: `${num(d.points)} pts · season closed`, href: row.season_id ? `/leaderboard?tab=season&season=${row.season_id}` : "/leaderboard?tab=season" };
    case "member_joined": {
      const school = schoolOf(actor);
      return { title: `${you} joined${school ? ` from ${school}` : ""}`, meta: null, href: actor ? `/players/${actor.id}` : null };
    }
    case "match":
    default:
      return { title: "", meta: null, href: null };
  }
}
```
Run tests → PASS. Commit `feat(feed): copy and stamps`.

- [ ] **Step 4: `components/activity-row.tsx`** (server component)
```tsx
import Link from "next/link";
import { Flame, Trophy, Flag, UserPlus, Medal } from "lucide-react";
import { Avatar } from "@/components/avatar";
import { ListRow } from "@/components/list-row";
import { MatchRow } from "@/components/match-row";
import { TitleBadge } from "@/components/title-badge";
import { describeActivity, feedStamp, one, type FeedRow } from "@/lib/feed";
import { winnerDelta } from "@/lib/form";
import { GAME_LABEL } from "@/lib/identity";
import type { TitleName } from "@/lib/levels";
import { formatShort } from "@/lib/race";
import { labelPlayedDate } from "@/lib/stats";

// One feed row. A confirmed result is the familiar MatchRow; every other
// moment is a hairline ListRow with a mark on the left and the stamp on the right.
export function ActivityRow({ row, viewerId, today, now, caption }: { row: FeedRow; viewerId: string; today: string; now: Date; caption?: React.ReactNode }) {
  if (row.kind === "match") {
    const m = one(row.match);
    if (!m) return null;
    const reporter = one(m.reporter);
    const opponent = one(m.opponent);
    const reporterWon = m.winner_id === reporter?.id;
    return (
      <MatchRow
        winner={reporterWon ? reporter : opponent}
        loser={reporterWon ? opponent : reporter}
        winnerScore={Math.max(m.reporter_score, m.opponent_score)}
        loserScore={Math.min(m.reporter_score, m.opponent_score)}
        delta={winnerDelta(m)}
        viewerId={viewerId}
        perspectiveId={viewerId}
        gameType={GAME_LABEL[m.game_type] ?? m.game_type}
        format={formatShort(m.race_to, m.spot)}
        meta={labelPlayedDate(m.played_at, today)}
        caption={caption}
      />
    );
  }
  const { title, meta, href } = describeActivity(row, viewerId);
  const actor = one(row.actor);
  const stamp = feedStamp(row.created_at, now);
  return (
    <ListRow
      href={href ?? undefined}
      leading={<Mark row={row} actor={actor} />}
      title={title}
      meta={meta ?? undefined}
      trailing={<span className="text-muted-foreground text-[12px]">{stamp}</span>}
    />
  );
}

function Mark({ row, actor }: { row: FeedRow; actor: ReturnType<typeof one<NonNullable<FeedRow["actor"]> extends (infer T)[] ? T : never>> }) {
  const icon = "flex size-10 shrink-0 items-center justify-center rounded-full bg-secondary shadow-[0_0_0_1px_var(--hairline-strong)]";
  switch (row.kind) {
    case "badge":
      return (
        <span className="relative flex">
          <Avatar person={actor ?? { id: "unknown", display_name: null }} size="md" />
          <TitleBadge title={String(row.data.title) as TitleName} size={20} decorative className="ring-background absolute -right-1.5 -bottom-1.5 rounded-full ring-2" />
        </span>
      );
    case "streak":
      return <span className="relative flex"><Avatar person={actor ?? { id: "unknown", display_name: null }} size="md" /><Flame className="text-brass ring-background absolute -right-1.5 -bottom-1.5 size-[18px] rounded-full bg-background ring-2" strokeWidth={2} /></span>;
    case "pass":
    case "member_joined":
      return <Avatar person={actor ?? { id: "unknown", display_name: null }} size="md" />;
    case "cup_won":
    case "season_closed":
      return <Avatar person={actor ?? { id: "unknown", display_name: null }} size="md" ring="var(--gold)" />;
    case "cup_started":
    case "cup_round":
      return <span className={icon}><Trophy className="size-[18px]" strokeWidth={1.7} /></span>;
    case "season_opened":
    case "season_week_left":
      return <span className={icon}><Flag className="size-[18px]" strokeWidth={1.7} /></span>;
    default:
      return <span className={icon}><Medal className="size-[18px]" strokeWidth={1.7} /></span>;
  }
}
```
(Keep `Mark`'s `actor` type simple: `actor: FeedPerson | null`; import `FeedPerson`. Drop `UserPlus` if unused.)

- [ ] **Step 5: Home** (`app/(member)/page.tsx`): replace the `recent` query with
```ts
supabase.from("activity").select(FEED_SELECT).order("created_at", { ascending: false }).limit(30),
```
(rename the destructured variable to `feed`). Keep the "Confirm results" / "Waiting on" sections. Replace the Recent section body with:
```tsx
<section className="flex flex-col gap-1.5">
  <SectionHeading action={{ href: `/players/${user.id}`, label: "All games" }}>Recent</SectionHeading>
  {(feed ?? []).length === 0 && ( /* unchanged empty state */ )}
  <ShowMore
    label="Show {hidden} more"
    items={((feed ?? []) as FeedRow[]).map((row) => (
      <ActivityRow key={row.id} row={row} viewerId={user.id} today={today} now={now} caption={row.match_id ? xpCaption(row.match_id, xp) : undefined} />
    ))}
  />
</section>
```
Remove imports that become unused (`MatchRow`, `winnerDelta`, `formatShort`, `labelPlayedDate`, `GAME_LABEL` if only used there — the Confirm section still uses `GAME_LABEL` and `formatLabel`).

- [ ] **Step 6:** `npm run lint`, `npx tsc --noEmit`, `npx vitest run --exclude "tests/*.integration.test.ts"` → clean. Commit `feat(feed): Home shows the league activity feed`.

---

### Task 5: Season push payloads

**Files:**
- Modify: `lib/push.ts` (append), `tests/push.test.ts`

- [ ] **Step 1: Tests**
```ts
it("season payloads", () => {
  expect(seasonOpenedPayload({ seasonId: "s", name: "Fall 2026", endsOn: "2026-12-12" })).toEqual({
    title: "Fall 2026 has begun", body: "3 points a win, 1 a loss. Ends Dec 12.", url: "/leaderboard?tab=season", tag: "season:s", category: "league",
  });
  expect(seasonOpenedPayload({ seasonId: "s", name: "Fall 2026", endsOn: null }).body).toBe("3 points a win, 1 a loss. No end date yet.");
  expect(seasonWeekLeftPayload({ seasonId: "s", name: "Fall 2026", leaderName: "Dennis Ro", leaderPoints: 42 }).body).toBe("Dennis leads with 42 pts. Every game counts.");
  expect(seasonWeekLeftPayload({ seasonId: "s", name: "Fall 2026", leaderName: null, leaderPoints: 0 }).body).toBe("Every game counts.");
  expect(seasonClosedPayload({ seasonId: "s", name: "Fall 2026", championName: "Dennis Ro", points: 48 })).toEqual({
    title: "Fall 2026 is in the books", body: "Dennis is champion with 48 pts.", url: "/leaderboard?tab=season&season=s", tag: "season:s", category: "league",
  });
  expect(seasonClosedPayload({ seasonId: "s", name: "Fall 2026", championName: null, points: 0 }).body).toBe("No games were played.");
});
```
- [ ] **Step 2: Implement** in `lib/push.ts` (import `formatClubDate` from `@/lib/season`):
```ts
export function seasonOpenedPayload(input: { seasonId: string; name: string; endsOn: string | null }): PushPayload {
  return { title: `${input.name} has begun`, body: `3 points a win, 1 a loss. ${input.endsOn ? `Ends ${formatClubDate(input.endsOn)}.` : "No end date yet."}`, url: "/leaderboard?tab=season", tag: `season:${input.seasonId}`, category: "league" };
}
export function seasonWeekLeftPayload(input: { seasonId: string; name: string; leaderName: string | null; leaderPoints: number }): PushPayload {
  const lead = input.leaderName ? `${first(input.leaderName)} leads with ${input.leaderPoints} pts. ` : "";
  return { title: `One week left in ${input.name}`, body: `${lead}Every game counts.`, url: "/leaderboard?tab=season", tag: `season:${input.seasonId}`, category: "league" };
}
export function seasonClosedPayload(input: { seasonId: string; name: string; championName: string | null; points: number }): PushPayload {
  return { title: `${input.name} is in the books`, body: input.championName ? `${first(input.championName)} is champion with ${input.points} pts.` : "No games were played.", url: `/leaderboard?tab=season&season=${input.seasonId}`, tag: `season:${input.seasonId}`, category: "league" };
}
```
- [ ] **Step 3:** tests PASS; commit `feat(push): season payloads`.

---

### Task 6: Season data loader, Admin season card and actions

**Files:**
- Create: `lib/season-data.ts`, `app/(member)/admin/end-season-button.tsx`
- Modify: `app/(member)/admin/actions.ts` (append), `app/(member)/admin/page.tsx` (new card above Schools)

**Interfaces:**
- Produces: `loadOpenSeason(supabase): Promise<Season | null>`, `loadSeasonById(supabase, id)`, `loadSeasonStandings(supabase, season): Promise<Standing[]>`, `loadSeasons(supabase): Promise<Season[]>` (newest first); actions `openSeason(formData)`, `endSeason(formData)`.

- [ ] **Step 1: `lib/season-data.ts`**
```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAllPages } from "@/lib/paging";
import { seasonStandings, type SeasonMatch, type Standing } from "@/lib/season";
import type { Season } from "@/lib/types";

const COLS = "id, name, starts_on, ends_on, status, champion_id, created_by, created_at, closed_at";

export async function loadOpenSeason(supabase: SupabaseClient): Promise<Season | null> {
  const { data } = await supabase.from("seasons").select(COLS).eq("status", "open").maybeSingle();
  return (data as Season | null) ?? null;
}
export async function loadSeasonById(supabase: SupabaseClient, id: string): Promise<Season | null> {
  const { data } = await supabase.from("seasons").select(COLS).eq("id", id).maybeSingle();
  return (data as Season | null) ?? null;
}
export async function loadSeasons(supabase: SupabaseClient): Promise<Season[]> {
  const { data } = await supabase.from("seasons").select(COLS).order("starts_on", { ascending: false });
  return (data ?? []) as Season[];
}
// Every approved member and every confirmed match played inside the season.
export async function loadSeasonStandings(supabase: SupabaseClient, season: Season): Promise<Standing[]> {
  let q = supabase.from("matches").select("id, reporter_id, opponent_id, winner_id, played_at").eq("status", "confirmed").gte("played_at", season.starts_on);
  if (season.ends_on) q = q.lte("played_at", season.ends_on);
  const [matches, members] = await Promise.all([
    fetchAllPages<SeasonMatch>((from, to) => q.order("played_at").order("id").range(from, to).then(({ data }) => (data ?? []) as SeasonMatch[])),
    fetchAllPages<{ id: string; display_name: string }>((from, to) =>
      supabase.from("profiles").select("id, display_name").eq("status", "approved").order("id").range(from, to).then(({ data }) => data ?? [])
    ),
  ]);
  return seasonStandings(matches, members, season);
}
```
(Build the query inside the page callback so each page gets a fresh builder: wrap `q` construction in a function `base()`.)

- [ ] **Step 2: Actions** — append to `app/(member)/admin/actions.ts`:
```ts
export async function openSeason(formData: FormData) {
  const { supabase, user } = await requireAdmin();
  const name = String(formData.get("name") ?? "").trim();
  const startsOn = String(formData.get("starts_on") ?? "");
  const endsOnRaw = String(formData.get("ends_on") ?? "").trim();
  if (!name) redirect(`/admin?error=${encodeURIComponent("A season needs a name.")}`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startsOn)) redirect(`/admin?error=${encodeURIComponent("Pick a start date.")}`);
  if (endsOnRaw && !/^\d{4}-\d{2}-\d{2}$/.test(endsOnRaw)) redirect(`/admin?error=${encodeURIComponent("That end date isn't valid.")}`);
  const { data: id, error } = await supabase.rpc("open_season", { p_name: name, p_starts_on: startsOn, p_ends_on: endsOnRaw || null });
  if (error) redirect(`/admin?error=${encodeURIComponent(error.message)}`);
  await notifyAllMembers(createServiceClient(), { category: "league", excludeId: user.id, payload: seasonOpenedPayload({ seasonId: String(id), name, endsOn: endsOnRaw || null }) });
  revalidatePath("/"); revalidatePath("/admin"); revalidatePath("/leaderboard");
  redirect(`/admin?message=${encodeURIComponent(`${name} is open.`)}`);
}

export async function endSeason(formData: FormData) {
  const { supabase, user } = await requireAdmin();
  const seasonId = String(formData.get("season_id") ?? "");
  const season = await loadSeasonById(supabase, seasonId);
  if (!season || season.status !== "open") redirect(`/admin?error=${encodeURIComponent("That season is not open.")}`);
  const standings = await loadSeasonStandings(supabase, season);
  const champion = seasonChampion(standings);
  const podium = standings.filter((s) => s.played > 0).slice(0, 3).map((s) => ({ id: s.id, points: s.points }));
  const { error } = await supabase.rpc("close_season", { p_season_id: seasonId, p_champion_id: champion?.id ?? null, p_today: clubDateOf(new Date().toISOString()), p_podium: podium });
  if (error) redirect(`/admin?error=${encodeURIComponent(error.message)}`);
  await notifyAllMembers(createServiceClient(), { category: "league", excludeId: user.id, payload: seasonClosedPayload({ seasonId, name: season.name, championName: champion?.display_name ?? null, points: champion?.points ?? 0 }) });
  revalidatePath("/"); revalidatePath("/admin"); revalidatePath("/leaderboard");
  redirect(`/admin?message=${encodeURIComponent(champion ? `${season.name} closed — ${champion.display_name} is champion.` : `${season.name} closed.`)}`);
}
```
Imports: `clubDateOf` from `@/lib/events`, `seasonChampion` from `@/lib/season`, `loadSeasonById, loadSeasonStandings` from `@/lib/season-data`, `seasonClosedPayload, seasonOpenedPayload` from `@/lib/push`, `notifyAllMembers` from `@/lib/push-send`.

- [ ] **Step 3: `end-season-button.tsx`** (client, same shape as `DeleteEventButton`):
```tsx
"use client";
import { Button } from "@/components/ui/button";
export function EndSeasonButton({ name, pending }: { name: string; pending: number }) {
  return (
    <Button type="submit" variant="outline" onClick={(e) => {
      const warn = pending > 0 ? ` ${pending} report${pending === 1 ? "" : "s"} still await confirmation and won't count until confirmed.` : "";
      if (!window.confirm(`End ${name}? This crowns the champion and posts the final standings.${warn}`)) e.preventDefault();
    }}>End season</Button>
  );
}
```

- [ ] **Step 4: Admin card** — in `page.tsx`, load `const season = await loadOpenSeason(supabase)`; if open, `standings = await loadSeasonStandings(supabase, season)` and the pending count: `supabase.from("matches").select("id", { count: "exact", head: true }).eq("status", "pending").gte("played_at", season.starts_on)` (+ `.lte` when `ends_on`). Render above Schools:
```tsx
<Card>
  <CardHeader><SectionLabel>Season</SectionLabel></CardHeader>
  <CardContent className="flex flex-col gap-3">
    {season ? (
      <>
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-0.5">
            <span className="text-[16px] font-medium">{season.name}</span>
            <span className="text-muted-foreground text-[12px]">
              Started {formatClubDate(season.starts_on)}{season.ends_on ? ` · ends ${formatClubDate(season.ends_on)}` : " · no end date"} · {seasonCountdownLabel(season, today)}
            </span>
            <span className="text-muted-foreground text-[12px]">
              {onBoard} on the board{leader ? ` · ${leader.display_name} leads with ${leader.points} pts` : ""}{pendingCount > 0 ? ` · ${pendingCount} awaiting confirmation` : ""}
            </span>
          </div>
          <form action={endSeason}><input type="hidden" name="season_id" value={season.id} /><EndSeasonButton name={season.name} pending={pendingCount} /></form>
        </div>
        <p className="text-muted-foreground text-xs">Ending crowns the leader, posts the final standings to Home and tells every member. Ratings and XP are untouched.</p>
      </>
    ) : (
      <form action={openSeason} className="flex flex-col gap-3">
        <p className="text-muted-foreground text-sm">No season is running. Open one and every confirmed game earns 3 points for a win and 1 for a loss until you end it.</p>
        <div className="grid gap-3 sm:grid-cols-[2fr_1fr_1fr]">
          <Input name="name" defaultValue={seasonLabel(today)} aria-label="Season name" required />
          <Input type="date" name="starts_on" defaultValue={today} aria-label="Start date" required />
          <Input type="date" name="ends_on" aria-label="Planned end (optional)" />
        </div>
        <SubmitButton size="sm" pendingChildren="Opening…">Open season</SubmitButton>
      </form>
    )}
  </CardContent>
</Card>
```
where `onBoard = standings.filter(s => s.played > 0).length`, `leader = seasonChampion(standings)`, `today = clubDateOf(new Date().toISOString())`.

- [ ] **Step 5:** lint/tsc clean; commit `feat(seasons): admin opens and ends a season`.

---

### Task 7: Leaderboard Season tab

**Files:**
- Modify: `app/(member)/leaderboard/page.tsx`

- [ ] **Step 1:** Parse `tab` as `"season" | "players" | "schools"` and `season` id from search params. Load `openSeason = await loadOpenSeason(supabase)` and `seasons = await loadSeasons(supabase)` in the `Promise.all`. `const tab = rawTab === "schools" ? "schools" : rawTab === "players" ? "players" : rawTab === "season" ? "season" : openSeason ? "season" : "players";` The viewed season: `const viewed = rawSeason ? seasons.find(s => s.id === rawSeason) ?? null : openSeason;` and `standings = viewed ? await loadSeasonStandings(supabase, viewed) : []`.

- [ ] **Step 2:** Tabs: `[{ value: "season", label: "Season", href: "/leaderboard?tab=season" }, { value: "players", label: "Players", href: scope === "school" ? "/leaderboard?tab=players&scope=school" : "/leaderboard?tab=players" }, { value: "schools", label: "Schools", href: "/leaderboard?tab=schools" }]`. The Players tab's Segmented hrefs gain `tab=players`. `PageHeader overline` becomes `openSeason?.name ?? seasonLabel(today)`.

- [ ] **Step 3:** Season tab body:
```tsx
{tab === "season" && (
  <div className="flex flex-col gap-6">
    {!viewed && (
      <p className="text-muted-foreground py-10 text-center text-sm">No season running yet.{isAdmin && <> <Link href="/admin" className="text-brass">Open one from Admin.</Link></>}</p>
    )}
    {viewed && (
      <>
        <div className="flex flex-col gap-2.5">
          <div className="flex items-baseline justify-between gap-3">
            <span className="eyebrow">{viewed.name}</span>
            <span className="text-muted-foreground text-[12px]">{seasonCountdownLabel(viewed, today)}</span>
          </div>
          {progress !== null && (
            <div className="bg-hairline-divider h-0.5"><div className="bg-brass h-full" style={{ width: `${Math.round(progress * 100)}%` }} /></div>
          )}
          {viewed.status === "closed" && champion && (
            <ListRow leading={<Avatar person={champion} size="md" ring="var(--gold)" />} title={`${champion.display_name} · champion`} meta={`${champion.points} pts`} href={`/players/${champion.id}`} />
          )}
        </div>
        <ol aria-label="Season standings" className="flex flex-col">
          {standings.map((s) => { const p = peopleById[s.id]; const isMe = s.id === user.id; return (
            <li key={s.id}>
              <ListRow href={`/players/${s.id}`} className={cn(isMe && "bg-card -mx-3 rounded-[14px] border-b-transparent px-3", s.played === 0 && "opacity-60")}
                leading={<><span className={cn("stat-number w-[22px] text-[13px]", s.rank === 1 && s.played > 0 ? "text-brass" : "text-muted-foreground")}>{s.rank}</span><Avatar person={p ?? { id: s.id, display_name: s.display_name }} size="sm" /></>}
                title={<span className="flex items-center gap-1.5"><span className="truncate">{s.display_name}</span><TitleBadge title={levelOf(levels, s.id).title} size={20} /></span>}
                meta={<span className="flex items-center gap-1.5"><SchoolMark school={schoolById[p?.school_id ?? ""]} size={16} />{p?.school_short_name}<span aria-hidden="true">·</span>{s.wins}–{s.losses}</span>}
                trailing={<><span className="stat-number text-[15px]">{s.points}</span><span className="text-muted-foreground text-[12px]">pts</span></>} />
            </li>); })}
        </ol>
        <p className="text-muted-foreground text-[12px]">3 pts a win · 1 pt a loss · games played {formatClubDate(viewed.starts_on)}{viewed.ends_on ? ` – ${formatClubDate(viewed.ends_on)}` : " onward"}</p>
      </>
    )}
    {past.length > 0 && (
      <section className="flex flex-col gap-1.5">
        <SectionHeading as="h3">Past seasons</SectionHeading>
        {past.map((s) => { const c = s.champion_id ? peopleById[s.champion_id] : null; return (
          <ListRow key={s.id} href={`/leaderboard?tab=season&season=${s.id}`} leading={c ? <Avatar person={c} size="sm" ring="var(--gold)" /> : undefined} title={s.name} meta={`${formatClubDate(s.starts_on)} – ${s.ends_on ? formatClubDate(s.ends_on) : ""}${c ? ` · ${c.display_name}` : ""}`} />); })}
      </section>
    )}
  </div>
)}
```
`peopleById` comes from the existing `leaderboard` rows (`allRows`, keyed by id — they carry `display_name, avatar_url, ball, school_id, school_short_name`); `past = seasons.filter(s => s.status === "closed" && s.id !== viewed?.id)`; `champion = standings.find(s => s.id === viewed.champion_id)`; `isAdmin` from a `profiles.role` select; `progress = viewed.status === "open" ? seasonProgress(viewed, today) : null`.

- [ ] **Step 4:** lint/tsc; commit `feat(seasons): Season tab with standings and past seasons`.

---

### Task 8: Home season strip, Profile Season champion achievement

**Files:**
- Modify: `app/(member)/page.tsx` (rating eyebrow + strip), `lib/achievements.ts`, `app/(member)/players/[id]/page.tsx:151-158`
- Create: `tests/achievements.test.ts`

- [ ] **Step 1: Test** — `tests/achievements.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { earnedAchievements } from "@/lib/achievements";
describe("season champion", () => {
  const base = { viewerId: "a", rating: 450, peak: 450, matches: [], opponentRatings: {}, tournamentsWon: 0 };
  it("is earned by a closed season's champion", () => {
    expect(earnedAchievements({ ...base, seasonsWon: 0 }).map((a) => a.id)).not.toContain("season-champion");
    expect(earnedAchievements({ ...base, seasonsWon: 1 }).map((a) => a.id)).toContain("season-champion");
  });
});
```
- [ ] **Step 2:** `AchievementInput` gains `seasonsWon: number`; catalogue appends `{ id: "season-champion", label: "Season champion", emoji: "🥇", description: "Topped a season's standings.", test: (i) => i.seasonsWon >= 1 }`. Profile page: `const { count: seasonsWon } = await supabase.from("seasons").select("id", { count: "exact", head: true }).eq("status", "closed").eq("champion_id", id);` and pass `seasonsWon: seasonsWon ?? 0`. Tests PASS.

- [ ] **Step 3: Home** — add `loadOpenSeason(supabase)` to the `Promise.all`; `const seasonName = openSeason?.name ?? seasonLabel(today)` for the eyebrow. When open: `const standings = await loadSeasonStandings(supabase, openSeason)` → `mine = standings.find(s => s.id === user.id)`. Under the `StatGrid`:
```tsx
{openSeason && mine && (
  <Link href="/leaderboard?tab=season" className="press bg-card flex items-center justify-between gap-3 rounded-[20px] px-5 py-4 shadow-[inset_0_0_0_1px_var(--hairline-row)]">
    <span className="flex flex-col gap-1">
      <span className="eyebrow">{openSeason.name}</span>
      <span className="stat-number text-[20px] leading-none">{mine.played > 0 ? `#${mine.rank} · ${mine.points} pts` : "No games yet"}</span>
    </span>
    <span className="text-muted-foreground flex items-center gap-1 text-[12px]">{seasonCountdownLabel(openSeason, today)}<ChevronRight className="size-4" strokeWidth={1.7} /></span>
  </Link>
)}
```
- [ ] **Step 4:** lint/tsc; commit `feat(seasons): Home season strip and Season champion achievement`.

---

### Task 9: Live now

**Files:**
- Create: `app/(member)/matches/new/live-actions.ts`, `components/live-game-card.tsx`, `components/live-home.tsx`, `lib/live.ts`, `tests/live.test.ts`
- Modify: `app/(member)/matches/new/report-form.tsx`, `app/(member)/matches/new/actions.ts:66-70`, `app/(member)/page.tsx`

**Interfaces:**
- Produces: `publishLiveGame(input: LiveInput): Promise<{ error: string | null }>`, `clearLiveGame(): Promise<void>`, `liveGameState(row, viewerId)` (pure: names, sides, rails), `LIVE_STALE_MS = 3 * 3_600_000`.

- [ ] **Step 1: `lib/live.ts` + test**
```ts
import { raceProgress } from "@/lib/race";
export const LIVE_STALE_MS = 3 * 3_600_000;
export interface LiveInput { opponentId: string; gameType: string; raceTo: number | null; spot: number; spotTo: "me" | "them" | null; you: number; them: number }
export function validateLive(i: LiveInput, meId: string): string | null {
  if (!i.opponentId || i.opponentId === meId) return "Pick an opponent";
  if (i.raceTo !== null && (!Number.isInteger(i.raceTo) || i.raceTo < 1 || i.raceTo > 25)) return "Pick a race length";
  if (!Number.isInteger(i.spot) || i.spot < 0 || (i.raceTo !== null && i.spot >= i.raceTo) || (i.raceTo === null && i.spot > 0)) return "That spot doesn't fit the race";
  if ((i.spot === 0) !== (i.spotTo === null)) return "That spot doesn't fit the race";
  if (![i.you, i.them].every((n) => Number.isInteger(n) && n >= 0 && n <= 99)) return "Bad score";
  return null;
}
// What a spectator's card shows: "needs 2" for the leader, rails per side.
export function liveLine(row: { reporter_score: number; opponent_score: number; race_to: number | null }): { reporter: number; opponent: number; need: string | null } {
  const reporter = raceProgress(row.reporter_score, row.race_to);
  const opponent = raceProgress(row.opponent_score, row.race_to);
  if (!row.race_to) return { reporter, opponent, need: null };
  const lead = Math.max(row.reporter_score, row.opponent_score);
  return { reporter, opponent, need: lead >= row.race_to ? "Finished" : `First to ${row.race_to} · leader needs ${row.race_to - lead}` };
}
export function isFresh(updatedAt: string, now: Date): boolean { return now.getTime() - Date.parse(updatedAt) < LIVE_STALE_MS; }
```
Tests: validateLive rejects self/none/oversized spot and accepts open play; liveLine gives 0.6/0.4 and "First to 5 · leader needs 2" for 3–2; isFresh at 2h59 true, 3h01 false.

- [ ] **Step 2: Actions** — `live-actions.ts`:
```ts
"use server";
import { validateLive, type LiveInput } from "@/lib/live";
import { createClient, createServiceClient } from "@/lib/supabase/server";
export async function publishLiveGame(input: LiveInput): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Please log in again." };
  const problem = validateLive(input, user.id);
  if (problem) return { error: problem };
  const service = createServiceClient();
  const { data: opp } = await service.from("profiles").select("id").eq("id", input.opponentId).eq("status", "approved").maybeSingle();
  if (!opp) return { error: "Opponent not found" };
  const { error } = await service.from("live_games").upsert({
    reporter_id: user.id, opponent_id: input.opponentId, game_type: input.gameType, race_to: input.raceTo, spot: input.spot,
    spot_to: input.spotTo === "me" ? user.id : input.spotTo === "them" ? input.opponentId : null,
    reporter_score: input.you, opponent_score: input.them, updated_at: new Date().toISOString(),
  }, { onConflict: "reporter_id" });
  return { error: error?.message ?? null };
}
export async function clearLiveGame(): Promise<void> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  await createServiceClient().from("live_games").delete().eq("reporter_id", user.id);
}
```
`reportMatch` (`actions.ts`): after `if (error || !created) fail(...)`, add `await service.from("live_games").delete().eq("reporter_id", user.id);` (the `service` client is created just below today — move its creation up).

- [ ] **Step 3: Scoreboard** — in `report-form.tsx` add after the localStorage mirror effect:
```tsx
// Everyone on Home sees this table while an opponent is picked (spec §3).
useEffect(() => {
  if (!opponentId) return;
  const timer = setTimeout(() => {
    void publishLiveGame({ opponentId, gameType: game, raceTo, spot, spotTo, you, them });
  }, 600);
  return () => clearTimeout(timer);
}, [opponentId, game, raceTo, spot, spotTo, you, them]);
```
In `clearBoard()` add `void clearLiveGame();`. Import both from `./live-actions`.

- [ ] **Step 4: `components/live-game-card.tsx`** (server)
```tsx
import Link from "next/link";
import { Avatar } from "@/components/avatar";
import { GAME_LABEL } from "@/lib/identity";
import { liveLine } from "@/lib/live";
import { formatLabel } from "@/lib/race";
import { cn } from "@/lib/utils";
import type { FeedPerson } from "@/lib/feed";
export function LiveGameCard({ row, viewerId }: { row: { reporter_id: string; opponent_id: string; game_type: string; race_to: number | null; spot: number; spot_to: string | null; reporter_score: number; opponent_score: number; reporter: FeedPerson | null; opponent: FeedPerson | null }; viewerId: string }) {
  const name = (p: FeedPerson | null, id: string) => (id === viewerId ? "You" : (p?.display_name ?? "Member").split(" ")[0]);
  const r = name(row.reporter, row.reporter_id);
  const o = name(row.opponent, row.opponent_id);
  const spotName = row.spot_to === row.reporter_id ? r : row.spot_to === row.opponent_id ? o : null;
  const line = liveLine(row);
  const mine = row.reporter_id === viewerId;
  const body = (
    <>
      <div className="flex items-center gap-3">
        <div className="flex shrink-0"><Avatar person={row.reporter ?? { id: row.reporter_id, display_name: null }} size="md" className="ring-background relative z-10 ring-2" /><Avatar person={row.opponent ?? { id: row.opponent_id, display_name: null }} size="md" className="ring-background -ml-3 ring-2" /></div>
        <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
          <span className="truncate text-[15px] font-medium">{r} vs {o}</span>
          <span className="text-muted-foreground truncate text-[12px]">{[GAME_LABEL[row.game_type] ?? row.game_type, formatLabel(row.race_to, row.spot, spotName) ?? "Open play"].join(" · ")}</span>
        </div>
        <span className="stat-number shrink-0 text-[22px] leading-none">{row.reporter_score}<span className="text-muted-foreground">–</span>{row.opponent_score}</span>
      </div>
      {row.race_to && (
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-hairline-divider h-0.5"><div className={cn("h-full", row.reporter_score >= row.opponent_score ? "bg-win" : "bg-foreground/35")} style={{ width: `${Math.round(line.reporter * 100)}%` }} /></div>
          <div className="bg-hairline-divider h-0.5"><div className={cn("ml-auto h-full", row.opponent_score > row.reporter_score ? "bg-win" : "bg-foreground/35")} style={{ width: `${Math.round(line.opponent * 100)}%` }} /></div>
        </div>
      )}
      {line.need && <span className="text-muted-foreground text-[12px]">{line.need}{mine && <span className="text-brass"> · Your game</span>}</span>}
    </>
  );
  const cls = "bg-card flex flex-col gap-3 rounded-[20px] p-4 shadow-[inset_0_0_0_1px_var(--hairline-row)]";
  return mine ? <Link href="/matches/new" className={cn("press", cls)}>{body}</Link> : <div className={cls}>{body}</div>;
}
```

- [ ] **Step 5: `components/live-home.tsx`** (client)
```tsx
"use client";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
// Home is server-rendered; this asks for a fresh render when the feed or a
// live table changes, debounced so a burst costs one round trip.
export function LiveHome() {
  const router = useRouter();
  useEffect(() => {
    const supabase = createClient();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => { clearTimeout(timer); timer = setTimeout(() => router.refresh(), 400); };
    const channel = supabase.channel(`home:${crypto.randomUUID()}`);
    let active = true;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!active) return;
      if (session) await supabase.realtime.setAuth(session.access_token);
      channel
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "activity" }, refresh)
        .on("postgres_changes", { event: "*", schema: "public", table: "live_games" }, refresh)
        .subscribe();
    })();
    const onVisible = () => { if (document.visibilityState === "visible") refresh(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { active = false; clearTimeout(timer); document.removeEventListener("visibilitychange", onVisible); void supabase.removeChannel(channel); };
  }, [router]);
  return null;
}
```

- [ ] **Step 6: Home** — query `supabase.from("live_games").select("reporter_id, opponent_id, game_type, race_to, spot, spot_to, reporter_score, opponent_score, updated_at, reporter:profiles!live_games_reporter_id_fkey(id, display_name, avatar_url, ball), opponent:profiles!live_games_opponent_id_fkey(id, display_name, avatar_url, ball)").gte("updated_at", new Date(now.getTime() - LIVE_STALE_MS).toISOString()).order("updated_at", { ascending: false })`. Render after `<NotifyPrompt />`:
```tsx
<LiveHome />
{live.length > 0 && (
  <section className="flex flex-col gap-3">
    <span className="eyebrow flex items-center gap-2"><span aria-hidden="true" className="bg-win motion-safe:animate-pulse size-2 rounded-full" />Live now</span>
    {live.map((g) => <LiveGameCard key={g.reporter_id} row={{ ...g, reporter: one(g.reporter), opponent: one(g.opponent) }} viewerId={user.id} />)}
  </section>
)}
```

- [ ] **Step 7:** lint/tsc/vitest; commit `feat(live): the table being played right now, on Home`.

---

### Task 10: Daily season tick

**Files:**
- Create: `lib/season-tick.ts`, `tests/season-tick.test.ts`
- Modify: `app/api/health/route.ts`

- [ ] **Step 1: Pure rule + test** — in `lib/season-tick.ts`:
```ts
export const WEEK_LEFT_DAYS = 7;
export function weekLeftDue(season: { ends_on: string | null; status: string }, today: string, alreadyPosted: boolean): boolean {
  if (season.status !== "open" || !season.ends_on || alreadyPosted) return false;
  return daysLeft(season, today) === WEEK_LEFT_DAYS;
}
```
Test: due on exactly 7 days, not on 8 or 6, not when posted, not without `ends_on`.

- [ ] **Step 2: Runner** (same file, server):
```ts
export async function runSeasonTick(service: SupabaseClient, today: string): Promise<void> {
  try {
    const season = await loadOpenSeason(service);
    if (!season) return;
    const { count } = await service.from("activity").select("id", { count: "exact", head: true }).eq("season_id", season.id).eq("kind", "season_week_left");
    if (!weekLeftDue(season, today, (count ?? 0) > 0)) return;
    const standings = await loadSeasonStandings(service, season);
    const leader = seasonChampion(standings);
    const { error } = await service.from("activity").insert({ kind: "season_week_left", season_id: season.id, data: { name: season.name, leader_id: leader?.id ?? null, leader_name: leader?.display_name ?? null, leader_points: leader?.points ?? 0 } });
    if (error) { console.warn("season tick: insert failed", error.message); return; }
    await notifyAllMembers(service, { category: "league", excludeId: null, payload: seasonWeekLeftPayload({ seasonId: season.id, name: season.name, leaderName: leader?.display_name ?? null, leaderPoints: leader?.points ?? 0 }) });
  } catch (err) { console.warn("season tick failed", err); }
}
```
- [ ] **Step 3: Health route** — after the schools probe, when `SUPABASE_SERVICE_ROLE_KEY` is set: `await runSeasonTick(createClient(url, serviceKey, { auth: { persistSession: false } }), clubDateOf(new Date().toISOString()))`; add `season_tick: "ran"` to the body. Keep the 503 logic unchanged.
- [ ] **Step 4:** tests/lint/tsc; commit `feat(seasons): one-week-left reminder from the daily cron`.

---

### Task 11: Integration tests

**Files:**
- Create: `tests/seasons.integration.test.ts`

- [ ] **Step 1:** Following `tests/rls.integration.test.ts`: create an admin (`role: "admin"`) and two members via `auth.admin.createUser`, sign the admin in with the anon client (`signInWithPassword`) to call RPCs as them. Cases:
  1. member `rpc("open_season")` → error mentions admins; admin → returns id; a second `open_season` → error "already open".
  2. member `select` on `seasons` sees it; member `insert` into `activity` and `live_games` → error (RLS).
  3. service inserts a confirmed match between the two members with `played_at` inside the season → exactly one `activity` row `kind = 'match'` with `match_id`; service inserts a `badge` row for it; `update matches set status = 'disputed'` → zero activity rows for that match.
  4. early close: `close_season(id, memberA, today, [{id: memberA, points: 3}])` with `ends_on` a month ahead → `ends_on === today`, `champion_id === memberA`, one `season_closed` row with `data.points === 3`. Open another season starting tomorrow with `ends_on` = yesterday+... (late close): open with `starts_on` = 60 days ago, `ends_on` = 30 days ago, close today → `ends_on` stays 30 days ago.
  Teardown: delete seasons (activity cascades), matches, users.
- [ ] **Step 2:** `npx vitest run tests/seasons.integration.test.ts` → PASS. Commit `test(seasons): RPCs, RLS and feed triggers against the project`.

---

### Task 12: End-to-end

**Files:**
- Create: `e2e/season-feed.spec.ts`
- Modify: `e2e/cleanup.ts` (add `trackSeasonName` → delete seasons by name in teardown)

- [ ] **Step 1:** Spec (one test, `test.setTimeout(180_000)`): make admin + two members (pattern from `e2e/tournament.spec.ts`). Admin logs in → `/admin` → fills season name `E2E Season ${stamp}` → "Open season" → expects the success message. Member A logs in → Home shows the season strip text `E2E Season ${stamp}` and the feed row "has begun". A goes to `/matches/new`, picks B, "Race to 3", increments to 2–0; member B (second context) opens Home and sees the **Live now** card "E2E A vs E2E B" (regex) with `2–0`; A reloads `/matches/new` (draft restored) and B's Home still shows it after `page.reload()`; A taps **Clear** → B reloads → no Live now card. A plays the race to 3–1 and sends; B confirms; B's Home feed shows "Won 3–1"; `/leaderboard?tab=season` shows B with `3` pts and A with `1`. Admin ends the season (accept the confirm dialog with `page.on("dialog", d => d.accept())`) → admin's Home feed shows "is the E2E Season … champion"; `/leaderboard?tab=season` shows **Past seasons** with the name.
- [ ] **Step 2:** `npx playwright test e2e/season-feed.spec.ts --workers=1` → PASS. Run the whole e2e suite once. Commit `test(e2e): season, feed and live now flow`.

---

### Task 13: Verification, docs, ship

- [ ] `npm run lint && npx tsc --noEmit && npx vitest run && npm run build` → all clean; `npx playwright test --workers=1` → green (flakes from cold compiles are reruns, not bugs).
- [ ] README: add Seasons / Activity feed / Live now to **What it does** and the new `lib/*` files to **Where things are**; CLAUDE.md **Current work** gets the spec line; `.env.example` unchanged.
- [ ] Push the branch, open the PR with the summary and test plan, merge, `npx vercel deploy --prod --yes`, then open `/api/health` once and confirm `season_tick: "ran"`.
