# SECBL Levels & XP — the achievement ladder

**Date:** 2026-10-06
**Status:** Approved direction (owner), not started. Build after or alongside `2026-10-06-elevated-dark-redesign-design.md`; independent of it.
**Scope:** Pure logic + display. **No migration in v1.**

## 1. Two tracks, kept apart

| | Rating (exists) | Level (new) |
|---|---|---|
| Measures | Skill | Effort / time in the league |
| Moves | Up and down (Fargo-style Elo, `lib/rating.ts`) | **Only up** |
| Drives | Leaderboards, podium, "Giant killer" | Titles, progress bar, "something to chase" |
| Reset | Never — current ratings must equal a replay of confirmed matches (README invariant) | Never |

Losing a match still earns XP, which is the whole point: a newer member on a 0–5 week still makes visible progress and keeps showing up. Rating stays the honest skill number.

## 2. The ladder

XP to go from level *n* to *n+1* = **100 + 50 × (n − 1)**. XP needed to *reach* level L = `100·(L−1) + 25·(L−1)·(L−2)`.

| Title | Levels | XP to reach | Typical pace* |
|---|---|---|---|
| Rookie | 1–4 | 0 | day one |
| Regular | 5–9 | 700 | ~2 weeks |
| Shark | 10–14 | 2,700 | ~6–7 weeks |
| Hustler | 15–24 | 5,950 | ~1 semester |
| Master | 25–39 | 16,200 | ~39 active weeks (1–1.5 school years) |
| Legend | 40+ | 40,950 | ~97 active weeks (2–3 school years) |

\*At ~3 confirmed matches a week, about half won (~420 XP/week); "active weeks" = weeks the member actually plays. Calibrated so Legend is reachable for a committed member before graduating but rare. The rising cost per level is deliberate: early titles come fast (hook), late ones stay meaningful (no ceiling hit in one semester).

## 3. Earning XP (v1)

| Source | XP |
|---|---|
| Confirmed match, won | 200 |
| Confirmed match, lost | 80 |
| Tournament match (`tournament_matches` with a winner), won / lost | 200 / 80 |
| Tournament final won (same trigger as the Champion achievement) | +300 bonus |

Pending, rejected and disputed matches earn nothing.

**Anti-farming cap — required, not optional.** Opponent confirmation stops one person inventing results but not two friends colluding. Rule: for any pair of players, only the **first 3 confirmed matches in a club week** (Mon 00:00 – Sun 23:59, `America/New_York`, via `lib/events.ts`) earn XP, for both players. Later ones still count for rating and stats, earn 0 XP, and the UI says so in the match row ("No XP — weekly limit with this opponent").

**Deferred to v2 (each needs state or schema this app doesn't have yet):** daily challenges (need per-day state), event attendance XP (RSVP ≠ attended; needs check-in), league-night 2× (matches aren't linked to events).

## 4. Logic — `lib/levels.ts`, test-first, pure

Mirrors how `lib/achievements.ts` works: **computed, never stored.** XP is a deterministic replay of confirmed matches in `confirmed_at` order, so it can never drift from the match record and needs no write path or RLS.

```ts
export const TITLES = [
  { name: "Rookie", from: 1 }, { name: "Regular", from: 5 }, { name: "Shark", from: 10 },
  { name: "Hustler", from: 15 }, { name: "Master", from: 25 }, { name: "Legend", from: 40 },
] as const;

xpToNext(level: number): number                 // 100 + 50*(level-1)
xpToReach(level: number): number                // closed form above
levelFromXp(xp: number): { level, title, intoLevel, needed, nextTitle, levelsToNextTitle }
xpFromMatches(viewerId, matches: XpMatch[], clubWeekOf: (iso) => string): { total, perMatch: Map<id, number> }
```

Tests (Vitest, `tests/levels.test.ts`): level boundaries (0→L1, 699→L4, 700→L5, 40,950→L40); `xpToReach` matches the summed per-level costs for L1–60; win/loss values; the 4th match vs the same opponent in one club week earns 0 for both players; the cap resets at Monday 00:00 New York time, including across a DST change; a match confirmed Sunday 23:30 ET counts in that week, not the next (server runs UTC); pending/rejected/disputed earn 0; tournament final bonus applied once.

## 5. Display

- **Home:** the stat grid's third cell = "Lvl 12" over "65% to 13".
- **Profile:** "Level 12 · Shark" (title in brass) + 2px progress bar + "420 / 650 XP" caption, in the slot the redesign spec reserves.
- **Match rows:** optional "+200 XP" caption next to the rating delta; "No XP — weekly limit" when capped.
- **Rank ladder screen** (new, opened by tapping the level on Profile): the six titles top to bottom, current one highlighted with your progress, past ones checked, future ones muted with "XP to reach"; then the earning table from §3 and the weekly-limit rule in one plain sentence. Uses the redesign's tokens and hairline rows; no reference mockup yet — design it to match `OptE_Profile.dc.html`.

## 6. Done when

`lib/levels.ts` + tests pass; Home and Profile show level from real data; the ladder screen exists; capped matches are labelled; the same verify suite as the redesign spec passes. No migration was needed.
