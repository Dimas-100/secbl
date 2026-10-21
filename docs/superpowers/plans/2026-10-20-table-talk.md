# Table Talk Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Anyone watching a live game can type to it; both players see the thread (spectators on `/live/[reporterId]`, the scorekeeper in a strip + sheet on the scoreboard), and the thread disappears with the game.

**Architecture:** `live_games` gains a stable `id`; `live_comments` references it `on delete cascade`, so ending a game (Send/Clear) wipes its talk. One client hook (`useLiveComments`) owns load + Realtime + optimistic send, and one presentational `TableTalk` renders it on both screens. Pushes go to the two players, at most once per game per 2 minutes.

**Tech Stack:** Next.js 16 App Router, Supabase Postgres + Realtime (`postgres_changes`), vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-20-table-talk-design.md`

## Global Constraints

- One Supabase project serves dev and production: migration 0029 must be additive and contain no `drop` statements (the MCP `apply_migration` refuses destructive statements without an interactive confirmation; see the agreed-results ledger).
- Public repo: invented names only in tests and commits.
- Comments: 1–280 chars after trim; at most 5 per author per rolling 10 s; refused on a game whose `updated_at` is older than 3 h.
- Copy: empty thread `Say something to the table.`; composer label `Say something to the table`; send button aria-label `Send comment`; errors `Slow down — you're commenting too quickly.`, `That game is over.`, `Write something first.`, `Keep it under 280 characters.`; game over page `This game is over.`; strip heading `Table talk`; push title `{first} on your game`.
- `PUSH_QUIET_MS = 2 * 60_000`.
- Realtime subscriptions set the user's token first (`supabase.realtime.setAuth(session.access_token)`) and use a unique topic per mount, as `components/live-home.tsx` does.
- Verify: `npm run lint`, `npx tsc --noEmit`, `npx vitest run --exclude "**/*.integration.test.ts"`, `npx vitest run tests/table-talk.integration.test.ts`, `npx playwright test e2e/<spec> --workers=1`.

## Review Focus

- A board revived after 3 h, or switched to a new opponent: the old thread must not appear on the new game — unit tests on `shouldResetLive` (Task 2) + the delete-before-upsert in Task 4.
- A comment posted the instant the game ends (row deleted between page load and send): refused with `That game is over.`, not a raw FK error — Task 1 trigger maps a missing game to that message; Task 4 maps it.
- Optimistic row and the Realtime echo of the same comment arriving in either order: exactly one copy — unit test on `mergeComments` (Task 2).
- A spectator's page after the game ends: shows `This game is over.` without a reload — e2e (Task 5).
- Many spectators commenting fast: the players' phones buzz at most once per 2 minutes per game — unit test on `shouldPushComment` (Task 2) and Task 4's query.

---

### Task 1: Migration 0029 — game ids, comments, rules

**Files:**
- Create: `supabase/migrations/0029_table_talk.sql`, `tests/table-talk.integration.test.ts`

**Interfaces:**
- Produces: `live_games.id uuid not null unique default gen_random_uuid()`; table `live_comments(id bigint identity, game_id uuid → live_games(id) on delete cascade, author_id uuid → profiles on delete cascade, body text 1–280 trimmed, created_at timestamptz)`; Realtime publication includes `live_comments`.

- [ ] **Step 1: Failing integration test** `tests/table-talk.integration.test.ts` (pattern: `tests/rls.integration.test.ts` — `describe.skipIf(!url || !anonKey || !serviceKey)`, admin-created users `table-talk-{a|b}-{stamp}@example.com`, approved, ONE sign-in for user A in `beforeAll`; `afterAll` deletes both users — live rows and comments cascade). In `beforeAll` the admin upserts a `live_games` row `{ reporter_id: a, opponent_id: b, game_type: "8ball" }` and reads back its `id` as `gameId`. Tests, in order:
  1. `"a member comments on a live game as themselves only"`: A inserts `{ game_id, author_id: a, body: "  nice shot  " }` → no error, stored body `"nice shot"`; A inserts with `author_id: b` → error matching `/row-level security/`.
  2. `"a sixth comment inside ten seconds is refused"`: A inserts 4 more quickly (5 total) → ok; the next → error `/commenting too quickly/`.
  3. `"a stale game takes no comments"`: admin sets the row's `updated_at` to 4 hours ago; A inserts → error `/that game is over/`; admin sets `updated_at` back to now.
  4. `"comments go with the game"`: admin deletes the live row → `live_comments` with that `game_id`: count 0.
