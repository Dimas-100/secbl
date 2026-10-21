# Agreed Results Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The scorekeeper can count a game on the spot ("We agreed — count it"); the opponent can take it back out within 24 hours ("Not right?"), which drops it into the existing admin Disputes list.

**Architecture:** A nullable `matches.agreed_at` marks a reporter-confirmed game. The existing confirmation RPC gains `p_agreed`; a new service-role-only `undo_agreed_match` flips the game to `disputed` and rebuilds the ladder from a recompute payload, exactly as `void_tournament_result` does. Pure window logic lives in `lib/agreed.ts`.

**Tech Stack:** Next.js 16 App Router (server actions), Supabase Postgres (migration applied with the Supabase MCP `apply_migration`, mirrored in `supabase/migrations/`), vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-20-agreed-results-design.md`

## Global Constraints

- One Supabase project serves dev AND production: the migration is live the moment it is applied. It must be additive and keep the deployed code working (the 3-argument `apply_match_confirmation` call must still resolve).
- The repo is public: tests, fixtures and commit messages use invented names only.
- Every rating write takes `pg_advisory_xact_lock(hashtext('secbl_ratings'))`; ladder invariant: ratings equal `replayRatings` over confirmed matches.
- `undo_agreed_match` and `apply_match_confirmation` are granted to `service_role` only.
- Copy: primary button `We agreed — count it` (pending `Counting…`); helper `Count it if you both agree the score. {first} can flag it for 24 hours.`; success `Counted — ratings updated.`; fallback `Couldn't count it right away — sent to {first} to confirm instead.`; dispute success `Taken out of the ratings — an admin will sort it out.`; dispute refusal `That game can no longer be flagged.`; Home heading `Logged for you`; row button `Not right?`; meta `Counted · flag until {label}`.
- Verify commands: `npm run lint`, `npx tsc --noEmit`, `npx vitest run --exclude "**/*.integration.test.ts"`, `npx vitest run tests/rls.integration.test.ts`, `npx playwright test e2e/<spec> --workers=1`.

## Review Focus

- Agreed send with a duplicate same-day game: the notice appears; "Log as a new game" must still count it (the hidden `agreed` value survives the notice path) — e2e step in Task 5.
- Confirmation RPC failing after the insert: the reporter lands on Home with the fallback message and the opponent gets the ordinary "reported a game" push, never a silent pending game — covered by code review of Task 4 (forcing an RPC failure in e2e is not practical).
- Flagging after 24 h or by the reporter: refused with `That game can no longer be flagged.` and nothing changes — unit tests on `canFlag` (Task 2) plus the function's own checks (Task 1).
- Two flags racing (double tap): the second sees `status <> 'confirmed'` and is refused; ratings are rebuilt once — enforced by `for update` + status check in Task 1.
- A game confirmed by someone else between payload build and undo: the expected-count guard refuses ("the ladder changed…") instead of erasing it — Task 1's guard, mirrored from `void_tournament_result`.

---

### Task 1: Migration 0028 — `agreed_at`, policy, confirmation flag, undo function

**Files:**
- Create: `supabase/migrations/0028_agreed_results.sql`
- Modify: `tests/rls.integration.test.ts` (append one `it`)

**Interfaces:**
- Produces: column `matches.agreed_at timestamptz null`; RPC `apply_match_confirmation(p_match_id uuid, p_reporter_delta int, p_opponent_delta int, p_agreed boolean default false)`; RPC `undo_agreed_match(p_match_id uuid, p_opponent_id uuid, p_standings jsonb, p_history jsonb, p_deltas jsonb, p_expected_confirmed int) returns void`.

- [ ] **Step 1: Write the failing RLS test** (one sign-in, both checks), appended inside the `describe` of `tests/rls.integration.test.ts`:

