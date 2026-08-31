# SECBL — SEC Billiards League App: Design Spec

**Date:** 2026-08-31
**Status:** Approved design, pre-implementation
**Scale target:** ~100 members at launch; architecture must scale to thousands without rework.

## 1. Overview

A mobile-first web app (PWA) for the SEC billiards group. Members track matches and
stats, climb a Fargo-style rating ladder, view player and school leaderboards, RSVP
to events, follow live tournament brackets, and message each other. Distributed as a
URL — installable from the browser to a phone home screen; no app stores.

Branding assets arrive later: all colors, fonts, and the logo live in a single
theme-token layer so the branding pass is a token swap, not a redesign.

**Branding landed 2026-08-31** and was exactly the token swap this anticipated — no
component changed, because nothing hardcoded a color. Club palette, sampled from the
logo: felt green `#03600c` (`--primary`) and ball gold `#ffde59` (`--secondary`).
Gold is a fill, never text on a light surface — it is 1.33:1 on white, so it carries
dark text in light mode and sits as text on deep green in dark mode. The wordmark is
`public/secbl-logo.png` (auth screens only; its ball letterforms smear below ~40px, so
the member header uses text in `--primary`), the app icon is a racked triangle in
`app/icon.svg`, and the source artwork is kept at `docs/brand/secbl-logo-source.png`.

## 2. Stack

- **Frontend/backend:** Next.js (App Router, TypeScript) deployed on Vercel.
- **Data/auth/realtime:** Supabase — Postgres, email+password auth, Realtime
  (postgres_changes), Storage (avatars), Row Level Security.
- **UI:** Tailwind CSS + shadcn/ui, mobile-first. PWA manifest + minimal service
  worker for installability.
- **Testing:** Vitest for unit tests (rating engine, bracket engine, written
  test-first), RLS policy tests, light Playwright smoke tests per phase.

**Trust boundary:** clients read directly from Supabase under RLS. Sensitive writes —
match confirmation + rating application, bracket generation/advancement, member
approval — run only through server-side code (Next.js server actions calling
`SECURITY DEFINER` Postgres functions, or the service-role key). Ratings can never
be modified from the browser.

## 3. Users & roles

- **Member** (default after approval): report matches, confirm/reject opponents'
  reports, RSVP, join tournaments, chat, view everything.
- **Admin**: everything a member can do, plus approve signups, resolve disputed
  matches, manage schools, create events, create/run tournaments (tournament
  director), post in any channel.
- **Pending** (signed up, not yet approved): can log in, sees a "waiting for
  approval" screen only. Invisible to leaderboards and chat.

Signup: email + password, pick display name and school. Admin approves from a queue.

## 4. Data model

All tables in Postgres with RLS enabled. `profiles.id` references `auth.users.id`.

| Table | Key columns |
|---|---|
| `schools` | id, name, short_name, primary_color, secondary_color |
| `profiles` | id, display_name, school_id, avatar_url, role (`member`\|`admin`), status (`pending`\|`approved`\|`rejected`), rating (int, default 450), matches_played (int), created_at |
| `matches` | id, reporter_id, opponent_id, winner_id, reporter_score, opponent_score, game_type (`8ball`\|`9ball`\|`10ball`\|`other`), status (`pending`\|`confirmed`\|`rejected`\|`disputed`), tournament_match_id (nullable), played_at, confirmed_at, rating_delta_reporter, rating_delta_opponent |
| `rating_history` | id, profile_id, match_id, rating_before, rating_after, created_at |
| `events` | id, title, description, location, starts_at, ends_at (nullable), created_by |
| `rsvps` | (event_id, profile_id) PK, response (`going`\|`maybe`\|`no`) |
| `tournaments` | id, name, format (`single_elim`\|`double_elim`), status (`setup`\|`live`\|`complete`), event_id (nullable), created_by |
| `tournament_players` | (tournament_id, profile_id) PK, seed |
| `tournament_matches` | id, tournament_id, bracket (`winners`\|`losers`\|`grand_final`), round, position, player1_id, player2_id (nullable until fed), player1_score, player2_score, winner_id, winner_advances_to (self FK), loser_advances_to (self FK, double elim only) |
| `channels` | id, type (`everyone`\|`school`\|`dm`), name, school_id (nullable) |
| `channel_members` | (channel_id, profile_id) PK, last_read_at |
| `messages` | id, channel_id, sender_id, body (text), created_at |

**Derived views (never stored twice):**
- `leaderboard`: approved profiles with rating, wins, losses, win% from confirmed matches.
- `school_stats`: per-school member count, average rating, total wins/losses, and
  school-vs-school head-to-head records from confirmed matches.

## 5. Rating engine (Fargo-style Elo)

- Everyone starts at **450**.
- Expected win probability for player A: `E_A = 1 / (1 + 2^((R_B − R_A)/100))` —
  i.e., a 100-point gap means 2:1 favorite, matching Fargo's signature curve.
