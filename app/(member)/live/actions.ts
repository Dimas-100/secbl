"use server";

import { liveCommentPayload } from "@/lib/push";
import { notify } from "@/lib/push-send";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { shouldPushComment, validateComment, type LiveComment } from "@/lib/table-talk";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Table talk (spec 2026-10-20-table-talk §2): the comment goes in through the
// caller's own client, so RLS and the trigger (game still live, five per ten
// seconds) decide; then the two players hear about it — once per quiet spell.
export async function postLiveComment(input: {
  gameId: string;
  body: string;
}): Promise<{ comment: LiveComment } | { error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Please log in again." };
  const body = String(input.body ?? "");
  if (!UUID_RE.test(String(input.gameId))) return { error: "That game is over." };
  const problem = validateComment(body);
  if (problem) return { error: problem };

  const { data: comment, error } = await supabase
    .from("live_comments")
    .insert({ game_id: input.gameId, author_id: user.id, body: body.trim() })
    .select("id, game_id, author_id, body, created_at")
    .single();
  if (error || !comment) {
    const message = error?.message ?? "";
    if (/too quickly/i.test(message)) return { error: "Slow down — you're commenting too quickly." };
    if (/over/i.test(message)) return { error: "That game is over." };
    return { error: "Couldn't send — try again." };
  }

  try {
    const service = createServiceClient();
    const { data: previous } = await service
      .from("live_comments")
      .select("created_at")
      .eq("game_id", comment.game_id)
      .lt("id", comment.id)
      .order("id", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (shouldPushComment(previous?.created_at ?? null, new Date())) {
      const [{ data: game }, { data: author }] = await Promise.all([
        service.from("live_games").select("reporter_id, opponent_id").eq("id", comment.game_id).maybeSingle(),
        service.from("profiles").select("display_name").eq("id", user.id).single(),
      ]);
      if (game) {
        // The scorekeeper is on their board; the opponent watches the table.
        const send = (to: string, url: string) =>
          notify(service, {
            candidates: [to],
            category: "messages",
            excludeId: user.id,
            payload: liveCommentPayload({
              gameId: comment.game_id,
              authorName: author?.display_name ?? "A member",
              body: comment.body,
              url,
            }),
          });
        await Promise.all([
          send(game.reporter_id, "/matches/new"),
          send(game.opponent_id, `/live/${game.reporter_id}`),
        ]);
      }
    }
  } catch (err) {
    console.warn("live comment push failed", err);
  }
  return { comment: comment as LiveComment };
}
