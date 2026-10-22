// Recent's club-event recaps, server half (pure half: lib/feed eventRecap,
// nightRecap). The calendar events and club nights that ended in the last
// month; RLS shows only your own school's nights.
import type { SupabaseClient } from "@supabase/supabase-js";
import { isEventOver } from "@/lib/events";
import { eventRecap, nightRecap, one, type NightGame, type Recap } from "@/lib/feed";

const RECAP_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const RECAPS_EACH = 5;

type SchoolRef = { school_id: string | null };

export async function loadRecaps(supabase: SupabaseClient, now: Date): Promise<Recap[]> {
  const since = new Date(now.getTime() - RECAP_WINDOW_MS).toISOString();
  const nowIso = now.toISOString();
  const [{ data: events }, { data: nights }] = await Promise.all([
    supabase
      .from("events")
      .select("id, title, starts_at, ends_at, rsvps(response)")
      .eq("status", "scheduled")
      .gte("starts_at", since)
      .lt("starts_at", nowIso)
      .order("starts_at", { ascending: false })
      .limit(RECAPS_EACH),
    supabase
      .from("club_nights")
      .select("id, school_id, opened_at, closed_at, schools(short_name)")
      .not("closed_at", "is", null)
      .gte("closed_at", since)
      .order("closed_at", { ascending: false })
      .limit(RECAPS_EACH),
  ]);

  const recaps: Recap[] = (events ?? []).filter((e) => isEventOver(e, now)).map(eventRecap);

  const closed = (nights ?? []) as {
    id: string;
    school_id: string;
    opened_at: string;
    closed_at: string;
    schools: { short_name: string } | { short_name: string }[] | null;
  }[];
  if (closed.length > 0) {
    // One read for every night's games: from the earliest opening to the
    // latest closing, reported at the table (pending) or counted.
    const from = closed.reduce((m, n) => (n.opened_at < m ? n.opened_at : m), closed[0].opened_at);
    const to = closed.reduce((m, n) => (n.closed_at > m ? n.closed_at : m), closed[0].closed_at);
    const { data: rows } = await supabase
      .from("matches")
      .select(
        "reporter_id, opponent_id, created_at, reporter:profiles!matches_reporter_id_fkey(school_id), opponent:profiles!matches_opponent_id_fkey(school_id)"
      )
      .in("status", ["pending", "confirmed"])
      .gte("created_at", from)
      .lte("created_at", to);
    const games: NightGame[] = (rows ?? []).map((g) => ({
      reporter_id: g.reporter_id,
      opponent_id: g.opponent_id,
      created_at: g.created_at,
      reporter_school: one(g.reporter as SchoolRef | SchoolRef[] | null)?.school_id ?? null,
      opponent_school: one(g.opponent as SchoolRef | SchoolRef[] | null)?.school_id ?? null,
    }));
    for (const n of closed) {
      const r = nightRecap(n, games);
      if (r) recaps.push(r);
    }
  }
  return recaps;
}
