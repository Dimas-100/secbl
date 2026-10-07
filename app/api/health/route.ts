import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { clubDateOf } from "@/lib/events";
import { runSeasonTick } from "@/lib/season-tick";

// Liveness check that also touches the database on purpose. Supabase pauses a
// free-tier project after a week without API activity — it happened to this
// one on 2026-10-05 and took production down until it was restored by hand.
// vercel.json schedules this daily, so a quiet week between semesters can no
// longer pause the club's database.
//
// It is also the club's daily tick: Vercel's Hobby plan allows two cron jobs
// and both exist, so the "one week left in the season" reminder rides here.
export const dynamic = "force-dynamic";

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabase = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
  });
  const started = Date.now();
  const { error } = await supabase.from("schools").select("id").limit(1);

  let seasonTick = "skipped";
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!error && serviceKey) {
    const service = createClient(url, serviceKey, { auth: { persistSession: false } });
    await runSeasonTick(service, clubDateOf(new Date().toISOString()));
    seasonTick = "ran";
  }

  const body = {
    ok: !error,
    database: error ? `error: ${error.message}` : "reachable",
    latency_ms: Date.now() - started,
    season_tick: seasonTick,
    checked_at: new Date().toISOString(),
  };
  return NextResponse.json(body, {
    status: error ? 503 : 200,
    headers: { "cache-control": "no-store" },
  });
}
