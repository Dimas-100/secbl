# SECBL Phase 3 (Events + RSVP) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admins create one-off club events; approved members RSVP going/maybe/no; the app shows an upcoming-events calendar, per-event headcount and attendee list, and the next event on the home page.

**Architecture:** Next.js App Router server components + server actions on Vercel, Supabase Postgres under RLS. Unlike match confirmation, RSVP writes need **no** service-role path — a member only ever writes their own row, so the server action uses the user-scoped client and an RLS policy (`profile_id = auth.uid()`) is the real guard. All event times are `timestamptz`, formatted through one club-timezone helper module because these pages render on a UTC server.

**Tech Stack:** Next.js 16 (App Router, TypeScript), Tailwind v4 + shadcn/ui, Supabase (`@supabase/supabase-js`, `@supabase/ssr`), Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-08-31-events-rsvp-design.md`

## Global Constraints

- TypeScript strict; App Router; server components by default; all mutations via server actions.
- Every UI color comes from the theme tokens in `app/globals.css`. Never hardcode brand colors.
- Mobile-first: content column `max-w-3xl`, fixed bottom nav.
- **Club timezone is `America/New_York`**, defined once as `CLUB_TIMEZONE` in `lib/events.ts`. No component may call `toLocaleString`/`Intl` on an event time directly — the server runs in UTC on Vercel and would render a 7pm club night as 23:00.
- RLS enabled on every new table. Admin-only for event writes; members write only their own RSVP row.
- Server actions report failure by redirecting with `?error=<encoded message>`, which the page renders. This matches Phases 1–2; do not throw to an error boundary.
- Windows dev machine: commands run in PowerShell or Git Bash; all are plain `npm`/`npx`/`git`.
- Commit at the end of every task (conventional commits: `feat:`, `test:`, `chore:`).
- Existing files this plan modifies were written in Phases 1–2 — read them before editing; merge, never duplicate, existing imports.

## File Structure

| File | Responsibility |
|---|---|
| `supabase/migrations/0006_events.sql` | `events` + `rsvps` tables, enums, indexes, RLS policies |
| `lib/types.ts` (modify) | `Event`, `Rsvp` row types + `EventStatus`, `RsvpResponse` unions |
| `lib/events.ts` | **All** club-timezone and pure event logic: formatting, upcoming/past partition, RSVP tally, `datetime-local` ↔ instant conversion |
| `tests/events.test.ts` | Unit tests for `lib/events.ts` (written first) |
| `app/(member)/events/page.tsx` | Calendar: upcoming + past list |
| `app/(member)/events/[id]/page.tsx` | Event detail, RSVP controls, attendee list |
| `app/(member)/events/actions.ts` | `setRsvp` — the member-facing mutation |
| `app/(member)/events/admin-actions.ts` | `createEvent`, `updateEvent`, `cancelEvent`, `deleteEvent` |
| `app/(member)/events/event-form.tsx` | Shared form markup for new + edit (keeps the two pages DRY) |
| `app/(member)/events/new/page.tsx` | Admin create, accepts prefill query params (Duplicate) |
| `app/(member)/events/[id]/edit/page.tsx` | Admin edit + cancel + delete |
| `app/(member)/layout.tsx` (modify) | Add Events to bottom nav; shorten Leaderboard → Ranks |
| `app/(member)/page.tsx` (modify) | "Next up" card |
| `tests/rls.integration.test.ts` (modify) | Events/RSVP policy regression tests |
| `e2e/events-flow.spec.ts` | Create → list → RSVP → headcount happy path |

Member actions and admin actions live in separate files on purpose: they have different trust levels, and a reviewer should be able to see every admin-gated mutation in one place.

---

### Task 1: Schema migration + row types

**Files:**
- Create: `supabase/migrations/0006_events.sql`
- Modify: `lib/types.ts` (append; keep existing exports untouched)

**Interfaces:**
- Consumes: `public.is_approved()`, `public.is_admin()`, `public.profiles` (Phase 1).
- Produces: tables `public.events`, `public.rsvps`; enums `public.event_status`, `public.rsvp_response`; TS types `Event`, `Rsvp`, `EventStatus`, `RsvpResponse` from `@/lib/types`.

- [ ] **Step 1: Create `supabase/migrations/0006_events.sql`**

```sql
create type public.event_status as enum ('scheduled','cancelled');
create type public.rsvp_response as enum ('going','maybe','no');

create table public.events (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(trim(title)) > 0),
  description text,
  location text,
  starts_at timestamptz not null,
  ends_at timestamptz,
  status public.event_status not null default 'scheduled',
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  check (ends_at is null or ends_at > starts_at)
);

create index events_starts_at_idx on public.events (starts_at);

