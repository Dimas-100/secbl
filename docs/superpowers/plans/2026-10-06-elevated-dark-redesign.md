# Elevated Dark Redesign (Option E) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-skin every member route onto the dark, single-typeface, hairline-divided "Elevated Dark" system, move the tab bar to Home · Ranks · ＋ · Events · Profile, and fold Cups into Events — UI only, no schema or server-logic changes.

**Architecture:** Tokens live once in `app/globals.css` (dark only, Geist only); every component inherits them. The shared member header disappears — each screen renders its own header from a small `PageHeader` / `MessagesButton` pair, and the tab bar learns the viewer's profile route. Existing shared components are restyled in place (`TabBar`, `Segmented`, `SectionLabel`, `StatTile`, `MatchRow`, `Sparkline`, `ScoreStepper`, `Avatar`); `HeroBand` is replaced by `PageHeader` and deleted. New small primitives (`ListRow`, `UnderlineTabs`, `AvatarStack`, `SectionHeading`) carry the hairline-row language. Pure logic additions (season label, result line, inbox filter, school match, longest streak) go into `lib/` test-first; components are verified by lint/tsc/build and the existing Playwright suite.

**Tech Stack:** Next.js 16 App Router (server components + server actions), React 19, Tailwind 4 (`@theme inline` tokens), shadcn/ui primitives, lucide-react, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-06-elevated-dark-redesign-design.md` (reference screens in `docs/design/option-e/*.dc.html`; where they disagree, the spec wins).

## Global Constraints

- Dark only: ground `#0E0F11`, card `#16181B`, text `#F2F1EE`, muted `#8E9196`, tab inactive `#7D8086`, brass `#C9A96E`, win delta `#8FCBAA`, loss delta `#E0A08A`; hairlines `rgba(255,255,255,.07)` (rows `.06`, dividers `.08`).
- One typeface: Geist. `--font-display` / Archivo removed. `font-feature-settings: 'tnum'` on the app root.
- Big numbers are weight 500 with tight tracking (hero 72px / −0.045em / line-height .9), never bold.
- No component hardcodes a color. `grep -rn "#[0-9a-fA-F]\{6\}" app components` may hit only `app/globals.css` (plus the pre-existing brand files `app/icon.svg`, the `themeColor` in `app/layout.tsx` and `app/manifest.ts`, which must carry `#0E0F11`).
- All text pairs ≥ 4.5:1 on their ground.
- Brand gold `#ffde59` only for the logo and the Champion achievement.
- Win/loss in rows by weight (win = primary text, loss = muted), never by color. Semantic green/red only for deltas.
- Lucide icons at `strokeWidth={1.6}`, 22px in the tab bar.
- Primary button: bg `#F2F1EE`, text `#0E0F11`, fully rounded. Ghost button: transparent, `inset 0 0 0 1px rgba(255,255,255,.18)`.
- Tab bar: Home · Ranks · ＋ · Events · Profile. ＋ is a 50px foreground circle *in* the bar (`margin-top: -6px`), route `/matches/new`.
- No "Ranked" switch on Log a game. All report-form validation and the confirm flow are unchanged.
- No schema changes, no new server logic, no light theme, no level/XP display (separate plan).
- Verify suite: `npm run lint`, `npx tsc --noEmit`, `npx vitest run --exclude "tests/*.integration.test.ts"`, `npx playwright test --workers=1`, `npm run build`.

## Review Focus

Inputs the spec implies but no screen mock exercises; each has a test pinned to the owning task below.

1. **A member with zero confirmed matches** opens Home and Profile: rating block must show the 450 baseline, a flat sparkline, "–" stats and no crash from empty arrays (Task 4/8: `seasonLabel` + `longestWinStreak([])` tests; existing `sparklinePoints` single-value test).
2. **A long display name / school name** in a hairline row or the podium must truncate, not wrap into the right column (Task 2b: `MatchRow` and `ListRow` use `min-w-0` + `truncate`; Playwright profile test with the long tagline still passes).
3. **The viewer's own row on Ranks when they are in the podium** must not render twice and the "your row" card must only appear in rows 4+ (Task 5 structure; manual check with the mock season).
4. **Log a game with the same score both sides / 0–0 / no opponent** keeps the primary button disabled with the reason caption (Task 6: `submitState` tests kept and relabelled; new `resultLine` tests).
5. **Chat inbox search that matches nothing** and the "Schools" tab with a member whose school room has no messages must render an empty-state line, not a blank list (Task 9: `filterInbox` tests).

---

## File map

| Path | Responsibility |
|---|---|
| `app/globals.css` | All tokens (dark), type utilities (`overline`, `hero-number`, `stat-number`, `display`), press + sparkline motion |
| `app/layout.tsx`, `app/manifest.ts` | Geist only, `class="dark"` on `<html>`, `#0E0F11` chrome |
| `app/(member)/layout.tsx` | Auth gate + `TabBar` only (no header) |
| `components/page-header.tsx` | **New.** Overline + 32px title (top-level) or back/close + 17px title (sub-page), trailing slot |
| `components/messages-button.tsx` | **New.** Async server component: ghost 44px chat icon + brass unread dot |
| `components/tab-bar.tsx` | New five tabs, hidden on `/matches/new` |
| `components/list-row.tsx` | **New.** Hairline row (link or static) |
| `components/section-heading.tsx` | **New.** 17px/600 `h2` with optional brass action link |
| `components/section-label.tsx` | Overline variant of `CardTitle` |
| `components/underline-tabs.tsx` | **New.** Link-based underline tabs (URL is state) |
| `components/segmented.tsx` | Pill segmented control on the card track (link-based) |
| `components/stat-tile.tsx` | `StatGrid` + `StatTile` as hairline cells |
| `components/avatar.tsx` | `2xl` size, default hairline ring, `selected` ring, double `ring` |
| `components/avatar-stack.tsx` | **New.** Overlapping 30px avatars |
| `components/sparkline.tsx` | 1.6px brass stroke, end dot, hairline baseline, full width |
| `components/score-stepper.tsx` | 72px numeral, ghost −, solid + |
| `components/match-row.tsx` | Opponent-centric row when a perspective player is given; winner/loser row otherwise |
| `components/share-button.tsx` | **New.** Client: `navigator.share` → clipboard fallback |
| `components/ui/button.tsx`, `badge.tsx`, `card.tsx`, `input.tsx` | Variant restyle (pill primary, ghost ring, hairline card) |
| `lib/stats.ts` | + `seasonLabel`, `longestWinStreak` (moved from achievements), `overallRank` |
| `lib/report-form.ts` | `submitState` labels, + `resultLine` |
| `lib/events.ts` | + `eventMentionsSchool` |
| `lib/chat.ts` | + `filterInbox` |
| `app/(member)/page.tsx` | Home |
| `app/(member)/leaderboard/page.tsx` | Ranks (Players / Schools tabs) |
| `app/(member)/matches/new/{page,report-form}.tsx` | Log a game |
| `app/(member)/events/page.tsx` | Events (Upcoming · Going · My school · Past · Cups) |
| `app/(member)/players/[id]/page.tsx` | Profile |
| `app/(member)/chat/page.tsx`, `chat/inbox-list.tsx` (**new**), `chat/new-message-sheet.tsx`, `chat/[id]/chat-room.tsx` | Messages |
| `app/(member)/settings/page.tsx` | Back to Profile, Admin entry with pending badge |
| Other member pages (`admin`, `tournaments/*`, `events/new`, `events/[id]*`, `schools`) | `HeroBand` → `PageHeader`, tokens only |
| `e2e/*.spec.ts` | Selector updates: "League feed" → "Recent", "Chat" heading → "Messages", `/chat, n unread/` → `/messages, n unread/` |

---

### Task 1: Tokens, fonts and base primitives

**Files:**
- Modify: `app/globals.css`
- Modify: `app/layout.tsx`, `app/manifest.ts`
- Modify: `components/ui/button.tsx`, `components/ui/badge.tsx`, `components/ui/card.tsx`, `components/ui/input.tsx`

**Interfaces:**
- Produces Tailwind color utilities: `bg-background`, `bg-card`, `text-foreground`, `text-muted-foreground`, `text-brass`, `bg-brass`, `text-win`, `text-loss`, `text-tab-inactive`, `border-hairline`, `border-hairline-row`, `border-hairline-divider`, `ring-hairline`, `ring-hairline-strong`, `ring-hairline-ghost`, `bg-hairline-divider`, `text-podium-1/2/3`, `bg-gold text-gold-foreground`.
- Produces utilities: `overline`, `hero-number`, `stat-number` (tabular, weight 500, −0.02em), `display` (600, −0.03em), `press`, `.sparkline-draw`, `.sparkline-dot`.
- Produces Button variants: `default` (primary pill), `ghost` (ring pill), `outline` (alias of ghost), `link` (brass), `destructive`; sizes unchanged plus `icon` = 44px circle. `hero` variant is **removed**.

- [ ] **Step 1: Replace the token blocks in `app/globals.css`**

Replace everything from `/*\n * THEME TOKENS` through the end of the `.dark { … }` block with:

```css
/*
 * THEME TOKENS — single source of truth (Elevated Dark, 2026-10-06).
 * Dark only. No component may hardcode a color; everything inherits from here.
 * Every text pairing below is ≥ 4.5:1 on its ground:
 *   foreground on background 16.9:1 · muted 6.0:1 · tab-inactive 4.7:1
 *   brass 8.5:1 · win 10.2:1 · loss 7.1:1 · destructive 5.6:1
 */
:root {
  --radius: 0.875rem;
  --background: #0E0F11;
  --foreground: #F2F1EE;
  --card: #16181B;
  --card-foreground: #F2F1EE;
  --popover: #16181B;
  --popover-foreground: #F2F1EE;
  /* Primary = the one solid button: light fill, dark text. */
  --primary: #F2F1EE;
  --primary-foreground: #0E0F11;
  /* Quiet chips and fills. */
  --secondary: #1E2024;
  --secondary-foreground: #F2F1EE;
  --muted: #1A1C20;
  --muted-foreground: #8E9196;
  --accent: #1E2125;
  --accent-foreground: #F2F1EE;
  --destructive: #E07A6A;
  --border: rgba(255, 255, 255, 0.08);
  --input: rgba(255, 255, 255, 0.12);
  --ring: #C9A96E;
  --chart-1: #C9A96E;
  --chart-2: #8FCBAA;
  --chart-3: #E0A08A;
  --chart-4: #8E9196;
  --chart-5: #F2F1EE;
  --sidebar: #16181B;
  --sidebar-foreground: #F2F1EE;
  --sidebar-primary: #F2F1EE;
  --sidebar-primary-foreground: #0E0F11;
  --sidebar-accent: #1E2125;
  --sidebar-accent-foreground: #F2F1EE;
  --sidebar-border: rgba(255, 255, 255, 0.08);
  --sidebar-ring: #C9A96E;
  /* The accent. Trend line, your school's bar, #1, unread, selected. */
  --brass: #C9A96E;
  /* Hairlines: rows .06, generic .07, section dividers .08, avatar ring .10,
     ghost button ring .18. Decorative only — never text. */
  --hairline: rgba(255, 255, 255, 0.07);
  --hairline-row: rgba(255, 255, 255, 0.06);
  --hairline-divider: rgba(255, 255, 255, 0.08);
  --hairline-strong: rgba(255, 255, 255, 0.1);
  --hairline-ghost: rgba(255, 255, 255, 0.18);
  /* Inactive tab icon + label (4.7:1). */
  --tab-inactive: #7D8086;
  /* Semantic deltas only. */
  --win: #8FCBAA;
  --loss: #E0A08A;
  /* Podium rings: brass, silver, bronze tones. */
  --podium-1: #C9A96E;
  --podium-2: #B8BEC6;
  --podium-3: #B08566;
  /* Brand gold: the logo and the Champion achievement only. */
  --gold: #ffde59;
  --gold-foreground: #0E0F11;
}
```

Then in `@theme inline` replace the `--font-display`, `--color-brass-deep`, `--color-surface-dark*` lines so the custom block reads:

```css
  --font-sans: var(--font-geist-sans);
  --font-mono: var(--font-geist-mono);
  --color-brass: var(--brass);
  --color-hairline: var(--hairline);
  --color-hairline-row: var(--hairline-row);
  --color-hairline-divider: var(--hairline-divider);
  --color-hairline-strong: var(--hairline-strong);
  --color-hairline-ghost: var(--hairline-ghost);
  --color-tab-inactive: var(--tab-inactive);
  --color-podium-1: var(--podium-1);
  --color-podium-2: var(--podium-2);
  --color-podium-3: var(--podium-3);
```

(keep `--color-gold`, `--color-gold-foreground`, `--color-win`, `--color-loss`, and all shadcn color lines; delete `--font-display`, `--color-brass-deep`, `--color-surface-dark`, `--color-surface-dark-foreground`).

- [ ] **Step 2: Replace the utilities**

Replace `@layer base` through the end of the `hero-grain` utility with:

```css
@layer base {
  * {
    @apply border-border outline-ring/50;
  }
  html {
    color-scheme: dark;
  }
  body {
    @apply bg-background text-foreground;
    font-feature-settings: "tnum" 1;
  }
}

