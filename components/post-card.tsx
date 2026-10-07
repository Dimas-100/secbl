/* eslint-disable @next/next/no-img-element */
"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Heart, MoreHorizontal, Send } from "lucide-react";
import { Avatar } from "@/components/avatar";
import type { FeedPerson } from "@/lib/feed";
import { COMMENT_MAX, likeState, visibleComments } from "@/lib/posts";
import { cn } from "@/lib/utils";
import { addComment, deleteComment, deletePost, reportPost, toggleLike } from "@/app/(member)/posts/actions";

export interface PostCardComment {
  id: string;
  author_id: string;
  body: string;
  created_at: string;
  author: FeedPerson | null;
}

export interface PostCardData {
  id: string;
  author_id: string;
  caption: string | null;
  signedUrl: string | null;
  likes: { profile_id: string }[];
  comments: PostCardComment[];
}

// A photo post in the feed: who, when, the caption, the photo, a like with
// its count, the last few comments and a box to add one. The author or an
// admin can delete; everyone else can report.
export function PostCard({
  post,
  author,
  stamp,
  meId,
  isAdmin,
}: {
  post: PostCardData;
  author: FeedPerson | null;
  stamp: string;
  meId: string;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const initial = likeState(post.likes, meId);
  const [liked, setLiked] = useState(initial.mine);
  const [count, setCount] = useState(initial.count);
  const [showAll, setShowAll] = useState(false);
  const [draft, setDraft] = useState("");
  const [menu, setMenu] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const mine = post.author_id === meId;
  const { shown, hidden } = visibleComments(post.comments, showAll);
  const name = mine ? "You" : (author?.display_name ?? "Member");

  function like() {
    // Optimistic: the heart flips now, the server catches up.
    const next = !liked;
    setLiked(next);
    setCount((c) => c + (next ? 1 : -1));
    start(async () => {
      const r = await toggleLike(post.id);
      if (r.error) {
        setLiked(!next);
        setCount((c) => c - (next ? 1 : -1));
        setNote(r.error);
      }
    });
  }

  function comment() {
    const body = draft.trim();
    if (!body) return;
    start(async () => {
      const r = await addComment(post.id, body);
      if (r.error) setNote(r.error);
      else {
        setDraft("");
        setShowAll(true);
        router.refresh();
      }
    });
  }

  function remove() {
    setMenu(false);
    if (!window.confirm("Delete this post? The photo, likes and comments go with it.")) return;
    start(async () => {
      const r = await deletePost(post.id);
      if (r.error) setNote(r.error);
      else router.refresh();
    });
  }

  function report() {
    setMenu(false);
    if (!window.confirm("Report this post to the admins? Three reports hide it.")) return;
    start(async () => {
      const r = await reportPost(post.id, "");
      setNote(r.error ?? "Reported. Thanks.");
    });
  }

  function removeComment(id: string) {
    start(async () => {
      const r = await deleteComment(id);
      if (r.error) setNote(r.error);
      else router.refresh();
    });
  }

  return (
    <article
      id={`post-${post.id}`}
      aria-label={`Post by ${author?.display_name ?? "a member"}`}
      className="border-hairline-row flex flex-col gap-3 border-b py-4"
    >
      <header className="flex items-center gap-3">
        <Avatar person={author ?? { id: post.author_id, display_name: null }} size="md" />
        <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
          <span className="truncate text-[15px] leading-tight font-medium">{name}</span>
          <span className="text-muted-foreground text-[12px] leading-tight">{stamp}</span>
        </div>
        <div className="relative">
          <button
            type="button"
            aria-label="Post options"
            aria-expanded={menu}
            onClick={() => setMenu((m) => !m)}
            className="press text-muted-foreground flex size-9 items-center justify-center rounded-full"
          >
            <MoreHorizontal className="size-5" strokeWidth={1.7} />
          </button>
          {menu && (
            <div
              role="menu"
              className="bg-card absolute top-10 right-0 z-10 flex min-w-36 flex-col rounded-[14px] p-1 shadow-[inset_0_0_0_1px_var(--hairline-row),0_8px_24px_rgba(0,0,0,0.4)]"
            >
              {mine || isAdmin ? (
                <button type="button" role="menuitem" onClick={remove} className="text-loss rounded-[10px] px-3 py-2 text-left text-[14px] hover:bg-accent">
                  Delete post
                </button>
              ) : (
                <button type="button" role="menuitem" onClick={report} className="rounded-[10px] px-3 py-2 text-left text-[14px] hover:bg-accent">
                  Report
                </button>
              )}
            </div>
          )}
        </div>
      </header>

      {post.caption && <p className="text-[15px] leading-snug whitespace-pre-line">{post.caption}</p>}

      {post.signedUrl ? (
        // A plain img: the URL is signed and short-lived, so next/image's
        // loader and domain allow-list would only get in the way.
        <img
          src={post.signedUrl}
          alt={post.caption ? "" : "Photo"}
          loading="lazy"
          className="bg-card max-h-[520px] w-full rounded-[20px] object-cover shadow-[inset_0_0_0_1px_var(--hairline-row)]"
        />
      ) : (
        <div className="bg-card text-muted-foreground flex h-40 items-center justify-center rounded-[20px] text-[13px]">
          Photo unavailable
        </div>
      )}

      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={like}
          aria-pressed={liked}
          aria-label={liked ? "Unlike" : "Like"}
          className={cn("press flex items-center gap-1.5 text-[14px]", liked ? "text-loss" : "text-muted-foreground")}
        >
          <Heart className="size-5" strokeWidth={1.8} fill={liked ? "currentColor" : "none"} />
          <span className="stat-number">{count}</span>
        </button>
        <span className="text-muted-foreground text-[13px]">
          {post.comments.length === 0 ? "No comments" : `${post.comments.length} comment${post.comments.length === 1 ? "" : "s"}`}
        </span>
      </div>

      {(shown.length > 0 || hidden > 0) && (
        <ul className="flex flex-col gap-2">
          {hidden > 0 && (
            <li>
              <button type="button" onClick={() => setShowAll(true)} className="text-brass text-[13px]">
                Show all {post.comments.length} comments
              </button>
            </li>
          )}
          {shown.map((c) => {
            const canDelete = c.author_id === meId || mine || isAdmin;
            return (
              <li key={c.id} className="flex items-start gap-2.5">
                <Avatar person={c.author ?? { id: c.author_id, display_name: null }} size="xs" />
                <p className="min-w-0 flex-1 text-[14px] leading-snug">
                  <span className="font-medium">{c.author_id === meId ? "You" : (c.author?.display_name ?? "Member").split(" ")[0]}</span>{" "}
                  <span className="whitespace-pre-line">{c.body}</span>
                </p>
                {canDelete && (
                  <button
                    type="button"
                    onClick={() => removeComment(c.id)}
                    aria-label="Delete comment"
                    className="text-muted-foreground press text-[12px]"
                  >
                    Delete
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          comment();
        }}
        className="flex items-center gap-2"
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          maxLength={COMMENT_MAX}
          placeholder="Add a comment"
          aria-label="Add a comment"
          className="bg-card text-foreground placeholder:text-muted-foreground h-10 min-w-0 flex-1 rounded-full px-4 text-base outline-none shadow-[inset_0_0_0_1px_var(--hairline-row)]"
        />
        <button
          type="submit"
          disabled={pending || !draft.trim()}
          aria-label="Send comment"
          className="press bg-primary text-primary-foreground flex size-10 shrink-0 items-center justify-center rounded-full disabled:opacity-40"
        >
          <Send className="size-4" strokeWidth={2} />
        </button>
      </form>
      {note && (
        <p aria-live="polite" className="text-muted-foreground text-[12px]">
          {note}
        </p>
      )}
    </article>
  );
}
