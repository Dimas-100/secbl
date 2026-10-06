# SECBL — SEC Billiards League

A mobile-first PWA for the SEC billiards group: Fargo-style ratings, match
reporting with opponent confirmation, player and school leaderboards, events
with RSVP, live single-elimination brackets, and real-time chat (league room,
school rooms, DMs). Production: https://secbl.vercel.app

**Stack:** Next.js 16 (App Router, Server Actions) on Vercel · Supabase
(Postgres, Auth, Realtime, RLS) · Tailwind 4 + shadcn/ui · Vitest · Playwright.

## Run it

```bash
cp .env.example .env.local   # Supabase URL + anon + service keys, and the VAPID push keys (`npx web-push generate-vapid-keys`)
npm install
npm run dev                  # http://localhost:3000
```

## Verify

```bash
npm run lint
npx tsc --noEmit
npx vitest run --exclude "tests/*.integration.test.ts"   # pure logic, no network
npx vitest run                                           # + RLS/messaging tests against the live project
npx playwright test --workers=1                          # e2e; parallel runs are flaky from cold compiles, not bugs
npm run build
```

The integration and e2e suites create and delete real rows in the one Supabase
project that also serves production. Teardown lives in `afterEach`
(`e2e/cleanup.ts`); after any killed run, sweep `profiles` for `E2E%`, `e2e-%`,
`msg-%` and `Cup %` names.

## Deploy

Vercel is not git-connected. From this directory:

```bash
npx vercel deploy --prod --yes
```

Database changes are SQL files in `supabase/migrations/`, applied to the
project in order (the Supabase MCP `apply_migration` or the dashboard SQL
editor). `vercel.json` schedules `/api/health` daily, which keeps the free-tier
database from pausing after a quiet week.

## Where things are

| Path | What |
|---|---|
| `app/(public)` | login, signup, password reset |
| `app/(member)` | everything behind login: home, log a game, events (+ cups), leaderboard, players, chat, settings, admin |
| `lib/rating.ts`, `lib/bracket.ts`, `lib/events.ts`, `lib/chat.ts`, `lib/inbox.ts`, `lib/report-form.ts`, `lib/race.ts`, `lib/levels.ts`, `lib/push.ts` | pure, test-first logic |
| `lib/push-send.ts`, `public/sw.js` | Web Push: server-side send (VAPID, service role) and the service worker that shows it |
| `scripts/seed-school-logos.mjs` | one-off: seeds the schools' logos from Wikimedia Commons into the `school-logos` bucket |
| `supabase/migrations` | schema, RLS, SECURITY DEFINER functions (the only write path for ratings, brackets, membership) |
| `docs/superpowers/specs` | design specs per phase; `plans/` the implementation plans |

## Invariants worth knowing

- Ratings are never written from the browser; every rating write goes through
  `apply_match_confirmation` / the tournament functions under one advisory lock,
  and current ratings always equal a replay of confirmed matches.
- Chat DMs are visible to exactly the two participants — admins included out.
- Match scores are stored as the scoreboard showed them: a spot (games on the
  wire) is already inside the receiver's score, so `winner_id` is always the
  higher score. `race_to` null means open play, including every row written
  before migration 0020. Spots never change rating or XP.
- PostgREST caps every response at the project's Max Rows (1000) whatever
  `.range()` asks for. Whole-table scans (`lib/xp-data.ts`) page through
  `lib/paging.ts`; `lib/recompute.ts` guards against truncation.
- Push notifications are a courtesy, never part of the write: every trigger
  runs after the row is saved and swallows its own failures. A message's push
  is claimed by stamping `messages.notified_at` first, so it can only fire once.
- All date/time logic goes through `lib/events.ts` (`America/New_York`); the
  server runs in UTC.
