// Server only. Badge / streak / pass rows for a match that was just
// confirmed (spec §2). Service role: activity has no client write policy.
// Runs after the confirmation is saved and never throws — a missing moment
// must not fail a result, exactly like push.
import type { SupabaseClient } from "@supabase/supabase-js";
import { badgeMoment, passMoment, streakMoment } from "@/lib/activity";
import { clubWeekOf } from "@/lib/events";
import { levelFromXp, xpFromMatches } from "@/lib/levels";
import { fetchAllPages } from "@/lib/paging";
import { boardBefore, toRankRow, type RankRow } from "@/lib/ranking";
import type { StatMatch } from "@/lib/stats";
import { loadXpMatches } from "@/lib/xp-data";

export async function recordMatchMoments(service: SupabaseClient, matchId: string): Promise<void> {
  try {
    const { data: m } = await service
      .from("matches")
      .select("id, reporter_id, opponent_id, winner_id, status")
      .eq("id", matchId)
      .single();
    if (!m || m.status !== "confirmed") return;
    const winner = m.winner_id as string;
    const rows: Record<string, unknown>[] = [];

    // Badge: the title with this match differs from the title without it.
    for (const pid of [m.reporter_id as string, m.opponent_id as string]) {
      const all = await loadXpMatches(service, pid);
      const after = levelFromXp(xpFromMatches(pid, all, clubWeekOf).total);
      const before = levelFromXp(
        xpFromMatches(
          pid,
          all.filter((x) => x.id !== matchId),
          clubWeekOf
        ).total
      );
      const badge = badgeMoment(before, after);
      if (badge) rows.push({ kind: "badge", actor_id: pid, match_id: matchId, data: badge });
    }

    // Streak: the winner's run, newest first.
    const { data: hist } = await service
      .from("matches")
      .select("id, reporter_id, opponent_id, winner_id, reporter_score, opponent_score, confirmed_at")
      .eq("status", "confirmed")
      .or(`reporter_id.eq.${winner},opponent_id.eq.${winner}`)
      .order("confirmed_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(60);
    const streak = streakMoment((hist ?? []) as StatMatch[], winner);
    if (streak) rows.push({ kind: "streak", actor_id: winner, match_id: matchId, data: streak });

    // Pass: the ladder with this match taken back out (boardBefore) vs the
    // ladder now (lib/ranking.ts decides who holds a rank).
    const board = await fetchAllPages<RankRow>((from, to) =>
      service
        .from("leaderboard")
        .select("id, rating, wins, losses")
        .order("id")
        .range(from, to)
        .then(({ data }) => (data ?? []).map(toRankRow))
    );
    const { data: hrows } = await service
      .from("rating_history")
      .select("profile_id, rating_before")
      .eq("match_id", matchId);
    const beforeRating = new Map((hrows ?? []).map((h) => [h.profile_id as string, h.rating_before as number]));
    const loser = (m.reporter_id === winner ? m.opponent_id : m.reporter_id) as string;
    const before = boardBefore(board, winner, loser, beforeRating);
    const pass = passMoment(before, board, winner);
    if (pass) {
      rows.push({ kind: "pass", actor_id: winner, other_id: pass.otherId, match_id: matchId, data: { rank: pass.rank } });
    }

    if (rows.length > 0) {
      const { error } = await service.from("activity").insert(rows);
      if (error) console.warn("activity: insert failed", error.message);
    }
  } catch (err) {
    console.warn("activity: moments failed", err);
  }
}
