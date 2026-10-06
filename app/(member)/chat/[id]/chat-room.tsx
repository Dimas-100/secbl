"use client";

import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowUp, ChevronLeft, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  formatMessageTime,
  groupByDay,
  mergeMessages,
  senderLabel,
  type ChannelType,
  type ChatMessage,
} from "@/lib/chat";
import { cn } from "@/lib/utils";
import { notifyMessage } from "@/app/(member)/chat/actions";

export const PAGE_SIZE = 50;
const MESSAGE_COLUMNS = "id, channel_id, sender_id, body, client_id, created_at";

// The room takes over the whole screen — header and tab bar included — so the
// composer owns the bottom edge the way every chat app a student already uses
// does. Server-rendered first page; everything after that is live.
export function ChatRoom({
  channelId,
  channelType,
  title,
  subtitle,
  meId,
  initialMessages,
  initialNames,
}: {
  channelId: string;
  channelType: ChannelType;
  title: string;
  subtitle: string;
  meId: string;
  initialMessages: ChatMessage[];
  initialNames: Record<string, string>;
}) {
  const supabase = createClient();
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [names, setNames] = useState<Record<string, string>>(initialNames);
  const [draft, setDraft] = useState("");
  const [hasMore, setHasMore] = useState(initialMessages.length === PAGE_SIZE);
  const [loadingMore, setLoadingMore] = useState(false);
  // null until the first subscription succeeds, so the header never says
  // "reconnecting" before it has connected once.
  const [live, setLive] = useState<boolean | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const stickToBottom = useRef(true);
  // Optimistic rows get descending negative ids so they sort in send order
  // (a counter, not Date.now(): the React compiler's purity lint rejects the
  // clock inside a component even in an event handler).
  const tempCounter = useRef(0);
  const latestIdRef = useRef(initialMessages.reduce((max, m) => Math.max(max, m.id), 0));

  const isGroup = channelType !== "dm";

  const absorb = useCallback((incoming: ChatMessage[]) => {
    setMessages((have) => mergeMessages(have, incoming));
    for (const m of incoming) if (m.id > latestIdRef.current) latestIdRef.current = m.id;
  }, []);

  // Fill in names for senders we have not seen (someone who joined after the
  // page rendered, say). RLS lets any approved member read approved profiles.
  useEffect(() => {
    const missing = [...new Set(messages.map((m) => m.sender_id))].filter((id) => !names[id]);
    if (missing.length === 0) return;
    let cancelled = false;
    supabase
      .from("profiles")
      .select("id, display_name")
      .in("id", missing)
      .then(({ data }) => {
        if (cancelled || !data) return;
        setNames((have) => {
          const next = { ...have };
          for (const p of data) next[p.id] = p.display_name;
          return next;
        });
      });
    return () => {
      cancelled = true;
    };
  }, [messages, names, supabase]);

  const markRead = useCallback(() => {
    if (document.visibilityState !== "visible") return;
    // A PostgREST builder only sends its request once awaited/then'd — a bare
    // `void supabase.rpc(...)` silently does nothing.
    supabase
      .rpc("mark_channel_read", { p_channel_id: channelId })
      .then(({ error }) => {
        if (error) console.warn("mark_channel_read failed", error.message);
      });
  }, [supabase, channelId]);

  // Anything newer than what we know about: used to close the gap between the
  // server render and the subscription, and again after any reconnect.
  const refetchNewer = useCallback(async () => {
    const { data } = await supabase
      .from("messages")
      .select(MESSAGE_COLUMNS)
      .eq("channel_id", channelId)
      .gt("id", latestIdRef.current)
      .order("id", { ascending: true })
      .limit(200);
    if (data && data.length > 0) absorb(data as ChatMessage[]);
  }, [supabase, channelId, absorb]);

  useEffect(() => {
    let subscribedBefore = false;
    let active = true;
    const channel = supabase.channel(`room:${channelId}`);

    (async () => {
      // Realtime needs the user's token to evaluate RLS for this subscriber.
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!active) return;
      if (session) await supabase.realtime.setAuth(session.access_token);
      channel
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "messages", filter: `channel_id=eq.${channelId}` },
          (payload) => {
            const row = payload.new as ChatMessage;
            absorb([row]);
            if (row.sender_id !== meId) markRead();
          }
        )
        .subscribe((status) => {
          if (status === "SUBSCRIBED") {
            setLive(true);
            // First time: catch anything posted while the page was loading.
            // Later times: a reconnect, so catch everything we missed.
            void refetchNewer();
            subscribedBefore = true;
          } else if (subscribedBefore && (status === "CLOSED" || status === "CHANNEL_ERROR" || status === "TIMED_OUT")) {
            setLive(false);
          }
        });
    })();

    const onVisible = () => {
      if (document.visibilityState === "visible") {
        void refetchNewer();
        markRead();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    markRead();

    return () => {
      active = false;
      document.removeEventListener("visibilitychange", onVisible);
      void supabase.removeChannel(channel);
    };
  }, [supabase, channelId, meId, absorb, markRead, refetchNewer]);

  // Keep the newest message in view unless the reader has scrolled up to read
  // history — then leave them alone.
  const onScroll = () => {
    const el = listRef.current;
    if (!el) return;
    stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };
  useLayoutEffect(() => {
    const el = listRef.current;
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [messages]);

  // iOS does not shrink the layout viewport for the keyboard; the visual
  // viewport is the truth. Size the room to it so the composer stays visible.
  const [viewport, setViewport] = useState<{ height: number; top: number } | null>(null);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => setViewport({ height: vv.height, top: vv.offsetTop });
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);

  const loadEarlier = async () => {
    const el = listRef.current;
    const oldest = messages.find((m) => m.id > 0);
    if (!oldest || loadingMore) return;
    setLoadingMore(true);
    const before = el ? el.scrollHeight - el.scrollTop : 0;
    const { data } = await supabase
      .from("messages")
      .select(MESSAGE_COLUMNS)
      .eq("channel_id", channelId)
      .lt("id", oldest.id)
      .order("id", { ascending: false })
      .limit(PAGE_SIZE);
    const older = ((data ?? []) as ChatMessage[]).slice().reverse();
    stickToBottom.current = false;
    setMessages((have) => mergeMessages(have, older));
    setHasMore(older.length === PAGE_SIZE);
    setLoadingMore(false);
    // Keep the message the reader was looking at where it was.
    requestAnimationFrame(() => {
      if (el) el.scrollTop = el.scrollHeight - before;
    });
  };

  const send = async (bodyOverride?: string, clientIdOverride?: string) => {
    const body = (bodyOverride ?? draft).trim();
    if (!body) return;
    const client_id = clientIdOverride ?? crypto.randomUUID();
    setSendError(null);
    if (!bodyOverride) {
      setDraft("");
      if (textareaRef.current) textareaRef.current.style.height = "auto";
    }
    stickToBottom.current = true;
    const optimistic: ChatMessage = {
      id: -(++tempCounter.current),
      channel_id: channelId,
      sender_id: meId,
      body,
      client_id,
      created_at: new Date().toISOString(),
    };
    setMessages((have) =>
      mergeMessages(
        have.filter((m) => m.client_id !== client_id),
        [optimistic]
      )
    );
    const { data, error } = await supabase
      .from("messages")
      .insert({ channel_id: channelId, sender_id: meId, body, client_id })
      .select(MESSAGE_COLUMNS)
      .single();
    if (error || !data) {
      setMessages((have) =>
        have.map((m) => (m.client_id === client_id && m.id < 0 ? { ...m, failed: true } : m))
      );
      setSendError(friendlyError(error?.message));
      return;
    }
    absorb([data as ChatMessage]);
    // Fire and forget: the push is a courtesy, never part of sending.
    void notifyMessage((data as ChatMessage).id);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void send();
    }
  };

  const autosize = (el: HTMLTextAreaElement) => {
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  };

  const groups = groupByDay(messages, new Date());
  const canSend = draft.trim().length > 0;

  return (
    <div
      className="bg-background fixed inset-x-0 z-20 flex flex-col"
      style={
        viewport
          ? { top: viewport.top, height: viewport.height }
          : { top: 0, height: "100dvh" }
      }
    >
      <header className="bg-background border-hairline-divider flex items-center gap-2 border-b px-2 pt-[calc(0.5rem+env(safe-area-inset-top))] pb-2">
        <Link
          href="/chat"
          aria-label="Back to chat"
          className="flex size-11 items-center justify-center rounded-full hover:bg-accent"
        >
          <ChevronLeft className="size-6" />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-base font-semibold">{title}</h1>
          <p className="text-muted-foreground flex items-center gap-1 truncate text-[11px]">
            {isGroup && <Users className="size-3" />}
            {subtitle}
            {live === false && <span className="text-brass"> · reconnecting…</span>}
          </p>
        </div>
      </header>

      <div ref={listRef} onScroll={onScroll} className="flex-1 overflow-y-auto px-3 py-3">
        {hasMore && (
          <div className="flex justify-center pb-3">
            <button
              type="button"
              onClick={loadEarlier}
              disabled={loadingMore}
              className="bg-card text-muted-foreground rounded-full px-4 py-2 text-xs font-semibold shadow-[inset_0_0_0_1px_var(--hairline-row)] disabled:opacity-50"
            >
              {loadingMore ? "Loading…" : "Load earlier messages"}
            </button>
          </div>
        )}
        {messages.length === 0 && (
          <div className="text-muted-foreground flex h-full flex-col items-center justify-center gap-2 text-center text-sm">
            <span className="text-4xl">🎱</span>
            <p className="font-semibold">Nothing here yet.</p>
            <p>{isGroup ? "Break the silence." : "Say hi."}</p>
          </div>
        )}
        {groups.map((group) => (
          <div key={group.key} className="flex flex-col gap-1.5">
            <div className="my-3 flex items-center justify-center">
              <span className="bg-muted text-muted-foreground rounded-full px-3 py-0.5 text-[10px] font-bold tracking-[0.12em] uppercase">
                {group.label}
              </span>
            </div>
            {group.messages.map((m, i) => {
              const mine = m.sender_id === meId;
              const prev = group.messages[i - 1];
              const startsRun = !prev || prev.sender_id !== m.sender_id;
              const pending = m.id < 0 && !m.failed;
              return (
                <div
                  key={m.client_id ?? m.id}
                  className={cn("flex flex-col", mine ? "items-end" : "items-start", !startsRun && "-mt-0.5")}
                >
                  {startsRun && !mine && isGroup && (
                    <span className="text-muted-foreground mb-0.5 px-2 text-[11px] font-semibold">
                      {senderLabel(names[m.sender_id], mine)}
                    </span>
                  )}
                  <button
                    type="button"
                    disabled={!m.failed}
                    onClick={() => m.failed && void send(m.body, m.client_id ?? undefined)}
                    className={cn(
                      "max-w-[82%] rounded-2xl px-3.5 py-2 text-left text-[15px] leading-snug break-words whitespace-pre-wrap",
                      mine
                        ? "bg-primary text-primary-foreground rounded-br-md"
                        : "bg-card text-card-foreground rounded-bl-md shadow-[inset_0_0_0_1px_var(--hairline-row)]",
                      pending && "opacity-60",
                      m.failed && "ring-destructive ring-2"
                    )}
                  >
                    {m.body}
                  </button>
                  <span className="text-muted-foreground px-2 pt-0.5 text-[10px]">
                    {m.failed
                      ? "Not sent · tap to retry"
                      : pending
                        ? "Sending…"
                        : formatMessageTime(m.created_at)}
                  </span>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
        className="bg-card flex items-end gap-2 border-t px-3 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))]"
      >
        <textarea
          ref={textareaRef}
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            autosize(e.target);
          }}
          onKeyDown={onKeyDown}
          rows={1}
          maxLength={2000}
          placeholder={isGroup ? `Message ${title}` : `Message ${title.split(" ")[0]}`}
          aria-label="Message"
          className="bg-muted placeholder:text-muted-foreground max-h-[140px] min-h-11 flex-1 resize-none rounded-2xl px-4 py-2.5 text-base outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        />
        <button
          type="submit"
          disabled={!canSend}
          aria-label="Send"
          className="bg-primary text-primary-foreground flex size-11 shrink-0 items-center justify-center rounded-full transition-opacity disabled:opacity-40"
        >
          <ArrowUp className="size-5" strokeWidth={3} />
        </button>
      </form>
      {sendError && (
        <p role="alert" className="bg-destructive/10 text-destructive px-4 py-2 text-center text-xs">
          {sendError}
        </p>
      )}
    </div>
  );
}

function friendlyError(message: string | undefined): string {
  if (!message) return "Couldn't send — check your connection and tap the message to retry.";
  if (/too quickly/i.test(message)) return "Slow down — you're sending messages too quickly.";
  if (/row-level security|policy/i.test(message)) return "You can't post in this room.";
  return "Couldn't send — tap the message to retry.";
}
