# SECBL Seasons, Activity Feed & Live Now — semester scoreboard with a reset, a league activity feed on Home, and the table that's being played right now

**Date:** 2026-10-06
**Status:** Approved in conversation 2026-10-06; written autonomously from the owner's choices (§0). Plan: `docs/superpowers/plans/2026-10-06-seasons-feed-live.md`.
**Builds on:** `2026-10-06-live-club-design.md` (push, races & spots, the live scoreboard, show-more), `2026-10-06-levels-xp-design.md` (titles, computed XP), `2026-10-06-elevated-dark-redesign-design.md` (tokens, components), `2026-08-31-tournaments-design.md` (cups).

## 0. The ask, and the calls made

The owner wants members to enjoy being in the app *and* to have reasons to come back. From a longer list they picked three ideas: a semester scoreboard that resets, an activity feed, and a "live now" strip. Decisions taken in conversation are marked **Agreed**; everything else is an **Assumption**, chosen so it can be reversed cheaply.

| # | Topic | What ships |
|---|---|---|
| 1 | What resets | **Agreed.** The Fargo-style rating ladder and XP/badges stay permanent. A separate **season scoreboard** resets each semester. The ladder measures skill; the season is the thing people race for. |
| 2 | Season scoring | **Agreed.** 3 points for a win, 1 for a loss. Every confirmed game moves you; winning moves you three times faster. Cup matches count like any other game. Spots don't change points. |
| 3 | Season boundaries | **Agreed.** Admin-managed: a season has a name, a start date and an optional planned end date. An admin ends it with one tap, which crowns the champion, posts the final standings to the feed, pushes "Fall 2026 is in the books", and leaves the next one for the admin to open. The calendar labels (`seasonLabel`) are only default names. |
| 4 | Which games belong to a season | **Assumption.** A confirmed match is in a season when its `played_at` (a club date) falls in `[starts_on, ends_on]`. Nothing is stamped on the match. Matches played between seasons belong to none (still rated, still earn XP). |
| 5 | Tiebreak | **Assumption.** Points, then wins, then head-to-head points among the tied group, then name. Pure and tested. |
| 6 | Closing with results pending | **Assumption.** Allowed. The admin card shows how many reports are still unconfirmed so they can chase them first. The champion is stamped at close; a result confirmed afterwards still counts in the computed standings (the stored champion is the record of who was crowned). |
| 7 | Feed contents | **Agreed.** Confirmed results, badge unlocked, streaks (3, 5, 10, then every 5), ladder passes (into the top 10 only), cup started / round complete / champion, season opened / one week left / closed, new member. It replaces the "Recent" list on Home; events and chat stay out. |
| 8 | Feed storage | **Assumption.** Stored rows in an `activity` table, not recomputed: every writer already runs once per event, Realtime needs an INSERT to fire on, and "Dennis passed Maya for #4" is a moment, not a state. Derived moments carry the `match_id` that caused them so voiding the match removes them. |
| 9 | Feed heading | **Assumption.** The section keeps the heading **Recent**: nine e2e specs use it as the "logged in and on Home" landmark. |
| 10 | Live now | **Assumption.** The scoreboard on Log a game publishes its state (opponent, game, race, spot, scores) to a `live_games` row through a debounced server action from the moment an opponent is picked. Everyone sees it on Home under a pulsing "Live now" eyebrow and watches the rails move. The row is deleted when the result is sent or the board is cleared, and ignored after three hours. |
| 11 | Live updates on Home | **Assumption.** One client component subscribes over Realtime to `activity` INSERTs and every change on `live_games` and calls `router.refresh()` (debounced 400 ms, plus on `visibilitychange`), so the server re-renders Home with the same code path as a cold load. No second client-side data model. |
| 12 | Push category | **Assumption.** Season moments push under a new fourth category, **League** ("Season news"), switchable in Settings like the others and on by default. Badge/streak/pass moments do not push in v1. |
| 13 | One week left | **Assumption.** Posted (and pushed) once by the daily cron when an open season's planned end is exactly seven days away. Vercel Hobby allows two cron jobs and both exist, so the tick lives in the existing `/api/health` route. A season with no planned end never gets the reminder. |
| 14 | Leaderboard tabs | **Assumption.** Three tabs: **Season · Players · Schools**. Season is the default while a season is open; Players otherwise. Season standings list every approved member, zero-point rows at the bottom, so nobody is invisible. Closed seasons are browsable. |
| 15 | Backfill | **Assumption.** The migration writes a `match` activity row for every existing confirmed match and a `cup_won` row for every completed cup, timestamped from the record, so the feed isn't empty on day one. Badges, streaks, passes and joins are not reconstructed. |
| 16 | Achievement | **Assumption.** A tenth achievement, **Season champion** 🥇, earned by having `champion_id` on any closed season. |

