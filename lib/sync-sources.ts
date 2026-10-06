import { lookup } from "node:dns/promises";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Agent, fetch as undiciFetch } from "undici";
import { parseIcs } from "@/lib/ics";
import { planSync, type ImportedEvent } from "@/lib/event-sync";
import { feedUrlProblem, isPrivateIp } from "@/lib/url-guard";

// Every outbound connection resolves the hostname *inside* the connector and
// refuses private answers there, so a feed host cannot pass the pre-check
// and then rebind to an internal address for the real connection.
type LookupCallback = (err: Error | null, address: string | { address: string; family: number }[], family?: number) => void;

const pinnedAgent = new Agent({
  connect: {
    // net.connect calls this with { all: true } when autoSelectFamily is on
    // (Node 20+) and then expects an array; otherwise a single address.
    lookup: ((hostname: string, options: { all?: boolean }, callback: LookupCallback) => {
      lookup(hostname, { all: true })
        .then((addresses) => {
          const safe = addresses.filter((a) => !isPrivateIp(a.address));
          if (safe.length === 0) {
            callback(new Error(`${hostname} resolves to a private address`), "", 4);
            return;
          }
          if (options?.all) callback(null, safe.map((a) => ({ address: a.address, family: a.family })));
          else callback(null, safe[0].address, safe[0].family);
        })
        .catch((err: Error) => callback(err, "", 4));
    }) as never,
  },
});

// Node's global fetch ignores a foreign dispatcher, so the default client is
// undici's own fetch bound to the pinned agent. Tests inject a stub instead.
const guardedFetch: typeof fetch = ((input: RequestInfo | URL, init?: RequestInit) =>
  undiciFetch(input as string, { ...(init as object), dispatcher: pinnedAgent } as Parameters<typeof undiciFetch>[1])) as unknown as typeof fetch;

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
const MAX_REDIRECTS = 3;

// The URL is admin-supplied and fetched from our server, so it is checked
// statically and then resolved: nothing private, loopback or link-local.
export async function assertPublicFeedUrl(raw: string, resolve: typeof lookup = lookup): Promise<URL> {
  const problem = feedUrlProblem(raw);
  if (problem) throw new Error(problem);
  const url = new URL(raw);
  const addresses = await resolve(url.hostname, { all: true }).catch(() => []);
  if (addresses.length === 0) throw new Error(`could not resolve ${url.hostname}`);
  if (addresses.some((a) => isPrivateIp(a.address))) {
    throw new Error(`${url.hostname} resolves to a private address`);
  }
  return url;
}

// Reads at most MAX_FEED_BYTES, aborting the download past that instead of
// buffering an unbounded body first.
async function readCapped(res: Response): Promise<string> {
  const declared = Number(res.headers.get("content-length") ?? 0);
  if (declared > MAX_FEED_BYTES) throw new Error("feed is too large");
  if (!res.body) return await res.text();
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_FEED_BYTES) {
      await reader.cancel();
      throw new Error("feed is too large");
    }
    chunks.push(value);
  }
  return new TextDecoder("utf-8").decode(Buffer.concat(chunks.map((c) => Buffer.from(c))));
}

async function fetchFeed(rawUrl: string, fetchImpl: typeof fetch, resolve?: typeof lookup): Promise<string> {
  let url = await assertPublicFeedUrl(rawUrl, resolve);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    // Redirects are followed by hand so every hop gets the same checks.
    for (let hop = 0; ; hop++) {
      const res = await fetchImpl(url.toString(), {
        signal: controller.signal,
        redirect: "manual",
        headers: { accept: "text/calendar, text/plain;q=0.8, */*;q=0.5", "user-agent": "SECBL event sync" },
      });
      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get("location");
        if (!location || hop >= MAX_REDIRECTS) throw new Error("feed redirected too many times");
        url = await assertPublicFeedUrl(new URL(location, url).toString(), resolve);
        continue;
      }
      if (!res.ok) throw new Error(`feed responded ${res.status}`);
      const text = await readCapped(res);
      if (!/BEGIN:VCALENDAR/i.test(text)) throw new Error("not an iCalendar feed");
      return text;
    }
  } finally {
    clearTimeout(timer);
  }
}

export async function syncAllSources(
  service: SupabaseClient,
  options: { now?: Date; fetchImpl?: typeof fetch; resolve?: typeof lookup; onlyId?: string } = {}
): Promise<SourceResult[]> {
  const now = options.now ?? new Date();
  const fetchImpl = options.fetchImpl ?? guardedFetch;
  let query = service.from("event_sources").select("id, name, feed_url, created_by, enabled").eq("enabled", true);
  if (options.onlyId) query = query.eq("id", options.onlyId);
  const { data: sources, error } = await query;
  if (error) throw new Error(`could not load event sources: ${error.message}`);

  const results: SourceResult[] = [];
  for (const source of sources ?? []) {
    const result: SourceResult = { id: source.id, name: source.name, ok: false, imported: 0, updated: 0, cancelled: 0, error: null };
    try {
      const text = await fetchFeed(source.feed_url, fetchImpl, options.resolve);
      const feed = parseIcs(text);
      const { data: existing, error: existingError } = await service
        .from("events")
        .select("id, external_uid, title, description, location, starts_at, ends_at, status, external_url")
        .eq("source_id", source.id);
      if (existingError) throw new Error(existingError.message);

      const plan = planSync(feed, (existing ?? []) as ImportedEvent[], now);

      if (plan.inserts.length > 0) {
        const { error: insertError } = await service.from("events").insert(
          plan.inserts.map((e) => ({
            ...e,
            source_id: source.id,
            source_name: source.name,
            created_by: source.created_by,
          }))
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
      result.error = err instanceof Error ? err.message.slice(0, 300) : String(err).slice(0, 300);
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
