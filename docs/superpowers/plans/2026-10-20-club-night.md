# Club Night Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A per-school club night with a shared line for N tables: members join with one tap, the app calls the first two to each free table (one keeps score), a reported result frees the table, and the next pair is called.

**Architecture:** Three tables (`club_nights`, `night_line`, `night_tables`) written only by `security definer` functions that serialize on one advisory lock and end by filling free tables. Server actions call them with the member's client and push whoever was just called. Pure status/ordering logic in `lib/night.ts`; one loader `lib/night-data.ts` feeds `/night`, Home and Events; one Realtime listener refreshes the pages.

**Tech Stack:** Next.js 16 App Router, Supabase Postgres + Realtime, vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-20-club-night-design.md`

## Global Constraints

- Migration 0030 is additive and contains no `drop` statement (the MCP refuses destructive statements without an interactive confirmation).
- Public repo: invented names only.
- One open night per school; only that school's approved members see or touch it. Tables 1–8 (default 2). Idle 6 h = over (`NIGHT_IDLE_MS = 6 * 3_600_000`).
- Strict FIFO by `joined_at`, tie by `profile_id`; the lowest-numbered free table first; `player_a` = earlier in line = scorekeeper.
- Tests and e2e use test users in a school with **no approved real members**; they skip if none exists and return early if that school already has an open night.
- Copy: page title `Club night`; intro `Start the line when you get to the tables. Everyone joins from their phone; the app calls the next two to each free table.`; buttons `Start club night`, `Get in line`, `Leave line`, `Start game`, `Watch the table`, `Free table`, `End club night`, `Back in line` (= Get in line after a game); sections `Tables`, `Up next`; free row `Free`; empty line `Nobody in line.`; push title `You're up on table {n}`, bodies `vs {Name}. You keep score — tap Start game at the table.` / `vs {Name}. {first} keeps score.`; refusals `A club night is already on.`, `That club night is for another school.`, `That club night is over.`, `You're already in line or at a table.`, `Only whoever started the night or an admin can do that.`, `Free that table first.`, `Only its players, whoever started the night or an admin can free a table.`.
- Verify: `npm run lint`, `npx tsc --noEmit`, `npx vitest run --exclude "**/*.integration.test.ts"`, `npx vitest run tests/night.integration.test.ts`, `npx playwright test e2e/<spec> --workers=1`.

## Review Focus

- Two members joining at the same instant (or a join racing a free): never three at one table, never one person on two tables — the advisory lock + `_fill_tables` inside every function; integration test asserts row counts after each step.
- A member who changes school (or is suspended) while in line or at a table: they can no longer act on that night; the night is not stuck — `free_night_table` by the starter/admin still works (integration test: non-school member refused).
- The scorekeeper opens `Start game` while holding a draft against someone else: the board switches to the called opponent; a draft already against them is kept — unit test on `startBoard` (Task 5) + the e2e's Start game step (Task 6).
- A rematch the same evening: no "already have a game today" notice — unit test on `findDuplicate(..., since)` (Task 5) + e2e flow.
- A night left open overnight: Home stops showing it after 6 idle hours and the next Start closes it — unit test on `isNightOpen` (Task 2), SQL in Task 1.

---

### Task 1: Migration 0030 — nights, line, tables, functions

**Files:** Create `supabase/migrations/0030_club_night.sql`, `tests/night.integration.test.ts`

**Interfaces:**
- Produces tables per spec §1 (with `school_id`), helpers `my_school_id() returns uuid` and `in_night_school(p_night uuid) returns boolean` (security definer, stable), and RPCs (all return `table(table_no smallint, player_a uuid, player_b uuid)` unless noted): `open_club_night(p_tables int) returns uuid`, `set_night_tables(p_night uuid, p_tables int)`, `close_club_night(p_night uuid) returns void`, `join_night_line(p_night uuid)`, `leave_night_line(p_night uuid) returns void`, `free_night_table(p_night uuid, p_table_no int)`, `night_game_reported(p_other uuid)`, `night_table_call(p_other uuid) returns timestamptz`. Internal `_fill_tables(p_night uuid)` with execute revoked from everyone but `postgres`.

- [ ] **Step 1: Failing integration test** `tests/night.integration.test.ts` (pattern: `tests/table-talk.integration.test.ts`). `beforeAll`: find a school none of whose `status='approved'` profiles exists (`select id from schools` then per-school count); none → `skip = true`. If that school has a night with `closed_at is null` → `skip = true`. Create approved users A, B, C, D in that school (`night-{x}-{stamp}@example.com`), sign each in once. `afterAll`: admin deletes `club_nights` opened by them, then the users. Each `it` begins `if (skip) return;`. One sequential `it("runs a night: line, calls, frees, permissions")`:
  1. A `open_club_night({ p_tables: 1 })` → uuid `night`; A again → error `/already on/`.
  2. A `join_night_line({ p_night })` → `[]`; A again → error `/already in line/`.
  3. B joins → `[{ table_no: 1, player_a: A, player_b: B }]`; `night_line` rows: 0; `night_tables` rows: 1.
  4. C joins → `[]`; D `free_night_table({ p_night, p_table_no: 1 })` → error `/Only its players/`.
  5. B `night_table_call({ p_other: A })` → a timestamp; A `night_game_reported({ p_other: B })` → `[]` (only C waits); `night_tables` rows: 0.
  6. B joins → `[{ table_no: 1, player_a: C, player_b: B }]` (C joined before B rejoined).
  7. D `set_night_tables({ p_night, p_tables: 2 })` → error `/Only whoever started/`; A `set_night_tables({ p_night, p_tables: 0 })` → error; A `set_night_tables({ p_night, p_tables: 2 })` → `[]`.
  8. D joins, then `leave_night_line` → `night_line` rows: 0.
  9. A `close_club_night({ p_night })` → no error; `club_nights.closed_at` not null; line and tables rows: 0; A `join_night_line` → error `/over/`.
- [ ] **Step 2: Run** `npx vitest run tests/night.integration.test.ts` — FAIL (functions missing).
- [ ] **Step 3: Write the migration** per spec §1. Each member-callable function: `perform pg_advisory_xact_lock(hashtext('secbl_night'))`; refuse unless `is_approved()`; load the night `for update`, refuse `That club night is over.` when closed or `touched_at < now() - interval '6 hours'`, `That club night is for another school.` when `school_id <> my_school_id()`; do the work; `update club_nights set touched_at = now()`; `return query select * from _fill_tables(p_night)` where it fills. `_fill_tables` loops: lowest `t in 1..tables` with no `night_tables` row and ≥ 2 line rows → take the two earliest (`order by joined_at, profile_id limit 2`), delete them from the line, insert `(night, t, first, second)`, `return next`. `night_game_reported`/`night_table_call` look across open nights of the caller's school for a row with `{player_a, player_b} = {auth.uid(), p_other}`. RLS: `club_nights` select `is_approved() and school_id = my_school_id()`; `night_line`/`night_tables` select `is_approved() and in_night_school(night_id)`. `replica identity full` on `night_line`, `night_tables`; all three added to `supabase_realtime`. Grants: revoke from `public, anon`, grant to `authenticated` (helpers and `_fill_tables` revoked from `authenticated` too except the two helpers used by policies, which stay executable by `authenticated`).
- [ ] **Step 4: Apply** via MCP `apply_migration` (`0030_club_night`).
- [ ] **Step 5: Run** the integration test — PASS (or skipped-by-flag only if no empty school; record which in the ledger).
- [ ] **Step 6: Commit** `feat(night): club nights, the line and the tables`

### Task 2: `lib/night.ts` — status and order

**Files:** Create `lib/night.ts`, `tests/night.test.ts`

**Interfaces:**
- Produces: `NIGHT_IDLE_MS`; types `Night { id; school_id; opened_by: string | null; tables: number; opened_at; touched_at; closed_at: string | null }`, `LineRow { profile_id; joined_at }`, `TableRow { table_no; player_a; player_b; called_at }`; `isNightOpen(night: Night | null, now: Date): boolean`; `lineOrder(line: LineRow[]): LineRow[]`; `tableSlots(tables: number, rows: TableRow[]): { tableNo: number; row: TableRow | null }[]`; `myNightStatus(night: Night | null, line: LineRow[], tables: TableRow[], meId: string, now: Date): NightStatus` with `NightStatus = { kind: "none" } | { kind: "out" } | { kind: "waiting"; position: number; ahead: number } | { kind: "playing"; tableNo: number; opponentId: string; keepsScore: boolean }`; `canManageNight(night, meId, isAdmin): boolean`; `canFreeTable(row, night, meId, isAdmin): boolean`; `nightCardLine(status: NightStatus, counts: { tables: number; waiting: number }, opponentName: string | null): string`.

- [ ] **Step 1: Failing tests** `tests/night.test.ts`:
  - `isNightOpen`: null → false; closed → false; touched 5 h ago → true; 7 h ago → false.
  - `lineOrder`: `[{p:"b",t:"…:02"},{p:"a",t:"…:01"},{p:"c",t:"…:01"}]` → `["a","c","b"]`.
  - `tableSlots(3, [row(2)])` → slots 1..3 with only 2 occupied.
  - `myNightStatus`: no/closed night → `none`; in line third → `{ waiting, position: 3, ahead: 2 }`; at table 2 as `player_a` → `{ playing, tableNo: 2, opponentId: B, keepsScore: true }`; as `player_b` → `keepsScore: false`; neither → `out`.
  - `canManageNight`: starter → true; admin → true; other → false. `canFreeTable`: either player, starter, admin → true; other → false.
  - `nightCardLine`: waiting 1 → `"You're next in line"`; waiting 3 → `"You're 3rd in line"`; playing keeps score → `"You're up on table 2 vs Player B"`; playing not → `"Table 2 vs Player A — Player keeps score"`; out → `"2 tables · 5 in line"`; 1 table 0 waiting → `"1 table · nobody in line"`.
- [ ] **Step 2: Run** `npx vitest run tests/night.test.ts` — FAIL.
- [ ] **Step 3: Implement.** Ordinals: 2nd, 3rd, 4th… (`1` reads "next").
- [ ] **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `feat(night): night status and line order`

### Task 3: `nightCalledPayload`

**Files:** Modify `lib/push.ts`, `tests/push.test.ts`

**Interfaces:** `nightCalledPayload(input: { nightId: string; tableNo: number; opponentName: string; keepsScore: boolean }): PushPayload`.

- [ ] **Step 1: Failing test**: `({ nightId: "n1", tableNo: 2, opponentName: "Player B", keepsScore: true })` → `{ title: "You're up on table 2", body: "vs Player B. You keep score — tap Start game at the table.", url: "/night", tag: "night:n1", category: "matches" }`; `keepsScore: false, opponentName: "Player A"` → body `"vs Player A. Player keeps score."`.
- [ ] **Step 2–4:** run (FAIL), implement, run (PASS).
- [ ] **Step 5: Commit** `feat(night): push copy for being called to a table`

### Task 4: Loader and actions

**Files:** Create `lib/night-data.ts`, `app/(member)/night/actions.ts`

**Interfaces:**
- Produces: `loadNight(supabase: SupabaseClient, meId: string, now: Date): Promise<{ night: Night | null; line: LineRow[]; tables: TableRow[]; people: Map<string, AvatarIdentity>; isAdmin: boolean; live: Map<string, { reporter_score: number; opponent_score: number }> }>` — the caller's school's newest night with `closed_at is null` (null unless `isNightOpen`), its line and tables, the profiles in them (`id, display_name, avatar_url, ball`), the caller's role, and fresh `live_games` rows keyed by `reporter_id` for the table players. `pushCalled(service, rows: { table_no: number; player_a: string; player_b: string }[], nightId: string): Promise<void>` (exported from `lib/night-data.ts`, server only). Server actions `startNight`, `setTables`, `endNight`, `joinLine`, `leaveLine`, `freeTable` — each `(formData: FormData)`, reading `night_id`, `tables`, `table_no`, and `back` (`"/"` or `"/night"`, anything else → `"/night"`).
- [ ] **Step 1:** Implement `loadNight` and `pushCalled` (names from one `profiles` select; `notify` per player with `nightCalledPayload`, `keepsScore` true for `player_a`; `night_id` for the payload's `nightId`).
- [ ] **Step 2:** Actions: user client RPC → on error redirect `back?error=` + mapped message (the SQL raises the exact Global Constraints copy, lower-cased first letter allowed — capitalise it); on success `pushCalled(createServiceClient(), data ?? [], nightId)`, `revalidatePath("/night")`, `revalidatePath("/")`, `revalidatePath("/events")`, redirect `back`. `startNight` reads `tables` (1–8) and redirects `/night`.
- [ ] **Step 3:** `reportMatch` (both result paths, after the result is written, before the redirects) and `confirmTheirs` (before `confirmMatch`, using the pending match's `reporter_id` as `p_other`) call `night_game_reported` with the user's client and `pushCalled` on the rows; wrapped so a failure only `console.warn`s.
- [ ] **Step 4: Verify** tsc + lint clean.
- [ ] **Step 5: Commit** `feat(night): night actions; a reported result frees the table`

### Task 5: Duplicate check knows the table call

**Files:** Modify `lib/report-form.ts`, `tests/report-form.test.ts`, `app/(member)/matches/new/actions.ts` (`loadDuplicate`)

**Interfaces:** `findDuplicate(rows, meId, opponentId, playedAt, since?: string | null): DuplicateGame | null` — rows with `created_at < since` are ignored. `startBoard(opponentRating: number, myRating: number, raceTo: number): { raceTo: number; spot: number; spotTo: "you" | "them" | null; you: number; them: number }` — the board `applyFormat` would set up for a newly picked opponent (suggested spot, starting scores); used by Task 6's Start game.

- [ ] **Step 1: Failing tests** in `tests/report-form.test.ts`: a confirmed same-day row created `20:00Z`; `findDuplicate(rows, "me", "them", day, "2026-10-20T21:00:00Z")` → `null`; with `since` `19:00Z` → the row; with no `since` → the row. `startBoard(450, 450, 5)` → `{ raceTo: 5, spot: 0, spotTo: null, you: 0, them: 0 }`; `startBoard(650, 450, 5)` equals what `suggestedSpot(5, 450, 650)` + `startingScores(5, spot, to)` give (assert spot > 0, `spotTo: "you"`, `you === spot`, `them === 0`).
- [ ] **Step 2–4:** run (FAIL), implement, run (PASS).
- [ ] **Step 5:** `loadDuplicate` calls `supabase.rpc("night_table_call", { p_other: opponentId })` (errors → null) and passes it as `since`.
- [ ] **Step 6: Commit** `feat(night): a rematch called to the table is not a duplicate`

### Task 6: Screens — /night, Home card, Events row, Start game

**Files:**
- Create: `app/(member)/night/page.tsx`, `components/night-card.tsx` (server), `components/live-night.tsx` (client listener), `components/end-night-button.tsx` (client confirm), `e2e/club-night.spec.ts`
- Modify: `app/(member)/page.tsx`, `app/(member)/events/page.tsx`, `app/(member)/matches/new/page.tsx`, `app/(member)/matches/new/report-form-loader.tsx`, `app/(member)/matches/new/report-form.tsx`, `components/live-home.tsx`, `e2e/cleanup.ts`

**Interfaces:**
- Consumes Tasks 2–4.
- Produces: `NightCard({ data, meId, back })` — the status sentence and the one primary action form for your state (Get in line / Leave line / Start game link / Watch the table link, plus Free table), used on Home (`back="/"`) and at the top of `/night` (`back="/night"`); a `ReportMatchForm` prop `initialOpponentId?: string`.

- [ ] **Step 1: Failing e2e** `e2e/club-night.spec.ts`: choose the empty school as in Task 1 (skip if none / open night there); users A, B there; `trackUser`. A: `/night` → pick `1` table → `Start club night` → `Get in line` → `You're next in line`. B: Home → Club night card → `Get in line`. A reloads `/night`: `You're up on table 1 vs E2E` and `Start game`; B's Home: `E2E keeps score` and `Watch the table`. A clicks `Start game` → URL `/matches/new?opponent={B}`; the search button shows B's name; race to 3, zero the spot, A 3 – B 1, `We agreed — count it` → `Counted — ratings updated`. A `/night`: `Tables` row `Free`; `Up next` shows `Nobody in line.`; A accepts the confirm dialog and clicks `End club night` → `Start club night` visible again. Cleanup: `e2e/cleanup.ts` deletes `club_nights` with `opened_by` = each tracked user before deleting users.
- [ ] **Step 2: Run** — FAIL (no `/night`).
- [ ] **Step 3:** `/night` page (spec §4): no night → intro, a radio-pill picker 1–8 (default 2, `name="tables"`, styled like the scoreboard's game pills) and `Start club night`; open → `NightCard`, `Tables` (`ListRow` per `tableSlots`: avatars + names + live score if the scorekeeper has a fresh `live_games` row against the other; `Free`; a `Free table` form where `canFreeTable`), `Up next` (numbered rows, yours marked `You`), and for `canManageNight` a tables stepper (two forms posting `setTables` with n−1 / n+1) and `EndNightButton`. `<LiveNight />` on the page.
- [ ] **Step 4:** Home: `loadNight` in the page's data; when open, `NightCard` above Live now with eyebrow `Club night` + pulsing dot + chevron link to `/night`. `LiveHome` also listens to `club_nights`, `night_line`, `night_tables` (`*`). Events: first row `ListRow` `Club night` → `/night`, meta `On now · {n} in line` or `Start the line for the tables`.
- [ ] **Step 5:** `/matches/new?opponent=`: the page passes `initialOpponentId` (only if it is in the approved opponents list) through the loader; the form's state initialiser keeps a draft already against that opponent, else a fresh draft with that opponent and `startBoard(opponent.rating, myRating, DEFAULT_RACE)`.
- [ ] **Step 6: Run** the new e2e and `e2e/report-agreed.spec.ts`, `e2e/table-talk.spec.ts`, `e2e/report-race.spec.ts` — PASS.
- [ ] **Step 7: Full verify** lint, tsc, unit tests.
- [ ] **Step 8: Commit** `feat(night): club night page, Home card and Start game`
