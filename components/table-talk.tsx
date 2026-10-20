"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ArrowUp } from "lucide-react";
import { Avatar } from "@/components/avatar";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";
import { addNames, mergeComments, validateComment, type LiveComment } from "@/lib/table-talk";
import { cn } from "@/lib/utils";
import { postLiveComment } from "@/app/(member)/live/actions";

const COLUMNS = "id, game_id, author_id, body, created_at";

// Table talk for one live game (spec 2026-10-20-table-talk §5): loads the
// newest comments, follows new ones over Realtime, and sends optimistically.
// One hook, so the spectator page and the scoreboard sheet behave the same.
// A null game (no opponent picked yet, or the board was cleared) is no talk.
export function useLiveComments(
  gameId: string | null,
  meId: string,
  initial: LiveComment[],
  initialNames: Record<string, string>
) {
  const supabase = createClient();
  // The comments belong to the game they were loaded for; a different game
  // starts from nothing without a reset inside an effect.
  const [state, setState] = useState<{ gameId: string | null; comments: LiveComment[] }>({
    gameId,
    comments: initial,
  });
  const [names, setNames] = useState<Record<string, string>>(initialNames);
  const tempCounter = useRef(0);
  const comments = useMemo(() => (state.gameId === gameId ? state.comments : []), [state, gameId]);

  // meId lets the Realtime echo of your own comment replace its optimistic row.
  const absorb = useCallback(
    (forGame: string, incoming: LiveComment[]) => {
      setState((s) => ({
        gameId: forGame,
        comments: mergeComments(s.gameId === forGame ? s.comments : [], incoming, meId),
      }));
    },
    [meId]
  );

  useEffect(() => {
    if (!gameId) return;
    let active = true;
    // Unique topic per mount: the client is a singleton and removeChannel is async.
    const channel = supabase.channel(`talk:${gameId}:${crypto.randomUUID()}`);
    const load = async () => {
      const { data } = await supabase
        .from("live_comments")
        .select(COLUMNS)
        .eq("game_id", gameId)
        .order("id", { ascending: false })
        .limit(50);
      if (active && data) absorb(gameId, (data as LiveComment[]).reverse());
    };
    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!active) return;
      // Realtime needs the user's token to evaluate RLS for this subscriber.
      if (session) await supabase.realtime.setAuth(session.access_token);
      channel
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "live_comments", filter: `game_id=eq.${gameId}` },
          (payload) => absorb(gameId, [payload.new as LiveComment])
        )
        // Every (re)connect closes the gap since the last load.
        .subscribe((status) => {
          if (status === "SUBSCRIBED") void load();
        });
    })();
    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  }, [supabase, gameId, absorb]);

  // Names for authors we have not seen (someone who joined the talk later).
  useEffect(() => {
    const missing = [...new Set(comments.map((c) => c.author_id))].filter((id) => !names[id]);
    if (missing.length === 0) return;
    let cancelled = false;
    supabase
      .from("profiles")
      .select("id, display_name")
      .in("id", missing)
      .then(({ data }) => {
        if (cancelled) return;
        // Unreadable authors settle as "Member", so this never refetches them.
        setNames((have) => addNames(have, missing, data ?? []));
      });
    return () => {
      cancelled = true;
    };
  }, [comments, names, supabase]);

  const send = useCallback(
    async (body: string): Promise<string | null> => {
      if (!gameId) return "That game is over.";
      const problem = validateComment(body);
      if (problem) return problem;
      tempCounter.current -= 1;
      const tempId = tempCounter.current;
      absorb(gameId, [{ id: tempId, game_id: gameId, author_id: meId, body: body.trim(), created_at: new Date().toISOString() }]);
      let res: Awaited<ReturnType<typeof postLiveComment>>;
      try {
        res = await postLiveComment({ gameId, body });
      } catch {
        // The request never made it (pool-hall signal): drop the ghost row
        // and say so; the composer keeps the draft for a retry.
        res = { error: "Couldn't send — try again." };
      }
      setState((s) =>
        s.gameId !== gameId
          ? s
          : {
              gameId,
              comments: mergeComments(
                s.comments.filter((c) => c.id !== tempId),
                "comment" in res ? [res.comment] : []
              ),
            }
      );
      return "error" in res ? res.error : null;
    },
    [gameId, meId, absorb]
  );

  return { comments, names, send };
}

// The thread and its composer. Deliberately no <form>: on the scoreboard this
// renders in a sheet inside the report form, and a nested form's submit would
// bubble (through the portal) into the report.
export function TableTalk({
  meId,
  comments,
  names,
  onSend,
}: {
  meId: string;
  comments: LiveComment[];
  names: Record<string, string>;
  onSend: (body: string) => Promise<string | null>;
}) {
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [comments.length]);

  async function submit() {
    const body = draft;
    if (sending || body.trim().length === 0) return;
    setDraft("");
    setError(null);
    setSending(true);
    const problem = await onSend(body);
    setSending(false);
    if (problem) {
      setError(problem);
      setDraft(body);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div ref={listRef} className="flex max-h-[50vh] flex-col gap-3 overflow-y-auto overscroll-contain">
        {comments.length === 0 ? (
          <p className="text-muted-foreground py-6 text-center text-sm">Say something to the table.</p>
        ) : (
          comments.map((c) => {
            const name = names[c.author_id] ?? null;
            return (
              <div key={c.id} className={cn("flex items-start gap-2.5", c.id < 0 && "opacity-60")}>
                <Avatar person={{ id: c.author_id, display_name: name }} size="xs" />
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-muted-foreground text-[12px]">
                    {c.author_id === meId ? "You" : ((name ?? "").trim().split(/\s+/)[0] || "Member")}
                  </span>
                  <span className="text-[15px] break-words">{c.body}</span>
                </div>
              </div>
            );
          })
        )}
      </div>
      <div className="flex items-center gap-2">
        <Input
          aria-label="Say something to the table"
          placeholder="Say something to the table"
          value={draft}
          maxLength={280}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void submit();
            }
          }}
          className="h-11 flex-1"
        />
        <button
          type="button"
          aria-label="Send comment"
          disabled={sending || draft.trim().length === 0}
          onClick={() => void submit()}
          className="bg-primary text-primary-foreground press flex size-11 shrink-0 items-center justify-center rounded-full disabled:opacity-40"
        >
          <ArrowUp className="size-5" strokeWidth={2} />
        </button>
      </div>
      {error && (
        <p role="alert" className="text-destructive text-[13px]">
          {error}
        </p>
      )}
    </div>
  );
}

// The spectator page's thread: the hook and the view together.
export function LiveTalk({
  gameId,
  meId,
  initial,
  initialNames,
}: {
  gameId: string;
  meId: string;
  initial: LiveComment[];
  initialNames: Record<string, string>;
}) {
  const talk = useLiveComments(gameId, meId, initial, initialNames);
  return <TableTalk meId={meId} comments={talk.comments} names={talk.names} onSend={talk.send} />;
}