-- RSVPs cascade on both FKs: attendance intent is disposable. This differs
-- deliberately from matches, which never cascade from profiles because results
-- and rating history must survive a member leaving.
create table public.rsvps (
  event_id uuid not null references public.events(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  response public.rsvp_response not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (event_id, profile_id)
);

create index rsvps_event_idx on public.rsvps (event_id);

alter table public.events enable row level security;
alter table public.rsvps enable row level security;

create policy "approved read events"
  on public.events for select to authenticated
  using (public.is_approved());

create policy "admins insert events"
  on public.events for insert to authenticated
  with check (public.is_admin() and created_by = auth.uid());

create policy "admins update events"
  on public.events for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy "admins delete events"
  on public.events for delete to authenticated
  using (public.is_admin());

create policy "approved read rsvps"
  on public.rsvps for select to authenticated
  using (public.is_approved());

-- Members write only their own row, and only for a scheduled event. Blocking
-- RSVPs to *past* events stays in the server action, not here: that is a
-- product timing decision, not a security boundary.
create policy "members insert own rsvp"
  on public.rsvps for insert to authenticated
  with check (
    public.is_approved()
    and profile_id = auth.uid()
    and exists (
      select 1 from public.events e
      where e.id = event_id and e.status = 'scheduled'
    )
  );

create policy "members update own rsvp"
  on public.rsvps for update to authenticated
  using (public.is_approved() and profile_id = auth.uid())
  with check (
    public.is_approved()
    and profile_id = auth.uid()
    and exists (
      select 1 from public.events e
      where e.id = event_id and e.status = 'scheduled'
    )
  );

create policy "members delete own rsvp"
  on public.rsvps for delete to authenticated
  using (public.is_approved() and profile_id = auth.uid());
```

- [ ] **Step 2: Apply the migration**

Load the tool: `ToolSearch` with query `"select:mcp__claude_ai_Supabase__apply_migration,mcp__claude_ai_Supabase__execute_sql"`.

Apply with `mcp__claude_ai_Supabase__apply_migration`, project_id `azetukujqrqyxfzohfmd`, name `events`, and the SQL above. Keep the local file as the source of truth.

- [ ] **Step 3: Verify the schema landed**

Use `mcp__claude_ai_Supabase__execute_sql` on project `azetukujqrqyxfzohfmd`:

```sql
select table_name, count(*) as columns
from information_schema.columns
where table_schema = 'public' and table_name in ('events','rsvps')
group by table_name order by table_name;

select tablename, policyname from pg_policies
where schemaname = 'public' and tablename in ('events','rsvps')
order by tablename, policyname;
```

Expected: `events` (9 columns), `rsvps` (5 columns); 4 policies on `events` and 4 on `rsvps`.

- [ ] **Step 4: Append row types to `lib/types.ts`**

Add at the end of the file (leave the existing `MemberRole` … `Match` declarations exactly as they are):

```ts
export type EventStatus = "scheduled" | "cancelled";
export type RsvpResponse = "going" | "maybe" | "no";

export interface Event {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  starts_at: string;
  ends_at: string | null;
  status: EventStatus;
  created_by: string;
  created_at: string;
}

export interface Rsvp {
  event_id: string;
  profile_id: string;
  response: RsvpResponse;
  created_at: string;
  updated_at: string;
}
```

- [ ] **Step 5: Verify the build**

Run: `npm run build`
Expected: success (nothing imports the new types yet; this only proves they compile).

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0006_events.sql lib/types.ts
git commit -m "feat: events and rsvps schema with RLS"
```

---

### Task 2: Club-timezone and pure event logic (TDD)

**Files:**
- Create: `tests/events.test.ts`, `lib/events.ts`

**Interfaces:**
- Consumes: `RsvpResponse` (Task 1).
- Produces, all from `@/lib/events`: `CLUB_TIMEZONE` (`"America/New_York"`); `formatEventWhen(startsAt: string, endsAt: string | null): string`; `partitionEvents<T extends EventLike>(events: T[], now: Date): { upcoming: T[]; past: T[] }`; `tallyRsvps(rsvps: RsvpLike[], viewerId: string): RsvpTally`; `clubTimeToISO(local: string): string`; `isoToClubTime(iso: string): string`. Interfaces `EventLike { starts_at: string; ends_at: string | null }`, `RsvpLike { profile_id: string; response: RsvpResponse }`, `RsvpTally { going: number; maybe: number; no: number; mine: RsvpResponse | null }`.

**Why this module exists:** these pages are server components rendering on Vercel, where the clock is UTC. Phase 2 never hit this because `matches.played_at` is a bare `date`. Every event time goes through here.

- [ ] **Step 1: Write the failing tests — `tests/events.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import {
  CLUB_TIMEZONE,
  clubTimeToISO,
  formatEventWhen,
  isoToClubTime,
  partitionEvents,
  tallyRsvps,
} from "@/lib/events";

describe("CLUB_TIMEZONE", () => {
  it("is the club's zone, not the server's", () => {
    expect(CLUB_TIMEZONE).toBe("America/New_York");
  });
});

describe("formatEventWhen", () => {
  it("renders a UTC instant as club-local evening time", () => {
    // 2026-09-05T23:00Z is 7:00 PM EDT on Saturday Sep 5.
    expect(formatEventWhen("2026-09-05T23:00:00Z", null)).toBe("Sat, Sep 5 · 7:00 PM");
  });

  it("honors standard time in winter", () => {
    // 2026-01-15T00:00Z is 7:00 PM EST on Wednesday Jan 14.
    expect(formatEventWhen("2026-01-15T00:00:00Z", null)).toBe("Wed, Jan 14 · 7:00 PM");
  });

  it("collapses a same-day range to one date with a time range", () => {
    expect(formatEventWhen("2026-09-05T23:00:00Z", "2026-09-06T02:00:00Z")).toBe(
      "Sat, Sep 5 · 7:00 PM – 10:00 PM"
    );
  });

  it("spells out both sides when the range crosses club midnight", () => {
    expect(formatEventWhen("2026-09-05T23:00:00Z", "2026-09-06T05:00:00Z")).toBe(
      "Sat, Sep 5, 7:00 PM – Sun, Sep 6, 1:00 AM"
    );
  });
});

describe("clubTimeToISO / isoToClubTime", () => {
  it("reads a datetime-local value as club wall-clock time (daylight time)", () => {
    // Mar 8 2026 is after the spring-forward, so club time is UTC-4.
    expect(clubTimeToISO("2026-03-08T19:00")).toBe("2026-03-08T23:00:00.000Z");
  });

  it("reads a datetime-local value as club wall-clock time (standard time)", () => {
    // Nov 1 2026 is after the fall-back, so club time is UTC-5.
    expect(clubTimeToISO("2026-11-01T19:00")).toBe("2026-11-02T00:00:00.000Z");
  });

  it("round-trips back to the same wall-clock string", () => {
    expect(isoToClubTime(clubTimeToISO("2026-09-05T19:00"))).toBe("2026-09-05T19:00");
    expect(isoToClubTime(clubTimeToISO("2026-01-14T19:00"))).toBe("2026-01-14T19:00");
  });

  it("formats an instant back into a datetime-local value", () => {
    expect(isoToClubTime("2026-09-05T23:00:00Z")).toBe("2026-09-05T19:00");
  });
});

describe("partitionEvents", () => {
  const now = new Date("2026-09-05T12:00:00Z");
  const events = [
    { id: "later", starts_at: "2026-09-20T23:00:00Z", ends_at: null },
    { id: "over", starts_at: "2026-08-01T23:00:00Z", ends_at: null },
    { id: "soon", starts_at: "2026-09-06T23:00:00Z", ends_at: null },
    { id: "older", starts_at: "2026-07-01T23:00:00Z", ends_at: null },
  ];

  it("sorts upcoming soonest-first and past most-recent-first", () => {
    const { upcoming, past } = partitionEvents(events, now);
    expect(upcoming.map((e) => e.id)).toEqual(["soon", "later"]);
    expect(past.map((e) => e.id)).toEqual(["over", "older"]);
  });

  it("keeps an in-progress event in upcoming until its end time", () => {
    const inProgress = [
      { id: "running", starts_at: "2026-09-05T10:00:00Z", ends_at: "2026-09-05T14:00:00Z" },
    ];
    expect(partitionEvents(inProgress, now).upcoming.map((e) => e.id)).toEqual(["running"]);
  });

  it("treats a start-only event as past once its start has passed", () => {
    const started = [{ id: "started", starts_at: "2026-09-05T10:00:00Z", ends_at: null }];
    expect(partitionEvents(started, now).past.map((e) => e.id)).toEqual(["started"]);
  });
});

describe("tallyRsvps", () => {
  const rsvps = [
    { profile_id: "a", response: "going" as const },
    { profile_id: "b", response: "going" as const },
    { profile_id: "c", response: "maybe" as const },
    { profile_id: "d", response: "no" as const },
  ];

  it("counts each response", () => {
    const tally = tallyRsvps(rsvps, "zzz");
    expect(tally.going).toBe(2);
    expect(tally.maybe).toBe(1);
    expect(tally.no).toBe(1);
  });

  it("reports the viewer's own answer", () => {
    expect(tallyRsvps(rsvps, "c").mine).toBe("maybe");
  });

  it("reports null when the viewer has not answered", () => {
    expect(tallyRsvps(rsvps, "zzz").mine).toBeNull();
  });

  it("handles an event with no RSVPs", () => {
    expect(tallyRsvps([], "a")).toEqual({ going: 0, maybe: 0, no: 0, mine: null });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/events.test.ts`
Expected: FAIL — cannot resolve `@/lib/events`.

- [ ] **Step 3: Implement `lib/events.ts`**

```ts
import type { RsvpResponse } from "@/lib/types";

// These pages render on a UTC server, so every event time is formatted in the
// club's zone explicitly. One constant, one module — no ad hoc Intl calls.
export const CLUB_TIMEZONE = "America/New_York";

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: CLUB_TIMEZONE,
  weekday: "short",
  month: "short",
  day: "numeric",
});

const timeFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: CLUB_TIMEZONE,
  hour: "numeric",
  minute: "2-digit",
});

// Recent ICU builds separate the meridiem with U+202F (narrow no-break space).
// Normalize so output is stable across Node versions and easy to assert on.
function normalize(text: string): string {
  return text.replace(/[  ]/g, " ");
}

function clubDate(iso: string): string {
  return normalize(dateFormatter.format(new Date(iso)));
}

function clubTime(iso: string): string {
  return normalize(timeFormatter.format(new Date(iso)));
}

export function formatEventWhen(startsAt: string, endsAt: string | null): string {
  const startDate = clubDate(startsAt);
  const startTime = clubTime(startsAt);
  if (!endsAt) return `${startDate} · ${startTime}`;

  const endDate = clubDate(endsAt);
  const endTime = clubTime(endsAt);
  if (endDate === startDate) return `${startDate} · ${startTime} – ${endTime}`;
  return `${startDate}, ${startTime} – ${endDate}, ${endTime}`;
}

// Offset of the club zone at a given instant, in milliseconds.
function clubOffsetMs(instant: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: CLUB_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(instant);
  const part = (type: string) => Number(parts.find((p) => p.type === type)!.value);
  // hour12:false yields "24" for midnight in some ICU versions.
  const asIfUtc = Date.UTC(
    part("year"),
    part("month") - 1,
    part("day"),
    part("hour") % 24,
    part("minute"),
    part("second")
  );
  return asIfUtc - instant.getTime();
}

// "2026-09-05T19:00" (club wall clock, from <input type="datetime-local">)
// -> the ISO instant it denotes.
export function clubTimeToISO(local: string): string {
  const asIfUtc = new Date(`${local}:00Z`);
  const firstGuess = new Date(asIfUtc.getTime() - clubOffsetMs(asIfUtc));
  // Re-apply using the offset actually in force at the guessed instant, which
  // matters within an hour of a DST transition.
  const corrected = new Date(asIfUtc.getTime() - clubOffsetMs(firstGuess));
  return corrected.toISOString();
}

// The inverse: an instant -> the "YYYY-MM-DDTHH:mm" a datetime-local input wants.
export function isoToClubTime(iso: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: CLUB_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(iso));
  const part = (type: string) => parts.find((p) => p.type === type)!.value;
  const hour = String(Number(part("hour")) % 24).padStart(2, "0");
  return `${part("year")}-${part("month")}-${part("day")}T${hour}:${part("minute")}`;
}

export interface EventLike {
  starts_at: string;
  ends_at: string | null;
}

// An event stays "upcoming" until it ends, so an in-progress club night does
// not drop into the past list halfway through.
export function partitionEvents<T extends EventLike>(
  events: T[],
  now: Date
): { upcoming: T[]; past: T[] } {
  const upcoming: T[] = [];
  const past: T[] = [];
  for (const event of events) {
    const endsAt = new Date(event.ends_at ?? event.starts_at);
    if (endsAt.getTime() >= now.getTime()) upcoming.push(event);
    else past.push(event);
  }
  const startTime = (e: T) => new Date(e.starts_at).getTime();
  upcoming.sort((a, b) => startTime(a) - startTime(b));
  past.sort((a, b) => startTime(b) - startTime(a));
  return { upcoming, past };
}

export interface RsvpLike {
  profile_id: string;
  response: RsvpResponse;
}

export interface RsvpTally {
  going: number;
  maybe: number;
  no: number;
  mine: RsvpResponse | null;
}

export function tallyRsvps(rsvps: RsvpLike[], viewerId: string): RsvpTally {
  const tally: RsvpTally = { going: 0, maybe: 0, no: 0, mine: null };
  for (const rsvp of rsvps) {
    tally[rsvp.response] += 1;
    if (rsvp.profile_id === viewerId) tally.mine = rsvp.response;
  }
  return tally;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/events.test.ts`
Expected: all PASS.

If `formatEventWhen` assertions fail on whitespace, the ICU narrow-space normalization is the cause — confirm `normalize` is applied to both formatters' output, not just one.

- [ ] **Step 5: Commit**

```bash
git add tests/events.test.ts lib/events.ts
git commit -m "feat: club-timezone event formatting and rsvp helpers"
```

---

### Task 3: Events calendar page + navigation

**Files:**
- Create: `app/(member)/events/page.tsx`
- Modify: `app/(member)/layout.tsx` (bottom nav only)

**Interfaces:**
- Consumes: `createClient` (`@/lib/supabase/server`), `formatEventWhen`, `partitionEvents` (Task 2), `events`/`rsvps` tables (Task 1).
- Produces: the `/events` route. Later tasks link to it; Task 8's E2E asserts on the heading `Events` and on event titles rendered here.

- [ ] **Step 1: Create `app/(member)/events/page.tsx`**

```tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { formatEventWhen, partitionEvents } from "@/lib/events";

interface EventRow {
  id: string;
  title: string;
  location: string | null;
  starts_at: string;
  ends_at: string | null;
  status: "scheduled" | "cancelled";
  rsvps: { response: string }[];
}

function goingCount(event: EventRow): number {
  return event.rsvps.filter((r) => r.response === "going").length;
}

function EventRowLink({ event }: { event: EventRow }) {
  return (
    <Link
      href={`/events/${event.id}`}
      className="hover:bg-muted flex flex-col gap-1 rounded-md p-3 -mx-3"
    >
      <div className="flex items-center gap-2">
        <span className="font-medium">{event.title}</span>
        {event.status === "cancelled" && <Badge variant="destructive">Cancelled</Badge>}
      </div>
      <span className="text-muted-foreground text-sm">
        {formatEventWhen(event.starts_at, event.ends_at)}
        {event.location && ` · ${event.location}`}
      </span>
      <span className="text-muted-foreground text-xs">{goingCount(event)} going</span>
    </Link>
  );
}

export default async function EventsPage({
  searchParams,
}: {
  searchParams: Promise<{ message?: string; error?: string }>;
}) {
  const { message, error } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: me } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const { data: events } = await supabase
    .from("events")
    .select("id, title, location, starts_at, ends_at, status, rsvps(response)")
    .order("starts_at");

  const { upcoming, past } = partitionEvents((events ?? []) as EventRow[], new Date());

  return (
    <main className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Events</h1>
        {me?.role === "admin" && (
          <Button asChild size="sm">
            <Link href="/events/new">New event</Link>
          </Button>
        )}
      </div>

      {message && <p className="rounded-md bg-muted p-3 text-sm">{message}</p>}
      {error && (
        <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</p>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Upcoming</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-1">
          {upcoming.length === 0 && (
            <p className="text-muted-foreground text-sm">Nothing on the calendar yet.</p>
          )}
          {upcoming.map((event) => (
            <EventRowLink key={event.id} event={event} />
          ))}
        </CardContent>
      </Card>

      {past.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Past</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-1">
            {past.map((event) => (
              <EventRowLink key={event.id} event={event} />
            ))}
          </CardContent>
        </Card>
      )}
    </main>
  );
}
```

- [ ] **Step 2: Add Events to the bottom nav in `app/(member)/layout.tsx`**

Replace the existing `<div className="mx-auto flex max-w-3xl justify-around py-3 text-sm">` block's contents with:

```tsx
          <Link href="/">Home</Link>
          <Link href="/events">Events</Link>
          <Link href="/leaderboard">Ranks</Link>
          <Link href="/schools">Schools</Link>
          <Link href="/matches/new">Report</Link>
```

`Leaderboard` becomes `Ranks` so five items fit a narrow phone. The route is unchanged — only the label.

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: success, with `/events` in the route list.

- [ ] **Step 4: Manual verify**

Run `npm run dev`, log in as the admin, open `/events`. Expected: "Events" heading, a "New event" button (admin only), "Nothing on the calendar yet.", and a five-item bottom nav that does not wrap.

- [ ] **Step 5: Commit**

```bash
git add "app/(member)/events/page.tsx" "app/(member)/layout.tsx"
git commit -m "feat: events calendar page and nav entry"
```

---

### Task 4: Event detail page + RSVP action

**Files:**
- Create: `app/(member)/events/actions.ts`, `app/(member)/events/[id]/page.tsx`

**Interfaces:**
- Consumes: `createClient`, `tallyRsvps`, `formatEventWhen` (Task 2), tables from Task 1.
- Produces: `setRsvp(formData)` server action (fields: `event_id`, `response` — one of `going`/`maybe`/`no`); the `/events/[id]` route. Task 8's E2E clicks the button labeled `Going` and asserts on the text `1 going`.

- [ ] **Step 1: Create `app/(member)/events/actions.ts`**

```ts
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { RsvpResponse } from "@/lib/types";

const RESPONSES: RsvpResponse[] = ["going", "maybe", "no"];

// Tapping your current answer again clears the RSVP: "no" and "no answer" are
// different states, and members need a way back to the second one.
export async function setRsvp(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const eventId = String(formData.get("event_id") ?? "");
  const response = String(formData.get("response") ?? "") as RsvpResponse;
  if (!eventId || !RESPONSES.includes(response)) {
    redirect(`/events?error=${encodeURIComponent("That RSVP was not understood.")}`);
  }

  const { data: event } = await supabase
    .from("events")
    .select("id, status, starts_at, ends_at")
    .eq("id", eventId)
    .single();
  if (!event) {
    redirect(`/events?error=${encodeURIComponent("That event is no longer available.")}`);
  }
  if (event.status === "cancelled") {
    redirect(`/events/${eventId}?error=${encodeURIComponent("That event was cancelled.")}`);
  }
  const endsAt = new Date(event.ends_at ?? event.starts_at);
  if (endsAt.getTime() < Date.now()) {
    redirect(`/events/${eventId}?error=${encodeURIComponent("That event has already happened.")}`);
  }

  const { data: existing } = await supabase
    .from("rsvps")
    .select("response")
    .eq("event_id", eventId)
    .eq("profile_id", user.id)
    .maybeSingle();

  if (existing?.response === response) {
    const { error } = await supabase
      .from("rsvps")
      .delete()
      .eq("event_id", eventId)
      .eq("profile_id", user.id);
    if (error) redirect(`/events/${eventId}?error=${encodeURIComponent(error.message)}`);
  } else {
    const { error } = await supabase.from("rsvps").upsert(
      {
        event_id: eventId,
        profile_id: user.id,
        response,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "event_id,profile_id" }
    );
    if (error) redirect(`/events/${eventId}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(`/events/${eventId}`);
  revalidatePath("/events");
  revalidatePath("/");
  redirect(`/events/${eventId}`);
}
```

- [ ] **Step 2: Create `app/(member)/events/[id]/page.tsx`**

```tsx
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { formatEventWhen, tallyRsvps } from "@/lib/events";
import type { RsvpResponse } from "@/lib/types";
import { setRsvp } from "@/app/(member)/events/actions";