## 1. Seasons

### Data (migration `0023_seasons_feed_live.sql`, part 1)
```sql
create table public.seasons (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  starts_on date not null,
  ends_on date,                       -- planned end; set on close if null or later than the close date
  status text not null default 'open' check (status in ('open', 'closed')),
  champion_id uuid references public.profiles(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  closed_at timestamptz,
  check (ends_on is null or ends_on >= starts_on),
  check ((status = 'closed') = (closed_at is not null))
);
create unique index seasons_one_open on public.seasons ((status)) where status = 'open';
create index seasons_starts_idx on public.seasons (starts_on desc);
```
RLS: approved members `select`. No client write policies; the two functions below are the only write path.

```sql
-- Admin only. Refuses a second open season and a start before the previous season's end.
create function public.open_season(p_name text, p_starts_on date, p_ends_on date) returns uuid;
-- Admin only. Stamps champion, ends_on := least(coalesce(ends_on, p_today), p_today), closed_at := now().
-- Inserts the season_closed activity row (§2) in the same transaction.
create function public.close_season(p_season_id uuid, p_champion_id uuid, p_today date) returns void;
```
`open_season` inserts the `season_opened` activity row itself. Both `revoke ... from public, anon` / `grant ... to authenticated` and check `public.is_admin()` like `set_school_logo`.

### Logic (`lib/season.ts`, pure, test-first)
```ts
export const POINTS_WIN = 3;
export const POINTS_LOSS = 1;
export interface Season { id: string; name: string; starts_on: string; ends_on: string | null; status: "open" | "closed"; champion_id: string | null }
export interface SeasonMatch { id: string; reporter_id: string; opponent_id: string; winner_id: string; played_at: string }
export interface Standing { id: string; played: number; wins: number; losses: number; points: number; rank: number }

export function inSeason(playedAt: string, season: Pick<Season, "starts_on" | "ends_on">): boolean
// Every member listed; sorted by points desc, wins desc, head-to-head points among the tied
// group, then name. rank is 1-based and shared only when every tiebreak ties (never, given name).
export function seasonStandings(matches: SeasonMatch[], members: { id: string; display_name: string }[], season): Standing[]
export function seasonChampion(standings: Standing[]): string | null   // first row with played > 0
export function daysLeft(season: Season, today: string): number | null  // null without ends_on; negative past it
export function seasonProgress(season: Season, today: string): number | null // 0..1 for the Home strip rail
export function seasonCountdownLabel(season: Season, today: string): string // "23 days left" / "Ends today" / "Started Aug 20" / "Ended Dec 12"
```
Tests in `tests/season.test.ts`: points arithmetic; on equal points (3–0 vs 2–3, both 9 pts) more wins ranks higher; on equal points and wins, head-to-head decides; boundary dates are inclusive; members with no games come last, by name; `daysLeft` counts club dates.

### Loading (`lib/season-data.ts`)
`loadOpenSeason(supabase)`, `loadSeason(supabase, id)`, `loadSeasonStandings(supabase, season)` (pages confirmed matches with `played_at` in range through `fetchAllPages`, joins approved members), `loadMyStanding(supabase, season, meId)`.

