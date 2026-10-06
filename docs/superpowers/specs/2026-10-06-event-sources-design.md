# Event sources (PIN / Engage sync) — Design

**Date:** 2026-10-06
**Status:** Approved, implementation in progress
**Parent spec:** `2026-08-31-secbl-design.md` §8

## Why

Clubs already post events on their school's involvement system. GSU's is PIN
(https://pin.gsu.edu), which runs Anthology Engage. Re-typing those events as
SECBL admin events is maintenance nobody will keep up. SECBL should mirror the
club's feed and keep RSVPs, tournaments and the home "Next up" card working on
top of it.

## What Engage exposes (verified 2026-10-06)

- Per-organization iCal: `https://pin.gsu.edu/organization/<key>/events.ics`
  (Panther Pool = `pantherpool`, org id 389804; feed valid, currently empty).
- Campus feed `https://pin.gsu.edu/events.ics` (~70 events) — same format,
  used only as a parser fixture, never as a source.
- Discovery API `https://pin.gsu.edu/api/discovery/event/search?organizationIds=…`
  — kept as a fallback idea; the ICS feed is enough.
- Feed shape: CRLF, folded lines, `UID:https://pin.gsu.edu/event/<id>`,
  `DTSTART`/`DTEND` as UTC (`…Z`), `SUMMARY`, `LOCATION`, `DESCRIPTION` with
  `\,` escapes, `URL`. No per-attendee data — RSVP stays in SECBL.

## Model (`0018_event_sources.sql`)

`event_sources` (name, school, feed_url, enabled, last_synced_at/status/error/
imported, created_by) — admin-managed under RLS. `events` gains `source_id`,
`external_uid`, `external_url`; unique per (source, uid). Deleting a source
leaves its events in place as ordinary events (`on delete set null`).

## Sync

- `lib/ics.ts` (pure, TDD): unfold, parse VEVENTs, unescape, UTC / TZID /
  floating / all-day datetimes (floating and all-day resolve on the club clock
  via `lib/events`).
- `lib/event-sync.ts` (pure, TDD): given feed events and the source's existing
  imported events → inserts, updates (title, description, location, times, url),
  cancels (dropped from the feed, still scheduled, not yet ended), restores
  (reappeared). Past events are never cancelled retroactively.
- `lib/sync-sources.ts`: fetches each enabled source with a timeout, applies the
  plan with the service role, records status on the source. Runs from
  `/api/sync-events` (daily Vercel cron, `CRON_SECRET` bearer) and from the
  admin's "Sync now" button (server action).

## UI

- Admin → Event sources: list (school chip, last sync + count, error), Sync now,
  Remove; add form (name, feed URL, school).
- Imported events: "From PIN" chip on the list and detail; "View on PIN" link;
  the edit form is replaced by a note (cancel still allowed). Manual events are
  unchanged.
