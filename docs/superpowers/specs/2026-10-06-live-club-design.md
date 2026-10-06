# SECBL Live Club — chat recency, push notifications, app framing, title badges, school logos, show-more, races & spots, live scoreboard

**Date:** 2026-10-06
**Status:** Implemented 2026-10-06 (plan: `docs/superpowers/plans/2026-10-06-live-club.md`). Written autonomously from the owner's goal statement; every call made on their behalf is in §0. Two deviations during the build: school logos sit on a white disc (not a transparent ground), and the suggested spot rounds the weaker player's games *up* (smaller spots).
**Builds on:** `2026-10-06-elevated-dark-redesign-design.md` (tokens, components), `2026-10-06-levels-xp-design.md` (titles, XP), `2026-10-05-messaging-design.md` (channels, Realtime).

## 0. The ask, and the calls made

The owner asked for seven things in one breath. Each is restated here with the decision that turns it into something buildable. Where the owner's words left room, the choice is marked **Assumption** so it can be reversed cheaply.

| # | Owner's words | What ships |
|---|---|---|
| 1 | "The chat should work like any other chat … recent messages get pushed to the top." | Inbox ordered purely by latest activity, newest on top, and it re-orders **live** when a message lands in any of your rooms. **Assumption:** Everyone and the school room are no longer pinned; a quiet room sinks like any other. Rooms with no messages yet sort after every active one (group rooms before DMs). |
| 2 | "The app should also have the ability to notify users, and users should have the option to turn them off." | Web Push (VAPID) delivered through the existing service worker, with a Notifications card in Settings: one master switch plus three category switches — Messages, Matches, Events. **Assumption:** three triggers in v1: a new message in a room you're in, a match reported to you / your report confirmed or disputed, and an admin-created event. Synced (imported) events do not push. |
| 3 | "Positioning/framing needs to behave like an application. No unnecessary zooming when clicking on things." | Viewport locked (`maximum-scale=1, user-scalable=no`), every text input ≥16px so iOS never auto-zooms on focus, `touch-action: manipulation` to kill double-tap zoom, tap highlight and long-press callouts off on controls, overscroll bounce off, `apple-mobile-web-app-capable` so the installed app runs full-screen. |
| 4 | "Badges associated with each rank … users should feel encouraged." | Six **title badges** (Rookie → Legend), one per title on the existing ladder, drawn as SVG medallions in six distinct materials. Shown large on Profile, small beside names on the Leaderboard and the Home greeting, and as the row mark on the Ladder screen, with a "Next badge" teaser. **Assumption:** "rank" means the XP title ladder (the thing designed to be climbed), not the leaderboard position (which goes down as well as up). |
| 5 | "For the schools, use the actual logos from the schools not dots." | `schools.logo_url` + a public `school-logos` bucket; admins upload/replace a logo from the Admin screen; a `SchoolMark` component replaces every `SchoolDot` and falls back to the colour dot only when a school has no logo yet. A one-off script seeds the five schools from Wikimedia Commons' official marks. |
| 6 | "Display of matches: show top 10, then allow user to expand." | Home "Recent" and Profile "Match history" render 10 rows and a "Show all N" control that expands in place. **Assumption:** "matches" means match lists, not the leaderboard. |
| 7 | "Allow a user to get a match or matches ahead … Dennis gives them two matches and it's race to 3." | Matches gain a **format**: `race_to` and a **spot** (games on the wire) given to one player. Scores are stored *including* the spot, so every existing surface stays truthful and the winner is still whoever has the higher score. The form suggests a fair spot from the rating gap; the reporter can change it; the opponent confirms as today. **Assumption:** ratings and XP are unchanged by a spot — a handicapped win is a win. Tournament result entry keeps its current (unhandicapped) form. |
| 8 | "Make tracking matches more enjoyable … select the type of game (type plus race to) … a progress bar as they input wins or losses … an effect when losing or winning." | Log a game becomes a live scoreboard: pick opponent, game, race-to and spot; each player's hero number sits on a rail that fills toward the finish; the first to the finish triggers a win burst or a loss sink (haptics where available, reduced-motion respected) and locks the score; the draft survives a locked phone; then the usual "Send to X to confirm". |

