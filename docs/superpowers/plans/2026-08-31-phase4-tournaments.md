# SECBL Phase 4 (Tournaments & Brackets) Implementation Plan

> **STATUS: COMPLETED 2026-09-01.** All ten tasks implemented via subagent-driven
> development and merged to `master`. **Not yet deployed** — the code is on `master`
> and every migration is applied to the live database, but production still runs the
> Phase 3 build. Progress is tracked by the conventional commits, not the checkboxes.
>
> **Open follow-up that needs a human:**
> - **Check Supabase → Settings → API → Max Rows.** `buildRecomputePayload` reads every
>   confirmed match, and `.range(0, 99999)` does NOT bypass PostgREST's `db-max-rows`,
>   which is a hard server-side cap defaulting to **1000**. If it is at the default,
>   then at ~1000 confirmed matches the payload silently truncates, the concurrency
>   guard sees a count mismatch, and tournament result entry refuses **permanently**
>   with "the ladder changed while this result was being prepared — try again", which
>   no retry can clear. Either raise that setting or implement real windowed pagination.
>   Fail-closed, not corrupting — but badly misleading when it hits.
>
> **Deferred, none blocking:**
> - Double elimination (schema keeps `bracket` / `loser_advances_to` so it is additive).
> - Supabase Realtime (interval refresh instead), manual seed reordering, third-place
>   playoffs.
> - Spec §3 claims this gives the admin dispute path a rating-correction route. It does
>   not — `apply_rating_recompute` has no caller outside the tournament functions.
> - Rated tournament matches are hardcoded to game type `8ball`.
> - `start_tournament` verifies every bracket player is an entrant, but not that every
>   entrant is in the bracket; and entrant `status` is not re-checked at start, so a
>   member suspended between save and start still plays and still rates.
> - `CardTitle` is now an `h3`, so card pages have `h1 → h3` level skips (no `h2`s).
> - **Accepted trust decision:** the tournament functions must be granted to
>   `authenticated` for `auth.uid()` to resolve, and they pass the rating payload
>   through unvalidated — so an admin session can write arbitrary ratings by calling the
>   API directly. Not durable: the next genuine recompute rebuilds the whole ladder from
>   the replay.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Single-elimination tournaments for 3–32 players with byes: an admin seeds and starts a bracket, the director enters results, winners advance automatically, and every result rates immediately — with an exact correction path.

**Architecture:** Bracket generation and advancement are pure TypeScript in `lib/bracket.ts`, written test-first. Ratings become a **replay**: `lib/rating.ts` gains a pure `replayRatings` that recomputes the whole ladder from confirmed match history, so a corrected tournament result yields exactly the ladder that would have existed. Every tournament write goes through a `SECURITY DEFINER` function (the tables carry no client write policy at all), and all rating writes serialize on one advisory lock. The live bracket refreshes on an interval rather than using Realtime.

**Tech Stack:** Next.js 16 (App Router, TypeScript), Tailwind v4 + shadcn/ui, Supabase (`@supabase/supabase-js`, `@supabase/ssr`), Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-08-31-tournaments-design.md`

## Global Constraints

- TypeScript strict; App Router; server components by default; all mutations via server actions.
- **The ladder is a replay.** Current ratings must always equal `replayRatings` over confirmed matches ordered by `confirmed_at, id`. Never hand-patch a rating.
- Every rating-affecting write takes `pg_advisory_xact_lock(hashtext('secbl_ratings'))` as its first statement. This includes the existing `apply_match_confirmation`.
- Tournament tables get **read policies only**. All writes go through `SECURITY DEFINER` functions that check `public.is_admin()` internally.
- Byes never create a rated match — there is no opponent to rate against.
- Event times and dates go through `lib/events.ts` (`clubDateOf`) — the server runs UTC, the club is US Eastern.
- Every UI color from theme tokens (`--primary` felt green, `--secondary` gold). No hardcoded colors.
- Server actions report failure by redirecting with `?error=<encoded>`; never throw to an error boundary.
- Conventional commits. `npm run build` and `npm test` must pass before every commit.
- Existing files this plan modifies were written in Phases 1–3 — read them before editing; merge, never duplicate, imports.

## File Structure

| File | Responsibility |
|---|---|
| `supabase/migrations/0010_tournaments.sql` | enums, 3 tables, indexes, read-only RLS |
| `supabase/migrations/0011_rating_recompute.sql` | `apply_rating_recompute`, advisory lock added to `apply_match_confirmation` |
| `supabase/migrations/0012_tournament_functions.sql` | lifecycle + result + void `SECURITY DEFINER` functions |
| `lib/types.ts` (modify) | `Tournament`, `TournamentPlayer`, `TournamentMatch` + enums |
| `lib/bracket.ts` | **pure** seeding, generation, advancement, round grouping |
| `tests/bracket.test.ts` | bracket engine tests (written first) |
| `lib/rating.ts` (modify) | `replayRatings` — pure ladder replay |
| `tests/rating.test.ts` (modify) | replay tests (written first) |
| `lib/recompute.ts` | fetches confirmed history, replays, returns the payload the SQL functions take |
| `app/(member)/tournaments/page.tsx` | tournament list |
| `app/(member)/tournaments/[id]/page.tsx` | bracket view + result entry |
| `app/(member)/tournaments/[id]/refresh.tsx` | client component: interval `router.refresh()` while live |
| `app/(member)/tournaments/new/page.tsx` | admin create |
| `app/(member)/tournaments/[id]/setup/page.tsx` | admin entrants + seeds + start |
| `app/(member)/tournaments/actions.ts` | all tournament server actions |
| `tests/rls.integration.test.ts` (modify) | tournament policy regression tests |
| `e2e/tournament.spec.ts` | 4-player tournament end to end |

---

### Task 1: Schema + row types

**Files:**
- Create: `supabase/migrations/0010_tournaments.sql`
- Modify: `lib/types.ts` (append only)

**Interfaces:**
- Consumes: `public.is_approved()`, `public.is_admin()`, `profiles`, `events` (Phases 1–3).
- Produces: tables `tournaments`, `tournament_players`, `tournament_matches`; enums `tournament_format`, `tournament_status`, `bracket_side`; TS types `Tournament`, `TournamentPlayer`, `TournamentMatch`, `TournamentFormat`, `TournamentStatus`, `BracketSide`.

- [ ] **Step 1: Create `supabase/migrations/0010_tournaments.sql`**

```sql
create type public.tournament_format as enum ('single_elim','double_elim');
create type public.tournament_status as enum ('setup','live','complete');
create type public.bracket_side as enum ('winners','losers','grand_final');

create table public.tournaments (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  format public.tournament_format not null default 'single_elim',
  status public.tournament_status not null default 'setup',
  -- Deleting an event must not delete the tournament played at it.
  event_id uuid references public.events(id) on delete set null,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz
);

create index tournaments_status_idx on public.tournaments (status, created_at desc);

create table public.tournament_players (
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  seed int not null check (seed > 0),
  primary key (tournament_id, profile_id),
  unique (tournament_id, seed)
);

create table public.tournament_matches (
  id uuid primary key,
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  bracket public.bracket_side not null default 'winners',
  round int not null check (round > 0),
  position int not null check (position >= 0),
  player1_id uuid references public.profiles(id),
  player2_id uuid references public.profiles(id),
  player1_score int check (player1_score >= 0),
  player2_score int check (player2_score >= 0),
  winner_id uuid references public.profiles(id),
  -- Wired in a second pass after insert, so the self-FK never needs to be
  -- DEFERRABLE (which would weaken it permanently to serve one insert).
  winner_advances_to uuid references public.tournament_matches(id) on delete set null,
  winner_advances_slot smallint check (winner_advances_slot in (1,2)),
  loser_advances_to uuid references public.tournament_matches(id) on delete set null,
  loser_advances_slot smallint check (loser_advances_slot in (1,2)),
  created_at timestamptz not null default now(),
  unique (tournament_id, bracket, round, position),
  check (winner_id is null or winner_id in (player1_id, player2_id))
);

create index tournament_matches_tournament_idx
  on public.tournament_matches (tournament_id, round, position);

alter table public.tournaments enable row level security;
alter table public.tournament_players enable row level security;
alter table public.tournament_matches enable row level security;

-- READ ONLY for clients. Every write goes through a SECURITY DEFINER function
-- that checks is_admin() internally: recording one result touches five tables
-- and cannot be expressed as a client-side write.
create policy "approved read tournaments"
  on public.tournaments for select to authenticated using (public.is_approved());
create policy "approved read tournament players"
  on public.tournament_players for select to authenticated using (public.is_approved());
create policy "approved read tournament matches"
  on public.tournament_matches for select to authenticated using (public.is_approved());
```

Note `tournament_matches.id` has **no default** — the generator assigns ids in TypeScript so advance links can reference them before insert.

- [ ] **Step 2: Apply the migration**

Load the tools: `ToolSearch` with query `"select:mcp__claude_ai_Supabase__apply_migration,mcp__claude_ai_Supabase__execute_sql"`.
Apply with `apply_migration`, project_id `azetukujqrqyxfzohfmd`, name `tournaments`, and the SQL above.

- [ ] **Step 3: Verify**

Run with `execute_sql` on `azetukujqrqyxfzohfmd`:

```sql
select tablename, count(*) as policies from pg_policies
where schemaname='public' and tablename like 'tournament%'
group by tablename order by tablename;
```

Expected: `tournament_matches` 1, `tournament_players` 1, `tournaments` 1 — read policies only, no write policies.

- [ ] **Step 4: Append to `lib/types.ts`** (leave every existing declaration untouched)

```ts
export type TournamentFormat = "single_elim" | "double_elim";
export type TournamentStatus = "setup" | "live" | "complete";
export type BracketSide = "winners" | "losers" | "grand_final";