```ts
it("a member cannot mark a report agreed or undo an agreed game themselves", async () => {
  const me = await signIn(memberEmail);
  const { error: insertErr } = await me.from("matches").insert({
    reporter_id: memberId, opponent_id: pendingId, winner_id: memberId,
    reporter_score: 3, opponent_score: 1, game_type: "8ball", played_at: "2026-10-20",
    agreed_at: new Date().toISOString(),
  });
  expect(insertErr?.message).toMatch(/row-level security/);
  const { error: undoErr } = await me.rpc("undo_agreed_match", {
    p_match_id: "00000000-0000-0000-0000-000000000000",
    p_opponent_id: memberId,
    p_standings: [{ profile_id: memberId, rating: 9999, matches_played: 0 }],
    p_history: [], p_deltas: [], p_expected_confirmed: 0,
  });
  expect(undoErr?.message).toMatch(/permission denied/);
  const { data } = await admin.from("profiles").select("rating").eq("id", memberId).single();
  expect(data!.rating).not.toBe(9999);
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run tests/rls.integration.test.ts -t "agreed"`
Expected: FAIL — the insert error is "Could not find the 'agreed_at' column…", not a row-level-security refusal, and the RPC error is "Could not find the function…", not permission denied.

- [ ] **Step 3: Write `supabase/migrations/0028_agreed_results.sql`**

Contents, in order:
1. Header comment pointing at the spec.
2. `alter table public.matches add column agreed_at timestamptz;`
3. `drop policy "approved report own matches" on public.matches;` then recreate it `for insert to authenticated with check (public.is_approved() and reporter_id = (select auth.uid()) and status = 'pending' and tournament_match_id is null and agreed_at is null)`.
4. `drop function public.apply_match_confirmation(uuid, int, int);` then `create function` with the extra `p_agreed boolean default false`. Body: the live definition (fetch with `select pg_get_functiondef('public.apply_match_confirmation(uuid,int,int)'::regprocedure)` BEFORE dropping) with one change — the final `update matches set status = 'confirmed', confirmed_at = now(), ...` also sets `agreed_at = case when p_agreed then now() else null end`. Then `revoke execute on function public.apply_match_confirmation(uuid, int, int, boolean) from public, anon, authenticated; grant ... to service_role;`.
5. `create function public.undo_agreed_match(...)` per spec §1 steps 1–5. Refusal messages: `'that game is not an agreed result'` (missing / not confirmed / `agreed_at` null / cup match), `'only the opponent can flag this game'`, `'the 24 hours to flag this game are up'`, `'your account is not active'`; the count guard and payload guard copied verbatim from `void_tournament_result` (supabase/migrations/0012_tournament_functions.sql:286-293 and :337-352). Grants: revoke from `public, anon, authenticated`; grant to `service_role`.

- [ ] **Step 4: Apply it** with the Supabase MCP `apply_migration` (project `azetukujqrqyxfzohfmd`, name `0028_agreed_results`). Then check: `select pg_get_function_identity_arguments(oid) from pg_proc where proname in ('apply_match_confirmation','undo_agreed_match')` returns exactly one row each, with the 4-arg and 6-arg signatures.

- [ ] **Step 5: Run the RLS suite**

