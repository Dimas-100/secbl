// The inbox's display rows, built the same way whether the page rendered them
// on the server or the client re-fetched them after a Realtime insert — so a
// row that just arrived looks exactly like one that was there on load.
import { formatMessageTime, inboxTitle, previewOf, sortInbox, type InboxRow } from "@/lib/chat";
import { CLUB_TIMEZONE } from "@/lib/events";

export interface SchoolRef {
  id: string;
  short_name: string;
  primary_color: string | null;
  logo_url: string | null;
}

export type InboxItem = InboxRow & {
  title: string;
  subtitle: string;
  preview: string | null;
  stamp: string | null;
  school: SchoolRef | null;
};

// The time for today's messages, a short date otherwise.
export function inboxStamp(iso: string, now: Date): string {
  const sameDay =
    new Date(iso).toLocaleDateString("en-CA", { timeZone: CLUB_TIMEZONE }) ===
    now.toLocaleDateString("en-CA", { timeZone: CLUB_TIMEZONE });
  if (sameDay) return formatMessageTime(iso);
  return new Date(iso).toLocaleDateString("en-US", {
    timeZone: CLUB_TIMEZONE,
    month: "short",
    day: "numeric",
  });
}

export function buildInboxItems(
  rows: InboxRow[],
  ctx: { meId: string; now: Date; schoolsById: Record<string, SchoolRef> }
): InboxItem[] {
  return sortInbox(rows).map((row) => ({
    ...row,
    title: inboxTitle(row),
    subtitle:
      row.type === "everyone"
        ? `${row.member_count} members`
        : row.type === "school"
          ? `${row.name} room · ${row.member_count} members`
          : "Direct message",
    preview: row.last_body
      ? previewOf({
          body: row.last_body,
          senderName: row.last_sender_name,
          mine: row.last_sender_id === ctx.meId,
          group: row.type !== "dm",
        })
      : null,
    stamp: row.last_at ? inboxStamp(row.last_at, ctx.now) : null,
    school: row.school_id ? (ctx.schoolsById[row.school_id] ?? null) : null,
  }));
}