- [ ] **Step 2: Run** `npx vitest run tests/table-talk.integration.test.ts` — Expected: FAIL (`live_games.id` / `live_comments` do not exist).
- [ ] **Step 3: Write `0029_table_talk.sql`**: the spec §1 DDL verbatim (`add column id`, `add constraint live_games_id_key unique (id)`, `create table live_comments`, both indexes, RLS + two policies, publication), plus `live_comments_before_insert()` (security definer, `set search_path = public`) and its `before insert` trigger: if no `live_games` row with `id = new.game_id` and `updated_at > now() - interval '3 hours'` → `raise exception 'that game is over'`; if the author has ≥ 5 comments with `created_at > now() - interval '10 seconds'` → `raise exception 'slow down — you are commenting too quickly'`; `new.created_at := now(); new.body := trim(new.body);`. The game check comes first so a deleted game reads as over, not as an FK error.
- [ ] **Step 4: Apply** with the Supabase MCP `apply_migration` (name `0029_table_talk`).
- [ ] **Step 5: Run** the integration test — PASS 4/4.
- [ ] **Step 6: Commit** `feat(talk): live game ids and table talk comments`

### Task 2: `lib/table-talk.ts` — pure rules

**Files:** Create `lib/table-talk.ts`, `tests/table-talk.test.ts`

**Interfaces:**
- Produces:
  - `interface LiveComment { id: number; game_id: string; author_id: string; body: string; created_at: string }`
  - `mergeComments(have: LiveComment[], incoming: LiveComment[]): LiveComment[]` — union by id, ascending id; negative ids (optimistic) sort after all positive ids in insertion order.
  - `talkSummary(comments: LiveComment[], names: Record<string, string>): { count: number; latest: { name: string; body: string } | null }` — count excludes optimistic (negative id) rows; `latest` is the highest positive id, `name` the author's first name (`"Member"` if unknown).
  - `validateComment(body: string): string | null` — `Write something first.` / `Keep it under 280 characters.` / null.
  - `shouldResetLive(existing: { updated_at: string; opponent_id: string } | null, opponentId: string, now: Date): boolean`.
  - `PUSH_QUIET_MS`; `shouldPushComment(previousCommentAt: string | null, now: Date): boolean`.

- [ ] **Step 1: Failing tests** `tests/table-talk.test.ts`, one `it` per function:
  - merge: `mergeComments([c(1), c(3)], [c(2), c(3)]).map(x => x.id)` → `[1, 2, 3]`; `mergeComments([c(1), c(-1)], [c(2)])` → ids `[1, 2, -1]`; replacing the optimistic row is done by the caller filtering `-1` out, so `mergeComments([c(1)], [c(2), c(2)])` → `[1, 2]`.
  - summary: three comments by `"u1"` (`names: { u1: "Player One" }`) with bodies "a","b","c" → `{ count: 3, latest: { name: "Player", body: "c" } }`; `[]` → `{ count: 0, latest: null }`; an optimistic `-1` row is not counted; unknown author → name `"Member"`.
  - validate: `"   "` → `"Write something first."`; `"x".repeat(281)` → `"Keep it under 280 characters."`; `" hi "` → `null`; `"x".repeat(280)` → `null`.
  - reset: `null` → false; fresh (`updated_at` 1 min before `now`) same opponent → false; fresh other opponent → true; stale (4 h before) same opponent → true.
  - push: `PUSH_QUIET_MS === 120_000`; `null` → true; 30 s ago → false; 3 min ago → true.
