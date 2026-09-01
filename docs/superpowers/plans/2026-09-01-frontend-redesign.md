# SECBL Frontend Redesign ("Sleek Broadcast") Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle every screen to the approved "Sleek Broadcast" direction and make match reporting a one-screen, keyboard-free flow, with no data-model or server-action contract changes.

**Architecture:** Token retune in `globals.css` ripples through the existing shadcn components; a handful of new shared components (`TabBar`, `HeroBand`, `SectionLabel`, `ScoreStepper`, `ReportMatchForm`) carry the direction's signature moves; every page is then a restyle that consumes them. Client-side logic lives in pure `lib/report-form.ts` functions so vitest covers it without DOM tooling.

**Tech Stack:** Next.js 16 App Router, Tailwind v4 (oklch tokens), shadcn components, radix-ui (Dialog), lucide-react, vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-01-frontend-redesign-design.md`

## Global Constraints

- No data-model changes; server actions keep current names and FormData field contracts (`opponent_id`, `my_score`, `their_score`, `game_type`, `played_at`, etc.).
- No component may hardcode a brand color; everything derives from `globals.css` tokens.
- `CardTitle` must remain a real heading element (Phase 4 accessibility fix).
- Touch targets ≥44px; form controls ≥16px font on mobile (`text-base md:text-sm` pattern).
- Dark mode `.dark` block: leave as-is (unapplied); do not retune, do not delete.
- Tests: `tests/*.test.ts` (vitest) must stay green throughout; Playwright `--workers=1` at the end.
- Commit after every task with the session trailer.

---

### Task 1: Design tokens and stat utilities

**Files:**
- Modify: `app/globals.css`

**Interfaces:**
- Produces: color utilities `bg-gold`, `text-gold`, `text-gold-foreground`, `bg-surface-dark`, `text-surface-dark-foreground`; CSS vars `--hero-from`, `--hero-to`, `--shadow-card`, `--shadow-raised`; utility classes `.stat-number`, `.hero-gradient`.

- [ ] **Step 1: Retune `:root` tokens.** In the `:root` block: `--radius: 0.625rem` → `0.875rem`; `--background: oklch(1 0 0)` → `oklch(0.97 0.008 95)`. Append to `:root`:

```css
  /* Sleek Broadcast additions. Gold promoted to a semantic action color for
     the one hero CTA per screen; surface-dark is the tab bar's near-black
     green; hero-from/to are the page-band gradient stops. */
  --gold: oklch(0.904 0.153 95.2);
  --gold-foreground: oklch(0.28 0.06 95);
  --surface-dark: oklch(0.19 0.012 143.4);
  --surface-dark-foreground: oklch(0.985 0 0);
  --hero-from: oklch(0.44 0.14 143.4);
  --hero-to: oklch(0.36 0.125 143.4);
  --shadow-card: 0 2px 10px oklch(0.25 0.03 143.4 / 8%);
  --shadow-raised: 0 4px 14px oklch(0.25 0.03 143.4 / 25%);
```

- [ ] **Step 2: Expose the new colors to Tailwind.** In `@theme inline` append:

```css
  --color-gold: var(--gold);
  --color-gold-foreground: var(--gold-foreground);
  --color-surface-dark: var(--surface-dark);
  --color-surface-dark-foreground: var(--surface-dark-foreground);
