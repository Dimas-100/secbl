# SECBL Club Night — a line for the tables

**Date:** 2026-10-20
**Status:** The owner liked the idea 2026-10-20 ("the queue seems like a good idea too") and asked for it to be designed and built autonomously, so every call below is an **Assumption** unless marked otherwise. Plan: `docs/superpowers/plans/2026-10-20-club-night.md`.
**Builds on:** `2026-10-20-agreed-results-design.md` (a result can count on the spot), `2026-10-20-table-talk-design.md`, `2026-10-06-seasons-feed-live-design.md` (Live now, Realtime refresh on Home).

## 0. Why, and the calls

On 2026-10-20 the club had 7 members and 3 confirmed games ever. The app has rich features and almost no use in the room. A line for the tables gives every member a reason to open the app at every club night — "am I next?" — and turns each game it calls into a logged game.

| # | Topic | What ships |
|---|---|---|
| 1 | Shape | One shared line for the night, and N numbered tables. When a table is free and two people are waiting, the first two in line are called to it. |
| 2 | Pairing rule | Strict first-in, first-out, next two play. "Winner stays" is a non-goal for v1. |
| 3 | Who starts a night | Any approved member ("Start club night", pick the number of tables, 1–8, default 2). One night open at a time. |
| 4 | Who can change tables / end the night | The member who started it, or an admin. |
| 5 | Ending | Explicit "End club night", or automatically: a night with no change for 6 hours is treated as over and the next "Start" closes it. |
| 6 | Joining | One tap "Get in line"; one tap "Leave line". You can't be in line while you're at a table. |
| 7 | Being called | The two players are taken off the line and put on the lowest-numbered free table; both get a push "You're up on table 2 — vs {Name}" (category Matches). The night page and Home show it with a **Start game** button that opens the scoreboard with that opponent picked. |
| 8 | Freeing a table | Automatically when either player sends a result for a game between those two (agreed or not). By hand: **Free table**, available to its two players, the night's starter and admins (a no-show, a game they won't log). |
| 9 | After a game | Nobody is put back in line automatically; Home and the night page offer **Back in line** in one tap. |
| 10 | Announcing a night | No push when a night starts (it would buzz every member every week). |
| 11 | Where it lives | A new page `/night`. Home shows a compact Club night card at the top while a night is open. When none is open, the Events page has a "Club night" row that leads to `/night` to start one. |
| 12 | Scope | A night belongs to the **school** of the member who starts it: one open night per school, and only that school's approved members see it, join it, or start one. Members of other schools never see it (a night at one venue must not nag the rest of the league). Cross-school nights are a non-goal for v1. |
| 13 | Who keeps score | **One scorekeeper per table: `player_a`, the one who joined the line first.** Only they get **Start game**; the other player sees "{first} keeps score" with a link to watch the table (`/live/{player_a}`). The two pushes say so. This keeps one live board per table. |
| 14 | Rematches the same night | A pair called again the same evening must not trip the "already have a game today" notice. The duplicate check ignores games created before the current table call: when the reporter and opponent occupy a table in an open night, `findDuplicate` only considers rows with `created_at >= called_at`. |
| 15 | Tests and real members | Tests run against production, so test users are put in a school with **no approved real members** (picked at run time); a test night is then invisible and unjoinable for real members. If every school has a real member, the night tests skip. |
| 16 | Build order | After Agreed Results and Table Talk, on a branch stacked on theirs; migration `0030`. |

## 1. Data (migration `0030_club_night.sql`)

```sql
create table public.club_nights (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  opened_by uuid references public.profiles(id) on delete set null,
  tables smallint not null check (tables between 1 and 8),
  opened_at timestamptz not null default now(),
  touched_at timestamptz not null default now(),   -- last change of any kind; the 6-hour idle rule
  closed_at timestamptz
);
create unique index club_nights_one_open on public.club_nights (school_id) where closed_at is null;

create table public.night_line (
  night_id uuid not null references public.club_nights(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (night_id, profile_id)
);

create table public.night_tables (
  night_id uuid not null references public.club_nights(id) on delete cascade,
  table_no smallint not null check (table_no between 1 and 8),
  player_a uuid not null references public.profiles(id) on delete cascade,
  player_b uuid not null references public.profiles(id) on delete cascade,
  called_at timestamptz not null default now(),
  primary key (night_id, table_no),
  check (player_a <> player_b)
);
```

