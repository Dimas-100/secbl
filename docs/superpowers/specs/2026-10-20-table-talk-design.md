# SECBL Table Talk — chat on a game that's being played right now

**Date:** 2026-10-20
**Status:** Requested by the owner 2026-10-20 ("I saw a live game, I wanted to type something to them"); designed autonomously at the owner's request ("proceed autonomously"), so every call below is an **Assumption** unless marked otherwise. Plan: `docs/superpowers/plans/2026-10-20-table-talk.md`.
**Builds on:** `2026-10-06-seasons-feed-live-design.md` §3 (Live now, `live_games`), `2026-10-05-messaging-design.md` (rate limit, Realtime), `2026-10-06-live-club-design.md` (push).

## 0. The calls

| # | Topic | What ships |
|---|---|---|
| 1 | What it is | **Agreed (the ask).** Anyone watching a live game can type to it; both players see it. |
| 2 | Where it lives | A short thread attached to the live game. Not a chat room: it never appears in Messages or the unread count. |
| 3 | Lifetime | The thread lives exactly as long as the table: when the result is sent or the board is cleared, the `live_games` row is deleted and its comments cascade away. Like chalk talk, not a record. |
| 4 | Who can post | Every approved member, players included. |
| 5 | Length and pace | 1–280 characters; at most 5 comments per member per rolling 10 seconds (the messaging limiter, tighter). |
| 6 | Who is notified | The two players (minus the author), by push under the existing **Messages** category, one collapsing notification per game (`tag live:{gameId}`). Spectators are never pushed. **At most one push per game every 2 minutes:** a comment is pushed only when no other comment landed on that game in the previous 2 minutes, so a burst of spectators buzzes a player mid-game once, not on every line (the service worker re-alerts on every tagged push, `public/sw.js` `renotify`). |
| 7 | Spectator view | A new page `/live/[reporterId]`: the scoreboard card, then the thread, composer at the bottom. Every live card on Home becomes a link: the reporter's still goes to their scoreboard; everyone else's goes here. |
| 8 | Scorekeeper view | On Log a game, once someone has commented, a **Table talk** strip above the footer shows the newest comment and the count; tapping it opens a bottom sheet with the thread and a composer. |
| 9 | Home card | Shows a comment count and the newest comment under the rails. |
| 10 | Moderation | None beyond the rate limit and suspension (`is_approved()`); comments vanish with the game. Deleting single comments is a non-goal. |
| 11 | Both players keep score | Accepted limitation. If both players run a scoreboard for the same game (A→B and B→A rows), there are two cards and two threads, as there are two cards today. Agreed Results (one person logs) and Club Night (one scorekeeper per table) make this rare; a per-pair thread is a non-goal. |

## 1. Data (migration `0029_table_talk.sql`)

### A stable id for each game

```sql
alter table public.live_games add column id uuid not null default gen_random_uuid();
alter table public.live_games add constraint live_games_id_key unique (id);
```

`live_games` stays keyed by `reporter_id` and the scoreboard keeps upserting on it, so the id survives every score change and only changes when the row is deleted (Send, Clear) and a new game inserts a fresh one.

Two ways an old id could leak into a new game, both closed in `publishLiveGame`: before the upsert, read the reporter's existing row; if it is stale (`!isFresh(updated_at)`) or its `opponent_id` differs from the one being published, delete it first. A new opponent or a board revived hours later is a new game with an empty thread.

### Comments

```sql
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

alter publication supabase_realtime add table public.live_comments;
```

`live_comments_before_insert` (security definer, before insert) mirrors `messages_before_insert`: refuses a 6th comment from the same author inside 10 seconds (`'slow down — you are commenting too quickly'`), refuses a game whose `live_games.updated_at` is older than 3 hours (`'that game is over'`), sets `created_at := now()` and `body := trim(body)`.

## 2. Server actions (`app/(member)/live/actions.ts`)

```ts
// Posts through the caller's client (RLS + trigger), then pushes the players.
export async function postLiveComment(input: { gameId: string; body: string }):
  Promise<{ comment: LiveComment } | { error: string }>;
```
Validates the uuid and 1–280 trimmed characters, inserts, maps the trigger's errors to "Slow down — you're commenting too quickly." / "That game is over.", then (never throwing) reads the newest *other* comment on the game (`id < new id`, order by id desc, limit 1) and stops if `shouldPushComment` says the game was pushed recently; otherwise loads the game's two players and the author's name with the service client and calls `notify` with candidates `[reporter_id, opponent_id]`, `excludeId` the author, category `messages`, payload `liveCommentPayload` (§4). The reporter's URL is `/matches/new`, the opponent's `/live/{reporterId}`, so the payload is built per recipient: two `notify` calls, one candidate each.

