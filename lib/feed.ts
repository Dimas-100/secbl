// The activity feed, pure half (docs/superpowers/specs/2026-10-06-seasons-feed-live-design.md §2):
// the select shape, the words, the stamp. Rendering lives in
// components/activity-row.tsx.
import { roundName } from "@/lib/bracket";
import { CLUB_TIMEZONE, clubDateOf } from "@/lib/events";
import { formatClubDate } from "@/lib/season";
import type { ActivityKind } from "@/lib/types";

export interface FeedPerson {
  id: string;
  display_name: string;
  avatar_url: string | null;
  ball: number | null;
  schools?: { short_name: string } | { short_name: string }[] | null;
}

export interface FeedMatch {
  id: string;
  reporter_id: string;
  opponent_id: string;
  winner_id: string;
  reporter_score: number;
  opponent_score: number;
  game_type: string;
  played_at: string;
  race_to: number | null;
  spot: number;
  spot_to: string | null;
  rating_delta_reporter: number | null;
  rating_delta_opponent: number | null;
  reporter: FeedPerson | FeedPerson[] | null;
  opponent: FeedPerson | FeedPerson[] | null;
}

export interface FeedRow {
  id: string;
  kind: ActivityKind;
  actor_id: string | null;
  other_id: string | null;
  match_id: string | null;
  tournament_id: string | null;
  season_id: string | null;
  data: Record<string, unknown>;
  created_at: string;
  actor: FeedPerson | FeedPerson[] | null;
  other: FeedPerson | FeedPerson[] | null;
  match: FeedMatch | FeedMatch[] | null;
}

const PERSON = "id, display_name, avatar_url, ball, schools(short_name)";
export const FEED_SELECT =
  `id, kind, actor_id, other_id, match_id, tournament_id, season_id, data, created_at, ` +
  `actor:profiles!activity_actor_id_fkey(${PERSON}), other:profiles!activity_other_id_fkey(${PERSON}), ` +
  `match:matches(id, reporter_id, opponent_id, winner_id, reporter_score, opponent_score, game_type, played_at, ` +
  `race_to, spot, spot_to, rating_delta_reporter, rating_delta_opponent, ` +
  `reporter:profiles!matches_reporter_id_fkey(${PERSON}), opponent:profiles!matches_opponent_id_fkey(${PERSON}))`;

// PostgREST returns a to-one join as an object or a one-element array
// depending on how the relationship was inferred; callers never care which.
export function one<T>(v: T | T[] | null | undefined): T | null {
  if (v == null) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

export function schoolOf(p: FeedPerson | null): string | null {
  const s = one(p?.schools);
  return s?.short_name ?? null;
}

export function feedStamp(createdAt: string, now: Date): string {
  const ms = now.getTime() - Date.parse(createdAt);
  if (ms < 60_000) return "Just now";
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h`;
  const day = clubDateOf(createdAt);
  const yesterday = clubDateOf(new Date(now.getTime() - 86_400_000).toISOString());
  if (day === yesterday) return "Yesterday";
  return new Date(createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: CLUB_TIMEZONE });
}

const first = (p: FeedPerson | null) => (p?.display_name ?? "Member").trim().split(/\s+/)[0] || "Member";
const str = (v: unknown, fallback = "") => (typeof v === "string" ? v : fallback);
const num = (v: unknown, fallback = 0) => (typeof v === "number" ? v : fallback);

// The words for every non-match row. "You" where the viewer is the subject,
// as MatchRow does for results.
export function describeActivity(
  row: FeedRow,
  viewerId: string
): { title: string; meta: string | null; href: string | null } {
  const actor = one(row.actor);
  const other = one(row.other);
  const me = actor?.id === viewerId;
  const you = me ? "You" : first(actor);
  const d = row.data ?? {};
  const profile = actor ? `/players/${actor.id}` : null;
  const cup = row.tournament_id ? `/tournaments/${row.tournament_id}` : null;
  switch (row.kind) {
    case "badge":
      return { title: `${you} ${me ? "are" : "is"} now a ${str(d.title)}`, meta: `Level ${num(d.level)} · badge unlocked`, href: profile };
    case "streak":
      return { title: `${me ? "You're" : `${first(actor)} is`} on a ${num(d.length)}-game win streak`, meta: "Rating ladder", href: profile };
    case "pass": {
      const target = other?.id === viewerId ? "you" : first(other);
      return { title: `${you} passed ${target} for #${num(d.rank)}`, meta: "Rating ladder", href: "/leaderboard?tab=players" };
    }
    case "cup_started":
      return { title: `${str(d.name, "The cup")} is under way`, meta: `${num(d.players)} players · race to ${num(d.race_to)}`, href: cup };
    case "cup_round":
      return { title: `${str(d.name, "The cup")} · ${roundName(num(d.round, 1) - 1, num(d.rounds, 1))} complete`, meta: null, href: cup };
    case "cup_won":
      return { title: `${you} won the ${str(d.name, "cup")}`, meta: "Champion", href: cup };
    case "season_opened": {
      const ends = str(d.ends_on);
      return { title: `${str(d.name, "The season")} has begun`, meta: `3 pts a win, 1 a loss${ends ? ` · ends ${formatClubDate(ends)}` : ""}`, href: "/leaderboard?tab=season" };
    }
    case "season_week_left":
      return {
        title: `One week left in ${str(d.name, "the season")}`,
        meta: d.leader_name ? `${first({ id: "", display_name: str(d.leader_name), avatar_url: null, ball: null })} leads with ${num(d.leader_points)} pts` : null,
        href: "/leaderboard?tab=season",
      };
    case "season_closed":
      return {
        title: `${you} ${me ? "are" : "is"} the ${str(d.name)} champion`,
        meta: `${num(d.points)} pts · season closed`,
        href: row.season_id ? `/leaderboard?tab=season&season=${row.season_id}` : "/leaderboard?tab=season",
      };
    case "member_joined": {
      const school = schoolOf(actor);
      return { title: `${you} joined${school ? ` from ${school}` : ""}`, meta: null, href: profile };
    }
    case "match":
    default:
      return { title: "", meta: null, href: null };
  }
}
