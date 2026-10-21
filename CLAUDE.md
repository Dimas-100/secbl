@AGENTS.md

## Rules

- The repo is public. Tests, fixtures, specs and commit messages use invented names only ("Player A"); never copy a
  real member's name into the repo, from the database or anywhere else. The ship guard refuses a push carrying a
  current member's name.

## Current work (2026-10-06)

- Visual redesign to "Elevated Dark" (Option E): `docs/superpowers/specs/2026-10-06-elevated-dark-redesign-design.md`, reference screens in `docs/design/option-e/`. Supersedes the visual layer of `2026-10-06-design-refresh.md`.
- Levels & XP ladder (computed, no migration): `docs/superpowers/specs/2026-10-06-levels-xp-design.md`.
- Live Club (chat recency, Web Push, app framing, title badges, school logos, show-more, races & spots, live scoreboard): `docs/superpowers/specs/2026-10-06-live-club-design.md`, migration 0020. Push needs the three VAPID env vars (set in Vercel production and `.env.local`).
- Seasons, activity feed & Live now (semester scoreboard with a reset, stored feed on Home over Realtime, the table being played right now): `docs/superpowers/specs/2026-10-06-seasons-feed-live-design.md`, migration 0023. The e2e opens/closes its season through the RPCs, never the Admin form (the form pushes to every real member).
- Posts iteration 1 (photo + caption in the feed, likes, comments, report/hide, admin Posts card; migrations 0025–0026; private `posts` bucket with signed URLs): `docs/superpowers/specs/2026-10-07-posts-design.md` §9. Clip links and reactions-on-every-row are later iterations.
- Where a mockup and a spec disagree, the spec wins. Mockup data (names, 1,482-style ratings) is fake.

## Current work (2026-10-20)

- Agreed results ("We agreed — count it" on the scoreboard; the opponent can flag it for 24 h, which drops it into Admin → Disputes): `docs/superpowers/specs/2026-10-20-agreed-results-design.md`, migrations 0028/0028b. `undo_agreed_match` takes a whole recompute payload, so it is service-role only — never grant it to members.
- Table talk (comments on a live game; they cascade away with the `live_games` row): `docs/superpowers/specs/2026-10-20-table-talk-design.md`, migration 0029. The composer has no `<form>`: on the scoreboard it sits in a portal inside the report form.
- Club night (a per-school line for N tables; the first in line keeps score; a reported result frees the table): `docs/superpowers/specs/2026-10-20-club-night-design.md`, migrations 0030–0031. Night tests run in a school with no approved real members and skip if there is none.
- The Supabase MCP `apply_migration` fails with "Invalid or expired requestState" when it wants a confirmation nobody can answer (seen on `drop` statements and on replacing existing functions). Prefer additive SQL (`alter policy`, a wrapper function); otherwise apply with the owner present.
