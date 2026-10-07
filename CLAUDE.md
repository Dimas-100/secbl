@AGENTS.md


## Current work (2026-10-06)

- Visual redesign to "Elevated Dark" (Option E): `docs/superpowers/specs/2026-10-06-elevated-dark-redesign-design.md`, reference screens in `docs/design/option-e/`. Supersedes the visual layer of `2026-10-06-design-refresh.md`.
- Levels & XP ladder (computed, no migration): `docs/superpowers/specs/2026-10-06-levels-xp-design.md`.
- Live Club (chat recency, Web Push, app framing, title badges, school logos, show-more, races & spots, live scoreboard): `docs/superpowers/specs/2026-10-06-live-club-design.md`, migration 0020. Push needs the three VAPID env vars (set in Vercel production and `.env.local`).
- Seasons, activity feed & Live now (semester scoreboard with a reset, stored feed on Home over Realtime, the table being played right now): `docs/superpowers/specs/2026-10-06-seasons-feed-live-design.md`, migration 0023. The e2e opens/closes its season through the RPCs, never the Admin form (the form pushes to every real member).
- Posts iteration 1 (photo + caption in the feed, likes, comments, report/hide, admin Posts card; migrations 0025–0026; private `posts` bucket with signed URLs): `docs/superpowers/specs/2026-10-07-posts-design.md` §9. Clip links and reactions-on-every-row are later iterations.
- Where a mockup and a spec disagree, the spec wins. Mockup data (names, 1,482-style ratings) is fake.
