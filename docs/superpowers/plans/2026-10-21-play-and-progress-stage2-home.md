# Play & Progress — Stage 2: Home Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Home leads with what needs you, then one card that says how you're doing and what's next. A brand-new
member sees one first step instead of meaningless numbers. Rank only counts members who have played, everywhere.

**Architecture:** One shared ranking module (`lib/ranking.ts`: one order, members with no confirmed game unranked)
replaces `overallRank` and the feed's pass ordering, and drives the leaderboard's "Not placed yet" group. Home's copy
decisions live in a pure `lib/home.ts`. Two server-rendered cards replace the rating hero, sparkline and stat tiles:
`ProgressCard`, and `FirstGameCard` for 0 games. A gold-edged "needs you" stack moves results to confirm, your called
club-night table, games logged for you and a game left halfway above everything else.

**Tech Stack:** Next.js 16 App Router (read `node_modules/next/dist/docs/` before writing code), React 19, Supabase,
vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-21-play-and-progress-design.md`. This stage covers §2 Home and the "Unplaced
members" rule in §7 Ranks. It also covers the Decisions line "One ranking order everywhere".

## Global Constraints

- Branch `feat/play-and-progress`. No migration.
- Public repo: invented names only in tests, fixtures and commits.
- Elevated Dark: dark only, Geist, brass is the one accent (`text-brass`, `bg-brass`), `.eyebrow` for overlines,
  hairline tokens, existing primitives (`Avatar`, `ListRow`, `LevelBar`, `TitleBadge`, `Button`, `SubmitButton`,
  `SectionHeading`).
- **Gold edge** (the "needs you" treatment) =
  `shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--brass)_55%,transparent)]` plus a background of
  `color-mix(in srgb, var(--brass) 8%, var(--card))`, with `rounded-[20px] p-4`.
- React compiler lint rejects `Date.now()` in components (use `new Date()`) and rejects a synchronous setState in an
  effect. A Server Component cannot pass a function prop to a Client Component.
- **One ranking order (exact):** rating desc, then wins desc, then id asc. Ranks count only members with at least one
  confirmed game (`wins + losses > 0`). Unranked members have rank `null`.
- `PLACEMENT_GAMES = 10`.
- **Copy (exact):**
  - Step 1 card:
    - chip `Step 1`
    - title `Play your first game`
    - line `Your first 10 games set your rating. Win or lose, every game counts toward your level.`
    - `Placement games` with `0 of 10`
    - eyebrow `Play someone from {school short name}`
    - last tile `Other`
  - Progress card:
    - eyebrow `Rating`
    - change `+{n} this month` / `−{n} this month` (U+2212)
    - `Level {n}` followed by ` · {title}`
    - XP note `{xp} XP to {next title}`. A Legend gets `{into} / {needed} XP`.
    - placement row `Placement games` with `{k} of 10`
  - Next line, chosen in this order:
    - with fewer than 10 games: `{n} more games to finish placement` (`1 more game to finish placement` at 1)
    - someone ranks directly above: `Next: pass {first} for #{rank} · {gap} pts`, or `· level on rating` when the gap
      is 0
    - you are #1 with a #2: `You're #1 · {gap} pts ahead of {first}`, or `You're #1 · level on rating with {first}`
      when the gap is 0
    - otherwise the next badge: `Next: {title} badge · {xp} XP`
    - otherwise nothing
  - Needs-you headings (eyebrow-styled `h2`): `Confirm results`, `Your table`, `Logged for you`.
  - Confirm card:
    - title `{name} logged a game`
    - meta `{winner} won {hi}–{lo} · {game} · {format}`, where `{winner}` is the reporter's first name or `You`
    - buttons `Not right` (reject) and `Confirm`
  - Logged-for-you rows keep today's copy: `{name} · beat you {score}` / `lost to you`,
    `Counted · flag until …`, and the button `Not right?`.
  - Resume card: `Back to your game` with `{you}–{them} vs {first}`.
  - Leaderboard: the label above unranked members is `Not placed yet`.
- **E2E sentinels that must keep passing:**
  - Home heading `/^recent$/i`
  - Home button `Confirm`
  - heading `Logged for you`, text `/beat you/` and button `Not right?`
  - region `Latest result` (the celebration card stays this stage)
- **Verify:**
  - `npm run lint`
  - `npx tsc --noEmit`
  - `npx vitest run --exclude "**/*.integration.test.ts"`
  - `npm run build`
  - e2e only against a production build on :3100:
    `npx playwright test --config .superpowers/pw-3100.config.ts <spec> --workers=1`

    Build first. The config starts `next start -p 3100` when nothing is listening. Never touch the dev server on
    :3000.
  - Wait for hydration after a full `goto` using the `onTrail` pattern in `e2e/play-sheet.spec.ts`
    (`sessionStorage["secbl:nav"]` contains the path).

