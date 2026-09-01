# SECBL Frontend Redesign — "Sleek Broadcast": Design Spec

**Date:** 2026-09-01
**Status:** Approved design, pre-implementation
**Parent spec:** `2026-08-31-secbl-design.md`
**Depends on:** Phases 1–4 (all deployed). Precedes Phase 5 (messaging), which will
inherit this design system.

## 1. Scope and intent

A visual and interaction redesign of every existing screen. Users are college
students; the primary usage context is standing at a pool table with a cue in one
hand. Three goals, in priority order:

1. **Phone-first ergonomics** — large touch targets, safe-area awareness, no
   accidental keyboard summons.
2. **A distinct identity** — the "Sleek Broadcast" direction chosen from three
   mockup candidates: warm paper ground, borderless white cards on soft shadows,
   felt-green gradient hero band with oversized gold tabular numerals, dark tab
   bar with a raised gold Report button. Modern sports-app energy
   (theScore/Sofascore register) without cartoon devices — no outlines-as-style,
   no offset sticker shadows, no italic wordmark.
3. **Keyboard-free match reporting** — the report flow becomes a one-screen,
   tap-only surface.

**No data model changes.** Server actions keep their current names and field
contracts; the redesign is presentation and client-side interaction only.

**Deferred to follow-ons, deliberately:**

- **Live rack-by-rack scorekeeping.** A new feature with new in-progress state,
  not a design concern. The one-screen report flow is designed so a future "live
  score" mode can feed the same submit action.
- **Dark mode.** The `.dark` token block in `globals.css` is currently applied by
  nothing and stays that way. It remains in the file (harmless, ~40 lines) but is
  not retuned to the new direction; retune it when a toggle or media-query
  activation actually ships.
- **New logo/wordmark art, double-elimination UI.**

## 2. Design tokens (`app/globals.css`)

The oklch token architecture is unchanged — components still may not hardcode
brand colors. Retuned values:

| Token | Change |
|---|---|
| `--background` | pure white → warm paper, `oklch(0.97 0.008 95)` |
| `--card` | stays white — cards must lift off the paper ground |
| `--border` | only hairline uses remain (dividers); card borders are removed in the Card component, not by zeroing the token |
| `--radius` | `0.625rem` → `0.875rem` |
| `--primary` | felt green, unchanged — standard actions (Confirm, form submits) |
| `--secondary` | gold, unchanged — badges/chips |
| NEW `--hero-from` / `--hero-to` | hero band gradient stops, green family (`oklch(0.44 0.14 143.4)` → `oklch(0.38 0.13 143.4)`) |
| NEW `--gold` / `--gold-foreground` | promoted alias of the gold pair for the hero CTA variant, so "gold as action" is semantic, not a `secondary` pun |
| NEW `--surface-dark` / `--surface-dark-foreground` | the near-black green of the tab bar (`oklch(0.19 0.012 143.4)`) |
| NEW `--shadow-card`, `--shadow-raised` | two-step elevation scale (`0 2px 10px` / `0 4px 14px` at low green-tinted alpha) |

**Typography:** Geist stays; no new font. Scoreboard character comes from usage:

- Stat numerals: `font-weight: 800`, `font-variant-numeric: tabular-nums`,
  negative tracking at display sizes. Utility class `.stat-number`.
- Section labels: 10–11px, `letter-spacing: 0.1em`, uppercase, muted — a shared
  `SectionLabel` component replacing ad-hoc `CardTitle` styling. `CardTitle`
  keeps rendering a real heading element (accessibility invariant from the
  Phase 4 fixes); `SectionLabel` styles it.

## 3. App shell (`app/(member)/layout.tsx`)

**Tab bar** — the dark anchor of every screen:

- Five items: Home `/`, Events `/events`, **Report `/matches/new`**, Cups
  `/tournaments`, Ranks `/leaderboard`.
- lucide icons (`Home`, `CalendarDays`, `Plus`, `Trophy`, `BarChart3`) + 10px
  labels; active item gold, inactive muted green-gray. Active state derived from
  the pathname (client component; the layout stays a server component and renders
  it).
- Report is a raised 56px gold circle, centered, overlapping the bar top,
  `--shadow-raised`. It is a link, not a menu.
- Bar background `--surface-dark`, full-bleed width, contents centered to
  `max-w-3xl`, bottom padding `calc(0.5rem + env(safe-area-inset-bottom))`.
  `viewport-fit=cover` added to the viewport export so the inset actually
  reports on iOS.

**Header** — shrinks to: SECBL wordmark (left, `--primary`, 800 weight); right
side an avatar chip (initial of display name) linking to `/settings`, preceded by
a small "Admin" badge-link when `role === "admin"`. The Logout form moves to the
Settings page. Header sits on the page background, not a band of its own — the
hero band below it carries the color.

## 4. Hero band — the signature pattern

A shared `HeroBand` server component: green gradient (`--hero-from`→`--hero-to`),
white 800-weight title, optional children, bottom padding that the first card
overlaps by 8px (`-mt-2` on the following element, or a `overlap` slot prop).

- **Home:** the band holds the rating hero — `.stat-number` gold at ~52px, with
  rank-at-school and matches-played/provisional as the right-hand stack. Replaces
  the "Your rating" card.
- **Every other member page:** the band holds the page `h1` (and status badge
  where one exists, e.g. tournament Live/Complete).
- Public/auth pages do not use the band (see §6).