## 1. Chat: newest on top, live

### Ordering (`lib/chat.ts`)
`sortInbox(rows)` becomes: by `last_at` descending; rows with no message yet after all active rows, group rooms (`everyone`, `school`) before DMs, then by name. Tests in `tests/chat.test.ts` are rewritten for this rule.

### Live re-ordering (`app/(member)/chat/inbox-list.tsx`)
The inbox is already a client component. It subscribes to `postgres_changes` INSERTs on `messages` with no filter — Realtime applies each subscriber's RLS, so only rooms you're in arrive — and on each event calls `supabase.rpc("list_my_channels")` (debounced 400 ms) and re-derives the items client-side with a pure `buildInboxItems(rows, { meId, now, schoolsById })` helper moved from `page.tsx` into `lib/inbox.ts`. The unread badge and preview update with it. A `visibilitychange` → refetch handles a phone coming back from sleep, the same pattern `chat-room.tsx` uses.

### Chat room
Already appends newest at the bottom with stick-to-bottom. No change beyond calling `notifyMessage` (§2) after a successful send.

## 2. Push notifications

### Data (migration `0020_live_club.sql`, part 1)
```sql
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
create index push_subscriptions_profile_idx on public.push_subscriptions (profile_id);

create table public.notification_prefs (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  messages boolean not null default true,
  matches boolean not null default true,
  events boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.messages add column notified_at timestamptz;
```
RLS: a member may select/insert/update/delete **own** `push_subscriptions` rows and own `notification_prefs` row (`profile_id = (select auth.uid())`, approved). No admin carve-out. The service role (server actions) reads other members' subscriptions to send. `messages.notified_at` has no client UPDATE policy, so only the service role can stamp it.