## Review Focus

- **Ties at the 450 start rating.** Most members sit at 450, and before this change "rank" depended on query order.
  Rank, the Next line and passes must never name or count a member who has never played. Pinned by
  `tests/ranking.test.ts` and `tests/activity.test.ts` (Task 1).
- **A member with 1–9 games.** They get placement dots and the "more games" line, never a pass target that sits
  outside placement logic. Pinned by `tests/home.test.ts` (Task 3).
- **A member alone at #1, or the only placed member.** No `#2` exists, so the line falls back to the badge, and a
  Legend gets no line at all. Pinned in Task 3.
- **Home with several things waiting at once** (a result to confirm, a called table and a flaggable game): all appear
  in the needs-you stack, in spec order, above the progress card. Pinned by the e2e in Task 4 (a seeded pending match
  appears before the `Rating` eyebrow).
- **A member viewing the Season tab who hasn't played this season** sits under `Not placed yet` with no number, and
  `seasonStrip` still names the leader. Pinned by `tests/season.test.ts` (Task 2).

---

### Task 1: One ranking order

**Files:**
- Create: `lib/ranking.ts`, `tests/ranking.test.ts`
- Modify:
  - `lib/stats.ts` (remove `overallRank`)
  - `app/(member)/page.tsx` (its `board` select and `rank`)
  - `app/(member)/players/[id]/page.tsx` (`rank`)
  - `lib/activity.ts` (`BoardRow`, `order`, `passMoment`)
  - `lib/activity-write.ts` (the pass board)
  - `tests/activity.test.ts`

**Interfaces:**
- Produces in `lib/ranking.ts`:
  ```ts
  export interface RankRow { id: string; rating: number; wins: number; losses: number }
  export function isPlaced(r: RankRow): boolean                 // wins + losses > 0
  export function compareRank(a: RankRow, b: RankRow): number   // rating desc, wins desc, id asc
  export function rankedIds(rows: RankRow[]): string[]          // placed only, in order
  export function rankOf(rows: RankRow[], id: string): number | null
  export function aboveOf(rows: RankRow[], id: string): { id: string; rank: number; gap: number } | null
  // the placed member directly above; gap = their rating − mine (≥ 0); null if unplaced or #1
  export function leadOf(rows: RankRow[], id: string): { id: string; gap: number } | null
  // only when id is #1 and a #2 exists; gap = my rating − #2's
  ```
- `BoardRow` in `lib/activity.ts` becomes `RankRow`. `passMoment(before, after, winnerId)` keeps its signature and
  return shape.

- [ ] **Step 1: Failing tests** in `tests/ranking.test.ts`:
  - `rankedIds` orders `{a:500,w2}, {b:500,w3}, {c:520,w0,l1}, {d:450,w0,l0}` as `["c","b","a"]` (d unplaced).
  - Equal rating and wins → id asc.
  - `rankOf(rows,"d")` → `null`. `rankOf(rows,"c")` → 1. `rankOf(rows,"zz")` → `null`.
  - `aboveOf(rows,"a")` → `{ id:"b", rank:2, gap:0 }`. `aboveOf(rows,"c")` → `null`. `aboveOf(rows,"d")` → `null`.
  - `leadOf(rows,"c")` → `{ id:"b", gap:20 }`. `leadOf(rows,"b")` → `null`. With a single placed member → `null`.

  In `tests/activity.test.ts`, give the existing `passMoment` fixtures `wins: 1, losses: 0`, then add:
  - a winner who jumps only unplaced members (0 games, rating above theirs) → `null`
  - two members at the same rating are ordered by wins
- [ ] **Step 2: Run** `npx vitest run tests/ranking.test.ts tests/activity.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement `lib/ranking.ts`.** Point `passMoment`'s ordering at `rankedIds` (only placed members can
  be jumped or hold a rank).
  - In `activity-write.ts`, build the board from the `leaderboard` view (`id, rating, wins, losses`, with counts
    `Number()`-ed, paged with `fetchAllPages`).
  - The before board uses the two players' `rating_before`, the winner's `wins − 1` and the loser's `losses − 1`.
  - Home selects `id, rating, wins, losses, display_name` from `leaderboard` and uses `rankOf`. The profile page does
    the same with its own board.
  - Delete `overallRank`.
- [ ] **Step 4: Run** the unit suite, `npx tsc --noEmit` and `npm run lint`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(ranking): one ladder order; members who haven't played are unranked`

