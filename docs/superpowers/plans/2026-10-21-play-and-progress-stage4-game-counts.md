# Play & Progress — Stage 4: Scoreboard and the moment a game counts — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a game counts, the member sees what it did. A full-screen moment shows the result, the rating moving,
the XP bar filling and up to three true lines (rank change, level or badge, first win over them, streak, per-game
record), with Done and Rematch (or Back in line during a club night). During the game, the scoreboard gives the score
the room.

**Architecture:**
- A pure `lib/result-moment.ts` decides the headline, the rank move, the "what changed" lines and the second action.
- A client `GameCountsScreen`, a full-screen Radix dialog, replaces `CelebrationCard` on Home. It keeps the same
  trigger (`freshMatch`, the per-device `secbl:celebrated` list) and the same count-up behaviour.
- Home computes the screen's inputs server-side from data it already has, plus the board before the match
  (`boardBefore`) and achievements before and after.
- The scoreboard renders its own header (`New game` / `vs {first}`), folds its setup into one line after the first
  point, reads `game`/`race` params for Rematch, and passes a "since" time so a rematch isn't flagged as a duplicate.

**Tech Stack:** Next.js 16 App Router (read `node_modules/next/dist/docs/` before writing code), React 19, radix-ui
`Dialog`, Supabase, vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-21-play-and-progress-design.md` §3 (the game-counts screen, Rematch, Back in
line, the rematch duplicate rule, losses) and §4 (scoreboard title, fold, Rematch params). Approved mockup:
`.superpowers/brainstorm/9432-1792594886/content/after-game.html`.

## Global Constraints

- Branch `feat/play-and-progress`. No migration.
- Public repo: invented names only in tests, fixtures and commits.
- Elevated Dark: dark only, brass the one accent, `.eyebrow`, hairline tokens, existing primitives (`LevelBar`,
  `Avatar`, `TitleBadge`, `FlameMark`, `Button`, `SubmitButton`).
- React compiler lint rejects `Date.now()` in components and a synchronous setState in an effect. A Server Component
  cannot pass a function prop to a Client Component. Respect `prefers-reduced-motion`: jump to the end state.
- Ranks only via `lib/ranking.ts` (`toRankRow`, `rankOf`, `boardBefore`).
- **Copy (exact):**
  - Eyebrow `Win` / `Loss`.
  - Headline `You beat {first} {mine}–{theirs}` / `{first} beat you {theirs}–{mine}`.
  - Sub-line `{game} · {format}` (the existing `GAME_LABEL` + `formatShort`).
  - Rating `{before} → {after}` with the signed change (`+14` / `−9`, U+2212).
  - XP row `+{n} XP` or `No XP · weekly limit` when capped, and `Level {n} · {into} / {needed}` on the right. The bar
    fills from the old position to the new one.
  - "What changed" lines, at most 3 in this priority, only when true:
    1. `Up to #{to}, passing {first}` / `Down to #{to}, {first} passed you` / `On the board at #{to}` (first ranked
       game)
    2. `Level {n}`, when the game crossed a level and no title came with it
    3. `{title} badge unlocked`
    4. `{achievement label} unlocked`
    5. `Your first win over {first}`
    6. `{k} wins in a row` (k = 3, 5 or ≥ 10)
    7. `{game} record now {W}–{L}`
  - Buttons `Done` and `Rematch`, or `Back in line` in place of Rematch (see Ruling S4-R1).
  - Accessible name of the screen: `Latest result`.
  - Scoreboard title `New game` before an opponent is chosen, `vs {first}` after. The fold summary line is
    `{game} · race to {n}` (or `open race`) · `no spot` / `{k} on the wire to {first|you}`, followed by `Edit`.
- **Ruling S4-R1:** "Back in line" applies when a club night is running at the member's school, the member is
  currently `out` (`myNightStatus`), and the game was confirmed after that night opened. Otherwise the screen shows
  Rematch. The spec assumed the table game is recorded, but `night_tables` rows are deleted when the result is
  reported and nothing else keeps them. This rule gives the same fairness without a migration. It is ledgered.
- **Rematch:**
  - It links to `/matches/new?opponent={id}&game={type}&race={n}&rematch=1`. An open race passes `race=open`.
  - `game` and `race` are validated against the scoreboard's allowed values and ignored when invalid.
  - The spot is re-suggested from current ratings.
  - A board opened with `rematch=1` records when it opened and sends that time as `since`, so the duplicate check
    ignores same-day games created before it. The server uses the later of `since` and `night_table_call`.
