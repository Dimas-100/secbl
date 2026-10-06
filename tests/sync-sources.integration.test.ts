import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { syncAllSources } from "@/lib/sync-sources";

// The sync against the real database with a stubbed network: the PIN fixture
// is "fetched", imported, changed, and partly withdrawn across three runs.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const fixture = fs.readFileSync(path.join(__dirname, "fixtures", "pin-sample.ics"), "utf8");

describe.skipIf(!url || !serviceKey)("syncAllSources", () => {
  const service = createClient(url!, serviceKey!, { auth: { persistSession: false } });
  const stamp = Date.now();
  const feedUrl = `https://example.edu/sync-test-${stamp}/events.ics`;
  let sourceId: string;
  let adminId: string;

  const fetchReturning = (text: string, status = 200): typeof fetch =>
    (async () => new Response(text, { status, headers: { "content-type": "text/calendar" } })) as typeof fetch;

  beforeAll(async () => {
    const { data: admin } = await service.from("profiles").select("id").eq("role", "admin").limit(1).single();
    adminId = admin!.id;
    const { data, error } = await service
      .from("event_sources")
      .insert({ name: `Sync test ${stamp}`, feed_url: feedUrl, created_by: adminId })
      .select("id")
      .single();
    if (error) throw error;
    sourceId = data!.id;
  });

  afterAll(async () => {
    await service.from("events").delete().eq("source_id", sourceId);
    await service.from("event_sources").delete().eq("id", sourceId);
  });

  it("imports the feed's events on first sync and records status", async () => {
    const [result] = await syncAllSources(service, {
      onlyId: sourceId,
      fetchImpl: fetchReturning(fixture),
      now: new Date("2026-10-01T00:00:00Z"),
    });
    expect(result).toMatchObject({ ok: true, imported: 3, updated: 0, cancelled: 0 });

    const { data: events } = await service
      .from("events")
      .select("title, location, starts_at, external_uid, external_url, status")
      .eq("source_id", sourceId)
      .order("title");
    expect(events).toHaveLength(3);
    const fair = events!.find((e) => e.title === "Get Fair Ready")!;
    expect(fair.location).toBe("25 Park Place, Room 2608");
    expect(fair.external_uid).toBe("https://pin.gsu.edu/event/12698357");
    expect(fair.external_url).toBe("https://pin.gsu.edu/event/12698357");
    expect(new Date(fair.starts_at).toISOString()).toBe("2026-10-06T15:00:00.000Z");

    const { data: source } = await service.from("event_sources").select("last_status, last_imported, last_error").eq("id", sourceId).single();
    expect(source).toMatchObject({ last_status: "ok", last_imported: 3, last_error: null });
  });

  it("is idempotent, then applies upstream edits and withdrawals", async () => {
    const [again] = await syncAllSources(service, { onlyId: sourceId, fetchImpl: fetchReturning(fixture), now: new Date("2026-10-01T00:00:00Z") });
    expect(again).toMatchObject({ ok: true, imported: 0, updated: 0, cancelled: 0 });

    // Move one event, drop another from the feed. Split on VEVENT boundaries
    // rather than a lazy regex, which would swallow the first event too.
    const moved = fixture.replace("LOCATION:25 Park Place\\, Room 2608", "LOCATION:Student Center\\, Table 3");
    const [head, ...blocks] = moved.split("BEGIN:VEVENT");
    const edited = head + blocks.filter((b) => !b.includes("event/12778123")).map((b) => `BEGIN:VEVENT${b}`).join("");
    const [third] = await syncAllSources(service, { onlyId: sourceId, fetchImpl: fetchReturning(edited), now: new Date("2026-10-01T00:00:00Z") });
    expect(third).toMatchObject({ ok: true, imported: 0, updated: 1, cancelled: 1 });

    const { data: events } = await service
      .from("events")
      .select("title, location, status")
      .eq("source_id", sourceId);
    expect(events!.find((e) => e.title === "Get Fair Ready")!.location).toBe("Student Center, Table 3");
    expect(events!.find((e) => e.title === "Excel: Formulas and Functions")!.status).toBe("cancelled");
  });

  it("records a feed failure without touching events", async () => {
    const [bad] = await syncAllSources(service, { onlyId: sourceId, fetchImpl: fetchReturning("<html>nope</html>", 500) });
    expect(bad.ok).toBe(false);
    expect(bad.error).toMatch(/responded 500/);
    const { data: source } = await service.from("event_sources").select("last_status, last_error").eq("id", sourceId).single();
    expect(source!.last_status).toBe("error");
    expect(source!.last_error).toMatch(/500/);
    const { count } = await service.from("events").select("id", { count: "exact", head: true }).eq("source_id", sourceId);
    expect(count).toBe(3);
  });
});
