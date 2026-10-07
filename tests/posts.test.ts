import { describe, expect, it } from "vitest";
import {
  CAPTION_MAX,
  COMMENT_MAX,
  POSTS_PER_DAY,
  REPORTS_TO_HIDE,
  canPostToday,
  isOwnPostPath,
  likeState,
  normalizeText,
  postImagePath,
  visibleComments,
} from "@/lib/posts";
import { commentPayload, likePayload, reportPayload } from "@/lib/push";

describe("normalizeText", () => {
  it("trims, collapses runs of spaces, keeps at most one blank line, and caps", () => {
    expect(normalizeText("  nice   shot \t here  ", CAPTION_MAX)).toBe("nice shot here");
    expect(normalizeText("a\n\n\n\nb", CAPTION_MAX)).toBe("a\n\nb");
    expect(normalizeText("x".repeat(300), CAPTION_MAX)).toHaveLength(CAPTION_MAX);
    expect(normalizeText("", CAPTION_MAX)).toBe("");
    expect(COMMENT_MAX).toBe(280);
  });
});

describe("limits", () => {
  it("allows five posts a day and three reports hide", () => {
    expect(POSTS_PER_DAY).toBe(5);
    expect(REPORTS_TO_HIDE).toBe(3);
    expect(canPostToday(4)).toBe(true);
    expect(canPostToday(5)).toBe(false);
  });
});

describe("likeState", () => {
  it("counts likes and knows whether the viewer is among them", () => {
    const likes = [{ profile_id: "a" }, { profile_id: "b" }];
    expect(likeState(likes, "b")).toEqual({ count: 2, mine: true });
    expect(likeState(likes, "z")).toEqual({ count: 2, mine: false });
    expect(likeState([], "z")).toEqual({ count: 0, mine: false });
  });
});

describe("visibleComments", () => {
  const c = (i: number) => ({ id: `c${i}`, created_at: `2026-10-07T10:0${i}:00Z` });
  it("shows the last three oldest-first unless expanded", () => {
    const all = [c(1), c(2), c(3), c(4), c(5)];
    expect(visibleComments(all, false).shown.map((x) => x.id)).toEqual(["c3", "c4", "c5"]);
    expect(visibleComments(all, false).hidden).toBe(2);
    expect(visibleComments(all, true).shown).toHaveLength(5);
    expect(visibleComments([c(1)], false)).toEqual({ shown: [c(1)], hidden: 0 });
  });
});

describe("paths", () => {
  it("builds and checks the author's own folder", () => {
    expect(postImagePath("u1", "abc")).toBe("u1/abc.jpg");
    expect(isOwnPostPath("u1/abc.jpg", "u1")).toBe(true);
    expect(isOwnPostPath("u2/abc.jpg", "u1")).toBe(false);
    expect(isOwnPostPath("u1/../u2/abc.jpg", "u1")).toBe(false);
    expect(isOwnPostPath("u1/abc.png", "u1")).toBe(false);
  });
});

describe("post payloads", () => {
  it("like, comment and report", () => {
    expect(likePayload({ postId: "p", likerName: "Dennis Ro" })).toEqual({
      title: "Dennis liked your post",
      body: "Tap to see it.",
      url: "/#post-p",
      tag: "post:p",
      category: "social",
    });
    expect(commentPayload({ postId: "p", commenterName: "Maya Chen", body: "Clean cut!" })).toEqual({
      title: "Maya commented on your post",
      body: "Clean cut!",
      url: "/#post-p",
      tag: "post:p",
      category: "social",
    });
    expect(reportPayload({ postId: "p", count: 2 })).toEqual({
      title: "A post was reported",
      body: "2 of 3 reports. Three hide it until an admin clears it.",
      url: "/admin",
      tag: "report:p",
      category: "league",
    });
  });
});