/* Numerals everywhere: medium weight, tabular, tight — precise, not heavy. */
@utility stat-number {
  font-weight: 500;
  font-variant-numeric: tabular-nums lining-nums;
  letter-spacing: -0.02em;
}
/* Page titles. */
@utility display {
  font-weight: 600;
  letter-spacing: -0.03em;
}
/* The 72px hero numeral (rating, Log scores). */
@utility hero-number {
  font-size: 72px;
  font-weight: 500;
  line-height: 0.9;
  letter-spacing: -0.045em;
  font-variant-numeric: tabular-nums lining-nums;
}
/* Tiny letterspaced caps over a block. */
@utility overline {
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--muted-foreground);
}
```

Keep `press`, the sparkline keyframes/classes and the reduced-motion block exactly as they are. Delete `hero-gradient` and `hero-grain` **in Task 3** (callers still exist until then) — for now leave them.

- [ ] **Step 3: Root layout and manifest**

`app/layout.tsx`: remove the `Archivo` import, the `archivo` const and its comment, and `${archivo.variable}` from the className; set `className={`${geistSans.variable} ${geistMono.variable} dark h-full antialiased`}`; set `themeColor: "#0E0F11"` with the comment `// Near-black app ground; matches --background in app/globals.css and theme_color in app/manifest.ts.`

`app/manifest.ts`: `background_color: "#0E0F11"`, `theme_color: "#0E0F11"`, comment `// App ground; matches --background in app/globals.css.`

- [ ] **Step 4: Button, Badge, Card, Input**

`components/ui/button.tsx` — replace the `variant` and `size` maps:

```ts
      variant: {
        // The one solid button: light pill, dark text.
        default: "bg-primary text-primary-foreground rounded-full hover:bg-primary/90",
        destructive:
          "bg-destructive text-background rounded-full hover:bg-destructive/90 focus-visible:ring-destructive/20",
        // Ghost = hairline ring, no fill. `outline` is kept as an alias so
        // existing call sites keep compiling.
        ghost: "rounded-full shadow-[inset_0_0_0_1px_var(--hairline-ghost)] hover:bg-accent",
        outline: "rounded-full shadow-[inset_0_0_0_1px_var(--hairline-ghost)] hover:bg-accent",
        secondary: "bg-secondary text-secondary-foreground rounded-full hover:bg-secondary/80",
        link: "text-brass underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-5 text-sm has-[>svg]:px-4",
        xs: "h-7 gap-1 px-2.5 text-xs has-[>svg]:px-2 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-9 gap-1.5 px-4 text-[13px] has-[>svg]:px-3",
        lg: "h-11 px-6 text-sm has-[>svg]:px-5",
        xl: "h-[52px] px-6 text-[15px] font-semibold has-[>svg]:px-5",
        icon: "size-11",
        "icon-xs": "size-7 [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-9",
        "icon-lg": "size-11",
      },
```

Change the base class `rounded-md text-sm font-medium` to `font-medium` (radius comes from the variant) and `[&_svg:not([class*='size-'])]:size-4` to `[&_svg:not([class*='size-'])]:size-[18px]`.

`components/ui/badge.tsx` — variants:

```ts
        default: "bg-primary text-primary-foreground",
        secondary: "bg-secondary text-muted-foreground",
        destructive: "bg-destructive/15 text-destructive",
        outline: "shadow-[inset_0_0_0_1px_var(--hairline-ghost)] text-muted-foreground",
        ghost: "text-muted-foreground",
        link: "text-brass underline-offset-4 [a&]:hover:underline",
```
and in the base class change `rounded-md … font-semibold` to `rounded-full px-2 py-0.5 text-[11px] font-medium`.

`components/ui/card.tsx` — `Card` className: `"flex flex-col gap-4 rounded-[20px] bg-card py-5 text-card-foreground shadow-[inset_0_0_0_1px_var(--hairline-row)]"` with the comment `// A card is a distinct object (next match, featured event): card fill plus an inset hairline, no shadow.`. `CardHeader`/`CardContent`/`CardFooter`: `px-6` → `px-5`.

`components/ui/input.tsx` — replace `h-9 … rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-xs` with `h-12 w-full min-w-0 rounded-full bg-card px-4 text-[15px] shadow-[inset_0_0_0_1px_var(--hairline-row)]` and drop `dark:bg-input/30`. Keep focus/aria-invalid classes.

- [ ] **Step 5: Verify it compiles**

Run: `npx tsc --noEmit && npm run lint`
Expected: both pass (the `hero` variant is still referenced — if tsc reports `variant="hero"` errors, that is expected; they are removed in Task 3. If so, temporarily keep `hero: "bg-primary text-primary-foreground rounded-full"` in the map and delete it in Task 3.)

- [ ] **Step 6: Commit**

```bash
git add app/globals.css app/layout.tsx app/manifest.ts components/ui/button.tsx components/ui/badge.tsx components/ui/card.tsx components/ui/input.tsx
git commit -m "style: Elevated Dark tokens — dark-only ground, Geist only, brass accent, hairline scale; pill buttons, hairline cards and inputs"
```

---

### Task 2a: Layout primitives — PageHeader, MessagesButton, ListRow, SectionHeading, SectionLabel, UnderlineTabs, Segmented, StatGrid

**Files:**
- Create: `components/page-header.tsx`, `components/messages-button.tsx`, `components/list-row.tsx`, `components/section-heading.tsx`, `components/underline-tabs.tsx`
- Modify: `components/section-label.tsx`, `components/segmented.tsx`, `components/stat-tile.tsx`

**Interfaces (produces):**
- `PageHeader({ title, overline?, back?, trailing?, children? })` — `back` is an href; when set the header is the compact row (ghost ← button · 17px title · trailing or 44px spacer). Without `back`: overline + 32px `h1` left, `trailing` right. `trailing` defaults to `<MessagesButton />`; pass `trailing={null}` for none.
- `MessagesButton()` — async server component.
- `ListRow({ href?, leading?, title, meta?, trailing?, className?, replace? })` — `href` renders `Link`, otherwise `div`.
- `SectionHeading({ children, action?: { href, label }, as?: "h2" | "h3" })`.
- `SectionLabel({ children })` — unchanged signature, overline look.
- `UnderlineTabs({ ariaLabel, value, options: { value, label, href }[] })`.
- `Segmented({ ariaLabel, value, options })` — same signature, pill look.
- `StatGrid({ children, cols?: 3 | 4, className? })`, `StatTile({ label, value, note?, tone?, className? })`.

- [ ] **Step 1: `components/messages-button.tsx`**

```tsx
import Link from "next/link";
import { MessageCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/server";

// The inbox entry point, top-right of every tab. One cheap RPC per render so
// the unread dot is right on every page, not just /chat.
export async function MessagesButton() {
  const supabase = await createClient();
  const { data: unreadRaw } = await supabase.rpc("unread_total");
  const unread = Number(unreadRaw ?? 0);
  return (
    <Link
      href="/chat"
      aria-label={unread > 0 ? `Messages, ${unread} unread` : "Messages"}
      className="press relative flex size-11 shrink-0 items-center justify-center rounded-full shadow-[inset_0_0_0_1px_var(--hairline-strong)]"
    >
      <MessageCircle className="size-5" strokeWidth={1.6} />
      {unread > 0 && (
        <span
          aria-hidden="true"
          className="bg-brass ring-background absolute top-2.5 right-2.5 size-[7px] rounded-full ring-2"
        />
      )}
    </Link>
  );
}
```

- [ ] **Step 2: `components/page-header.tsx`**

```tsx
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { MessagesButton } from "@/components/messages-button";
import { cn } from "@/lib/utils";

// Every screen owns its header. Top-level tabs: overline + 32px title with the
// inbox icon on the right. Sub-pages: a ghost back button, a 17px centred
// title and whatever sits on the right (or a spacer so the title stays centred).
export function PageHeader({
  title,
  overline,
  back,
  backLabel = "Back",
  trailing,
  children,
  className,
}: {
  title: React.ReactNode;
  overline?: React.ReactNode;
  back?: string;
  backLabel?: string;
  trailing?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}) {
  const right = trailing === undefined ? <MessagesButton /> : trailing;
  if (back) {
    return (
      <header className={cn("flex flex-col gap-4 pt-3", className)}>
        <div className="flex items-center justify-between gap-3">
          <Link
            href={back}
            aria-label={backLabel}
            className="press flex size-11 shrink-0 items-center justify-center rounded-full shadow-[inset_0_0_0_1px_var(--hairline-strong)]"
          >
            <ChevronLeft className="size-5" strokeWidth={1.7} />
          </Link>
          <h1 className="min-w-0 flex-1 truncate text-center text-[17px] font-semibold tracking-[-0.01em]">
            {title}
          </h1>
          {right ?? <span className="size-11 shrink-0" aria-hidden="true" />}
        </div>
        {children}
      </header>
    );
  }
  return (
    <header className={cn("flex flex-col gap-5 pt-3", className)}>
      <div className="flex items-end justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1.5">
          {overline && <span className="overline">{overline}</span>}
          <h1 className="display truncate text-[32px] leading-none">{title}</h1>
        </div>
        {right}
      </div>
      {children}
    </header>
  );
}
```

- [ ] **Step 3: `components/list-row.tsx`**

```tsx
import Link from "next/link";
import { cn } from "@/lib/utils";

// The shared hairline row: leading visual, title + meta, trailing value.
// A link when it goes somewhere, a plain row otherwise. Rows divide with a
// bottom hairline; the parent can strip the last one with [&>*:last-child]:border-b-0.
export function ListRow({
  href,
  replace,
  leading,
  title,
  meta,
  trailing,
  className,
  ariaLabel,
}: {
  href?: string;
  replace?: boolean;
  leading?: React.ReactNode;
  title: React.ReactNode;
  meta?: React.ReactNode;
  trailing?: React.ReactNode;
  className?: string;
  ariaLabel?: string;
}) {
  const body = (
    <>
      {leading && <span className="flex shrink-0 items-center">{leading}</span>}
      <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
        <span className="truncate text-[15px] font-medium leading-tight">{title}</span>
        {meta && <span className="text-muted-foreground truncate text-[12px] leading-tight">{meta}</span>}
      </span>
      {trailing && <span className="flex shrink-0 flex-col items-end gap-[3px] text-right">{trailing}</span>}
    </>
  );
  const classes = cn(
    "border-hairline-row flex min-h-[68px] items-center gap-3.5 border-b py-3.5",
    href && "press",
    className
  );
  if (href) {
    return (
      <Link href={href} replace={replace} aria-label={ariaLabel} className={classes}>
        {body}
      </Link>
    );
  }
  return <div className={classes}>{body}</div>;
}
```

- [ ] **Step 4: `components/section-heading.tsx`**

```tsx
import Link from "next/link";

// 17px section heading with an optional brass action on the right
// ("Recent · All games"). A real heading so the page keeps its outline.
export function SectionHeading({
  children,
  action,
  as: Tag = "h2",
}: {
  children: React.ReactNode;
  action?: { href: string; label: string };
  as?: "h2" | "h3";
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <Tag className="text-[17px] font-semibold tracking-[-0.01em]">{children}</Tag>
      {action && (
        <Link href={action.href} className="text-brass text-[13px]">
          {action.label}
        </Link>
      )}
    </div>
  );
}
```

- [ ] **Step 5: `components/section-label.tsx`**

```tsx
import { CardTitle } from "@/components/ui/card";

// Overline over a card body. Wraps CardTitle so every card keeps a real
// heading in the document outline.
export function SectionLabel({ children }: { children: React.ReactNode }) {
  return <CardTitle className="overline">{children}</CardTitle>;
}
```

- [ ] **Step 6: `components/underline-tabs.tsx`**

```tsx
import Link from "next/link";
import { cn } from "@/lib/utils";

// Link-based underline tabs: the URL is the state, so back and share work.
// Selected = primary text with a 1px underline sitting on the divider.
export function UnderlineTabs({
  options,
  value,
  ariaLabel,
}: {
  options: { value: string; label: string; href: string }[];
  value: string;
  ariaLabel: string;
}) {
  return (
    <nav aria-label={ariaLabel} className="border-hairline-divider flex gap-6 overflow-x-auto border-b">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Link
            key={o.value}
            href={o.href}
            replace
            aria-current={active ? "page" : undefined}
            className={cn(
              "-mb-px flex h-11 shrink-0 items-center border-b text-[15px] whitespace-nowrap",
              active
                ? "border-foreground text-foreground font-medium"
                : "text-tab-inactive border-transparent"
            )}
          >
            {o.label}
          </Link>
        );
      })}
    </nav>
  );
}
```

- [ ] **Step 7: `components/segmented.tsx` → pill variant**

Replace the `nav` className with `"bg-card flex rounded-full p-1"` and the link classes with:

```tsx
            className={cn(
              "press flex h-9 flex-1 items-center justify-center rounded-full px-3 text-[13px] whitespace-nowrap",
              active ? "bg-primary text-primary-foreground font-semibold" : "text-muted-foreground font-medium"
            )}
```
Update the comment: `// A link-based pill segmented control on the card track: no client state, the URL is the state.`