export interface Tournament {
  id: string;
  name: string;
  format: TournamentFormat;
  status: TournamentStatus;
  event_id: string | null;
  created_by: string;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

export interface TournamentPlayer {
  tournament_id: string;
  profile_id: string;
  seed: number;
}

export interface TournamentMatch {
  id: string;
  tournament_id: string;
  bracket: BracketSide;
  round: number;
  position: number;
  player1_id: string | null;
  player2_id: string | null;
  player1_score: number | null;
  player2_score: number | null;
  winner_id: string | null;
  winner_advances_to: string | null;
  winner_advances_slot: 1 | 2 | null;
  loser_advances_to: string | null;
  loser_advances_slot: 1 | 2 | null;
  created_at: string;
}
```

- [ ] **Step 5: Build and commit**

Run: `npm run build` — expect success.

```bash
git add supabase/migrations/0010_tournaments.sql lib/types.ts
git commit -m "feat: tournaments schema with read-only RLS"
```

---

### Task 2: Bracket engine (pure, TDD)

**Files:**
- Create: `tests/bracket.test.ts`, `lib/bracket.ts`

**Interfaces:**
- Consumes: nothing (pure module).
- Produces from `@/lib/bracket`: `seedOrder(size: number): number[]`; `bracketSize(playerCount: number): number`; `generateSingleElim(playerIds: string[], newId: () => string): GeneratedMatch[]`; `advanceWinner(matches: GeneratedMatch[], matchId: string, winnerId: string): GeneratedMatch[]`; `bracketRounds(matches: GeneratedMatch[]): GeneratedMatch[][]`. Interface `GeneratedMatch { id: string; round: number; position: number; player1_id: string | null; player2_id: string | null; winner_id: string | null; winner_advances_to: string | null; winner_advances_slot: 1 | 2 | null }`.

`playerIds` is ordered by seed: index 0 is seed 1. `newId` is injected so tests are deterministic.

- [ ] **Step 1: Write the failing tests — `tests/bracket.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import {
  advanceWinner,
  bracketRounds,
  bracketSize,
  generateSingleElim,
  type GeneratedMatch,
} from "@/lib/bracket";

// Deterministic ids so assertions are readable.
function idFactory() {
  let n = 0;
  return () => `m${n++}`;
}
const players = (n: number) => Array.from({ length: n }, (_, i) => `p${i + 1}`);

describe("bracketSize", () => {
  it("is the next power of two at or above the field", () => {
    expect(bracketSize(3)).toBe(4);
    expect(bracketSize(4)).toBe(4);
    expect(bracketSize(5)).toBe(8);
    expect(bracketSize(16)).toBe(16);
    expect(bracketSize(17)).toBe(32);
    expect(bracketSize(32)).toBe(32);
  });
});

describe("seedOrder", () => {
  it("pairs seed s against seed size+1-s", async () => {
    const { seedOrder } = await import("@/lib/bracket");
    expect(seedOrder(2)).toEqual([1, 2]);
    expect(seedOrder(4)).toEqual([1, 4, 2, 3]);
    expect(seedOrder(8)).toEqual([1, 8, 4, 5, 2, 7, 3, 6]);
  });

  it("puts every seed in exactly once", async () => {
    const { seedOrder } = await import("@/lib/bracket");
    const order = seedOrder(32);
    expect(new Set(order).size).toBe(32);
    expect(Math.min(...order)).toBe(1);
    expect(Math.max(...order)).toBe(32);
  });
});

describe("generateSingleElim", () => {
  it("builds a full tree for a power-of-two field", () => {
    const matches = generateSingleElim(players(4), idFactory());
    // 4 players -> 2 first-round matches + 1 final.
    expect(matches).toHaveLength(3);
    const r1 = matches.filter((m) => m.round === 1);
    expect(r1).toHaveLength(2);
    // Standard seeding: 1v4 and 2v3.
    expect([r1[0].player1_id, r1[0].player2_id]).toEqual(["p1", "p4"]);
    expect([r1[1].player1_id, r1[1].player2_id]).toEqual(["p2", "p3"]);
  });

  it("wires every non-final match into the next round", () => {
    const matches = generateSingleElim(players(8), idFactory());
    const byId = new Map(matches.map((m) => [m.id, m]));
    const finals = matches.filter((m) => m.winner_advances_to === null);
    expect(finals).toHaveLength(1);
    for (const m of matches.filter((x) => x.winner_advances_to !== null)) {
      const target = byId.get(m.winner_advances_to!)!;
      expect(target.round).toBe(m.round + 1);
      expect(m.winner_advances_slot === 1 || m.winner_advances_slot === 2).toBe(true);
    }
  });

  it("gives byes to the top seeds and resolves them immediately", () => {
    // 5 players in a bracket of 8 -> 3 byes, for seeds 1, 2 and 3.
    const matches = generateSingleElim(players(5), idFactory());
    const r1 = matches.filter((m) => m.round === 1);
    const byes = r1.filter((m) => m.player1_id !== null && m.player2_id === null);
    expect(byes.map((m) => m.player1_id).sort()).toEqual(["p1", "p2", "p3"]);
    // A bye is already decided, and its winner is standing in round two.
    for (const bye of byes) {
      expect(bye.winner_id).toBe(bye.player1_id);
      const target = matches.find((m) => m.id === bye.winner_advances_to)!;
      const slot = bye.winner_advances_slot === 1 ? target.player1_id : target.player2_id;
      expect(slot).toBe(bye.player1_id);
    }
  });

  it("never marks a contested match as already won", () => {
    const matches = generateSingleElim(players(5), idFactory());
    const contested = matches.filter(
      (m) => m.player1_id !== null && m.player2_id !== null
    );
    for (const m of contested) expect(m.winner_id).toBeNull();
  });

  it.each([3, 4, 5, 6, 7, 8, 9, 12, 15, 16, 17, 24, 31, 32])(
    "produces a consistent tree for %i players",
    (n) => {
      const matches = generateSingleElim(players(n), idFactory());
      const size = bracketSize(n);
      // A single-elim bracket of size B always has B-1 matches.
      expect(matches).toHaveLength(size - 1);
      // Every entrant appears exactly once in round one.
      const placed = matches
        .filter((m) => m.round === 1)
        .flatMap((m) => [m.player1_id, m.player2_id])
        .filter((x): x is string => x !== null);
      expect(placed.sort()).toEqual(players(n).sort());
      // Byes only ever occur in round one.
      const laterEmpty = matches.filter(
        (m) => m.round > 1 && m.player1_id !== null && m.player2_id === null && m.winner_id !== null
      );
      expect(laterEmpty).toHaveLength(0);
      // Exactly one final, and the tree is connected.
      expect(matches.filter((m) => m.winner_advances_to === null)).toHaveLength(1);
    }
  );

  it("rejects a field smaller than three", () => {
    expect(() => generateSingleElim(players(2), idFactory())).toThrow();
  });
});

describe("advanceWinner", () => {
  it("places the winner in the target slot", () => {
    const matches = generateSingleElim(players(4), idFactory());
    const first = matches.find((m) => m.round === 1 && m.position === 0)!;
    const updated = advanceWinner(matches, first.id, "p1");
    const target = updated.find((m) => m.id === first.winner_advances_to)!;
    const slot = first.winner_advances_slot === 1 ? target.player1_id : target.player2_id;
    expect(slot).toBe("p1");
    expect(updated.find((m) => m.id === first.id)!.winner_id).toBe("p1");
  });

  it("does not mutate the input", () => {
    const matches = generateSingleElim(players(4), idFactory());
    const snapshot = JSON.stringify(matches);
    advanceWinner(matches, matches[0].id, matches[0].player1_id!);
    expect(JSON.stringify(matches)).toBe(snapshot);
  });

  it("refuses a winner who is not in the match", () => {
    const matches = generateSingleElim(players(4), idFactory());
    expect(() => advanceWinner(matches, matches[0].id, "p3")).toThrow();
  });
});

describe("bracketRounds", () => {
  it("groups by round in order, each sorted by position", () => {
    const matches = generateSingleElim(players(8), idFactory());
    const rounds = bracketRounds(matches);
    expect(rounds.map((r) => r.length)).toEqual([4, 2, 1]);
    for (const round of rounds) {
      const positions = round.map((m) => m.position);
      expect(positions).toEqual([...positions].sort((a, b) => a - b));
    }
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/bracket.test.ts`
Expected: FAIL — cannot resolve `@/lib/bracket`.

- [ ] **Step 3: Implement `lib/bracket.ts`**

```ts
// Single-elimination bracket generation and advancement. Pure functions over
// plain data so the fiddly parts — bye placement, advance wiring — are tested
// without a database.

export interface GeneratedMatch {
  id: string;
  round: number;
  position: number;
  player1_id: string | null;
  player2_id: string | null;
  winner_id: string | null;
  winner_advances_to: string | null;
  winner_advances_slot: 1 | 2 | null;
}

export const MIN_PLAYERS = 3;
export const MAX_PLAYERS = 32;

export function bracketSize(playerCount: number): number {
  let size = 2;
  while (size < playerCount) size *= 2;
  return size;
}

// Standard bracket order: seed s meets seed size+1-s. Built by repeatedly
// mirroring, which is what makes 1 and 2 meet only in the final.
export function seedOrder(size: number): number[] {
  let order = [1];
  while (order.length < size) {
    const next: number[] = [];
    const mirror = order.length * 2 + 1;
    for (const seed of order) next.push(seed, mirror - seed);
    order = next;
  }
  return order;
}

export function generateSingleElim(
  playerIds: string[],
  newId: () => string
): GeneratedMatch[] {
  const n = playerIds.length;
  if (n < MIN_PLAYERS || n > MAX_PLAYERS) {
    throw new Error(`a tournament needs ${MIN_PLAYERS}-${MAX_PLAYERS} players, got ${n}`);
  }
  const size = bracketSize(n);
  const rounds = Math.log2(size);

  // Build every round's empty matches first, so advance links can point at
  // rows that already have ids.
  const matches: GeneratedMatch[] = [];
  for (let round = 1; round <= rounds; round++) {
    const count = size / 2 ** round;
    for (let position = 0; position < count; position++) {
      matches.push({
        id: newId(),
        round,
        position,
        player1_id: null,
        player2_id: null,
        winner_id: null,
        winner_advances_to: null,
        winner_advances_slot: null,
      });
    }
  }
  const at = (round: number, position: number) =>
    matches.find((m) => m.round === round && m.position === position)!;

  // Wire each match into the next round. Positions 0,1 feed slots 1,2 of the
  // parent at position 0; 2,3 feed position 1; and so on.
  for (let round = 1; round < rounds; round++) {
    const count = size / 2 ** round;
    for (let position = 0; position < count; position++) {
      const match = at(round, position);
      match.winner_advances_to = at(round + 1, Math.floor(position / 2)).id;
      match.winner_advances_slot = position % 2 === 0 ? 1 : 2;
    }
  }

  // Seat round one by standard seeding. A seed above the field size is an
  // empty slot, which is exactly where the byes land — the top B-n seeds.
  const order = seedOrder(size);
  const seatOf = (seed: number) => (seed <= n ? playerIds[seed - 1] : null);
  for (let position = 0; position < size / 2; position++) {
    const match = at(1, position);
    match.player1_id = seatOf(order[position * 2]);
    match.player2_id = seatOf(order[position * 2 + 1]);
  }

  // Resolve byes now: a round-one match with one player has nobody to play.
  // Byes cannot reach round two on both sides of a match, because the field is
  // always more than half the bracket, so no cascade beyond this pass exists.
  for (const match of matches.filter((m) => m.round === 1)) {
    const solo =
      match.player1_id !== null && match.player2_id === null
        ? match.player1_id
        : match.player2_id !== null && match.player1_id === null
          ? match.player2_id
          : null;
    if (solo === null) continue;
    match.winner_id = solo;
    const target = matches.find((m) => m.id === match.winner_advances_to);
    if (target) {
      if (match.winner_advances_slot === 1) target.player1_id = solo;
      else target.player2_id = solo;
    }
  }

  return matches;
}

export function advanceWinner(
  matches: GeneratedMatch[],
  matchId: string,
  winnerId: string
): GeneratedMatch[] {
  const source = matches.find((m) => m.id === matchId);
  if (!source) throw new Error(`match ${matchId} not in this bracket`);
  if (winnerId !== source.player1_id && winnerId !== source.player2_id) {
    throw new Error("winner must be one of the two players in the match");
  }
  return matches.map((m) => {
    if (m.id === source.id) return { ...m, winner_id: winnerId };
    if (m.id !== source.winner_advances_to) return m;
    return source.winner_advances_slot === 1
      ? { ...m, player1_id: winnerId }
      : { ...m, player2_id: winnerId };
  });
}

export function bracketRounds(matches: GeneratedMatch[]): GeneratedMatch[][] {
  const rounds = [...new Set(matches.map((m) => m.round))].sort((a, b) => a - b);
  return rounds.map((round) =>
    matches.filter((m) => m.round === round).sort((a, b) => a.position - b.position)
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/bracket.test.ts`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add tests/bracket.test.ts lib/bracket.ts
git commit -m "feat: single-elimination bracket engine"
```

---

### Task 3: Rating replay (pure, TDD)

**Files:**
- Modify: `tests/rating.test.ts` (append), `lib/rating.ts` (append)

**Interfaces:**
- Consumes: existing `ratingUpdate`, `STARTING_RATING` from `@/lib/rating`.
- Produces from `@/lib/rating`: `replayRatings(matches: ReplayMatch[], playerIds: string[]): ReplayResult`. Types `ReplayMatch { id: string; reporter_id: string; opponent_id: string; winner_id: string }`, `ReplayStanding { profile_id: string; rating: number; matches_played: number }`, `ReplayHistoryRow { profile_id: string; match_id: string; rating_before: number; rating_after: number }`, `ReplayDelta { match_id: string; rating_delta_reporter: number; rating_delta_opponent: number }`, `ReplayResult { standings: ReplayStanding[]; history: ReplayHistoryRow[]; deltas: ReplayDelta[] }`.

`matches` must already be ordered `confirmed_at, id`.

- [ ] **Step 1: Append the failing tests to `tests/rating.test.ts`**

Add `replayRatings` to the existing import from `@/lib/rating`, then append:

```ts
describe("replayRatings", () => {
  const ids = ["a", "b"];

  it("reproduces a single match exactly as ratingUpdate would", () => {
    const result = replayRatings(
      [{ id: "m1", reporter_id: "a", opponent_id: "b", winner_id: "a" }],
      ids
    );
    const expected = ratingUpdate(STARTING_RATING, STARTING_RATING, true, 0);
    const a = result.standings.find((s) => s.profile_id === "a")!;
    const b = result.standings.find((s) => s.profile_id === "b")!;
    expect(a.rating).toBe(expected.newRating);
    expect(b.rating).toBe(STARTING_RATING - expected.delta);
    expect(a.matches_played).toBe(1);
    expect(b.matches_played).toBe(1);
  });

  it("computes both players from the same pre-match snapshot", () => {
    // If it used A's updated rating when computing B, the deltas would not be
    // equal and opposite for an even first meeting.
    const { deltas } = replayRatings(
      [{ id: "m1", reporter_id: "a", opponent_id: "b", winner_id: "a" }],
      ids
    );
    expect(deltas[0].rating_delta_reporter).toBe(-deltas[0].rating_delta_opponent);
  });

  it("is deterministic and depends on order", () => {
    const forward = replayRatings(
      [
        { id: "m1", reporter_id: "a", opponent_id: "b", winner_id: "a" },
        { id: "m2", reporter_id: "a", opponent_id: "b", winner_id: "b" },
      ],
      ids
    );
    const again = replayRatings(
      [
        { id: "m1", reporter_id: "a", opponent_id: "b", winner_id: "a" },
        { id: "m2", reporter_id: "a", opponent_id: "b", winner_id: "b" },
      ],
      ids
    );
    expect(again.standings).toEqual(forward.standings);
    // Two results that cancel do not return to the start, because the second
    // match is rated against ratings the first one moved.
    const a = forward.standings.find((s) => s.profile_id === "a")!;
    expect(a.matches_played).toBe(2);
  });

  it("emits one history row per player per match", () => {
    const { history } = replayRatings(
      [
        { id: "m1", reporter_id: "a", opponent_id: "b", winner_id: "a" },
        { id: "m2", reporter_id: "b", opponent_id: "a", winner_id: "b" },
      ],
      ids
    );
    expect(history).toHaveLength(4);
    expect(history.filter((h) => h.match_id === "m1")).toHaveLength(2);
    expect(history.every((h) => h.rating_before !== h.rating_after)).toBe(true);
  });

  it("starts everyone at the documented starting rating", () => {
    const { standings } = replayRatings([], ["a", "b", "c"]);
    expect(standings).toHaveLength(3);
    for (const s of standings) {
      expect(s.rating).toBe(STARTING_RATING);
      expect(s.matches_played).toBe(0);
    }
  });

  it("rates a player who appears only as an opponent", () => {
    const { standings } = replayRatings(
      [{ id: "m1", reporter_id: "a", opponent_id: "c", winner_id: "c" }],
      ["a", "b", "c"]
    );
    expect(standings.find((s) => s.profile_id === "c")!.matches_played).toBe(1);
    expect(standings.find((s) => s.profile_id === "b")!.rating).toBe(STARTING_RATING);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/rating.test.ts`
Expected: FAIL — `replayRatings` is not exported.

- [ ] **Step 3: Append the implementation to `lib/rating.ts`**

```ts
export interface ReplayMatch {
  id: string;
  reporter_id: string;
  opponent_id: string;
  winner_id: string;
}

export interface ReplayStanding {
  profile_id: string;
  rating: number;
  matches_played: number;
}

export interface ReplayHistoryRow {
  profile_id: string;
  match_id: string;
  rating_before: number;
  rating_after: number;
}

export interface ReplayDelta {
  match_id: string;
  rating_delta_reporter: number;
  rating_delta_opponent: number;
}

export interface ReplayResult {
  standings: ReplayStanding[];
  history: ReplayHistoryRow[];
  deltas: ReplayDelta[];
}

// Rebuilds the whole ladder from confirmed match history.
//
// Rating is path-dependent — K falls after a player's 10th match, and the
// expected score depends on both ratings at that moment — so a correction
// cannot be applied by subtracting old deltas and adding new ones. Replaying
// is both exact and simpler. `matches` must already be ordered by
// (confirmed_at, id) for the result to be reproducible.
export function replayRatings(
  matches: ReplayMatch[],
  playerIds: string[]
): ReplayResult {
  const standings = new Map<string, ReplayStanding>();
  const ensure = (id: string): ReplayStanding => {
    let standing = standings.get(id);
    if (!standing) {
      standing = { profile_id: id, rating: STARTING_RATING, matches_played: 0 };
      standings.set(id, standing);
    }
    return standing;
  };
  for (const id of playerIds) ensure(id);

  const history: ReplayHistoryRow[] = [];
  const deltas: ReplayDelta[] = [];

  for (const match of matches) {
    const reporter = ensure(match.reporter_id);
    const opponent = ensure(match.opponent_id);
    const reporterWon = match.winner_id === match.reporter_id;

    // Both sides are computed from the pre-match snapshot, so the result does
    // not depend on which player is updated first.
    const reporterBefore = reporter.rating;
    const opponentBefore = opponent.rating;
    const reporterResult = ratingUpdate(
      reporterBefore,
      opponentBefore,
      reporterWon,
      reporter.matches_played
    );
    const opponentResult = ratingUpdate(
      opponentBefore,
      reporterBefore,
      !reporterWon,
      opponent.matches_played
    );

    reporter.rating = reporterResult.newRating;
    opponent.rating = opponentResult.newRating;
    reporter.matches_played += 1;
    opponent.matches_played += 1;

    history.push(
      {
        profile_id: reporter.profile_id,
        match_id: match.id,
        rating_before: reporterBefore,
        rating_after: reporterResult.newRating,
      },
      {
        profile_id: opponent.profile_id,
        match_id: match.id,
        rating_before: opponentBefore,
        rating_after: opponentResult.newRating,
      }
    );
    deltas.push({
      match_id: match.id,
      rating_delta_reporter: reporterResult.newRating - reporterBefore,
      rating_delta_opponent: opponentResult.newRating - opponentBefore,
    });
  }

  return { standings: [...standings.values()], history, deltas };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/rating.test.ts`
Expected: all PASS, including the pre-existing rating tests.

- [ ] **Step 5: Commit**

```bash
git add tests/rating.test.ts lib/rating.ts
git commit -m "feat: pure rating replay over confirmed match history"
```

---

### Task 4: Recompute plumbing (SQL + advisory lock)

**Files:**
- Create: `supabase/migrations/0011_rating_recompute.sql`, `lib/recompute.ts`

**Interfaces:**
- Consumes: `replayRatings` (Task 3), `createServiceClient` from `@/lib/supabase/server`.
- Produces: Postgres function `public.apply_rating_recompute(p_standings jsonb, p_history jsonb, p_deltas jsonb)`; `buildRecomputePayload(service: SupabaseClient, extra?: ReplayMatch[], excludeMatchId?: string): Promise<RecomputePayload>` from `@/lib/recompute`, where `RecomputePayload = { p_standings: ReplayStanding[]; p_history: ReplayHistoryRow[]; p_deltas: ReplayDelta[] }`.

- [ ] **Step 1: Create `supabase/migrations/0011_rating_recompute.sql`**

```sql
-- Rewrites the entire ladder from a replay computed by lib/rating.ts.
-- The maths lives in TypeScript so there is exactly one definition of it;
-- this function's only job is to land the result atomically.
create or replace function public.apply_rating_recompute(
  p_standings jsonb,
  p_history jsonb,
  p_deltas jsonb
) returns void
language plpgsql security definer set search_path = public
as $$
begin
  -- Serializes against every other rating write. Without it a recompute could
  -- interleave with a confirmation and persist a ladder built from a stale read.
  perform pg_advisory_xact_lock(hashtext('secbl_ratings'));

  update profiles p
  set rating = s.rating,
      matches_played = s.matches_played
  from jsonb_to_recordset(p_standings)
    as s(profile_id uuid, rating int, matches_played int)
  where p.id = s.profile_id;

  delete from rating_history;
  insert into rating_history (profile_id, match_id, rating_before, rating_after)
  select h.profile_id, h.match_id, h.rating_before, h.rating_after
  from jsonb_to_recordset(p_history)
    as h(profile_id uuid, match_id uuid, rating_before int, rating_after int);

  update matches m
  set rating_delta_reporter = d.rating_delta_reporter,
      rating_delta_opponent = d.rating_delta_opponent
  from jsonb_to_recordset(p_deltas)
    as d(match_id uuid, rating_delta_reporter int, rating_delta_opponent int)
  where m.id = d.match_id;
end;
$$;

revoke execute on function public.apply_rating_recompute(jsonb, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.apply_rating_recompute(jsonb, jsonb, jsonb)
  to service_role;

-- Same body as before plus the advisory lock, so ordinary confirmations
-- serialize against recomputes.
create or replace function public.apply_match_confirmation(
  p_match_id uuid,
  p_reporter_delta int,
  p_opponent_delta int
) returns void
language plpgsql security definer set search_path = public
as $$
declare
  m matches%rowtype;
  r_before int;
  o_before int;
  r_after int;
  o_after int;
begin
  perform pg_advisory_xact_lock(hashtext('secbl_ratings'));

  select * into m from matches where id = p_match_id and status = 'pending' for update;
  if not found then
    raise exception 'match % is not pending', p_match_id;
  end if;

  -- Lock both profile rows in canonical id order to avoid ABBA deadlocks
  -- between concurrent confirmations of swapped-role matches.
  perform 1 from profiles where id in (m.reporter_id, m.opponent_id)
    order by id for update;

  select rating into r_before from profiles where id = m.reporter_id;
  select rating into o_before from profiles where id = m.opponent_id;
  r_after := greatest(100, r_before + p_reporter_delta);
  o_after := greatest(100, o_before + p_opponent_delta);

  update profiles set rating = r_after, matches_played = matches_played + 1
    where id = m.reporter_id;
  update profiles set rating = o_after, matches_played = matches_played + 1
    where id = m.opponent_id;

  insert into rating_history (profile_id, match_id, rating_before, rating_after)
  values
    (m.reporter_id, p_match_id, r_before, r_after),
    (m.opponent_id, p_match_id, o_before, o_after);

  update matches
  set status = 'confirmed',
      confirmed_at = now(),
      rating_delta_reporter = r_after - r_before,
      rating_delta_opponent = o_after - o_before
  where id = p_match_id;
end;
$$;
```

- [ ] **Step 2: Apply the migration** with `apply_migration`, name `rating_recompute`.

- [ ] **Step 3: Verify the lock is present and the grant is service-role only**

```sql
select proname,
       pg_get_functiondef(oid) like '%secbl_ratings%' as has_lock,
       has_function_privilege('authenticated', oid, 'execute') as authenticated_can_run
from pg_proc
where pronamespace = 'public'::regnamespace
  and proname in ('apply_match_confirmation','apply_rating_recompute')
order by proname;
```

Expected: both `has_lock` true; `apply_rating_recompute` `authenticated_can_run` **false**; `apply_match_confirmation` unchanged from before (service-role only).

- [ ] **Step 4: Create `lib/recompute.ts`**

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  replayRatings,
  type ReplayMatch,
  type ReplayDelta,
  type ReplayHistoryRow,
  type ReplayStanding,
} from "@/lib/rating";

export interface RecomputePayload {
  p_standings: ReplayStanding[];
  p_history: ReplayHistoryRow[];
  p_deltas: ReplayDelta[];
}

// Builds the arguments for apply_rating_recompute by replaying every confirmed
// match. `extra` lets a caller include a result it is about to write in the
// same transaction; `excludeMatchId` lets a caller drop one it is voiding — so
// the ladder is never briefly wrong between two statements.
export async function buildRecomputePayload(
  service: SupabaseClient,
  extra: ReplayMatch[] = [],
  excludeMatchId?: string
): Promise<RecomputePayload> {
  const { data: rows, error } = await service
    .from("matches")
    .select("id, reporter_id, opponent_id, winner_id")
    .eq("status", "confirmed")
    .order("confirmed_at", { ascending: true })
    .order("id", { ascending: true });
  if (error) throw new Error(error.message);

  const { data: profiles, error: profilesError } = await service
    .from("profiles")
    .select("id");
  if (profilesError) throw new Error(profilesError.message);

  const history = ((rows ?? []) as ReplayMatch[])
    .filter((m) => m.id !== excludeMatchId)
    .concat(extra);

  const { standings, history: rows2, deltas } = replayRatings(
    history,
    (profiles ?? []).map((p) => p.id as string)
  );
  return { p_standings: standings, p_history: rows2, p_deltas: deltas };
}
```

- [ ] **Step 5: Build and commit**

Run: `npm run build` and `npm test` — both must pass.

```bash
git add supabase/migrations/0011_rating_recompute.sql lib/recompute.ts
git commit -m "feat: atomic ladder recompute with serialized rating writes"
```

---

### Task 5: Tournament lifecycle functions

**Files:**
- Create: `supabase/migrations/0012_tournament_functions.sql`

**Interfaces:**
- Consumes: Task 1 tables, `public.is_admin()`.
- Produces Postgres functions, all `SECURITY DEFINER`, all granted to `authenticated`, all checking `is_admin()` internally: `create_tournament(p_name text, p_event_id uuid) returns uuid`; `set_tournament_entrants(p_tournament_id uuid, p_entrants jsonb) returns void` where entrants is `[{profile_id, seed}]`; `start_tournament(p_tournament_id uuid, p_matches jsonb) returns void`; `record_tournament_result(p_tournament_match_id uuid, p_match_id uuid, p_player1_score int, p_player2_score int, p_winner_id uuid, p_played_at date, p_standings jsonb, p_history jsonb, p_deltas jsonb) returns void`; `void_tournament_result(p_tournament_match_id uuid, p_standings jsonb, p_history jsonb, p_deltas jsonb) returns void`.

- [ ] **Step 1: Create `supabase/migrations/0012_tournament_functions.sql`**

```sql
-- Every tournament write lives here. The tables carry read-only policies, so
-- these functions are the only way in, and each re-checks is_admin() itself.

create or replace function public.create_tournament(p_name text, p_event_id uuid)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_id uuid;
begin
  if not public.is_admin() then
    raise exception 'only admins can create tournaments';
  end if;
  if length(trim(coalesce(p_name, ''))) = 0 then
    raise exception 'tournament needs a name';
  end if;
  insert into tournaments (name, event_id, created_by)
  values (trim(p_name), p_event_id, auth.uid())
  returning id into v_id;
  return v_id;
end;
$$;

-- Replaces the entrant list wholesale, which keeps seeding a single atomic
-- write rather than a sequence of adds and re-seeds that could half-apply.
create or replace function public.set_tournament_entrants(
  p_tournament_id uuid,
  p_entrants jsonb
) returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_status tournament_status;
begin
  if not public.is_admin() then
    raise exception 'only admins can change entrants';
  end if;
  select status into v_status from tournaments where id = p_tournament_id for update;
  if not found then
    raise exception 'tournament not found';
  end if;
  if v_status <> 'setup' then
    raise exception 'entrants are fixed once a tournament starts';
  end if;

  delete from tournament_players where tournament_id = p_tournament_id;
  insert into tournament_players (tournament_id, profile_id, seed)
  select p_tournament_id, e.profile_id, e.seed
  from jsonb_to_recordset(p_entrants) as e(profile_id uuid, seed int);
end;
$$;

create or replace function public.start_tournament(
  p_tournament_id uuid,
  p_matches jsonb
) returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_status tournament_status;
  v_players int;
begin
  if not public.is_admin() then
    raise exception 'only admins can start a tournament';
  end if;
  select status into v_status from tournaments where id = p_tournament_id for update;
  if v_status is null then
    raise exception 'tournament not found';
  end if;
  if v_status <> 'setup' then
    raise exception 'tournament has already started';
  end if;
  select count(*) into v_players from tournament_players where tournament_id = p_tournament_id;
  if v_players < 3 then
    raise exception 'a tournament needs at least 3 entrants';
  end if;

  -- Two passes: rows first, then the self-referencing advance links. Doing it
  -- this way keeps the foreign keys non-deferrable.
  insert into tournament_matches (
    id, tournament_id, bracket, round, position,
    player1_id, player2_id, winner_id
  )
  select m.id, p_tournament_id, 'winners', m.round, m.position,
         m.player1_id, m.player2_id, m.winner_id
  from jsonb_to_recordset(p_matches) as m(
    id uuid, round int, position int,
    player1_id uuid, player2_id uuid, winner_id uuid
  );

  update tournament_matches t
  set winner_advances_to = m.winner_advances_to,
      winner_advances_slot = m.winner_advances_slot
  from jsonb_to_recordset(p_matches) as m(
    id uuid, winner_advances_to uuid, winner_advances_slot smallint
  )
  where t.id = m.id and t.tournament_id = p_tournament_id;

  update tournaments
  set status = 'live', started_at = now()
  where id = p_tournament_id;
end;
$$;

-- Records a result and rebuilds the ladder in one transaction, so the
-- invariant "ratings equal a replay of confirmed matches" is never violated,
-- not even briefly between two statements.
create or replace function public.record_tournament_result(
  p_tournament_match_id uuid,
  p_match_id uuid,
  p_player1_score int,
  p_player2_score int,
  p_winner_id uuid,
  p_played_at date,
  p_standings jsonb,
  p_history jsonb,
  p_deltas jsonb
) returns void
language plpgsql security definer set search_path = public
as $$
declare
  tm tournament_matches%rowtype;
  v_status tournament_status;
  v_loser uuid;
  v_remaining int;
begin
  if not public.is_admin() then
    raise exception 'only admins can record results';
  end if;
  perform pg_advisory_xact_lock(hashtext('secbl_ratings'));

  select * into tm from tournament_matches where id = p_tournament_match_id for update;
  if not found then
    raise exception 'match not found';
  end if;
  select status into v_status from tournaments where id = tm.tournament_id for update;
  if v_status <> 'live' then
    raise exception 'tournament is not live';
  end if;
  if tm.player1_id is null or tm.player2_id is null then
    raise exception 'both players must be known before a result can be recorded';
  end if;
  if tm.winner_id is not null then
    raise exception 'that match already has a result';
  end if;
  if p_winner_id is distinct from tm.player1_id and p_winner_id is distinct from tm.player2_id then
    raise exception 'winner must be one of the two players';
  end if;
  if p_player1_score = p_player2_score then
    raise exception 'a tournament match cannot end level';
  end if;

  v_loser := case when p_winner_id = tm.player1_id then tm.player2_id else tm.player1_id end;

  -- The rated match. tournament_match_id is what the matches insert policy
  -- forbids clients from setting, which is why this runs here.
  insert into matches (
    id, reporter_id, opponent_id, winner_id,
    reporter_score, opponent_score, game_type, status,
    tournament_match_id, played_at, confirmed_at
  ) values (
    p_match_id, tm.player1_id, tm.player2_id, p_winner_id,
    p_player1_score, p_player2_score, '8ball', 'confirmed',
    p_tournament_match_id, p_played_at, now()
  );

  update tournament_matches
  set player1_score = p_player1_score,
      player2_score = p_player2_score,
      winner_id = p_winner_id
  where id = p_tournament_match_id;

  if tm.winner_advances_to is not null then
    if tm.winner_advances_slot = 1 then
      update tournament_matches set player1_id = p_winner_id where id = tm.winner_advances_to;
    else
      update tournament_matches set player2_id = p_winner_id where id = tm.winner_advances_to;
    end if;
  end if;

  perform public.apply_rating_recompute(p_standings, p_history, p_deltas);

  select count(*) into v_remaining
  from tournament_matches
  where tournament_id = tm.tournament_id and winner_id is null;
  if v_remaining = 0 then
    update tournaments set status = 'complete', completed_at = now()
    where id = tm.tournament_id;
  end if;
end;
$$;

-- Undoes one result. Refused when the winner has already played on, because
-- cascading an un-advancement through a decided subtree would silently discard
-- results the club actually played.
create or replace function public.void_tournament_result(
  p_tournament_match_id uuid,
  p_standings jsonb,
  p_history jsonb,
  p_deltas jsonb
) returns void
language plpgsql security definer set search_path = public
as $$
declare
  tm tournament_matches%rowtype;
  v_downstream_decided boolean;
begin
  if not public.is_admin() then
    raise exception 'only admins can void results';
  end if;
  perform pg_advisory_xact_lock(hashtext('secbl_ratings'));

  select * into tm from tournament_matches where id = p_tournament_match_id for update;
  if not found then
    raise exception 'match not found';
  end if;
  if tm.winner_id is null then
    raise exception 'that match has no result to void';
  end if;

  if tm.winner_advances_to is not null then
    select winner_id is not null into v_downstream_decided
    from tournament_matches where id = tm.winner_advances_to;
    if v_downstream_decided then
      raise exception 'void the later match first — its result depends on this one';
    end if;
    if tm.winner_advances_slot = 1 then
      update tournament_matches set player1_id = null where id = tm.winner_advances_to;
    else
      update tournament_matches set player2_id = null where id = tm.winner_advances_to;
    end if;
  end if;

  delete from matches where tournament_match_id = p_tournament_match_id;

  update tournament_matches
  set winner_id = null, player1_score = null, player2_score = null
  where id = p_tournament_match_id;

  update tournaments set status = 'live', completed_at = null
  where id = tm.tournament_id and status = 'complete';

  perform public.apply_rating_recompute(p_standings, p_history, p_deltas);
end;
$$;

-- Score-only correction. Note what this deliberately does NOT do: recompute.
-- A rating depends only on WHO won (ratingUpdate takes a boolean), never on the
-- score, so fixing "5-3" to "5-2" cannot move the ladder. That is why this is
-- always allowed even when the winner has already played on, while changing a
-- winner has to go through void.
create or replace function public.correct_tournament_scores(
  p_tournament_match_id uuid,
  p_player1_score int,
  p_player2_score int
) returns void
language plpgsql security definer set search_path = public
as $$
declare
  tm tournament_matches%rowtype;
begin
  if not public.is_admin() then
    raise exception 'only admins can correct scores';
  end if;
  select * into tm from tournament_matches where id = p_tournament_match_id for update;
  if not found then
    raise exception 'match not found';
  end if;
  if tm.winner_id is null then
    raise exception 'that match has no result to correct';
  end if;
  if p_player1_score = p_player2_score then
    raise exception 'a tournament match cannot end level';
  end if;
  -- The corrected scores must still agree with the recorded winner; changing
  -- who won is a different operation with different consequences.
  if (tm.winner_id = tm.player1_id and p_player1_score < p_player2_score)
     or (tm.winner_id = tm.player2_id and p_player2_score < p_player1_score) then
    raise exception 'those scores contradict the recorded winner — void the result instead';
  end if;

  update tournament_matches
  set player1_score = p_player1_score, player2_score = p_player2_score
  where id = p_tournament_match_id;

  update matches
  set reporter_score = p_player1_score, opponent_score = p_player2_score
  where tournament_match_id = p_tournament_match_id;
end;
$$;

revoke execute on function public.correct_tournament_scores(uuid, int, int) from public, anon;
grant execute on function public.correct_tournament_scores(uuid, int, int) to authenticated;

revoke execute on function public.create_tournament(text, uuid) from public, anon;
revoke execute on function public.set_tournament_entrants(uuid, jsonb) from public, anon;
revoke execute on function public.start_tournament(uuid, jsonb) from public, anon;
revoke execute on function public.record_tournament_result(uuid, uuid, int, int, uuid, date, jsonb, jsonb, jsonb) from public, anon;
revoke execute on function public.void_tournament_result(uuid, jsonb, jsonb, jsonb) from public, anon;

grant execute on function public.create_tournament(text, uuid) to authenticated;
grant execute on function public.set_tournament_entrants(uuid, jsonb) to authenticated;
grant execute on function public.start_tournament(uuid, jsonb) to authenticated;
grant execute on function public.record_tournament_result(uuid, uuid, int, int, uuid, date, jsonb, jsonb, jsonb) to authenticated;
grant execute on function public.void_tournament_result(uuid, jsonb, jsonb, jsonb) to authenticated;
```

Note: `apply_rating_recompute` is granted only to `service_role`, but these functions are `SECURITY DEFINER` and so call it as their owner — an ordinary member still cannot call it directly.

- [ ] **Step 2: Apply the migration** with `apply_migration`, name `tournament_functions`.

- [ ] **Step 3: Verify grants**

```sql
select proname, has_function_privilege('authenticated', oid, 'execute') as authenticated_can_run
from pg_proc where pronamespace='public'::regnamespace
  and proname in ('create_tournament','set_tournament_entrants','start_tournament',
                  'record_tournament_result','void_tournament_result','apply_rating_recompute')
order by proname;
```

Expected: all five tournament functions `true`; `apply_rating_recompute` `false`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0012_tournament_functions.sql
git commit -m "feat: tournament lifecycle and result functions"
```

---

### Task 6: Server actions

**Files:**
- Create: `app/(member)/tournaments/actions.ts`

**Interfaces:**
- Consumes: `generateSingleElim`, `MIN_PLAYERS`, `MAX_PLAYERS` (Task 2); `buildRecomputePayload` (Task 4); the SQL functions (Task 5); `clubDateOf` from `@/lib/events`; `createClient`, `createServiceClient` from `@/lib/supabase/server`.
- Produces server actions: `createTournament(formData)` (fields `name`, `event_id`), `saveEntrants(formData)` (fields `tournament_id`, `profile_ids` — repeated, already in seed order), `startTournament(formData)` (field `tournament_id`), `recordResult(formData)` (fields `tournament_match_id`, `tournament_id`, `player1_score`, `player2_score`, `winner_id`), `voidResult(formData)` (fields `tournament_match_id`, `tournament_id`).

- [ ] **Step 1: Create `app/(member)/tournaments/actions.ts`**

```ts
"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { generateSingleElim, MAX_PLAYERS, MIN_PLAYERS } from "@/lib/bracket";
import { clubDateOf } from "@/lib/events";
import { buildRecomputePayload } from "@/lib/recompute";
import { createClient, createServiceClient } from "@/lib/supabase/server";

// The SQL functions re-check is_admin() themselves; this only turns a
// non-admin's attempt into a redirect instead of a raw database error.
async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: me } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (me?.role !== "admin") redirect("/tournaments");
  return { supabase, user };
}

export async function createTournament(formData: FormData) {
  const { supabase } = await requireAdmin();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) {
    redirect(`/tournaments/new?error=${encodeURIComponent("Give the tournament a name.")}`);
  }
  const eventId = String(formData.get("event_id") ?? "");
  const { data, error } = await supabase.rpc("create_tournament", {
    p_name: name,
    p_event_id: eventId || null,
  });
  if (error) {
    redirect(`/tournaments/new?error=${encodeURIComponent(error.message)}`);
  }
  revalidatePath("/tournaments");
  redirect(`/tournaments/${data}/setup`);
}

export async function saveEntrants(formData: FormData) {
  const { supabase } = await requireAdmin();
  const tournamentId = String(formData.get("tournament_id") ?? "");
  // Checkbox order in the DOM is seed order, highest rating first.
  const profileIds = formData.getAll("profile_ids").map(String).filter(Boolean);
  if (profileIds.length > MAX_PLAYERS) {
    redirect(
      `/tournaments/${tournamentId}/setup?error=${encodeURIComponent(
        `At most ${MAX_PLAYERS} entrants.`
      )}`
    );
  }
  const entrants = profileIds.map((profile_id, index) => ({
    profile_id,
    seed: index + 1,
  }));
  const { error } = await supabase.rpc("set_tournament_entrants", {
    p_tournament_id: tournamentId,
    p_entrants: entrants,
  });
  if (error) {
    redirect(`/tournaments/${tournamentId}/setup?error=${encodeURIComponent(error.message)}`);
  }
  revalidatePath(`/tournaments/${tournamentId}/setup`);
  redirect(`/tournaments/${tournamentId}/setup?message=${encodeURIComponent("Entrants saved.")}`);
}

export async function startTournament(formData: FormData) {
  const { supabase } = await requireAdmin();
  const tournamentId = String(formData.get("tournament_id") ?? "");

  const { data: entrants, error: entrantsError } = await supabase
    .from("tournament_players")
    .select("profile_id, seed")
    .eq("tournament_id", tournamentId)
    .order("seed");
  if (entrantsError) {
    redirect(`/tournaments/${tournamentId}/setup?error=${encodeURIComponent(entrantsError.message)}`);
  }
  const ids = (entrants ?? []).map((e) => e.profile_id as string);
  if (ids.length < MIN_PLAYERS) {
    redirect(
      `/tournaments/${tournamentId}/setup?error=${encodeURIComponent(
        `A tournament needs at least ${MIN_PLAYERS} entrants.`
      )}`
    );
  }

  const matches = generateSingleElim(ids, () => randomUUID());
  const { error } = await supabase.rpc("start_tournament", {
    p_tournament_id: tournamentId,
    p_matches: matches,
  });
  if (error) {
    redirect(`/tournaments/${tournamentId}/setup?error=${encodeURIComponent(error.message)}`);
  }
  revalidatePath(`/tournaments/${tournamentId}`);
  redirect(`/tournaments/${tournamentId}`);
}

export async function recordResult(formData: FormData) {
  const { supabase } = await requireAdmin();
  const tournamentId = String(formData.get("tournament_id") ?? "");
  const tournamentMatchId = String(formData.get("tournament_match_id") ?? "");
  const p1 = Number(formData.get("player1_score"));
  const p2 = Number(formData.get("player2_score"));
  const winnerId = String(formData.get("winner_id") ?? "");
  const fail = (message: string) =>
    redirect(`/tournaments/${tournamentId}?error=${encodeURIComponent(message)}`);

  if (!Number.isInteger(p1) || !Number.isInteger(p2) || p1 < 0 || p2 < 0) {
    fail("Enter both scores as whole numbers.");
  }
  if (p1 === p2) fail("A tournament match cannot end level.");
  if (!winnerId) fail("Pick the winner.");

  // The rated match's id is minted here so the replay can include this result
  // before it is written — the ladder is never briefly wrong.
  const matchId = randomUUID();
  const service = createServiceClient();
  const { data: tm, error: tmError } = await service
    .from("tournament_matches")
    .select("player1_id, player2_id")
    .eq("id", tournamentMatchId)
    .single();
  if (tmError || !tm) fail("That match is no longer available.");

  const payload = await buildRecomputePayload(service, [
    {
      id: matchId,
      reporter_id: tm!.player1_id as string,
      opponent_id: tm!.player2_id as string,
      winner_id: winnerId,
    },
  ]);

  const { error } = await supabase.rpc("record_tournament_result", {
    p_tournament_match_id: tournamentMatchId,
    p_match_id: matchId,
    p_player1_score: p1,
    p_player2_score: p2,
    p_winner_id: winnerId,
    p_played_at: clubDateOf(new Date().toISOString()),
    ...payload,
  });
  if (error) fail(error.message);

  revalidatePath(`/tournaments/${tournamentId}`);
  revalidatePath("/leaderboard");
  revalidatePath("/");
  redirect(`/tournaments/${tournamentId}`);
}

export async function correctScores(formData: FormData) {
  const { supabase } = await requireAdmin();
  const tournamentId = String(formData.get("tournament_id") ?? "");
  const tournamentMatchId = String(formData.get("tournament_match_id") ?? "");
  const p1 = Number(formData.get("player1_score"));
  const p2 = Number(formData.get("player2_score"));
  if (!Number.isInteger(p1) || !Number.isInteger(p2) || p1 < 0 || p2 < 0 || p1 === p2) {
    redirect(
      `/tournaments/${tournamentId}?error=${encodeURIComponent("Enter two different whole-number scores.")}`
    );
  }
  // No recompute: the ladder depends on who won, not by how much.
  const { error } = await supabase.rpc("correct_tournament_scores", {
    p_tournament_match_id: tournamentMatchId,
    p_player1_score: p1,
    p_player2_score: p2,
  });
  if (error) {
    redirect(`/tournaments/${tournamentId}?error=${encodeURIComponent(error.message)}`);
  }
  revalidatePath(`/tournaments/${tournamentId}`);
  redirect(`/tournaments/${tournamentId}?message=${encodeURIComponent("Scores corrected.")}`);
}

export async function voidResult(formData: FormData) {
  const { supabase } = await requireAdmin();
  const tournamentId = String(formData.get("tournament_id") ?? "");
  const tournamentMatchId = String(formData.get("tournament_match_id") ?? "");
  const service = createServiceClient();

  const { data: rated } = await service
    .from("matches")
    .select("id")
    .eq("tournament_match_id", tournamentMatchId)
    .maybeSingle();

  const payload = await buildRecomputePayload(service, [], rated?.id as string | undefined);

  const { error } = await supabase.rpc("void_tournament_result", {
    p_tournament_match_id: tournamentMatchId,
    ...payload,
  });
  if (error) {
    redirect(`/tournaments/${tournamentId}?error=${encodeURIComponent(error.message)}`);
  }
  revalidatePath(`/tournaments/${tournamentId}`);
  revalidatePath("/leaderboard");
  revalidatePath("/");
  redirect(
    `/tournaments/${tournamentId}?message=${encodeURIComponent("Result voided and ratings recomputed.")}`
  );
}
```

- [ ] **Step 2: Build**

Run: `npm run build` — expect success.

- [ ] **Step 3: Commit**

```bash
git add "app/(member)/tournaments/actions.ts"
git commit -m "feat: tournament server actions"
```

---

### Task 7: Tournament list, create and setup pages

**Files:**
- Create: `app/(member)/tournaments/page.tsx`, `app/(member)/tournaments/new/page.tsx`, `app/(member)/tournaments/[id]/setup/page.tsx`
- Modify: `app/(member)/layout.tsx` (nav)

**Interfaces:**
- Consumes: Task 6 actions, Task 1 tables.
- Produces: `/tournaments`, `/tournaments/new`, `/tournaments/[id]/setup`.

- [ ] **Step 1: Create `app/(member)/tournaments/page.tsx`**

```tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";

const STATUS_LABEL: Record<string, string> = {
  setup: "Setting up",
  live: "Live",
  complete: "Complete",
};

export default async function TournamentsPage({
  searchParams,
}: {
  searchParams: Promise<{ message?: string; error?: string }>;
}) {
  const { message, error } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: me } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const { data: tournaments } = await supabase
    .from("tournaments")
    .select("id, name, status, created_at")
    .order("created_at", { ascending: false });

  return (
    <main className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Tournaments</h1>
        {me?.role === "admin" && (
          <Button asChild size="sm">
            <Link href="/tournaments/new">New tournament</Link>
          </Button>
        )}
      </div>
      {message && <p className="rounded-md bg-muted p-3 text-sm">{message}</p>}
      {error && (
        <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</p>
      )}
      <Card>
        <CardHeader>
          <CardTitle>All tournaments</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-1">
          {(tournaments ?? []).length === 0 && (
            <p className="text-muted-foreground text-sm">Nothing run yet.</p>
          )}
          {(tournaments ?? []).map((t) => (
            <Link
              key={t.id}
              href={t.status === "setup" ? `/tournaments/${t.id}/setup` : `/tournaments/${t.id}`}
              className="hover:bg-muted -mx-3 flex items-center justify-between rounded-md p-3"
            >
              <span className="font-medium">{t.name}</span>
              <Badge variant={t.status === "live" ? "default" : "secondary"}>
                {STATUS_LABEL[t.status]}
              </Badge>
            </Link>
          ))}
        </CardContent>
      </Card>
    </main>
  );
}
```

- [ ] **Step 2: Create `app/(member)/tournaments/new/page.tsx`**

```tsx
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/server";
import { createTournament } from "@/app/(member)/tournaments/actions";

export default async function NewTournamentPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: me } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (me?.role !== "admin") redirect("/tournaments");

  const { data: events } = await supabase
    .from("events")
    .select("id, title")
    .eq("status", "scheduled")
    .order("starts_at");

  return (
    <main className="flex flex-col gap-6">
      <h1 className="text-xl font-bold">New tournament</h1>
      {error && (
        <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</p>
      )}
      <form action={createTournament} className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="name">Name</Label>
          <Input id="name" name="name" required maxLength={80} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="event_id">Linked event (optional)</Label>
          <select
            id="event_id"
            name="event_id"
            defaultValue=""
            className="border-input h-9 rounded-md border bg-transparent px-3 text-sm"
          >
            <option value="">No linked event</option>
            {(events ?? []).map((e) => (
              <option key={e.id} value={e.id}>
                {e.title}
              </option>
            ))}
          </select>
        </div>
        <Button type="submit">Create</Button>
      </form>
    </main>
  );
}
```

- [ ] **Step 3: Create `app/(member)/tournaments/[id]/setup/page.tsx`**

Entrants are checkboxes listed in rating order, so the DOM order the form submits is the seed order — seed 1 is the highest-rated checked player. Reordering by hand is out of scope for this task; unchecking and rechecking changes who is in, not the seeding rule.

```tsx
import { notFound, redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { saveEntrants, startTournament } from "@/app/(member)/tournaments/actions";

export default async function TournamentSetupPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; message?: string }>;
}) {
  const { id } = await params;
  const { error, message } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: me } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (me?.role !== "admin") redirect("/tournaments");

  const { data: tournament } = await supabase
    .from("tournaments")
    .select("id, name, status")
    .eq("id", id)
    .single();
  if (!tournament) notFound();
  if (tournament.status !== "setup") redirect(`/tournaments/${id}`);

  const { data: candidates } = await supabase
    .from("profiles")
    .select("id, display_name, rating, schools(short_name)")
    .eq("status", "approved")
    .order("rating", { ascending: false });

  const { data: entrants } = await supabase
    .from("tournament_players")
    .select("profile_id")
    .eq("tournament_id", id);
  const chosen = new Set((entrants ?? []).map((e) => e.profile_id as string));

  return (
    <main className="flex flex-col gap-6">
      <h1 className="text-xl font-bold">{tournament.name}</h1>
      {message && <p className="rounded-md bg-muted p-3 text-sm">{message}</p>}
      {error && (
        <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</p>
      )}

      <form action={saveEntrants} className="flex flex-col gap-4">
        <input type="hidden" name="tournament_id" value={id} />
        <Card>
          <CardHeader>
            <CardTitle>Entrants</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <p className="text-muted-foreground text-xs">
              Listed strongest first — seeding follows this order, so the top checked
              player is seed 1.
            </p>
            {(candidates ?? []).map((c) => {
              const school = Array.isArray(c.schools) ? c.schools[0] : c.schools;
              return (
                <label key={c.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    name="profile_ids"
                    value={c.id}
                    defaultChecked={chosen.has(c.id as string)}
                  />
                  <span className="font-medium">{c.display_name}</span>
                  <Badge variant="secondary">{school?.short_name}</Badge>
                  <span className="text-muted-foreground">{c.rating}</span>
                </label>
              );
            })}
          </CardContent>
        </Card>
        <Button type="submit" className="self-start">
          Save entrants
        </Button>
      </form>

      <form action={startTournament}>
        <input type="hidden" name="tournament_id" value={id} />
        <Button type="submit" variant="default">
          Start tournament ({chosen.size} entrants)
        </Button>
        <p className="text-muted-foreground mt-2 text-xs">
          Starting generates the whole bracket and locks the entrant list.
        </p>
      </form>
    </main>
  );
}
```

- [ ] **Step 4: Add Tournaments to the bottom nav in `app/(member)/layout.tsx`**

Replace the contents of the nav's inner `<div>` with:

```tsx
          <Link href="/">Home</Link>
          <Link href="/events">Events</Link>
          <Link href="/tournaments">Cups</Link>
          <Link href="/leaderboard">Ranks</Link>
          <Link href="/matches/new">Report</Link>
```

`Schools` moves out of the bottom nav to keep it to five items on a phone; it stays reachable at `/schools` and is linked from the leaderboard in Task 8.

- [ ] **Step 5: Build and commit**

Run: `npm run build` — expect `/tournaments`, `/tournaments/new` and `/tournaments/[id]/setup` in the route list.

```bash
git add -A
git commit -m "feat: tournament list, creation and setup"
```

---

### Task 8: Bracket page, result entry and live refresh

**Files:**
- Create: `app/(member)/tournaments/[id]/page.tsx`, `app/(member)/tournaments/[id]/refresh.tsx`
- Modify: `app/(member)/leaderboard/page.tsx` (add a Schools link)

**Interfaces:**
- Consumes: `bracketRounds` (Task 2), `recordResult`/`voidResult` (Task 6).
- Produces: `/tournaments/[id]`. The E2E in Task 10 asserts on the heading `Champion` and on round headings `Round 1`.

- [ ] **Step 1: Create `app/(member)/tournaments/[id]/refresh.tsx`**

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

// The bracket is server-rendered; while a tournament is live this pulls a fresh
// render every few seconds so spectators see results without a manual reload.
// Chosen over Supabase Realtime deliberately: no subscription to reconnect, no
// per-table enablement, and spectators cannot tell the difference.
export function LiveRefresh({ seconds = 10 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const timer = setInterval(() => router.refresh(), seconds * 1000);
    return () => clearInterval(timer);
  }, [router, seconds]);
  return null;
}
```

- [ ] **Step 2: Create `app/(member)/tournaments/[id]/page.tsx`**

```tsx
import { notFound, redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { bracketRounds, type GeneratedMatch } from "@/lib/bracket";
import { createClient } from "@/lib/supabase/server";
import { correctScores, recordResult, voidResult } from "@/app/(member)/tournaments/actions";
import { LiveRefresh } from "./refresh";

interface MatchRow extends GeneratedMatch {
  player1_score: number | null;
  player2_score: number | null;
}

export default async function TournamentPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; message?: string }>;
}) {
  const { id } = await params;
  const { error, message } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: me } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const { data: tournament } = await supabase
    .from("tournaments")
    .select("id, name, status")
    .eq("id", id)
    .single();
  if (!tournament) notFound();
  if (tournament.status === "setup") redirect(`/tournaments/${id}/setup`);

  const { data: rows } = await supabase
    .from("tournament_matches")
    .select(
      "id, round, position, player1_id, player2_id, player1_score, player2_score, winner_id, winner_advances_to, winner_advances_slot"
    )
    .eq("tournament_id", id);

  const { data: entrants } = await supabase
    .from("tournament_players")
    .select("profile_id, seed, profiles(display_name)")
    .eq("tournament_id", id)
    .order("seed");

  const nameOf = new Map<string, string>();
  const seedOf = new Map<string, number>();
  for (const e of entrants ?? []) {
    const profile = Array.isArray(e.profiles) ? e.profiles[0] : e.profiles;
    nameOf.set(e.profile_id as string, profile?.display_name ?? "Unknown");
    seedOf.set(e.profile_id as string, e.seed as number);
  }
  const label = (playerId: string | null) =>
    playerId ? `${nameOf.get(playerId) ?? "Unknown"} (${seedOf.get(playerId)})` : "TBD";

  const matches = (rows ?? []) as MatchRow[];
  const rounds = bracketRounds(matches);
  const final = matches.find((m) => m.winner_advances_to === null);
  const isAdmin = me?.role === "admin";

  return (
    <main className="flex flex-col gap-6">
      {tournament.status === "live" && <LiveRefresh />}
      <div className="flex items-center gap-2">
        <h1 className="text-xl font-bold">{tournament.name}</h1>
        <Badge variant={tournament.status === "live" ? "default" : "secondary"}>
          {tournament.status === "live" ? "Live" : "Complete"}
        </Badge>
      </div>
      {message && <p className="rounded-md bg-muted p-3 text-sm">{message}</p>}
      {error && (
        <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</p>
      )}

      {tournament.status === "complete" && final?.winner_id && (
        <Card>
          <CardHeader>
            <CardTitle>Champion</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold">{label(final.winner_id)}</CardContent>
        </Card>
      )}

      {rounds.map((round, index) => (
        <Card key={index}>
          <CardHeader>
            <CardTitle>
              {index === rounds.length - 1 ? "Final" : `Round ${index + 1}`}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {round.map((m) => {
              const match = m as MatchRow;
              const decided = match.winner_id !== null;
              const bye = match.player1_id !== null && match.player2_id === null && decided;
              const ready = match.player1_id !== null && match.player2_id !== null;
              return (
                <div key={match.id} className="flex flex-col gap-2 border-b pb-3 last:border-b-0">
                  <div className="text-sm">
                    <span className={match.winner_id === match.player1_id ? "font-bold" : ""}>
                      {label(match.player1_id)}
                    </span>
                    {" vs "}
                    <span className={match.winner_id === match.player2_id ? "font-bold" : ""}>
                      {bye ? "bye" : label(match.player2_id)}
                    </span>
                    {decided && !bye && (
                      <span className="text-muted-foreground">
                        {" "}
                        — {match.player1_score}–{match.player2_score}
                      </span>
                    )}
                  </div>

                  {isAdmin && ready && !decided && tournament.status === "live" && (
                    <form action={recordResult} className="flex flex-wrap items-end gap-2">
                      <input type="hidden" name="tournament_id" value={id} />
                      <input type="hidden" name="tournament_match_id" value={match.id} />
                      <Input
                        name="player1_score"
                        type="number"
                        min={0}
                        required
                        className="w-16"
                        aria-label={`${label(match.player1_id)} score`}
                      />
                      <Input
                        name="player2_score"
                        type="number"
                        min={0}
                        required
                        className="w-16"
                        aria-label={`${label(match.player2_id)} score`}
                      />
                      <select
                        name="winner_id"
                        required
                        defaultValue=""
                        className="border-input h-9 rounded-md border bg-transparent px-2 text-sm"
                        aria-label="Winner"
                      >
                        <option value="" disabled>
                          Winner
                        </option>
                        <option value={match.player1_id!}>{label(match.player1_id)}</option>
                        <option value={match.player2_id!}>{label(match.player2_id)}</option>
                      </select>
                      <Button size="sm" type="submit">
                        Save
                      </Button>
                    </form>
                  )}

                  {isAdmin && decided && !bye && (
                    <div className="flex flex-wrap items-end gap-2">
                      {/* Fixing a score never touches the ladder, so it stays
                          available even after the winner has played on. */}
                      <form action={correctScores} className="flex items-end gap-2">
                        <input type="hidden" name="tournament_id" value={id} />
                        <input type="hidden" name="tournament_match_id" value={match.id} />
                        <Input
                          name="player1_score"
                          type="number"
                          min={0}
                          required
                          defaultValue={match.player1_score ?? 0}
                          className="w-16"
                          aria-label="Corrected first score"
                        />
                        <Input
                          name="player2_score"
                          type="number"
                          min={0}
                          required
                          defaultValue={match.player2_score ?? 0}
                          className="w-16"
                          aria-label="Corrected second score"
                        />
                        <Button size="sm" variant="outline" type="submit">
                          Fix score
                        </Button>
                      </form>
                      <form action={voidResult}>
                        <input type="hidden" name="tournament_id" value={id} />
                        <input type="hidden" name="tournament_match_id" value={match.id} />
                        <Button size="sm" variant="outline" type="submit">
                          Void result
                        </Button>
                      </form>
                    </div>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      ))}
    </main>
  );
}
```

- [ ] **Step 3: Keep Schools reachable — modify `app/(member)/leaderboard/page.tsx`**

Directly above the closing `</main>`, add:

```tsx
      <p className="text-sm">
        <Link href="/schools" className="underline">
          School standings
        </Link>
      </p>
```

`Link` is already imported in that file.

- [ ] **Step 4: Build and commit**

Run: `npm run build` — expect `/tournaments/[id]` in the route list.

```bash
git add -A
git commit -m "feat: bracket view, result entry and live refresh"
```

---

### Task 9: RLS regression tests

**Files:**
- Modify: `tests/rls.integration.test.ts`

**Interfaces:**
- Consumes: the live project, all migrations, the file's existing `admin`/`signIn`/`memberEmail`/`memberId`/`pendingEmail` fixtures.

- [ ] **Step 1: Append these tests inside the existing `describe`**

```ts
  it("a member cannot create a tournament directly", async () => {
    const client = await signIn(memberEmail);
    const { error } = await client
      .from("tournaments")
      .insert({ name: "unauthorized", created_by: memberId });
    expect(error).not.toBeNull();
  });

  it("a member cannot call the admin tournament functions", async () => {
    const client = await signIn(memberEmail);
    const { error } = await client.rpc("create_tournament", {
      p_name: "unauthorized",
      p_event_id: null,
    });
    expect(error).not.toBeNull();
  });

  it("a member cannot recompute the ladder", async () => {
    const client = await signIn(memberEmail);
    const { error } = await client.rpc("apply_rating_recompute", {
      p_standings: [{ profile_id: memberId, rating: 9999, matches_played: 0 }],
      p_history: [],
      p_deltas: [],
    });
    expect(error).not.toBeNull();
    const { data } = await admin
      .from("profiles")
      .select("rating")
      .eq("id", memberId)
      .single();
    expect(data!.rating).not.toBe(9999);
  });

  it("an approved member can read tournaments", async () => {
    const { data: created } = await admin
      .from("tournaments")
      .insert({ name: `rls-tournament-${Date.now()}`, created_by: memberId })
      .select("id")
      .single();
    try {
      const client = await signIn(memberEmail);
      const { data, error } = await client
        .from("tournaments")
        .select("id")
        .eq("id", created!.id);
      expect(error).toBeNull();
      expect(data?.map((t) => t.id)).toEqual([created!.id]);
    } finally {
      await admin.from("tournaments").delete().eq("id", created!.id);
    }
  });
```

- [ ] **Step 2: Run and commit**

Run: `npm test` — expect all tests to pass.

```bash
git add tests/rls.integration.test.ts
git commit -m "test: RLS coverage for tournaments"
```

---

### Task 10: E2E, deploy and docs

**Files:**
- Modify: `e2e/cleanup.ts` (track tournaments)
- Create: `e2e/tournament.spec.ts`
- Modify: `docs/superpowers/plans/2026-08-31-phase4-tournaments.md` (status banner)

- [ ] **Step 1: Teach `e2e/cleanup.ts` about tournaments**

This is required, not tidiness: `tournaments.created_by` references `profiles(id)`
with **no** cascade, while `profiles` cascades from `auth.users`. So deleting a test
user while their tournament still exists raises a foreign-key violation, the
teardown aborts, and rows are left in the production database — the same trap the
events cleanup already documents, one table further along.

Add alongside the existing tracking sets:

```ts
const tournamentNames = new Set<string>();

/** Delete any tournament with this (unique per run) name during teardown. */
export function trackTournamentName(name: string) {
  tournamentNames.add(name);
}
```

Then inside `cleanupTracked`, **before** the loop that deletes users, add:

```ts
  // Must precede deleteUser: tournaments.created_by has no cascade, so a
  // surviving tournament blocks deletion of the admin who created it.
  for (const name of tournamentNames) {
    await service.from("tournaments").delete().eq("name", name);
  }
```

and add `tournamentNames.clear();` beside the other `.clear()` calls.

- [ ] **Step 2: Create `e2e/tournament.spec.ts`**

```ts
import { expect, test } from "@playwright/test";
import { cleanupTracked, serviceClient, trackTournamentName, trackUser } from "./cleanup";

test.afterEach(cleanupTracked);

const PASSWORD = "e2e-password-123!";

test("admin runs a 4-player tournament to a champion", async ({ page }) => {
  const stamp = Date.now();
  const service = serviceClient();
  const name = `E2E Cup ${stamp}`;
  // Registered before anything is created, so teardown removes it however the
  // test ends — including a timeout, which abandons the test body mid-await.
  trackTournamentName(name);

  const { data: school } = await service.from("schools").select("id").limit(1).single();
  async function makeUser(suffix: string, role: "admin" | "member") {
    const email = `e2e-cup-${suffix}-${stamp}@example.com`;
    const { data, error } = await service.auth.admin.createUser({
      email,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { display_name: `Cup ${suffix} ${stamp}`, school_id: school!.id },
    });
    if (error) throw error;
    trackUser(data.user!.id);
    await service.from("profiles").update({ role, status: "approved" }).eq("id", data.user!.id);
    return { id: data.user!.id, email };
  }

  const admin = await makeUser("admin", "admin");
  await makeUser("p1", "member");
  await makeUser("p2", "member");
  await makeUser("p3", "member");

  await page.goto("/login");
  await page.fill('input[name="email"]', admin.email);
  await page.fill('input[name="password"]', PASSWORD);
  await Promise.all([
    page.waitForURL((url) => !url.pathname.startsWith("/login")),
    page.click('button[type="submit"]'),
  ]);

  await page.goto("/tournaments/new");
  await page.fill('input[name="name"]', name);
  await page.click('button[type="submit"]');
  await expect(page.getByRole("heading", { name })).toBeVisible();

  // Check the four test players. Everyone in this club is a candidate, so
  // select by the value of each checkbox rather than by position.
  for (const id of [admin.id]) {
    await page.locator(`input[name="profile_ids"][value="${id}"]`).check();
  }
  const others = await service
    .from("profiles")
    .select("id, display_name")
    .like("display_name", `Cup %${stamp}`);
  for (const row of others.data ?? []) {
    await page.locator(`input[name="profile_ids"][value="${row.id}"]`).check();
  }
  await page.getByRole("button", { name: "Save entrants" }).click();
  await expect(page.getByText(/entrants saved/i)).toBeVisible();

  await page.getByRole("button", { name: /start tournament/i }).click();
  await expect(page.getByRole("heading", { name: "Round 1" })).toBeVisible();

  // Play every match that is ready, round by round, until a champion exists.
  for (let guard = 0; guard < 10; guard++) {
    const forms = page.locator("form:has(select[name='winner_id'])");
    if ((await forms.count()) === 0) break;
    const form = forms.first();
    await form.locator('input[name="player1_score"]').fill("5");
    await form.locator('input[name="player2_score"]').fill("3");
    await form.locator('select[name="winner_id"]').selectOption({ index: 1 });
    await form.getByRole("button", { name: "Save" }).click();
    await page.waitForLoadState("networkidle");
  }

  await expect(page.getByRole("heading", { name: "Champion" })).toBeVisible();

  // The ladder moved, and it equals a replay: every confirmed tournament match
  // has non-null deltas written by the recompute.
  const { data: rated } = await service
    .from("matches")
    .select("id, rating_delta_reporter, rating_delta_opponent")
    .not("tournament_match_id", "is", null);
  expect((rated ?? []).length).toBeGreaterThan(0);
  for (const m of rated ?? []) {
    expect(m.rating_delta_reporter).not.toBeNull();
    expect(m.rating_delta_opponent).not.toBeNull();
  }
});
```

The tournament row is removed by `trackTournamentName` in teardown, which runs
before the users are deleted; its matches and entrants cascade from it.

- [ ] **Step 3: Run the full suite**

Run: `npm test` then `npx playwright test`
Expected: all unit + RLS tests pass; all E2E specs pass.

- [ ] **Step 4: Verify no residue in the live database**

Load `ToolSearch` for `mcp__claude_ai_Supabase__execute_sql` and run against `azetukujqrqyxfzohfmd`:

```sql
select
  (select count(*) from public.tournaments) as tournaments,
  (select count(*) from public.matches) as matches,
  (select count(*) from auth.users where email like 'e2e-%') as leftover_users;
```

Expected: 0 tournaments, 0 leftover users. `matches` should be whatever real club data exists (0 today).

- [ ] **Step 5: Deploy**

```powershell
vercel --prod --yes
```

Then verify `https://secbl.vercel.app/tournaments` returns a redirect to `/login` when logged out, and scan `vercel logs <deployment-url> --json` for `"level":"error"`.

- [ ] **Step 6: Mark the plan complete and commit**

Add a `> **STATUS: COMPLETED <date>.**` banner at the top of this plan, matching the Phase 1–3 plans.

```bash
git add -A
git commit -m "test: e2e tournament run; docs: mark phase 4 complete"
```

---

## Out of scope (deferred by the spec)

- Double elimination — schema keeps `bracket` / `loser_advances_to` so it is additive.
- Supabase Realtime — interval refresh instead.
- Third-place playoffs, consolation brackets, re-seeding between rounds.
- Manual seed reordering in the setup UI: seeding follows rating order.
- Per-tournament game type: rated tournament matches are recorded as `8ball`,
  the schema default. A tournament-level game type is a later column.
