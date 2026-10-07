"use server";

import { revalidatePath } from "next/cache";
import { fetchAllPages } from "@/lib/paging";
import { CAPTION_MAX, COMMENT_MAX, REPORTS_TO_HIDE, isOwnPostPath, normalizeText } from "@/lib/posts";
import { commentPayload, likePayload, reportPayload } from "@/lib/push";
import { notify } from "@/lib/push-send";
import { createClient, createServiceClient } from "@/lib/supabase/server";

type Result = { error: string | null };

// Every write here goes through the member's own client, so RLS is the
// authorization: own folder, own rows, visible posts. The service client is
// used only to read names and prefs for push.
async function me() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

function msg(error: { message: string } | null, fallback: string): string | null {
  if (!error) return null;
  if (error.message.includes("five posts a day")) return "Five posts a day is the limit.";
  if (error.message.includes("row-level security")) return "You can't do that.";
  return fallback;
}

// The photo is already in Storage (uploaded by the browser into the member's
// own folder); this records the post. If the insert is refused the object is
// removed so nothing is left behind.
export async function createPost(input: { imagePath: string; caption: string }): Promise<Result> {
  const { supabase, user } = await me();
  if (!user) return { error: "Please log in again." };
  if (!isOwnPostPath(input.imagePath, user.id)) return { error: "That photo isn't yours." };
  const caption = normalizeText(input.caption ?? "", CAPTION_MAX);
  const { error } = await supabase
    .from("posts")
    .insert({ author_id: user.id, image_path: input.imagePath, caption: caption || null });
  if (error) {
    await supabase.storage.from("posts").remove([input.imagePath]);
    return { error: msg(error, "Could not save the post.") };
  }
  revalidatePath("/");
  return { error: null };
}

// Author or admin (RLS). The feed row, likes, comments and reports cascade;
// the object goes last, and a failure there only leaks a file, never a row.
export async function deletePost(postId: string): Promise<Result> {
  const { supabase, user } = await me();
  if (!user) return { error: "Please log in again." };
  const { data: post } = await supabase.from("posts").select("image_path").eq("id", postId).maybeSingle();
  if (!post) return { error: "That post is gone already." };
  const { error, count } = await supabase.from("posts").delete({ count: "exact" }).eq("id", postId);
  if (error || !count) return { error: msg(error, "Could not delete the post.") ?? "You can't delete that post." };
  await supabase.storage.from("posts").remove([post.image_path as string]);
  revalidatePath("/");
  revalidatePath("/admin");
  return { error: null };
}

// Intent, not a toggle: a double tap sends the same intent twice and both
// land on the same state. Insert is idempotent (a duplicate is success).
export async function setLike(postId: string, liked: boolean): Promise<Result> {
  const { supabase, user } = await me();
  if (!user) return { error: "Please log in again." };
  if (!liked) {
    const { error } = await supabase.from("likes").delete().eq("post_id", postId).eq("profile_id", user.id);
    return { error: msg(error, "Could not unlike.") };
  }
  const { data: inserted, error } = await supabase
    .from("likes")
    .upsert({ post_id: postId, profile_id: user.id }, { onConflict: "post_id,profile_id", ignoreDuplicates: true })
    .select("post_id");
  if (error) return { error: msg(error, "Could not like that post.") };
  // No row came back: it was already liked, and the author already heard.
  if (!inserted || inserted.length === 0) return { error: null };
  // Tell the author, if they want to hear it.
  const service = createServiceClient();
  const [{ data: post }, { data: liker }] = await Promise.all([
    service.from("posts").select("author_id").eq("id", postId).single(),
    service.from("profiles").select("display_name").eq("id", user.id).single(),
  ]);
  if (post && post.author_id !== user.id) {
    await notify(service, {
      candidates: [post.author_id],
      category: "social",
      excludeId: user.id,
      payload: likePayload({ postId, likerName: liker?.display_name ?? "Someone" }),
    });
  }
  return { error: null };
}

export async function addComment(postId: string, body: string): Promise<Result> {
  const { supabase, user } = await me();
  if (!user) return { error: "Please log in again." };
  const text = normalizeText(body ?? "", COMMENT_MAX);
  if (!text) return { error: "Say something first." };
  const { error } = await supabase.from("comments").insert({ post_id: postId, author_id: user.id, body: text });
  if (error) return { error: msg(error, "Could not post the comment.") };
  const service = createServiceClient();
  const [{ data: post }, { data: commenter }] = await Promise.all([
    service.from("posts").select("author_id").eq("id", postId).single(),
    service.from("profiles").select("display_name").eq("id", user.id).single(),
  ]);
  if (post && post.author_id !== user.id) {
    await notify(service, {
      candidates: [post.author_id],
      category: "social",
      excludeId: user.id,
      payload: commentPayload({ postId, commenterName: commenter?.display_name ?? "Someone", body: text }),
    });
  }
  revalidatePath("/");
  return { error: null };
}

export async function deleteComment(commentId: string): Promise<Result> {
  const { supabase, user } = await me();
  if (!user) return { error: "Please log in again." };
  const { error, count } = await supabase.from("comments").delete({ count: "exact" }).eq("id", commentId);
  if (error || !count) return { error: "You can't delete that comment." };
  revalidatePath("/");
  return { error: null };
}

// One report per member per post; the third hides it (trigger). Admins hear
// about every report.
export async function reportPost(postId: string, reason: string): Promise<Result> {
  const { supabase, user } = await me();
  if (!user) return { error: "Please log in again." };
  const text = normalizeText(reason ?? "", 200);
  const { error } = await supabase
    .from("post_reports")
    .insert({ post_id: postId, reporter_id: user.id, reason: text || null });
  if (error) {
    if (error.code === "23505") return { error: "You already reported this post." };
    return { error: msg(error, "Could not send the report.") };
  }
  const service = createServiceClient();
  const [{ count }, admins] = await Promise.all([
    service.from("post_reports").select("post_id", { count: "exact", head: true }).eq("post_id", postId),
    fetchAllPages<{ id: string }>((from, to) =>
      service
        .from("profiles")
        .select("id")
        .eq("role", "admin")
        .eq("status", "approved")
        .order("id")
        .range(from, to)
        .then(({ data }) => (data ?? []) as { id: string }[])
    ),
  ]);
  await notify(service, {
    candidates: admins.map((a) => a.id),
    category: "league",
    excludeId: user.id,
    payload: reportPayload({ postId, count: Math.min(count ?? 1, REPORTS_TO_HIDE) }),
  });
  revalidatePath("/");
  revalidatePath("/admin");
  return { error: null };
}

export async function adminClearPost(postId: string): Promise<Result> {
  const { supabase, user } = await me();
  if (!user) return { error: "Please log in again." };
  const { error } = await supabase.rpc("clear_post", { p_post_id: postId });
  if (error) return { error: error.message };
  revalidatePath("/");
  revalidatePath("/admin");
  return { error: null };
}