`publishLiveGame` returns `{ error, gameId }` so the scoreboard knows which thread to subscribe to.

## 3. Pure logic (`lib/table-talk.ts`, test-first)

- `type LiveComment = { id: number; game_id: string; author_id: string; body: string; created_at: string }`.
- `mergeComments(have, incoming)`: dedupe by id, keep ascending id order. Unlike `lib/chat.ts mergeMessages` there is no `client_id`: the optimistic row (negative id) is replaced by the comment `postLiveComment` returns, and a Realtime copy of that comment arriving first is deduped by id.
- `PUSH_QUIET_MS = 2 * 60_000`; `shouldPushComment(previousCommentAt: string | null, now: Date)`: true when there is no previous comment or it is older than the quiet window.
- `talkSummary(comments, names)`: `{ count, latest: { name: first name, body } | null }` for the Home card and the scoreboard strip.
- `validateComment(body)`: trimmed 1–280 → `null` or the copy above.
- `shouldResetLive(existing: { updated_at; opponent_id } | null, opponentId, now)`: the stale-or-new-opponent rule from §1.

## 4. Push (lib/push.ts)

`liveCommentPayload({ gameId, authorName, body, url })` → title `{first} on your game`, body the comment (flattened, 120 max), `url`, tag `live:{gameId}`, category `messages`. The service worker already suppresses a notification whose URL is the visible window, so the scorekeeper looking at the scoreboard is not buzzed.

## 5. UI

### `components/table-talk.tsx` (client)

One component used by the spectator page and the scoreboard sheet. Props: `gameId`, `meId`, `initial: LiveComment[]`, `initialNames`. Subscribes to `postgres_changes` INSERT on `live_comments` filtered `game_id=eq.{gameId}` (set the Realtime auth token first, as `LiveHome` does), merges, scrolls to the newest. Each row: small avatar, first name in muted text, body. Composer: one-line input (16px to avoid iOS zoom) and an arrow send button, optimistic row, inline error. Empty state: "Say something to the table."

### `/live/[reporterId]` (server page)

Loads the reporter's live row (fresh only) with both players, and the last 50 comments. Header via `PageHeader` with back to Home, title `{A} vs {B}`. Body: the `LiveGameCard` (non-link), then `<TableTalk>`. A small client child subscribes to `live_games` changes for that reporter and calls `router.refresh()` (debounced) so the score moves. When the row is gone or stale: "This game is over." and a link to Home.

### Home

`LiveGameCard` becomes a link for everyone (reporter → `/matches/new`, others → `/live/{reporterId}`). Home's live query adds `id` and the comments for the shown games (one query, `in('game_id', ids)`, newest per game is enough for the summary; fetch count via the rows returned, bounded to 50 per page render). Under the rails, when count > 0: a muted line with a message icon: `{count} · {first}: {body}` truncated to one line. `LiveHome` also listens to `live_comments` INSERT so the line updates.

### Scoreboard (report-form.tsx)

Keeps the `gameId` returned by `publishLiveGame` in state. When set, a client child subscribes to its comments. When count > 0, a **Table talk** strip sits just above the sticky footer: `{first}: {newest body}` and `{count}` with a chevron; tap opens a Radix `Dialog` bottom sheet (same styling as the opponent picker) containing `<TableTalk>`. Sending or clearing the board drops the strip with the game.

## 6. Tests

- `tests/table-talk.test.ts`: `mergeComments`, `talkSummary`, `validateComment`, `shouldResetLive` (fresh same opponent → keep; new opponent → reset; stale → reset; none → keep), `shouldPushComment` (none → push; 30 s ago → no; 3 min ago → push).
- `tests/push.test.ts`: `liveCommentPayload`.
- `e2e/table-talk.spec.ts` (three test users, cleanup via `e2e/cleanup.ts`): A opens Log a game and picks B (the table goes live); C opens Home, taps the live card, lands on `/live/{A}`, posts "Nice shot"; A's scoreboard shows the Table talk strip with "Nice shot"; A clears the board; C's page shows "This game is over."; the DB has no `live_comments` for that game.

## 7. Non-goals

Keeping comments after the game (e.g. under the feed result), reactions, deleting or editing comments, pushes to spectators, comments on cup tables that aren't on a live scoreboard.