### Task 2: "Not placed yet" on the leaderboard

**Files:**
- Modify: `lib/season.ts` (`Standing.rank: number | null`), `tests/season.test.ts`,
  `app/(member)/leaderboard/page.tsx`

**Interfaces:**
- Consumes: `isPlaced`, `compareRank`, `rankedIds` (Task 1).
- Produces: `seasonStandings` returns rank `null` for members with `played === 0`. Their order after ranked members is
  unchanged.

- [ ] **Step 1: Failing tests** in `tests/season.test.ts`:
  - A member with no games in range has `rank: null`, and ranked members are numbered `1..n` with no gaps.
  - `seasonStrip` still names the leader for a member with `rank: null`.
- [ ] **Step 2: Run** `npx vitest run tests/season.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - `seasonStandings` sets `rank` only for `played > 0`.
  - **Players tab:** sort `visible` with `compareRank`. The podium and the numbered list (`#1…`) take placed members
    only. Unplaced members follow under a `.eyebrow` `Not placed yet`, with rows that have no number in the rank slot
    (keep the slot width), at `opacity-60`, still linking to the player.
  - **Season tab:** rows with `rank === null` move under the same `Not placed yet` label with no number.
  - The `visible.length === 0` empty state becomes "no placed members": it shows when nobody is placed, and the
    unplaced list still renders under it.
