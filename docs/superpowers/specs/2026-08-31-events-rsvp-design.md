# SECBL Phase 3 — Events & RSVP: Design Spec

**Date:** 2026-08-31
**Status:** Approved design, pre-implementation
**Parent spec:** `2026-08-31-secbl-design.md` (§8 Events & RSVP, §11 phase 3)
**Depends on:** Phases 1–2 (auth/approval gating, `profiles`, `is_approved()`, `is_admin()`)

## 1. Scope

Admins create one-off events. Approved members RSVP going / maybe / no. The calendar
is an upcoming-events list, soonest first, with past events viewable. Each event has
a detail page showing headcount and the attendee list grouped by response.

**Explicitly out of scope**, with the reason each was cut:

- **Recurring-event rules.** A weekly club night is created by duplicating last
  week's event, which prefills the form with the date bumped seven days. A real
  recurrence engine brings edit-one-vs-series, cancel-a-single-instance, and
  materialization-horizon problems that a club-sized calendar does not need. Each
  week staying an independent row is also what makes per-week attendance meaningful.
- **Capacity limits and waitlists.** RSVP is a headcount for planning, not a
  reservation. A hard cap has to be enforced in Postgres rather than the UI or two
  simultaneous clicks both take the last spot; a waitlist adds promotion ordering and
  notification. Retrofitting is one nullable column plus enforcement if a real
  tournament night ever needs it.
- **Member-created events.** Admin-only creation keeps the calendar authoritative:
  anything listed is a real club event. Matches parent spec §3.
- **Reminders and notifications.** No email or push infrastructure exists in the
  project yet; that is its own piece of work, not a rider on this one.
- **Per-event comments.** Phase 5 messaging covers discussion.
- **The tournament↔event link.** Phase 4 adds `tournaments.event_id`; it lands there.

## 2. Data model

Two new tables, both with RLS enabled, following the parent spec §5 sketch.

| Table | Key columns |
|---|---|
| `events` | id, title, description, location, starts_at (timestamptz), ends_at (timestamptz, nullable), status (`scheduled`\|`cancelled`), created_by → profiles, created_at |
| `rsvps` | (event_id, profile_id) PK, response (`going`\|`maybe`\|`no`), created_at, updated_at |

Two new enums, named to match the existing `member_status` / `match_status`
convention: `public.event_status` (`scheduled`, `cancelled`) and
`public.rsvp_response` (`going`, `maybe`, `no`).

`rsvps.event_id` references `events(id) on delete cascade` — deleting an event must
not leave orphaned RSVP rows. `rsvps.profile_id` also cascades: an RSVP is disposable
attendance intent, so a departing member's rows should just go. This differs
deliberately from `matches`, which references `profiles` with no cascade precisely
because match results and their rating history must survive a member leaving.

Two additions beyond the parent sketch, both deliberate:

**`events.status`** — cancelling an event must not make it silently vanish from the
calendar of everyone who already RSVP'd. A cancelled event stays listed with a
"Cancelled" badge and its RSVP controls disabled. Deleting the row would be simpler
and worse.

**`rsvps.updated_at`** — changing your answer is an upsert on the composite primary
key, and the timestamp makes "who changed their mind after the last reminder"
answerable without an audit table.

`ends_at` is nullable per the parent spec: a club night often has no stated end.

Indexes: `events (starts_at)` for the upcoming/past split, and `rsvps (event_id)` for
attendee lists and tallies.

## 3. Trust boundary and RLS

RSVPs do **not** need the service-role path that ratings do. Confirming a match
mutates another player's row, so it could never be trusted to the client; a member
writing an RSVP only ever touches their own row. So RSVP writes use the same shape as
match reporting — a server action with the user-scoped client, RLS as the real guard.
No `SECURITY DEFINER` function, no service-role key.

Policies:

- `events` select: approved members read all events, including cancelled and past.
- `events` insert / update / delete: `public.is_admin()` only.
- `rsvps` select: approved members read all RSVPs — attendee lists are public within
  the club.