- [ ] **Step 8: `components/stat-tile.tsx` → hairline cells**

```tsx
import { cn } from "@/lib/utils";

// The at-a-glance layer: N cells divided by hairlines, a divider above. No
// card, no fill — the numbers carry it.
export function StatGrid({
  children,
  cols = 4,
  className,
}: {
  children: React.ReactNode;
  cols?: 3 | 4;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "border-hairline-divider grid border-t pt-[18px] [&>*+*]:border-l [&>*+*]:border-hairline-divider [&>*+*]:pl-4",
        cols === 3 ? "grid-cols-3" : "grid-cols-4",
        className
      )}
    >
      {children}
    </div>
  );
}

export function StatTile({
  label,
  value,
  note,
  tone = "default",
  className,
}: {
  label: string;
  value: React.ReactNode;
  note?: React.ReactNode;
  tone?: "default" | "win" | "loss" | "brass";
  className?: string;
}) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1", className)}>
      <span
        className={cn(
          "stat-number truncate text-[22px] leading-none font-normal",
          tone === "win" && "text-win",
          tone === "loss" && "text-loss",
          tone === "brass" && "text-brass"
        )}
      >
        {value}
      </span>
      <span className="text-muted-foreground truncate text-[12px]">{label}</span>
      {note && <span className="text-muted-foreground truncate text-[11px]">{note}</span>}
    </div>
  );
}
```
(`StatStrip` is removed; it has no callers outside this file.)

- [ ] **Step 9: Compile and commit**

Run: `npx tsc --noEmit`
Expected: errors only from `tone="gold"` in `app/(member)/page.tsx` / `players/[id]/page.tsx` (fixed in Tasks 4/8) — if any, change those two call sites to `tone="brass"` now so the build is green.

```bash
git add components/page-header.tsx components/messages-button.tsx components/list-row.tsx components/section-heading.tsx components/section-label.tsx components/underline-tabs.tsx components/segmented.tsx components/stat-tile.tsx
git commit -m "feat(ui): PageHeader, MessagesButton, ListRow, SectionHeading, UnderlineTabs; overline labels, pill segmented, hairline stat grid"
```

---

### Task 2b: Data primitives — Avatar, AvatarStack, Sparkline, ScoreStepper, MatchRow

**Files:**
- Modify: `components/avatar.tsx`, `components/sparkline.tsx`, `components/score-stepper.tsx`, `components/match-row.tsx`
- Create: `components/avatar-stack.tsx`

**Interfaces (produces):**
- `Avatar({ person, size?: "xs"|"sm"|"md"|"lg"|"xl"|"2xl", ring?: string|null, selected?: boolean, className? })`. Sizes: xs 30px, sm 38px, md 40px, lg 48px, xl 64px, 2xl 128px. Default ring 1px `--hairline-strong`; `ring` = double ring in that color (1px inner, 5px gap, 1px outer); `selected` = `0 0 0 2px bg, 0 0 0 3px brass`.
- `AvatarStack({ people: AvatarIdentity[], max?: number, caption?: string })`.
- `Sparkline({ ratings, width?, height?, className?, id? })` — same signature; renders stroke only.
- `ScoreStepper({ label, value, onChange })` — **`accent` prop removed**.
- `MatchRow({ winner, loser, winnerScore, loserScore, delta, viewerId?, perspectiveId?, meta?, gameType?, caption? })` — when `perspectiveId` is one of the two players the row is opponent-centric ("Won 5–3" / "Lost 3–5"); otherwise winner-centric ("Kevin Moss def. Ray Johnson"). `delta` is the **winner's** gain as today; the row flips its sign for a loss from the perspective player. `caption` is an extra muted line under the delta (used by the levels plan for XP).

- [ ] **Step 1: `components/avatar.tsx`**

```tsx
/* eslint-disable @next/next/no-img-element */
import { ballFor, ballStyle } from "@/lib/identity";
import { cn } from "@/lib/utils";

const SIZES = {
  xs: "size-[30px] text-[10px]",
  sm: "size-[38px] text-[12px]",
  md: "size-10 text-[13px]",
  lg: "size-12 text-sm",
  xl: "size-16 text-xl",
  "2xl": "size-32 text-[40px]",
} as const;

export interface AvatarIdentity {
  id: string;
  display_name: string | null | undefined;
  avatar_url?: string | null;
  ball?: number | null;
}

// A member's face in the app: their photo when they've added one, otherwise
// their ball. Every avatar carries a 1px hairline ring so photos sit on the
// dark ground; `ring` draws a double ring in a colour (podium, profile photo);
// `selected` is the brass pick ring.
export function Avatar({
  person,
  size = "md",
  ring,
  selected = false,
  className,
}: {
  person: AvatarIdentity;
  size?: keyof typeof SIZES;
  ring?: string | null;
  selected?: boolean;
  className?: string;
}) {
  const initial = (person.display_name ?? "?").trim()[0]?.toUpperCase() ?? "?";
  const gap = size === "2xl" ? 6 : 4;
  const boxShadow = selected
    ? "0 0 0 2px var(--background), 0 0 0 3px var(--brass)"
    : ring
      ? `0 0 0 1px ${ring}, 0 0 0 ${gap + 1}px var(--background), 0 0 0 ${gap + 2}px ${ring}`
      : "0 0 0 1px var(--hairline-strong)";
  const base = cn("shrink-0 rounded-full", SIZES[size], className);
  if (person.avatar_url) {
    return (
      <img
        src={person.avatar_url}
        alt=""
        width={128}
        height={128}
        loading="lazy"
        style={{ boxShadow }}
        className={cn(base, "object-cover")}
      />
    );
  }
  const ball = ballFor(person.ball, person.id);
  return (
    <span
      aria-hidden="true"
      style={{ ...ballStyle(ball), boxShadow }}
      className={cn(base, "flex items-center justify-center font-semibold")}
    >
      {initial}
    </span>
  );
}
```

- [ ] **Step 2: `components/avatar-stack.tsx`**

```tsx
import { Avatar, type AvatarIdentity } from "@/components/avatar";

// Overlapping 30px avatars with a caption ("You + 14 going"). Each sits in a
// 2px card-coloured gap so the stack reads inside a card.
export function AvatarStack({
  people,
  max = 4,
  caption,
}: {
  people: AvatarIdentity[];
  max?: number;
  caption?: string;
}) {
  const shown = people.slice(0, max);
  return (
    <div className="flex items-center">
      <div className="flex">
        {shown.map((p, i) => (
          <Avatar
            key={p.id}
            person={p}
            size="xs"
            className={i > 0 ? "-ml-2" : undefined}
            // The card gap is a second shadow layer; the component's own ring stays underneath.
            // eslint-disable-next-line react/no-unknown-property
          />
        ))}
      </div>
      {caption && <span className="text-muted-foreground ml-[18px] text-[13px]">{caption}</span>}
    </div>
  );
}
```
Then add to `Avatar`: a `className` carrying `ring-card ring-2` is enough for the stack gap — so in `AvatarStack` pass `className={cn("ring-card ring-2", i > 0 && "-ml-2")}` (import `cn`) and remove the stray eslint comment.

- [ ] **Step 3: `components/sparkline.tsx`**

```tsx
import { sparklinePath, sparklinePoints } from "@/lib/stats";
import { cn } from "@/lib/utils";

// The rating line: oldest → newest, a 1.6px brass stroke with an end dot over
// a hairline baseline. Drawn once on load (the single page-load motion in the
// app; static under prefers-reduced-motion). Pure SVG rendered on the server.
export function Sparkline({
  ratings,
  width = 342,
  height = 56,
  className,
}: {
  ratings: number[];
  width?: number;
  height?: number;
  className?: string;
}) {
  const points = sparklinePoints(ratings, width - 6, height - 12).map(
    ([x, y]) => [x + 3, y + 4] as [number, number]
  );
  if (points.length === 0) return null;
  const d = sparklinePath(points);
  const last = points[points.length - 1];
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      height={height}
      preserveAspectRatio="none"
      role="img"
      aria-label={`Rating over your last ${ratings.length} rated matches`}
      className={cn("text-brass block overflow-visible", className)}
    >
      <line x1={0} y1={height - 0.5} x2={width} y2={height - 0.5} stroke="var(--hairline-divider)" />
      <path
        d={d}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
        pathLength={1}
        className="sparkline-draw"
      />
      <circle cx={last[0]} cy={last[1]} r={3} fill="currentColor" className="sparkline-dot" />
    </svg>
  );
}
```
(`preserveAspectRatio="none"` + `vectorEffect="non-scaling-stroke"` lets the line fill any width without fattening the stroke; the dot stretches imperceptibly at 3px.)

- [ ] **Step 4: `components/score-stepper.tsx`**

```tsx
"use client";

import { stepScore } from "@/lib/report-form";

// The at-the-table score control: a 72px numeral, a ghost − and a solid +
// at 44px. Used by match reporting and tournament result entry.
export function ScoreStepper({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (next: number) => void;
}) {
  return (
    <div className="flex min-w-0 flex-1 flex-col items-center gap-3.5">
      <span className="text-muted-foreground max-w-full truncate text-[13px]">{label}</span>
      <span className="hero-number">{value}</span>
      <div className="flex gap-2.5">
        <button
          type="button"
          aria-label={`Decrease ${label} score`}
          onClick={() => onChange(stepScore(value, -1))}
          className="press flex size-11 items-center justify-center rounded-full text-xl font-light shadow-[inset_0_0_0_1px_var(--hairline-ghost)]"
        >
          −
        </button>
        <button
          type="button"
          aria-label={`Increase ${label} score`}
          onClick={() => onChange(stepScore(value, 1))}
          className="press bg-primary text-primary-foreground flex size-11 items-center justify-center rounded-full text-xl"
        >
          +
        </button>
      </div>
    </div>
  );
}
```
Then in `app/(member)/tournaments/[id]/result-form.tsx` remove `accent` from the first `ScoreStepper` and change the two steppers' wrapper to `<div className="grid grid-cols-[minmax(0,1fr)_1px_minmax(0,1fr)] items-center"><ScoreStepper … /><span className="bg-hairline-divider h-[120px] w-px" aria-hidden="true" /><ScoreStepper … /></div>`. (The report form is rewritten in Task 6.)

- [ ] **Step 5: `components/match-row.tsx`**

```tsx
import Link from "next/link";
import { Avatar } from "@/components/avatar";
import { cn } from "@/lib/utils";

export interface MatchRowPlayer {
  id: string;
  display_name: string;
  avatar_url?: string | null;
  ball?: number | null;
}

// One confirmed match as a hairline row.
//   perspective given (Home "Recent" for your games, Profile history):
//     [opponent avatar]  Opponent name          Won 5–3
//                        school · game · date      +16
//   no perspective (league-wide feed):
//     [winner][loser]    Winner name            5–3
//                        def. Loser · game         +16
// Win/loss by weight, not colour: the result reads primary for a win and muted
// for a loss. `delta` is the winner's gain; a loss shows it negated.
export function MatchRow({
  winner,
  loser,
  winnerScore,
  loserScore,
  delta,
  viewerId,
  perspectiveId,
  meta,
  gameType,
  caption,
}: {
  winner: MatchRowPlayer | null | undefined;
  loser: MatchRowPlayer | null | undefined;
  winnerScore: number;
  loserScore: number;
  delta: number | null;
  viewerId?: string;
  perspectiveId?: string;
  meta?: string;
  gameType?: string;
  caption?: React.ReactNode;
}) {
  const sub = [gameType, meta].filter(Boolean).join(" · ");
  const won = perspectiveId !== undefined && winner?.id === perspectiveId;
  const lost = perspectiveId !== undefined && loser?.id === perspectiveId;

  if (won || lost) {
    const opponent = won ? loser : winner;
    const signed = delta === null ? null : won ? `+${delta}` : `−${delta}`;
    return (
      <div className="border-hairline-row flex min-h-[68px] items-center gap-3.5 border-b py-3.5">
        <Avatar person={opponent ?? { id: "unknown", display_name: null }} size="md" />
        <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
          <span className="truncate text-[15px] font-medium leading-tight">
            <PlayerName player={opponent} me={opponent?.id === viewerId} />
          </span>
          {sub && <span className="text-muted-foreground truncate text-[12px] leading-tight">{sub}</span>}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-[3px] text-right">
          <span className={cn("stat-number text-[15px] leading-tight", lost && "text-muted-foreground")}>
            {won ? "Won" : "Lost"} {won ? winnerScore : loserScore}–{won ? loserScore : winnerScore}
          </span>
          {signed && <span className="text-muted-foreground stat-number text-[12px] leading-tight">{signed}</span>}
          {caption && <span className="text-muted-foreground text-[11px] leading-tight">{caption}</span>}
        </div>
      </div>
    );
  }

  return (
    <div className="border-hairline-row flex min-h-[68px] items-center gap-3.5 border-b py-3.5">
      <div className="flex shrink-0">
        <Avatar person={winner ?? { id: "unknown", display_name: null }} size="md" className="ring-background relative z-10 ring-2" />
        <Avatar
          person={loser ?? { id: "unknown", display_name: null }}
          size="md"
          className="ring-background -ml-3 ring-2 opacity-60"
        />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
        <span className="truncate text-[15px] font-medium leading-tight">
          <PlayerName player={winner} me={winner?.id === viewerId} />
        </span>
        <span className="text-muted-foreground truncate text-[12px] leading-tight">
          def. <PlayerName player={loser} me={loser?.id === viewerId} />
          {sub && ` · ${sub}`}
        </span>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-[3px] text-right">
        <span className="stat-number text-[15px] leading-tight">
          {winnerScore}–{loserScore}
        </span>
        {delta !== null && <span className="text-muted-foreground stat-number text-[12px] leading-tight">+{delta}</span>}
        {caption && <span className="text-muted-foreground text-[11px] leading-tight">{caption}</span>}
      </div>
    </div>
  );
}

function PlayerName({ player, me }: { player: MatchRowPlayer | null | undefined; me: boolean }) {
  const label = me ? "You" : (player?.display_name ?? "Member");
  if (!player) return <span>{label}</span>;
  return (
    <Link href={`/players/${player.id}`} className="underline-offset-2 hover:underline">
      {label}
    </Link>
  );
}
```