### Sending (`lib/push.ts`, server-only)
`web-push` (npm) with VAPID keys from env: `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (`mailto:`). Added to `.env.example`, `.env.local` and Vercel production.

```ts
export type PushCategory = "messages" | "matches" | "events";
export interface PushPayload { title: string; body: string; url: string; tag: string; category: PushCategory }
export interface Prefs { messages: boolean; matches: boolean; events: boolean }
// Pure, tested: who gets this payload given recipients' prefs (missing prefs = all on).
export function recipientsFor(candidates: { profile_id: string; prefs: Prefs | null }[], category: PushCategory, excludeId: string | null): string[]
// Pure, tested: the payload builders for each trigger (copy below).
export function messagePayload(...), matchReportedPayload(...), matchConfirmedPayload(...), matchDisputedPayload(...), eventPayload(...)
// Service-role send; deletes 404/410 subscriptions (expired). Never throws to the caller.
export async function sendPush(service: SupabaseClient, profileIds: string[], payload: PushPayload): Promise<void>
```
Missing VAPID keys disable sending with one `console.warn`, so dev without keys keeps working.

### Triggers
| Event | Where | Recipients | Copy (title / body) → url |
|---|---|---|---|
| New message | `app/(member)/chat/actions.ts` → new server action `notifyMessage(messageId)` called by `chat-room.tsx` right after its insert succeeds | other channel members, prefs.messages | DM: sender name / body (trimmed to 120) → `/chat/<id>`. Room: `"<Room> · <Sender>"` / body |
| Match reported | `reportMatch` | opponent, prefs.matches | `"<Reporter> reported a game"` / `"<Reporter> 5–3 you · 8-ball · race to 5. Confirm?"` → `/` |
| Match confirmed | `confirmMatch` | reporter | `"<Opponent> confirmed"` / `"Won 5–3 · +12 rating"` → `/` |
| Match disputed | `rejectMatch` | reporter | `"<Opponent> disputed your report"` / `"The admins will sort it out."` → `/` |
| New event | `createEvent` | every approved member except the creator, prefs.events | `"New event: <title>"` / `"<when> · <location>"` → `/events/<id>` |

`notifyMessage` guards: the message must exist, belong to the caller, and have `notified_at` null; it stamps `notified_at` first (service role, `.is("notified_at", null)` so a race sends once), then sends. A member can therefore never make another member's phone buzz twice for one message.

The service worker's `push` handler skips showing a notification when a window at the payload's `url` is already visible (so you're not buzzed by the room you're reading). `notificationclick` focuses an open window or opens `url`. `tag` collapses repeat notifications per room/match.

### Settings UI (`app/(member)/settings/notifications-card.tsx`, client)
States: *unsupported* ("This browser can't receive notifications. On iPhone, add SECBL to your Home Screen first."), *blocked* ("Notifications are blocked for this site — allow them in your browser settings."), *off* (switch), *on* (switch + three category switches). Turning on: `Notification.requestPermission()` → `registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey })` → server action `savePushSubscription(json)`. Turning off: `subscription.unsubscribe()` → `removePushSubscription(endpoint)`. Category switches → `updateNotificationPrefs`. A "Send a test" ghost button pushes to yourself so the setup can be verified at the table.

## 3. App framing

- `app/layout.tsx` viewport: `maximumScale: 1, userScalable: false` (owner's explicit ask; it trades pinch-zoom for app feel). `metadata.appleWebApp = { capable: true, statusBarStyle: "black-translucent", title: "SECBL" }`.
- `globals.css` base layer: `html { overscroll-behavior-y: none; -webkit-text-size-adjust: 100%; }`; `button, a, [role="tab"], [role="button"], input, textarea, select, label { touch-action: manipulation; -webkit-tap-highlight-color: transparent; }`; `a, button, img { -webkit-touch-callout: none; }`; `nav, header, button, [role="tab"] { user-select: none; }`. Message bodies, taglines and stats stay selectable.
- Every text input renders at 16px: `components/ui/input.tsx` → `text-base` (drop `md:text-sm`), inbox search → `text-base`, new-message sheet search likewise. The chat textarea already is.
- Bottom sheets (opponent picker, new message) get `overscroll-behavior: contain` on their scroll area.

## 4. Title badges

### Component (`components/title-badge.tsx`)
`TitleBadge({ title: TitleName, size?: 20 | 28 | 40 | 64, locked?: boolean, className? })` — an inline SVG medallion: a circle with a 1px inner ring, a tier glyph, and a material:

| Title | Material (tokens) | Glyph |
|---|---|---|
| Rookie | `--muted-foreground` ring on `--card` | a single ball (circle with highlight) |
| Regular | `--podium-3` bronze | the rack (triangle of 3 balls) |
| Shark | `--podium-2` silver | a fin |
| Hustler | `--brass` | a cue crossing a ball |
| Master | `--gold` | a crown |
| Legend | `--foreground` platinum with a `--brass` outer ring | a star |

`locked` renders the same mark at 35% opacity with the ring dashed. `aria-label="<Title> badge"`; decorative placements pass `aria-hidden`. `lib/levels.ts` gains `nextBadge(level: LevelInfo, xpTotal: number): { title: string; atLevel: number; xpToGo: number } | null`.

### Placement
- **Profile:** the Level line becomes `[badge 40] Level 12 · Shark` with the bar under it; a second line "Next: Hustler badge at level 15 · 1,240 XP to go" (omitted at Legend).
- **Leaderboard, players tab:** a 20px badge after the name in podium cards and rows. Needs every player's level: `lib/xp-data.ts` gains `loadAllLevels(supabase): Promise<Map<profileId, LevelInfo>>` — one scan of confirmed matches (same columns as `loadXp`, `.range(0, 19999)`) plus one finals query, grouped per player through `xpFromMatches`.
- **Home header:** a 20px badge beside your first name (from the existing `loadXp`).
- **Ladder screen:** each title row leads with its 40px badge (locked for titles not reached); the current title's row says "Your badge".
- **Match rows:** unchanged.

## 5. School logos

### Data (migration part 2)
```sql
alter table public.schools add column logo_url text;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('school-logos', 'school-logos', true, 1048576, array['image/png','image/svg+xml','image/webp','image/jpeg'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
-- storage policies: public read; admins insert/update/delete.
create or replace function public.set_school_logo(p_school_id uuid, p_url text) ... -- admin only; p_url null or like '%/storage/v1/object/public/school-logos/%'
```
`School` type gains `logo_url: string | null`. Pages read `logo_url` from a `schools` select; the `leaderboard` view is not changed.

### Component (`components/school-mark.tsx`)
`SchoolMark({ school: { short_name: string; primary_color: string | null; logo_url: string | null } | null | undefined, size = 16, className })` — `<img>` of the logo at `size`, `object-contain`, on a transparent ground (logos are not re-coloured); falls back to today's colour dot sized `max(6, size/2)` when `logo_url` is null. Replaces `SchoolDot` in: leaderboard rows (16) and schools tab (28), profile (16 beside the school name), inbox school-room avatar (the logo *is* the room avatar at 48px when present, dot-in-corner otherwise), schools page cards (40). `SchoolDot` is deleted once no caller remains.

### Admin upload (`app/(member)/admin/page.tsx` → new "Schools" card + `school-logo-uploader.tsx`)
One row per school: mark · name · "Upload" / "Replace" / "Remove". Upload goes straight to Storage from the browser (`school-logos/<school_id>/logo.<ext>`, upsert), then `setSchoolLogo(schoolId, url)` server action validates host + path and calls the RPC. Same shape as the avatar uploader in `look-editor.tsx`.

### Seed (`scripts/seed-school-logos.mjs`)
Downloads the five official marks from Wikimedia Commons (Georgia Bulldogs, Georgia State Panthers, Florida State Seminoles, Kennesaw State Owls, Georgia Tech Yellow Jackets), uploads them with the service key and sets `logo_url`. Idempotent; prints what it did. Best-effort: a school whose download fails is reported and left on the dot.

## 6. Show 10, then expand

`components/show-more.tsx` (client): `ShowMore({ items: ReactNode[], initial = 10, label: (hidden: number) => string })` renders `items.slice(0, initial)` and, when more exist, a ghost pill "Show all 37 games" that reveals the rest in place (no fetch). Server pages pass already-rendered rows. Applied to Home Recent (query raised to 30) and Profile Match history (keeps 50). The XP caption on hidden rows is computed server-side like the rest.

## 7. Races and spots

### Data (migration part 3)
```sql
alter table public.matches
  add column race_to smallint check (race_to between 1 and 25),
  add column spot smallint not null default 0 check (spot >= 0),
  add column spot_to uuid references public.profiles(id);
alter table public.matches add constraint matches_spot_shape
  check ((spot = 0) = (spot_to is null) and (spot_to is null or spot_to in (reporter_id, opponent_id)));
alter table public.matches add constraint matches_race_shape
  check (race_to is null or (greatest(reporter_score, opponent_score) = race_to and least(reporter_score, opponent_score) < race_to));
alter table public.matches add constraint matches_spot_fits
  check (race_to is null or spot < race_to);
```
Scores are stored **as the scoreboard shows them**: the spot receiver's score already includes the spot. So `reporter_score/opponent_score` keep meaning "final score", `winner_id` is still the higher score, achievements (`shutout` = opponent 0) stay honest, tournaments (`race_to` null) are untouched, and the client insert policy needs no change beyond the columns existing. `race_to` null = open play / legacy rows.

### Logic (`lib/race.ts`, pure, test-first)
```ts
export const RACES = [3, 5, 7, 9] as const;
export type Side = "you" | "them";
export interface RaceState { you: number; them: number; raceTo: number | null; spot: number; spotTo: Side | null }
export function startingScores(raceTo, spot, spotTo): { you: number; them: number }   // spot pre-filled on the receiver
export function suggestedSpot(raceTo: number, myRating: number, theirRating: number): { spot: number; to: Side | null }
   // Fargo-style: odds = 2^(gap/100); weaker needs round(raceTo / odds) games; spot = raceTo − that, clamped to 0..raceTo−1; to = null when 0
export function raceProgress(score: number, raceTo: number | null): number            // 0..1 for the rail; 0 when raceTo null
export function finished(s: RaceState): Side | null                                    // first to raceTo
export function canIncrement(s: RaceState, who: Side): boolean                         // false once finished or at raceTo
export function canDecrement(s: RaceState, who: Side): boolean                         // not below the receiver's spot
export function formatLabel(raceTo, spot, spotToName: string | null): string | null    // "Race to 5 · 2 on the wire to Sam" / "Race to 5" / null for open
export function needLine(s: RaceState, theirFirstName: string): string                 // "You need 3 · Sam needs 1"
export function raceSubmitState(s: RaceState, opponentName: string | null): { label; disabled; reason }  // race: enabled only when finished; open: today's rules
```
Rows: `MatchRow` gets an optional `format` string appended to the meta line ("8-ball · race to 5 · 2 spot"); `formatLabel` feeds it. Home confirm rows show it too.

### Reporting
`reportMatch` reads `race_to` (`""` for open), `spot`, `spot_to` (`"me" | "them" | ""`), validates with `lib/race.ts` (a race must be finished; the winner is the higher score; spot < race_to), and inserts the columns. Scores are already effective.

## 8. The live scoreboard (Log a game)

Sections, top to bottom, under the existing close header:

1. **Opponent** — as today.
2. **Game** — type pills as today; beneath them the **race pills** `3 · 5 · 7 · 9 · Open` under an eyebrow "Race to" (default 5; "Open" = no finish line, today's behaviour).
3. **Spot** — appears once an opponent and a race are chosen: a hairline row "Games on the wire" with a small − n + stepper (0…race−1) and a two-way toggle of who receives it (defaults to `suggestedSpot`, caption "Suggested from your ratings"; the reporter can set 0). Hidden on Open.
4. **Scoreboard** — the two hero numbers; under each a 4px **rail** (`bg-hairline-divider`, fill `bg-foreground`, brass for whoever leads) that fills `raceProgress`. The receiver starts with their spot already lit. + adds a game; − takes one back (not below the spot); the caption reads `needLine`. At the finish the winning numeral pops (`race-win`: scale 1→1.12→1 with a brass ring expanding from behind the number, 600 ms) and the losing side sinks (`race-loss`: translateY 6px + opacity .5, 400 ms); `navigator.vibrate?.([30, 40, 30])` on a win, `[60]` on a loss; both skipped under `prefers-reduced-motion`. Further + is disabled; − re-opens the race.
5. **Result line** — "You win 5–3" / "Sam wins 5–2" in win/loss tone, "Race on" while unfinished, "Enter the score" on Open as today.
6. **When** and the fixed footer — as today. Footer label from `raceSubmitState`.

Draft persistence: the form state (opponent, game, race, spot, scores, date) is mirrored to `localStorage["secbl:draft-game:<userId>"]` on every change and restored on mount if younger than 12 hours; cleared on submit. A "Clear" ghost link in the Score section resets it.

Tournament `result-form.tsx` keeps the plain steppers (admins enter finished results).

## 9. Testing

- Unit (`vitest`): `tests/chat.test.ts` (new order), `tests/inbox.test.ts` (`buildInboxItems`), `tests/push.test.ts` (`recipientsFor`, payload builders), `tests/race.test.ts` (suggested spot table, progress, finished/canIncrement/canDecrement, labels, submit state), `tests/levels.test.ts` (+ `nextBadge`).
- Integration (`tests/rls.integration.test.ts`): a member cannot read another's push subscription; `set_school_logo` refuses non-admins; a race-shaped insert whose scores don't reach `race_to` is rejected by the check.
- E2E: `e2e/report-race.spec.ts` — log a race to 3 with a 1-game spot, finish, send, confirm from the other session, see "race to 3 · 1 spot" in the history. Existing specs keep passing (`/^Increase/` labels retained).
- Visual: the screenshot script from the redesign, re-run for Home, Ranks, Profile, Log a game, Messages, Settings.

## 10. Done when

Migration applied; VAPID keys in Vercel; a phone with the installed app receives a message push and can switch it off; the inbox reorders live; no input zooms on iOS; badges show on Profile, Ranks, Home and Ladder; five school logos render where dots were; Home/Profile show 10 then expand; a race with a spot can be logged, confirmed and read back correctly; `npm run lint`, `tsc`, unit, integration, e2e and `next build` pass; README and specs updated; deployed.
