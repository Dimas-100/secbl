# SECBL Posts — photos and clips in the league feed, with reactions and moderation

**Date:** 2026-10-07
**Status:** Spec approved in conversation 2026-10-07; **build on hold** by the owner's decision. No plan, no code.
**Builds on:** `2026-10-06-seasons-feed-live-design.md` (the `activity` table and Home feed, Realtime refresh), `2026-10-06-live-club-design.md` (push categories, Storage upload pattern from `0016_personalization.sql`), `2026-10-06-elevated-dark-redesign-design.md` (tokens, `ListRow`, cards).

## 0. The ask, and the calls made

The owner asked whether a social-media-style feed, where players post photos or clips of their shots, would make the app livelier. Yes, with two constraints that shape v1: the project runs on Supabase's free tier (about 1 GB storage, 2 GB egress a month), and member-posted media needs a takedown path. Decisions below are marked **Agreed** (said in conversation) or **Assumption**.

| # | Topic | What ships |
|---|---|---|
| 1 | Where posts live | **Agreed.** In the existing Home feed, as one more `activity` kind, not a second feed screen. The feed already orders, paginates with show-more and refreshes live. |
| 2 | Photos | **Agreed.** Uploaded from the phone after client-side compression (same canvas pattern as the avatar uploader): longest side 1280 px, JPEG quality 0.82, so a 12 MB camera shot becomes roughly 150–300 KB. One photo per post in v1. |
| 3 | Clips | **Agreed.** Not uploaded. A clip post is a link to YouTube, TikTok or Instagram, shown as a tappable card with the platform name and the caption. Zero storage. Native video upload is a later step once storage is paid for. |
| 4 | Captions | **Assumption.** Optional, up to 280 characters, plain text, newlines collapsed. No hashtags, no mentions in v1. |
| 5 | Visibility | **Assumption.** Members only. The `posts` bucket is **private**; the app serves images through signed URLs (one hour), minted on the server when Home renders. Nothing is reachable from outside the club. |
| 6 | Reactions | **Agreed** (owner skipped them earlier; they return here because posts need them to land). Four reactions: 🔥 🎱 👏 😮, one per member per row, toggled by tap. Reactions apply to **every** feed row, not only posts, so a result or a badge can be cheered too. |
| 7 | Moderation | **Agreed.** The author and any admin can delete a post (and its file). Every post has **Report**, which creates a report row and pushes the admins; three reports hide the post from the feed until an admin clears or deletes it. |
| 8 | Push | **Assumption.** A new post pushes nothing by default. A reaction on your own row pushes under a new **Social** category, off by default, so nobody is nagged into it. |
| 9 | Rate limits | **Assumption.** Five posts per member per day; one photo per post; 2 MB upload cap enforced by the bucket. |
| 10 | Who can post | **Assumption.** Any approved member. Suspended members cannot (is_approved gates every policy). |
| 11 | Edits | **Assumption.** No editing in v1; delete and repost. |

## 1. Data (migration `0025_posts.sql`)

```sql
alter type public.activity_kind add value 'post';

create table public.posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(id) on delete cascade,
  caption text check (char_length(caption) <= 280),
  -- Exactly one of the two.
  image_path text,                         -- object path inside the private 'posts' bucket: <author_id>/<uuid>.jpg
  clip_url text,                           -- https URL on youtube.com / youtu.be / tiktok.com / instagram.com
  hidden_at timestamptz,                   -- set when reports reach the threshold or an admin hides it
  created_at timestamptz not null default now(),
  check ((image_path is null) <> (clip_url is null)),
  check (clip_url is null or clip_url ~* '^https://(www\.)?(youtube\.com|youtu\.be|tiktok\.com|instagram\.com)/')
);
create index posts_author_idx on public.posts (author_id, created_at desc);

create table public.reactions (
  activity_id uuid not null references public.activity(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  emoji text not null check (emoji in ('🔥', '🎱', '👏', '😮')),
  created_at timestamptz not null default now(),
  primary key (activity_id, profile_id)   -- one reaction per member per row; changing it is an update
);
create index reactions_activity_idx on public.reactions (activity_id);

create table public.post_reports (
  post_id uuid not null references public.posts(id) on delete cascade,
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  reason text check (char_length(reason) <= 200),
  created_at timestamptz not null default now(),
  primary key (post_id, reporter_id)
);

-- Storage: private bucket, members write only into their own folder.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('posts', 'posts', false, 2097152, array['image/jpeg', 'image/webp']);
```