- [ ] **Step 6: Compile and commit**

Run: `npx tsc --noEmit`
Expected: errors only at `report-form.tsx` (`accent`) and `size="xl"`/`ring` call sites that still type-check fine — if `report-form.tsx` errors on `accent`, delete the `accent` attribute there now (the form is rewritten in Task 6).

```bash
git add components/avatar.tsx components/avatar-stack.tsx components/sparkline.tsx components/score-stepper.tsx components/match-row.tsx "app/(member)/tournaments/[id]/result-form.tsx" "app/(member)/matches/new/report-form.tsx"
git commit -m "feat(ui): avatars with hairline/double/selected rings and 128px size, avatar stack, stroke-only brass sparkline, 72px score stepper, perspective-aware hairline match row"
```

---

### Task 3: Shell — tab bar, member layout, loading skeleton, HeroBand retirement

**Files:**
- Modify: `components/tab-bar.tsx`, `app/(member)/layout.tsx`, `app/(member)/loading.tsx`
- Delete: `components/hero-band.tsx`; delete `hero-gradient` / `hero-grain` utilities from `app/globals.css`
- Modify (mechanical `HeroBand` → `PageHeader`): `app/(member)/admin/page.tsx`, `events/new/page.tsx`, `events/[id]/edit/page.tsx`, `events/[id]/page.tsx`, `tournaments/page.tsx`, `tournaments/new/page.tsx`, `tournaments/[id]/page.tsx`, `tournaments/[id]/setup/page.tsx`, `schools/page.tsx`, `settings/page.tsx`, `matches/new/page.tsx`, `chat/page.tsx`, `leaderboard/page.tsx`, `players/[id]/page.tsx`, `page.tsx` (the last five get a temporary header; they are rebuilt in Tasks 4–9)
- Modify: every file using `shadow-[var(--shadow-card)]`, `shadow-[var(--shadow-raised)]`, `variant="hero"`, `text-white/…`, `bg-white/…`, `text-gold`/`bg-gold`, `stat-number text-primary`.

**Interfaces:**
- Consumes `PageHeader`, `MessagesButton` (Task 2a).
- Produces `TabBar({ profileHref }: { profileHref: string })`.

- [ ] **Step 1: `components/tab-bar.tsx`**

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, CalendarDays, Home, Plus, User } from "lucide-react";
import { cn } from "@/lib/utils";

