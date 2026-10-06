import Link from "next/link";
import { redirect } from "next/navigation";
import { MessageCircle, Users } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { HeroBand } from "@/components/hero-band";
import { createClient } from "@/lib/supabase/server";
import { formatMessageTime, previewOf, sortInbox, type InboxRow } from "@/lib/chat";
import { CLUB_TIMEZONE } from "@/lib/events";
import { cn } from "@/lib/utils";
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

function RoomAvatar({ row }: { row: InboxRow }) {
  if (row.type === "everyone") {
    return (
      <span className="bg-primary text-primary-foreground flex size-11 shrink-0 items-center justify-center rounded-full">
        <Users className="size-5" />
      </span>
    );
  }
  if (row.type === "school") {
    return (
      <span className="bg-gold text-gold-foreground stat-number flex size-11 shrink-0 items-center justify-center rounded-full text-[11px]">
        {row.name.slice(0, 3)}
      </span>
    );
  }
  return (
    <span className="bg-accent text-accent-foreground flex size-11 shrink-0 items-center justify-center rounded-full text-base font-bold">
      {(row.other_name ?? "?")[0]?.toUpperCase()}
    </span>
  );
}

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

  const [{ data: inboxRows }, { data: members }] = await Promise.all([
    supabase.rpc("list_my_channels"),
    supabase
      .from("profiles")
      .select("id, display_name, schools(short_name)")
      .eq("status", "approved")
      .neq("id", user.id)
      .order("display_name"),
  ]);
  const rows = sortInbox((inboxRows ?? []) as InboxRow[]);
  const people = (members ?? []).map((m) => {
    const school = Array.isArray(m.schools) ? m.schools[0] : m.schools;
    return { id: m.id, display_name: m.display_name, school: school?.short_name ?? null };
  });
  const now = new Date();

  return (
    <main>
      <HeroBand title="Chat">
        <p className="mt-1 text-sm text-white/70">
          The whole league, your school, and one-on-ones.
        </p>
        <div className="mt-3">
          <NewMessageSheet people={people} />
        </div>
      </HeroBand>

      <div className="-mt-3 flex flex-col gap-4">
        {error && ERRORS[error] && (
          <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{ERRORS[error]}</p>
        )}
        <Card className="py-2">
          <CardContent className="divide-border/60 flex flex-col divide-y px-3">
            {rows.length === 0 && (
              <p className="text-muted-foreground p-3 text-sm">
                No rooms yet — an admin needs to approve your account first.
              </p>
            )}
            {rows.map((row) => {
              const title =
                row.type === "dm" ? (row.other_name ?? "Member") : row.name;
              const subtitle =
                row.type === "everyone"
                  ? `${row.member_count} members`
                  : row.type === "school"
                    ? `${row.name} room · ${row.member_count} members`
                    : "Direct message";
              const preview = row.last_body
                ? previewOf({
                    body: row.last_body,
                    senderName: row.last_sender_name,
                    mine: row.last_sender_id === user.id,
                    group: row.type !== "dm",
                  })
                : null;
              const unread = Number(row.unread);
              return (
                <Link
                  key={row.id}
                  href={`/chat/${row.id}`}
                  className="press hover:bg-muted flex min-h-16 items-center gap-3 rounded-lg px-2 py-3"
                >
                  <RoomAvatar row={row} />
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className={cn("truncate", unread > 0 ? "font-extrabold" : "font-semibold")}>
                        {title}
                      </span>
                      {row.last_at && (
                        <span className="text-muted-foreground shrink-0 text-[11px]">
                          {stamp(row.last_at, now)}
                        </span>
                      )}
                    </span>
                    <span className="flex items-center justify-between gap-2">
                      <span
                        className={cn(
                          "truncate text-sm",
                          unread > 0 ? "text-foreground font-medium" : "text-muted-foreground"
                        )}
                      >
                        {preview ?? subtitle}
                      </span>
                      {unread > 0 && (
                        <span className="bg-gold text-gold-foreground stat-number flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full px-1.5 text-[11px]">
                          {unread > 99 ? "99+" : unread}
                        </span>
                      )}
                    </span>
                  </span>
                </Link>
              );
            })}
          </CardContent>
        </Card>
        <p className="text-muted-foreground flex items-center gap-2 text-xs">
          <MessageCircle className="size-3.5" />
          Messages are plain text and visible to everyone in the room. DMs are private to the two of you.
        </p>
      </div>
    </main>
  );
}
