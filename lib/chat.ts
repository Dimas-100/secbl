// Pure messaging helpers, kept out of the components so vitest covers the
// rules (inbox order, merge/dedupe, day grouping) without DOM tooling.
import { CLUB_TIMEZONE } from "@/lib/events";

export type ChannelType = "everyone" | "school" | "dm";

export interface ChatMessage {
  id: number;
  channel_id: string;
  sender_id: string;
  body: string;
  created_at: string;
  // Set on optimistic rows (negative id) and echoed back by the insert so the
  // real row can replace its bubble.
  client_id?: string | null;
  failed?: boolean;
}

// One row of list_my_channels().
export interface InboxRow {
  id: string;
  type: ChannelType;
  name: string;
  school_id: string | null;
  other_id: string | null;
  other_name: string | null;
  other_avatar_url?: string | null;
  other_ball?: number | null;
  member_count: number;
  unread: number;
  last_message_id: number | null;
  last_body: string | null;
  last_sender_id: string | null;
  last_sender_name: string | null;
  last_at: string | null;
}

export type InboxTab = "all" | "direct" | "schools";

// What a row is called in the inbox: the other person for a DM, the room name otherwise.
export function inboxTitle(row: InboxRow): string {
  return row.type === "dm" ? (row.other_name ?? "Member") : row.name;
}

// Underline tabs + search on the inbox. "Schools" is every room (the league
// room and the school rooms); "Direct" is DMs. An empty query keeps all.
export function filterInbox(rows: InboxRow[], tab: InboxTab, query: string): InboxRow[] {
  const q = query.trim().toLowerCase();
  return rows.filter((r) => {
    if (tab === "direct" && r.type !== "dm") return false;
    if (tab === "schools" && r.type === "dm") return false;
    return q === "" || inboxTitle(r).toLowerCase().includes(q);
  });
}

// Mirrors get_or_create_dm's key so the client can predict a DM's identity.
export function dmKey(a: string, b: string): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

const TYPE_RANK: Record<ChannelType, number> = { everyone: 0, school: 1, dm: 2 };

// Group rooms are pinned (Everyone, then the school room); DMs follow by most
// recent activity, with never-used DMs last.
export function sortInbox(rows: InboxRow[]): InboxRow[] {
  return [...rows].sort((a, b) => {
    const rank = TYPE_RANK[a.type] - TYPE_RANK[b.type];
    if (rank !== 0) return rank;
    const at = a.last_at ? Date.parse(a.last_at) : -Infinity;
    const bt = b.last_at ? Date.parse(b.last_at) : -Infinity;
    return bt - at;
  });
}

// Confirmed rows sort by id; optimistic rows (negative id) stay at the end in
// send order. An incoming row with a matching client_id replaces its
// optimistic twin, and ids already present are dropped — Realtime delivers a
// sender's own insert too.
export function mergeMessages(have: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] {
  const byId = new Map<number, ChatMessage>();
  const pending: ChatMessage[] = [];
  for (const m of have) {
    if (m.id < 0) pending.push(m);
    else byId.set(m.id, m);
  }
  const confirmedClientIds = new Set<string>();
  for (const m of incoming) {
    if (m.id < 0) {
      pending.push(m);
      continue;
    }
    byId.set(m.id, m);
    if (m.client_id) confirmedClientIds.add(m.client_id);
  }
  for (const m of byId.values()) if (m.client_id) confirmedClientIds.add(m.client_id);
  const confirmed = [...byId.values()].sort((a, b) => a.id - b.id);
  const stillPending = pending.filter((m) => !m.client_id || !confirmedClientIds.has(m.client_id));
  return [...confirmed, ...stillPending];
}

const dayKeyFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: CLUB_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const dayLabelFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: CLUB_TIMEZONE,
  weekday: "short",
  month: "short",
  day: "numeric",
});

const timeFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: CLUB_TIMEZONE,
  hour: "numeric",
  minute: "2-digit",
});

function clubDayKey(iso: string): string {
  return dayKeyFormatter.format(new Date(iso));
}

function shiftDays(key: string, days: number): string {
  const d = new Date(`${key}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export interface DayGroup<T extends ChatMessage> {
  key: string;
  label: string;
  messages: T[];
}

// Splits a chronological message list by club calendar day. Today and
// yesterday get words; everything older gets a date.
export function groupByDay<T extends ChatMessage>(messages: T[], now: Date): DayGroup<T>[] {
  const todayKey = clubDayKey(now.toISOString());
  const yesterdayKey = shiftDays(todayKey, -1);
  const groups: DayGroup<T>[] = [];
  for (const m of messages) {
    const key = clubDayKey(m.created_at);
    const last = groups[groups.length - 1];
    if (last && last.key === key) {
      last.messages.push(m);
      continue;
    }
    const label =
      key === todayKey
        ? "Today"
        : key === yesterdayKey
          ? "Yesterday"
          : dayLabelFormatter.format(new Date(m.created_at));
    groups.push({ key, label, messages: [m] });
  }
  return groups;
}

export function formatMessageTime(iso: string): string {
  // Recent ICU builds use U+202F before the meridiem; normalize for stable output.
  return timeFormatter.format(new Date(iso)).replace(/[  ]/g, " ");
}

const PREVIEW_MAX = 60;

// The one-line inbox preview. Group rooms name the sender; a DM does not
// (the row already says who it is with) unless it was you.
export function previewOf(input: {
  body: string;
  senderName: string | null;
  mine: boolean;
  group: boolean;
}): string {
  const flat = input.body.replace(/\s*\n+\s*/g, " ").trim();
  const prefix = input.mine ? "You: " : input.group && input.senderName ? `${input.senderName}: ` : "";
  const text = `${prefix}${flat}`;
  if (text.length <= PREVIEW_MAX) return text;
  return `${text.slice(0, PREVIEW_MAX - 1)}…`;
}

// Sender display for a bubble: a fresh profile may not be in the cache yet.
export function senderLabel(name: string | undefined, mine: boolean): string {
  if (mine) return "You";
  return name ?? "Member";
}