// Home · Ranks · ＋ · Events · Profile. The ＋ sits in the bar (not floating);
// Cups lives under Events; Profile is the viewer's own player page. Hidden on
// Log a game, whose sticky footer takes the bar's place.
export function TabBar({ profileHref }: { profileHref: string }) {
  const pathname = usePathname();
  if (pathname.startsWith("/matches/new")) return null;

  const tabs = [
    { href: "/", label: "Home", icon: Home, match: (p: string) => p === "/" },
    { href: "/leaderboard", label: "Ranks", icon: BarChart3, match: (p: string) => p.startsWith("/leaderboard") || p.startsWith("/schools") },
    { href: "/matches/new", label: "Log a game", icon: Plus, raised: true, match: () => false },
    { href: "/events", label: "Events", icon: CalendarDays, match: (p: string) => p.startsWith("/events") || p.startsWith("/tournaments") },
    { href: profileHref, label: "Profile", icon: User, match: (p: string) => p === profileHref || p.startsWith("/settings") },
  ];

  return (
    <nav aria-label="Main" className="bg-background border-hairline fixed inset-x-0 bottom-0 z-10 border-t">
      <div className="mx-auto flex max-w-3xl items-start justify-around px-2.5 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
        {tabs.map(({ href, label, icon: Icon, raised, match }) => {
          if (raised) {
            return (
              <Link
                key={href}
                href={href}
                aria-label={label}
                className="press bg-primary text-primary-foreground -mt-1.5 flex size-[50px] items-center justify-center rounded-full"
              >
                <Icon className="size-[22px]" strokeWidth={2} />
              </Link>
            );
          }
          const active = match(pathname);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "press flex min-h-11 w-[60px] flex-col items-center gap-[5px] text-[10px] font-medium tracking-[0.04em]",
                active ? "text-foreground" : "text-tab-inactive"
              )}
            >
              <Icon className="size-[22px]" strokeWidth={1.6} />
              <span>{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
```

- [ ] **Step 2: `app/(member)/layout.tsx`**

```tsx
import { redirect } from "next/navigation";
import { TabBar } from "@/components/tab-bar";
import { createClient } from "@/lib/supabase/server";

// The member shell is the auth gate plus the tab bar. Each screen renders
// its own header (PageHeader / MessagesButton), so there is no shared one.
export default async function MemberLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, status")
    .eq("id", user.id)
    .single();
  if (!profile || profile.status !== "approved") redirect("/pending");

  return (
    // w-full matters: body is a flex column, and a flex child with mx-auto
    // shrink-wraps its content instead of stretching.
    <div className="mx-auto w-full max-w-3xl px-6 pb-32">
      {children}
      <TabBar profileHref={`/players/${profile.id}`} />
    </div>
  );
}
```

- [ ] **Step 3: `app/(member)/loading.tsx`**

```tsx
// Skeleton while a member page loads: a header line, a hero number, a stat
// row and three hairline rows — the shapes every screen shares.
export default function MemberLoading() {
  return (
    <main aria-busy="true" aria-label="Loading" className="flex flex-col gap-7 pt-3">
      <div className="flex items-end justify-between">
        <div className="flex flex-col gap-2">
          <div className="bg-card h-3 w-24 animate-pulse rounded" />
          <div className="bg-card h-8 w-40 animate-pulse rounded" />
        </div>
        <div className="bg-card size-11 animate-pulse rounded-full" />
      </div>
      <div className="bg-card h-16 w-32 animate-pulse rounded" />
      <div className="border-hairline-divider grid grid-cols-3 gap-4 border-t pt-4">
        {[0, 1, 2].map((i) => (
          <div key={i} className="bg-card h-10 animate-pulse rounded" />
        ))}
      </div>
      <div className="flex flex-col">
        {[0, 1, 2].map((i) => (
          <div key={i} className="border-hairline-row flex items-center gap-3.5 border-b py-3.5">
            <div className="bg-card size-10 animate-pulse rounded-full" />
            <div className="flex flex-1 flex-col gap-2">
              <div className="bg-card h-3.5 w-1/2 animate-pulse rounded" />
              <div className="bg-card h-3 w-1/3 animate-pulse rounded" />
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
```

- [ ] **Step 4: Retire `HeroBand` on the non-redesigned pages**

For each file below replace the `import { HeroBand } …` with `import { PageHeader } from "@/components/page-header";`, swap the band, and change the following `<div className="-mt-3 flex flex-col gap-4">` / `mt-4` wrapper to `<div className="mt-6 flex flex-col gap-6">`:

| File | Replacement |
|---|---|
| `admin/page.tsx` | `<PageHeader title="Admin" back="/settings" trailing={null} />` |
| `events/new/page.tsx` | `<PageHeader title={from ? "Duplicate event" : "New event"} back="/events" trailing={null} />` |
| `events/[id]/edit/page.tsx` | `<PageHeader title="Edit event" back={`/events/${id}`} trailing={null} />` (use the page's event id variable) |
| `tournaments/new/page.tsx` | `<PageHeader title="New tournament" back="/events?tab=cups" trailing={null} />` |
| `tournaments/[id]/setup/page.tsx` | `<PageHeader title={tournament.name} back="/events?tab=cups" trailing={<Badge variant="secondary">Setting up</Badge>} />` — keep the existing badge content, just move it from `title` to `trailing` |
| `tournaments/[id]/page.tsx` | same shape; `Live` badge becomes `<Badge className="bg-brass text-background">Live</Badge>`, Complete stays `secondary` |
| `schools/page.tsx` | `<PageHeader title="School standings" back="/leaderboard?tab=schools" trailing={null} />` |
| `settings/page.tsx` | `<PageHeader title="Settings" back={`/players/${user.id}`} trailing={null} />` (full Settings pass in Task 8) |
| `events/[id]/page.tsx` | `<PageHeader title={event.title} back="/events" trailing={event.status === "cancelled" ? <Badge variant="destructive">Cancelled</Badge> : null}>` with the former band children (when/location line, source chip, admin links) moved inside as `children`, restyled: `text-white/70` → `text-muted-foreground`, `text-white/80` → `text-muted-foreground`, `bg-white/15` → `bg-secondary`, links keep `underline` |
| `tournaments/page.tsx` | `<PageHeader title="Tournaments" back="/events?tab=cups" trailing={null}>` with the admin "New tournament" button (now `variant="default" size="sm"`) as children; replace the per-row markup with `ListRow` (title = name, trailing = badge, `href` only when clickable) |
| `matches/new/page.tsx`, `chat/page.tsx`, `leaderboard/page.tsx`, `players/[id]/page.tsx`, `page.tsx` | temporary `<PageHeader title="…" />` keeping the same title text so they compile; rebuilt in their own tasks |

Then delete `components/hero-band.tsx` and the `hero-gradient` / `hero-grain` utilities in `globals.css`. In `app/(member)/chat/[id]/chat-room.tsx` change the header `className` to `"bg-background border-hairline-divider flex items-center gap-2 border-b px-2 pt-[calc(0.5rem+env(safe-area-inset-top))] pb-2"`, the back link hover to `hover:bg-accent`, `text-white/70` → `text-muted-foreground`, the reconnecting span to `text-brass`, the title to `font-semibold`, and the send button to `"bg-primary text-primary-foreground flex size-11 shrink-0 items-center justify-center rounded-full transition-opacity disabled:opacity-40"`.

- [ ] **Step 5: Sweep the retired classes**

Run the greps and fix every hit:

```bash
grep -rn "shadow-\[var(--shadow-card)\]\|shadow-\[var(--shadow-raised)\]\|variant=\"hero\"\|surface-dark\|brass-deep\|text-white\|bg-white\|text-gold\|bg-gold\|hero-gradient\|font-display" app components --include=*.tsx --include=*.css
```

Rules: `shadow-[var(--shadow-card)]` → `shadow-[inset_0_0_0_1px_var(--hairline-row)]`; `shadow-[var(--shadow-raised)]` → delete; `variant="hero"` → delete the attribute; `text-white/NN` → `text-muted-foreground`; `bg-white/15` → `bg-secondary`; `bg-black/40` (dialog overlays) stays; `text-gold`/`bg-gold text-gold-foreground` → `text-brass` / `bg-brass text-background` except the Champion achievement (Task 8). The `install-guide.tsx` step bullets `bg-primary text-primary-foreground stat-number` are fine on the new primary.

Expected after the sweep: the grep prints nothing except `globals.css` token lines.

- [ ] **Step 6: Verify**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add -A app components
git commit -m "feat(shell): Home · Ranks · + · Events · Profile tab bar, per-screen headers, HeroBand retired, dark loading skeleton; tokens swept across every member page"
```

---

### Task 4: Home

**Files:**
- Modify: `lib/stats.ts` (+ `seasonLabel`, `overallRank`), `tests/stats.test.ts`
- Modify: `app/(member)/page.tsx`
- Modify: `e2e/chat.spec.ts`, `e2e/events-flow.spec.ts`, `e2e/membership.spec.ts`, `e2e/password-reset.spec.ts`, `e2e/profile.spec.ts`, `e2e/signup-flow.spec.ts` (`/league feed/i` → `/recent/i`)

**Interfaces:**
- Produces `seasonLabel(clubDate: string): string` — `"Fall 2026"` for Aug–Dec, `"Spring 2026"` for Jan–May, `"Summer 2026"` for Jun–Jul.
- Produces `overallRank(board: { id: string }[], id: string): number | null` — 1-based index in the (already rating-ordered) leaderboard, `null` if absent.

- [ ] **Step 1: Failing tests** — append to `tests/stats.test.ts`:

```ts
import { overallRank, seasonLabel } from "@/lib/stats";

describe("seasonLabel", () => {
  it("names the club season from a club calendar date", () => {
    expect(seasonLabel("2026-10-06")).toBe("Fall 2026");
    expect(seasonLabel("2026-08-01")).toBe("Fall 2026");
    expect(seasonLabel("2027-01-15")).toBe("Spring 2027");
    expect(seasonLabel("2027-05-31")).toBe("Spring 2027");
    expect(seasonLabel("2027-06-10")).toBe("Summer 2027");
  });
});

describe("overallRank", () => {
  const board = [{ id: "a" }, { id: "b" }, { id: "c" }];
  it("is the 1-based position in the ordered board", () => {
    expect(overallRank(board, "b")).toBe(2);
  });
  it("is null for a member with no row (no confirmed matches yet)", () => {
    expect(overallRank(board, "zed")).toBeNull();
    expect(overallRank([], "a")).toBeNull();
  });
});
```
(merge the import into the existing `@/lib/stats` import.)

- [ ] **Step 2: Run to see them fail**

Run: `npx vitest run tests/stats.test.ts`
Expected: FAIL — `seasonLabel` is not exported.

- [ ] **Step 3: Implement** in `lib/stats.ts`:

```ts
// "Fall 2026" / "Spring 2027" / "Summer 2027" from a club calendar date
// (YYYY-MM-DD from lib/events clubDateOf). Semesters, not quarters.
export function seasonLabel(clubDate: string): string {
  const [year, month] = clubDate.split("-").map(Number);
  const name = month >= 8 ? "Fall" : month <= 5 ? "Spring" : "Summer";
  return `${name} ${year}`;
}

// 1-based position in a rating-ordered board; null when the member has no row.
export function overallRank(board: { id: string }[], id: string): number | null {
  const i = board.findIndex((r) => r.id === id);
  return i === -1 ? null : i + 1;
}
```

- [ ] **Step 4: Tests pass**

Run: `npx vitest run tests/stats.test.ts`
Expected: PASS.

- [ ] **Step 5: Rewrite `app/(member)/page.tsx`**

Keep every query as-is except: profile select adds `id, avatar_url, ball`; the `scheduledEvents` select becomes `"id, title, location, starts_at, ends_at, rsvps(profile_id, response, profile:profiles(id, display_name, avatar_url, ball))"`; the `recent` query stays (league-wide, 15). Drop `formStrip`, `currentStreak`, `groupByPlayedDate`, `Trophy`, `Badge`, `Card*`, `SectionLabel`, `StatGrid` imports no longer used; add `Avatar`, `AvatarStack`, `ListRow`, `SectionHeading`, `MessagesButton`, `StatGrid`, `StatTile`, `MatchRow`, `Sparkline`, `labelPlayedDate`, `overallRank`, `seasonLabel`, `clubDateOf`.

Derived values:

```ts
  const today = clubDateOf(nowIso);
  const rank = overallRank(board ?? [], user.id);
  const greeting = greetingFor(now, me?.display_name ?? "").split(",")[0]; // "Good evening"
  const first = (me?.display_name ?? "").trim().split(/\s+/)[0] || "there";
```

JSX (structure; keep the existing confirm/reject forms and message/error strips):

```tsx
    <main className="flex flex-col gap-9 pt-3">
      <header className="flex items-center justify-between gap-3">
        <Link href={`/players/${user.id}`} aria-label="Your profile" className="press flex items-center gap-3">
          <Avatar person={{ id: user.id, display_name: me?.display_name, avatar_url: me?.avatar_url, ball: me?.ball }} size="lg" />
          <span className="flex flex-col gap-px">
            <span className="text-muted-foreground text-[12px]">{greeting}</span>
            <span className="text-[16px] font-medium">{first}</span>
          </span>
        </Link>
        <MessagesButton />
      </header>

      {message && <p className="bg-card rounded-2xl p-3 text-sm">{message}</p>}
      {error && <p className="bg-destructive/10 text-destructive rounded-2xl p-3 text-sm">{error}</p>}

      <section className="flex flex-col gap-[18px]">
        <span className="overline">Rating · {seasonLabel(today)}</span>
        <div className="flex items-end justify-between gap-4">
          <span className="hero-number">{rating}</span>
          {change !== null && (
            <span className={cn("stat-number pb-1.5 text-[13px]", change >= 0 ? "text-win" : "text-loss")}>
              {change >= 0 ? "+" : "−"}{Math.abs(change)} this month
            </span>
          )}
        </div>
        <Sparkline ratings={ratings} />
        <StatGrid cols={3}>
          <StatTile label="Overall rank" value={rank ? `#${rank}` : "–"} />
          <StatTile label="Win rate" value={rate === null ? "–" : `${rate}%`} />
          <StatTile label="Record" value={`${wins}–${losses}`} note={provisional ? "provisional" : undefined} />
        </StatGrid>
      </section>

      {(toConfirm ?? []).length > 0 && (
        <section className="flex flex-col gap-1.5">
          <SectionHeading>Confirm results</SectionHeading>
          {(toConfirm ?? []).map((m) => { /* reporter, theyWon as today */ return (
            <ListRow key={m.id}
              leading={<Avatar person={reporter ?? { id: "unknown", display_name: null }} size="md" />}
              title={<>{reporter?.display_name} · {theyWon ? "beat you" : "lost to you"} <span className="stat-number">{m.reporter_score}–{m.opponent_score}</span></>}
              meta={GAME_LABEL[m.game_type] ?? m.game_type}
              trailing={
                <span className="flex items-center gap-4 text-[13px]">
                  <form action={rejectMatch}><input type="hidden" name="match_id" value={m.id} /><button type="submit" className="text-muted-foreground">Reject</button></form>
                  <form action={confirmMatch}><input type="hidden" name="match_id" value={m.id} /><button type="submit" className="text-brass font-medium">Confirm</button></form>
                </span>
              }
            />
          ); })}
        </section>
      )}

      {(awaiting ?? []).length > 0 && (
        <section className="flex flex-col gap-1.5">
          <SectionHeading>Waiting on</SectionHeading>
          {(awaiting ?? []).map((m) => (
            <ListRow key={m.id} title={opponent?.display_name ?? "Member"} meta="Hasn't confirmed your report yet" />
          ))}
        </section>
      )}

      {nextEvent && (
        <section className="flex flex-col gap-3.5">
          <SectionHeading action={{ href: "/events", label: "Calendar" }}>Next match</SectionHeading>
          <Link href={`/events/${nextEvent.id}`} className="press bg-card flex flex-col gap-[18px] rounded-[20px] p-5 shadow-[inset_0_0_0_1px_var(--hairline-row)]">
            <div className="flex flex-col gap-1.5">
              <span className="text-brass text-[12px] tracking-[0.06em] uppercase">{formatEventWhen(nextEvent.starts_at, nextEvent.ends_at)}</span>
              <span className="text-[18px] font-medium">{nextEvent.title}</span>
              {nextEvent.location && <span className="text-muted-foreground text-[13px]">{nextEvent.location}</span>}
            </div>
            <div className="flex items-center justify-between gap-3">
              <AvatarStack people={going} caption={goingCaption} />
              <span className={cn("text-[12px] font-medium", myResponse === "going" ? "text-win" : "text-brass")}>
                {myResponse === "going" ? "Attending" : myResponse === "maybe" ? "Maybe" : "RSVP"}
              </span>
            </div>
          </Link>
        </section>
      )}

      <section className="flex flex-col gap-1.5">
        <SectionHeading action={{ href: `/players/${user.id}`, label: "All games" }}>Recent</SectionHeading>
        {(recent ?? []).length === 0 && (
          <p className="text-muted-foreground py-6 text-center text-sm">No results yet this season. <Link href="/matches/new" className="text-brass">Log the first game.</Link></p>
        )}
        {(recent ?? []).map((m) => { /* reporter/opponent/reporterWon as today */ return (
          <MatchRow key={m.id} winner={…} loser={…} winnerScore={…} loserScore={…} delta={winnerDelta(m)}
            viewerId={user.id} perspectiveId={user.id}
            gameType={GAME_LABEL[m.game_type] ?? m.game_type}
            meta={labelPlayedDate(m.played_at, today)} />
        ); })}
      </section>
    </main>
```

where, for the next event:

```ts
  const nextRsvps = (nextEvent?.rsvps ?? []) as { profile_id: string; response: RsvpResponse; profile: AvatarIdentity | AvatarIdentity[] | null }[];
  const myResponse = nextEvent ? tallyRsvps(nextRsvps, user.id).mine : null;
  const going = nextRsvps.filter((r) => r.response === "going").map((r) => (Array.isArray(r.profile) ? r.profile[0] : r.profile)).filter((p): p is AvatarIdentity => !!p);
  const others = going.filter((p) => p.id !== user.id).length;
  const goingCaption = myResponse === "going" ? (others > 0 ? `You + ${others} going` : "You're going") : `${going.length} going`;
```

(`perspectiveId={user.id}` makes your own games read "Won/Lost"; league games you weren't in fall back to the winner-centric row automatically.)

- [ ] **Step 6: Update the E2E sentinel**

In the six spec files replace `getByRole("heading", { name: /league feed/i })` with `getByRole("heading", { name: /^recent$/i })`.

- [ ] **Step 7: Verify**

Run: `npx tsc --noEmit && npm run lint && npx vitest run --exclude "tests/*.integration.test.ts"`
Expected: pass. Then `npm run dev` and open `/` on a 390px viewport: header, 72px rating, full-width line, 3-cell grid, next match card, Recent rows.

- [ ] **Step 8: Commit**

```bash
git add lib/stats.ts tests/stats.test.ts "app/(member)/page.tsx" e2e
git commit -m "feat(home): Elevated Dark home — greeting header, rating block with brass sparkline and 3-cell grid, next-match card with attendee stack, hairline confirm/waiting rows, perspective match rows"
```

---

### Task 5: Ranks (Players · Schools)

**Files:**
- Modify: `app/(member)/leaderboard/page.tsx`

**Interfaces:**
- Consumes `UnderlineTabs`, `Segmented`, `Avatar` (`ring`), `ListRow`, `PageHeader`, `movementSince`, `seasonLabel`.
- URL: `/leaderboard?tab=players|schools&scope=all|school`.

- [ ] **Step 1: Queries**

Add to the `Promise.all`: `supabase.from("school_stats").select("id, name, short_name, member_count, avg_rating, wins, losses")` and `supabase.from("schools").select("id, short_name, primary_color")`. Read `tab` from `searchParams` (`"schools"` or default `"players"`). Keep `me` select as `schools(short_name)`.

- [ ] **Step 2: Page structure**

```tsx
    <main className="flex flex-col gap-7">
      <PageHeader overline={`${seasonLabel(today)}`} title="Leaderboard" />
      <UnderlineTabs ariaLabel="Leaderboard type" value={tab} options={[
        { value: "players", label: "Players", href: `/leaderboard${scope === "school" ? "?scope=school" : ""}` },
        { value: "schools", label: "Schools", href: "/leaderboard?tab=schools" },
      ]} />
      {tab === "players" ? <Players … /> : <Schools … />}
    </main>
```

Players block, in order:

1. Scope control (only when the member has a school): `<div className="flex justify-end"><Segmented ariaLabel="Leaderboard scope" value={scope} options={[{ value: "all", label: "League", href: "/leaderboard" }, { value: "school", label: mySchool, href: "/leaderboard?scope=school" }]} /></div>` wrapped so it is `w-fit` (add `className` passthrough to `Segmented` if needed: `<nav className={cn("bg-card flex rounded-full p-1", className)}>`).
2. Empty state (`visible.length === 0`): the existing copy in a `text-muted-foreground py-10 text-center text-sm` paragraph with a brass "Log one." link.
3. Podium: `grid grid-cols-3 items-end gap-3`, order #2 · #1 · #3:

```tsx
  <Link href={`/players/${r.id}`} className="press flex flex-col items-center gap-2.5 text-center">
    <Avatar person={r} size={rank === 1 ? "2xl-podium" : "xl"} ring={`var(--podium-${rank})`} />
    <span className={cn("text-[13px] font-semibold tracking-[0.06em]", `text-podium-${rank}`)}>#{rank}</span>
    <span className="flex max-w-full flex-col items-center gap-0.5">
      <span className="w-full truncate text-[14px] font-medium">{r.display_name}{r.matches_played < 10 && <span className="text-muted-foreground"> *</span>}</span>
      <span className="text-muted-foreground stat-number text-[12px]">{r.rating}</span>
      <Movement value={moves[r.id]} />
    </span>
  </Link>
```
   For the 80px #1 avatar add a `podium` size to `Avatar` SIZES: `podium: "size-20 text-2xl"` and use `size={rank === 1 ? "podium" : "xl"}` (xl = 64px). Tailwind cannot build `text-podium-${rank}` dynamically — use a lookup `const PODIUM_TEXT = ["text-podium-1", "text-podium-2", "text-podium-3"]`.
4. Rows 4+: `<ol>` of `ListRow`s with `href`, `leading={<><span className="text-muted-foreground stat-number w-[22px] text-[13px]">{i + 4}</span><Avatar person={r} size="sm" /></>}`, `title` = name (+ provisional `*`), `meta` = `<span className="flex items-center gap-1.5"><SchoolDot color={r.school_color} />{r.school_short_name} · <Movement value={moves[r.id]} /></span>`, `trailing={<><span className="stat-number text-[15px]">{r.rating}</span><span className="text-muted-foreground text-[12px]">{r.wins}–{r.losses}</span></>}`. Your row: `className="bg-card -mx-3 rounded-[14px] border-b-transparent px-3"`.
5. Footnote `* provisional (fewer than 10 matches)` in muted 12px.

`Movement` restyle: up → `text-win`, down → `text-loss`, flat → muted; text `▲ 12 this week` → `+12 this wk` / `−9 this wk` / `– this wk` in 12px stat-number.

`SchoolDot`: `function SchoolDot({ color, size = 6 }: { color: string | null; size?: number }) { return <span aria-hidden="true" className="inline-block shrink-0 rounded-full" style={{ width: size, height: size, backgroundColor: color ?? "var(--muted-foreground)" }} />; }` — put it in `components/school-dot.tsx` (Profile and Chat use it too).

Schools block: rows ordered by `avg_rating` desc (as the view returns), `maxAvg = rows[0]?.avg_rating || 1`:

```tsx
  <ol className="flex flex-col">
    {schools.map((s, i) => (
      <li key={s.id} className="border-hairline-row flex gap-4 border-b py-5">
        <span className={cn("stat-number w-[34px] shrink-0 text-[22px] leading-[1.1]", i === 0 ? "text-brass" : "text-muted-foreground")}>{i + 1}</span>
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="flex items-baseline justify-between gap-3">
            <span className="flex min-w-0 items-center gap-2 text-[16px] font-medium"><SchoolDot color={colorOf[s.id]} size={8} /><span className="truncate">{s.name}</span></span>
            <span className="stat-number shrink-0 text-[15px]">{s.avg_rating}</span>
          </div>
          <div className="bg-hairline-divider h-0.5"><div className={cn("h-full", s.short_name === mySchool ? "bg-brass" : "bg-foreground/35")} style={{ width: `${Math.round((s.avg_rating / maxAvg) * 100)}%` }} /></div>
          <span className="text-muted-foreground text-[12px]">{s.member_count} players · {s.wins}–{s.losses}</span>
        </div>
      </li>
    ))}
  </ol>
  <p className="text-muted-foreground text-[12px]">Ranked by average rating. <Link href="/schools" className="text-brass">School vs school</Link></p>
```
(The mock's "points" has no data behind it; average rating is the school stat the app already defines and the view already orders by.)

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit && npm run lint`, then in the browser: `/leaderboard`, `/leaderboard?scope=school`, `/leaderboard?tab=schools`. Confirm your row never appears twice and the podium hides when fewer than 1 player.

- [ ] **Step 4: Commit**

```bash
git add "app/(member)/leaderboard/page.tsx" components/school-dot.tsx components/avatar.tsx components/segmented.tsx
git commit -m "feat(ranks): underline Players/Schools tabs, ringed podium, hairline rows with your-row card, school standings with rating bars"
```

---

### Task 6: Log a game

**Files:**
- Modify: `lib/report-form.ts`, `tests/report-form.test.ts`
- Modify: `app/(member)/matches/new/page.tsx`, `app/(member)/matches/new/report-form.tsx`

**Interfaces:**
- `submitState(you, them, opponentFirstName)` returns `{ label, disabled, reason }` with `label` = `"Send to {name} to confirm"` when valid, `"Send to confirm"` while disabled.
- New `resultLine(you, them): { text: string; tone: "win" | "loss" | "muted" }` — `"Win 5–3"` / `"Loss 3–5"` / `"Enter the score"` (both 0) / `"Scores can't be equal"`.
- `recentOpponents(ids, all, n = 4)` default changes from 3 to 4.

- [ ] **Step 1: Failing tests** — in `tests/report-form.test.ts` change the `submitState` expectations and add `resultLine`:

```ts
import { recentOpponents, resultLine, stepScore, submitState } from "@/lib/report-form";

describe("submitState", () => {
  it("sends a valid result to the opponent to confirm", () => {
    expect(submitState(5, 3, "Priya")).toEqual({ label: "Send to Priya to confirm", disabled: false, reason: null });
    expect(submitState(3, 5, "Priya").disabled).toBe(false);
  });
  it("blocks ties, 0-0, and missing opponent", () => {
    expect(submitState(4, 4, "Priya")).toMatchObject({ label: "Send to confirm", disabled: true, reason: "Scores can't be equal" });
    expect(submitState(0, 0, "Priya")).toMatchObject({ disabled: true, reason: "Enter the score" });
    expect(submitState(5, 3, null)).toMatchObject({ disabled: true, reason: "Pick your opponent" });
  });
});

describe("resultLine", () => {
  it("narrates the result from your side", () => {
    expect(resultLine(5, 3)).toEqual({ text: "Win 5–3", tone: "win" });
    expect(resultLine(3, 5)).toEqual({ text: "Loss 3–5", tone: "loss" });
  });
  it("prompts while the score is incomplete", () => {
    expect(resultLine(0, 0)).toEqual({ text: "Enter the score", tone: "muted" });
    expect(resultLine(4, 4)).toEqual({ text: "Scores can't be equal", tone: "muted" });
  });
});
```
and change the `recentOpponents` default-n tests: `["c","a","b"]` → `["c","a","b","d"]`, `["d","a","b"]` → `["d","a","b","c"]`, `["a","b","c"]` → `["a","b","c","d"]`.

- [ ] **Step 2: Run** `npx vitest run tests/report-form.test.ts` — expected FAIL.

- [ ] **Step 3: Implement** in `lib/report-form.ts`: `n = 4`; replace `submitState` body labels (`"Report match"` → `"Send to confirm"`, success label → `` `Send to ${opponentName} to confirm` ``); add:

```ts
// The line under the scores. U+2013 en dash between scores, as app-wide.
export function resultLine(you: number, them: number): { text: string; tone: "win" | "loss" | "muted" } {
  if (you === 0 && them === 0) return { text: "Enter the score", tone: "muted" };
  if (you === them) return { text: "Scores can't be equal", tone: "muted" };
  return you > them ? { text: `Win ${you}–${them}`, tone: "win" } : { text: `Loss ${you}–${them}`, tone: "loss" };
}
```

- [ ] **Step 4: Run** `npx vitest run tests/report-form.test.ts` — expected PASS.

- [ ] **Step 5: `page.tsx`** — `<main className="flex flex-col gap-8">`, header `<PageHeader title="Log a game" back="/" backLabel="Close" trailing={null} />` but with an ✕ icon: give `PageHeader` an optional `backIcon?: "chevron" | "close"` prop (`X` from lucide at `strokeWidth={1.7}`), default chevron. Error strip as on Home. Then `<ReportMatchForm … />`.

- [ ] **Step 6: Rewrite `report-form.tsx`** keeping all state, hidden inputs, the Dialog picker and the `reportMatch` action:

```tsx
    <form action={reportMatch} className="flex flex-col gap-8 pb-36">
      <section className="flex flex-col gap-3.5">
        <span className="overline">Opponent</span>
        <button type="button" onClick={() => setPickerOpen(true)}
          className="bg-card text-muted-foreground flex h-12 items-center gap-2.5 rounded-full px-4 text-left text-[15px] shadow-[inset_0_0_0_1px_var(--hairline-row)]">
          <Search className="size-[17px]" strokeWidth={1.7} />
          <span className={cn("truncate", selected && "text-foreground")}>{selected ? selected.display_name : "Search players"}</span>
        </button>
        <div className="grid grid-cols-4 gap-2">
          {chips.map((o) => (
            <button key={o.id} type="button" onClick={() => setOpponentId(o.id)} aria-pressed={o.id === opponentId}
              className={cn("press flex flex-col items-center gap-2 py-1 text-[12px] font-medium", o.id === opponentId ? "text-foreground" : "text-muted-foreground")}>
              <Avatar person={o} size="xl" selected={o.id === opponentId} />
              <span className="max-w-full truncate">{firstName(o)}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-3.5">
        <span className="overline">Game</span>
        <div className="bg-card grid grid-cols-4 gap-1 rounded-full p-1">
          {GAME_TYPES.map((g) => (
            <label key={g.value} className="text-muted-foreground has-checked:bg-primary has-checked:text-primary-foreground flex h-10 cursor-pointer items-center justify-center rounded-full text-[13px] font-medium has-checked:font-semibold">
              <input type="radio" name="game_type" value={g.value} defaultChecked={g.value === "8ball"} className="sr-only" />
              {g.label}
            </label>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-[18px]">
        <span className="overline">Score</span>
        <div className="grid grid-cols-[minmax(0,1fr)_1px_minmax(0,1fr)] items-center">
          <ScoreStepper label="You" value={you} onChange={setYou} />
          <span aria-hidden="true" className="bg-hairline-divider h-[120px] w-px" />
          <ScoreStepper label={firstName(selected) ?? "Them"} value={them} onChange={setThem} />
        </div>
        <p aria-live="polite" className={cn("stat-number text-center text-[13px]", line.tone === "win" ? "text-win" : line.tone === "loss" ? "text-loss" : "text-muted-foreground")}>{line.text}</p>
      </section>

      <section className="border-hairline-divider flex flex-col border-t">
        {editingDate ? (
          <div className="border-hairline-divider flex items-center gap-3 border-b py-3">
            <span className="flex-1 text-[15px] font-medium">When</span>
            <Input type="date" name="played_at" value={date} onChange={(e) => setDate(e.target.value)} required aria-label="Date played" className="h-10 w-auto" />
          </div>
        ) : (
          <button type="button" onClick={() => setEditingDate(true)} className="border-hairline-divider flex items-center gap-3 border-b py-4 text-left">
            <span className="flex-1 text-[15px] font-medium">When</span>
            <span className="text-muted-foreground text-[14px]">{date === today ? "Today" : date}</span>
            <ChevronRight className="text-muted-foreground size-4" strokeWidth={1.7} />
          </button>
        )}
      </section>

      {/* hidden inputs unchanged */}

      <div className="bg-background border-hairline fixed inset-x-0 bottom-0 z-10 border-t">
        <div className="mx-auto flex max-w-3xl flex-col gap-2.5 px-6 pt-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
          <SubmitButton size="xl" className="w-full" disabled={s.disabled} pendingChildren="Sending…">{s.label}</SubmitButton>
          <p className="text-muted-foreground text-center text-[12px]">{s.reason ?? `Results post once ${firstName(selected) ?? "your opponent"} confirms.`}</p>
        </div>
      </div>

      {/* Dialog picker unchanged, except: Dialog.Content gets rounded-t-[24px]; rows use Avatar size="sm"; the school Badge becomes <span className="text-muted-foreground text-[12px]">{o.school}</span> */}
    </form>
```
with `const line = resultLine(you, them);` and `let chips = recentOpponents(recentIds, opponents);` / the swap-in slice becoming `.slice(0, 4)`. Import `ChevronRight`, `Search` from lucide, `resultLine` from the lib.

- [ ] **Step 7: Verify**

Run: `npx tsc --noEmit && npm run lint && npx vitest run --exclude "tests/*.integration.test.ts"`. Browser `/matches/new`: no tab bar, footer button disabled until opponent + valid score, "Send to Kevin to confirm" once valid.

- [ ] **Step 8: Commit**

```bash
git add lib/report-form.ts tests/report-form.test.ts "app/(member)/matches/new"
git commit -m "feat(log): Log a game — close header, search field + four recent opponents, pill game segments, 72px split scores with result line, When row, sticky send-to-confirm footer"
```

---

### Task 7: Events (Upcoming · Going · My school · Past · Cups)

**Files:**
- Modify: `lib/events.ts` (+ `eventMentionsSchool`), `tests/events.test.ts`
- Modify: `app/(member)/events/page.tsx`

**Interfaces:**
- `eventMentionsSchool(event: { title: string; location: string | null; source_name: string | null }, school: { name: string; short_name: string }): boolean` — case-insensitive substring match of either name in title, location or source name.
- URL `/events?tab=upcoming|going|school|past|cups`.

- [ ] **Step 1: Failing test** — append to `tests/events.test.ts`:

```ts
import { eventMentionsSchool } from "@/lib/events";

describe("eventMentionsSchool", () => {
  const gsu = { name: "Georgia State", short_name: "GSU" };
  it("matches the school's name or short name anywhere in the event", () => {
    expect(eventMentionsSchool({ title: "League night · GSU vs GT", location: null, source_name: null }, gsu)).toBe(true);
    expect(eventMentionsSchool({ title: "Open table", location: "Georgia State Student Center", source_name: null }, gsu)).toBe(true);
    expect(eventMentionsSchool({ title: "Clinic", location: null, source_name: "Georgia State PIN" }, gsu)).toBe(true);
  });
  it("ignores other schools", () => {
    expect(eventMentionsSchool({ title: "League night · UGA vs GT", location: "Athens", source_name: null }, gsu)).toBe(false);
  });
});
```

- [ ] **Step 2: Run** `npx vitest run tests/events.test.ts` — FAIL.

- [ ] **Step 3: Implement** in `lib/events.ts`:

```ts
// "My school" filter on the calendar. Events carry no school id, so this is a
// name match across the fields a school would show up in.
export function eventMentionsSchool(
  event: { title: string; location: string | null; source_name: string | null },
  school: { name: string; short_name: string }
): boolean {
  const hay = [event.title, event.location, event.source_name].filter(Boolean).join(" ").toLowerCase();
  return hay.includes(school.name.toLowerCase()) || hay.includes(school.short_name.toLowerCase());
}
```

- [ ] **Step 4: Run** — PASS.

- [ ] **Step 5: Rewrite `app/(member)/events/page.tsx`**

Queries: `me` select `role, schools(name, short_name)`; events select adds `rsvps(profile_id, response, profile:profiles(id, display_name, avatar_url, ball))`; add `supabase.from("tournaments").select("id, name, status, created_at").order("created_at", { ascending: false })`.

Filter:

```ts
  const tab = (["upcoming", "going", "school", "past", "cups"] as const).find((t) => t === rawTab) ?? "upcoming";
  const mine = (e: EventRow) => e.rsvps.some((r) => r.profile_id === user.id && r.response === "going");
  const list =
    tab === "past" ? past
    : tab === "going" ? upcoming.filter(mine)
    : tab === "school" && school ? upcoming.filter((e) => eventMentionsSchool(e, school))
    : upcoming;
  const featured = tab === "upcoming" ? upcoming[0] ?? null : null;
  const rest = featured ? list.slice(1) : list;
  const monthLabel = new Date().toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: CLUB_TIMEZONE });
```

JSX:

```tsx
    <main className="flex flex-col gap-7">
      <PageHeader overline={monthLabel} title="Events">
        {me?.role === "admin" && <div className="flex gap-2"><Button asChild size="sm" variant="ghost"><Link href="/events/new">New event</Link></Button><Button asChild size="sm" variant="ghost"><Link href="/tournaments/new">New tournament</Link></Button></div>}
      </PageHeader>
      <UnderlineTabs ariaLabel="Event filter" value={tab} options={[
        { value: "upcoming", label: "Upcoming", href: "/events" }, { value: "going", label: "Going", href: "/events?tab=going" },
        { value: "school", label: "My school", href: "/events?tab=school" }, { value: "past", label: "Past", href: "/events?tab=past" },
        { value: "cups", label: "Cups", href: "/events?tab=cups" } ]} />
      {message/error strips}
      {tab === "cups" ? <Cups tournaments={tournaments ?? []} admin={me?.role === "admin"} /> : (
        <>
          {featured && <FeaturedEvent event={featured} viewerId={user.id} />}
          <section className="flex flex-col">
            <SectionHeading>{tab === "past" ? "Past" : "Coming up"}</SectionHeading>
            {rest.length === 0 && <p className="text-muted-foreground py-6 text-sm">{EMPTY[tab]}</p>}
            {rest.map((e) => <EventRowLink key={e.id} event={e} viewerId={user.id} />)}
          </section>
        </>
      )}
    </main>
```
`EMPTY = { upcoming: "Nothing on the calendar yet.", going: "You haven't said you're going to anything yet.", school: "Nothing from your school coming up.", past: "No past events.", cups: "" }`.

`FeaturedEvent` (card): brass overline `Next up{event.source_name ? ` · ${event.source_name}` : ""}`, date block top-right (`MON` 11px/.1em muted over day 30px/500), title 24/600/−0.02em, meta `formatEventWhen` + location (14px muted, 1.5 lh), footer: `AvatarStack people={going} caption={`${going.length} going`} />` and, as the action, a `setRsvp` form button: if the viewer is going → `<Button asChild variant="ghost" size="sm"><Link href=…>Going</Link></Button>` in `text-win`; otherwise `<form action={setRsvp}><input hidden event_id/><input hidden response="going"/><SubmitButton size="sm">I'm going</SubmitButton></form>`. The whole card header/title area is a `Link` to the event; the form sits outside the link (no nested interactive). Skip the "spots" bar: events have no capacity field.

`EventRowLink` → `ListRow` with `leading` = date column (`w-10`: DOW 11px/.1em muted, day 24px/500/−0.03em), `title` = event title (+ `Cancelled` destructive badge when cancelled), `meta` = `time · location · n going`, `trailing` = `<span className={cn("text-[12px] font-medium", going ? "text-win" : "text-brass")}>{going ? "Going" : "RSVP"}</span>` (past events: muted "Done" / "You went" if going).

`Cups`: `ListRow`s (title = name, meta = status label, `href` = `/tournaments/${id}` or `/setup` for admins, none for members on `setup`), trailing = `Live` in brass / others muted; empty line "No cups yet." — the same rules the tournaments page uses. Admin "New tournament" is already in the header.

- [ ] **Step 6: Verify**

`npx tsc --noEmit && npm run lint && npx vitest run --exclude "tests/*.integration.test.ts"`. Browser: all five tabs; `?tab=cups` lists tournaments; the E2E `events-flow` expectation `page.getByText(title)` on `/events` still holds (title appears in the featured card or a row).

- [ ] **Step 7: Commit**

```bash
git add lib/events.ts tests/events.test.ts "app/(member)/events/page.tsx"
git commit -m "feat(events): month overline, Upcoming/Going/My school/Past/Cups underline tabs, featured next-event card with RSVP, date-column hairline rows; Cups entry moves here"
```

---

### Task 8: Profile and Settings

**Files:**
- Modify: `lib/stats.ts` (+ `longestWinStreak`), `lib/achievements.ts` (import it), `tests/stats.test.ts`
- Create: `components/share-button.tsx`
- Modify: `app/(member)/players/[id]/page.tsx`, `app/(member)/settings/page.tsx`

**Interfaces:**
- `longestWinStreak(newestFirst: StatMatch[], viewerId: string): number` exported from `lib/stats`; `lib/achievements.ts` imports it instead of its private copy.
- `ShareButton({ title }: { title: string })` — client; `navigator.share` if available else clipboard; `aria-label="Share profile"`.

- [ ] **Step 1: Failing test** — append to `tests/stats.test.ts` (reuse the file's `m()` helper that builds a `StatMatch`; its signature is visible at the top of the file):

```ts
import { longestWinStreak } from "@/lib/stats";

describe("longestWinStreak", () => {
  it("is the longest run of wins anywhere in the history", () => {
    const h = [m("1", "me", "x", "x"), m("2", "me", "x", "me"), m("3", "me", "x", "me"), m("4", "me", "x", "me"), m("5", "me", "x", "x"), m("6", "me", "x", "me")];
    expect(longestWinStreak(h, "me")).toBe(3);
  });
  it("is 0 with no matches or no wins", () => {
    expect(longestWinStreak([], "me")).toBe(0);
    expect(longestWinStreak([m("1", "me", "x", "x")], "me")).toBe(0);
  });
});
```
(Adjust the `m(...)` argument order to the helper's actual `(id, reporter, opponent, winner)` shape.)

- [ ] **Step 2: Run** — FAIL. **Step 3:** move `longestWinStreak` from `lib/achievements.ts` into `lib/stats.ts` as an export (same body), import it in achievements. **Step 4: Run** — PASS.

- [ ] **Step 5: `components/share-button.tsx`**

```tsx
"use client";

import { useState } from "react";
import { Check, Share } from "lucide-react";

// Share this profile: the native sheet where it exists, the clipboard elsewhere.
export function ShareButton({ title }: { title: string }) {
  const [copied, setCopied] = useState(false);
  async function share() {
    const url = window.location.href;
    try {
      if (navigator.share) await navigator.share({ title, url });
      else {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }
    } catch {
      // Cancelled share sheet — nothing to do.
    }
  }
  return (
    <button type="button" onClick={share} aria-label="Share profile"
      className="press flex size-10 items-center justify-center rounded-full shadow-[inset_0_0_0_1px_var(--hairline-ghost)]">
      {copied ? <Check className="size-[18px]" strokeWidth={1.6} /> : <Share className="size-[18px]" strokeWidth={1.6} />}
    </button>
  );
}
```

- [ ] **Step 6: Rewrite `players/[id]/page.tsx`**

Add to `Promise.all`: `supabase.from("leaderboard").select("id")` for `overallRank`. Keep every existing computation (`h2h`, `best`, `peak`, `change`, `achievements`, `titles`, `ratings`). Add `const bestStreak = longestWinStreak(all, id);` and `const rank = overallRank(board ?? [], id);`.

```tsx
    <main className="flex flex-col gap-8">
      <PageHeader title="" trailing={<MessagesButton />} className="sr-only-title" … />
```
Simpler: render the header inline (the profile has no title in the header):

```tsx
      <header className="flex items-center justify-between pt-3">
        {isMe ? (
          <Link href="/settings" aria-label="Settings" className="press flex size-11 items-center justify-center rounded-full shadow-[inset_0_0_0_1px_var(--hairline-strong)]"><SlidersHorizontal className="size-5" strokeWidth={1.6} /></Link>
        ) : (
          <Link href="/leaderboard" aria-label="Back" className="press flex size-11 items-center justify-center rounded-full shadow-[inset_0_0_0_1px_var(--hairline-strong)]"><ChevronLeft className="size-5" strokeWidth={1.7} /></Link>
        )}
        <MessagesButton />
      </header>

      <section className="-mt-4 flex flex-col items-center gap-[18px]">
        <div className="relative size-32">
          <Avatar person={profile} size="2xl" ring="var(--brass)" />
          {isMe && (
            <Link href="/settings" aria-label={profile.avatar_url ? "Change profile photo" : "Add a profile photo"}
              className="bg-primary text-primary-foreground ring-background absolute right-0.5 bottom-0.5 flex size-[38px] items-center justify-center rounded-full ring-4">
              <Camera className="size-[18px]" strokeWidth={1.8} />
            </Link>
          )}
        </div>
        <div className="flex flex-col items-center gap-1.5 text-center">
          <h1 className="text-[28px] leading-[1.1] font-semibold tracking-[-0.025em]">{profile.display_name}</h1>
          <span className="text-muted-foreground flex items-center gap-2 text-[13px]">
            <SchoolDot color={school?.primary_color ?? null} />{school?.name}
            {profile.favorite_game && <><span className="bg-muted-foreground/60 size-[3px] rounded-full" />Plays {GAME_LABEL[profile.favorite_game] ?? profile.favorite_game}</>}
          </span>
          {profile.tagline && <p className="text-[14px]">{profile.tagline}</p>}
        </div>
        <div className="flex gap-2.5">
          {isMe ? (
            <><Button asChild variant="ghost"><Link href="/settings">Edit profile</Link></Button><ShareButton title={`${profile.display_name} · SECBL`} /></>
          ) : user ? (
            <><form action={startDm}><input type="hidden" name="profile_id" value={profile.id} /><SubmitButton pendingChildren="Opening…">Message</SubmitButton></form><ShareButton title={`${profile.display_name} · SECBL`} /></>
          ) : null}
        </div>
      </section>

      <StatGrid cols={4} className="border-hairline-divider border-b pb-[18px] [&>*]:items-center [&>*]:text-center">
        <StatTile label="Rating" value={profile.rating} note={change !== null ? `${change >= 0 ? "+" : "−"}${Math.abs(change)} this month` : undefined} />
        <StatTile label="Rank" value={rank ? `#${rank}` : "–"} />
        <StatTile label="Record" value={`${wins}–${losses}`} />
        <StatTile label="Best streak" value={bestStreak || "–"} />
      </StatGrid>

      <Sparkline ratings={ratings} height={44} />

      {h2h && (
        <ListRow title={`You vs ${profile.display_name.split(" ")[0]}`}
          meta={h2h.wins + h2h.losses === 0 ? "You haven't played each other yet." : lastMeeting ? `Last played ${labelPlayedDate(lastMeeting.played_at, today).toLowerCase()}` : undefined}
          trailing={<span className="stat-number text-[20px]"><span className="text-win">{h2h.wins}</span><span className="text-muted-foreground mx-1">–</span><span className="text-loss">{h2h.losses}</span></span>} />
      )}

      <section className="flex flex-col gap-3">
        {/* Level line lands here once the levels spec ships. */}
        <SectionHeading>Achievements</SectionHeading>
        {achievements.length > 0 && (
          <ul className="flex flex-wrap gap-2">
            {achievements.map((a) => (
              <li key={a.id} title={a.description}
                className={cn("flex items-center gap-1.5 rounded-full py-1 pr-3 pl-2 text-[12px] font-medium shadow-[inset_0_0_0_1px_var(--hairline-ghost)]", a.id === "champion" && "bg-gold text-gold-foreground shadow-none")}>
                <span aria-hidden="true">{a.emoji}</span>{a.label}
              </li>
            ))}
          </ul>
        )}
        <p className="text-muted-foreground text-[12px]">
          {achievements.length} of {ACHIEVEMENTS.length} earned
          {achievements.length < ACHIEVEMENTS.length && ` · next: ${ACHIEVEMENTS.find((a) => !achievements.some((e) => e.id === a.id))?.label}`}
          {achievements.length === 0 && (isMe ? " · win a confirmed match to earn your first." : "")}
        </p>
      </section>

      {best && <ListRow title="Best win" meta={<>over <Link href={`/players/${best.opponentId}`} className="text-foreground">{namesById[best.opponentId]}</Link></>} trailing={<span className="text-muted-foreground stat-number text-[13px]">rated {best.rating}</span>} />}

      <section className="flex flex-col gap-1.5">
        <SectionHeading>Match history</SectionHeading>
        {all.length === 0 && <p className="text-muted-foreground py-4 text-sm">No confirmed matches yet.</p>}
        {all.slice(0, 20).map((m) => (
          <MatchRow key={m.id} winner={…} loser={…} winnerScore={…} loserScore={…} delta={winnerDelta(m)}
            viewerId={viewerId} perspectiveId={id} meta={labelPlayedDate(m.played_at, today)} gameType={GAME_LABEL[m.game_type] ?? m.game_type} />
        ))}
      </section>
    </main>
```
(`Peak` moves out of the grid; `peak` stays computed because achievements need it. E2E still finds the `h1` with the name, the tagline, "Plays 9-ball", and the "Achievements" heading.)

- [ ] **Step 7: Settings**

In `settings/page.tsx`: select `role` too; after the header add, for admins, a `ListRow href="/admin" title="Admin" meta="Approvals, event sources, tournaments" trailing={pending > 0 ? <span className="bg-brass text-background stat-number rounded-full px-2 py-0.5 text-[11px]">{pending}</span> : <ChevronRight className="text-muted-foreground size-4" />}` where `pending` is the `status = pending` count query that used to live in the layout. Keep the "Your look", "Your name", "Account", "On your phone" cards (they inherit tokens) and the Log out button (`variant="ghost" className="text-destructive w-full"`).

- [ ] **Step 8: Verify** — `npx tsc --noEmit && npm run lint && npx vitest run --exclude "tests/*.integration.test.ts"`; browser: own profile (settings icon, camera, Edit/Share), another member's (back, Message, vs-you row).

- [ ] **Step 9: Commit**

```bash
git add lib/stats.ts lib/achievements.ts tests/stats.test.ts components/share-button.tsx "app/(member)/players/[id]/page.tsx" "app/(member)/settings/page.tsx"
git commit -m "feat(profile): 128px ringed photo, name + school dot, Edit/Share or Message, 4-cell stat grid, hairline vs-you and best-win rows, achievements strip, perspective match history; Settings gains the Admin entry"
```

---

### Task 9: Messages

**Files:**
- Modify: `lib/chat.ts` (+ `filterInbox`, `InboxTab`), `tests/chat.test.ts`
- Create: `app/(member)/chat/inbox-list.tsx` (client)
- Modify: `app/(member)/chat/page.tsx`, `app/(member)/chat/new-message-sheet.tsx`
- Modify: `e2e/chat.spec.ts`

**Interfaces:**
- `type InboxTab = "all" | "direct" | "schools"`; `filterInbox(rows: InboxRow[], tab: InboxTab, query: string): InboxRow[]` — tab filters by type (`direct` = dm; `schools` = everyone + school), query matches the row title (DM → `other_name`, else `name`) case-insensitively; empty query keeps all.
- `InboxList({ rows: InboxItem[] })` where `InboxItem = InboxRow & { title: string; subtitle: string; preview: string | null; stamp: string | null; color: string | null }` is prepared on the server.

- [ ] **Step 1: Failing tests** — append to `tests/chat.test.ts` (reuse its `row()` helper):

```ts
import { filterInbox } from "@/lib/chat";

describe("filterInbox", () => {
  const rows = [
    row({ id: "e", type: "everyone", name: "Everyone" }),
    row({ id: "s", type: "school", name: "GSU" }),
    row({ id: "d", type: "dm", name: "", other_name: "Kevin Moss" }),
  ];
  it("splits direct from rooms", () => {
    expect(filterInbox(rows, "direct", "").map((r) => r.id)).toEqual(["d"]);
    expect(filterInbox(rows, "schools", "").map((r) => r.id)).toEqual(["e", "s"]);
    expect(filterInbox(rows, "all", "").map((r) => r.id)).toEqual(["e", "s", "d"]);
  });
  it("searches the visible title, case-insensitively", () => {
    expect(filterInbox(rows, "all", "kev").map((r) => r.id)).toEqual(["d"]);
    expect(filterInbox(rows, "all", "gsu").map((r) => r.id)).toEqual(["s"]);
    expect(filterInbox(rows, "all", "zzz")).toEqual([]);
  });
});
```

- [ ] **Step 2: Run** `npx vitest run tests/chat.test.ts` — FAIL. **Step 3:** implement:

```ts
export type InboxTab = "all" | "direct" | "schools";

export function inboxTitle(row: InboxRow): string {
  return row.type === "dm" ? (row.other_name ?? "Member") : row.name;
}

// Underline tabs + search on the inbox. "Schools" is every room (the league
// room and the school rooms); "Direct" is DMs.
export function filterInbox(rows: InboxRow[], tab: InboxTab, query: string): InboxRow[] {
  const q = query.trim().toLowerCase();
  return rows.filter((r) => {
    if (tab === "direct" && r.type !== "dm") return false;
    if (tab === "schools" && r.type === "dm") return false;
    return q === "" || inboxTitle(r).toLowerCase().includes(q);
  });
}
```
**Step 4: Run** — PASS.

- [ ] **Step 5: `inbox-list.tsx`**

```tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { Search, Users } from "lucide-react";
import { Avatar } from "@/components/avatar";
import { SchoolDot } from "@/components/school-dot";
import { filterInbox, type InboxRow, type InboxTab } from "@/lib/chat";
import { cn } from "@/lib/utils";

export type InboxItem = InboxRow & { title: string; subtitle: string; preview: string | null; stamp: string | null; color: string | null };

const TABS: { value: InboxTab; label: string }[] = [
  { value: "all", label: "All" }, { value: "direct", label: "Direct" }, { value: "schools", label: "Schools" },
];

// Search + tabs are client state (no URL): the inbox is one screen and the
// filter should not survive a back navigation.
export function InboxList({ rows }: { rows: InboxItem[] }) {
  const [tab, setTab] = useState<InboxTab>("all");
  const [query, setQuery] = useState("");
  const visible = filterInbox(rows, tab, query) as InboxItem[];
  return (
    <div className="flex flex-col gap-6">
      <label className="bg-card text-muted-foreground flex h-12 items-center gap-2.5 rounded-full px-4 shadow-[inset_0_0_0_1px_var(--hairline-row)]">
        <Search className="size-[17px]" strokeWidth={1.7} />
        <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search messages" placeholder="Search people and groups"
          className="text-foreground placeholder:text-muted-foreground min-w-0 flex-1 bg-transparent text-[15px] outline-none" />
      </label>
      <div role="tablist" aria-label="Chat filter" className="border-hairline-divider flex gap-6 border-b">
        {TABS.map((t) => (
          <button key={t.value} role="tab" type="button" aria-selected={tab === t.value} onClick={() => setTab(t.value)}
            className={cn("-mb-px h-11 border-b text-[15px]", tab === t.value ? "border-foreground text-foreground font-medium" : "text-tab-inactive border-transparent")}>
            {t.label}
          </button>
        ))}
      </div>
      <ul className="-mt-2 flex flex-col">
        {visible.length === 0 && <li className="text-muted-foreground py-6 text-sm">{rows.length === 0 ? "No rooms yet — an admin needs to approve your account first." : "Nothing matches."}</li>}
        {visible.map((row) => {
          const unread = Number(row.unread);
          return (
            <li key={row.id}>
              <Link href={`/chat/${row.id}`} className="press border-hairline-row flex items-center gap-3.5 border-b py-3.5">
                <RoomAvatar row={row} />
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="flex items-baseline justify-between gap-2.5">
                    <span className={cn("truncate text-[15px]", unread > 0 ? "font-semibold" : "font-medium")}>{row.title}</span>
                    {row.stamp && <span className={cn("shrink-0 text-[12px]", unread > 0 ? "text-brass" : "text-muted-foreground")}>{row.stamp}</span>}
                  </span>
                  <span className="flex items-center justify-between gap-2.5">
                    <span className={cn("truncate text-[13px]", unread > 0 ? "text-foreground/85" : "text-muted-foreground")}>{row.preview ?? row.subtitle}</span>
                    {unread > 0 && <span className="bg-brass text-background stat-number flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold">{unread > 99 ? "99+" : unread}</span>}
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function RoomAvatar({ row }: { row: InboxItem }) {
  if (row.type === "dm") {
    return <Avatar person={{ id: row.other_id ?? row.id, display_name: row.other_name, avatar_url: row.other_avatar_url, ball: row.other_ball }} size="lg" />;
  }
  return (
    <span className="bg-secondary relative flex size-12 shrink-0 items-center justify-center rounded-[14px] text-[13px] font-medium shadow-[0_0_0_1px_var(--hairline-strong)]">
      {row.type === "everyone" ? <Users className="size-5" strokeWidth={1.6} /> : row.name.slice(0, 3).toUpperCase()}
      {row.type === "school" && <span className="ring-background absolute -right-0.5 -bottom-0.5 rounded-full ring-[3px]"><SchoolDot color={row.color} size={12} /></span>}
    </span>
  );
}
```

- [ ] **Step 6: `chat/page.tsx`**

Keep the queries; add `supabase.from("schools").select("id, primary_color")`. Build `items: InboxItem[]` from `sortInbox(rows)` using the existing `stamp()`/`previewOf()`/subtitle logic and `color = colorById[row.school_id ?? ""] ?? null`. Render:

```tsx
    <main className="flex flex-col gap-6">
      <PageHeader title="Messages" back="/" trailing={<NewMessageSheet people={people} />} />
      {error && ERRORS[error] && <p className="bg-destructive/10 text-destructive rounded-2xl p-3 text-sm">{ERRORS[error]}</p>}
      <InboxList rows={items} />
      <p className="text-muted-foreground text-[12px]">Messages are plain text and visible to everyone in the room. DMs are private to the two of you.</p>
    </main>
```
`NewMessageSheet`'s trigger becomes `<Button size="icon" aria-label="New message"><PenSquare className="size-[18px]" strokeWidth={1.8} /></Button>`; its rows use `Avatar size="sm"` with `person={{ id: p.id, display_name: p.display_name }}` and the school as muted text instead of a Badge.

- [ ] **Step 7: E2E** — in `e2e/chat.spec.ts`: `/chat, 1 unread/i` → `/messages, 1 unread/i` (both occurrences), `/chat, \d+ unread/i` → `/messages, \d+ unread/i` (both), `getByRole("heading", { name: "Chat" })` → `getByRole("heading", { name: "Messages" })`.

- [ ] **Step 8: Verify** — `npx tsc --noEmit && npm run lint && npx vitest run --exclude "tests/*.integration.test.ts"`; browser `/chat`: search filters live, tabs switch, unread rows bold with brass time and count pill.

- [ ] **Step 9: Commit**

```bash
git add lib/chat.ts tests/chat.test.ts "app/(member)/chat" e2e/chat.spec.ts
git commit -m "feat(messages): back/title/new header, search field, All/Direct/Schools tabs, round-vs-square room avatars with school dot, brass unread state"
```

---

### Task 10: Done-when sweep

**Files:** whatever the greps and suites point at.

- [ ] **Step 1: Hardcoded colors**

Run: `grep -rn "#[0-9a-fA-F]\{6\}" app components`
Expected hits only in `app/globals.css`, `app/icon.svg`, `app/layout.tsx` (`themeColor: "#0E0F11"`), `app/manifest.ts` (`#0E0F11`). Fix anything else.

- [ ] **Step 2: Retired names**

Run: `grep -rn "HeroBand\|hero-gradient\|StatStrip\|surface-dark\|brass-deep\|font-display\|variant=\"hero\"\|text-gold\|bg-gold" app components lib e2e tests`
Expected: only the Champion chip in `players/[id]/page.tsx` (`bg-gold text-gold-foreground`).

- [ ] **Step 3: Nav check**

In the browser: tab bar reads Home · Ranks · ＋ · Events · Profile; ＋ opens `/matches/new` with no tab bar; Events → Cups lists tournaments; Profile opens your own `/players/[id]`; Settings via the sliders icon; Admin via Settings (admin only, badge when signups pending); the message icon sits top-right of Home, Ranks, Events, Profile.

- [ ] **Step 4: Contrast spot-check**

Confirm (by eye against the token comment) muted text, tab labels and brass links on `#0E0F11`; nothing below `--muted-foreground` is used as text.

- [ ] **Step 5: Suites**

```bash
npm run lint
npx tsc --noEmit
npx vitest run --exclude "tests/*.integration.test.ts"
npx playwright test --workers=1
npm run build
```
Expected: all green. Playwright needs `.env.local` and the dev server (the config starts it). If a spec fails on a selector, fix the selector to the new copy — never loosen it to a tag-only match.

- [ ] **Step 6: Docs and commit**

Update `README.md` "Where things are" row for `app/(member)` to `home, log a game, events (+ cups), leaderboard, players, chat, settings, admin`; mark the spec `**Status:** Implemented 2026-10-06 (plan: docs/superpowers/plans/2026-10-06-elevated-dark-redesign.md)`. Also commit the previously uncommitted spec/design files.

```bash
git add -A
git commit -m "docs: Elevated Dark redesign spec, Option E reference screens, plan; README route list"
```
