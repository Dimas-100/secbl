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

// What Recent on Home shows (owner's call, 2026-10-22): results, seasons and
// cups. Badges, streaks and joins are about one person and live on the You
// page and the result screen; a pass repeats the result above it; a cup's
// rounds repeat its bracket.
export const RECENT_KINDS = [
  "match",
  "season_opened",
  "season_week_left",
  "season_closed",
  "cup_started",
  "cup_won",
] as const satisfies readonly ActivityKind[];

const PERSON = "id, display_name, avatar_url, ball, schools(short_name)";
export const FEED_SELECT =
  `id, kind, actor_id, other_id, match_id, tournament_id, season_id, data, created_at, ` +
  `actor:profiles!activity_actor_id_fkey(${PERSON}), other:profiles!activity_other_id_fkey(${PERSON}), ` +
  `match:matches(id, reporter_id, opponent_id, winner_id, reporter_score, opponent_score, game_type, played_at, ` +
  `race_to, spot, spot_to, ` +
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

// --- Club events, told after they end ---------------------------------------
// A calendar event or a club night that has ended joins Recent among the
// stored rows. Worked out when Home loads (lib/recent-data), not stored: the
// upcoming event already has its own card above, so only the past ones show.

export interface Recap {
  key: string;
  // When it ended: where it sorts among the feed rows.
  at: string;
  kind: "event" | "night";
  title: string;
  meta: string;
  href: string;
}

// "Fall Social" · "Event · 8 going": the RSVPs say who meant to go, not who
// went, so the count stays in the RSVP's own word.
export function eventRecap(e: {
  id: string;
  title: string;
  starts_at: string;
  ends_at: string | null;
  rsvps: { response: string }[];
}): Recap {
  const going = e.rsvps.filter((r) => r.response === "going").length;
  return {
    key: `event:${e.id}`,
    at: e.ends_at ?? e.starts_at,
    kind: "event",
    title: e.title,
    meta: going > 0 ? `Event · ${going} going` : "Event",
    href: `/events/${e.id}`,
  };
}

export interface NightGame {
  reporter_id: string;
  opponent_id: string;
  created_at: string;
  reporter_school: string | null;
  opponent_school: string | null;
}

// "GSU club night" · "12 games · 7 players": the games logged between the
// night's opening and closing by two members of its school (only they can
// join its line). A night with no games is nothing to tell.
export function nightRecap(
  night: {
    id: string;
    school_id: string;
    opened_at: string;
    closed_at: string;
    schools?: { short_name: string } | { short_name: string }[] | null;
  },
  games: NightGame[]
): Recap | null {
  const from = Date.parse(night.opened_at);
  const to = Date.parse(night.closed_at);
  const played = games.filter((g) => {
    const at = Date.parse(g.created_at);
    return at >= from && at <= to && g.reporter_school === night.school_id && g.opponent_school === night.school_id;
  });
  if (played.length === 0) return null;
  const players = new Set(played.flatMap((g) => [g.reporter_id, g.opponent_id])).size;
  const school = one(night.schools)?.short_name;
  return {
    key: `night:${night.id}`,
    at: night.closed_at,
    kind: "night",
    title: school ? `${school} club night` : "Club night",
    meta: `${played.length} ${played.length === 1 ? "game" : "games"} · ${players} players`,
    href: "/night",
  };
}

export type RecentItem = { type: "row"; at: string; row: FeedRow } | { type: "recap"; at: string; recap: Recap };

// The feed rows and the recaps in one list, newest first. When the feed came
// back cut at its limit, the rows older than its last one were never fetched,
// so a recap from before then would sit among the wrong neighbours: it waits.
export function mergeRecent(rows: FeedRow[], recaps: Recap[], limit: number): RecentItem[] {
  const floor = rows.length >= limit && rows.length > 0 ? Date.parse(rows[rows.length - 1].created_at) : null;
  const items: RecentItem[] = [
    ...rows.map((row) => ({ type: "row" as const, at: row.created_at, row })),
    ...recaps.filter((r) => floor === null || Date.parse(r.at) > floor).map((recap) => ({ type: "recap" as const, at: recap.at, recap })),
  ];
  return items.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
}