const RESPONSE_LABELS: { value: RsvpResponse; label: string }[] = [
  { value: "going", label: "Going" },
  { value: "maybe", label: "Maybe" },
  { value: "no", label: "Can't make it" },
];

interface AttendeeRow {
  profile_id: string;
  response: RsvpResponse;
  profile: { display_name: string } | { display_name: string }[] | null;
}

function displayName(row: AttendeeRow): string {
  const profile = Array.isArray(row.profile) ? row.profile[0] : row.profile;
  return profile?.display_name ?? "Unknown";
}

export default async function EventPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: event } = await supabase
    .from("events")
    .select("id, title, description, location, starts_at, ends_at, status")
    .eq("id", id)
    .single();
  if (!event) notFound();

  const { data: me } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const { data: rsvps } = await supabase
    .from("rsvps")
    .select("profile_id, response, profile:profiles(display_name)")
    .eq("event_id", id);

  const attendees = (rsvps ?? []) as AttendeeRow[];
  const tally = tallyRsvps(attendees, user.id);
  const isOver = new Date(event.ends_at ?? event.starts_at).getTime() < Date.now();
  const locked = event.status === "cancelled" || isOver;

  return (
    <main className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-bold">{event.title}</h1>
          {event.status === "cancelled" && <Badge variant="destructive">Cancelled</Badge>}
        </div>
        <p className="text-muted-foreground text-sm">
          {formatEventWhen(event.starts_at, event.ends_at)}
          {event.location && ` · ${event.location}`}
        </p>
        {me?.role === "admin" && (
          <div className="flex gap-3 text-sm">
            <Link href={`/events/${event.id}/edit`} className="underline">
              Edit
            </Link>
            <Link
              href={`/events/new?from=${event.id}`}
              className="text-muted-foreground underline"
            >
              Duplicate
            </Link>
          </div>
        )}
      </div>

      {error && (
        <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</p>
      )}

      {event.description && <p className="text-sm whitespace-pre-line">{event.description}</p>}

      <Card>
        <CardHeader>
          <CardTitle>Your RSVP</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {locked ? (
            <p className="text-muted-foreground text-sm">
              {event.status === "cancelled"
                ? "This event was cancelled."
                : "This event has already happened."}
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {RESPONSE_LABELS.map((option) => (
                <form action={setRsvp} key={option.value}>
                  <input type="hidden" name="event_id" value={event.id} />
                  <input type="hidden" name="response" value={option.value} />
                  <Button
                    size="sm"
                    type="submit"
                    variant={tally.mine === option.value ? "default" : "outline"}
                  >
                    {option.label}
                  </Button>
                </form>
              ))}
            </div>
          )}
          <p className="text-muted-foreground text-xs">
            {tally.mine
              ? "Tap your answer again to clear it."
              : "You have not replied yet."}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            {tally.going} going · {tally.maybe} maybe · {tally.no} out
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm">
          {attendees.length === 0 && <p className="text-muted-foreground">No RSVPs yet.</p>}
          {RESPONSE_LABELS.map((option) => {
            const group = attendees.filter((a) => a.response === option.value);
            if (group.length === 0) return null;
            return (
              <div key={option.value} className="flex flex-col gap-1">
                <span className="text-muted-foreground text-xs uppercase">{option.label}</span>
                <p>{group.map(displayName).join(", ")}</p>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </main>
  );
}
```

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: success, with `/events/[id]` in the route list.

- [ ] **Step 4: Manual verify (deferred)**

There are no events yet — Task 5 creates the first one. After Task 5, return here and confirm: RSVP Going highlights the button and the headcount reads `1 going`; tapping Going again clears it back to "You have not replied yet."

- [ ] **Step 5: Commit**

```bash
git add "app/(member)/events/actions.ts" "app/(member)/events/[id]/page.tsx"
git commit -m "feat: event detail page with rsvp controls"
```

---

### Task 5: Admin event create, edit, duplicate, cancel, delete

**Files:**
- Create: `app/(member)/events/admin-actions.ts`, `app/(member)/events/event-form.tsx`, `app/(member)/events/new/page.tsx`, `app/(member)/events/[id]/edit/page.tsx`

**Interfaces:**
- Consumes: `createClient`, `clubTimeToISO`, `isoToClubTime` (Task 2), tables from Task 1.
- Produces: `createEvent(formData)`, `updateEvent(formData)`, `cancelEvent(formData)`, `deleteEvent(formData)` server actions; `EventForm` component; `/events/new` and `/events/[id]/edit` routes. Form fields throughout: `title`, `description`, `location`, `starts_at_local`, `ends_at_local`, plus `event_id` on edit.

- [ ] **Step 1: Add the shadcn textarea component**

```powershell
npx shadcn@latest add textarea -y
```

Expected: creates `components/ui/textarea.tsx`.

- [ ] **Step 2: Create `app/(member)/events/admin-actions.ts`**

```ts
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { clubTimeToISO } from "@/lib/events";

// Every export here is admin-only. RLS is the real guard; this check gives the
// admin a redirect instead of an opaque policy failure.
async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: me } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (me?.role !== "admin") redirect("/events");
  return { supabase, user };
}

interface ParsedEvent {
  title: string;
  description: string | null;
  location: string | null;
  starts_at: string;
  ends_at: string | null;
}

function parseEventForm(formData: FormData): ParsedEvent | { error: string } {
  const title = String(formData.get("title") ?? "").trim();
  const startsLocal = String(formData.get("starts_at_local") ?? "");
  const endsLocal = String(formData.get("ends_at_local") ?? "");
  if (!title) return { error: "Give the event a title." };
  if (!startsLocal) return { error: "Give the event a start time." };

  const starts_at = clubTimeToISO(startsLocal);
  const ends_at = endsLocal ? clubTimeToISO(endsLocal) : null;
  if (ends_at && new Date(ends_at).getTime() <= new Date(starts_at).getTime()) {
    return { error: "The end time must be after the start time." };
  }

  const description = String(formData.get("description") ?? "").trim();
  const location = String(formData.get("location") ?? "").trim();
  return {
    title,
    description: description || null,
    location: location || null,
    starts_at,
    ends_at,
  };
}

export async function createEvent(formData: FormData) {
  const { supabase, user } = await requireAdmin();
  const parsed = parseEventForm(formData);
  if ("error" in parsed) {
    redirect(`/events/new?error=${encodeURIComponent(parsed.error)}`);
  }
  const { data, error } = await supabase
    .from("events")
    .insert({ ...parsed, created_by: user.id })
    .select("id")
    .single();
  if (error || !data) {
    redirect(`/events/new?error=${encodeURIComponent(error?.message ?? "Could not create event")}`);
  }
  revalidatePath("/events");
  revalidatePath("/");
  redirect(`/events/${data.id}`);
}

export async function updateEvent(formData: FormData) {
  const { supabase } = await requireAdmin();
  const eventId = String(formData.get("event_id") ?? "");
  const parsed = parseEventForm(formData);
  if ("error" in parsed) {
    redirect(`/events/${eventId}/edit?error=${encodeURIComponent(parsed.error)}`);
  }
  const { error } = await supabase.from("events").update(parsed).eq("id", eventId);
  if (error) {
    redirect(`/events/${eventId}/edit?error=${encodeURIComponent(error.message)}`);
  }
  revalidatePath(`/events/${eventId}`);
  revalidatePath("/events");
  revalidatePath("/");
  redirect(`/events/${eventId}`);
}

export async function cancelEvent(formData: FormData) {
  const { supabase } = await requireAdmin();
  const eventId = String(formData.get("event_id") ?? "");
  const { error } = await supabase
    .from("events")
    .update({ status: "cancelled" })
    .eq("id", eventId);
  if (error) {
    redirect(`/events/${eventId}/edit?error=${encodeURIComponent(error.message)}`);
  }
  revalidatePath(`/events/${eventId}`);
  revalidatePath("/events");
  revalidatePath("/");
  redirect(`/events/${eventId}`);
}

export async function deleteEvent(formData: FormData) {
  const { supabase } = await requireAdmin();
  const eventId = String(formData.get("event_id") ?? "");
  const { error } = await supabase.from("events").delete().eq("id", eventId);
  if (error) {
    redirect(`/events/${eventId}/edit?error=${encodeURIComponent(error.message)}`);
  }
  revalidatePath("/events");
  revalidatePath("/");
  redirect(`/events?message=${encodeURIComponent("Event deleted.")}`);
}
```

- [ ] **Step 3: Create `app/(member)/events/event-form.tsx`**

```tsx
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export interface EventFormDefaults {
  title: string;
  description: string;
  location: string;
  startsAtLocal: string;
  endsAtLocal: string;
}

// Times are club wall-clock (see lib/events.ts); the action converts on submit.
export function EventForm({
  action,
  defaults,
  submitLabel,
  eventId,
}: {
  action: (formData: FormData) => void | Promise<void>;
  defaults: EventFormDefaults;
  submitLabel: string;
  eventId?: string;
}) {
  return (
    <form action={action} className="flex flex-col gap-4">
      {eventId && <input type="hidden" name="event_id" value={eventId} />}
      <div className="flex flex-col gap-2">
        <Label htmlFor="title">Title</Label>
        <Input id="title" name="title" required maxLength={80} defaultValue={defaults.title} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="location">Location</Label>
        <Input
          id="location"
          name="location"
          maxLength={120}
          defaultValue={defaults.location}
          placeholder="Where is it?"
        />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="starts_at_local">Starts</Label>
          <Input
            id="starts_at_local"
            name="starts_at_local"
            type="datetime-local"
            required
            defaultValue={defaults.startsAtLocal}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="ends_at_local">Ends (optional)</Label>
          <Input
            id="ends_at_local"
            name="ends_at_local"
            type="datetime-local"
            defaultValue={defaults.endsAtLocal}
          />
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="description">Details</Label>
        <Textarea id="description" name="description" rows={4} defaultValue={defaults.description} />
      </div>
      <Button type="submit">{submitLabel}</Button>
      <p className="text-muted-foreground text-xs">All times are club time (Eastern).</p>
    </form>
  );
}
```

- [ ] **Step 4: Create `app/(member)/events/new/page.tsx`**

```tsx
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isoToClubTime } from "@/lib/events";
import { createEvent } from "@/app/(member)/events/admin-actions";
import { EventForm, type EventFormDefaults } from "@/app/(member)/events/event-form";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

