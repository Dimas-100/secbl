# Play & Progress: navigation and progress redesign

Date: 2026-10-21 · Status: design approved by the owner in a mockup walkthrough (screens kept in the gitignored
`.superpowers/brainstorm/9432-1792594886/content/`: `play-button.html`, `you-page.html`, `home.html`,
`after-game.html`, `ranks-player.html`). Mockup data is invented. Where a mockup and this document disagree, this
document wins.

## Why

SECBL does two jobs, in this order:

1. **Make playing another member as easy as possible.** Most of what members do in the app is start, score and record
   a game.
2. **Make tracking feel worth it.** The owner wants the pull Duolingo has: you open the app because you want to see your
   own progress. Every game a member records should show them something about how their pool is changing, so they
   *want* to record the next one.

Today both jobs are let down by layout, not missing data:

- Starting a game is split three ways. ＋ opens "Log a game". Club night is a thin row inside Events, and only reaches
  Home while a night is running. A player's page has "Message" but no way to play them, even though
  `/matches/new?opponent=<id>` already exists.
- What needs you (a result to confirm) sits below the rating hero on Home, out of sight on a phone.
- A new member's Home leads with numbers that mean nothing yet: 450, a flat line that looks like a full progress bar,
  "#6 overall" with zero games, "0% to 2". There is no first step.
- Progress pieces (level, next badge, achievements, best win, streak) exist but are scattered across Home and Profile,
  and nothing says "here's what's next".

Context for the builder: the club is small (8 members, all GSU, a handful of confirmed games as of 2026-10-20). Almost
everyone opening the app is in their first few games, so the new-member experience carries extra weight.

## Goals

- One obvious way to start any game, from anywhere: a labelled **Play** button.
- Anything waiting on you is the first thing Home shows.
- A new member sees one thing to do, not meaningless numbers.
- A **You** page that tells the story of your pool from match results: level, this month, rating over time, recent
  form, where you win, rivals.
- A payoff the moment a game counts: what that game did to your rating, XP, rank and records.
- Getting from a name anywhere (Ranks, a feed row) to a game against that person takes two taps.

## Non-goals

- **No shot-level stats.** Progress is built only from what a match already records: who, score, game, race, spot,
  date, and the rating history. The owner ruled out anything that makes members enter more during a game.
- No changes to Messages, Settings, the level ladder (`/players/[id]/ladder`), Admin, or the public screens (login,
  signup, reset, install). Settings stays behind the gear on the You page.
- No new scoring rules. Rating, XP, levels, seasons and achievements keep their current maths.
- No weeks-in-a-row streak (considered and dropped, see Decisions).

## Anti-goals (a failure even if it works)

- Stats that feel like homework: dense tables, jargon, numbers nobody can read at a glance.
- Game-style extras that feel childish to college pool players: no mascots, confetti storms or cartoon copy. The tone
  stays the current Elevated Dark one: quiet, brass-accented, confident.
- Anything that makes playing slower. Every change must keep or reduce taps between "I want to play X" and a game on
  the board.
- Copy that says anything untrue. Every recap, goal and "what changed" line must be computed and correct, and must not
  appear when it doesn't apply.

## Constraints

- **Next.js 16 with breaking changes.** Read the relevant guide in `node_modules/next/dist/docs/` before writing code
  (AGENTS.md).
- **Public repo.** Tests, fixtures, specs and commit messages use invented names only. The ship guard refuses a push
  carrying a current member's name.
- **Design system.** Follow `2026-10-06-elevated-dark-redesign-design.md`: dark only, Geist, brass `#C9A96E` as the one
  accent, hairline tokens, `.eyebrow` (not `overline`), `.stat-number`, existing primitives (`ListRow`, `StatGrid`,
  `LevelBar`, `TitleBadge`, `Avatar`, `ShowMore`, `SectionHeading`, `UnderlineTabs`, `Segmented`).
- **No migration is expected.** Everything here is computed from `matches`, `rating_history`, `profiles`, the
  `leaderboard` view, `live_games`, club-night tables and the XP replay (`loadXp`). If the builder finds a migration is
  truly needed, stop and raise it. Migrations are applied by the Supabase MCP, and drops or function replacements may
  need the owner present (see CLAUDE.md).
