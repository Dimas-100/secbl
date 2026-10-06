// A small iCalendar reader for the schools' Engage feeds (PIN and friends).
// Pure: text in, normalized events out. Handles folded lines, escaped text,
// UTC / TZID / floating / all-day times. Floating and all-day values are read
// on the club clock, since every feed we consume belongs to a Georgia campus.
import { clubTimeToISO } from "@/lib/events";

export interface IcsEvent {
  uid: string;
  summary: string;
  description: string | null;
  location: string | null;
  url: string | null;
  startsAt: string;
  endsAt: string | null;
  allDay: boolean;
  cancelled: boolean;
}

interface Property {
  name: string;
  params: Record<string, string>;
  value: string;
}

// RFC 5545 §3.1: a line starting with a space or tab continues the previous one.
export function unfoldLines(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    if (raw === "") continue;
    if ((raw.startsWith(" ") || raw.startsWith("\t")) && out.length > 0) {
      out[out.length - 1] += raw.slice(1);
    } else {
      out.push(raw);
    }
  }
  return out;
}

function parseProperty(line: string): Property | null {
  // Name and parameters end at the first ':' that is not inside a quoted
  // parameter value (URL values contain colons; param values may be quoted).
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') inQuotes = !inQuotes;
    else if (ch === ":" && !inQuotes) {
      const head = line.slice(0, i);
      const value = line.slice(i + 1);
      const [name, ...paramParts] = head.split(";");
      const params: Record<string, string> = {};
      for (const p of paramParts) {
        const eq = p.indexOf("=");
        if (eq > 0) params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1).replace(/^"|"$/g, "");
      }
      return { name: name.toUpperCase(), params, value };
    }
  }
  return null;
}

export function unescapeText(value: string): string {
  return value
    .replace(/\\n/gi, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\")
    .trim();
}

// "20261006T150000Z" → instant; "20261006T190000" (+ TZID or floating) → club
// wall clock; "20261006" (VALUE=DATE) → midnight on the club clock.
export function parseIcsDate(value: string, params: Record<string, string>): { iso: string; allDay: boolean } | null {
  const v = value.trim();
  const dateOnly = /^(\d{4})(\d{2})(\d{2})$/.exec(v);
  if (params.VALUE === "DATE" || dateOnly) {
    const m = dateOnly;
    if (!m) return null;
    return { iso: clubTimeToISO(`${m[1]}-${m[2]}-${m[3]}T00:00`), allDay: true };
  }
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z?)$/.exec(v);
  if (!m) return null;
  const [, y, mo, d, h, mi, s = "00", z] = m;
  if (z === "Z") {
    return { iso: new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +s)).toISOString(), allDay: false };
  }
  // TZID other than the club's is treated as club time: close enough for
  // campus feeds, and the alternative is shipping a tz database.
  return { iso: clubTimeToISO(`${y}-${mo}-${d}T${h}:${mi}`), allDay: false };
}

export function parseIcs(text: string): IcsEvent[] {
  const lines = unfoldLines(text);
  const events: IcsEvent[] = [];
  let current: Property[] | null = null;
  for (const line of lines) {
    if (line === "BEGIN:VEVENT") {
      current = [];
      continue;
    }
    if (line === "END:VEVENT") {
      if (current) {
        const ev = buildEvent(current);
        if (ev) events.push(ev);
      }
      current = null;
      continue;
    }
    if (current) {
      const prop = parseProperty(line);
      if (prop) current.push(prop);
    }
  }
  return events;
}

function buildEvent(props: Property[]): IcsEvent | null {
  const get = (name: string) => props.find((p) => p.name === name);
  const uid = get("UID")?.value.trim();
  const summary = get("SUMMARY") ? unescapeText(get("SUMMARY")!.value) : "";
  const start = get("DTSTART");
  if (!uid || !summary || !start) return null;
  const startsAt = parseIcsDate(start.value, start.params);
  if (!startsAt) return null;
  const end = get("DTEND");
  let endsAt = end ? parseIcsDate(end.value, end.params) : null;
  if (startsAt.allDay && !endsAt) {
    // An all-day event with no DTEND lasts the day.
    const next = new Date(startsAt.iso);
    next.setUTCDate(next.getUTCDate() + 1);
    endsAt = { iso: next.toISOString(), allDay: true };
  }
  if (endsAt && Date.parse(endsAt.iso) <= Date.parse(startsAt.iso)) endsAt = null;
  const description = get("DESCRIPTION") ? unescapeText(get("DESCRIPTION")!.value) : "";
  const location = get("LOCATION") ? unescapeText(get("LOCATION")!.value) : "";
  const url = get("URL")?.value.trim() ?? (uid.startsWith("http") ? uid : null);
  return {
    uid,
    summary,
    description: description || null,
    location: location || null,
    url: url && /^https?:\/\//.test(url) ? url : null,
    startsAt: startsAt.iso,
    endsAt: endsAt?.iso ?? null,
    allDay: startsAt.allDay,
    cancelled: (get("STATUS")?.value.trim().toUpperCase() ?? "") === "CANCELLED",
  };
}