const EMPTY: EventFormDefaults = {
  title: "",
  description: "",
  location: "",
  startsAtLocal: "",
  endsAtLocal: "",
};

export default async function NewEventPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; from?: string }>;
}) {
  const { error, from } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: me } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (me?.role !== "admin") redirect("/events");

  // Duplicate: prefill from an existing event with the date bumped one week.
  let defaults = EMPTY;
  if (from) {
    const { data: source } = await supabase
      .from("events")
      .select("title, description, location, starts_at, ends_at")
      .eq("id", from)
      .single();
    if (source) {
      const bump = (iso: string) => isoToClubTime(new Date(new Date(iso).getTime() + WEEK_MS).toISOString());
      defaults = {
        title: source.title,
        description: source.description ?? "",
        location: source.location ?? "",
        startsAtLocal: bump(source.starts_at),
        endsAtLocal: source.ends_at ? bump(source.ends_at) : "",
      };
    }
  }

  return (
    <main className="flex flex-col gap-6">
      <h1 className="text-xl font-bold">{from ? "Duplicate event" : "New event"}</h1>
      {error && (
        <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</p>
      )}
      <EventForm action={createEvent} defaults={defaults} submitLabel="Create event" />
    </main>
  );
}
```

- [ ] **Step 5: Create `app/(member)/events/[id]/edit/page.tsx`**

```tsx
import { notFound, redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import { isoToClubTime } from "@/lib/events";
import {
  cancelEvent,
  deleteEvent,
  updateEvent,
} from "@/app/(member)/events/admin-actions";
import { EventForm } from "@/app/(member)/events/event-form";

export default async function EditEventPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: me } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (me?.role !== "admin") redirect("/events");

  const { data: event } = await supabase
    .from("events")
    .select("id, title, description, location, starts_at, ends_at, status")
    .eq("id", id)
    .single();
  if (!event) notFound();

  return (
    <main className="flex flex-col gap-6">
      <h1 className="text-xl font-bold">Edit event</h1>
      {error && (
        <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</p>
      )}
      <EventForm
        action={updateEvent}
        eventId={event.id}
        submitLabel="Save changes"
        defaults={{
          title: event.title,
          description: event.description ?? "",
          location: event.location ?? "",
          startsAtLocal: isoToClubTime(event.starts_at),
          endsAtLocal: event.ends_at ? isoToClubTime(event.ends_at) : "",
        }}
      />

      <div className="flex flex-col gap-3 border-t pt-6">
        <p className="text-muted-foreground text-sm">
          Cancelling keeps the event visible with a Cancelled badge so members who
          RSVP&apos;d can see it. Deleting removes it and its RSVPs for good.
        </p>
        <div className="flex gap-2">
          {event.status === "scheduled" && (
            <form action={cancelEvent}>
              <input type="hidden" name="event_id" value={event.id} />
              <Button size="sm" variant="outline" type="submit">
                Cancel event
              </Button>
            </form>
          )}
          <form action={deleteEvent}>
            <input type="hidden" name="event_id" value={event.id} />
            <Button size="sm" variant="destructive" type="submit">
              Delete
            </Button>
          </form>
        </div>
      </div>
    </main>
  );
}
```

- [ ] **Step 6: Build**

Run: `npm run build`
Expected: success, with `/events/new` and `/events/[id]/edit` in the route list.

- [ ] **Step 7: Manual verify the full admin + RSVP loop**

In `npm run dev`, as the admin:
1. `/events` → New event → title "Club Night", location "Rack Room", starts today 19:00, no end → Create. Lands on the detail page showing "· 7:00 PM" (**not** a UTC hour — this is the timezone check).
2. RSVP **Going** → button highlights, header reads `1 going · 0 maybe · 0 out`, your name appears under GOING.
3. Tap **Going** again → RSVP clears, "You have not replied yet."
4. **Duplicate** → the form is prefilled with the same title/location and a date one week later.
5. **Edit** → change the title → Save → the detail page shows the new title.
6. **Cancel event** → the Cancelled badge appears, RSVP buttons are replaced by "This event was cancelled."
7. Delete the cancelled duplicate → redirected to `/events` with "Event deleted."

Then return to Task 4 Step 4 and tick it off.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: admin event creation, editing, duplication, and cancellation"
```

