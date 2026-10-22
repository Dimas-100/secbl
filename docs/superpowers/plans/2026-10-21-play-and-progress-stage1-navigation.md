# Play & Progress — Stage 1: Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One obvious way to start any game from anywhere: a labelled Play button that opens a sheet (game in progress,
club night, recent opponents), a Play button on every other player's page, Back buttons that go back, and an Events
tab without club night.

**Architecture:** The tab bar's middle button becomes `PlaySheet`, a client Radix dialog that loads its data on open
through one server action (`loadPlaySheet`). It reuses club night's pure status logic and existing server actions,
plus the scoreboard's recency rule. The "game in progress" row reads the scoreboard's existing localStorage draft.
Back buttons consult a small per-tab navigation stack kept in sessionStorage by a tracker in the member layout. Pure
logic lives in `lib/play.ts`, `lib/nav-stack.ts` and `lib/report-form.ts`, written test-first.

**Tech Stack:** Next.js 16 App Router (read `node_modules/next/dist/docs/` before writing code), React 19, radix-ui
`Dialog`, Supabase, vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-21-play-and-progress-design.md` (§1 Tab bar and the Play sheet, §6 Play
button, §8 Events, §9 Back buttons, §4 "Never silently lose a live score").

## Global Constraints

- Branch `feat/play-and-progress` (based on `chore/home-cleanup`). No migration.
- Public repo: invented names only in tests, fixtures and commits.
- Elevated Dark: dark only, Geist, brass (`bg-brass`, `text-brass`) is the one accent, `.eyebrow` for overlines,
  existing primitives (`Avatar`, `ListRow`, `Button`, `SubmitButton`).
- React compiler lint rejects `Date.now()` anywhere in a component, including handlers. Use `new Date().getTime()`.
  Lint also rejects a synchronous `setState` inside an effect.
- A Server Component cannot pass a function prop to a Client Component.
- **Copy (exact):**
  - Tabs: `Home`, `Ranks`, `Play`, `Events`, `You`. The Play button's accessible name is `Play`. The sheet title is
    `Play`.
  - Resume row: title `Back to your game`, meta `{you}–{them} vs {first name}`.
  - Club night block: eyebrow `Club night`. With no night, a row titled `Start club night` with meta
    `Open a line for the tables`. Otherwise the line from `nightCardLine`, then one action: `Get in line` (out),
    `Open club night` (waiting), `Start game` (playing, keeps score) or `Watch the table` (playing, other player keeps
    score).
  - Faces: eyebrow `Play someone now`; the last tile is `Other`.
  - Load failure: `Couldn't load. Try again.` (a button that retries).
  - Player page: primary link `Play {first name}`; the `Message` button keeps its label.
  - Switch guard: `You have a game in progress vs {first} ({you}–{them})`, with buttons `Keep that game` and
    `Start new`.
  - Events empty Upcoming: `Nothing on the calendar. Start a club night from Play.`
- E2E sentinels that must keep passing:
  - Home heading `/^recent$/i`
  - button `Message`
  - `/night`: button `Start club night`, links `Start game` and `Watch the table`
  - chat: link `Back to chat`
- **Verify:**
  - `npm run lint`
  - `npx tsc --noEmit`
  - `npx vitest run --exclude "**/*.integration.test.ts"`
  - `npx playwright test e2e/<spec> --workers=1`. Run Playwright with the machine awake: sleep mid-run leaks test
    users.

## Review Focus

