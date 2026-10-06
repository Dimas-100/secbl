# SECBL Visual Redesign — "Elevated Dark" (Option E)

**Date:** 2026-10-06
**Status:** Implemented 2026-10-06 (plan: `docs/superpowers/plans/2026-10-06-elevated-dark-redesign.md`)
**Supersedes:** the *visual* layer of `2026-10-06-design-refresh.md` (palette, display type, hero band, tab bar styling). Its data features (sparkline, stat logic in `lib/stats.ts`, personalization, achievements, head-to-head) all stay.
**Scope:** UI only. No schema changes, no new server logic. The level/XP ladder is a separate spec: `2026-10-06-levels-xp-design.md`.
**Reference screens:** `docs/design/option-e/*.dc.html` (one file per screen; inline styles hold the exact values). Live canvas: https://claude.ai/code/artifact/e85b35ea-9168-4dbe-acf1-0d904da08ff4 (owner-only link).

## 1. Decisions and why

| Decision | Why | Reverses |
|---|---|---|
| **Dark only.** Near-black ground, no light theme. | Owner wants a professional, elevated look; profile photos read better on a calm dark ground. | The design-refresh spec rejected dark-first because members report in bright bars. Mitigation: high-contrast text (see §2), large score numerals, no low-contrast greys below 4.5:1. Revisit if members complain. |
| **One typeface: Geist.** Drop the Archivo display face (`--font-display`). | Owner rejected the serif and the mixed-face look. Hierarchy comes from size and weight alone. | Commit `05506e1` (Archivo numerals/titles). |
| **Restraint over containers.** Hairline-divided rows and grids; a card only where something is a distinct object (next match, featured event). | Fewer boxes is what makes it read as quality instead of clutter. | Stat tiles, felt hero band, champagne chips. |
| **One accent, brass, used sparingly.** | Accent marks only what matters: trend line, your school's bar, #1, unread state, selected states. | Felt green and gold as UI colors. Brand gold `#ffde59` stays for the logo and the Champion achievement only. |
| **Win/loss by weight, not color, in rows.** Win = primary text, loss = muted text. Semantic green/red only in deltas on the Log screen. | Keeps lists calm; color reserved for the one place it carries meaning. | W/L colored pills. |

## 2. Tokens (replace the `.dark` block in `app/globals.css`; add `class="dark"` to `<html>`)

| Token | Value | Use |
|---|---|---|
| `--background` | `#0E0F11` | App ground, tab bar, sticky footers |
| `--card` | `#16181B` | The few cards, search fields, segmented track |
| `--hairline` | `rgba(255,255,255,.07)` (rows `.06`, dividers `.08`) | All separators |
| `--foreground` | `#F2F1EE` | Primary text, primary button fill |
| `--muted-foreground` | `#8E9196` | Meta, captions, losses (6.0:1 on ground) |
| tab inactive | `#7D8086` | Inactive tab icon + label (4.7:1) |
| `--brass` | `#C9A96E` | The accent (8.5:1) — links, trend line, unread, active switch |
| win delta | `#8FCBAA` | "+16", "Attending", win result text on Log |
| loss delta | `#E0A08A` | Loss result text on Log only |
| avatar ring | `0 0 0 1px rgba(255,255,255,.10)` | Every avatar; selected = `0 0 0 2px bg, 0 0 0 3px brass` |
| primary button | bg `#F2F1EE`, text `#0E0F11`, radius full | "Send to … to confirm", Register, + |
| ghost button | transparent, `inset 0 0 0 1px rgba(255,255,255,.18)` | Edit profile, steppers (−), icon buttons |

Every pairing above is ≥4.5:1 except decorative hairlines. Keep the existing rule: no component hardcodes a color.

## 3. Type (Geist only, `font-feature-settings: 'tnum'` on the app root)

| Role | Size / weight / tracking |
|---|---|
| Hero number (rating, Log scores) | 72px / 500 / −0.045em, line-height .9 |
| Page title (Leaderboard, Events) | 32px / 600 / −0.03em |
| Profile name | 28px / 600 / −0.025em |
| Section heading | 17px / 600 / −0.01em |
| Row title | 15px / 500 |
| Body / meta | 13px / 400, muted |
| Caption | 12px, muted |
| Overline | 11px / 500 / 0.14em uppercase, muted |
| Tab label | 10px / 500 / 0.04em |

Big numbers are **medium weight with tight tracking**, never bold — that is the single detail that makes them look precise rather than heavy.

## 4. Navigation change

Tab bar: **Home · Ranks · ＋ · Events · Profile** (was Home · Events · Report · Cups · Ranks).