### Surfaces
- **Leaderboard** (`app/(member)/leaderboard/page.tsx`): `UnderlineTabs` gains **Season** as the first option (`?tab=season`, plus `&season=<id>` for a closed one). Default tab is `season` while a season is open. The tab shows: an eyebrow with the season name and `seasonCountdownLabel`; a thin rail (`seasonProgress`) when the end is planned; the standings as hairline rows — rank number (brass for #1), avatar, name + title badge, school mark, `W–L`, points as the trailing `stat-number`; your row highlighted like the Players tab; the footnote "3 pts a win · 1 pt a loss". Below, **Past seasons**: one `ListRow` per closed season (name, dates, champion avatar + name) linking to its standings. With no season at all: "No season running yet." (admins see "Open one from Admin.").
- **Home**: the rating eyebrow reads `Rating · <open season name>` (falls back to `seasonLabel(today)`). A **Season strip** sits under the stats grid while a season is open: a `Link` to `/leaderboard?tab=season` styled like the Next match card but one line tall — left: eyebrow `FALL 2026`, `#4 · 27 pts` in `stat-number`; right: `23 days left` muted, chevron. Hidden when no season is open.
- **Profile**: under Achievements, the catalogue gains **Season champion**; `AchievementInput` gains `seasonsWon: number`.
- **Admin** (`app/(member)/admin/page.tsx`): a **Season** card above Schools. While open: name, `Started Aug 20 · ends Dec 12`, players on the board, leader, pending reports played inside the season, and an **End season** button (`window.confirm` interstitial, same pattern as `DeleteEventButton`). While none is open: an **Open a season** form — name (default `seasonLabel(today)`), start date (default today), planned end (optional).

### Actions (`app/(member)/admin/actions.ts`)
- `openSeason(formData)`: `requireAdmin`, validate, `rpc("open_season")`, then push **League** to every approved member except the admin: `seasonOpenedPayload`.
- `endSeason(formData)`: `requireAdmin`, load standings, `seasonChampion`, `rpc("close_season")`, then push `seasonClosedPayload` to everyone.

### Daily tick (`lib/season-tick.ts`, called from `app/api/health/route.ts` with the service client)
If an open season has `ends_on` and `daysLeft === 7` and no `season_week_left` activity row exists for it: insert the row (`data: { leader_id, leader_points }`) and push `seasonWeekLeftPayload` to all. Idempotent by the existence check. Failures are logged, never fail the health response.

## 2. Activity feed

### Data (migration part 2)
```sql
create type public.activity_kind as enum (
  'match', 'badge', 'streak', 'pass',
  'cup_started', 'cup_round', 'cup_won',
  'season_opened', 'season_week_left', 'season_closed',
  'member_joined'
);
create table public.activity (
  id uuid primary key default gen_random_uuid(),
  kind public.activity_kind not null,
  actor_id uuid references public.profiles(id) on delete cascade,   -- the subject
  other_id uuid references public.profiles(id) on delete cascade,   -- opponent / the player passed
  match_id uuid references public.matches(id) on delete cascade,    -- the cause; derived rows carry it too
  tournament_id uuid references public.tournaments(id) on delete cascade,
  season_id uuid references public.seasons(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index activity_created_idx on public.activity (created_at desc);
create index activity_match_idx on public.activity (match_id) where match_id is not null;
create unique index activity_one_match_row on public.activity (match_id) where kind = 'match';
create unique index activity_one_week_left on public.activity (season_id) where kind = 'season_week_left';
alter publication supabase_realtime add table public.activity;
```
RLS: approved members `select`. No client write policy; rows come from triggers and the service role.

`data` per kind:
| kind | data |
|---|---|
| match | `{}` — scores, format and game come from the joined match row |
| badge | `{ "title": "Shark", "level": 10 }` |
| streak | `{ "length": 5 }` |
| pass | `{ "rank": 4 }` — actor's new rank; other_id is who they passed |
| cup_started | `{ "name": "Fall Cup", "players": 8, "race_to": 5 }` |
| cup_round | `{ "name": "Fall Cup", "round": 2, "rounds": 3 }` — rendered with the bracket's round naming |
| cup_won | `{ "name": "Fall Cup" }` |
| season_opened | `{ "name": "Fall 2026", "ends_on": "2026-12-12" }` |
| season_week_left | `{ "name": "Fall 2026", "leader_id": "...", "leader_points": 42 }` |
| season_closed | `{ "name": "Fall 2026", "points": 48, "podium": [{ "id": "...", "points": 48 }, …] }` |
| member_joined | `{}` — school comes from the actor's profile |

### Writers
| Kind | Written by |
|---|---|
| `match` | SQL trigger `matches_activity` AFTER INSERT OR UPDATE: when `new.status = 'confirmed'` and no `match` row exists, insert `(actor_id = winner_id, other_id = loser, match_id, created_at = coalesce(confirmed_at, now()))`. When status leaves `confirmed`, delete every activity row with that `match_id` (derived rows included). Deleting the match cascades the same way. Covers `apply_match_confirmation`, `record_tournament_result`, voids and corrections without touching those functions. |
| `badge`, `streak`, `pass` | TS `recordMatchMoments(service, matchId)` in `lib/activity-write.ts`, called after `confirmPendingMatch` in `confirmMatch` and `adminResolveMatch`, and after `record_tournament_result` in `recordResult`. Never throws; runs after the row is saved, like push. |
| `cup_started`, `cup_won` | SQL trigger on `tournaments` status change: `setup→live` inserts `cup_started` (players from `tournament_players`, race_to); `live→complete` inserts `cup_won` with the final's winner (`winner_advances_to is null`); `complete→live` deletes the `cup_won` row. |
| `cup_round` | SQL trigger on `tournament_matches` AFTER UPDATE OF `winner_id`: when every match in `(tournament_id, round)` has a winner, insert one `cup_round` row for that round (the trigger checks `not exists` on `tournament_id` + `data->>'round'` first, since a partial unique index cannot see into jsonb). When a winner is cleared, delete that round's row. The final's round is skipped (the `cup_won` row covers it). |
| `season_opened`, `season_closed` | inside `open_season` / `close_season` |
| `season_week_left` | the daily tick |
| `member_joined` | SQL trigger on `profiles` AFTER INSERT when `status = 'approved'` |

### Derived moments (`lib/activity.ts`, pure, test-first)
```ts
export const STREAK_MARKS = (n: number) => n === 3 || n === 5 || (n >= 10 && n % 5 === 0);
export const PASS_TOP = 10;
// Badge: title after this match differs from the title before it (XP replayed without it).
export function badgeMoment(before: LevelInfo, after: LevelInfo): { title: TitleName; level: number } | null
// Streak: current streak length for the winner hits a mark exactly.
export function streakMoment(newestFirst: StatMatch[], winnerId: string): { length: number } | null
// Pass: ranks by rating before (both players' rating_before substituted) and after; the winner
// moved up into the top 10; `other` is the highest-placed player they jumped.
export function passMoment(boardBefore: { id: string; rating: number }[], boardAfter: { id: string; rating: number }[], winnerId: string): { rank: number; otherId: string } | null
```
`recordMatchMoments` loads the match, both players' XP with and without it (`loadXp` + `xpFromMatches` on the filtered list), the winner's newest-first matches, and the leaderboard with the two `rating_before` values from `rating_history`, then inserts whatever the three pure functions return, each with `match_id`.

### Rendering (`lib/feed.ts` pure + `components/activity-row.tsx`)
`FeedRow` is the joined select shape: activity columns + `actor:profiles!activity_actor_id_fkey(id, display_name, avatar_url, ball, schools(short_name))`, `other:profiles!activity_other_id_fkey(...)`, `match:matches(id, reporter_id, opponent_id, winner_id, reporter_score, opponent_score, game_type, played_at, race_to, spot, spot_to, rating_delta_reporter, rating_delta_opponent, reporter:profiles!matches_reporter_id_fkey(...), opponent:profiles!matches_opponent_id_fkey(...))`.

`feedStamp(createdAt, now)` → `"Just now" | "4m" | "2h" | "Yesterday" | "Oct 3"`; tested.

`ActivityRow` (server component) renders by kind:
- `match`: the existing `MatchRow` (viewer perspective when the viewer played, league view otherwise), `caption` = `xpCaption` for the viewer's own games, meta = `labelPlayedDate`.
- `badge`: `ListRow` leading `TitleBadge` size 36 over the actor avatar; title "Maya is now a Shark"; meta "Level 10 · badge unlocked · 2h"; href profile.
- `streak`: leading avatar; title "Dennis is on a 5-game win streak"; a brass `Flame` icon trailing; meta stamp.
- `pass`: leading avatar; "Dennis passed Maya for #4"; meta "Rating ladder · 2h"; href `/leaderboard?tab=players`.
- `cup_started`: trophy mark; "Fall Cup is under way"; meta "8 players · race to 5"; href the cup.
- `cup_round`: "Fall Cup · Quarterfinals complete"; href the cup.
- `cup_won`: avatar with `--gold` ring; "Dennis won the Fall Cup"; meta "Champion · Oct 3".
- `season_opened`: "Fall 2026 has begun"; meta "3 pts a win, 1 a loss · ends Dec 12"; href season tab.
- `season_week_left`: "One week left in Fall 2026"; meta "Dennis leads with 42 pts".
- `season_closed`: champion avatar, gold ring; "Dennis is the Fall 2026 champion"; meta "48 pts · season closed"; href that season's standings.
- `member_joined`: avatar; "Jordan joined from UGA"; meta stamp; href profile.
"You" replaces the viewer's own name in titles (as `MatchRow` does).

**Home** fetches the 30 newest rows, renders them through `ShowMore` (10 first, "Show {hidden} more"), under the heading **Recent** with the action "All games" → profile. Empty state unchanged.

## 3. Live now

### Data (migration part 3)
```sql
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
alter publication supabase_realtime add table public.live_games;
```
RLS: approved members `select`; no client write policies (server actions use the service client after checking the user). `replica identity full` so DELETE events carry the row.

### Actions (`app/(member)/matches/new/live-actions.ts`)
- `publishLiveGame(input)`: validates like `reportMatch` (opponent exists and isn't you; race/spot shape via `validateResult` minus the "not tied" rule), upserts the row for `user.id` with `updated_at = now()`. Returns `{ error }`, never throws.
- `clearLiveGame()`: deletes the viewer's row.
`reportMatch` deletes the row after a successful insert; the form calls `clearLiveGame` from **Clear**.

### Scoreboard (`report-form.tsx`)
A `useEffect` on the draft: once `opponentId` is set, debounce 600 ms and call `publishLiveGame`. A restored draft republishes on mount. Nothing is published without an opponent. The form keeps working if the action fails (private mode, offline).

### Home
`loadLiveGames(supabase, now)`: rows with `updated_at > now − 3 h`, joined to both profiles. Rendered above **Confirm results** as a section with the eyebrow **Live now** carrying a pulsing `--win` dot (`motion-safe:animate-pulse`), one `LiveGameCard` per row: both avatars overlapped, "Dennis vs Maya" (You where applicable), meta "9-ball · race to 5 · 1 on the wire to Maya", the score as two `stat-number`s with a thin rail each (`raceProgress` from `lib/race`) or just the score for open play, and "needs 2" from `needLine` on the leader's side. The reporter's own card links to `/matches/new` with the trailing label "Your game"; others don't link. Hidden when nothing is live.

### Live refresh (`components/live-home.tsx`, client)
Subscribes (with the session token, same as the inbox) to `postgres_changes` on `activity` (INSERT) and `live_games` (`*`), debounced 400 ms → `router.refresh()`; `visibilitychange` → refresh. Unique channel topic per mount. Mounted once on Home.

## 4. Push

`PushCategory` gains `"league"`; `Prefs` gains `league: boolean`; `notification_prefs` gains `league boolean not null default true`; `loadPrefs` and `updateNotificationPrefs` carry it; the Settings card lists **League** — "Season news". Payloads (pure, tested in `tests/push.test.ts`):
- `seasonOpenedPayload({ name, endsOn })`: "Fall 2026 has begun" / "3 points a win, 1 a loss. Ends Dec 12." (or "No end date yet.") → `/leaderboard?tab=season`, tag `season:<id>`.
- `seasonWeekLeftPayload({ name, leaderName, leaderPoints })`: "One week left in Fall 2026" / "Dennis leads with 42 pts. Every game counts." → same url.
- `seasonClosedPayload({ name, championName, points })`: "Fall 2026 is in the books" / "Dennis is champion with 48 pts." → `/leaderboard?tab=season&season=<id>`.
Recipients: every approved member (paged), `excludeId` = the acting admin (null for the cron).

## 5. Tests

- `tests/season.test.ts`, `tests/activity.test.ts`, `tests/feed.test.ts`: pure logic above.
- `tests/push.test.ts`: the three payloads; `recipientsFor` honours `league`.
- `tests/achievements.test.ts` (new): Season champion earned from `seasonsWon`.
- `tests/seasons.integration.test.ts`: `open_season` refuses a second open season and a non-admin; `close_season` stamps champion/ends_on and writes the `season_closed` row; confirming a match writes exactly one `match` activity row and voiding it removes it; a member can read `activity` and `seasons` but not insert; `live_games` is readable and not writable by a member. Teardown deletes everything it created.
- `e2e/season-feed.spec.ts`: admin opens a season → Home shows the season strip and the feed shows "has begun"; two members log and confirm a race → the feed shows the result and the standings show 3 pts / 1 pt; the scoreboard with an opponent picked makes a **Live now** card appear on a second member's Home; admin ends the season → the feed names the champion and the Season tab shows Past seasons. Existing specs keep passing (the **Recent** heading stays).

## 6. Out of scope (next batch)

Reactions on feed rows and chat, challenges, the result celebration card, school-vs-school weekly standings, badge/streak/pass push notifications, season awards beyond the champion.