A row in `night_tables` means that table is occupied; a free table has no row. `player_a` is always the one who joined the line first and keeps score. RLS on all three: approved members of the night's school `select` (a `security definer` helper `public.in_night_school(night_id)` compares the night's `school_id` with the caller's profile, so the policies never subquery each other); no client write policies. `alter publication supabase_realtime add table` for all three (`night_line` and `night_tables` need `replica identity full` so DELETE events carry `night_id` for the refresh listener; the payload is only ids).

### Functions — the only write path

All `security definer`, `set search_path = public`, granted to `authenticated` (revoked from `public, anon`), each starting with `perform pg_advisory_xact_lock(hashtext('secbl_night'))` and `if not public.is_approved() then raise exception ...`. Every mutating function bumps `touched_at` and ends by calling the internal `_fill_tables(night_id)`.

- `_fill_tables(p_night uuid) returns table(table_no smallint, player_a uuid, player_b uuid)` (internal; `revoke` from everyone): while there is a free table number in `1..tables` and at least two rows in `night_line`, take the two earliest `joined_at` (tie → `profile_id`), delete them from the line, insert them on the lowest free table, and return the new assignment rows.
- `open_club_night(p_tables int) returns uuid`: the caller's school is the night's school (refuse if the caller has none); closes that school's open night if idle more than 6 hours; refuses if one is still open ("A club night is already on."); inserts with `opened_by = auth.uid()`.
- Every other member-callable function refuses a caller whose school is not the night's school ("That club night is for another school.").
- `set_night_tables(p_night uuid, p_tables int) returns setof (table_no, player_a, player_b)`: starter or admin; refuses to drop below an occupied table number; then fills.
- `close_club_night(p_night uuid)`: starter or admin; sets `closed_at`, deletes the line and tables.
- `join_night_line(p_night uuid) returns setof (...)`: the night must be open and not idle; refuses if the caller is already in line or at a table; inserts; fills.
- `leave_night_line(p_night uuid)`: deletes the caller's line row.
- `free_night_table(p_night uuid, p_table_no int) returns setof (...)`: caller must be one of the two players, the starter or an admin; deletes the row; fills.
- `night_game_reported(p_other uuid) returns setof (...)`: if any open night has a table occupied by exactly `{auth.uid(), p_other}`, delete it and fill; otherwise a no-op returning nothing. Called after every report.
- `night_table_call(p_other uuid) returns timestamptz`: the `called_at` of an open night's table occupied by exactly `{auth.uid(), p_other}`, or null. Used by the duplicate check (§0 #14).

The functions that return assignments let the server action push exactly the people it just called. Every refusal is a plain sentence the action shows.

## 2. Server actions (`app/(member)/night/actions.ts`)

`startNight`, `setTables`, `endNight`, `joinLine`, `leaveLine`, `freeTable` — each calls its function with the user's client, then `pushCalled(service, rows)` for any assignments returned, `revalidatePath("/night")`, `revalidatePath("/")`, and redirects back to the page the form came from (`/night` or `/`) with a message or error.