- [ ] **Step 4: Run** `npx vitest run tests/season.test.ts`, then lint, tsc, `npm run build`, and on :3100
  `e2e/play-sheet.spec.ts` (it opens B's row on the Players tab; B is unplaced). Expected: PASS.
- [ ] **Step 5: Commit** `feat(ranks): members who haven't played sit under Not placed yet`

### Task 3: Progress card and the first-game card

**Files:**
- Create: `lib/home.ts`, `tests/home.test.ts`, `components/progress-card.tsx`, `components/first-game-card.tsx`
- Modify: `app/(member)/page.tsx` (replace the Rating section: hero number, `Sparkline`, the 3-tile `StatGrid`)

**Interfaces:**
- Consumes: `aboveOf`, `leadOf`, `rankOf` (Task 1); `nextBadge`, `LevelInfo` (`lib/levels.ts`); `playFaces`
  (`lib/play.ts`).
- Produces in `lib/home.ts`:
  ```ts
  export const PLACEMENT_GAMES = 10
  export function placementLeft(played: number): number                       // max(0, 10 − played)
  export function formDots(newestFirst: { winner_id: string }[], meId: string, n = 5): ("W" | "L")[]  // oldest → newest
  export function nextLine(input: {
    played: number;
    above: { name: string; rank: number; gap: number } | null;
    lead: { name: string; gap: number } | null;
    badge: { title: string; xpToGo: number } | null;
  }): string | null
  export function xpNote(level: LevelInfo, xpTotal: number): string           // "{xp} XP to {title}" | "{into} / {needed} XP"
  ```
- Produces: `ProgressCard` (server component; props are plain data) and `FirstGameCard({ school, faces })`, where
  `faces` are `{ id, display_name, avatar_url, ball }[]`.

- [ ] **Step 1: Failing tests** in `tests/home.test.ts`, one per Next-line branch, with exact strings from Global
  Constraints:
  - placement at 7 games → `3 more games to finish placement`; at 9 → `1 more game to finish placement`
  - pass with gap 18 → `Next: pass Jordan for #2 · 18 pts`; gap 0 → `Next: pass Jordan for #2 · level on rating`
  - #1 with gap 20 and with gap 0
  - badge → `Next: Regular badge · 140 XP`
  - all null → `null`

  Also:
  - `formDots` returns oldest → newest and caps at 5
  - `placementLeft(0)` → 10, `placementLeft(12)` → 0
  - `xpNote` for Rookie at level 4 with 110 XP → `140 XP to Regular`, and for a Legend → `{into} / {needed} XP`

  Names are first names via `name.trim().split(/\s+/)[0] || name`.
- [ ] **Step 2: Run** `npx vitest run tests/home.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `lib/home.ts`, then the components to the approved mockup
  (`.superpowers/brainstorm/9432-1792594886/content/home.html`; spec §2.4).
  - **`ProgressCard`** is one `bg-card rounded-[20px]` link to `/players/{me}`:
    - top row: `Rating` eyebrow over the rating (`text-[40px]` `stat-number`), with the change (win or loss colour)
      and the dots on the right. The dots are filled `bg-win` for W and a ring in the loss colour for L.
    - With fewer than 10 games, the dots are replaced by ten placement dots, k filled in brass, under a
      `Placement games` / `{k} of 10` row.
    - level row: `Level {n}` and `· {title}` in brass, `xpNote` on the right, then `LevelBar`
    - a hairline-separated Next line, omitted when `null`
  - **`FirstGameCard`** is gold-edged: the `Step 1` chip (brass fill, dark text, uppercase 9–10px), title, line,
    placement row with ten empty ring dots, then the faces eyebrow and four faces plus `Other`, linking as the Play
    sheet does (`/matches/new?opponent={id}`, `/matches/new?find=1`).
  - **In `page.tsx`:**
    - played = `wins + losses` from the board row
    - `played === 0` renders `FirstGameCard`, with faces from approved members. Query those (`id, display_name,
      avatar_url, ball, school_id`) only in this case, and run `playFaces([], members, mySchoolId)`.
    - otherwise render `ProgressCard`, with above/lead names from the board's `display_name`
    - no rank or level-percent appears for 0 games
    - remove the `Sparkline`/`StatGrid`/`StatTile` imports if unused
  - The season strip stays directly below.
- [ ] **Step 4: Run** the unit tests, lint, tsc and `npm run build`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(home): a progress card with one next goal; a first step for new members`

### Task 4: Needs you first, the new order, and the stage check

**Files:**
- Create: `components/resume-game-card.tsx`, `e2e/home.spec.ts`
- Modify: `app/(member)/page.tsx`, `app/(member)/play/actions.ts` (add `draftOpponent`)

**Interfaces:**
- Consumes: `resumableDraft`, `resumeLine` (`lib/play.ts`); `draftKey` (`lib/report-form.ts`); `myNightStatus`
  (`lib/night.ts`); `NightCard`.
- Produces: `export async function draftOpponent(id: string): Promise<PlayPerson | null>` in
  `app/(member)/play/actions.ts`. It is UUID-checked and returns an approved profile or null.
  `ResumeGameCard({ meId })` is a client component that renders nothing without a scored draft.

- [ ] **Step 1: Failing e2e** `e2e/home.spec.ts`. Use the private-school setup and cleanup from
  `e2e/play-sheet.spec.ts`. Users A and B; log in as A.
  - A fresh A sees `Play your first game` and `0 of 10`, and does not see the text `Overall rank`.
  - B's face link `href` contains `opponent={b.id}` (assert the href; never click it).
  - Seed a pending match with the service client: reporter B, opponent A, `game_type: "8ball"`, `race_to: 5`,
    `spot: 0`, scores 5–3 to B, `winner_id: B`, `played_at`: today's club date, `status: "pending"`. Use the column
    set `reportMatch` writes; check `app/(member)/matches/actions.ts`.
  - Reload Home. The text `logged a game` is visible, and its bounding box `y` is less than the `Step 1` card's.
  - Click `Not right` → the card disappears. This rejects the match, so nothing reaches the feed.
- [ ] **Step 2: Run** on :3100 after `npm run build`. Expected: FAIL.
- [ ] **Step 3: Implement the new Home order** (spec §2):
  1. header
  2. `CelebrationCard` (unchanged this stage)
  3. needs-you stack, gold-edged, each group under its eyebrow `h2`:
     - `Confirm results`: confirm cards per Global Constraints, with `rejectMatch` / `confirmMatch` forms as today
     - `Your table`: `NightCard` when `myNightStatus(...)` is `playing`
     - `Logged for you`: today's rows inside gold-edged cards
     - `ResumeGameCard`
  4. `NotifyPrompt`
  5. the progress card or the first-game card
  6. season strip
  7. `Waiting on`
  8. Club night (the night is on and you're not playing; today's eyebrow link plus `NightCard`)
  9. Live now
  10. next event
  11. `Recent`

  `LiveHome` stays mounted where it is.
- [ ] **Step 4: Stage check:**
  - `npm run lint`
  - `npx tsc --noEmit`
  - `npx vitest run --exclude "**/*.integration.test.ts"`
  - `npm run build`
  - on :3100: `e2e/home.spec.ts`, `e2e/play-sheet.spec.ts`, `e2e/report-race.spec.ts`,
    `e2e/report-agreed.spec.ts`, `e2e/report-duplicate.spec.ts`, `e2e/club-night.spec.ts`, `e2e/profile.spec.ts`

  Expected: all PASS. `profile.spec` has a known production-build flake (ledger R12); re-run it once before calling it
  a failure.
- [ ] **Step 5: Commit** `feat(home): what needs you comes first`
