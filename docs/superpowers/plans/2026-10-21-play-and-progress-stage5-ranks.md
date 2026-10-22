# Play & Progress — Stage 5: Ranks polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ranks reads at a glance. Movement shows only when it happened, the cryptic asterisk becomes a placement
count, your own row says how far the next spot is, and schools with nobody yet fold into one line with an Invite.

**Architecture:** The copy decisions live in pure helpers in `lib/ranks.ts`: movement, the placing tag, your gap, and
the empty-schools line. `app/(member)/leaderboard/page.tsx` uses them on the Players tab (podium and list) and the
Schools tab. Placement takes its count from confirmed games (`wins + losses`), which is the same source Home and the
You page use.

**Tech Stack:** Next.js 16 App Router (read `node_modules/next/dist/docs/` before writing code), React 19, Supabase,
vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-21-play-and-progress-design.md` §7 Ranks. The approved mockup is
`.superpowers/brainstorm/9432-1792594886/content/ranks-player.html` (left phone). Stage 2 already added the
`Not placed yet` group and the one ranking order.

## Global Constraints

- Branch `feat/play-and-progress`. No migration.
- Public repo: invented names only in tests, fixtures and commits.
- Elevated Dark: brass is the one accent; win and loss colour tokens; `.eyebrow`; hairline tokens; existing
  `ListRow`, `Avatar`, `TitleBadge`, `SchoolMark`.
- Ranks come only from `lib/ranking.ts`. `PLACEMENT_GAMES = 10` (`lib/home.ts`).
- **Copy (exact):**
  - Movement: `▲ {n}` in the win colour or `▼ {n}` in the loss colour. When the week's movement is zero or there is
    none, show nothing. The old `– this wk` and `+N this wk` text goes away.
  - Placing tag (1–9 confirmed games): `placing {k}/10`, a small ring-outlined pill, with the rating muted. Remove the
    `*` after ratings and the `* provisional (fewer than 10 matches)` footnote.
  - Your row (ranked and not #1): `{n} pts to #{k}` (`1 pt` at 1), meaning the gap to the member directly above. At a
    gap of 0: `level on rating with #{k}`.
  - Schools tab: schools with `member_count === 0` leave the ranked list and fold into one line,
    `Not here yet: {UGA · KSU · GT · FSU}` (short names joined by ` · `), with a brass `Invite` link to
    `/install/card`. The ranked list numbers only schools that have members.
- **Your own unplaced row** (deferred from Stage 2): keep the highlight but drop the `opacity-60` dimming on your own
  row only, so it still stands out.
- **Verify:**
  - `npm run lint`
  - `npx tsc --noEmit`
  - `npx vitest run --exclude "**/*.integration.test.ts"`
  - `npm run build`
  - e2e on :3100: `npx playwright test --config .superpowers/pw-3100.config.ts <spec> --workers=1`

    Never touch :3000. Use `e2e/private-school.ts` and scope lookups to `main`.

## Review Focus

- **A member at 9 games versus 10.** The placing tag disappears exactly at 10, matching Home's placement dots. Pinned
  by `placingTag` tests.
- **Your row when you're tied on rating** with the member above. It reads `level on rating with #k`, never
  `0 pts`. Pinned by `gapLine` tests.
- **The School scope (your school only).** The gap and the numbers refer to the visible list's order, not the league,
  or the copy says something untrue. Pinned by computing over the visible rows, with a `gapLine` test that takes the
  rows it is given.
- **Every school having members.** No `Not here yet` line appears. Pinned by an `emptySchoolsLine` test that returns
  `null`.
- **Movement for someone whose only change this week cancels out.** They show nothing, not `▲ 0`. Pinned by a
  `movementLabel` test.

---

### Task 1: Ranks copy helpers

**Files:**
- Create: `lib/ranks.ts`, `tests/ranks.test.ts`

**Interfaces:**
- Consumes: `aboveOf`, `RankRow` (`lib/ranking.ts`); `PLACEMENT_GAMES` (`lib/home.ts`).
- Produces:
  ```ts
  export function movementLabel(value: number | undefined): { text: string; tone: "win" | "loss" } | null
  export function placingTag(played: number): string | null           // 1–9 → "placing k/10"; 0 or ≥10 → null
  export function gapLine(rows: RankRow[], id: string): string | null  // over the rows given (visible scope)
  export function emptySchoolsLine(schools: { short_name: string; member_count: number }[]): string | null
  // "Not here yet: UGA · KSU" (input order), or null
  ```

- [ ] **Step 1: Failing tests**, with exact copy:
  - `movementLabel(36)` → `▲ 36` win; `movementLabel(-14)` → `▼ 14` loss; `0` → `null`; `undefined` → `null`
  - `placingTag(1)` → `placing 1/10`; `placingTag(9)` → `placing 9/10`; `placingTag(0)` → `null`;
    `placingTag(10)` → `null`
  - `gapLine` for gaps of 18, 1 and 0, and `null` for the #1 member, an unplaced member and a missing id
  - `emptySchoolsLine` with two empty schools → `Not here yet: UGA · KSU`; with none empty → `null`
- [ ] **Step 2: Run** `npx vitest run tests/ranks.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the same test command. Expected: PASS.
- [ ] **Step 5: Commit** `feat(ranks): movement, placement and your gap, in plain words`

### Task 2: Apply them on the leaderboard, and the stage check

**Files:**
- Modify: `app/(member)/leaderboard/page.tsx`
- Create: `e2e/ranks.spec.ts`

**Interfaces:**
- Consumes: Task 1; `toRankRow`, `compareRank`, `isPlaced`.

- [ ] **Step 1: Failing e2e** `e2e/ranks.spec.ts`, using the private-school helper. Users A and B; log in as A.
  - On `/leaderboard?tab=players`, A's row shows no `*` and no `this wk`. A is under `Not placed yet`, and A's own
    row is not dimmed (assert the row lacks the `opacity-60` class).
  - Seed a pending match (column set from `e2e/home.spec.ts`, A wins) and confirm it on Home. Dismiss the result
    screen if Stage 4 has landed, otherwise the card.
  - Back on the Players tab, A's row shows `placing 1/10` and `▲`.
  - `/leaderboard?tab=schools` shows `Not here yet:` only when the service client finds a school with
    `member_count = 0` (`school_stats`). Assert conditionally, as `play-sheet.spec` does for events.
- [ ] **Step 2: Run** on :3100 after `npm run build`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - `Movement` renders `movementLabel` or nothing.
  - Podium and list ratings show `placingTag(wins + losses)` with the rating muted. The `*` and the footnote go.
  - Your row (`isMe`) adds `gapLine(visibleRankRows, me)` to its meta. It uses the visible scope's placed rows in
    `compareRank` order.
  - Drop `opacity-60` on your own unplaced row.
  - Schools tab: split `schoolRows` into ranked (members > 0) and empty. Number only the ranked list. Below it, show
    `emptySchoolsLine` with the brass `Invite` link (`/install/card`).
- [ ] **Step 4: Stage check:**
  - `npm run lint`
  - `npx tsc --noEmit`
  - `npx vitest run --exclude "**/*.integration.test.ts"`
  - `npm run build`
  - on :3100: `ranks`, `play-sheet`, `home`, `you`, `season-feed` (skips while a season is open)

  Expected: PASS.
- [ ] **Step 5: Commit** `feat(ranks): read the ladder at a glance`