---

### Task 6: "Next up" card on the home page

**Files:**
- Modify: `app/(member)/page.tsx`

**Interfaces:**
- Consumes: `formatEventWhen` (Task 2), `events`/`rsvps` (Task 1). The file already reads `user`, `me`, `toConfirm`, and `recent` — add to it, do not rewrite it.
- Produces: no new exports.

- [ ] **Step 1: Add the query**

In `app/(member)/page.tsx`, after the existing `recent` query, add:

```tsx
  const { data: nextEvent } = await supabase
    .from("events")
    .select("id, title, location, starts_at, ends_at, rsvps(profile_id, response)")
    .eq("status", "scheduled")
    .gte("starts_at", new Date().toISOString())
    .order("starts_at")
    .limit(1)
    .maybeSingle();
```

This uses `starts_at` rather than the `partitionEvents` end-time rule so the query stays a single indexed filter; an event already under way simply is not advertised as "next up".

- [ ] **Step 2: Add the imports**

Merge into the existing import block at the top of the file:

```tsx
import { formatEventWhen, tallyRsvps } from "@/lib/events";
```

- [ ] **Step 3: Render the card**

Insert directly after the closing `</Card>` of the "Your rating" card. The `myResponse`
line is hoisted out of the JSX so the tally is computed once, and the cast mirrors the
one in `app/(member)/events/page.tsx` — Supabase embeds come back with `response`
typed as `string`, not the `RsvpResponse` union.