- **E2E sentinels to keep or update in the same change:**
  - `e2e/report-race.spec.ts`: region `Latest result`, `Lost 1–3 vs E2E`, `+80 XP`, button `Nice`, dismissal
    persisting across a reload. Update these to the new screen's copy and buttons (`Done`) with equivalent assertions.
  - `e2e/season-feed.spec.ts` ("Lost 0–3"): update it to match.
  - `e2e/report-agreed.spec.ts`: the screen sits over Home after a result, so dismiss it before further Home clicks.
  - The scoreboard's `Send to {name} to confirm`, `We agreed — count it`, `Race to 3`, `Fewer games on the wire` and
    `Increase … score` labels stay.
- **Verify:**
  - `npm run lint`
  - `npx tsc --noEmit`
  - `npx vitest run --exclude "**/*.integration.test.ts"`
  - `npm run build`
  - e2e on :3100: `npx playwright test --config .superpowers/pw-3100.config.ts <spec> --workers=1`

    Never touch :3000. Use `e2e/private-school.ts` and scope lookups to `main` or the dialog.

## Review Focus

- **A loss.** It gets the same screen with honest framing: coral change, the XP still earned, `Down to #…` only when
  true, no consolation copy. Pinned by `momentLines` tests and the report-race e2e (a loss).
- **A first ever game.** It says `On the board at #k`, never "passing" someone who has never played. Pinned by
  `rankMove` tests.
- **The weekly XP cap.** It shows `No XP · weekly limit` and no fake bar fill. Pinned by a component-level prop test or
  the existing celebration test pattern.
- **Reopening Home after dismissing.** The screen stays gone on this device, and another device still shows it once.
  Pinned by the report-race e2e reload step.
- **A Rematch board with stale or invalid params** (`race=99`, `game=snooker`): the params are ignored, and the board
  still opens on the opponent. Pinned by `boardParams` tests.

---

### Task 1: The result moment, pure

**Files:**
- Create: `lib/result-moment.ts`, `tests/result-moment.test.ts`

**Interfaces:**
- Consumes: `RankRow`, `rankOf`, `rankedIds` (`lib/ranking.ts`).
- Produces:
  ```ts
  export function resultHeadline(won: boolean, opponentFirst: string, mine: number, theirs: number): string
  export function rankMove(before: RankRow[], after: RankRow[], meId: string): { kind: "up" | "down" | "entered"; to: number; otherId: string | null } | null
  // up: otherId = highest-placed member jumped; down: otherId = the member now directly above who was below before; entered: unranked before
  export function momentLines(input: {
    move: { kind: "up" | "down" | "entered"; to: number; other: string | null } | null;
    levelBefore: number; levelAfter: number; titleUnlocked: string | null;
    achievementsUnlocked: string[]; firstWinOver: string | null; winStreak: number | null;
    gameRecord: { label: string; wins: number; losses: number } | null;
  }): string[]                                                       // ≤ 3, priority per Global Constraints
  export function secondAction(input: { nightOpen: boolean; nightOpenedAt: string | null; myNightKind: string; confirmedAt: string }): "rematch" | "back_in_line"
  export function rematchHref(m: { opponentId: string; gameType: string; raceTo: number | null }): string
  ```

- [ ] **Step 1: Failing tests:**
  - every `resultHeadline` and `momentLines` string from Global Constraints
  - the cap at 3 and the priority order
  - each line absent when not true; a win streak of 2 or 4 gives no line
  - `rankMove`: up past one member, up past two (names the highest), down, entered, unchanged → `null`, unranked
    after → `null`
  - `secondAction`: all branches
  - `rematchHref` with an open race