Run: `npx vitest run tests/rls.integration.test.ts`
Expected: PASS, including the existing "a member cannot call apply_match_confirmation" (3 named args still resolve to the new function and are still refused).

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0028_agreed_results.sql tests/rls.integration.test.ts
git commit -m "feat(agreed): agreed_at, confirmation flag and service-role undo"
```

### Task 2: `lib/agreed.ts` — the flag window

**Files:**
- Create: `lib/agreed.ts`, `tests/agreed.test.ts`

**Interfaces:**
- Produces: `AGREED_WINDOW_MS = 24 * 3_600_000`; `canFlag(m: { status: string; agreed_at: string | null; confirmed_at: string | null; opponent_id: string }, viewerId: string, now: Date): boolean`; `flagDeadlineLabel(confirmedAt: string, now: Date): string`.

- [ ] **Step 1: Write the failing tests** in `tests/agreed.test.ts`:

```ts
const base = { status: "confirmed", agreed_at: "2026-10-20T01:14:00Z", confirmed_at: "2026-10-20T01:14:00Z", opponent_id: "opp" };
const at = (iso: string) => new Date(iso);
it("lets only the opponent flag, only inside 24 hours, only an agreed confirmed game", () => {
  expect(AGREED_WINDOW_MS).toBe(86_400_000);
  expect(canFlag(base, "opp", at("2026-10-20T14:00:00Z"))).toBe(true);
  expect(canFlag(base, "reporter", at("2026-10-20T14:00:00Z"))).toBe(false);
  expect(canFlag(base, "opp", at("2026-10-21T01:14:01Z"))).toBe(false);
  expect(canFlag({ ...base, agreed_at: null }, "opp", at("2026-10-20T14:00:00Z"))).toBe(false);
  expect(canFlag({ ...base, status: "disputed" }, "opp", at("2026-10-20T14:00:00Z"))).toBe(false);
  expect(canFlag({ ...base, confirmed_at: null }, "opp", at("2026-10-20T14:00:00Z"))).toBe(false);
});
it("labels the deadline in club time, saying tomorrow when it is", () => {
  // Counted Oct 19 9:14 PM EDT → deadline Oct 20 9:14 PM EDT.
  expect(flagDeadlineLabel("2026-10-20T01:14:00Z", at("2026-10-20T01:30:00Z"))).toBe("tomorrow 9:14 PM");
  expect(flagDeadlineLabel("2026-10-20T01:14:00Z", at("2026-10-20T14:00:00Z"))).toBe("9:14 PM");
});
```

- [ ] **Step 2: Run** `npx vitest run tests/agreed.test.ts` — Expected: FAIL (module not found).

- [ ] **Step 3: Implement** in `lib/agreed.ts`. `flagDeadlineLabel`: deadline = confirmedAt + window; compare `clubDateOf(deadline)` with `clubDateOf(now)`; time via a `lib/events.ts` export — add and export `formatClubTime(iso: string): string` there (it is the existing private `clubTime`, renamed/exported; keep `clubTime` callers working) so no ad hoc `Intl` lives outside `lib/events.ts`.

- [ ] **Step 4: Run** `npx vitest run tests/agreed.test.ts tests/events.test.ts` — Expected: PASS.

- [ ] **Step 5: Commit** `git commit -m "feat(agreed): flag window and deadline label"`

### Task 3: `matchAgreedPayload`

**Files:**
- Modify: `lib/push.ts` (after `matchReportedPayload`), `tests/push.test.ts`

**Interfaces:**
- Produces: `matchAgreedPayload(input: { matchId: string; reporterName: string; reporterScore: number; opponentScore: number; gameLabel: string; format: string | null }): PushPayload`.

- [ ] **Step 1: Failing test** in `tests/push.test.ts`:

```ts
it("matchAgreedPayload tells the opponent it counted and how to flag it", () => {
  expect(matchAgreedPayload({ matchId: "m1", reporterName: "Player A", reporterScore: 5, opponentScore: 3, gameLabel: "8-ball", format: "Race to 5" })).toEqual({
    title: "Player A logged your game",
    body: "Player 5–3 you · 8-ball · Race to 5. Counted — not right? Flag it within 24 hours.",
    url: "/",
    tag: "match:m1",
    category: "matches",
  });
});
```
(`first("Player A")` is "Player", matching `matchReportedPayload`'s convention.)

- [ ] **Step 2: Run** `npx vitest run tests/push.test.ts` — FAIL.
- [ ] **Step 3: Implement** mirroring `matchReportedPayload`'s parts join.
- [ ] **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `git commit -m "feat(agreed): push copy for a game counted on the spot"`

### Task 4: Server actions — count it, flag it

**Files:**
- Modify: `lib/confirm-match.ts`, `app/(member)/matches/new/actions.ts` (`reportMatch`), `app/(member)/matches/actions.ts` (add `disputeAgreedMatch`), `app/(member)/admin/actions.ts` (`adminResolveMatch` update sets `agreed_at: null`)

**Interfaces:**
- Consumes: Task 1 RPCs, Task 2 `canFlag`, Task 3 `matchAgreedPayload`, existing `buildRecomputePayload`, `recordMatchMoments`, `notify`, `matchReportedPayload`, `matchDisputedPayload`.
- Produces: `confirmPendingMatch(service: SupabaseClient, match: Match, opts?: { agreed?: boolean }): Promise<void>`; `reportMatch` honours form field `agreed` (`"1"`); `disputeAgreedMatch(formData: FormData): Promise<void>` reading `match_id`; `Match` type gains `agreed_at: string | null`.

- [ ] **Step 1:** `confirmPendingMatch` passes `p_agreed: opts?.agreed ?? false`. Add `agreed_at` to `Match` in `lib/types.ts`.
- [ ] **Step 2:** `reportMatch`: change the insert's `.select("id")` to `.select("*")`. After the live-game delete, branch on `formData.get("agreed") === "1"`: try `confirmPendingMatch(service, created as Match, { agreed: true })`; on success `recordMatchMoments`, notify the opponent with `matchAgreedPayload`, `revalidatePath("/")`, redirect with the success copy. In `catch`, fall through to today's reported push and redirect with the fallback copy (first name of the opponent, from a profile read). Keep the redirects outside `try` (a Next redirect throws).
- [ ] **Step 3:** `disputeAgreedMatch`: user from session (redirect `/login`); service-read the match `*`; if `!canFlag(match, user.id, new Date())` redirect the refusal; `payload = await buildRecomputePayload(service, [], match.id)`; `service.rpc("undo_agreed_match", { p_match_id, p_opponent_id: user.id, ...payload })`; on error redirect `/?error=` + message; notify the reporter with `matchDisputedPayload` (opponent name = the caller's display name); `revalidatePath("/")`; redirect with the success copy.
- [ ] **Step 4:** `adminResolveMatch`'s `.update({...})` adds `agreed_at: null`.
- [ ] **Step 5: Verify** `npx tsc --noEmit` and `npm run lint` — both clean.
- [ ] **Step 6: Commit** `git commit -m "feat(agreed): count on the spot, flag within a day"`

### Task 5: UI — scoreboard footer, Logged for you, e2e

**Files:**
- Modify: `app/(member)/matches/new/report-form.tsx` (footer), `app/(member)/page.tsx` (query + section)
- Create: `e2e/report-agreed.spec.ts`

**Interfaces:**
- Consumes: `disputeAgreedMatch` (Task 4), `canFlag`/`flagDeadlineLabel` (Task 2).

- [ ] **Step 1: Write the e2e** `e2e/report-agreed.spec.ts`, copying `makeUser`/`logIn` from `e2e/report-duplicate.spec.ts` (prefix `e2e-agree-`, names `E2E Agree A/B {stamp}`). Flow and assertions:
  1. A logs a race to 3 vs B, 3–1, clicks `We agreed — count it` → `getByText(/Counted — ratings updated/)` visible.
  2. DB: the pair's match has `status: "confirmed"` and non-null `agreed_at`; A's rating > 450, B's < 450.
  3. B logs in → heading `Logged for you` visible; row text contains `beat you`; click `Not right?` → `getByText(/Taken out of the ratings/)` visible.
  4. DB: match `status: "disputed"`, `agreed_at: null`; both ratings 450, `matches_played` 0; `activity` rows with that `match_id`: 0.
  5. Duplicate path: A logs a second 3–0 race vs B the same day, clicks `We agreed — count it` → notice `You and E2E already have a game today` → `Log as a new game` → `Counted — ratings updated` visible; DB: a second match `confirmed` with `agreed_at` set.
- [ ] **Step 2: Run** `npx playwright test e2e/report-agreed.spec.ts --workers=1` — FAIL (no such button).
- [ ] **Step 3: Footer.** In `report-form.tsx`: `const [agreed, setAgreed] = useState(false)`; hidden `<input type="hidden" name="agreed" value={agreed ? "1" : ""} />`. Non-notice footer when `!s.disabled`: primary `SubmitButton` `We agreed — count it` (`onClick={() => setAgreed(true)}`, `disabled={checking}`, pending `Counting…`), ghost `SubmitButton` with `s.label` (`onClick={() => setAgreed(false)}`, pending `Sending…`), helper line from Global Constraints. When `s.disabled`: today's single disabled button and reason. While `checking`, the button that was tapped shows its pending text (`agreed ? "Counting…" : "Sending…"`).
- [ ] **Step 4: Home.** Add a query to the `Promise.all`: matches with `opponent_id = user.id`, `status = 'confirmed'`, `agreed_at not null`, `confirmed_at >= now - AGREED_WINDOW_MS`, selecting the same reporter join as `toConfirm` plus `agreed_at, confirmed_at, status, opponent_id`; filter with `canFlag`. Render a `Logged for you` section between `Confirm results` and `Waiting on`, rows in the `Confirm results` style; trailing a `<form action={disputeAgreedMatch}>` with hidden `match_id` and a muted `Not right?` submit.
- [ ] **Step 5: Run** the new e2e plus the existing ones that click Send: `npx playwright test e2e/report-agreed.spec.ts e2e/report-race.spec.ts e2e/report-duplicate.spec.ts --workers=1` — all PASS.
- [ ] **Step 6: Full verify** lint, tsc, unit tests — clean.
- [ ] **Step 7: Commit** `git commit -m "feat(agreed): count-it button and Logged for you on Home"`