```tsx
      {nextEvent && (() => {
        const myResponse = tallyRsvps(
          (nextEvent.rsvps ?? []) as { profile_id: string; response: RsvpResponse }[],
          user.id
        ).mine;
        return (
          <Card>
            <CardHeader>
              <CardTitle>Next up</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-1 text-sm">
              <Link
                href={`/events/${nextEvent.id}`}
                className="font-medium underline-offset-2 hover:underline"
              >
                {nextEvent.title}
              </Link>
              <span className="text-muted-foreground">
                {formatEventWhen(nextEvent.starts_at, nextEvent.ends_at)}
                {nextEvent.location && ` · ${nextEvent.location}`}
              </span>
              <span className="text-muted-foreground text-xs">
                {myResponse ? `You're ${myResponse}` : "You haven't RSVP'd"}
              </span>
            </CardContent>
          </Card>
        );
      })()}
```

The `RsvpResponse` type import goes in the same merge as Step 2:

```tsx
import type { RsvpResponse } from "@/lib/types";
```

- [ ] **Step 4: Build and verify**

Run: `npm run build` — expect success.
In dev, with a future event created in Task 5, the home page shows "Next up" with the event title, club-time when, and your RSVP state. RSVP from the event page, return home, and confirm the state line updates (the `setRsvp` action revalidates `/`).

- [ ] **Step 5: Commit**

```bash
git add "app/(member)/page.tsx"
git commit -m "feat: next-up event card on home page"
```

---

### Task 7: RLS integration tests for events and RSVPs

**Files:**
- Modify: `tests/rls.integration.test.ts`

**Interfaces:**
- Consumes: the live Supabase project and all migrations; the file's existing `admin`, `signIn`, `pendingEmail`, `memberEmail`, `pendingId`, `memberId` fixtures.
- Produces: three regression tests. They run in `npm test` when env vars are present and skip otherwise.

- [ ] **Step 1: Create an event fixture in `beforeAll`**

Add `let eventId: string;` beside the existing `let pendingId: string;` declarations, then append to the end of the existing `beforeAll` body:

```ts
    const { data: event, error: eventError } = await admin
      .from("events")
      .insert({
        title: `rls-test-event-${Date.now()}`,
        starts_at: new Date(Date.now() + 86_400_000).toISOString(),
        created_by: memberId,
      })
      .select("id")
      .single();
    if (eventError) throw eventError;
    eventId = event!.id;
