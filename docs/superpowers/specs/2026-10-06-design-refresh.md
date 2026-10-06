# SECBL Design Refresh — "Scoreboard You"

**Date:** 2026-10-06
**Status:** Approved direction, implementation in progress — **visual layer superseded by `2026-10-06-elevated-dark-redesign-design.md`** (data features here still apply)
**Builds on:** `2026-09-01-frontend-redesign-design.md` (Sleek Broadcast tokens, shell, report flow stay)

## 1. What we looked at and what we took

| Source | Pattern worth stealing | Where it lands |
|---|---|---|
| chess.com Stats | Rating graph over a selectable window; "change over period" next to the number; highest rating with its date; best win (opponent + rating); longest streak | Home hero sparkline + 30-day delta; Player page stat tiles and "Best win"; Peak rating |
| Strava | Two surfaces: **You** (self-reflection) and **Home feed** (what everyone did), with one central primary action | Home = your numbers first, then the league feed; Report stays the raised center tab |
| Sofascore / theScore | Match cards grouped by date; labels next to every icon; a personal "My" area | League feed grouped by day; W/L pills always labelled; "You" row highlighted everywhere |
| DigitalPool | Live bracket, follow players, universal player search | Already have live brackets and the member picker; Player page gets head-to-head vs you |

Rejected on purpose: dark-mode-first "sleek dark" (OrbPot) — students report matches in bright bars; the warm paper ground stays. Social kudos/likes — v1 chat covers the social layer.

## 2. Design plan

- **Palette** (unchanged core): felt `#03600c`, gold `#ffde59`, paper `oklch(0.97 0.008 95)`, card white, ink `oklch(0.145 0 0)`. **Two additions**, semantic only: win `oklch(0.52 0.14 150)` and loss `oklch(0.55 0.17 25)` — used for W/L pills and delta chips, never for decoration.
- **Type:** Geist stays; the scoreboard character comes from `.stat-number` at three fixed sizes (hero 52px, tile 28px, row 16px). No new eyebrow labels beyond the existing `SectionLabel`.
- **The one memorable element:** the hero rating with a hand-drawn-feeling sparkline of your last 30 rated matches that draws itself once on load (reduced-motion: static). Everything else is quiet.
- **Layout (Home)**
  ```
  ┌ hero: YOUR RATING  614  ▲ +26 this month ─ sparkline ──┐
  │ form  W W L W W                                        │
  └────────────────────────────────────────────────────────┘
   [ Record 12–5 ] [ Win rate 71% ] [ Streak W4 ] [ #2 GSU ]
   ▸ Confirm results (if any)      ▸ Waiting on …
   ▸ Next up (event)
   League feed — Today / Yesterday / Sat, Oct 3
     ◯ Avery  def.  ◯ Blake     7–4   +18
  ```
  Left-aligned text, numbers right-aligned tabular. Stat tiles are a 4-up grid (2×2 under 360px).
- **Player page:** same hero (name, school chip, rating + sparkline), stat tiles (Record, Win rate, Peak, Streak), **vs you** head-to-head card when it isn't you, Best win, recent matches as the shared row.
- **Leaderboard:** podium for the top three (gold / silver / bronze numerals, no confetti), segmented filter All league / My school, each row shows 7-day movement (▲ 12 / ▼ 4 / –). Provisional stays as the asterisk.
- **Interactions:** every tappable row, chip and button gets `active:scale-[0.98]` press feedback and a 120ms transition; nothing animates on hover alone. The sparkline draw is the single page-load motion.
- **Components:** `Avatar` (initials, size variants), `StatTile`, `Sparkline` (pure SVG, server component), `MatchRow` (shared by Home, Player), `Segmented` (link-based, no JS).

## 2b. Personalization layer (added 2026-10-06, migration `0016_personalization.sql`)

The owner's brief: members should feel the app is *theirs*. What shipped:

- **Profile photo.** Chosen in Settings → Your look; cropped square and resized to 512px in the browser (`createImageBitmap` + canvas → JPEG) before upload to the public `avatars` Storage bucket, under `<profile id>/`. Storage RLS limits writes to the caller's own folder; `set_avatar_url()` refuses any URL outside it. Old files are removed best-effort on replace/remove.
- **Your ball.** With no photo, the avatar is the member's ball from the real rack — solids 1–7, the 8, stripes 9–15 (stripes draw the white band). Chosen in Settings, or derived stably from the profile id (`lib/identity.ts`). This replaces the grey initial disc everywhere: header, feed rows, podium, inbox, opponent chips, picker.
- **Tagline (≤60) and favourite game.** Shown in the player hero ("Plays 9-ball").
- **School colours.** Real primaries set on `schools`; used only as a 2px ring on avatars where school identity matters (leaderboard, player hero).
- **Achievements.** Computed, never stored (`lib/achievements.ts`): First win, Regular (10), Veteran (25), Heater (5 straight), Shutout, Giant killer (beat someone 50+ above), 500 club, 600 club, Champion (tournament final won). Player page shows earned chips and "n of 9 · next: …".
- **Greeting.** Home hero opens "Good evening, Avery" on the club clock.
- Self-service writes go through `update_profile_prefs()` / `set_avatar_url()` (SECURITY DEFINER, own row only) — `profiles` still has no member UPDATE policy.

## 3. Pure logic (`lib/stats.ts`, test-first)

`sparklinePath`, `currentStreak`, `winRate`, `ratingChangeSince`, `peakRating`, `bestWin`, `headToHead`, `movementSince`. All date math stays in `lib/events.ts` conventions (UTC instants in, club-zone formatting out).
