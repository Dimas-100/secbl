# SECBL Agreed Results — count a game on the spot when both players agree

**Date:** 2026-10-20
**Status:** Approved in conversation 2026-10-20 (the owner signed off the description in §0 and asked for the rest to be done autonomously). Plan: `docs/superpowers/plans/2026-10-20-agreed-results.md`.
**Builds on:** `2026-08-31-secbl-design.md` (report → confirm), `2026-10-06-live-club-design.md` (the scoreboard, push), `2026-10-06-seasons-feed-live-design.md` (activity feed, Live now), `2026-10-06-levels-xp-design.md` (computed XP).

## 0. The ask, and the calls made

Usage on 2026-10-20: 7 members, 3 confirmed games ever. A logged game waits as `pending` until the opponent opens the app and taps Confirm on Home, possibly never. At the table the two players have already agreed the score out loud, so the second tap is friction that loses games.

| # | Topic | What ships |
|---|---|---|
| 1 | Count on the spot | **Agreed.** When the scorekeeper sends, they can say "we agreed" and the game counts immediately: ratings, XP, feed, season standings, celebration card. |
| 2 | Safety net | **Agreed.** The opponent is told ("{Name} logged a 5–3 win over you") and for 24 hours can tap **Not right?**, which takes the game back out of ratings and XP and puts it in the admin Disputes list. |
| 3 | The old path | **Assumption.** "Send to {first} to confirm" stays, as the secondary button, for when the opponent has already left. |
| 4 | Window length | **Assumption.** 24 hours from when the game counted. |
| 5 | After a dispute | **Assumption.** Reuse the existing dispute flow: status `disputed`, the existing Admin Disputes card (fix score + confirm, or reject), the existing "disputed your report" push to the reporter. No new admin UI. |
| 6 | Admin push | **Assumption.** None, as today: the Disputes card is the flag. |
| 7 | Cups | Unchanged. Cup matches are scored on the cup sheet and never go through this path. |
| 8 | Duplicate check, XP weekly cap | Unchanged; both apply to agreed games exactly as to confirmed ones. |

Owner's stated stance on cheating: "not to worry" — the 24-hour window is the whole safety net. No rate limit or trust score.

## 1. Data (migration `0028_agreed_results.sql`)

```sql
alter table public.matches add column agreed_at timestamptz;
```

`agreed_at` is set only when the reporter counted the game on the spot. It is the marker that opens the 24-hour window. A normally confirmed match, a cup match and an admin-resolved match all have `agreed_at is null`.

Only the confirmation function writes it. The insert policy "approved report own matches" (live definition: `is_approved() and reporter_id = auth.uid() and status = 'pending' and tournament_match_id is null`) is recreated with `and agreed_at is null` added, so a member cannot insert a pending report that already carries the marker.

### Confirmation function