```

- [ ] **Step 2: Clean it up in `afterAll`**

Insert before the existing `await admin.auth.admin.deleteUser(pendingId);` line:

```ts
    await admin.from("events").delete().eq("id", eventId);
```

RSVP rows cascade with the event, so they need no separate cleanup.

- [ ] **Step 3: Add the three tests**

Append inside the `describe` block, after the existing `apply_match_confirmation` test:

```ts
  it("a member cannot create an event", async () => {
    const client = await signIn(memberEmail);
    const { error } = await client.from("events").insert({
      title: "unauthorized event",
      starts_at: new Date(Date.now() + 86_400_000).toISOString(),
      created_by: memberId,
    });
    expect(error).not.toBeNull();
  });

  it("a member cannot RSVP on someone else's behalf", async () => {
    const client = await signIn(memberEmail);
    const { error } = await client
      .from("rsvps")
      .insert({ event_id: eventId, profile_id: pendingId, response: "going" });
    expect(error).not.toBeNull();
  });

  it("a member can RSVP for themselves", async () => {
    const client = await signIn(memberEmail);
    const { error } = await client
      .from("rsvps")
      .insert({ event_id: eventId, profile_id: memberId, response: "going" });
    expect(error).toBeNull();
  });

  it("a pending user sees no events", async () => {
    const client = await signIn(pendingEmail);
    const { data } = await client.from("events").select("id");
    expect(data).toEqual([]);
  });
