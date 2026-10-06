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
// The escapes are deliberate: the literal characters are invisible in source.
function normalize(text: string): string {
  return text.replace(/[\u202f\u00a0]/g, " ");
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

// The club's calendar date for an instant, as a date input's "YYYY-MM-DD".
// Slicing toISOString() instead would give the UTC date, which on a UTC server
// is already tomorrow for anything after 8pm club time.
export function clubDateOf(iso: string): string {
  return isoToClubTime(iso).slice(0, 10);
}

// One calendar week later in CLUB terms: the same wall-clock time seven days
// on, even when the interval crosses a DST boundary. Adding a fixed 168 hours
// to the instant would drift by an hour twice a year.
export function addClubWeek(iso: string): string {
  const [datePart, timePart] = isoToClubTime(iso).split("T");
  // Calendar math in UTC so the ambient zone cannot influence the day rollover.
  const day = new Date(`${datePart}T00:00:00Z`);
  day.setUTCDate(day.getUTCDate() + 7);
  return `${day.toISOString().slice(0, 10)}T${timePart}`;
}

export interface EventLike {
  starts_at: string;
  ends_at: string | null;
}

// An event is over once it ends (or, with no end time, once it starts). The
// single definition both the calendar partition and the RSVP lock use, so the
// event page can never lock RSVPs while the calendar still lists it upcoming.
export function isEventOver(event: EventLike, now: Date): boolean {
  const endsAt = new Date(event.ends_at ?? event.starts_at);
  return endsAt.getTime() < now.getTime();
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
    if (isEventOver(event, now)) past.push(event);
    else upcoming.push(event);
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

// "My school" filter on the calendar. Events carry no school id, so this is a
// name match across the fields a school would show up in.
export function eventMentionsSchool(
  event: { title: string; location: string | null; source_name: string | null },
  school: { name: string; short_name: string }
): boolean {
  const hay = [event.title, event.location, event.source_name].filter(Boolean).join(" ").toLowerCase();
  return hay.includes(school.name.toLowerCase()) || hay.includes(school.short_name.toLowerCase());
}
