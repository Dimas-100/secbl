// Posts, pure half (docs/superpowers/specs/2026-10-07-posts-design.md §2, §9).
export const CAPTION_MAX = 280;
export const COMMENT_MAX = 280;
export const POSTS_PER_DAY = 5;
export const REPORTS_TO_HIDE = 3;
export const COMMENTS_SHOWN = 3;

// Trim, collapse runs of spaces and tabs, allow at most one blank line, cap.
export function normalizeText(raw: string, max: number): string {
  return raw
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, max);
}

export function canPostToday(todaysCount: number): boolean {
  return todaysCount < POSTS_PER_DAY;
}

export function likeState(likes: { profile_id: string }[], meId: string): { count: number; mine: boolean } {
  return { count: likes.length, mine: likes.some((l) => l.profile_id === meId) };
}

// Oldest first; collapsed to the last few unless expanded.
export function visibleComments<T extends { created_at: string }>(
  comments: T[],
  showAll: boolean
): { shown: T[]; hidden: number } {
  const sorted = [...comments].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
  if (showAll || sorted.length <= COMMENTS_SHOWN) return { shown: sorted, hidden: 0 };
  return { shown: sorted.slice(-COMMENTS_SHOWN), hidden: sorted.length - COMMENTS_SHOWN };
}

export function postImagePath(authorId: string, id: string): string {
  return `${authorId}/${id}.jpg`;
}

// The insert policy enforces this too; checking here gives a clean message.
export function isOwnPostPath(path: string, authorId: string): boolean {
  return /^[^/]+\/[A-Za-z0-9-]+\.jpg$/.test(path) && path.startsWith(`${authorId}/`);
}
