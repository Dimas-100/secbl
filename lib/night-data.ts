// Club night, server half (docs/superpowers/specs/2026-10-20-club-night-design.md §2, §4):
// the one loader /night, Home and Events read from, and the push for whoever
// was just called to a table.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AvatarIdentity } from "@/components/avatar";
import { LIVE_STALE_MS } from "@/lib/live";
import { isNightOpen, type LineRow, type Night, type TableRow } from "@/lib/night";
import { nightCalledPayload } from "@/lib/push";
import { notify } from "@/lib/push-send";

export interface NightData {
  night: Night | null;
  line: LineRow[];
  tables: TableRow[];
  people: Map<string, AvatarIdentity>;
  isAdmin: boolean;
  // Fresh scoreboards of the table players, by scorekeeper (reporter) id.
  live: Map<string, { opponent_id: string; reporter_score: number; opponent_score: number }>;
}

export interface CalledRow {
  table_no: number;
  player_a: string;
  player_b: string;
}

// The caller's school's open night (RLS shows only their school's), its line,
// its tables, and the people in them. A night idle for six hours reads as none.
export async function loadNight(supabase: SupabaseClient, meId: string, now: Date): Promise<NightData> {
  const [{ data: me }, { data: nights }] = await Promise.all([
    supabase.from("profiles").select("role").eq("id", meId).single(),
    supabase
      .from("club_nights")
      .select("id, school_id, opened_by, tables, opened_at, touched_at, closed_at")
      .is("closed_at", null)
      .order("opened_at", { ascending: false })
      .limit(1),
  ]);
  const isAdmin = me?.role === "admin";
  const candidate = ((nights ?? [])[0] as Night | undefined) ?? null;
  const night = isNightOpen(candidate, now) ? candidate : null;
  const empty: NightData = { night: null, line: [], tables: [], people: new Map(), isAdmin, live: new Map() };
  if (!night) return empty;

  const [{ data: line }, { data: tables }] = await Promise.all([
    supabase.from("night_line").select("profile_id, joined_at").eq("night_id", night.id),
    supabase.from("night_tables").select("table_no, player_a, player_b, called_at").eq("night_id", night.id),
  ]);
  const lineRows = (line ?? []) as LineRow[];
  const tableRows = (tables ?? []) as TableRow[];
  const ids = [
    ...new Set([
      ...lineRows.map((r) => r.profile_id),
      ...tableRows.flatMap((t) => [t.player_a, t.player_b]),
      ...(night.opened_by ? [night.opened_by] : []),
    ]),
  ];
  const scorekeepers = tableRows.map((t) => t.player_a);
  const [{ data: profiles }, { data: liveRows }] = await Promise.all([
    ids.length > 0
      ? supabase.from("profiles").select("id, display_name, avatar_url, ball").in("id", ids)
      : Promise.resolve({ data: [] as AvatarIdentity[] }),
    scorekeepers.length > 0
      ? supabase
          .from("live_games")
          .select("reporter_id, opponent_id, reporter_score, opponent_score")
          .in("reporter_id", scorekeepers)
          .gte("updated_at", new Date(now.getTime() - LIVE_STALE_MS).toISOString())
      : Promise.resolve({ data: [] as { reporter_id: string; opponent_id: string; reporter_score: number; opponent_score: number }[] }),
  ]);
  return {
    night,
    line: lineRows,
    tables: tableRows,
    people: new Map(((profiles ?? []) as AvatarIdentity[]).map((p) => [p.id, p])),
    isAdmin,
    live: new Map(
      (liveRows ?? []).map((r) => [
        r.reporter_id as string,
        { opponent_id: r.opponent_id as string, reporter_score: r.reporter_score as number, opponent_score: r.opponent_score as number },
      ])
    ),
  };
}

// "You're up on table 2" to both players just called — not to whoever's tap
// called them, who is looking at it. Never throws.
export async function pushCalled(
  service: SupabaseClient,
  rows: CalledRow[],
  nightId: string | null,
  actorId: string
): Promise<void> {
  if (rows.length === 0) return;
  try {
    let night = nightId;
    if (!night) {
      const { data } = await service
        .from("night_tables")
        .select("night_id")
        .eq("player_a", rows[0].player_a)
        .eq("table_no", rows[0].table_no)
        .limit(1)
        .maybeSingle();
      night = (data?.night_id as string | undefined) ?? "club";
    }
    const ids = [...new Set(rows.flatMap((r) => [r.player_a, r.player_b]))];
    const { data: names } = await service.from("profiles").select("id, display_name").in("id", ids);
    const nameOf = (id: string) => names?.find((p) => p.id === id)?.display_name ?? "your opponent";
    await Promise.all(
      rows.flatMap((r) => [
        notify(service, {
          candidates: [r.player_a],
          category: "matches",
          excludeId: actorId,
          payload: nightCalledPayload({ nightId: night!, tableNo: r.table_no, opponentName: nameOf(r.player_b), keepsScore: true }),
        }),
        notify(service, {
          candidates: [r.player_b],
          category: "matches",
          excludeId: actorId,
          payload: nightCalledPayload({ nightId: night!, tableNo: r.table_no, opponentName: nameOf(r.player_a), keepsScore: false }),
        }),
      ])
    );
  } catch (err) {
    console.warn("night: push failed", err);
  }
}

// After a result is written: if the reporter and their opponent hold a table
// tonight, it is free now and the next pair is called. Never fails a report.
export async function freeTableAfterReport(
  supabase: SupabaseClient,
  service: SupabaseClient,
  otherId: string,
  actorId: string
): Promise<void> {
  try {
    const { data, error } = await supabase.rpc("night_game_reported", { p_other: otherId });
    if (error) {
      console.warn("night: free after report failed", error.message);
      return;
    }
    await pushCalled(service, (data ?? []) as CalledRow[], null, actorId);
  } catch (err) {
    console.warn("night: free after report failed", err);
  }
}