- **Navigating from inside the sheet** (a face, `Start club night`, `Get in line`'s redirect to `/night`) must leave no
  sheet open on the next page. The tab bar persists across navigation, so a plain `useState` would keep it open. Pinned
  by the e2e in Task 3.
- **A stale (older than 12 h) or corrupt draft** shows no `Back to your game` row, and the sheet still works. Pinned by
  `resumableDraft` tests in Task 1.
- **A member with no games, or alone at their school**, sees faces filled from their school, then anyone. With nobody
  else at all, only `Other` shows. Pinned by `playFaces` tests in Task 1.
- **A player page opened from a deep link** (new tab, push notification): Back goes to the page's fallback, never out
  of the app, including after the member used the browser's own back button. Pinned by `nextNavStack` tests and the
  e2e in Task 4.
- **`Play {name}`, a face or `Start game` tapped while a scored game against someone else is in progress**: the member
  is asked, not silently reset. Pinned by `openingBoard` tests in Task 2.

---

### Task 1: Pure helpers for the sheet

**Files:**
- Create: `lib/play.ts`, `tests/play.test.ts`
- Modify: `lib/report-form.ts` (add draft constants), `app/(member)/matches/new/report-form.tsx:40` (import them,
  delete the local `DRAFT_MAX_AGE_MS` and the inline key)

**Interfaces:**
- Produces in `lib/report-form.ts`:
  - `export const DRAFT_MAX_AGE_MS = 12 * 60 * 60 * 1000`
  - `export function draftKey(meId: string): string`, which returns `secbl:draft-game:${meId}`
- Produces in `lib/play.ts`:
  - `export interface ResumableDraft { opponentId: string; you: number; them: number }`
  - `export function resumableDraft(raw: string | null, nowMs: number): ResumableDraft | null`
  - `export function resumeLine(d: ResumableDraft, opponentName: string): string`
  - `export const PLAY_FACES = 4`
  - `export function playFaces(recentIds: string[], members: { id: string; school_id: string | null; display_name: string }[], mySchoolId: string | null, n = PLAY_FACES): string[]`

- [ ] **Step 1: Write failing tests** in `tests/play.test.ts`:
  - `resumableDraft(null, now)` → `null`. `resumableDraft("{oops", now)` → `null`.
  - A draft with `opponentId: null` → `null`.
  - `{ at: now - 13*3600_000, opponentId: "a", you: 3, them: 2 }` → `null`.
  - `{ at: now - 60_000, opponentId: "a", you: 3, them: 2, game: "8ball" }` → `{ opponentId: "a", you: 3, them: 2 }`.
  - A draft whose `you` is not a number → `you: 0`.
  - `resumeLine({ opponentId: "a", you: 3, them: 2 }, "Jordan Lee")` → `"3–2 vs Jordan"` (en dash).
  - `playFaces(["c", "a", "c"], members, "s1")`, where members are `a` (s1), `b` (s1), `c` (s2), `d` (s2) → `["c", "a", "b", "d"]`.
    Recent first, deduped; then same school, alphabetical by `display_name`; then everyone else, alphabetical.
  - `playFaces(["gone"], members, "s1")` drops ids not in `members`.
  - `playFaces([], [], "s1")` → `[]`. With `n = 2` → at most 2 ids.
- [ ] **Step 2: Run** `npx vitest run tests/play.test.ts`. Expected: FAIL (module missing).
- [ ] **Step 3: Implement.** Add `DRAFT_MAX_AGE_MS` and `draftKey` to `lib/report-form.ts` and switch `report-form.tsx`
  to them. Write `lib/play.ts`: `resumableDraft` parses inside try/catch and requires a string `opponentId` and
  `nowMs - at < DRAFT_MAX_AGE_MS`; `playFaces` per the tests.
- [ ] **Step 4: Run** `npx vitest run tests/play.test.ts tests/report-form.test.ts`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(play): pure helpers for the Play sheet`

### Task 2: The scoreboard never silently drops a scored game; `?find=1` opens the picker

**Files:**
- Modify: `lib/report-form.ts`, `tests/report-form.test.ts`, `app/(member)/matches/new/report-form.tsx:100-120` (the
  `useState` initialiser) and its footer area, `app/(member)/matches/new/report-form-loader.tsx`,
  `app/(member)/matches/new/page.tsx`

**Interfaces:**
- Produces: `export function openingBoard(draft: { opponentId: string | null; you: number; them: number }, calledId: string | undefined): "keep" | "switch" | "ask"`
- Produces: `ReportMatchForm` prop `initialPickerOpen?: boolean`. The page reads `searchParams.find === "1"`.

- [ ] **Step 1: Failing tests** in `tests/report-form.test.ts`:
  - `openingBoard(d, undefined)` → `"keep"`.
  - Same opponent → `"keep"`.
  - Different opponent with `you + them > 0` → `"ask"`.
  - Different opponent at 0–0 → `"switch"`.
  - `opponentId: null` with a called id → `"switch"`.
- [ ] **Step 2: Run** `npx vitest run tests/report-form.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement `openingBoard`.** In `report-form.tsx`:
  - `"switch"` keeps today's behaviour: a fresh board with `startBoard`.
  - `"keep"` keeps the draft.
  - `"ask"` keeps the draft, holds the called opponent in state, and shows the switch-guard notice in the footer's
    place (same pattern as the duplicate notice).
    - `Keep that game` clears the notice and calls `router.replace("/matches/new")`, so a reload doesn't ask again.
    - `Start new` applies the fresh board for the called opponent.
  - `initialPickerOpen` seeds `pickerOpen`.
- [ ] **Step 4: Run** `npx vitest run tests/report-form.test.ts`, then
  `npx playwright test e2e/club-night.spec.ts e2e/report-race.spec.ts --workers=1`. Expected: PASS. The club-night
  `Start game` path has no prior draft, so it switches.
- [ ] **Step 5: Commit** `feat(report): ask before replacing a scored game; ?find=1 opens the picker`

### Task 3: The Play sheet

**Files:**
- Create: `app/(member)/play/actions.ts`, `components/play-sheet.tsx`, `e2e/play-sheet.spec.ts`
- Modify: `components/tab-bar.tsx`, `app/(member)/layout.tsx`

**Interfaces:**
- Consumes: `resumableDraft`, `resumeLine`, `playFaces` (Task 1); `draftKey` (Task 1); `loadNight`
  (`lib/night-data.ts`); `myNightStatus`, `nightCardLine` (`lib/night.ts`); `joinLine`
  (`app/(member)/night/actions.ts`).
- Produces in `app/(member)/play/actions.ts` (`"use server"`):
  ```ts
  export interface PlayPerson { id: string; display_name: string; avatar_url: string | null; ball: number | null }
  export interface PlayNight {
    kind: "none" | "out" | "waiting" | "playing";
    nightId: string | null;
    line: string | null;            // nightCardLine output; null when kind is "none"
    opponentId: string | null;      // set when kind is "playing"
    keepsScore: boolean;
  }
  export interface PlaySheetData { night: PlayNight; faces: PlayPerson[]; resume: PlayPerson | null }
  export async function loadPlaySheet(resumeOpponentId: string | null): Promise<PlaySheetData>
  ```
- Produces: `PlaySheet({ meId }: { meId: string })`, which renders the trigger button and the dialog.
  `TabBar({ profileHref, meId })`.

- [ ] **Step 1: Failing e2e** `e2e/play-sheet.spec.ts`. Use the club-night spec's setup: a school with no approved real
  members, skip if none or if a night is open there. Create users A and B in it, `trackUser` both, then log in as A.
  - Click the button named `Play` → dialog `Play` is visible.
  - It shows a link `Start club night`, and under `Play someone now` a link named `E2E Play B {stamp}` (B is A's only
    schoolmate).
  - Click B's face → URL matches `/matches/new?opponent={b.id}`.
  - `page.evaluate` writes `secbl:draft-game:{a.id}` = `{ at: <now>, opponentId: b.id, you: 2, them: 1 }`.
  - `goto("/leaderboard")`, open Play → a link `Back to your game` containing `2–1 vs E2E` is visible.
  - Click `Start club night` → URL `/night`, the dialog is gone and the tab bar is visible.
- [ ] **Step 2: Run** `npx playwright test e2e/play-sheet.spec.ts --workers=1`. Expected: FAIL (no `Play` button).
- [ ] **Step 3: Implement `loadPlaySheet`.**
  - Auth via `createClient()`; redirect to `/login` with no user.
  - Fetch in parallel:
    - approved profiles other than me: `id, display_name, avatar_url, ball, school_id`
    - my `school_id`
    - my newest 30 matches (`reporter_id, opponent_id`, any status, `created_at desc`), mapped to opponent ids as
      `matches/new/page.tsx` does
    - `loadNight(supabase, user.id, new Date())`
  - Night: `myNightStatus(...)`, then `nightCardLine(status, { tables: night.tables, waiting: line.length }, opponentName)`.
  - Faces: `playFaces(...)` mapped to `PlayPerson`.
  - Resume: the profile with id `resumeOpponentId`, only if it matches the UUID pattern used in `night/actions.ts`.
- [ ] **Step 4: Implement `PlaySheet`** (Radix `Dialog`, styled like `new-message-sheet.tsx`: overlay, bottom sheet,
  drag handle, `Dialog.Title` "Play").
  - **Open state is derived so navigation closes it:** `const [openOn, setOpenOn] = useState<string | null>(null)`,
    with `open = openOn === usePathname()`. Opening sets `openOn` to the current pathname.
  - On open: read `resumableDraft(localStorage.getItem(draftKey(meId)), new Date().getTime())` in try/catch, then call
    `loadPlaySheet(draft?.opponentId ?? null)` inside `useTransition`. Keep the last result in state, so a reopen
    renders at once while it refreshes. Show three skeleton circles only when there is no result yet. On a rejected
    call, show the retry button and still show `Other`.
  - Order:
    1. The resume row: a `ListRow` link to `/matches/new`, shown when there's both a draft and `resume`.
    2. The club night block. A pulsing `bg-win` dot appears when a night is on. `out` gets a `<form action={joinLine}>`
       with hidden `night_id` and `back="/night"`, plus `SubmitButton` `Get in line`. `waiting` links to `/night`.
       `playing` links to `/matches/new?opponent={id}` or `/live/{id}`. `none` gets the `Start club night` row linking
       to `/night`.
    3. Faces: `Avatar size="lg"` with the first name, each linking to `/matches/new?opponent={id}`, with
       `aria-label` set to the full display name. Then `Other` → `/matches/new?find=1`.
  - Trigger: a 50px round button with `bg-brass` and dark text, a `Plus` icon over a `Play` label, keeping the
    current `-mt-1.5` raise.
- [ ] **Step 5: Wire it in.**
  - `TabBar` renders `<PlaySheet meId={meId} />` in the middle slot.
  - The Profile tab's label becomes `You`.
  - Keep the hide-on-`/matches/new` rule.
  - `layout.tsx` passes `meId={profile.id}`.
- [ ] **Step 6: Run** `npx playwright test e2e/play-sheet.spec.ts e2e/club-night.spec.ts --workers=1`, plus
  `npm run lint` and `npx tsc --noEmit`. Expected: PASS.
- [ ] **Step 7: Commit** `feat(play): the Play sheet: game in progress, club night, recent opponents`

### Task 4: Back goes back; Play on player pages

**Files:**
- Create: `lib/nav-stack.ts`, `tests/nav-stack.test.ts`, `components/nav-history.tsx`
- Modify:
  - `components/page-header.tsx`
  - `app/(member)/layout.tsx`
  - `app/(member)/players/[id]/page.tsx:170-230`
  - `app/(member)/players/[id]/ladder/page.tsx`
  - `app/(member)/live/[reporterId]/page.tsx`
  - `app/(member)/night/page.tsx`
  - `app/(member)/schools/page.tsx`
  - `e2e/play-sheet.spec.ts`

**Interfaces:**
- Produces in `lib/nav-stack.ts`:
  - `export const NAV_KEY = "secbl:nav"`
  - `export const NAV_MAX = 50`
  - `export function parseNavStack(raw: string | null): string[]`
  - `export function nextNavStack(stack: string[], path: string): string[]`
  - `export function canGoBack(stack: string[]): boolean`
- Produces in `components/nav-history.tsx` (`"use client"`):
  - `NavHistory()`, which renders null and is mounted once in the member layout
  - `BackButton({ fallback, label = "Back", icon = "chevron", className }: { fallback: string; label?: string; icon?: "chevron" | "close"; className?: string })`
- Produces: a `PageHeader` prop `history?: boolean`. When true, the back control is `BackButton` with
  `fallback = back`.

- [ ] **Step 1: Failing tests** in `tests/nav-stack.test.ts`:
  - `nextNavStack([], "/")` → `["/"]`.
  - `nextNavStack(["/"], "/")` → `["/"]` (same path is a no-op).
  - `nextNavStack(["/", "/players/x"], "/")` → `["/"]` (returning to the previous path pops; this is the browser's back).
  - `nextNavStack(["/a"], "/b")` → `["/a", "/b"]`.
  - A 50-long stack plus a new path → length 50, ending with the new path.
  - `parseNavStack("{bad")` → `[]`. `parseNavStack('["/",3]')` → `["/"]`.
  - `canGoBack(["/"])` → `false`. `canGoBack(["/", "/x"])` → `true`.
- [ ] **Step 2: Run** `npx vitest run tests/nav-stack.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement the pure module.** Then the client module:
  - `NavHistory` updates the sessionStorage stack from `usePathname()` in an effect. It writes storage only, never
    React state, all in try/catch.
  - `BackButton` renders a `Link href={fallback}` with the `aria-label` and the same classes as today's `PageHeader`
    back link. Its `onClick` calls `preventDefault()` and `router.back()` when `canGoBack(...)` is true.
  - Mount `<NavHistory />` in `layout.tsx`.
  - Add `history` to `PageHeader`, and pass it on the ladder, live (both headers), night (both headers) and schools
    pages.
- [ ] **Step 4: Player page.**
  - The non-me header's back becomes `<BackButton fallback="/leaderboard" />`.
  - Non-me actions become: `<Button asChild><Link href={`/matches/new?opponent=${profile.id}`}>Play {firstName}</Link></Button>`,
    then the existing `startDm` form with `SubmitButton variant="ghost"` (label `Message`), then `ShareButton`.
- [ ] **Step 5: Extend `e2e/play-sheet.spec.ts`:**
  - As A, `goto("/leaderboard?tab=players")`, click B's row → on B's page a link `Play E2E` has an `href` containing
    `opponent={b.id}`.
  - Click `Back` → the URL contains `tab=players`.
  - Open a new page in the same context and `goto("/players/{b.id}")`, click `Back` → the URL path is `/leaderboard`,
    and the page is still the app.
- [ ] **Step 6: Run** `npx vitest run tests/nav-stack.test.ts`, then
  `npx playwright test e2e/play-sheet.spec.ts e2e/profile.spec.ts e2e/chat.spec.ts --workers=1`. Expected: PASS.
- [ ] **Step 7: Commit** `feat(nav): Back returns where you came from; Play on player pages`

### Task 5: Events without club night, and the stage check

**Files:**
- Modify: `app/(member)/events/page.tsx`, `e2e/play-sheet.spec.ts`

**Interfaces:**
- Consumes nothing new. Removes `loadNight` and `eventMentionsSchool` use from the Events page, if nothing else uses
  them there.

- [ ] **Step 1: Extend the e2e:** as A, `goto("/events")` →
  - the tablist `Event filter` has exactly the tabs `Upcoming`, `Past`, `Cups`
  - no link named `Club night`
  - when the list is empty, the text `Start a club night from Play` is visible
- [ ] **Step 2: Run** it. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - `TABS = ["upcoming", "past", "cups"]`. Old `?tab=going|school` links fall back to `upcoming` through the existing
    `find`.
  - Trim `EMPTY` (upcoming copy per Global Constraints) and the `list` branch.
  - Delete the Club night `ListRow` and its `loadNight` call.
- [ ] **Step 4: Run the stage check:**
  - `npm run lint`
  - `npx tsc --noEmit`
  - `npx vitest run --exclude "**/*.integration.test.ts"`
  - `npx playwright test e2e/play-sheet.spec.ts e2e/events-flow.spec.ts e2e/club-night.spec.ts e2e/report-race.spec.ts e2e/profile.spec.ts e2e/chat.spec.ts --workers=1`

  Expected: all PASS.
- [ ] **Step 5: Commit** `feat(events): three tabs; club night lives in Play`