- [ ] **Step 2: Run** `npx vitest run tests/table-talk.test.ts` — FAIL (module missing).
- [ ] **Step 3: Implement** (staleness via `isFresh` from `lib/live.ts`).
- [ ] **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `feat(talk): table talk rules`

### Task 3: `liveCommentPayload`

**Files:** Modify `lib/push.ts`, `tests/push.test.ts`

**Interfaces:** Produces `liveCommentPayload(input: { gameId: string; authorName: string; body: string; url: string }): PushPayload`.

- [ ] **Step 1: Failing test**: `liveCommentPayload({ gameId: "g1", authorName: "Player C", body: "Nice\nshot", url: "/live/r1" })` → `{ title: "Player on your game", body: "Nice shot", url: "/live/r1", tag: "live:g1", category: "messages" }`; a 200-char body → `body` length 120.
- [ ] **Step 2: Run** `npx vitest run tests/push.test.ts` — FAIL.
- [ ] **Step 3: Implement** with `first` and `flatten`.
- [ ] **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `feat(talk): push copy for a comment on your game`

### Task 4: Server — publish resets, post a comment

**Files:**
- Modify: `app/(member)/matches/new/live-actions.ts`
- Create: `app/(member)/live/actions.ts`

**Interfaces:**
- Consumes: Task 2 `shouldResetLive`, `shouldPushComment`, `validateComment`, `LiveComment`; Task 3 `liveCommentPayload`; `notify`.
- Produces: `publishLiveGame(input: LiveInput): Promise<{ error: string | null; gameId: string | null }>` (every existing `return` gains `gameId: null`, the upsert selects `id`); `postLiveComment(input: { gameId: string; body: string }): Promise<{ comment: LiveComment } | { error: string }>`.

- [ ] **Step 1:** `publishLiveGame`: after the recently-sent check, read the reporter's row (`updated_at, opponent_id`); if `shouldResetLive(row, input.opponentId, new Date())` delete it first; then the existing upsert with `.select("id").single()`; return `{ error, gameId }`.
- [ ] **Step 2:** `postLiveComment`: uuid check (same `UUID_RE` as `app/(member)/chat/actions.ts`) and `validateComment`; insert through the user's client selecting `id, game_id, author_id, body, created_at`; map trigger errors (`/too quickly/` → `Slow down — you're commenting too quickly.`, `/over/` → `That game is over.`, anything else → `Couldn't send — try again.`). Then, in a `try` that only `console.warn`s: previous comment on the game (`lt("id", comment.id)`, newest first, `maybeSingle`) → stop unless `shouldPushComment(prev?.created_at ?? null, new Date())`; load the game's `reporter_id, opponent_id` and the author's `display_name` with the service client; `notify` the reporter with url `/matches/new` and the opponent with url `/live/{reporter_id}` (two calls, one candidate each, `excludeId` the author, category `messages`). Return `{ comment }`.
- [ ] **Step 3: Verify** `npx tsc --noEmit` and `npx eslint "app/(member)/live" "app/(member)/matches/new"` — clean.
- [ ] **Step 4: Commit** `feat(talk): post a comment; a new game starts a new thread`

### Task 5: UI — spectator page, Home card, scoreboard strip

**Files:**
- Create: `components/table-talk.tsx`, `app/(member)/live/[reporterId]/page.tsx`, `components/live-refresh.tsx`, `e2e/table-talk.spec.ts`
- Modify: `components/live-game-card.tsx`, `components/live-home.tsx`, `app/(member)/page.tsx`, `app/(member)/matches/new/report-form.tsx`

