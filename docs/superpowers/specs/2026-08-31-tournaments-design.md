# SECBL Phase 4 — Tournaments & Brackets: Design Spec

**Date:** 2026-08-31
**Status:** Approved design, pre-implementation
**Parent spec:** `2026-08-31-secbl-design.md` (§5 data model, §6.4 tournament matches, §7 tournaments)
**Depends on:** Phases 1–3 (auth/approval, matches + rating engine, events)

## 1. Scope

Single-elimination tournaments for 3–32 players, with byes. An admin creates a
tournament, adds entrants during `setup`, seeds them (rating order by default,
manually overridable), and starts it — which generates the complete match tree at
once. The director enters each result; the winner advances automatically and the
result rates immediately, bypassing the report/confirm flow per parent spec §6.4.

**Deferred to a follow-on, deliberately:**

- **Double elimination.** The losers-bracket round mapping, its bye cascades and the
  grand final roughly double the engine's test surface, which is where the real cost
  of this phase lives. The schema keeps `bracket` and `loser_advances_to` from parent
  spec §5 so adding it later is additive, not a migration of live tournament data.
- **Supabase Realtime.** Replaced by interval refresh (§5). Realtime would be the
  app's first live subscription — reconnect handling, per-table enablement, and
  connection limits on the free plan — for a difference spectators will not perceive.
- **Third-place playoffs, consolation rounds, re-seeding between rounds.**

## 2. Data model

Three tables, following parent spec §5, plus two columns it does not name.

| Table | Key columns |
|---|---|
| `tournaments` | id, name, format (`single_elim`\|`double_elim`), status (`setup`\|`live`\|`complete`), event_id → events (nullable), created_by → profiles, created_at, started_at, completed_at |
| `tournament_players` | (tournament_id, profile_id) PK, seed; unique (tournament_id, seed) |
| `tournament_matches` | id, tournament_id, bracket (`winners`\|`losers`\|`grand_final`), round, position, player1_id, player2_id, player1_score, player2_score, winner_id, winner_advances_to → self, winner_advances_slot, loser_advances_to → self, loser_advances_slot; unique (tournament_id, bracket, round, position) |

**`winner_advances_slot` / `loser_advances_slot`** (`1` or `2`) are the additions.
The parent spec implies deriving the target slot from position parity at advancement
time; storing it makes the bracket wiring explicit data produced once by the
generator and verified by its tests, rather than a parity rule re-derived in a
different module at a different time.

`event_id` is `on delete set null` — deleting an event must not delete the
tournament that happened at it. Everything under a tournament cascades from it.

The self-referencing advance links are populated in a **second pass**: the generator
assigns ids client-side, the rows are inserted with null links, then a single update
wires them. This avoids making the foreign keys `DEFERRABLE`, which would weaken
them permanently to serve one insert.

## 3. Ratings: the ladder is a replay

Parent spec §6.4 makes a tournament result authoritative and immediately rating-
affecting, with no opponent confirmation. That removes the safety net every other
match has, so corrections must be exact.

**Rating is path-dependent.** The K-factor depends on a player's `matches_played`
*at the time*, and the expected score depends on both ratings *at the time*. So
correcting a result by subtracting the old deltas and adding new ones produces a
ladder that does not match what would have happened, and the discrepancy compounds
through every later match those players played.

Therefore: **a correction rewrites the result and then replays the entire confirmed
match history from starting ratings.** All ratings, all `rating_history` rows and
all per-match delta columns are rebuilt in one transaction.

- The replay itself is a pure function in `lib/rating.ts`, reusing the existing
  `ratingUpdate`, so the ladder has exactly one definition of the maths.
- Every player starts at `STARTING_RATING` (450) with `matches_played` 0, and the
  replay consumes **every** `confirmed` match — ordinary and tournament alike, since
  a tournament result is an ordinary `matches` row carrying a `tournament_match_id`.
  `pending`, `disputed` and `rejected` matches are skipped, matching §6.3.
- Order is `confirmed_at` then `id`, so a replay is deterministic and repeatable.
- Cost is O(confirmed matches) — hundreds of rows at club scale, milliseconds.
- The invariant this buys: **current ratings always equal a replay of confirmed
  results.** Nothing can drift.