```

- [ ] **Step 4: Run the suite**

Run: `npm test`
Expected: the rating tests, the events unit tests, and all seven RLS tests PASS.

- [ ] **Step 5: Commit**

```bash
git add tests/rls.integration.test.ts
git commit -m "test: RLS coverage for events and rsvps"
```

---

### Task 8: E2E smoke test

**Files:**
- Create: `e2e/events-flow.spec.ts`

**Interfaces:**
- Consumes: the running app, live Supabase, `SUPABASE_SERVICE_ROLE_KEY` from `.env.local` (already loaded by `playwright.config.ts`), and the strings `Going` (Task 4) and `going` in the headcount (Task 4).
- Produces: one happy path — admin creates an event, a member RSVPs, headcount updates.

The existing `e2e/signup-flow.spec.ts` creates and deletes its own user; this spec follows the same self-contained pattern so the suite leaves no residue.

- [ ] **Step 1: Create `e2e/events-flow.spec.ts`**

```ts
import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

// Requires "Confirm email" OFF in Supabase auth settings.
test("admin creates an event, member RSVPs, headcount updates", async ({ page }) => {
  const stamp = Date.now();
  const email = `e2e-events-${stamp}@example.com`;
  const password = "e2e-password-123!";
  const title = `E2E Club Night ${stamp}`;
  const service = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // An approved admin, created directly so the test does not depend on the
  // signup + approval flow that signup-flow.spec.ts already covers.
  const { data: school } = await service.from("schools").select("id").limit(1).single();
  const { data: created, error: createError } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: `E2E Admin ${stamp}`, school_id: school!.id },
  });
  if (createError) throw createError;
  const userId = created.user!.id;
  await service
    .from("profiles")
    .update({ role: "admin", status: "approved" })
    .eq("id", userId);

  await page.goto("/login");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
  await expect(page.getByText(/your rating/i)).toBeVisible();

  // Create the event, one week out at 7pm club time.
  const startsAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  await page.goto("/events/new");
  await page.fill('input[name="title"]', title);
  await page.fill('input[name="location"]', "Rack Room");
  await page.fill('input[name="starts_at_local"]', `${startsAt}T19:00`);
  await page.click('button[type="submit"]');

  await expect(page.getByRole("heading", { name: title })).toBeVisible();
  await expect(page.getByText(/no rsvps yet/i)).toBeVisible();

  // RSVP going.
  await page.getByRole("button", { name: "Going" }).click();
  await expect(page.getByText(/1 going/)).toBeVisible();

  // It shows up on the calendar.
  await page.goto("/events");
  await expect(page.getByText(title)).toBeVisible();

  const { data: event } = await service
    .from("events")
    .select("id")
    .eq("title", title)
    .single();
  await service.from("events").delete().eq("id", event!.id);
  await service.auth.admin.deleteUser(userId);
});
```

- [ ] **Step 2: Run it**

Run: `npx playwright test e2e/events-flow.spec.ts`
Expected: 1 passed.

- [ ] **Step 3: Run the whole suite**

Run: `npm test` then `npx playwright test`
Expected: all unit + RLS tests pass; both E2E specs pass.

- [ ] **Step 4: Commit**

```bash
git add e2e/events-flow.spec.ts
git commit -m "test: e2e smoke for event creation and rsvp"
```

---

### Task 9: Deploy

**Files:** none.

**Interfaces:** consumes the finished feature.

- [ ] **Step 1: Confirm the migration is on the production database**

The app has one Supabase project shared by dev and production, so Task 1's migration is already live. Verify with `mcp__claude_ai_Supabase__execute_sql` on `azetukujqrqyxfzohfmd`:

```sql
select count(*) from public.events;
```

Expected: a number, not an error.

- [ ] **Step 2: Deploy**

```powershell
vercel --prod --yes
```

- [ ] **Step 3: Verify production**

Open the production URL, log in, and check: `/events` renders with the five-item nav; create an event and confirm the time reads in club time, **not** UTC. This is the check that matters — the dev server runs in Eastern time, so a timezone bug would only show up here.

Then scan for runtime errors:

```powershell
vercel logs <deployment-url> --json
```

Expected: no `"level":"error"` entries from the events routes.

- [ ] **Step 4: Update the plan and spec status**

Add a `> **STATUS: COMPLETED <date>.**` banner to the top of this plan, matching the one on the Phase 1–2 plan.

```bash
git add -A
git commit -m "docs: mark phase 3 plan completed"
```

---

## Out of scope (deferred by the spec)

- Recurring-event rules — Duplicate covers the weekly club night.
- Capacity limits and waitlists — RSVP is a headcount, not a reservation.
- Member-created events — admin-only keeps the calendar authoritative.
- Reminders/notifications — needs email or push infrastructure that does not exist yet.
- Per-event comments — Phase 5 messaging.
- The tournament↔event link — Phase 4 adds `tournaments.event_id`.
