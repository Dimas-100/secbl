# SECBL — SEC Billiards League

A mobile-first PWA for the SEC billiards group: Fargo-style ratings, match
reporting with opponent confirmation, player and school leaderboards, events
with RSVP, live single-elimination brackets, and real-time chat (league room,
school rooms, DMs). Production: https://secbl.vercel.app

**Stack:** Next.js 16 (App Router, Server Actions) on Vercel · Supabase
(Postgres, Auth, Realtime, RLS) · Tailwind 4 + shadcn/ui · Vitest · Playwright.

## Run it

```bash
cp .env.example .env.local   # NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
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
| `app/(member)` | everything behind approval: home, log a game, events (+ cups), leaderboard, players, chat, settings, admin |
| `lib/rating.ts`, `lib/bracket.ts`, `lib/events.ts`, `lib/chat.ts`, `lib/report-form.ts`, `lib/levels.ts` | pure, test-first logic |
| `supabase/migrations` | schema, RLS, SECURITY DEFINER functions (the only write path for ratings, brackets, membership) |
| `docs/superpowers/specs` | design specs per phase; `plans/` the implementation plans |

## Invariants worth knowing

- Ratings are never written from the browser; every rating write goes through
  `apply_match_confirmation` / the tournament functions under one advisory lock,
  and current ratings always equal a replay of confirmed matches.
- Chat DMs are visible to exactly the two participants — admins included out.
- All date/time logic goes through `lib/events.ts` (`America/New_York`); the
  server runs in UTC.