A new wrapper, `apply_agreed_confirmation(p_match_id uuid, p_reporter_delta int, p_opponent_delta int)`, performs the unchanged `apply_match_confirmation` and then sets `agreed_at = now()` on the match, in one call and one transaction. Service role only, like the function it wraps. (As built: an earlier draft added a `p_agreed` parameter to `apply_match_confirmation` itself, which needs a `drop function`; the Supabase MCP refuses destructive statements without an interactive confirmation, and an overload instead of a drop would make PostgREST's named-argument call ambiguous. The wrapper leaves the deployed function untouched. The insert policy is changed with `alter policy` for the same reason.)

### Undo function

```sql
create function public.undo_agreed_match(
  p_match_id uuid,
  p_opponent_id uuid,
  p_standings jsonb,
  p_history jsonb,
  p_deltas jsonb,
  p_expected_confirmed int
) returns void
language plpgsql security definer set search_path = public;
```

In order:
1. `perform pg_advisory_xact_lock(hashtext('secbl_ratings'))`.
2. Refuse unless the confirmed-match count still equals `p_expected_confirmed` (same message and reason as `void_tournament_result`).
3. Lock the match `for update` and refuse unless: `status = 'confirmed'`, `agreed_at is not null`, `tournament_match_id is null`, `opponent_id = p_opponent_id`, the `p_opponent_id` profile has `status = 'approved'`, and `confirmed_at > now() - interval '24 hours'`. Each refusal raises a plain sentence the action can show.
4. `update matches set status = 'disputed', confirmed_at = null, agreed_at = null, rating_delta_reporter = null, rating_delta_opponent = null where id = p_match_id`. The `matches_activity` trigger already deletes every feed row for a match that leaves `confirmed` (result, badge, streak, pass).
5. The payload guard from `void_tournament_result` (count and ids of confirmed matches equal `p_deltas`), then `perform public.apply_rating_recompute(p_standings, p_history, p_deltas)`. That rebuilds ratings, `matches_played` and `rating_history` without this match. XP and season standings are computed from confirmed matches, so they follow.

**Service role only:** `revoke execute ... from public, anon, authenticated; grant execute ... to service_role`, like `apply_rating_recompute`. The function accepts a whole recompute payload, and the guard only checks which matches it covers, not the ratings in it; granting it to members would let anyone who can flag a game write any rating into the ladder (the invariant `tests/rls.integration.test.ts` "a member cannot recompute the ladder" protects). The server action supplies `p_opponent_id` from the signed-in session and calls it with the service client; under the service role `auth.uid()` is null, which is why the opponent is a parameter checked inside the function.

Clearing `agreed_at` in step 4 means an admin-resolved game can never be disputed again through this path.

## 2. Server actions

### `reportMatch` (app/(member)/matches/new/actions.ts)

Reads a new form field `agreed` (`"1"` or absent). Validation, the duplicate backstop and the insert are unchanged (the insert stays `pending` under the existing RLS policy; the client never writes `agreed_at`).

When `agreed === "1"`:
1. Insert as today, then delete the live game as today. The insert's `.select()` must return the full row (`*`), not just `id`: `confirmPendingMatch` reads `reporter_id`, `opponent_id` and `winner_id`, and the untyped client would not flag a missing column — every agreed send would silently fall back to step 4.
2. `confirmPendingMatch(service, created, { agreed: true })` — `confirmPendingMatch` gains an optional `{ agreed?: boolean }` third argument; when true it calls `apply_agreed_confirmation` instead of `apply_match_confirmation` (same arguments).
3. On success: `recordMatchMoments(service, id)`, push the opponent the new **agreed** payload (§4), `revalidatePath("/")`, redirect `/?message=Counted — ratings updated.`
4. If step 2 throws, the match is still a normal pending report: push the ordinary "reported a game" payload and redirect `/?message=Couldn't count it right away — sent to {first} to confirm instead.` Never leave the reporter without a message.

Without `agreed`, behaviour is exactly today's.

### `disputeAgreedMatch(formData)` (app/(member)/matches/actions.ts)

New. Reads `match_id`. Loads the match with the service client; if it is not the caller's agreed game inside the window (pure check, §3), redirect `/?error=That game can no longer be flagged.` Otherwise build the payload with `buildRecomputePayload(service, [], matchId)` and call `undo_agreed_match` with the **service** client, passing `p_opponent_id: user.id` from the session. On error redirect with the function's message. On success push the reporter the existing `matchDisputedPayload`, `revalidatePath("/")`, redirect `/?message=Taken out of the ratings — an admin will sort it out.`

### `adminResolveMatch`

Its update also sets `agreed_at: null` (belt and braces; the undo already cleared it).

## 3. Pure logic (`lib/agreed.ts`, test-first)

```ts
export const AGREED_WINDOW_MS = 24 * 3_600_000;
// Can the viewer still flag this game?
export function canFlag(m: { status: string; agreed_at: string | null; confirmed_at: string | null; opponent_id: string }, viewerId: string, now: Date): boolean;
// "Until 9:14 PM" / "Until tomorrow 9:14 PM", club time (America/New_York via lib/events).
export function flagDeadlineLabel(confirmedAt: string, now: Date): string;
```

## 4. Push (lib/push.ts)

```ts
export function matchAgreedPayload(input: {
  matchId: string;
  reporterName: string;
  reporterScore: number;
  opponentScore: number;
  gameLabel: string;
  format: string | null;
}): PushPayload
```
Title `{Reporter} logged your game`. Body `{first} {r}–{o} you · {game}[ · {format}]. Counted — not right? Flag it within 24 hours.` URL `/`, tag `match:{id}`, category `matches`.

## 5. UI

### The scoreboard footer (report-form.tsx)

When the board is ready to send (`!s.disabled`), the footer shows:
- Primary `SubmitButton`: **We agreed — count it** (pending text "Counting…").
- Ghost `SubmitButton`: **Send to {first} to confirm** (today's label from `raceSubmitState`; pending "Sending…").
- Helper line: `Count it if you both agree the score. {first} can flag it for 24 hours.`

When disabled, the footer is today's single disabled button with its reason.

The choice travels in a hidden input `agreed` driven by component state set in each button's `onClick`. A button's own `name`/`value` is not enough: a plain Send is always intercepted for the duplicate check and resubmitted with `form.requestSubmit()`, which carries no submitter. The duplicate notice's "Log as a new game" keeps whatever was chosen; "Confirm {first}'s result" is unaffected.

### Home — the opponent's side

New section between **Confirm results** and **Waiting on**, heading **Logged for you**, listing confirmed matches with `opponent_id = me`, `agreed_at` not null, `confirmed_at` within 24 h. Row: reporter avatar; title `{Name} · beat you 5–3` / `lost to you 5–3` (same wording as Confirm results); meta `Counted · flag until {flagDeadlineLabel}`; trailing a form with a muted **Not right?** button posting to `disputeAgreedMatch`. The section disappears after 24 hours. The celebration card shows for the opponent too (it already picks the newest confirmed game in 24 h).

### Match rows

No change. An agreed game is an ordinary confirmed game everywhere else.

## 6. Tests

- `tests/agreed.test.ts`: `canFlag` (opponent only, inside window, not after, not when `agreed_at` null, not when not confirmed), `flagDeadlineLabel` (same day, next day, DST-safe through `lib/events`).
- `tests/push.test.ts`: `matchAgreedPayload` wording and truncation.
- `tests/rls.integration.test.ts` (extend): a member calling `undo_agreed_match` directly is refused (permission denied), and a member inserting a report with `agreed_at` set is refused by RLS.
- `e2e/report-agreed.spec.ts` (test users only, cleanup via `e2e/cleanup.ts`): A logs a race to 3 against B and taps **We agreed — count it** → Home says "Counted"; DB row `confirmed` with `agreed_at`; A and B ratings moved. B logs in → **Logged for you** shows the row → **Not right?** → message shown; DB row `disputed`, `agreed_at` null; both ratings back to 450, `matches_played` 0; no `activity` rows for the match.
- Existing `report-race` / `report-duplicate` specs keep passing; they click the "Send to E2E to confirm" button, which still exists (now secondary).

## 7. Non-goals

A dispute push to admins; a per-member trust score; editing an agreed score without a dispute; agreeing from the opponent's phone.
