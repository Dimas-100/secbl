# Play & Progress — Stage 3: You page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A player's page tells the story of their pool from match results, top to bottom:
1. level
2. this month in one sentence (your own page only)
3. a real rating chart
4. the last 10 results
5. where they win
6. rivals
7. achievements and history

Someone else's page uses the same layout and adds your record against them.

**Architecture:** All derivations are pure and test-first. They live in `lib/you.ts`:
- form summary
- per-game and above/below-rating splits
- rivals and their line
- the month sentence
- rank at an instant (replayed from `rating_history` and confirmed matches through `lib/ranking.ts`)
- chart series

A server-rendered SVG `RatingChart` picks its range from a `?range=` search param, so it needs no client JS.
`app/(member)/players/[id]/page.tsx` is reassembled in the spec's order. The stat-tile grid, the sparkline, the "Best
win" row and the old head-to-head row are replaced.

**Tech Stack:** Next.js 16 App Router (read `node_modules/next/dist/docs/` before writing code), React 19, Supabase,
vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-21-play-and-progress-design.md`, §5 You page and §6 Someone else's page.
The owner picked the parts: level up top, the month sentence, the rating chart, form, where you win, rivals. Records
fold into the chart and form. Ruling S2-R4 says "this month" means since the 1st of the month in club time.

## Global Constraints

- Branch `feat/play-and-progress`. No migration.
- Public repo: invented names only in tests, fixtures and commits.
- Elevated Dark: dark only, Geist, brass is the one accent, `.eyebrow` for overlines, hairline tokens, existing
  primitives (`Avatar`, `ListRow`, `LevelBar`, `TitleBadge`, `Segmented`, `SectionHeading`, `MatchRow`, `ShowMore`).
  `GOLD_EDGE` is in `lib/utils.ts`.
- All date/time logic goes through `lib/events.ts`: club time is `America/New_York`, and `clubMonthStart` comes from
  Stage 2. React compiler lint rejects `Date.now()` in components. A Server Component cannot pass a function prop to a
  Client Component.
- Ranks come only from `lib/ranking.ts`: rating desc, wins desc, id asc, and members with no confirmed game are
  unranked. Use `STARTING_RATING` (`lib/rating.ts`, 450) for anyone with no history before an instant.
- Names: first name = `name.trim().split(/\s+/)[0] || name`.
- **Copy (exact):**
  - **Month sentence** (own page only):
    - With games this month: `{Month} so far: {g} game{s}, {w} win{s}.`, optionally followed by one clause:
      - ` You climbed from #{a} to #{b}.` when the member was ranked at the month start and is ranked higher now
      - ` You're on the board at #{b}.` when the member was unranked at the month start and is ranked now
    - Otherwise no clause.
    - With no games this month but some before: `No games yet in {Month}. Your last was {Mon D} vs {first}.`
    - With no games ever: no card.
  - **Rating block:**
    - eyebrow `Rating`
    - under the number, `#{rank} · {W}–{L}`, or `{W}–{L}` when unranked
    - at 1–9 games, add the tag `placing {k}/10`
    - at 0 games, replace the block with `Your rating appears after your first game.`
  - **Chart:**
    - ranges `Month` · `Season` · `All`. Season shows only while a season is open.
    - change copy `+{n} this month` / `this season` / `since your first game`, using U+2212 for minus
    - markers labelled `peak {rating}` and `beat {first}`, the second at the best win
    - fewer than 2 points in range: `No rated games this month` / `this season`
  - **Form:**
    - heading `Form`
    - the note `won {w} of your last {n}`
    - then `best streak {k}`, shown only when k ≥ 2
  - **Where you win:**
    - heading `Where you win`
    - per game: `{Game}` on the left, `{W}–{L}` and `{pct}%` on the right
    - then `vs higher-rated` and `vs lower-rated` rows, each shown only when it has games
  - **Rivals:**
    - heading `Rivals`
    - lines (owner = `You` on your own page, else the page owner's first name):
      - `You've won the last {k}` / `{owner} has won the last {k}` when the last k ≥ 2 results all went to the
        owner
      - `{opp} has won the last {k}` when the last k ≥ 2 went to the opponent
      - otherwise `Last played {label}`, using `labelPlayedDate`
  - **You vs card** (others' pages):
    - eyebrow `You vs {first}`, head-to-head `{W} – {L}` in win/loss colours
    - line, from the viewer's side:
      - `You've won the last {k}` / `{first} has won the last {k}`
      - otherwise `Last played {label}`
      - with no games together: `You haven't played each other yet.`
- **Verify:**
  - `npm run lint`
  - `npx tsc --noEmit`
  - `npx vitest run --exclude "**/*.integration.test.ts"`
  - `npm run build`
  - e2e only against a production build on :3100:
    `npx playwright test --config .superpowers/pw-3100.config.ts <spec> --workers=1`

    Never touch :3000. Use the shared private-school helper in `e2e/` (Stage 2 final fix) and its hydration wait.
    Scope text assertions to `getByRole("main")` (the pre-existing duplicate-DOM issue on production builds).

## Review Focus

- **A member with 0, 1, 9 and 10+ games.** Every block is true or absent: no chart, form, splits or rivals at 0. The
  placing tag shows at 1–9. Pinned by `tests/you.test.ts` and the e2e.
- **The month sentence on the 1st.** Month membership follows the New York club date: a game played at 00:30 on the
  1st in New York belongs to the new month. The rank at the month start counts only games confirmed before
  `clubMonthStart`. Pinned by `rankAsOf` and `monthSentence` tests.
- **Ties at 450 at the month start.** Unranked members never produce "climbed from #…". Pinned by `rankAsOf` tests.
- **Rivals and the You-vs line with mixed results** (W, L, W): there is no streak line, so it falls back to `Last
  played`, and a single game is never called a run. Pinned by `rivalLine` tests.
- **Ranges with fewer than 2 points.** The chart never draws a misleading flat line or a "+0" change. Pinned by
  `chartSeries` tests.

---

### Task 1: Form, where you win, rivals (pure)

**Files:**
- Create: `lib/you.ts`, `tests/you.test.ts`

**Interfaces:**
- Consumes: `formDots` (`lib/home.ts`), `labelPlayedDate` (`lib/stats.ts`), `GAME_LABEL` (`lib/identity.ts`).
- Produces:
  ```ts
  export interface YouMatch { id: string; reporter_id: string; opponent_id: string; winner_id: string; game_type: string; played_at: string; confirmed_at: string | null }
  export function formSummary(dots: ("W" | "L")[]): string                         // "won 7 of your last 10"
  export function gameSplits(newestFirst: YouMatch[], ownerId: string): { game: string; label: string; wins: number; losses: number; pct: number }[]  // most-played first
  export function ratingSplits(newestFirst: YouMatch[], ownerId: string, ratingBefore: Map<string, Map<string, number>>): { higher: { wins: number; losses: number }; lower: { wins: number; losses: number } }
  // ratingBefore: match_id → profile_id → rating_before; equal ratings count in neither
  export function rivals(newestFirst: YouMatch[], ownerId: string, n = 3): { opponentId: string; games: number; wins: number; losses: number; run: { k: number; ownerWon: boolean } | null; lastPlayedAt: string }[]  // most games first, then most recent
  export function rivalLine(r: { run: { k: number; ownerWon: boolean } | null; lastPlayedAt: string }, owner: string, opp: string, todayClubDate: string): string
  ```

- [ ] **Step 1: Failing tests** with exact copy from Global Constraints:
  - `formSummary(["W","W","L"])` → `won 2 of your last 3`
  - `gameSplits`: 8-ball 9–3 at 75% comes before 9-ball 2–3 at 40%, and `pct` is rounded
  - `ratingSplits` with equal-rating games excluded
  - `rivals`:
    - sorted by games, then by the newest game
    - a run counts only when it is ≥ 2
    - W, L, W gives `run: null`
  - `rivalLine` covers all four copy variants (own page, other page, opponent run, last played)
- [ ] **Step 2: Run** `npx vitest run tests/you.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the same test command. Expected: PASS.
- [ ] **Step 5: Commit** `feat(you): form, where you win and rivals from match results`

### Task 2: Month sentence, rank at an instant, chart series, and the chart

**Files:**
- Modify: `lib/you.ts`, `tests/you.test.ts`
- Create: `components/rating-chart.tsx`

**Interfaces:**
- Consumes: `rankOf`, `RankRow` (`lib/ranking.ts`); `STARTING_RATING`; `clubMonthStart`, `clubDateOf`
  (`lib/events.ts`).
- Produces:
  ```ts
  export function rankAsOf(memberIds: string[], history: { profile_id: string; rating_after: number; created_at: string }[], matches: { reporter_id: string; opponent_id: string; winner_id: string; confirmed_at: string | null }[], atIso: string, id: string): number | null
  export function monthSentence(input: { month: string; games: number; wins: number; rankStart: number | null; rankNow: number | null; last: { playedAt: string; opponent: string } | null }): string | null
  export type ChartRange = "month" | "season" | "all"
  export function chartSeries(historyOldestFirst: { match_id: string | null; rating_before: number; rating_after: number; created_at: string }[], range: ChartRange, startIso: string | null): { points: { at: string; rating: number; matchId: string | null }[]; change: number | null; peak: { index: number; rating: number } | null }
  // the first point is rating_before of the first row in range; change = last − first; null when fewer than 2 points
  ```
- Produces: `RatingChart({ series, range, ranges, hrefFor, bestWin })`. All props are plain data. `hrefFor` is a
  `Record<ChartRange, string>`, not a function. `bestWin` is `{ index, label } | null`. The component renders an
  inline SVG with the brass line, the peak and best-win markers (labelled per Global Constraints) and the `Segmented`
  range picker, whose options link with `replace`.

- [ ] **Step 1: Failing tests:**
  - `rankAsOf`:
    - ignores games confirmed at or after the instant
    - treats members with no game before the instant as unranked
    - gives anyone without history `STARTING_RATING`
    - breaks ties by wins, then id
  - `monthSentence`: every Global Constraints variant, including singular `1 game, 1 win`, the climb clause, the
    on-the-board clause, no clause when rank fell or held, the no-games-this-month line, and `null` for no games
    ever
  - `chartSeries`:
    - month range with fewer than 2 points → `change: null`
    - all range → the first point is the first `rating_before`
    - the peak index sits at the max
- [ ] **Step 2: Run** `npx vitest run tests/you.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the functions, then `RatingChart`. Fixed viewBox, 100% width, about 120px tall, padding
  for marker labels. Use `aria-label` = `Rating chart, {range}: {first} to {last}`. Markers are circles: brass for
  the peak, win colour for the best win, each with a small muted label. No tooltip JS.
- [ ] **Step 4: Run** the tests, lint and tsc. Expected: PASS.
- [ ] **Step 5: Commit** `feat(you): the month in a sentence and a real rating chart`

### Task 3: Assemble the You page and someone else's page

**Files:**
- Modify: `app/(member)/players/[id]/page.tsx`
- Create: `e2e/you.spec.ts`

**Interfaces:**
- Consumes everything above, plus existing `earnedAchievements`, `nextBadge`, `xpCaption`, `MatchRow`, `ShowMore`,
  `startDm`, `BackButton`, `GOLD_EDGE`.

- [ ] **Step 1: Failing e2e** `e2e/you.spec.ts`, using the shared private-school helper. Users A and B; log in as A.
  1. A's own page (`/players/{a.id}`) shows `Your rating appears after your first game.` It has no `Where you win`
     and no `Rivals` heading, and the level row (`Level 1`) appears above the achievements.
  2. Seed a pending match with the service client: reporter B, opponent A, A wins 5–3, 8-ball race to 5. Use the
     column set from `e2e/home.spec.ts`.
  3. A confirms it on Home (button `Confirm`). This is the real `confirmMatch` path, so ratings and history are
     written properly, and no live game is published.
  4. A's page now shows:
     - the `Rating` block with `placing 1/10`
     - a `Form` note `won 1 of your last 1`
     - `Where you win` with `8-ball` and `1–0`
     - `Rivals` with B's name
     - the month card starting `{Month} so far: 1 game, 1 win.`
  5. B's page, viewed as A, shows the `Play` link (assert its href), `You vs E2E` with `1 – 0`, and no month
     sentence.
- [ ] **Step 2: Run** on :3100 after `npm run build`. Expected: FAIL.
- [ ] **Step 3: Implement the page.**
  - **Data:**
    - Fetch the member's confirmed matches (use `fetchAllPages`, not `limit(50)`) and their full `rating_history`
      with `match_id`.
    - Fetch `rating_history` rows for those match ids (every profile) to build `ratingBefore`.
    - On your own page only, fetch the club-wide confirmed matches (`reporter_id, opponent_id, winner_id,
      confirmed_at`), `rating_history` (`profile_id, rating_after, created_at`) and the approved member ids, all via
      `fetchAllPages`, for `rankAsOf(..., clubMonthStart(now))`. "Now" rank is `rankOf` on the board.
    - Run independent queries in one `Promise.all`.
  - **Order, own page:**
    1. header (gear, messages)
    2. avatar with camera
    3. name, school · favourite game, tagline
    4. `Edit profile` + Share
    5. level row (link to the ladder, with the next-badge line as today)
    6. month card (`bg-card rounded-[20px]`, eyebrow `{Month} so far` or hidden)
    7. rating block + `RatingChart`, default range `season` when a season is open, else `all`, read from `?range=`
    8. `Form`: ten dots oldest → newest plus the note
    9. `Where you win`
    10. `Rivals`: avatar, name, run line, head-to-head `{W}–{L}`, each row linking to the rival's page
    11. `Achievements` (as today)
    12. `Match history` (as today)
  - **Order, someone else's page:**
    1. Back
    2. avatar
    3. name, school
    4. `Play {first}` / `Message` / Share (as today)
    5. `You vs {first}` card (`bg-card rounded-[20px]`)
    6. then from the level row on, the same blocks with no month card
  - **Remove** the `StatGrid`/`StatTile` grid, `Sparkline`, the `Best win` `ListRow` and the old head-to-head
    `ListRow`. Drop imports that become unused.
  - **At 0 games**, hide `Form`, `Where you win`, `Rivals` and the chart.
- [ ] **Step 4: Stage check:**
  - `npm run lint`
  - `npx tsc --noEmit`
  - `npx vitest run --exclude "**/*.integration.test.ts"`
  - `npm run build`
  - on :3100: `e2e/you.spec.ts`, `e2e/play-sheet.spec.ts`, `e2e/profile.spec.ts`, `e2e/home.spec.ts`,
    `e2e/report-race.spec.ts`

  Expected: all PASS. Re-run `profile.spec` once on a failure (known flake).
- [ ] **Step 5: Commit** `feat(you): the page that shows your progress`