```

- [ ] **Step 3: Add utilities** after the `@layer base` block:

```css
@utility stat-number {
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.02em;
}
@utility hero-gradient {
  background-image: linear-gradient(170deg, var(--hero-from), var(--hero-to));
}
```

- [ ] **Step 4: Verify.** Run `npm run test` (green, unaffected) and `npm run build` (compiles). Load any page via `npm run dev` if in doubt — background should now read warm, radii rounder.
- [ ] **Step 5: Commit** `style: retune tokens for Sleek Broadcast; add gold/surface/hero/shadow vocabulary`.

### Task 2: Base components — borderless Card, hero Button, SectionLabel

**Files:**
- Modify: `components/ui/card.tsx`, `components/ui/button.tsx`
- Create: `components/section-label.tsx`

**Interfaces:**
- Produces: `<Button variant="hero" size="xl">`; `<SectionLabel>` (renders a styled `CardTitle`); Card now borderless with `--shadow-card`.

- [ ] **Step 1: Card.** In `Card`, replace the class string `"flex flex-col gap-6 rounded-xl border bg-card py-6 text-card-foreground shadow-sm"` with `"flex flex-col gap-4 rounded-xl bg-card py-5 text-card-foreground shadow-[var(--shadow-card)]"`. (Border removed at the component, not by blanking the token — hairline dividers elsewhere still use `--border`.)
- [ ] **Step 2: Button.** Add to `variant`: `hero: "bg-gold text-gold-foreground font-extrabold shadow-[var(--shadow-raised)] hover:bg-gold/90"`. Add to `size`: `xl: "h-12 rounded-xl px-6 text-base has-[>svg]:px-5"`.
- [ ] **Step 3: SectionLabel.**

```tsx
import { CardTitle } from "@/components/ui/card";

// The Sleek Broadcast section label: tiny letterspaced caps. Wraps CardTitle
// so every card keeps a real heading in the document outline.
export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <CardTitle className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
      {children}
    </CardTitle>
  );
}
```

- [ ] **Step 4: Verify** `npm run build`; spot-check home page — cards borderless on warm ground.
- [ ] **Step 5: Commit** `style: borderless Card, hero Button variant, SectionLabel`.

### Task 3: App shell — TabBar, slim header, safe areas

**Files:**
- Create: `components/tab-bar.tsx`
- Modify: `app/(member)/layout.tsx`, `app/layout.tsx` (viewport), `app/(member)/settings/page.tsx` (receives Logout)

**Interfaces:**
- Consumes: `logout` action from `@/app/(public)/login/actions`.
- Produces: `<TabBar />` (client, no props) rendered by the member layout.

- [ ] **Step 1: TabBar component.**

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, CalendarDays, Home, Plus, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/", label: "Home", icon: Home },
  { href: "/events", label: "Events", icon: CalendarDays },
  { href: "/matches/new", label: "Report", icon: Plus, raised: true },
  { href: "/tournaments", label: "Cups", icon: Trophy },
  { href: "/leaderboard", label: "Ranks", icon: BarChart3 },
] as const;

export function TabBar() {
  const pathname = usePathname();
  // Section prefixes keep the tab lit on detail pages (/events/123 → Events).
  const active = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <nav className="bg-surface-dark fixed inset-x-0 bottom-0 z-10">
      <div className="mx-auto flex max-w-3xl items-center justify-around pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))]">
        {TABS.map(({ href, label, icon: Icon, ...tab }) => (
          <Link
            key={href}
            href={href}
            aria-current={active(href) ? "page" : undefined}
            className={cn(
              "flex min-w-14 flex-col items-center gap-0.5 text-[10px] font-semibold",
              "raised" in tab && tab.raised
                ? "-mt-7"
                : active(href)
                  ? "text-gold"
                  : "text-surface-dark-foreground/50"
            )}
          >
            {"raised" in tab && tab.raised ? (
              <span className="bg-gold text-gold-foreground flex size-14 items-center justify-center rounded-full shadow-[var(--shadow-raised)]">
                <Icon className="size-7" />
              </span>
            ) : (
              <Icon className="size-5" />
            )}
            <span className={cn("raised" in tab && tab.raised && "text-surface-dark-foreground/70")}>
              {label}
            </span>
          </Link>
        ))}
      </div>
    </nav>
  );
}
```