- Update on match confirmation: `R_A' = R_A + K × (S_A − E_A)` where S is 1 for a
  win, 0 for a loss. **K = 64** for a player's first 10 confirmed matches
  (provisional), **K = 32** after. Ratings clamp at a floor of 100.
- Rating is per **match** (win/loss), not per game — race scores are recorded for
  stats but don't weight the rating change.
- Implemented as a pure TypeScript function (unit-tested) whose result is applied by
  a `SECURITY DEFINER` Postgres function inside one transaction: update both
  ratings, write both `rating_history` rows, stamp deltas on the match. No
  half-applied states.
- Ratings apply in confirmation order; no retroactive recomputation (accepted v1
  limitation).

## 6. Match reporting flow

1. Either player reports: opponent, scores, game type, date. Match is `pending`.
2. Opponent sees a "Confirm result?" prompt on their home screen.
   - **Confirm** → status `confirmed`, ratings apply transactionally.
   - **Reject** → status `disputed`, lands in the admin dispute queue; admin edits +
     confirms, or rejects it permanently (`rejected`, no rating effect).
3. Pending/disputed/rejected matches never affect ratings or leaderboards.
4. Tournament matches bypass this flow entirely: the TD's entry is authoritative,
   status is `confirmed` on entry, ratings apply immediately.

## 7. Tournaments & brackets

- Admin creates a tournament (name, format, optional linked event). Members join
  from the app or the admin adds entrants; seeding defaults to rating order with
  manual override, during `setup`.
- **Generation** (on "start"): builds the complete match tree up front — standard
  seeding (1 plays lowest remaining seed), byes auto-assigned when the field isn't a
  power of two. Double elim also generates the losers bracket with standard
  round-mapping and a **single grand final** (no bracket reset — accepted v1
  simplification), wiring `winner_advances_to` / `loser_advances_to` on every match.
- **Advancement:** TD enters a result → winner (and loser, in double elim)
  automatically fill their next match slots, byes cascade. Runs server-side in one
  transaction.
- **Live view:** the bracket page subscribes to Supabase Realtime on that
  tournament's matches; every viewer sees results and advancement instantly.
  On reconnect after signal loss, the client refetches the full bracket.
- Bracket engine (generation + advancement) is pure TypeScript, test-first, with
  double-elim cases covered for fields of 3–32 including byes.

## 8. Events & RSVP

Admins create events (title, description, location, start/end). Members RSVP
going/maybe/no; the event page shows headcount and attendee list. A tournament may
link to an event. Calendar is a simple upcoming-events list (soonest first) with
past events viewable.

## 9. Messaging

- One machinery, three channel types:
  - `everyone` — all approved members, auto-membership on approval.
  - `school` — auto-created per school, auto-membership by profile school.
  - `dm` — private 2-person channel, created on first message between two members.
- Real-time delivery via Realtime subscription on `messages` per open channel;
  unread indicators via `channel_members.last_read_at`.
- RLS: members read/write messages only in channels they belong to. DMs are visible
  to exactly the two participants (admins have no read access to DMs).
- v1 is plain text + emoji. No attachments, threads, reactions, or edits.

## 10. Theming & branding

All design tokens (colors, fonts, radii, logo slot) in one place (CSS variables +
Tailwind theme). Neutral placeholder palette until branding arrives; school accent
colors come from `schools` rows. Branding pass = swap tokens + drop in logo.

## 11. Build phases

1. **Foundation** — scaffold, Supabase schema/RLS/auth, signup + school select,
   admin approval queue, profiles, theme skeleton. *App live, members can join.*
2. **Matches, ratings, leaderboards** — report/confirm flow, rating engine, player
   leaderboard, school stats. *Core loop works; ratings start accumulating.*
3. **Events + RSVP.**
4. **Tournaments + live brackets.**
5. **Messaging** — everyone/school channels + DMs.
6. **Polish** — PWA install experience, branding pass when assets arrive.

Each phase ships to production before the next begins.

## 12. Testing strategy

- **Unit (test-first):** rating engine; bracket generation/advancement (single +
  double elim, byes, 3–32 players); unread/message helpers.
- **RLS tests:** pending users see nothing; members can't read others' DMs; members
  can't write ratings; only admins mutate tournaments/events.
- **E2E smoke (Playwright):** one happy path per phase (signup→approve,
  report→confirm→leaderboard moves, RSVP, run a 4-player bracket, send a DM).

## 13. Error handling

- Disputed matches → admin queue (see §6).
- All rating/bracket mutations transactional via Postgres functions.
- Realtime disconnects → refetch on reconnect.
- Duplicate DM creation guarded by a unique constraint on the participant pair.
- Server actions return typed errors surfaced as toasts; no silent failures.

## 14. Non-goals (v1)

- Official FargoRate integration or import.
- Push notifications (PWA web-push is a natural later add).
- Match challenges / scheduling negotiation, league season engine.
- Chat attachments, threads, reactions.
- Multi-club tenancy (schema doesn't preclude it; not built now).
- Retroactive rating recomputation.
