# SECBL Phase 5 — Messaging: Design Spec

**Date:** 2026-10-05
**Status:** Approved design, implementation in progress
**Parent spec:** `2026-08-31-secbl-design.md` §9
**Design system:** `2026-09-01-frontend-redesign-design.md` (Sleek Broadcast)

## 1. Scope

Live chat for approved members: one **Everyone** room, one room **per school**,
and private **DMs**. Plain text, real-time delivery, unread indicators. No
attachments, threads, reactions, edits or deletes (v1, per parent spec §9/§14).

## 2. Data model (`supabase/migrations/0014_messaging.sql`)

| Table | Columns |
|---|---|
| `channels` | id, type (`everyone`\|`school`\|`dm`), name, school_id (school rooms only), dm_key (DMs only — `least(a,b):greatest(a,b)`), created_at |
| `channel_members` | (channel_id, profile_id) PK, last_read_at, joined_at |
| `messages` | id (identity bigint — cheap keyset pagination), channel_id, sender_id, body (1–2000 chars, trimmed), created_at |

Partial unique indexes enforce: exactly one `everyone` channel, one room per
school, one DM per participant pair (parent spec §13).

**Membership is automatic and trigger-maintained.** `sync_group_memberships(p)`
puts an approved profile in Everyone + its school room and removes it from any
other school room; a profile that leaves `approved` (suspended/rejected) is
removed from both group rooms. Fired by a trigger on `profiles` (insert, or
update of `status`/`school_id`). A trigger on `schools` creates a room for every
new school. The migration backfills all current approved members.
`last_read_at` defaults to join time, so a new member is not greeted with
hundreds of "unread" messages.

**Writes:**
- Posting is a plain RLS-guarded insert (sender must be the caller, approved,
  and a member of the channel). A BEFORE INSERT trigger rate-limits to 8
  messages per sender per 10 s and forces `created_at = now()`.
- `get_or_create_dm(other)` (SECURITY DEFINER): creates or returns the DM
  channel between caller and an approved member, inserting both memberships.
- `mark_channel_read(channel)` stamps the caller's `last_read_at`.
- `list_my_channels()` returns the caller's inbox rows (name, other party for a
  DM, member count, unread count, last message preview).
- `unread_total()` feeds the header badge.

**RLS.** `is_channel_member(channel)` is a SECURITY DEFINER helper (a policy on
`channel_members` that queried `channel_members` would recurse). Members read
channels, co-members and messages only where they are members; DMs are visible
to exactly the two participants — admins have no special read access. No
UPDATE/DELETE policies on messages.

**Realtime.** `messages` is added to the `supabase_realtime` publication.
Clients subscribe to `postgres_changes` INSERTs filtered by channel; Realtime
evaluates the subscriber's RLS, so a member cannot subscribe their way into a
DM they are not part of.

## 3. Client

- `lib/supabase/client.ts` — browser client (`createBrowserClient`), used only
  for the Realtime subscription, optimistic sends and older-message paging.
- `lib/chat.ts` — pure, vitest-covered: inbox ordering (group rooms pinned, DMs
  by last activity), message merge/dedupe, day grouping, time labels, DM key.

## 4. Screens

- **Header chat icon** (member layout): `MessageCircle` linking to `/chat`, with
  a gold unread count badge. The five-tab bar is unchanged — a sixth tab would
  push the raised Report button off center, and a top-right inbox icon is the
  convention students already know.
- **`/chat` inbox:** HeroBand "Chat" with a gold "New message" hero button
  (bottom-sheet member picker, same pattern as the opponent picker). One card:
  Everyone and the school room first, then DMs by activity. Each row: avatar
  (initial or room icon), name, "Sender: preview", time, unread badge.
- **`/chat/[id]` room:** full-screen client panel (`fixed inset-0`, above the
  tab bar — the composer owns the bottom edge). Slim top bar: back, name,
  member count. Messages as bubbles: own on the right in felt green, others on
  the left on white cards with sender name; day separators; "Load earlier" at
  the top. Composer: 16px textarea (Enter sends on desktop, Shift+Enter for a
  newline), gold send button, safe-area padding. Optimistic send with a retry
  state on failure. On mount and on each incoming message while visible, the
  room marks itself read.
- **Player page:** "Message" button → `startDm` server action → the DM room.
- **Reconnect:** the subscription's status callback and `visibilitychange`
  refetch anything newer than the last known message id and merge.

## 5. Testing

- Vitest: `lib/chat.ts` helpers.
- RLS integration (`tests/rls.integration.test.ts`): pending users see no
  channels; a member cannot read a DM they are not in; a member cannot post as
  someone else or into a room they are not in; auto-membership on approval.
- Playwright `e2e/chat.spec.ts`: two browser contexts — A opens B's player
  page, starts a DM, sends; B sees the unread badge, opens the room, replies; A
  sees the reply appear live without a reload.
