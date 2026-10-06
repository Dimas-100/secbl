import { redirect } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { createClient } from "@/lib/supabase/server";
import { formatMessageTime, inboxTitle, previewOf, sortInbox, type InboxRow } from "@/lib/chat";
import { CLUB_TIMEZONE } from "@/lib/events";
import { InboxList, type InboxItem } from "./inbox-list";
import { NewMessageSheet } from "./new-message-sheet";

// Inbox rows show the time for today's messages and a short date otherwise.
function stamp(iso: string, now: Date): string {
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

const ERRORS: Record<string, string> = {
  pick: "Pick a member to message.",
  unavailable: "That member can't be messaged right now.",
  failed: "Couldn't start that conversation. Try again.",
};

export default async function ChatPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: inboxRows }, { data: members }, { data: schools }] = await Promise.all([
    supabase.rpc("list_my_channels"),
    supabase
      .from("profiles")
      .select("id, display_name, schools(short_name)")
      .eq("status", "approved")
      .neq("id", user.id)
      .order("display_name"),
    supabase.from("schools").select("id, primary_color"),
  ]);
  const colorById = Object.fromEntries((schools ?? []).map((s) => [s.id, s.primary_color as string | null]));
  const now = new Date();
  const items: InboxItem[] = sortInbox((inboxRows ?? []) as InboxRow[]).map((row) => ({
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
          mine: row.last_sender_id === user.id,
          group: row.type !== "dm",
        })
      : null,
    stamp: row.last_at ? stamp(row.last_at, now) : null,
    color: row.school_id ? (colorById[row.school_id] ?? null) : null,
  }));
  const people = (members ?? []).map((m) => {
    const school = Array.isArray(m.schools) ? m.schools[0] : m.schools;
    return { id: m.id, display_name: m.display_name, school: school?.short_name ?? null };
  });

  return (
    <main className="flex flex-col gap-6">
      <PageHeader title="Messages" back="/" trailing={<NewMessageSheet people={people} />} />
      {error && ERRORS[error] && (
        <p className="bg-destructive/10 text-destructive rounded-2xl p-3 text-sm">{ERRORS[error]}</p>
      )}
      <InboxList rows={items} />
      <p className="text-muted-foreground text-[12px]">
        Messages are plain text and visible to everyone in the room. DMs are private to the two of you.
      </p>
    </main>
  );
}