**Interfaces:**
- Consumes: Task 2, Task 4.
- Produces:
  - `useLiveComments(gameId: string | null, initial: LiveComment[], initialNames: Record<string, string>): { comments: LiveComment[]; names: Record<string, string>; send(body: string): Promise<string | null> }` — loads the newest 50 when `gameId` changes and `initial` is empty, subscribes to INSERTs filtered `game_id=eq.{gameId}`, fills unknown author names from `profiles`, `send` adds an optimistic row (decreasing negative ids from a ref counter), calls `postLiveComment`, swaps it for the returned row or removes it and returns the error.
  - `TableTalk({ meId, comments, names, onSend })` — list (avatar xs, muted first name, body; your own rows marked "You") + composer (`Input` 16px, aria-label `Say something to the table`, `ArrowUp` button aria-label `Send comment`), inline error, empty state.
  - `LiveGameCard` gains `talk?: { count: number; latest: { name: string; body: string } | null }` and `link?: boolean` (default true): reporter → `/matches/new`, others → `/live/{reporter_id}`; under the rails when `talk.count > 0`, a muted one-line `MessageCircle` row: `{count} · {name}: {body}`.
  - `LiveRefresh({ reporterId })` — client; `router.refresh()` debounced 400 ms on any `live_games` change with `filter: reporter_id=eq.{reporterId}`.

- [ ] **Step 1: Failing e2e** `e2e/table-talk.spec.ts` (users A, B, C as in `e2e/report-agreed.spec.ts`, prefix `e2e-talk-`): A opens `/matches/new`, searches and picks B (the board goes live after the 600 ms debounce). C logs in, `goto("/")`, clicks the link whose text contains `E2E Talk A` within the Live now section → URL `/live/{A.id}`; C fills `Say something to the table` with `Nice shot` and clicks `Send comment` → `Nice shot` visible. A's page shows `Table talk` and `Nice shot` (Realtime) → A clicks the strip → the dialog shows `Nice shot`. A closes the dialog and clicks `Clear` → C's page shows `This game is over.` within 15 s. DB: `live_comments` for that game id: 0.
- [ ] **Step 2: Run** `npx playwright test e2e/table-talk.spec.ts --workers=1` — FAIL (the live card is not a link for C).
- [ ] **Step 3:** `components/table-talk.tsx` (hook + view), `components/live-refresh.tsx`.
- [ ] **Step 4:** `/live/[reporterId]/page.tsx`: server page — user check; fresh live row (`gte updated_at now − LIVE_STALE_MS`) for the reporter with both players (same join as Home); missing → `PageHeader` (back `/`, title `Live`) + `This game is over.` + link `Back to Home`. Else the newest 50 comments ascending with author names, then `PageHeader` title `{A} vs {B}` (first names), `LiveGameCard` (`link={false}`), a client wrapper rendering `useLiveComments` + `TableTalk`, and `<LiveRefresh reporterId=… />` (rendered in both states).
- [ ] **Step 5:** Home: add `id` to the live select; one `live_comments` query `in("game_id", ids)` (ascending id, `limit(200)`) with `author:profiles!live_comments_author_id_fkey(display_name)`; group per game into `talkSummary`; pass `talk` to each card. `LiveHome` also listens to `live_comments` INSERT.
- [ ] **Step 6:** Scoreboard: `const [gameId, setGameId] = useState<string | null>(null)`; the publish effect stores `r.gameId` when non-null; `clearBoard` sets it null; `const talk = useLiveComments(gameId, [], {})`. When `talk` has a positive-id comment and no duplicate notice: a `Table talk` button at the top of the fixed footer (`{latest.name}: {latest.body}`, count, chevron) opening a Radix `Dialog` bottom sheet (opponent-picker styling) with `TableTalk`. Footer padding: add room for the strip (`pb-72` when the strip and two buttons show).
- [ ] **Step 7: Run** the new e2e + `e2e/report-agreed.spec.ts` + `e2e/report-race.spec.ts` + `e2e/season-feed.spec.ts` — all PASS.
- [ ] **Step 8: Full verify** lint, tsc, unit tests — clean.
- [ ] **Step 9: Commit** `feat(talk): table talk on the live page, Home and the scoreboard`
