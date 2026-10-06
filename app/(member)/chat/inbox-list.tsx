"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Search, Users } from "lucide-react";
import { Avatar } from "@/components/avatar";
import { SchoolMark } from "@/components/school-mark";
import { createClient } from "@/lib/supabase/client";
import { filterInbox, type InboxRow, type InboxTab } from "@/lib/chat";
import { buildInboxItems, type InboxItem, type SchoolRef } from "@/lib/inbox";
import { cn } from "@/lib/utils";

export type { InboxItem } from "@/lib/inbox";

const TABS: { value: InboxTab; label: string }[] = [
  { value: "all", label: "All" },
  { value: "direct", label: "Direct" },
  { value: "schools", label: "Schools" },
];

// Search + tabs are client state (no URL): the inbox is one screen and the
// filter should not survive a back navigation. The list itself is live: any
// message landing in one of your rooms re-fetches the inbox and the room
// moves to the top, like every chat app a student already uses.
export function InboxList({
  rows,
  meId,
  schoolsById,
}: {
  rows: InboxItem[];
  meId: string;
  schoolsById: Record<string, SchoolRef>;
}) {
  const [items, setItems] = useState<InboxItem[]>(rows);
  const [tab, setTab] = useState<InboxTab>("all");
  const [query, setQuery] = useState("");

  useEffect(() => {
    const supabase = createClient();
    let timer: ReturnType<typeof setTimeout> | undefined;
    // Debounced: a burst in a busy room costs one round trip, not ten.
    const refresh = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        supabase.rpc("list_my_channels").then(({ data }) => {
          if (data) setItems(buildInboxItems(data as InboxRow[], { meId, now: new Date(), schoolsById }));
        });
      }, 400);
    };
    // No filter on purpose: Realtime applies this subscriber's RLS, so only
    // rooms you are a member of ever arrive.
    const channel = supabase.channel("inbox");
    let active = true;
    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!active) return;
      if (session) await supabase.realtime.setAuth(session.access_token);
      channel
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, refresh)
        .subscribe();
    })();
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      active = false;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
      void supabase.removeChannel(channel);
    };
  }, [meId, schoolsById]);

  const visible = filterInbox(items, tab, query) as InboxItem[];
  return (
    <div className="flex flex-col gap-6">
      <label className="bg-card text-muted-foreground flex h-12 items-center gap-2.5 rounded-full px-4 shadow-[inset_0_0_0_1px_var(--hairline-row)]">
        <Search className="size-[17px] shrink-0" strokeWidth={1.7} />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search messages"
          placeholder="Search people and groups"
          className="text-foreground placeholder:text-muted-foreground min-w-0 flex-1 bg-transparent text-base outline-none"
        />
      </label>
      <div role="tablist" aria-label="Chat filter" className="border-hairline-divider flex gap-6 border-b">
        {TABS.map((t) => (
          <button
            key={t.value}
            role="tab"
            type="button"
            aria-selected={tab === t.value}
            onClick={() => setTab(t.value)}
            className={cn(
              "-mb-px h-11 border-b text-[15px]",
              tab === t.value ? "border-foreground text-foreground font-medium" : "text-tab-inactive border-transparent"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      <ul className="-mt-2 flex flex-col">
        {visible.length === 0 && (
          <li className="text-muted-foreground py-6 text-sm">
            {items.length === 0
              ? "No rooms yet — an admin needs to approve your account first."
              : tab === "direct" && query.trim() === ""
                ? "No direct messages yet. Start one from a player's profile or the pen icon."
                : "Nothing matches."}
          </li>
        )}
        {visible.map((row) => {
          const unread = Number(row.unread);
          return (
            <li key={row.id}>
              <Link
                href={`/chat/${row.id}`}
                className="press border-hairline-row flex items-center gap-3.5 border-b py-3.5"
              >
                <RoomAvatar row={row} />
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="flex items-baseline justify-between gap-2.5">
                    <span className={cn("truncate text-[15px]", unread > 0 ? "font-semibold" : "font-medium")}>
                      {row.title}
                    </span>
                    {row.stamp && (
                      <span
                        className={cn("shrink-0 text-[12px]", unread > 0 ? "text-brass" : "text-muted-foreground")}
                      >
                        {row.stamp}
                      </span>
                    )}
                  </span>
                  <span className="flex items-center justify-between gap-2.5">
                    <span
                      className={cn(
                        "truncate text-[13px]",
                        unread > 0 ? "text-foreground/85" : "text-muted-foreground"
                      )}
                    >
                      {row.preview ?? row.subtitle}
                    </span>
                    {unread > 0 && (
                      <span className="bg-brass text-background stat-number flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold">
                        {unread > 99 ? "99+" : unread}
                      </span>
                    )}
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// People are round; rooms are 14px-radius squares. A school room with a
// logo shows the logo itself; without one, the square carries the school's
// colour dot bottom-right.
function RoomAvatar({ row }: { row: InboxItem }) {
  if (row.type === "school" && row.school?.logo_url) {
    return (
      <span className="flex size-12 shrink-0 items-center justify-center">
        <SchoolMark school={row.school} size={44} />
      </span>
    );
  }
  if (row.type === "dm") {
    return (
      <Avatar
        person={{
          id: row.other_id ?? row.id,
          display_name: row.other_name,
          avatar_url: row.other_avatar_url,
          ball: row.other_ball,
        }}
        size="lg"
      />
    );
  }
  return (
    <span className="bg-secondary relative flex size-12 shrink-0 items-center justify-center rounded-[14px] text-[13px] font-medium shadow-[0_0_0_1px_var(--hairline-strong)]">
      {row.type === "everyone" ? (
        <Users className="size-5" strokeWidth={1.6} />
      ) : (
        row.name.slice(0, 3).toUpperCase()
      )}
      {row.type === "school" && (
        <span className="ring-background absolute -right-0.5 -bottom-0.5 flex rounded-full ring-[3px]">
          <SchoolMark school={row.school ? { ...row.school, logo_url: null } : null} size={12} />
        </span>
      )}
    </span>
  );
}
