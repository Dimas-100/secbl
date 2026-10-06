import { revalidatePath } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { syncAllSources } from "@/lib/sync-sources";

// Daily feed sync, scheduled in vercel.json. Vercel sends
// `Authorization: Bearer <CRON_SECRET>` when that env var is set; nothing
// else may trigger a sync over HTTP (admins use the Sync now button).
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      return NextResponse.json({ ok: false, error: "CRON_SECRET is not configured" }, { status: 503 });
    }
  } else if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const results = await syncAllSources(createServiceClient());
  if (results.some((r) => r.imported || r.updated || r.cancelled)) {
    revalidatePath("/events");
    revalidatePath("/");
  }
  return NextResponse.json(
    { ok: results.every((r) => r.ok), synced_at: new Date().toISOString(), sources: results },
    { headers: { "cache-control": "no-store" } }
  );
}