`pushCalled` loads both players' names and calls `notify` once per player: `nightCalledPayload({ nightId, tableNo, opponentName, keepsScore })` → title `You're up on table {n}`, body `vs {Name}. You keep score — tap Start game at the table.` for `player_a`, `vs {Name}. {first} keeps score.` for `player_b`; url `/night`, tag `night:{nightId}`, category `matches`.

`reportMatch` (both the agreed and the send paths) calls `night_game_reported(opponent)` after the result is written, then `pushCalled` on what it returns. `confirmTheirs` calls it before handing over to `confirmMatch` (which ends in a redirect): by then the players are confirming the result, so the table is over either way. Never fails the report: errors are logged and swallowed.

`findDuplicateReport` and `reportMatch`'s backstop call `night_table_call(opponent)`; when it returns a time, rows created before it are not duplicates (pass it to `findDuplicate` as an optional `since`).

## 3. Pure logic (`lib/night.ts`, test-first)

- `NIGHT_IDLE_MS = 6 * 3_600_000`; `isNightOpen(night, now)` (not closed and touched within the idle window).
- `myNightStatus(night, line, tables, meId)` → `{ kind: "none" } | { kind: "waiting", position, ahead } | { kind: "playing", tableNo, opponentId, keepsScore } | { kind: "out" }` where `out` means open night, not in line, not at a table, and `keepsScore` is true for `player_a`.
- `lineOrder(line)`: sorted by `joined_at`, then `profile_id` (the same order `_fill_tables` uses).
- `tableSlots(tables, rows)`: `1..tables` with the occupying row or null.
- `canManageNight(night, meId, isAdmin)`, `canFreeTable(row, night, meId, isAdmin)`.
- `nightCardLine(status, counts)`: the one-line summary for the Home card ("You're 3rd in line", "You're up on table 2 vs Player B", "2 tables · 5 in line").

## 4. UI

### `/night` (server page + `components/live-night.tsx` refresh listener)

- **No open night**: `PageHeader` "Club night", a sentence ("Start the line when you get to the tables. Everyone joins from their phone; the app calls the next two to each free table."), a `Segmented` 1–8 table picker (default 2) and **Start club night**.
- **Open night**:
  - Your status block (eyebrow "You"): a `nightCardLine` sentence and the one primary button for your state — **Get in line**, **Leave line**, or, when playing, **Start game** (`/matches/new?opponent={id}`) if you keep score / **Watch the table** (`/live/{player_a}`) if you don't — plus a muted **Free table** when you're playing.
  - **Tables**: one hairline row per table: "Table 1", the two avatars and names, and the live score if those two have a fresh `live_games` row; "Free" otherwise. **Free table** on occupied rows for those allowed.
  - **Up next**: the line as numbered rows (1, 2, 3 …) with avatars; your row marked "You". Empty: "Nobody in line."
  - Starter/admin footer: tables stepper (− n +) and **End club night** (`window.confirm` like End season).
- `LiveNight` subscribes to `postgres_changes` on `club_nights`, `night_line`, `night_tables` and `live_games` and calls `router.refresh()` debounced 400 ms, plus on `visibilitychange` — the same pattern as `LiveHome`.

### Home

While a night is open: a card above **Live now** — eyebrow "Club night" with the pulsing dot, the `nightCardLine` sentence, the primary action button for your state (same forms as `/night`, posting back to `/`), and a chevron link to `/night`. `LiveHome` adds the three night tables to its listener.

### Events

A first row on the Events page, above the tabs: `ListRow` "Club night" with meta "On now · {n} in line" or "Start the line for the tables", linking to `/night`.

### Scoreboard

`/matches/new?opponent={id}`: when the id is an approved member other than you, the board starts fresh with that opponent picked (replacing a draft against someone else; keeping a draft already against them). Unknown ids are ignored.

## 5. Tests

- `tests/night.test.ts`: every function in §3, including ties in `lineOrder`, idle expiry, and the status for each state.
- `tests/push.test.ts`: `nightCalledPayload`.
- `tests/report-form.test.ts`: `findDuplicate` with `since` (an older same-day game is ignored, a newer one still flags).
- Test users for the night tests are created in a school with no approved real members (a school none of whose approved profiles has an `e2e`-style email or `E2E` display name is "real"); both suites skip when there is none, and return early if that school already has an open night.
- `tests/night.integration.test.ts` (live DB, test users, one sign-in per user): open with 1 table; A joins (no call); B joins → called to table 1, line empty; C joins → waiting; `night_game_reported` by A vs B frees table 1 and calls nobody (only C waits); B rejoins → B and C called; `leave_night_line`; `free_night_table` permissions (a non-player non-starter is refused); close; a second open while one is open is refused.
- `e2e/club-night.spec.ts`: A starts a 1-table night on `/night`, joins; B joins from Home and both are called to table 1; A (first in line) sees **Start game**, B sees "{A} keeps score"; A taps **Start game** and the scoreboard has B picked; A counts an agreed result; `/night` shows table 1 free; A ends the night.
- Cleanup: `e2e/cleanup.ts` deletes `club_nights` opened by tracked users before deleting them (`opened_by` is `on delete set null`, so a leaked open night would sit on every real member's Home).

## 6. Non-goals

Winner-stays or challenge mode, per-table lines, skill-matched pairing, check-in XP, announcing a night by push, a history of past nights, linking a night to a calendar event.
