import type { SupabaseClient } from "@supabase/supabase-js";
import { parseIcs } from "@/lib/ics";
import { planSync, type ImportedEvent } from "@/lib/event-sync";

// Pulls every enabled feed and applies the plan with the service role. Each
// source is isolated: one bad feed records its error and the rest continue.
// Server-only — called from the cron route and the admin "Sync now" action.

export interface SourceResult {
  id: string;
  name: string;
  ok: boolean;
  imported: number;
  updated: number;
  cancelled: number;
  error: string | null;
}

const FETCH_TIMEOUT_MS = 15_000;
const MAX_FEED_BYTES = 2_000_000;

async function fetchFeed(url: string, fetchImpl: typeof fetch): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetchImpl(url, {
      signal: controller.signal,
      headers: { accept: "text/calendar, text/plain;q=0.8, */*;q=0.5", "user-agent": "SECBL event sync" },
      redirect: "follow",
    });
    if (!res.ok) throw new Error(`feed responded ${res.status}`);
    const text = await res.text();
    if (text.length > MAX_FEED_BYTES) throw new Error("feed is too large");
    if (!/BEGIN:VCALENDAR/i.test(text)) throw new Error("not an iCalendar feed");
    return text;
  } finally {
    clearTimeout(timer);
  }
}

export async function syncAllSources(
  service: SupabaseClient,
  options: { now?: Date; fetchImpl?: typeof fetch; onlyId?: string } = {}
): Promise<SourceResult[]> {
  const now = options.now ?? new Date();
  const fetchImpl = options.fetchImpl ?? fetch;
  let query = service.from("event_sources").select("id, name, feed_url, created_by, enabled").eq("enabled", true);
  if (options.onlyId) query = query.eq("id", options.onlyId);
  const { data: sources, error } = await query;
  if (error) throw new Error(`could not load event sources: ${error.message}`);

  const results: SourceResult[] = [];
  for (const source of sources ?? []) {
    const result: SourceResult = { id: source.id, name: source.name, ok: false, imported: 0, updated: 0, cancelled: 0, error: null };
    try {
      const text = await fetchFeed(source.feed_url, fetchImpl);
      const feed = parseIcs(text);
      const { data: existing, error: existingError } = await service
        .from("events")
        .select("id, external_uid, title, description, location, starts_at, ends_at, status, external_url")
        .eq("source_id", source.id);
      if (existingError) throw new Error(existingError.message);

      const plan = planSync(feed, (existing ?? []) as ImportedEvent[], now);

      if (plan.inserts.length > 0) {
        const { error: insertError } = await service.from("events").insert(
          plan.inserts.map((e) => ({ ...e, source_id: source.id, created_by: source.created_by }))
        );
        if (insertError) throw new Error(insertError.message);
      }
      for (const u of plan.updates) {
        const { error: updateError } = await service.from("events").update(u.patch).eq("id", u.id);
        if (updateError) throw new Error(updateError.message);
      }
      if (plan.cancels.length > 0) {
        const { error: cancelError } = await service
          .from("events")
          .update({ status: "cancelled" })
          .in("id", plan.cancels);
        if (cancelError) throw new Error(cancelError.message);
      }
      result.ok = true;
      result.imported = plan.inserts.length;
      result.updated = plan.updates.length;
      result.cancelled = plan.cancels.length;
    } catch (err) {
      result.error = err instanceof Error ? err.message : String(err);
    }
    await service
      .from("event_sources")
      .update({
        last_synced_at: now.toISOString(),
        last_status: result.ok ? "ok" : "error",
        last_error: result.error,
        last_imported: result.ok ? result.imported : null,
      })
      .eq("id", source.id);
    results.push(result);
  }
  return results;
}