- [ ] **Step 2: Member layout.** Replace the header contents and the old `<nav>`: header becomes wordmark left + (admin badge-link if admin) + avatar chip right — the chip is a `Link` to `/settings`, a 32px `rounded-full bg-primary text-primary-foreground` circle showing `profile.display_name[0]`, `aria-label="Settings"`. Delete the `logout` form/import from the layout. Replace the old bottom `<nav>` block with `<TabBar />`. Bump the wrapper to `pb-28` (clears the taller bar) and keep `max-w-3xl`.
- [ ] **Step 3: Viewport.** In `app/layout.tsx` extend the export: `export const viewport: Viewport = { themeColor: "#03600c", viewportFit: "cover" };`
- [ ] **Step 4: Settings gains Logout.** In `app/(member)/settings/page.tsx`, import `logout` from `@/app/(public)/login/actions` and add at the bottom of the page: a full-width form — `<form action={logout}><Button variant="outline" className="w-full text-destructive">Log out</Button></form>`.
- [ ] **Step 5: Verify.** `npm run build`; dev-server check: tab bar icons render, active tab gold, Report raised, header shows avatar; Settings shows Log out. Run `npx playwright test e2e/membership.spec.ts --workers=1` (exercises layout + admin) — must pass.
- [ ] **Step 6: Commit** `feat: icon tab bar with raised Report action; slim header; logout moves to Settings`.

### Task 4: HeroBand and the Home screen

**Files:**
- Create: `components/hero-band.tsx`
- Modify: `app/(member)/page.tsx`

**Interfaces:**
- Produces: `<HeroBand title?: React.ReactNode>{children?}</HeroBand>` — gradient band; children render inside it; the *next* sibling element should carry `-mt-3` to overlap.

- [ ] **Step 1: HeroBand.**

```tsx
// The signature Sleek Broadcast move: every member page opens with a felt
// gradient band. Pages overlap their first card onto it with -mt-3.
export function HeroBand({
  title,
  children,
}: {
  title?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="hero-gradient -mx-4 rounded-b-2xl px-5 pt-4 pb-7 text-white">
      {title && <h1 className="text-lg font-extrabold">{title}</h1>}
      {children}
    </div>
  );
}
```