- [ ] **Step 2: Run** `npx vitest run tests/result-moment.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the same test command. Expected: PASS.
- [ ] **Step 5: Commit** `feat(result): what a counted game did, in at most three true lines`

### Task 2: The game-counts screen on Home

**Files:**
- Create: `components/game-counts-screen.tsx`
- Modify:
  - `app/(member)/page.tsx` (replace `CelebrationCard`, compute inputs)
  - `e2e/report-race.spec.ts`
  - `e2e/season-feed.spec.ts`
  - `e2e/report-agreed.spec.ts`
- Delete: `components/celebration-card.tsx`, if nothing else uses it.

**Interfaces:**
- Consumes: Task 1; `freshMatch`, `DISMISSED_KEY`, `dismissedIds`, `withDismissed` (`lib/celebration.ts`);
  `boardBefore`, `toRankRow`; `loadXp` (`perMatch`, `capped`, the total); `levelFromXp`; `earnedAchievements`;
  `myNightStatus`; `joinLine`.
- Produces: `GameCountsScreen(props)`, a client component taking plain data:
  `{ matchId, won, headline, sub, ratingBefore, ratingAfter, xpEarned, xpCapped, level, intoLevel, needed, lines: string[], action: { kind: "rematch"; href: string } | { kind: "back_in_line"; nightId: string } }`.

- [ ] **Step 1: Update the e2e first.** `report-race.spec.ts` asserts the dialog named `Latest result` shows
  `Lost 1–3` / `E2E beat you 3–1`, `+80 XP`, and button `Done`. `Done` dismisses it, and after a reload it stays
  gone. Adjust `season-feed` and `report-agreed` likewise. Run them on :3100 after `npm run build`. Expected: FAIL.
- [ ] **Step 2: Implement.**
  - **`GameCountsScreen`:** a Radix `Dialog` (modal, full screen, `aria-label` `Latest result`), styled to the
    mockup: a win-green radial glow for a win and a neutral one for a loss.
    - Show it after reading the dismissed list on the next frame, as the card does, so it never flashes.
    - Count up with rAF, skipped for reduced motion.
    - `Done` writes the dismissed list and closes.
    - Rematch is a `Link` that also dismisses.
    - `Back in line` is a `<form action={joinLine}>` with hidden `night_id` and `back="/"` that also dismisses.
  - **In `page.tsx`, when `freshMatch` is set:**
    - board after = the leaderboard rows; board before = `boardBefore(after, winnerId, loserId, ratingBefore from
      rating_history for the match)`; then `rankMove`
    - level before/after from the XP total minus or including `xp.perMatch.get(id)`
    - title unlocked = the activity `badge` row (as today)
    - achievements = `earnedAchievements` with and without this match
    - first win over = no earlier win against this opponent
    - streak = the activity `streak` row (as today)
    - game record from `gameSplits` (`lib/you.ts`) for this game type
    - `secondAction` from `loadNight` + `myNightStatus`
  - Remove `CelebrationCard` and its import. The needs-you stack and the rest of Home are unchanged.
- [ ] **Step 3: Run** unit, lint, tsc, build, then on :3100 `report-race`, `report-agreed`, `report-duplicate`,
  `home`, `club-night`. Expected: PASS.
- [ ] **Step 4: Commit** `feat(home): the moment a game counts`

### Task 3: Scoreboard header, fold, and Rematch params

**Files:**
- Modify:
  - `app/(member)/matches/new/page.tsx`
  - `app/(member)/matches/new/report-form.tsx`
  - `app/(member)/matches/new/report-form-loader.tsx`, if its props change
  - `app/(member)/matches/new/actions.ts` (`findDuplicateReport` and `reportMatch` accept `since`)
  - `lib/report-form.ts`
  - `tests/report-form.test.ts`
  - `e2e/report-race.spec.ts` (one fold assertion)

**Interfaces:**
- Produces in `lib/report-form.ts`:
  - `export function boardParams(sp: { game?: string; race?: string; rematch?: string }): { game: string | null; raceTo: number | null | "open"; rematch: boolean }`.
    Values are validated against the existing game keys and race options.
  - `export function foldSummary(d: { game: string; raceTo: number | null; spot: number; spotTo: Side | null }, opponentFirst: string): string`
- `findDuplicateReport(opponentId, playedAt, since?: string | null)`. `reportMatch` reads a hidden `since` input.
  `loadDuplicate` uses the later of `since` and the night call.

- [ ] **Step 1: Failing tests:**
  - `boardParams`: valid, invalid (`race=99`, `game=snooker`) and `race=open`
  - `foldSummary`: copy per Global Constraints, with and without a spot
  - `findDuplicate` with a `since` after an earlier same-day game → `null`

  Then extend `report-race.spec.ts`: after the first score tap, an `Edit` button is visible inside the board's summary
  line.
- [ ] **Step 2: Run** the tests. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - The form renders its own header: the close button stays a `BackButton` with `fallback="/"` and
    `backIcon="close"` markup (aria-label `Close`). The title is `New game` / `vs {first}`. `page.tsx` drops its
    `PageHeader`.
  - The setup block (opponent, game, race, spot, date) folds once any score differs from the board's starting
    scores (`boardScored`), and opens folded for a restored scored draft. `Edit` unfolds it, and the score columns
    and buttons grow when folded.
  - On a fresh board, `game`/`race` from `boardParams` seed the board ahead of the opponent's suggested spot.
  - A `rematch=1` board records its open time with `new Date().toISOString()` in the initialiser and sends it as
    `since`.
- [ ] **Step 4: Stage check:**
  - `npm run lint`
  - `npx tsc --noEmit`
  - `npx vitest run --exclude "**/*.integration.test.ts"`
  - `npm run build`
  - on :3100: `report-race`, `report-agreed`, `report-duplicate`, `club-night`, `play-sheet`, `home`, `you`,
    `profile`

  Expected: all PASS. Re-run `profile.spec` once on a failure.
- [ ] **Step 5: Commit** `feat(scoreboard): the score gets the room; Rematch opens the same game`