- **Branch base.** Home was rewritten on the local, unpushed branch `chore/home-cleanup` (commit 2c45535; photo posts
  retired, season strip names the leader, quieter feed). Build on that branch's Home, not master's. Migration
  `0032_remove_posts.sql` is applied only after that branch deploys.
- **Project conventions.** Pure logic lives in `lib/` and is written test-first (vitest). All date and time logic goes
  through `lib/events.ts` (club time is `America/New_York`, Vercel is UTC). React compiler lint rejects `Date.now()` in
  components. A Server Component cannot pass a function prop to a Client Component. PostgREST returns at most 1000 rows
  per query. A supabase-js builder only runs when awaited.
- **E2E sentinels to keep, or to update deliberately in the same change:**
  - Home `heading /^recent$/i` (14 uses). Keep the "Recent" heading.
  - `region "Latest result"` and the `"Nice"` button in `e2e/report-race.spec.ts`. The game-counts screen replaces the
    card, so update this spec.
  - Button `/Send to {name} to confirm/`. Keep the label.
  - Button `"Confirm"` on Home. Keep it.
  - Button `"Message"` on a player page. Keep it.
  - Button `"Start club night"` on `/night`. Keep it.
  - Heading `"Messages"`. Unchanged.
  - The e2e must never drive the Admin season form.
- **Phone-first.** Design at 390×844. Keep the existing `touch-action: manipulation`, 16px inputs and safe-area
  padding. Respect `prefers-reduced-motion` for every count-up and transition.

## The design, page by page

### 1. Tab bar and the Play sheet (owner picked option B)

Tabs: **Home · Ranks · Play · Events · You.** "Profile" is renamed **You** (same destination, the viewer's own player
page). The middle button becomes a labelled brass **Play** button, still raised in the bar. It is still hidden on
`/matches/new`.

Tapping Play opens a **bottom sheet** (an accessible dialog: focus trapped, Escape and tap-outside close it, a drag
handle) titled "Play". Top to bottom:

1. **Back to your game** (only when you have a game in progress): "Back to your game · 3–2 vs Jordan". It returns to
   `/matches/new`, which restores the draft. *Claude's call.* The draft already lives in `localStorage` under
   `secbl:draft-game:{meId}`. Show the row when a draft with an opponent exists; the builder decides whether a 0–0
   draft counts.
2. **Club night.** If a night is running at your school: the same status line and one primary action as `NightCard`
   (Get in line / Leave line / Start game / Watch the table), reusing its logic. If none is running: a "Start club
   night" row that opens `/night`, where the table picker lives. Don't duplicate the picker in the sheet.
3. **Play someone now.** Up to four faces, ordered by the scoreboard's existing recency rule (whoever you actually play,
   any status), then **Other** (search). A face opens `/matches/new?opponent=<id>`. Other opens `/matches/new` with the
   search focused. With no history yet, fill the faces with members of your school, then anyone.

Tap counts stay as today: Play → face → scoreboard with the opponent filled in. Only "someone outside your recent four"
gains a tap.

*Left to the builder:* how the sheet gets its data. The tab bar lives in the member layout. Fetching on open (with a
skeleton) keeps every page's server render unchanged; prefetching keeps the sheet instant. Either is fine if the sheet
feels immediate on a phone.

### 2. Home

Order, top to bottom:

1. **Header** as today (avatar, greeting, title badge, streak flame, messages).
2. **Needs you.** Gold-edged cards (a brass hairline with a faint brass wash) for anything you must act on, in this
   order:
   - results to confirm: avatar, "Jordan logged a game", score/game/race, **Not right** (rejects, as Reject does today)
     and **Confirm**
   - your called club-night table ("You're up on table 2 vs Jordan" with Start game / Watch the table)
   - agreed games you can still flag ("Logged for you", as today)

   A game left halfway may also appear here, linking back to the scoreboard (client-side, from the draft).
