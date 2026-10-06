// Push notifications — the pure half (docs/superpowers/specs/2026-10-06-live-club-design.md §2).
// Who gets what, and the words. Sending lives in lib/push-send.ts (server only).

export type PushCategory = "messages" | "matches" | "events";

export interface Prefs {
  messages: boolean;
  matches: boolean;
  events: boolean;
}

export interface PushPayload {
  title: string;
  body: string;
  url: string;
  // Same tag → the newer notification replaces the older one on the phone.
  tag: string;
  category: PushCategory;
}

const BODY_MAX = 120;

// The server POSTs to whatever endpoint a member registers, so only the
// browsers' own push services are accepted — never an arbitrary host.
const PUSH_HOSTS = [
  /(^|\.)googleapis\.com$/,
  /(^|\.)google\.com$/,
  /(^|\.)push\.apple\.com$/,
  /(^|\.)push\.services\.mozilla\.com$/,
  /(^|\.)notify\.windows\.com$/,
];

export function isKnownPushEndpoint(endpoint: string): boolean {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;
  return PUSH_HOSTS.some((re) => re.test(url.hostname));
}

function first(name: string): string {
  return name.trim().split(/\s+/)[0] || name;
}

function flatten(body: string): string {
  const flat = body.replace(/\s*\n+\s*/g, " ").trim();
  return flat.length <= BODY_MAX ? flat : flat.slice(0, BODY_MAX);
}

// Missing prefs = everything on. The actor never hears about their own
// action, and a member who is no longer approved (suspended, say) hears
// nothing at all — their room memberships may still exist.
export function recipientsFor(
  candidates: { profile_id: string; prefs: Prefs | null; approved?: boolean }[],
  category: PushCategory,
  excludeId: string | null
): string[] {
  const out: string[] = [];
  for (const c of candidates) {
    if (c.profile_id === excludeId) continue;
    if (c.approved === false) continue;
    if (c.prefs && !c.prefs[category]) continue;
    if (!out.includes(c.profile_id)) out.push(c.profile_id);
  }
  return out;
}

export function messagePayload(input: {
  channelId: string;
  channelType: "everyone" | "school" | "dm";
  roomName: string;
  senderName: string;
  body: string;
}): PushPayload {
  return {
    title: input.channelType === "dm" ? input.senderName : `${input.roomName} · ${input.senderName}`,
    body: flatten(input.body),
    url: `/chat/${input.channelId}`,
    tag: `chat:${input.channelId}`,
    category: "messages",
  };
}

export function matchReportedPayload(input: {
  matchId: string;
  reporterName: string;
  reporterScore: number;
  opponentScore: number;
  gameLabel: string;
  format: string | null;
}): PushPayload {
  const parts = [`${first(input.reporterName)} ${input.reporterScore}–${input.opponentScore} you`, input.gameLabel];
  if (input.format) parts.push(input.format);
  return {
    title: `${input.reporterName} reported a game`,
    body: `${parts.join(" · ")}. Confirm?`,
    url: "/",
    tag: `match:${input.matchId}`,
    category: "matches",
  };
}

export function matchConfirmedPayload(input: {
  matchId: string;
  opponentName: string;
  won: boolean;
  myScore: number;
  theirScore: number;
  delta: number | null;
}): PushPayload {
  const result = `${input.won ? "Won" : "Lost"} ${input.myScore}–${input.theirScore}`;
  const delta =
    input.delta === null ? "" : ` · ${input.delta >= 0 ? "+" : "−"}${Math.abs(input.delta)} rating`;
  return {
    title: `${first(input.opponentName)} confirmed`,
    body: `${result}${delta}`,
    url: "/",
    tag: `match:${input.matchId}`,
    category: "matches",
  };
}

export function matchDisputedPayload(input: { matchId: string; opponentName: string }): PushPayload {
  return {
    title: `${first(input.opponentName)} disputed your report`,
    body: "The admins will sort it out.",
    url: "/",
    tag: `match:${input.matchId}`,
    category: "matches",
  };
}

export function eventPayload(input: { eventId: string; title: string; when: string; location: string | null }): PushPayload {
  return {
    title: `New event: ${input.title}`,
    body: input.location ? `${input.when} · ${input.location}` : input.when,
    url: `/events/${input.eventId}`,
    tag: `event:${input.eventId}`,
    category: "events",
  };
}