## 5. Report flow (`app/(member)/matches/new`)

The page stays a server component for data fetching (opponents list, recent
opponent ids) and renders a `"use client"` `ReportMatchForm`. The `reportMatch`
server action is unchanged; the client form submits it via a real `<form>` with
hidden inputs mirroring client state — progressive enhancement is abandoned
knowingly (steppers are meaningless without JS; the app is already a
logged-in PWA).

Layout, top to bottom:

1. **Opponent chips.** The user's 3 most recent distinct opponents (from their
   matches, any status, newest first; alphabetical fill for new players), as
   64px-tall tap chips with initial-avatar + first name. Fourth chip "All ⌕"
   opens a Radix Dialog (package already installed) rendered as a bottom sheet:
   search input (the only possible keyboard on this screen, 16px font) filtering
   the full approved-member list, tap to select. Helper
   `recentOpponents(matches, allOpponents, n)` in `lib/` is pure and unit-tested.
2. **Score steppers.** Two side-by-side cards, "You" / selected opponent's first
   name. Each: 34px+ `.stat-number`, − and + buttons ≥44px. Range 0–99.
   Shared `ScoreStepper` client component, reused by tournament result entry
   (§6). Stepper buttons are `type="button"` (form-submit safety).
3. **Game type.** Segmented control (8-ball · 9-ball · 10-ball · Other),
   default 8-ball. Radio inputs visually hidden under the segments — the value
   rides the form natively.
4. **Date.** Single line: "Today · change" — tapping "change" swaps in the
   native date input (16px), pre-filled by `clubDateOf`.
5. **Submit.** Full-width `hero` (gold) Button. Label narrates:
   "Report 5–3 win" / "Report 3–5 loss". Disabled with muted styling when no
   opponent selected, at 0–0, or on a tie; the disabled reason is shown in the
   helper line under the button ("Scores can't be equal"). The existing
   opponent-confirms notice stays under the button.

Error/message display keeps the current searchParams pattern.

## 6. Screen-by-screen treatment

All member pages get: hero band, `SectionLabel` cards, borderless Card, 16px
inputs. Specifics:

- **Home:** band = rating hero (§4). Confirm-results buttons grow to default
  size (not `sm`); each pending item becomes its own card row with the
  reporter's claim in one glanceable line. Recent matches: winner bold, score
  right-aligned tabular.
- **Leaderboard:** rows as a single card list — rank number (800 weight), name +
  school chip, rating right-aligned `.stat-number`. Top 3 ranks gold; the
  viewer's own row highlighted with `--accent`. Provisional players keep their
  current visual distinction.
- **Events:** each event a card with a compact date block (weekday/day) left,
  title + location + RSVP tallies right; RSVP actions as three tappable chips
  (Going / Maybe / Out) with the user's current response filled. Event
  detail/new/edit forms restyled only.
- **Tournaments:** list = cards with status badge (Live = gold). Detail: rounds
  keep the card-per-round structure; each match row gets clearer
  winner-emphasis; result entry swaps its number inputs for `ScoreStepper`
  (admin flow, same muscle memory as reporting). Setup page restyled only.
- **Players:** mini hero band (name, school, rating gold), history as Recent
  rows.
- **Settings/Admin:** restyle only; Settings gains the Logout button (from the
  header) as a full-width destructive-outline row.
- **Auth pages (public group):** centered single card on the paper ground,
  `secbl-logo.png` at top, 16px inputs, full-width green submit,
  links as quiet text buttons. `/pending` gets the same card with a friendly
  headline.

## 7. Accessibility and ergonomics invariants

- Touch targets ≥44px for all interactive elements on member pages.
- All inputs ≥16px font-size (kills iOS focus auto-zoom). The base `Input`
  component changes; desktop keeps visual size via padding, not font-size.
- Color pairs maintain WCAG AA per the existing globals.css annotations; the
  gold hero Button uses dark text (13.5:1 on gold).
- `CardTitle` remains a real heading; tab bar links get `aria-current="page"`
  when active; stepper buttons get `aria-label` ("Increase your score");
  the narrated submit label is the accessible name.
- Focus states: `--ring` outlines stay on all interactive elements.

## 8. Testing

- `lib/` pure modules are untouched; vitest suite must stay green as-is.
- New pure helper `recentOpponents` is TDD'd in `lib/` with vitest.
- Component behavior that carries logic (stepper clamping, submit narration,
  tie-disable) lives in small pure functions (`lib/report-form.ts`) so it is
  vitest-testable without DOM tooling; the components stay thin.
- Playwright e2e: existing specs keep passing where semantics are stable
  (headings, labels, roles are preserved). Specs that select the report form's
  old number inputs (none currently exist) or nav link names are updated in the
  same commit that changes them. Full suite (`--workers=1`) runs at the end of
  every phase and before deploy.
- Visual sanity: manual pass at 390×844 (iPhone 14 class) and desktop width via
  Playwright screenshots at the end.

## 9. Implementation order (for the plan)

1. Tokens + base components (Card, Button `hero` variant, Input 16px,
   `SectionLabel`, `.stat-number`) — the whole app shifts style without layout
   changes.
2. Shell: tab bar + header + safe areas + viewport.
3. `HeroBand` + Home.
4. Report flow (helpers TDD'd first, then UI).
5. Remaining member screens (leaderboard, events, tournaments, players,
   settings/admin).
6. Auth/public screens.
7. Full e2e + mobile screenshot pass + deploy.