3. `NotifyPrompt`, as today.
4. **Progress card.** This replaces the hero number, the sparkline and the three stat tiles. It is one card that opens
   the You page:
   - rating, with "+N this month" (green) or "−N this month" (coral) when known
   - the last five results as small dots (filled green = win, coral ring = loss), newest on the right
   - level and title with an XP bar and "N XP to {next title}"
   - one **Next:** line, picked by this priority (*Claude's call*, approved): "pass {name} for #k · N pts" when someone
     ranks directly above you; when you are #1, a "lead by N pts" line or your next badge; when neither applies, the
     next badge's XP
5. **Season strip**, as built on `chore/home-cleanup` (`seasonStrip()`).
6. **Club night** (a night is on and you're not called yet: Get in line / Leave line), **Live now**, and **next event**,
   as today when they apply.
7. **Recent** (the league feed), unchanged. The heading text stays "Recent".

**Placement.** "Provisional" (fewer than 10 confirmed games) becomes **placement**, shown as dots that fill in:

- **0 games:** the progress card is replaced by a **Step 1** card (gold-edged). It has a "Step 1" chip, "Play your first
  game", one line ("Your first 10 games set your rating. Win or lose, every game counts toward your level.") and
  "Placement games · 0 of 10" with ten empty dots. It also shows "Play someone from {school}": four faces plus Other,
  and a face opens the scoreboard with that person in. No rating, rank or level-percent appears until the first game
  counts.
- **1–9 games:** the normal progress card, with placement dots (k of 10 filled) in place of the five form dots, and the
  Next line reading "{10−k} more games to finish placement". *Claude's call, not mocked.*

The "Waiting on" list (your reports the other player hasn't confirmed) stays, below the progress card. It is
information, not an action.

### 3. The game-counts screen (replaces `CelebrationCard`)

A full-screen moment (an accessible dialog) that appears when a game of yours counts:

- immediately after "We agreed — count it" (that action lands on Home)
- otherwise, the next time you open Home after your opponent confirms

It uses the same trigger as today's card: `freshMatch` (newest confirmed game within 24 h), not already in the
per-device `secbl:celebrated` list. Dismissing adds the game to the list.

Contents:

- "Win" / "Loss" eyebrow and a headline: "You beat Jordan 5–3" / "Jordan beat you 5–3". Then game and race.
- Rating before → after with the signed change (green / coral), counting up as the card does today.
- "+N XP" and the level bar filling from its old position to its new one. If the game crossed a level or earned a
  title badge, say so; this is one of the lines below.
- **Up to three "what changed" lines**, only ones that are true for this game. Suggested priority:
  1. rank change ("Up to #3, passing Taylor")
  2. level-up or title badge
  3. achievement earned
  4. first win over this opponent
  5. win streak of 3, 5 or 10
  6. record in this game type ("8-ball record now 9–3")

  The builder may tune the order but must never pad.
- Buttons: **Done** (dismiss) and **Rematch**. Rematch opens a fresh scoreboard with the same opponent, game type and
  race: `/matches/new?opponent=<id>&game=<type>&race=<n>`. The new `game` and `race` params are validated against the
  allowed values and ignored if invalid. The spot is re-suggested from current ratings, not copied.
- **After a club-night table game** (owner's decision), the second button is **Back in line** instead of Rematch. It
  rejoins you at the end of tonight's line. Reporting already frees the table and calls the next pair, and Rematch would
  skip the first-come, first-served line (club-night spec, decision 2). Use Back in line only while that night is still
  running; if it has ended, show Done alone. The screen needs to know whether the game was played at a club-night table
  (`night_game_reported` and the night tables already record this).
- **Rematch and the duplicate check** (*Claude's call*). `findDuplicate` flags any same-pair, same-day game, so every
  same-day rematch would hit "You and X already have a game today". A board opened by Rematch ignores games created
  *before that board opened*. Two reports of the rematch itself (the 2026-10-15 double-count case) are both created
  after it opened, so they are still caught. Every other path keeps the check unchanged.
- Losses get the same screen with honest framing: the coral rating change, the XP still earned. No consolation copy.
  The "what changed" lines run in both directions (*Claude's call*): a loss that drops you a place says so ("Down to
  #4, Taylor passed you"). Never pad, never soften.
- Background: the win green glow from the mockup for a win; a neutral treatment for a loss.

Update `e2e/report-race.spec.ts`: it asserts the region "Latest result", "Lost 1–3 vs E2E", "+80 XP" and that dismissal
persists across a reload. Keep equivalent assertions against the new screen. Also check:

- `e2e/season-feed.spec.ts` ("Lost 0–3")
- `e2e/report-agreed.spec.ts` ("beat you", "Not right?")

The full-screen dialog will sit over Home after a result, so specs that keep clicking on Home must dismiss it first.

### 4. Scoreboard (`/matches/new`)

- Title: **New game** before an opponent is chosen, **vs {first name}** after.
- Once the first point is scored, the setup block (opponent, game, race, spot, date) **folds into one summary line**:
  avatar, "8-ball · race to 5 · no spot" (or the spot), and **Edit**. The score columns and +/− buttons take the freed
  space and grow. Edit unfolds it. A restored draft with a score above 0 opens folded.
- Everything else stays: the footer (We agreed — count it / Send to {first} to confirm), the duplicate notice, table
  talk, live publishing, finish effects, haptics, the draft.
- Accept the Rematch params (`game`, `race`) alongside the existing `opponent`.
- **Never silently lose a live score** (*Claude's call*). Today `?opponent=X` quietly replaces a draft against someone
  else (`report-form.tsx`, written for club night's single Start game link). This spec adds more ways in: sheet faces,
  Step 1 faces, Play {name}, Rematch. So:
  - When a draft with a score above 0 exists against a different opponent, ask first: "You have a game in progress vs
    Jordan (3–2)", with **Keep that game** / **Start new**.
  - A 0–0 draft is replaced silently, as today.

### 5. You page (own player page)

Same route (`/players/[id]` when the id is yours). Order:

1. Header: avatar (camera affordance as today), name, school and favourite game. The gear opens Settings. Keep Edit
   profile and Share, placed as the builder sees fit.
2. **Level and XP bar** (moved to the top). Opens the ladder.
3. **This month in one sentence** (own page only), e.g. "October so far: 7 games, 5 wins. You climbed from #6 to #3."
   Computed in club time. Only true clauses appear: drop the climb clause when rank didn't change or can't be computed.
   With no games this month, either hide the card or say when your last game was; the builder picks. Rank at month
   start can be rebuilt from `rating_history` (each member's rating as of that instant, using the leaderboard's
   ordering). If that proves unreliable, say points gained instead of places climbed.
4. **Rating chart.** A real chart instead of the thin sparkline: Month / Season / All ranges. Hide Season when no season
   is open. Peak rating and best win (`bestWin`) are marked on the line. These replace the old "Records" section.
5. **Form:** the last 10 confirmed results as W/L dots, oldest left → newest right, with "won N of your last 10" and
   your longest win streak (`longestWinStreak`) beside it.
6. **Where you win:** record and win % per game type you've played, then record against players rated above you and
   below you. Compare ratings before the match, from `rating_history` for that `match_id`.
7. **Rivals:** your two or three most-played opponents, head-to-head record, and one recent line ("You've won the last
   2" when the last 2 or more results against them match, else "Last played Oct 13"). Tapping opens their page.
8. **Achievements** and **Match history**, as today.

### 6. Someone else's page

The same layout minus the month sentence, with:

- primary **Play {first name}** (opens `/matches/new?opponent=<id>`), then **Message** (keep the label), then Share
- **You vs {first name}** card right under the buttons: head-to-head record, plus "You've won the last N" or "Last
  played …" or "You haven't played each other yet"

### 7. Ranks

Tabs stay Season · Players · Schools.

- **Movement only when it happened:** ▲ N (win colour) or ▼ N (loss colour) for the week. Nothing when zero; drop "–
  this wk".
- **Placement replaces the asterisk:** members with 1–9 games show a muted rating and a small "placing k/10" tag. Remove
  the "* provisional" footnote.
- **Unplaced members** (owner's decision): members with no confirmed games get no rank number. They are listed after
  everyone ranked, under a quiet "Not placed yet" label, with no number. Ranks count only members with at least one
  confirmed game, everywhere: Ranks, Home's progress card and Next line, "N pts to #k", the game-counts "passing" line,
  the month sentence, and `passMoment` feed rows. An unplaced member is never named as someone you passed. On the Season
  tab, the same rule applies to members with no games this season. A member's own rank first appears after their first
  confirmed game, matching the Step 1 card on Home.
- **Your row** keeps its highlight and adds "N pts to #k" (the gap to the member directly above). Not shown at #1.
- **Schools tab:** schools with no members fold into one line, "Not here yet: UGA · KSU · GT · FSU", with **Invite**
  linking to `/install/card`.
- Rows keep linking to player pages.

### 8. Events

- Tabs become **Upcoming · Past · Cups**. Drop "Going" (event rows already show Going / RSVP / You went) and "My
  school".
- Remove the Club night row; club night now lives in the Play sheet and on Home.
- Empty Upcoming for members: point to club night ("Nothing on the calendar. Start a club night from Play.") instead of
  a dead end.
- Admin buttons (New event, New tournament) stay.

### 9. Back buttons

Back on sub-pages (player pages first, then any `PageHeader back=…`) returns to where the member came from. When there
is no in-app history (a push-notification deep link, a pasted URL, a fresh tab), it falls back to the page's current
`back` href. *Left to the builder:* how to detect in-app history reliably in the App Router.

## Decisions

Decided by the owner:

- The two jobs and their order (easy play first, Duolingo-style progress second); the "want to track to see progress"
  framing.
- Results only, no shot-level stats.
- Play sheet (option B) over going straight to the scoreboard.
- You page includes: level up top, the month sentence, the rating chart, form, where you win, rivals. "Use your
  judgement" on the rest.
- Approved as mocked: Home (both states), the scoreboard fold, the game-counts screen with Rematch, Ranks changes,
  someone else's page, Events trim, and no changes to Messages / Settings / ladder / public screens.
- Members with no confirmed games are unranked ("Not placed yet") and never named in a passing line.
- After a club-night table game, the game-counts screen offers Back in line instead of Rematch.

Claude's calls (shown to the owner, not separately chosen):

- Records fold into the chart and form instead of being their own section.
- Weeks-in-a-row streak dropped: in a club where people play when they can, a streak that breaks every busy week
  punishes the members we most want to keep. Revisit if the owner asks.
- "Up next" survives as the single **Next:** line on Home's progress card, not as a section on You.
- "Back to your game" row in the Play sheet.
- The game-counts screen replaces the Home celebration card.
- Placement wording and dots for members with 1–9 games.
- "Going" and "My school" tabs removed from Events.
- A Rematch board ignores same-day games created before it opened; the duplicate check is otherwise unchanged.
- The "what changed" lines report drops as honestly as gains.
- A scored draft is never discarded without asking.
- **One ranking order everywhere:** rating desc, then wins desc, then id. Today the `leaderboard` view orders by
  `rating desc, wins desc` with no final tiebreak, and `passMoment` (`lib/activity.ts`) orders by `rating desc, id`, so
  a tie can rank differently on different screens. Put one shared ordering function in `lib/` and use it for every
  rank, gap and "passing" line. Sort in the app; no view change is needed.

## Suggested build order

Each stage can ship on its own:

1. **Navigation:** tab bar (Play, You), Play sheet, Play button on player pages, back behaviour, Events trim.
2. **Home:** needs-you stack, progress card, Step 1 card, placement.
3. **You page and someone else's page.**
4. **Scoreboard fold, game-counts screen, Rematch.**
5. **Ranks polish.**

## Success

The owner's measure: members record games without being asked, because they want to see what the game did to their
numbers, and they come back between games just to look. Watch confirmed games per week and members with at least one
game this month. No analytics work is in scope; the database already answers both.