**RLS**
- `posts`: approved members `select` where `hidden_at is null or author_id = auth.uid() or is_admin()`; `insert` own (`author_id = auth.uid()` and the daily cap via a `before insert` trigger that counts today's posts, club date); `delete` own or admin. No update policy (no edits).
- `reactions`: approved members `select` all; `insert`/`update`/`delete` own row.
- `post_reports`: approved members `insert` own; `select` admins only.
- `storage.objects` on `posts`: `select` for approved members (signed URLs still require the policy), `insert` into own folder, `delete` own folder or admin.

**Triggers**
- `posts` after insert → `activity (kind 'post', actor_id = author_id, data = { post_id, kind: 'photo'|'clip' })`. The activity row carries the post id; the feed select joins `posts` for caption, path and URL.
- `posts` after update of `hidden_at`, or delete → the activity row is deleted (hidden) or re-inserted (cleared), so the feed query never needs to know about hiding.
- `post_reports` after insert → when `count(*) >= 3` for the post, set `hidden_at = now()`; also insert an `admin_alert`? No: push instead (§4), nothing stored beyond the report rows.

**Feed refresh** already fires on `activity` INSERT; add DELETE to the Home subscription so a removed post disappears live.

## 2. Logic (`lib/posts.ts`, pure, test-first)

```ts
export const CAPTION_MAX = 280;
export const POSTS_PER_DAY = 5;
export const REPORTS_TO_HIDE = 3;
export const REACTIONS = ["🔥", "🎱", "👏", "😮"] as const;
export function clipPlatform(url: string): "YouTube" | "TikTok" | "Instagram" | null   // null = not allowed
export function normalizeCaption(raw: string): string                                    // trim, collapse whitespace, cap
export function tallyReactions(rows: { emoji: string; profile_id: string }[], meId: string): { emoji: string; count: number; mine: boolean }[]
export function canPostToday(todaysCount: number): boolean
```
Image compression lives in `lib/image-client.ts` (browser only): `compressForPost(file): Promise<Blob>` — longest side 1280, JPEG 0.82, EXIF orientation honoured via `createImageBitmap(file, { imageOrientation: "from-image" })`.

## 3. Surfaces

- **Composer.** A camera/plus button on the Home feed heading ("Recent · Post"). A bottom sheet (Radix Dialog, like the opponent picker): choose a photo or paste a clip link, caption field, Post. Upload goes browser → Storage (own folder) exactly as the avatar uploader does, then a Server Action `createPost({ imagePath | clipUrl, caption })` inserts the row. Failure leaves nothing behind: the action deletes the uploaded object if the insert fails.
- **Feed row (`ActivityRow` kind `post`).** Author avatar and name, stamp, caption, then the photo (rounded 20, full width, `object-cover`, 4:5 max) or the clip card (platform mark, caption, opens the link in a new tab). Below: the reaction bar.
- **Reaction bar.** On every feed row: the four emoji as small pills with counts; your own choice is filled. Tapping toggles or switches; optimistic update, Server Action behind it. Counts come with the feed select (`reactions(emoji, profile_id)` joined on `activity_id`).
- **Post menu.** A kebab on post rows: **Delete** (author/admin, confirm interstitial), **Report** (everyone else; a one-line reason, optional).
- **Admin.** A **Posts** card listing hidden posts with their report count and reasons, **Clear** (unhide, delete the reports) or **Delete**. Reports also push the admins (§4).
- **Profile.** A small grid of the member's last six photos under Achievements, linking to Home with the post scrolled into view (`/?post=<id>`). Assumption; cheap to drop.

## 4. Push

Two new categories in `notification_prefs`: **Social** (reactions on your rows; default **off**) and **Reports** (admins only; default on, shown in Settings only for admins). Payloads are pure and tested like the others:
- `reactionPayload({ activityId, reactorName, emoji })` → "Dennis reacted 🔥 to your post" → `/?post=<id>`.
- `reportPayload({ postId, reporterName, count })` → "A post was reported (2 of 3)" → `/admin`.

## 5. Storage budget (why v1 is photos + links)

| Item | Size | 1 GB holds |
|---|---|---|
| Compressed photo (1280 px, q 0.82) | ~200 KB | ~5,000 photos |
| 10 s clip, 720p | 5–10 MB | ~100–200 clips |

Egress: Home renders up to 30 rows; with photos cached by the browser (signed URLs are stable for an hour, `cache-control` set) a club of 50 opening the app twice a day stays well under 2 GB a month. Native clips would not. If clips ever move in-house: Supabase Pro ($25/mo, 100 GB), or a dedicated video host (Mux, Cloudflare Stream) with upload-and-transcode, and keep the feed row shape unchanged.

## 6. Tests

- `tests/posts.test.ts`: `clipPlatform` accepts the three hosts and rejects everything else (including `javascript:` and `http://`), caption normalisation, reaction tallies, daily cap.
- `tests/push.test.ts`: the two payloads.
- `tests/posts.integration.test.ts`: a member can insert own post and not another's; the sixth post of the day is refused; a third report hides the post and removes its activity row; clearing restores it; delete cascades the reactions; a member cannot read another member's object without a signed URL; a non-member cannot read the bucket at all.
- `e2e/posts.spec.ts`: member posts a photo (fixture JPEG) with a caption → it appears in another member's feed live → the other member reacts and the count shows for both → the author deletes it → it is gone for both. Clip link path: a YouTube URL renders as a card. Teardown deletes posts (objects cascade via a cleanup step) and users.

## 7. Out of scope (later)

Native video upload, multiple photos per post, comments on posts (chat rooms serve that), mentions and hashtags, editing a post, a separate feed screen or infinite scroll, image moderation by model.

## 8. Open questions for the owner, when building starts

1. Should a post be allowed with **no** media (text only)? The spec says no: it's a shot feed, not a status feed, and the chat rooms already carry text.
2. Reactions on **all** rows (spec) or on posts only? All rows is the livelier choice and costs nothing extra.
3. Hide threshold of three reports: right for a club of about fifty? With five members it is too low; with two hundred it is too high. Make it an admin setting if the club grows.
