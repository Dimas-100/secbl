# Option E reference screens

Design source for `docs/superpowers/specs/2026-10-06-elevated-dark-redesign-design.md`.

These are **reference, not code to ship.** Each `.dc.html` is one 390×844 phone screen from the design canvas. They won't run here (they expect the canvas runtime's `support.js`). Read them for exact values: every color, size, spacing and radius is in an inline `style="…"`, and sample data is in the `renderVals()` block at the bottom.

| File | Route |
|---|---|
| `OptE_Home.dc.html` | `app/(member)/page.tsx` |
| `OptE_Ranks.dc.html` | `app/(member)/leaderboard/page.tsx` |
| `OptE_LogGame.dc.html` | `app/(member)/matches/new` |
| `OptE_Events.dc.html` | `app/(member)/events/page.tsx` |
| `OptE_Profile.dc.html` | `app/(member)/players/[id]` |
| `OptE_Chats.dc.html` | `app/(member)/chat/page.tsx` |

Mockup data is fake. Ratings like 1,482 use the wrong scale (real ratings start at 450), names are invented, and the tonal-initial avatars stand in for the real photo → ball fallback in `components/avatar.tsx`. Where the spec and a mockup disagree, **the spec wins.**

Live canvas (owner only): https://claude.ai/code/artifact/e85b35ea-9168-4dbe-acf1-0d904da08ff4