- It also gives the existing admin dispute-resolution path a correction route it
  has never had.

**Serialization.** Every rating write — normal confirmation, tournament result, and
recompute — takes the same transaction-scoped advisory lock
(`pg_advisory_xact_lock` on a fixed key). Without it a recompute interleaving with
a confirmation would write a ladder computed from a stale snapshot. This adds the
lock to the existing `apply_match_confirmation`, which is a deliberate change to
shipped code.

## 4. Correcting and voiding a result

Both are the same underlying operation, differing only in what is written back.

- **Score-only correction** (winner unchanged): always permitted. Updates the
  tournament match and its linked rated match, then recomputes.
- **Winner change** and **void**: permitted only while the downstream match the
  winner fed into has *not* itself been decided. Otherwise the admin is told to void
  the downstream result first. Cascading an un-advancement through an already-played
  subtree is a genuinely different feature, and silently discarding those results
  would be worse than refusing.
- Voiding deletes the rated match, clears the tournament match's result, removes the
  player from the downstream slot, and recomputes.

**Byes never create a rated match.** A first-round match with one player has no
opponent to rate against; it resolves at generation time and its winner advances
immediately.

## 5. Live bracket without Realtime

While `status = 'live'`, a small client component calls `router.refresh()` on a
ten-second interval and stops when the status changes. It is the only client
component in the feature; every page stays server-rendered.

## 6. Bracket engine (`lib/bracket.ts`, pure, test-first)

- `generateSingleElim(players: SeededPlayer[]): GeneratedMatch[]` — bracket size `B`
  is the next power of two ≥ N. Round one is laid out by standard seeding, so seed
  `s` faces seed `B + 1 − s`: 1 plays B, 2 plays B−1, and so on. With N < B the
  bottom `B − N` of those slots are empty, which places the byes on exactly the top
  `B − N` seeds — the property the tests assert, rather than a separate bye rule
  that could disagree with the pairing rule. Every match is wired with
  `winner_advances_to` / `winner_advances_slot`; bye matches are pre-resolved at
  generation and their winners cascaded into round two.
- `advanceWinner(matches, matchId, winnerId): GeneratedMatch[]` — places the winner
  in the target slot, returning the updated tree.
- `bracketRounds(matches): GeneratedMatch[][]` — grouping for display.

These are pure functions over plain data, tested without a database for every field
size 3 through 32 — the sizes where bye placement and cascade errors actually occur.

## 7. Trust boundary and RLS

- `tournaments`, `tournament_players`, `tournament_matches`: approved members read
  all; **no client write policy of any kind**.
- Every write — create, seed, start, record result, correct, void — goes through
  `SECURITY DEFINER` functions granted to `authenticated` that check `is_admin()`
  internally, mirroring `update_display_name` from Phase 3.
- Recording a result touches five tables (matches, profiles ×2, rating_history,
  tournament_matches, tournaments) and must be atomic; it is not expressible as a
  client-side write, which is exactly why the existing `matches` insert policy
  forbids rows carrying a `tournament_match_id`. That column was reserved for this.

## 8. Error handling

Follows the established pattern: server actions redirect with `?error=`.

- Starting with fewer than 3 entrants → refused.
- Recording a result on a match missing a player, already decided, or in a
  non-`live` tournament → refused.
- Winner change or void blocked by a decided downstream match → explicit message
  naming what must be voided first.
- A member reaching an admin route → redirected to `/tournaments`.

## 9. Testing

- **Unit (test-first):** `lib/bracket.ts` across field sizes 3–32 — correct match
  count, every player placed once, byes only in round one and only for top seeds,
  advance links forming a single tree with one final; `advanceWinner` slot placement;
  and the rating replay reproducing a known sequence exactly.
- **RLS integration:** a member cannot insert a tournament, cannot write a
  tournament match, and cannot call the admin-only functions; an approved member can
  read brackets; a pending user sees none.
- **E2E:** admin creates a 4-player tournament, seeds, starts, enters two semi-final
  results and a final, sees a champion, and both finalists' ratings have moved.

## 10. Migrations

- `0010_tournaments.sql` — enums, three tables, indexes, read policies.
- `0011_tournament_functions.sql` — the `SECURITY DEFINER` write functions, plus the
  advisory lock added to `apply_match_confirmation`.
