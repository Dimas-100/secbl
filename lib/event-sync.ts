// Turns a feed snapshot plus what we already imported into a plan of writes.
// Pure, so the rules are tested without a database: insert what's new, patch
// what changed, cancel what the club pulled (but never rewrite the past),
// and restore anything that comes back.
import type { IcsEvent } from "@/lib/ics";

export interface ImportedEvent {
  id: string;
  external_uid: string | null;
  title: string;
  description: string | null;
  location: string | null;
  starts_at: string;
  ends_at: string | null;
  status: "scheduled" | "cancelled";
  external_url: string | null;
}

export interface EventFields {
  title: string;
  description: string | null;
  location: string | null;
  starts_at: string;
  ends_at: string | null;
  external_url: string | null;
}

export interface SyncPlan {
  inserts: (EventFields & { external_uid: string })[];
  updates: { id: string; patch: Partial<EventFields> & { status?: "scheduled" } }[];
  cancels: string[];
}

const MAX_DESCRIPTION = 2000;

function fieldsOf(e: IcsEvent): EventFields {
  return {
    title: e.summary.slice(0, 120),
    description: e.description ? e.description.slice(0, MAX_DESCRIPTION) : null,
    location: e.location,
    starts_at: e.startsAt,
    ends_at: e.endsAt,
    external_url: e.url,
  };
}

const sameInstant = (a: string | null, b: string | null) =>
  (a === null && b === null) || (a !== null && b !== null && Date.parse(a) === Date.parse(b));

function hasEnded(e: ImportedEvent, now: Date): boolean {
  return Date.parse(e.ends_at ?? e.starts_at) < now.getTime();
}

export function planSync(feed: IcsEvent[], existing: ImportedEvent[], now: Date): SyncPlan {
  const plan: SyncPlan = { inserts: [], updates: [], cancels: [] };
  const byUid = new Map(existing.filter((e) => e.external_uid).map((e) => [e.external_uid!, e]));
  const seen = new Set<string>();

  for (const item of feed) {
    seen.add(item.uid);
    const have = byUid.get(item.uid);
    const fields = fieldsOf(item);
    if (!have) {
      // A cancelled event we never imported is nothing to us.
      if (!item.cancelled) plan.inserts.push({ ...fields, external_uid: item.uid });
      continue;
    }
    if (item.cancelled) {
      if (have.status === "scheduled" && !hasEnded(have, now)) plan.cancels.push(have.id);
      continue;
    }
    const patch: Partial<EventFields> & { status?: "scheduled" } = {};
    if (have.title !== fields.title) patch.title = fields.title;
    if ((have.description ?? null) !== fields.description) patch.description = fields.description;
    if ((have.location ?? null) !== fields.location) patch.location = fields.location;
    if (!sameInstant(have.starts_at, fields.starts_at)) patch.starts_at = fields.starts_at;
    if (!sameInstant(have.ends_at, fields.ends_at)) patch.ends_at = fields.ends_at;
    if ((have.external_url ?? null) !== fields.external_url) patch.external_url = fields.external_url;
    if (have.status === "cancelled") patch.status = "scheduled";
    if (Object.keys(patch).length > 0) plan.updates.push({ id: have.id, patch });
  }

  for (const have of existing) {
    if (!have.external_uid || seen.has(have.external_uid)) continue;
    if (have.status === "scheduled" && !hasEnded(have, now)) plan.cancels.push(have.id);
  }
  return plan;
}
