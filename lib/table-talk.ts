// Table talk, pure half (docs/superpowers/specs/2026-10-20-table-talk-design.md §3):
// comments on a game being played right now.
import { isFresh } from "@/lib/live";

export interface LiveComment {
  id: number;
  game_id: string;
  author_id: string;
  body: string;
  created_at: string;
}

// The players' phones buzz at most once per quiet spell per game.
export const PUSH_QUIET_MS = 2 * 60_000;
const BODY_MAX = 280;

// Real comments sort by id; optimistic rows (negative id) stay at the end in
// send order. There is no client_id, so when the sender (`meId`) is given,
// the Realtime echo of their own comment replaces the oldest optimistic row
// with the same text — otherwise it would show twice until the action
// returns. The action's returned comment is deduped here by id.
export function mergeComments(have: LiveComment[], incoming: LiveComment[], meId?: string): LiveComment[] {
  const byId = new Map<number, LiveComment>();
  let pending: LiveComment[] = [];
  for (const m of have) {
    if (m.id < 0) pending.push(m);
    else byId.set(m.id, m);
  }
  for (const m of incoming) {
    if (m.id < 0) {
      if (!pending.some((p) => p.id === m.id)) pending.push(m);
      continue;
    }
    if (meId && m.author_id === meId && !byId.has(m.id)) {
      const twin = pending.find((p) => p.author_id === meId && p.body.trim() === m.body.trim());
      if (twin) pending = pending.filter((p) => p !== twin);
    }
    byId.set(m.id, m);
  }
  return [...[...byId.values()].sort((a, b) => a.id - b.id), ...pending];
}

// Names after a profiles fetch. Ids the fetch could not see (a member
// suspended mid-game, say) settle as "Member", so they are never fetched
// again; and nothing new means the same object, so an effect keyed on the
// names does not run again.
export function addNames(
  have: Record<string, string>,
  requested: string[],
  fetched: { id: string; display_name: string }[]
): Record<string, string> {
  const next = { ...have };
  let changed = false;
  for (const p of fetched) {
    if (next[p.id] !== p.display_name) {
      next[p.id] = p.display_name;
      changed = true;
    }
  }
  for (const id of requested) {
    if (!(id in next)) {
      next[id] = "Member";
      changed = true;
    }
  }
  return changed ? next : have;
}

// The one line under a live card and on the scoreboard strip.
export function talkSummary(
  comments: LiveComment[],
  names: Record<string, string>
): { count: number; latest: { name: string; body: string } | null } {
  const real = comments.filter((m) => m.id > 0);
  if (real.length === 0) return { count: 0, latest: null };
  const newest = real.reduce((a, b) => (b.id > a.id ? b : a));
  const name = (names[newest.author_id] ?? "").trim().split(/\s+/)[0] || "Member";
  return { count: real.length, latest: { name, body: newest.body } };
}

export function validateComment(body: string): string | null {
  const text = body.trim();
  if (text.length === 0) return "Write something first.";
  if (text.length > BODY_MAX) return "Keep it under 280 characters.";
  return null;
}

// A new opponent, or a board left untouched for hours, is a new game: its
// row (and thread) goes before the scoreboard publishes again.
export function shouldResetLive(
  existing: { updated_at: string; opponent_id: string } | null,
  opponentId: string,
  now: Date
): boolean {
  if (!existing) return false;
  return existing.opponent_id !== opponentId || !isFresh(existing.updated_at, now);
}

export function shouldPushComment(previousCommentAt: string | null, now: Date): boolean {
  return previousCommentAt === null || now.getTime() - Date.parse(previousCommentAt) >= PUSH_QUIET_MS;
}