(`-mx-4` bleeds across the layout's `px-4`; the band spans the column edge-to-edge on phones.)

- [ ] **Step 2: Home hero.** In `app/(member)/page.tsx`, fetch the `leaderboard` view (already used by the leaderboard page) alongside the profile: `const { data: board } = await supabase.from("leaderboard").select("id, school_short_name")`. Compute `overall = board.findIndex(r => r.id === user.id) + 1` and school rank by filtering to the user's school first (0 → unranked). Replace the "Your rating" Card with:

```tsx
<HeroBand title="SECBL">
  <div className="mt-2 flex items-baseline gap-3">
    <span className="stat-number text-gold text-5xl leading-none">{me?.rating}</span>
    <div className="text-[11px] leading-tight">
      <div className="font-bold">
        {schoolRank ? `#${schoolRank} at ${mySchool}` : "Unranked"}
      </div>
      <div className="text-white/60">
        {me?.matches_played} played{(me?.matches_played ?? 0) < 10 && " · provisional"}
      </div>
    </div>
  </div>
</HeroBand>
```

  The band replaces the page's `h1`-less top; wrap the rest of the page in the existing `flex flex-col gap-4` and put `-mt-3` on the first card. Every remaining `CardTitle` on the page becomes `SectionLabel` ("Next up", "Confirm results", "Recent"). Confirm/Reject buttons: drop `size="sm"` (default 36px+ targets, full-width pair on their own row below the claim line: `grid grid-cols-2 gap-2`). Recent matches rows become `flex justify-between` with the score right-aligned in `stat-number text-sm`.
- [ ] **Step 3: Verify.** `npm run build`, dev check of home (message/error banners still render). `npm run test` still green.
- [ ] **Step 4: Commit** `feat: HeroBand with rating hero on Home; SectionLabel rollout starts`.

### Task 5: Report-form pure helpers (TDD)

**Files:**
- Create: `lib/report-form.ts`, `tests/report-form.test.ts`

**Interfaces:**
- Produces:
  - `recentOpponents<T extends {id: string}>(matchOpponentIds: string[], all: T[], n?: number): T[]` — ids newest-first (may repeat/contain unknowns); returns up to `n` (default 3) distinct known opponents, padded alphabetically-by-`display_name` from `all` when history is thin. `all` elements carry `display_name: string`.
  - `stepScore(current: number, delta: 1 | -1): number` — clamps 0..99.
  - `submitState(you: number, them: number, opponentName: string | null): { label: string; disabled: boolean; reason: string | null }` — narrated label ("Report 5–3 win" / "Report 3–5 loss"), disabled when no opponent / 0–0 / tie, `reason` a user-facing sentence when disabled.

- [ ] **Step 1: Write failing tests** in `tests/report-form.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { recentOpponents, stepScore, submitState } from "@/lib/report-form";

const roster = [
  { id: "a", display_name: "Ana" },
  { id: "b", display_name: "Ben" },
  { id: "c", display_name: "Cal" },
  { id: "d", display_name: "Dee" },
];

describe("recentOpponents", () => {
  it("keeps newest-first order and dedupes", () => {
    expect(recentOpponents(["c", "a", "c", "b"], roster).map((o) => o.id)).toEqual(["c", "a", "b"]);
  });
  it("ignores ids no longer in the roster", () => {
    expect(recentOpponents(["ghost", "b"], roster, 2).map((o) => o.id)).toEqual(["b", "a"]);
  });
  it("pads alphabetically without duplicating history", () => {
    expect(recentOpponents(["d"], roster).map((o) => o.id)).toEqual(["d", "a", "b"]);
  });
  it("handles empty history", () => {
    expect(recentOpponents([], roster).map((o) => o.id)).toEqual(["a", "b", "c"]);
  });
});

describe("stepScore", () => {
  it("clamps at 0 and 99", () => {
    expect(stepScore(0, -1)).toBe(0);
    expect(stepScore(99, 1)).toBe(99);
    expect(stepScore(3, 1)).toBe(4);
  });
});

describe("submitState", () => {
  it("narrates a win", () => {
    expect(submitState(5, 3, "Priya")).toEqual({ label: "Report 5–3 win", disabled: false, reason: null });
  });
  it("narrates a loss with your score first", () => {
    expect(submitState(3, 5, "Priya").label).toBe("Report 3–5 loss");
  });
  it("blocks ties, 0–0, and missing opponent", () => {
    expect(submitState(4, 4, "Priya")).toMatchObject({ disabled: true, reason: "Scores can't be equal" });
    expect(submitState(0, 0, "Priya").disabled).toBe(true);
    expect(submitState(5, 3, null)).toMatchObject({ disabled: true, reason: "Pick your opponent" });
  });
});
```

- [ ] **Step 2: Run** `npx vitest run tests/report-form.test.ts` — expect FAIL (module missing).
- [ ] **Step 3: Implement** `lib/report-form.ts` (pure, no imports):

```ts
// Pure logic for the one-screen report form, kept out of the component so
// vitest covers it without DOM tooling.

export function recentOpponents<T extends { id: string; display_name: string }>(
  matchOpponentIds: string[],
  all: T[],
  n = 3
): T[] {
  const byId = new Map(all.map((o) => [o.id, o]));
  const picked: T[] = [];
  const seen = new Set<string>();
  for (const id of matchOpponentIds) {
    const o = byId.get(id);
    if (o && !seen.has(id)) {
      picked.push(o);
      seen.add(id);
      if (picked.length === n) return picked;
    }
  }
  const fill = [...all]
    .sort((a, b) => a.display_name.localeCompare(b.display_name))
    .filter((o) => !seen.has(o.id));
  return [...picked, ...fill.slice(0, n - picked.length)];
}

export function stepScore(current: number, delta: 1 | -1): number {
  return Math.min(99, Math.max(0, current + delta));
}

export function submitState(
  you: number,
  them: number,
  opponentName: string | null
): { label: string; disabled: boolean; reason: string | null } {
  if (!opponentName) return { label: "Report match", disabled: true, reason: "Pick your opponent" };
  if (you === 0 && them === 0)
    return { label: "Report match", disabled: true, reason: "Enter the score" };
  if (you === them)
    return { label: "Report match", disabled: true, reason: "Scores can't be equal" };
  const outcome = you > them ? "win" : "loss";
  return { label: `Report ${you}–${them} ${outcome}`, disabled: false, reason: null };
}
```

- [ ] **Step 4: Run** the file's tests, then the whole suite: `npm run test` — all green.
- [ ] **Step 5: Commit** `feat: pure helpers for the one-screen report form (TDD)`.

### Task 6: ScoreStepper and the one-screen ReportMatchForm

**Files:**
- Create: `components/score-stepper.tsx`, `app/(member)/matches/new/report-form.tsx`
- Modify: `app/(member)/matches/new/page.tsx`

**Interfaces:**
- Consumes: `stepScore`, `submitState`, `recentOpponents` from Task 5; `reportMatch` action unchanged; Radix `Dialog` from the installed `radix-ui` package (`import { Dialog } from "radix-ui"`).
- Produces: `<ScoreStepper label value onChange accent?>` (client; `accent` renders the green filled card) — reused by Task 9. `<ReportMatchForm opponents recentIds today>` where `opponents: {id, display_name, school: string | null}[]`, `recentIds: string[]`, `today: string`.

- [ ] **Step 1: ScoreStepper** (`components/score-stepper.tsx`):

```tsx
"use client";

import { stepScore } from "@/lib/report-form";
import { cn } from "@/lib/utils";

export function ScoreStepper({
  label,
  value,
  onChange,
  accent = false,
}: {
  label: string;
  value: number;
  onChange: (next: number) => void;
  accent?: boolean;
}) {
  const btn =
    "flex h-11 flex-1 items-center justify-center rounded-lg text-xl font-bold";
  return (
    <div
      className={cn(
        "flex flex-1 flex-col items-center rounded-xl p-3 shadow-[var(--shadow-card)]",
        accent ? "bg-primary text-primary-foreground" : "bg-card"
      )}
    >
      <span className={cn("text-xs font-bold", accent ? "text-primary-foreground/80" : "text-muted-foreground")}>
        {label}
      </span>
      <span className={cn("stat-number text-4xl", accent && "text-gold")}>{value}</span>
      <div className="mt-2 flex w-full gap-2">
        <button
          type="button"
          aria-label={`Decrease ${label} score`}
          onClick={() => onChange(stepScore(value, -1))}
          className={cn(btn, accent ? "bg-white/15" : "bg-muted text-foreground")}
        >
          −
        </button>
        <button
          type="button"
          aria-label={`Increase ${label} score`}
          onClick={() => onChange(stepScore(value, 1))}
          className={cn(btn, accent ? "bg-gold text-gold-foreground" : "bg-primary text-primary-foreground")}
        >
          +
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: ReportMatchForm** (`app/(member)/matches/new/report-form.tsx`), `"use client"`. State: `opponentId: string | null`, `you: number`, `them: number`, `game: string` (default `"8ball"`), `date: string` (init `today`), `editingDate: boolean`, `pickerOpen: boolean`. Structure:
  - Opponent chips: `recentOpponents(recentIds, opponents)` → three 64px-tall buttons (`type="button"`, initial-circle + first name, selected = `bg-primary text-primary-foreground`, else `bg-card shadow-[var(--shadow-card)]`) + an "All" chip opening the Radix Dialog. If the selected opponent isn't among the chips (picked via search), it replaces the first chip visually by rendering selected-state on an inserted chip.
  - Radix Dialog as bottom sheet: `Dialog.Root open={pickerOpen} onOpenChange={setPickerOpen}`, `Dialog.Portal`, `Dialog.Overlay className="fixed inset-0 z-20 bg-black/40"`, `Dialog.Content className="fixed inset-x-0 bottom-0 z-30 max-h-[75vh] overflow-y-auto rounded-t-2xl bg-background p-4"` containing `Dialog.Title` ("Pick opponent"), a filter `<Input autoFocus placeholder="Search members" />` (16px on mobile already), and the full roster as full-width rows (name + school chip) that set `opponentId` and close.
  - Steppers: `<div className="flex gap-3"><ScoreStepper label="You" accent value={you} onChange={setYou} /><ScoreStepper label={opponentFirstName ?? "Them"} value={them} onChange={setThem} /></div>`.
  - Game segmented control: a `bg-muted rounded-xl p-1 flex` strip of four `<label>`s each wrapping a visually-hidden radio `name="game_type"` + text; checked style `bg-card rounded-lg font-bold shadow-[var(--shadow-card)]`; min height 40px.
  - Date: when `!editingDate`, a line `Today · <button type="button" className="underline">change date</button>`; when editing (or when `date !== today`), the native `<Input type="date" name="played_at" />`. IMPORTANT: when not editing, `played_at` still rides along via `<input type="hidden" name="played_at" value={date} />`.
  - Submit: compute `const s = submitState(you, them, opponentName)`. Render hidden inputs `opponent_id`, `my_score`, `their_score` from state, then `<SubmitButton variant="hero" size="xl" className="w-full" disabled={s.disabled} pendingChildren="Reporting…">{s.label}</SubmitButton>` inside the `<form action={reportMatch}>`. Below: `{s.reason && <p className="text-center text-xs text-muted-foreground">{s.reason}</p>}` and the existing opponent-confirms notice.
- [ ] **Step 3: Rewire the page.** `app/(member)/matches/new/page.tsx` keeps auth + data fetching, adds a second query for recency — the user's matches: `supabase.from("matches").select("reporter_id, opponent_id, created_at").or(`reporter_id.eq.${user.id},opponent_id.eq.${user.id}`).order("created_at", { ascending: false }).limit(30)` → map each row to the *other* profile id for `recentIds`. Opponents query gains nothing (already fetches `schools(short_name)` — flatten to `school`). Page renders `<HeroBand title="Report match" />` then `<ReportMatchForm ... />` (error banner pattern unchanged). Delete `GAME_TYPES`/`selectClass` leftovers from the page (they move into the client form).
- [ ] **Step 4: Verify.** `npm run test`, `npm run build`; dev-server manual pass: select chip → steppers → submit → lands on home with "reported" flow intact (opponent confirm row appears for the other account); tie and 0–0 disable with reasons; search sheet filters and selects; no keyboard unless search/date opened.
- [ ] **Step 5: Commit** `feat: one-screen keyboard-free match reporting`.

### Task 7: Leaderboard and player pages

**Files:**
- Modify: `app/(member)/leaderboard/page.tsx`, `app/(member)/players/[id]/page.tsx`, `app/(member)/schools/page.tsx`

**Interfaces:**
- Consumes: `HeroBand`, `SectionLabel`, `stat-number`.

- [ ] **Step 1: Leaderboard.** Replace the `Table` with `<HeroBand title="Leaderboard" />` + one `Card` (`-mt-3`) whose content is a `divide-y` list. Row (`flex min-h-12 items-center gap-3 py-2`): rank `stat-number w-7 text-lg` — gold (`text-gold-foreground bg-gold rounded-md text-center` chip) for ranks 1–3, plain otherwise; then name link (font-medium, provisional `*` kept) with `Badge variant="secondary"` school under/beside it; right side `stat-number text-lg` rating over `text-xs text-muted-foreground` W–L. Fetch the viewer (`supabase.auth.getUser()`) and give their row `bg-accent -mx-6 px-6` highlight. Keep the provisional footnote + schools link.
- [ ] **Step 2: Players.** `players/[id]`: top becomes `<HeroBand title={player name}>` with school + `stat-number text-gold text-4xl` rating inside the band; history cards get `SectionLabel`; match rows mirror Home's Recent (winner bold, tabular score right).
- [ ] **Step 3: Schools.** `HeroBand title="School standings"` + existing content in a Card with `SectionLabel`s; numbers `stat-number`.
- [ ] **Step 4: Verify** `npm run build` + dev spot-check all three (empty DB renders sane).
- [ ] **Step 5: Commit** `style: leaderboard, player, school pages on the broadcast system`.

### Task 8: Events

**Files:**
- Modify: `app/(member)/events/page.tsx`, `app/(member)/events/[id]/page.tsx`, `app/(member)/events/event-form.tsx`, `app/(member)/events/new/page.tsx`, `app/(member)/events/[id]/edit/page.tsx`

**Interfaces:**
- Consumes: `HeroBand`, `SectionLabel`.

- [ ] **Step 1: List.** `HeroBand title="Events"`; each event a Card row: left a 44px date block (`bg-accent text-accent-foreground rounded-lg text-center` — weekday `text-[10px] uppercase`, day `stat-number text-lg`), right title (font-semibold) + when/location + RSVP tally in muted text. Whole card wrapped in the detail `Link`.
- [ ] **Step 2: Detail.** RSVP actions become three equal chips (`grid grid-cols-3 gap-2`): Going / Maybe / Out as `SubmitButton`s `h-11`; the user's current response `variant="default"`, others `variant="outline"`. Attendee lists under `SectionLabel`s. Admin edit/delete stays, `size` default.
- [ ] **Step 3: Forms.** `event-form.tsx`, new/edit pages: `HeroBand` titles, inputs unchanged (already 16px mobile), submit `Button` default full-width `size="lg"`.
- [ ] **Step 4: Verify.** `npx playwright test e2e/events-flow.spec.ts --workers=1` — the spec exercises create/RSVP/edit; fix any selector that targeted removed structure in the same change.
- [ ] **Step 5: Commit** `style: events on the broadcast system; RSVP as tap chips`.

### Task 9: Tournaments

**Files:**
- Modify: `app/(member)/tournaments/page.tsx`, `app/(member)/tournaments/[id]/page.tsx`, `app/(member)/tournaments/[id]/setup/page.tsx`, `app/(member)/tournaments/new/page.tsx`
- Create: `app/(member)/tournaments/[id]/result-form.tsx`

**Interfaces:**
- Consumes: `ScoreStepper` (Task 6), `HeroBand`, `SectionLabel`; actions `recordResult`/`correctScores`/`voidResult` unchanged (fields `player1_score`, `player2_score`, `winner_id`, ids).
- Produces: `<ResultForm>` client component wrapping the record-result flow.

- [ ] **Step 1: List + new + setup.** `HeroBand` titles; Live badge switches to the gold pair (`bg-gold text-gold-foreground`); cards/forms restyled per system. Seeding list rows min-h-11.
- [ ] **Step 2: ResultForm.** New `"use client"` component receiving `{ tournamentId, matchId, player1: {id, label}, player2: {id, label} }`. State `s1`, `s2` (numbers, init 0) and `winnerId: string | null`. Renders inside `<form action={recordResult}>`: hidden `tournament_id`, `tournament_match_id`, `player1_score`, `player2_score`, `winner_id`; two `ScoreStepper`s (player1 `accent`); winner picked by two `type="button"` toggle chips (auto-preselected to the higher score when scores differ, still tappable to override — scores CAN tie in a race-to-N walkover, the action requires explicit winner); `SubmitButton size="sm"` disabled until `winnerId`. The 16px rule: no text inputs remain. `correctScores` keeps its compact number `Input`s but they become `inputMode="numeric"` and `className="w-16 text-base md:text-sm"`; `voidResult` unchanged.
- [ ] **Step 3: Wire it** into `tournaments/[id]/page.tsx` replacing the `recordResult` form block (the `Input`+`select` cluster at ~lines 127–162); match rows get winner-bold + score `stat-number`.
- [ ] **Step 4: Verify.** `npx playwright test e2e/tournament.spec.ts --workers=1` — this spec drives result entry, so it WILL touch the new steppers; update its fill/select calls to clicks on the +/− buttons (`getByRole("button", { name: /Increase .* score/ })`) and winner chips, keeping the assertion structure.
- [ ] **Step 5: Commit** `feat: tournament result entry on ScoreStepper; tournaments restyled`.

### Task 10: Public pages, pending, settings, admin

**Files:**
- Modify: `app/(public)/login/page.tsx`, `app/(public)/signup/page.tsx`, `app/(public)/forgot-password/page.tsx`, `app/(public)/reset-password/page.tsx`, `app/pending/page.tsx`, `app/(member)/settings/page.tsx`, `app/(member)/admin/page.tsx`

- [ ] **Step 1: Auth pages.** Shared shape per page (no new layout file — four small pages): centered column `mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 px-4`, `BrandLogo className="mx-auto w-40"` on top, one borderless Card with the form, submit `Button className="w-full" size="lg"`, secondary links as muted text. Keep every existing label/id/name (signup + password-reset e2e depend on them).
- [ ] **Step 2: Pending + settings + admin.** `pending`: same centered card, friendly headline ("You're on the list"), body unchanged. Settings/admin: `HeroBand` titles, `SectionLabel` cards, buttons default size; admin's member rows min-h-11 with the Suspend/Reinstate buttons ≥44px wide targets (`size="sm"` is 32px tall — bump to default).
- [ ] **Step 3: Verify.** `npx playwright test e2e/signup-flow.spec.ts e2e/password-reset.spec.ts e2e/membership.spec.ts --workers=1`.
- [ ] **Step 4: Commit** `style: auth, pending, settings, admin on the broadcast system`.

### Task 11: Full verification, mobile pass, deploy

- [ ] **Step 1:** `npm run test` (vitest, incl. `TZ=UTC` guard: `TZ=UTC npx vitest run`).
- [ ] **Step 2:** `npm run build` clean.
- [ ] **Step 3:** Full e2e: `npx playwright test --workers=1`.
- [ ] **Step 4: Mobile screenshot sweep.** Temporary script (scratch, not committed) driving Playwright at 390×844 through login → home → report → leaderboard → events → tournaments; eyeball each screenshot for: tab bar clearance (nothing hidden behind it), band overlap, target sizes, text truncation.
- [ ] **Step 5:** Fix anything the sweep surfaces; re-run affected checks.
- [ ] **Step 6: Commit** any fixes; `vercel deploy --prod --yes` (retry once on transient "Not authorized"); smoke-check `/`, `/login`, `/tournaments` for 200s; `vercel logs` error scan.

## Self-review notes

- Spec coverage: §2→Task 1, §2 components→Task 2, §3→Task 3, §4→Task 4, §5→Tasks 5–6, §6→Tasks 4/7/8/9/10, §7 woven through (targets/16px/aria in Tasks 3/6/9/10), §8→Tasks 5/8/9/10/11, §9 order preserved. Dark-mode deferral honored (no task touches `.dark`).
- Type consistency: `recentOpponents/stepScore/submitState` signatures match between Tasks 5 (definition) and 6 (consumption); `ScoreStepper` props match between Tasks 6 and 9; `SectionLabel`/`HeroBand` usage consistent across 4/7/8/9/10.
- Known judgment call recorded: tournament winner chips auto-preselect the higher score but stay explicit (the action demands `winner_id`; ties are possible on walkover corrections).