- `rsvps` insert / update / delete: `public.is_approved() and profile_id = auth.uid()`.
  A member cannot RSVP on someone else's behalf, and cannot forge attendance.

## 4. Timezone handling

This is the one genuinely error-prone part, and Phase 2 never hit it: `matches.played_at`
is a bare `date`, so nothing in the app has formatted a time yet.

`starts_at` is `timestamptz`, and every event page is a server component rendering on
Vercel, where the server clock is UTC. Formatting with the default locale and zone
would show a 7:00pm club night as "23:00" to every member.

All event times are therefore formatted in an explicit club timezone —
`America/New_York` — through `Intl.DateTimeFormat`, in a single helper in
`lib/events.ts` rather than ad hoc at each call site. The club timezone is a named
constant in that module, so a future multi-region league changes one line.

The admin create/edit form takes local wall-clock date and time via
`<input type="datetime-local">` and converts to an instant on submit, interpreting the
entered value as club time.

## 5. Routes and UI

All under `app/(member)/`, so the existing layout guarantees an authenticated,
approved user.

| Route | Who | Purpose |
|---|---|---|
| `/events` | members | Upcoming soonest-first with when/where/going-count; past events in a collapsed section below |
| `/events/[id]` | members | Detail: description, RSVP controls reflecting your current answer, headcount, attendee lists grouped by response |
| `/events/new` | admin | Create; accepts prefill query params so Duplicate works |
| `/events/[id]/edit` | admin | Edit; also holds Cancel and Delete |

Navigation: `/events` becomes the fifth bottom-nav item. To make five fit on a narrow
phone, "Leaderboard" is shortened to "Ranks" — it is the long label and the only one
with slack.

The home page gains a "Next up" card showing the soonest upcoming event and your RSVP
state, so events are visible without hunting for them.

The three RSVP buttons act as a toggle: tapping your current answer again clears the
RSVP entirely, deleting the row. "No" and "no answer" are different states — the
first says you were asked and declined, the second that you have not replied — and
the delete policy in §3 exists to serve this.

**Duplicate** is a link from an event to `/events/new` carrying the source event's
fields as query params with `starts_at` advanced seven days. No server state, no
template table — the admin reviews the prefilled form and submits.

## 6. Pure logic (`lib/events.ts`)

The testable logic, written test-first:

- `formatEventWhen(startsAt, endsAt)` — club-timezone rendering, collapsing a
  same-day range to one date with a time range.
- `partitionEvents(events, now)` — upcoming (ascending) vs past (descending). An
  event is "past" once `ends_at` — or `starts_at` when there is no end — is behind
  `now`, so an in-progress club night still reads as upcoming.
- `tallyRsvps(rsvps)` — counts per response, and the current user's own answer.

These are pure functions over plain data, so they test without a database.

## 7. Error handling

Follows the established pattern: server actions redirect back with an
`?error=` query param that the page renders, rather than throwing.

- RSVP to a cancelled or past event → rejected in the action with a message; the UI
  also disables the controls, but the action is the guard.
- RSVP to a deleted event → the foreign key rejects it; the member sees "That event
  is no longer available."
- Non-admin reaching an admin route → redirect to `/events`, matching how `/admin`
  already behaves.
- Event with no RSVPs → the detail page shows "No RSVPs yet", not an empty table.

## 8. Testing

- **Unit (test-first):** the three `lib/events.ts` helpers, including the timezone
  cases that motivate the module — an event stored in UTC that must render as evening
  club time, and a daylight-saving boundary.
- **RLS integration:** a member cannot insert an event; a member cannot write another
  member's RSVP row; a pending user sees no events.
- **E2E (Playwright):** admin creates an event → it appears on `/events` → a member
  RSVPs going → headcount shows 1.

## 9. Migration

One migration, `supabase/migrations/0006_events.sql`, containing both tables, the two
enums, indexes, and all policies. Applied via the Supabase MCP `apply_migration` tool
with the local file kept as the source of truth, as in Phases 1–2.
