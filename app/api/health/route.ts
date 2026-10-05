import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Liveness check that also touches the database on purpose. Supabase pauses a
// free-tier project after a week without API activity — it happened to this
// one on 2026-10-05 and took production down until it was restored by hand.
// vercel.json schedules this daily, so a quiet week between semesters can no
// longer pause the club's database.
export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } }
  );
  const started = Date.now();
  const { error } = await supabase.from("schools").select("id").limit(1);
  const body = {
    ok: !error,
    database: error ? `error: ${error.message}` : "reachable",
    latency_ms: Date.now() - started,
    checked_at: new Date().toISOString(),
  };
  return NextResponse.json(body, {
    status: error ? 503 : 200,
    headers: { "cache-control": "no-store" },
  });
}