- **＋** is a 50px `#F2F1EE` circle sitting *in* the bar (margin-top −6px), not floating above it. Route stays `/matches/new`.
- **Cups moves into Events** as an underline tab ("Upcoming · Going · My school · Past" today; add "Cups"). Tournament routes are unchanged; only the entry point moves.
- **Profile** tab → the viewer's own `/players/[id]`. Settings opens from the sliders icon top-left of Profile. Admin stays reachable from Settings for admins (keep the pending-signup badge on that entry).
- **Messages** stays a header icon (top-right on every tab), unread shown as a 7px brass dot.
- Icons: lucide at `strokeWidth={1.6}`, 22px in the tab bar.

## 5. Screens (reference file → route)

**Home** (`OptE_Home.dc.html` → `app/(member)/page.tsx`): header = avatar (links to Profile) + "Good evening / Name", chat icon. Rating block with no card: overline "Rating · {season}", hero number, delta right-aligned, 1.6px brass sparkline with end dot over a hairline baseline (keep the draw-once animation), then a 3-cell hairline grid (Overall rank · Win rate · Level). "Next match" card with attendee avatar stack. "Recent" = hairline `MatchRow`s. Keep existing Confirm-results / Waiting-on strips, restyled as hairline rows with a brass action link.

**Ranks** (`OptE_Ranks.dc.html` → `leaderboard/page.tsx`): overline + 32px title, underline tabs Players / Schools (keep the existing All league / My school filter as a third control or a menu). Podium = three avatars (80px for #1, 64px for #2/#3) with a double ring in gold/silver/bronze tones and a small "#1" label — no blocks, no confetti. Rows 4+ hairline; your row gets `--card` fill, 14px radius, bleeding 12px past the gutter. Keep 7-day movement and the provisional asterisk (muted, after the rating). Schools tab: rank number, school dot + name, points right, 2px bar (your school brass, others 35% white), "n players · W–L" caption.

**Log a game** (`OptE_LogGame.dc.html` → `matches/new`): close (✕) top-left. Opponent = search field + 4 recent opponents as 56px avatars with first names. Game type = pill segmented control on `--card` track. Score = two 72px numerals split by a 1px vertical hairline, ghost − and solid + steppers (44px). Result line under the scores. When row as a hairline list item. **Drop the mockup's "Ranked" switch** — every confirmed match is rated in this app and there is no unranked concept; adding one is a product decision, not part of this redesign. Sticky footer: primary button "Send to {first name} to confirm" + caption. All existing report-form validation and confirmation flow unchanged.

**Events** (`OptE_Events.dc.html` → `events/page.tsx`): overline month + title. Underline tabs. Featured event card: brass overline, date top-right, title 24/600, details, 2px fill bar ("41 of 64 spots"), avatar stack, primary Register button. List = date column (DOW overline + 24px day) + title/meta + status ("Going" win-green, "RSVP" brass).

**Profile** (`OptE_Profile.dc.html` → `players/[id]`): 128px photo with a 1px white ring + 6px gap + 1px brass ring; camera button bottom-right on your own profile only. No photo → keep the existing **ball fallback** from `components/avatar.tsx` (the mockup's tonal initials are placeholders; the ball is better). Name, @handle · school dot · school. Edit profile + Share ghost buttons (own profile); head-to-head "vs you" card on others' profiles (keep). 4-cell hairline stat grid (Rating · Rank · Record · Best streak). Level line ("Level 12 · Shark", brass title) + 2px bar — **render only once the levels spec ships**; until then show achievements "n of 9 · next: …" in that slot. Match history hairline rows.

**Messages** (`OptE_Chats.dc.html` → `chat/page.tsx`): back, title, primary "new message" icon button. Search field, underline tabs All / Direct / Schools / Events. Rows: people = round avatars, rooms = 14px-radius squares, school rooms get a 12px school-color dot bottom-right. Unread = 600-weight name, brass time, brass count pill, lighter preview.

## 6. Components

Restyle in place, don't fork: `TabBar`, `Segmented` (→ underline variant + pill variant), `SectionLabel` (→ overline), `StatTile` (→ `StatGrid` hairline cells), `MatchRow`, `HeroBand` (→ rating block, no band), `Sparkline` (stroke only, no area fill), `ScoreStepper`, `Avatar` (add `2xl` = 128px and the selected ring). New: `ListRow` (shared hairline row), `UnderlineTabs` if `Segmented` can't carry both variants cleanly.

## 7. Out of scope

Level/XP display (separate spec), any schema change, light theme, new copy beyond what the reference screens show, tournament bracket restyle (follow the tokens; no bespoke design yet).

## 8. Done when

- Every member route renders on the new tokens with no hardcoded colors (`grep -rn "#[0-9a-fA-F]\{6\}" app components` only hits `globals.css` and `lib/identity.ts` ball colors).
- Tab bar matches §4; Cups reachable from Events; Profile tab opens your own player page.
- Contrast: all text pairs ≥4.5:1 (spot-check muted text, tab labels, brass links).
- `npm run lint`, `npx tsc --noEmit`, `npx vitest run --exclude "tests/*.integration.test.ts"`, `npx playwright test --workers=1`, `npm run build` all pass. E2E selectors that relied on tab labels ("Report", "Cups") are updated.
