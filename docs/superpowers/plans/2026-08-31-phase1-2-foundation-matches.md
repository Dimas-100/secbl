# SECBL Phases 1–2 (Foundation + Matches/Ratings/Leaderboards) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the SECBL app foundation — signup with school selection, admin approval, auth gating — plus the full match loop: report → opponent confirm → Fargo-style rating update → player/school leaderboards, deployed to Vercel as a PWA.

**Architecture:** Next.js App Router (server components + server actions) on Vercel, Supabase for Postgres/auth/RLS. Clients read directly from Supabase under RLS; all rating writes go through a `SECURITY DEFINER` Postgres function callable only by the service role, with deltas computed by a pure, unit-tested TypeScript rating engine.

**Tech Stack:** Next.js (App Router, TypeScript), Tailwind v4 + shadcn/ui, Supabase (`@supabase/supabase-js`, `@supabase/ssr`), Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-08-31-secbl-design.md`

## Global Constraints

- TypeScript strict; App Router; server components by default; all mutations via server actions.
- Every UI color comes from the theme tokens in `app/globals.css` (shadcn CSS variables). Never hardcode brand colors — branding arrives later as a token swap.
- Mobile-first: content column `max-w-3xl`, fixed bottom nav.
- Rating constants (exact, from spec §5): start **450**, floor **100**, expected score `1 / (1 + 2^((Rb−Ra)/100))`, **K=64** for a player's first **10** confirmed matches, **K=32** after.
- `SUPABASE_SERVICE_ROLE_KEY` is server-only. Never prefix it `NEXT_PUBLIC_`, never import `createServiceClient` into a client component.
- RLS enabled on every table. Clients never update ratings, match status, or profile status except where a policy explicitly allows (admin profile updates).
- Windows dev machine: commands below run in PowerShell or Git Bash; all are plain `npm`/`npx`/`git` so they work in both.
- Commit at the end of every task (conventional commits: `feat:`, `test:`, `chore:`).

---

### Task 1: Scaffold Next.js + shadcn/ui + Vitest

**Files:**
- Create: entire Next.js scaffold in repo root (`package.json`, `app/`, etc.)
- Create: `vitest.config.ts`
- Modify: `app/globals.css` (marker comment), `package.json` (test script)

**Interfaces:**
- Consumes: nothing (repo contains only `docs/` and `.git`).
- Produces: working `npm run dev` / `npm run build` / `npm test`; shadcn components importable from `@/components/ui/*` (button, card, input, label, badge, table); path alias `@/*`.

- [ ] **Step 1: Scaffold (move `docs/` aside so create-next-app accepts the directory)**

```powershell
Move-Item docs ..\SECBL-docs-tmp
npx create-next-app@latest . --typescript --tailwind --eslint --app --no-src-dir --import-alias "@/*" --use-npm --yes
Move-Item ..\SECBL-docs-tmp docs
```

(Git Bash equivalent: `mv docs ../SECBL-docs-tmp && npx create-next-app@latest . --typescript --tailwind --eslint --app --no-src-dir --import-alias "@/*" --use-npm --yes && mv ../SECBL-docs-tmp docs`)

- [ ] **Step 2: Verify the scaffold builds**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 3: Init shadcn/ui and add the components we use**

```powershell
npx shadcn@latest init -y -b neutral
npx shadcn@latest add button card input label badge table -y
```

- [ ] **Step 4: Mark the theme-token block for the future branding pass**

In `app/globals.css`, directly above the `:root {` block shadcn generated, add:

```css
/*
 * THEME TOKENS — single source of truth for SECBL branding.
 * When club branding arrives, swap the values below (and the logo in app/icon.svg).
 * No component may hardcode a brand color.
 */
```

- [ ] **Step 5: Install runtime + test deps**

```powershell
npm i @supabase/supabase-js @supabase/ssr
npm i -D vitest dotenv
```

- [ ] **Step 6: Create `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";
import { loadEnv } from "vite";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    // Load .env/.env.local so integration tests can reach Supabase.
    env: loadEnv("", process.cwd(), ""),
  },
});
```

- [ ] **Step 7: Add test script**

In `package.json` scripts, add: `"test": "vitest run"`.

Run: `npm test`
Expected: passes with "no test files found" (exit 0 or the no-tests notice — either is fine at this point; if vitest exits non-zero on no tests, add `--passWithNoTests` to the script).

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "chore: scaffold Next.js app with shadcn/ui and Vitest"
```

---

### Task 2: Provision Supabase + foundation schema (schools, profiles, RLS)

**Files:**
- Create: `supabase/migrations/0001_foundation.sql`
- Create: `.env.local` (NOT committed), `.env.example`

**Interfaces:**
- Consumes: nothing.
- Produces: a live Supabase project; tables `schools`, `profiles`; helper functions `public.is_approved()`, `public.is_admin()`; signup trigger `handle_new_user`; seeded schools UGA/GSU/FSU; env vars `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.

- [ ] **Step 1: Provision the Supabase project via the Supabase MCP tools**

Load the tools: `ToolSearch` with query `"select:mcp__claude_ai_Supabase__list_projects,mcp__claude_ai_Supabase__list_organizations,mcp__claude_ai_Supabase__get_cost,mcp__claude_ai_Supabase__confirm_cost,mcp__claude_ai_Supabase__create_project,mcp__claude_ai_Supabase__get_project,mcp__claude_ai_Supabase__get_project_url,mcp__claude_ai_Supabase__get_publishable_keys,mcp__claude_ai_Supabase__apply_migration"`.

Then: `list_projects` — if a project named `secbl` already exists, use it. Otherwise `list_organizations` → `get_cost` (type `project`) → `confirm_cost` → `create_project` with name `secbl` (free tier). Poll `get_project` until status is `ACTIVE_HEALTHY`.

- [ ] **Step 2: Write env files**

Get values via `get_project_url` and `get_publishable_keys`. The **service role key is not exposed by MCP** — ask the user to paste it from Supabase Dashboard → Project Settings → API keys (this is an allowed blocking question: missing credential).

`.env.example` (committed):

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

`.env.local` (gitignored — verify `.gitignore` covers `.env*`): same keys with real values.

- [ ] **Step 3: Ask the user to disable email confirmation**

Supabase Dashboard → Authentication → Sign In / Up → Email → turn **off** "Confirm email". (Club app; keeps signup one-step. The signup code still handles the confirmation-on case gracefully.)

- [ ] **Step 4: Create `supabase/migrations/0001_foundation.sql`**

```sql
-- Schools
create table public.schools (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  short_name text not null unique,
  primary_color text not null default '#1f2937',
  secondary_color text not null default '#6b7280'
);

-- Profiles
create type public.member_role as enum ('member','admin');
create type public.member_status as enum ('pending','approved','rejected');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  school_id uuid not null references public.schools(id),
  avatar_url text,
  role public.member_role not null default 'member',
  status public.member_status not null default 'pending',
  rating int not null default 450,
  matches_played int not null default 0,
  created_at timestamptz not null default now()
);

-- Auto-create a profile row on signup from the auth metadata.
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, school_id)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'display_name', 'Player'),
    (new.raw_user_meta_data->>'school_id')::uuid
  );
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- RLS helpers (SECURITY DEFINER so policies on profiles don't recurse).
create or replace function public.is_approved()
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from profiles where id = auth.uid() and status = 'approved'
  );
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and status = 'approved' and role = 'admin'
  );
$$;

-- RLS
alter table public.schools enable row level security;
alter table public.profiles enable row level security;

-- Schools are public info (the signup page lists them pre-auth).
create policy "schools readable by everyone"
  on public.schools for select to anon, authenticated using (true);

create policy "read own profile"
  on public.profiles for select to authenticated
  using (id = auth.uid());

create policy "approved read approved profiles"
  on public.profiles for select to authenticated
  using (public.is_approved() and status = 'approved');

create policy "admins read all profiles"
  on public.profiles for select to authenticated
  using (public.is_admin());

create policy "admins update profiles"
  on public.profiles for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Seed schools
insert into public.schools (name, short_name) values
  ('University of Georgia', 'UGA'),
  ('Georgia State University', 'GSU'),
  ('Florida State University', 'FSU');
```

- [ ] **Step 5: Apply the migration**

Use `mcp__claude_ai_Supabase__apply_migration` with name `foundation` and the SQL above (keep the local file as the source of truth).

- [ ] **Step 6: Verify**

Use `mcp__claude_ai_Supabase__execute_sql`: `select short_name from public.schools order by short_name;`
Expected: FSU, GSU, UGA.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/0001_foundation.sql .env.example
git commit -m "feat: supabase foundation schema (schools, profiles, RLS, signup trigger)"
```

---

### Task 3: Auth & gating (Supabase helpers, middleware, signup/login/pending, member layout)

**Files:**
- Create: `lib/supabase/server.ts`, `lib/types.ts`, `middleware.ts`
- Create: `app/(public)/login/page.tsx`, `app/(public)/login/actions.ts`
- Create: `app/(public)/signup/page.tsx`, `app/(public)/signup/actions.ts`
- Create: `app/pending/page.tsx`
- Create: `app/(member)/layout.tsx`, `app/(member)/page.tsx` (placeholder home)
- Delete: `app/page.tsx` (scaffold default — replaced by `app/(member)/page.tsx`)

**Interfaces:**
- Consumes: Task 2's tables/policies and env vars.
- Produces: `createClient(): Promise<SupabaseClient>` and `createServiceClient(): SupabaseClient` from `@/lib/supabase/server`; `login`, `logout` from `@/app/(public)/login/actions`; row types `School`, `Profile`, `Match` + enums from `@/lib/types`; a member layout that guarantees every page under `app/(member)/` has an authenticated, approved user.

- [ ] **Step 1: Create `lib/types.ts`**

```ts
export type MemberRole = "member" | "admin";
export type MemberStatus = "pending" | "approved" | "rejected";
export type GameType = "8ball" | "9ball" | "10ball" | "other";
export type MatchStatus = "pending" | "confirmed" | "rejected" | "disputed";

export interface School {
  id: string;
  name: string;
  short_name: string;
  primary_color: string;
  secondary_color: string;
}

export interface Profile {
  id: string;
  display_name: string;
  school_id: string;
  avatar_url: string | null;
  role: MemberRole;
  status: MemberStatus;
  rating: number;
  matches_played: number;
  created_at: string;
}

export interface Match {
  id: string;
  reporter_id: string;
  opponent_id: string;
  winner_id: string;
  reporter_score: number;
  opponent_score: number;
  game_type: GameType;
  status: MatchStatus;
  tournament_match_id: string | null;
  played_at: string;
  confirmed_at: string | null;
  rating_delta_reporter: number | null;
  rating_delta_opponent: number | null;
  created_at: string;
}
```

- [ ] **Step 2: Create `lib/supabase/server.ts`**

```ts
import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Called from a Server Component — middleware refreshes sessions.
          }
        },
      },
    }
  );
}

// Bypasses RLS. Server-only: never import from a client component.
export function createServiceClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}
```

- [ ] **Step 3: Create `middleware.ts` (repo root)**

```ts
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );
  await supabase.auth.getUser(); // keep the session fresh
  return supabaseResponse;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|manifest.webmanifest).*)"],
};
```

- [ ] **Step 4: Create `app/(public)/login/actions.ts`**

```ts
"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function login(formData: FormData) {
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: String(formData.get("email")),
    password: String(formData.get("password")),
  });
  if (error) redirect(`/login?error=${encodeURIComponent(error.message)}`);
  redirect("/");
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
```

- [ ] **Step 5: Create `app/(public)/login/page.tsx`**

```tsx
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { login } from "./actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string }>;
}) {
  const { error, message } = await searchParams;
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-4">
      <h1 className="text-2xl font-bold">SECBL</h1>
      {message && <p className="rounded-md bg-muted p-3 text-sm">{message}</p>}
      {error && (
        <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</p>
      )}
      <form action={login} className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" required />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="password">Password</Label>
          <Input id="password" name="password" type="password" required />
        </div>
        <Button type="submit">Log in</Button>
      </form>
      <p className="text-sm text-muted-foreground">
        New here?{" "}
        <Link className="underline" href="/signup">
          Create an account
        </Link>
      </p>
    </main>
  );
}
```

- [ ] **Step 6: Create `app/(public)/signup/actions.ts`**

```ts
"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function signup(formData: FormData) {
  const displayName = String(formData.get("display_name") ?? "").trim();
  const schoolId = String(formData.get("school_id") ?? "");
  if (!displayName || !schoolId) {
    redirect(`/signup?error=${encodeURIComponent("Name and school are required")}`);
  }
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: String(formData.get("email")),
    password: String(formData.get("password")),
    options: { data: { display_name: displayName, school_id: schoolId } },
  });
  if (error) redirect(`/signup?error=${encodeURIComponent(error.message)}`);
  // With email confirmation disabled we get a session and can go straight
  // to the pending screen; otherwise the user confirms by email first.
  if (data.session) redirect("/pending");
  redirect(`/login?message=${encodeURIComponent("Check your email to confirm, then log in.")}`);
}
```

- [ ] **Step 7: Create `app/(public)/signup/page.tsx`** (native `<select>` on purpose — simpler to style and to drive in E2E tests)

```tsx
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/server";
import { signup } from "./actions";

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const supabase = await createClient();
  const { data: schools } = await supabase
    .from("schools")
    .select("id, name")
    .order("name");

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-4">
      <h1 className="text-2xl font-bold">Join SECBL</h1>
      {error && (
        <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</p>
      )}
      <form action={signup} className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="display_name">Display name</Label>
          <Input id="display_name" name="display_name" required maxLength={40} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="school_id">School</Label>
          <select
            id="school_id"
            name="school_id"
            required
            defaultValue=""
            className="border-input bg-transparent h-9 rounded-md border px-3 text-sm shadow-xs"
          >
            <option value="" disabled>
              Choose your school
            </option>
            {(schools ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" required />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="password">Password</Label>
          <Input id="password" name="password" type="password" required minLength={8} />
        </div>
        <Button type="submit">Create account</Button>
      </form>
      <p className="text-sm text-muted-foreground">
        Already a member?{" "}
        <Link className="underline" href="/login">
          Log in
        </Link>
      </p>
    </main>
  );
}
```

- [ ] **Step 8: Create `app/pending/page.tsx`**

```tsx
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { logout } from "@/app/(public)/login/actions";

export default async function PendingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase
    .from("profiles")
    .select("status")
    .eq("id", user.id)
    .single();
  if (profile?.status === "approved") redirect("/");

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 px-4 text-center">
      <h1 className="text-2xl font-bold">Almost in</h1>
      <p className="text-muted-foreground">
        {profile?.status === "rejected"
          ? "Your signup was not approved. Talk to a club admin if you think this is a mistake."
          : "Your account is waiting for admin approval. Check back soon."}
      </p>
      <form action={logout}>
        <button className="text-sm underline">Log out</button>
      </form>
    </main>
  );
}
```

- [ ] **Step 9: Create `app/(member)/layout.tsx`** and delete `app/page.tsx`

```tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { logout } from "@/app/(public)/login/actions";

export default async function MemberLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, role, status")
    .eq("id", user.id)
    .single();
  if (!profile || profile.status !== "approved") redirect("/pending");

  return (
    <div className="mx-auto max-w-3xl px-4 pb-24 pt-4">
      <header className="mb-6 flex items-center justify-between">
        <Link href="/" className="text-lg font-bold">
          SECBL
        </Link>
        <div className="flex items-center gap-3 text-sm">
          {profile.role === "admin" && (
            <Link href="/admin" className="underline">
              Admin
            </Link>
          )}
          <form action={logout}>
            <button className="text-muted-foreground underline">Log out</button>
          </form>
        </div>
      </header>
      {children}
      <nav className="bg-background fixed inset-x-0 bottom-0 border-t">
        <div className="mx-auto flex max-w-3xl justify-around py-3 text-sm">
          <Link href="/">Home</Link>
          <Link href="/leaderboard">Leaderboard</Link>
          <Link href="/schools">Schools</Link>
          <Link href="/matches/new">Report</Link>
        </div>
      </nav>
    </div>
  );
}
```

- [ ] **Step 10: Create placeholder `app/(member)/page.tsx`** (replaced in Task 8)

```tsx
export default function HomePage() {
  return <p className="text-muted-foreground">Welcome to SECBL.</p>;
}
```

- [ ] **Step 11: Build + manual smoke test**

Run: `npm run build` — expect success. Then `npm run dev` and verify in a browser:
1. `/` redirects to `/login`.
2. Sign up with a real-looking email, name, school → lands on `/pending` ("waiting for admin approval").
3. `/` while pending redirects back to `/pending`.

- [ ] **Step 12: Bootstrap the first admin (the user themselves)**

Ask the user which email they signed up with, then via `mcp__claude_ai_Supabase__execute_sql`:

```sql
update public.profiles p set role = 'admin', status = 'approved'
from auth.users u
where u.id = p.id and u.email = '<their-email>';
```

Verify: reload `/` → home page renders with the Admin link in the header.

- [ ] **Step 13: Commit**

```bash
git add -A
git commit -m "feat: auth flow with signup, login, approval gating"
```

---

### Task 4: Admin approval queue

**Files:**
- Create: `app/(member)/admin/page.tsx`, `app/(member)/admin/actions.ts`

**Interfaces:**
- Consumes: `createClient` (Task 3), profiles RLS admin policies (Task 2).
- Produces: `/admin` page; `approveProfile(formData)`, `rejectProfile(formData)` server actions (form field: `profile_id`). Task 12 adds dispute handling to this same page.

- [ ] **Step 1: Create `app/(member)/admin/actions.ts`**

```ts
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

async function setStatus(formData: FormData, status: "approved" | "rejected") {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  // RLS is the real guard: only admins can update profiles.
  const { error } = await supabase
    .from("profiles")
    .update({ status })
    .eq("id", String(formData.get("profile_id")));
  if (error) redirect(`/admin?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/admin");
}

export async function approveProfile(formData: FormData) {
  await setStatus(formData, "approved");
}

export async function rejectProfile(formData: FormData) {
  await setStatus(formData, "rejected");
}
```

- [ ] **Step 2: Create `app/(member)/admin/page.tsx`**

```tsx
import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { approveProfile, rejectProfile } from "./actions";

export default async function AdminPage({
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
  if (me?.role !== "admin") redirect("/");

  const { data: pending } = await supabase
    .from("profiles")
    .select("id, display_name, created_at, schools(short_name)")
    .eq("status", "pending")
    .order("created_at");

  return (
    <main className="flex flex-col gap-6">
      <h1 className="text-xl font-bold">Admin</h1>
      {error && (
        <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</p>
      )}
      <Card>
        <CardHeader>
          <CardTitle>Signup approvals</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {(pending ?? []).length === 0 && (
            <p className="text-sm text-muted-foreground">No pending signups.</p>
          )}
          {(pending ?? []).map((p) => (
            <div key={p.id} className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="font-medium">{p.display_name}</span>
                <Badge variant="secondary">{p.schools?.short_name}</Badge>
              </div>
              <div className="flex gap-2">
                <form action={approveProfile}>
                  <input type="hidden" name="profile_id" value={p.id} />
                  <Button size="sm" type="submit">
                    Approve
                  </Button>
                </form>
                <form action={rejectProfile}>
                  <input type="hidden" name="profile_id" value={p.id} />
                  <Button size="sm" variant="outline" type="submit">
                    Reject
                  </Button>
                </form>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </main>
  );
}
```

Note: if TypeScript flags `p.schools` as an array (Supabase embed typing without generated types), render `{Array.isArray(p.schools) ? p.schools[0]?.short_name : p.schools?.short_name}` — to-one embeds arrive as objects at runtime.

- [ ] **Step 3: Build + manual verify**

Run: `npm run build` — expect success. In the dev server, as the admin: sign up a second throwaway account in a private window → it appears in `/admin` → Approve → the throwaway account's `/` now shows the home page.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: admin approval queue"
```

---

### Task 5: Rating engine (pure TS, TDD)

**Files:**
- Create: `tests/rating.test.ts`, `lib/rating.ts`

**Interfaces:**
- Consumes: nothing.
- Produces (used by Tasks 7/12): constants `STARTING_RATING=450`, `RATING_FLOOR=100`, `PROVISIONAL_GAMES=10`, `K_PROVISIONAL=64`, `K_STANDARD=32`; `expectedScore(ratingA: number, ratingB: number): number`; `kFactor(matchesPlayed: number): number`; `ratingUpdate(rating: number, opponentRating: number, won: boolean, matchesPlayed: number): { delta: number; newRating: number }`.

- [ ] **Step 1: Write the failing tests — `tests/rating.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import {
  expectedScore,
  kFactor,
  ratingUpdate,
  K_PROVISIONAL,
  K_STANDARD,
  PROVISIONAL_GAMES,
  RATING_FLOOR,
  STARTING_RATING,
} from "@/lib/rating";

describe("expectedScore", () => {
  it("is 0.5 for equal ratings", () => {
    expect(expectedScore(450, 450)).toBeCloseTo(0.5, 10);
  });

  it("gives a 100-point favorite 2:1 odds (Fargo curve)", () => {
    expect(expectedScore(550, 450)).toBeCloseTo(2 / 3, 10);
    expect(expectedScore(450, 550)).toBeCloseTo(1 / 3, 10);
  });

  it("is symmetric: probabilities sum to 1", () => {
    expect(expectedScore(612, 388) + expectedScore(388, 612)).toBeCloseTo(1, 10);
  });
});

describe("kFactor", () => {
  it("is provisional (64) for the first 10 matches", () => {
    expect(kFactor(0)).toBe(K_PROVISIONAL);
    expect(kFactor(PROVISIONAL_GAMES - 1)).toBe(K_PROVISIONAL);
  });

  it("is standard (32) from the 11th match on", () => {
    expect(kFactor(PROVISIONAL_GAMES)).toBe(K_STANDARD);
    expect(kFactor(100)).toBe(K_STANDARD);
  });
});

describe("ratingUpdate", () => {
  it("moves an even, established matchup by ±16", () => {
    expect(ratingUpdate(450, 450, true, 20)).toEqual({ delta: 16, newRating: 466 });
    expect(ratingUpdate(450, 450, false, 20)).toEqual({ delta: -16, newRating: 434 });
  });

  it("rewards a provisional underdog win heavily", () => {
    // K=64, expected 1/3 -> round(64 * 2/3) = 43
    expect(ratingUpdate(450, 550, true, 0)).toEqual({ delta: 43, newRating: 493 });
  });

  it("penalizes an established favorite loss moderately", () => {
    // K=32, expected 2/3 -> round(32 * -2/3) = -21
    expect(ratingUpdate(550, 450, false, 20)).toEqual({ delta: -21, newRating: 529 });
  });

  it("clamps at the rating floor", () => {
    const result = ratingUpdate(RATING_FLOOR + 5, RATING_FLOOR + 5, false, 20);
    expect(result.delta).toBe(-16);
    expect(result.newRating).toBe(RATING_FLOOR);
  });

  it("uses the documented starting rating", () => {
    expect(STARTING_RATING).toBe(450);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/rating.test.ts`
Expected: FAIL — cannot resolve `@/lib/rating`.

- [ ] **Step 3: Implement `lib/rating.ts`**

```ts
// Fargo-style Elo: a 100-point gap means 2:1 expected odds (spec §5).
export const STARTING_RATING = 450;
export const RATING_FLOOR = 100;
export const PROVISIONAL_GAMES = 10;
export const K_PROVISIONAL = 64;
export const K_STANDARD = 32;

export function expectedScore(ratingA: number, ratingB: number): number {
  return 1 / (1 + Math.pow(2, (ratingB - ratingA) / 100));
}

export function kFactor(matchesPlayed: number): number {
  return matchesPlayed < PROVISIONAL_GAMES ? K_PROVISIONAL : K_STANDARD;
}

export interface RatingUpdate {
  delta: number;
  newRating: number;
}

export function ratingUpdate(
  rating: number,
  opponentRating: number,
  won: boolean,
  matchesPlayed: number
): RatingUpdate {
  const expected = expectedScore(rating, opponentRating);
  const delta = Math.round(kFactor(matchesPlayed) * ((won ? 1 : 0) - expected));
  return { delta, newRating: Math.max(RATING_FLOOR, rating + delta) };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/rating.test.ts`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add tests/rating.test.ts lib/rating.ts
git commit -m "feat: fargo-style elo rating engine"
```

---

### Task 6: Match reporting (migration + report page)

**Files:**
- Create: `supabase/migrations/0002_matches.sql`
- Create: `app/(member)/matches/new/page.tsx`, `app/(member)/matches/new/actions.ts`

**Interfaces:**
- Consumes: Tasks 2–3.
- Produces: tables `matches`, `rating_history` with RLS; `/matches/new` page; `reportMatch(formData)` action (fields: `opponent_id`, `my_score`, `their_score`, `game_type`, `played_at`).

- [ ] **Step 1: Create `supabase/migrations/0002_matches.sql`**

```sql
create type public.game_type as enum ('8ball','9ball','10ball','other');
create type public.match_status as enum ('pending','confirmed','rejected','disputed');

create table public.matches (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id),
  opponent_id uuid not null references public.profiles(id),
  winner_id uuid not null references public.profiles(id),
  reporter_score int not null check (reporter_score >= 0),
  opponent_score int not null check (opponent_score >= 0),
  game_type public.game_type not null default '8ball',
  status public.match_status not null default 'pending',
  tournament_match_id uuid,
  played_at date not null default current_date,
  confirmed_at timestamptz,
  rating_delta_reporter int,
  rating_delta_opponent int,
  created_at timestamptz not null default now(),
  check (reporter_id <> opponent_id),
  check (winner_id in (reporter_id, opponent_id))
);

create index matches_opponent_pending_idx
  on public.matches (opponent_id) where status = 'pending';
create index matches_confirmed_at_idx on public.matches (confirmed_at desc);

create table public.rating_history (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id),
  match_id uuid not null references public.matches(id),
  rating_before int not null,
  rating_after int not null,
  created_at timestamptz not null default now()
);

create index rating_history_profile_idx
  on public.rating_history (profile_id, created_at desc);

alter table public.matches enable row level security;
alter table public.rating_history enable row level security;

create policy "approved read matches"
  on public.matches for select to authenticated
  using (public.is_approved());

-- Reporters create their own pending matches. No client UPDATE policy at all:
-- confirmation/rejection/dispute resolution go through server-side code.
create policy "approved report own matches"
  on public.matches for insert to authenticated
  with check (
    public.is_approved()
    and reporter_id = auth.uid()
    and status = 'pending'
    and tournament_match_id is null
  );

create policy "approved read rating history"
  on public.rating_history for select to authenticated
  using (public.is_approved());
```

- [ ] **Step 2: Apply the migration**

Use `mcp__claude_ai_Supabase__apply_migration` with name `matches` and the SQL above.

- [ ] **Step 3: Create `app/(member)/matches/new/actions.ts`**

```ts
"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function reportMatch(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const opponentId = String(formData.get("opponent_id") ?? "");
  const myScore = Number(formData.get("my_score"));
  const theirScore = Number(formData.get("their_score"));
  const invalid =
    !opponentId ||
    opponentId === user.id ||
    !Number.isInteger(myScore) ||
    !Number.isInteger(theirScore) ||
    myScore < 0 ||
    theirScore < 0 ||
    myScore === theirScore;
  if (invalid) {
    redirect(`/matches/new?error=${encodeURIComponent("Enter a valid, non-tied score")}`);
  }

  const { error } = await supabase.from("matches").insert({
    reporter_id: user.id,
    opponent_id: opponentId,
    winner_id: myScore > theirScore ? user.id : opponentId,
    reporter_score: myScore,
    opponent_score: theirScore,
    game_type: String(formData.get("game_type") ?? "8ball"),
    played_at: String(formData.get("played_at")),
  });
  if (error) redirect(`/matches/new?error=${encodeURIComponent(error.message)}`);
  redirect(`/?message=${encodeURIComponent("Match reported — waiting on your opponent to confirm.")}`);
}
```

- [ ] **Step 4: Create `app/(member)/matches/new/page.tsx`**

```tsx
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/server";
import { reportMatch } from "./actions";

const GAME_TYPES = [
  { value: "8ball", label: "8-ball" },
  { value: "9ball", label: "9-ball" },
  { value: "10ball", label: "10-ball" },
  { value: "other", label: "Other" },
] as const;

export default async function NewMatchPage({
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
  const { data: opponents } = await supabase
    .from("profiles")
    .select("id, display_name, schools(short_name)")
    .eq("status", "approved")
    .neq("id", user.id)
    .order("display_name");

  const today = new Date().toISOString().slice(0, 10);
  const selectClass =
    "border-input bg-transparent h-9 rounded-md border px-3 text-sm shadow-xs";

  return (
    <main className="flex flex-col gap-6">
      <h1 className="text-xl font-bold">Report a match</h1>
      {error && (
        <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</p>
      )}
      <form action={reportMatch} className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="opponent_id">Opponent</Label>
          <select id="opponent_id" name="opponent_id" required defaultValue="" className={selectClass}>
            <option value="" disabled>
              Choose opponent
            </option>
            {(opponents ?? []).map((o) => (
              <option key={o.id} value={o.id}>
                {o.display_name}
              </option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="my_score">Your score</Label>
            <Input id="my_score" name="my_score" type="number" min={0} required />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="their_score">Their score</Label>
            <Input id="their_score" name="their_score" type="number" min={0} required />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="game_type">Game</Label>
            <select id="game_type" name="game_type" defaultValue="8ball" className={selectClass}>
              {GAME_TYPES.map((g) => (
                <option key={g.value} value={g.value}>
                  {g.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="played_at">Date</Label>
            <Input id="played_at" name="played_at" type="date" defaultValue={today} required />
          </div>
        </div>
        <Button type="submit">Report match</Button>
      </form>
      <p className="text-sm text-muted-foreground">
        Your opponent confirms the result before it counts toward ratings.
      </p>
    </main>
  );
}
```

- [ ] **Step 5: Build + manual verify**

Run: `npm run build` — expect success. In dev: report a match against the approved throwaway account; expect redirect to `/` with the reported message. Verify the row via `mcp__claude_ai_Supabase__execute_sql`: `select status, reporter_score, opponent_score from public.matches order by created_at desc limit 1;` → `pending`.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: match reporting with pending confirmation"
```

---

### Task 7: Confirmation engine (SQL function + confirm/reject actions)

**Files:**
- Create: `supabase/migrations/0003_confirmation.sql`
- Create: `lib/confirm-match.ts`
- Create: `app/(member)/matches/actions.ts`

**Interfaces:**
- Consumes: `ratingUpdate` (Task 5), `createClient`/`createServiceClient` (Task 3), `Match` type (Task 3), matches tables (Task 6).
- Produces: Postgres function `apply_match_confirmation(p_match_id uuid, p_reporter_delta int, p_opponent_delta int)` (service-role only); `confirmPendingMatch(service: SupabaseClient, match: Match): Promise<void>` from `@/lib/confirm-match` (reused by Task 12); `confirmMatch(formData)`, `rejectMatch(formData)` server actions (field: `match_id`) used by Task 8.

- [ ] **Step 1: Create `supabase/migrations/0003_confirmation.sql`**

```sql
-- Applies a confirmed match atomically: both ratings, both history rows,
-- match status. Deltas are computed by the trusted server (lib/rating.ts);
-- only the service role may execute this.
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
  select * into m from matches where id = p_match_id and status = 'pending' for update;
  if not found then
    raise exception 'match % is not pending', p_match_id;
  end if;

  select rating into r_before from profiles where id = m.reporter_id for update;
  select rating into o_before from profiles where id = m.opponent_id for update;
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

revoke execute on function public.apply_match_confirmation(uuid, int, int)
  from public, anon, authenticated;
grant execute on function public.apply_match_confirmation(uuid, int, int)
  to service_role;
```

- [ ] **Step 2: Apply the migration**

Use `mcp__claude_ai_Supabase__apply_migration` with name `confirmation`.

- [ ] **Step 3: Create `lib/confirm-match.ts`**

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import { ratingUpdate } from "@/lib/rating";
import type { Match } from "@/lib/types";

// Computes both players' deltas with the TS rating engine, then applies them
// atomically via the service-role-only apply_match_confirmation function.
export async function confirmPendingMatch(
  service: SupabaseClient,
  match: Match
): Promise<void> {
  const { data: players, error: playersError } = await service
    .from("profiles")
    .select("id, rating, matches_played")
    .in("id", [match.reporter_id, match.opponent_id]);
  if (playersError || !players || players.length !== 2) {
    throw new Error(playersError?.message ?? "match players not found");
  }
  const reporter = players.find((p) => p.id === match.reporter_id)!;
  const opponent = players.find((p) => p.id === match.opponent_id)!;
  const reporterWon = match.winner_id === match.reporter_id;

  const reporterResult = ratingUpdate(
    reporter.rating,
    opponent.rating,
    reporterWon,
    reporter.matches_played
  );
  const opponentResult = ratingUpdate(
    opponent.rating,
    reporter.rating,
    !reporterWon,
    opponent.matches_played
  );

  const { error } = await service.rpc("apply_match_confirmation", {
    p_match_id: match.id,
    p_reporter_delta: reporterResult.delta,
    p_opponent_delta: opponentResult.delta,
  });
  if (error) throw new Error(error.message);
}
```

- [ ] **Step 4: Create `app/(member)/matches/actions.ts`**

```ts
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { confirmPendingMatch } from "@/lib/confirm-match";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import type { Match } from "@/lib/types";

async function loadOwnPendingMatch(matchId: string): Promise<Match | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const service = createServiceClient();
  const { data: match } = await service
    .from("matches")
    .select("*")
    .eq("id", matchId)
    .single();
  if (!match || match.status !== "pending" || match.opponent_id !== user.id) {
    return null;
  }
  return match as Match;
}

export async function confirmMatch(formData: FormData) {
  const match = await loadOwnPendingMatch(String(formData.get("match_id")));
  if (!match) {
    redirect(`/?error=${encodeURIComponent("That match can no longer be confirmed.")}`);
  }
  await confirmPendingMatch(createServiceClient(), match);
  revalidatePath("/");
  redirect(`/?message=${encodeURIComponent("Match confirmed — ratings updated.")}`);
}

export async function rejectMatch(formData: FormData) {
  const match = await loadOwnPendingMatch(String(formData.get("match_id")));
  if (!match) {
    redirect(`/?error=${encodeURIComponent("That match can no longer be rejected.")}`);
  }
  const service = createServiceClient();
  const { error } = await service
    .from("matches")
    .update({ status: "disputed" })
    .eq("id", match.id)
    .eq("status", "pending");
  if (error) redirect(`/?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/");
  redirect(`/?message=${encodeURIComponent("Sent to the admins to sort out.")}`);
}
```

- [ ] **Step 5: Verify end-to-end via SQL**

Run `npm run build` — expect success. Full UI verification happens in Task 8; for now verify the function directly. Using `mcp__claude_ai_Supabase__execute_sql`, take the pending match id from Task 6 and check it errors for non-pending / works for pending — as service role the MCP runs privileged:

```sql
select public.apply_match_confirmation(
  (select id from public.matches where status = 'pending' order by created_at desc limit 1),
  16, -16
);
select status, rating_delta_reporter, rating_delta_opponent
from public.matches order by created_at desc limit 1;
select display_name, rating, matches_played from public.profiles order by display_name;
```

Expected: match `confirmed` with deltas `16 / -16`; both profiles moved off 450 and `matches_played` incremented.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: atomic match confirmation with rating application"
```

---

### Task 8: Home page (rating card, confirmations, recent matches)

**Files:**
- Modify: `app/(member)/page.tsx` (replace placeholder)

**Interfaces:**
- Consumes: `confirmMatch`/`rejectMatch` (Task 7), `createClient` (Task 3).
- Produces: the member home page. The heading string `Your rating` and the pending text `waiting for admin approval` (Task 3's pending page) are load-bearing — the E2E test (Task 14) asserts on them.

- [ ] **Step 1: Replace `app/(member)/page.tsx`**

```tsx
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { confirmMatch, rejectMatch } from "@/app/(member)/matches/actions";

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ message?: string; error?: string }>;
}) {
  const { message, error } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: me } = await supabase
    .from("profiles")
    .select("display_name, rating, matches_played")
    .eq("id", user!.id)
    .single();

  const { data: toConfirm } = await supabase
    .from("matches")
    .select(
      "id, reporter_score, opponent_score, game_type, played_at, winner_id, reporter:profiles!matches_reporter_id_fkey(id, display_name)"
    )
    .eq("opponent_id", user!.id)
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  const { data: recent } = await supabase
    .from("matches")
    .select(
      "id, reporter_score, opponent_score, played_at, winner_id, reporter:profiles!matches_reporter_id_fkey(id, display_name), opponent:profiles!matches_opponent_id_fkey(id, display_name)"
    )
    .eq("status", "confirmed")
    .order("confirmed_at", { ascending: false })
    .limit(10);

  return (
    <main className="flex flex-col gap-6">
      {message && <p className="rounded-md bg-muted p-3 text-sm">{message}</p>}
      {error && (
        <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</p>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Your rating</CardTitle>
        </CardHeader>
        <CardContent className="flex items-baseline justify-between">
          <span className="text-4xl font-bold">{me?.rating}</span>
          <span className="text-sm text-muted-foreground">
            {me?.matches_played} match{me?.matches_played === 1 ? "" : "es"} played
            {(me?.matches_played ?? 0) < 10 && " · provisional"}
          </span>
        </CardContent>
      </Card>

      {(toConfirm ?? []).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Confirm results</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {(toConfirm ?? []).map((m) => {
              const reporter = Array.isArray(m.reporter) ? m.reporter[0] : m.reporter;
              const theyWon = m.winner_id === reporter?.id;
              return (
                <div key={m.id} className="flex items-center justify-between gap-2">
                  <div className="text-sm">
                    <span className="font-medium">{reporter?.display_name}</span> reported{" "}
                    {theyWon ? "beating you" : "losing to you"} {m.reporter_score}–
                    {m.opponent_score} <Badge variant="secondary">{m.game_type}</Badge>
                  </div>
                  <div className="flex gap-2">
                    <form action={confirmMatch}>
                      <input type="hidden" name="match_id" value={m.id} />
                      <Button size="sm" type="submit">
                        Confirm
                      </Button>
                    </form>
                    <form action={rejectMatch}>
                      <input type="hidden" name="match_id" value={m.id} />
                      <Button size="sm" variant="outline" type="submit">
                        Reject
                      </Button>
                    </form>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Recent matches</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm">
          {(recent ?? []).length === 0 && (
            <p className="text-muted-foreground">
              No confirmed matches yet.{" "}
              <Link href="/matches/new" className="underline">
                Report the first one.
              </Link>
            </p>
          )}
          {(recent ?? []).map((m) => {
            const reporter = Array.isArray(m.reporter) ? m.reporter[0] : m.reporter;
            const opponent = Array.isArray(m.opponent) ? m.opponent[0] : m.opponent;
            const winner = m.winner_id === reporter?.id ? reporter : opponent;
            const loser = m.winner_id === reporter?.id ? opponent : reporter;
            return (
              <p key={m.id}>
                <span className="font-medium">{winner?.display_name}</span> def.{" "}
                {loser?.display_name} {Math.max(m.reporter_score, m.opponent_score)}–
                {Math.min(m.reporter_score, m.opponent_score)}{" "}
                <span className="text-muted-foreground">({m.played_at})</span>
              </p>
            );
          })}
        </CardContent>
      </Card>
    </main>
  );
}
```

- [ ] **Step 2: Build + manual verify the full loop**

Run: `npm run build` — expect success. In dev: report a match as the admin against the throwaway account, log in as the throwaway in a private window → home shows "Confirm results" → Confirm → both home pages show updated ratings and the match under "Recent matches". Also verify Reject on a second reported match → "Sent to the admins" message.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: home page with rating card and match confirmations"
```

---

### Task 9: Leaderboard (view + page)

**Files:**
- Create: `supabase/migrations/0004_leaderboard.sql`
- Create: `app/(member)/leaderboard/page.tsx`

**Interfaces:**
- Consumes: Tasks 2/6 tables.
- Produces: view `public.leaderboard` (columns: `id, display_name, school_id, school_short_name, rating, matches_played, wins, losses`); `/leaderboard` page.

- [ ] **Step 1: Create `supabase/migrations/0004_leaderboard.sql`**

```sql
-- security_invoker: the underlying RLS decides who sees rows.
create view public.leaderboard with (security_invoker = on) as
select
  p.id,
  p.display_name,
  p.school_id,
  s.short_name as school_short_name,
  p.rating,
  p.matches_played,
  count(m.id) filter (where m.winner_id = p.id) as wins,
  count(m.id) filter (where m.winner_id <> p.id) as losses
from public.profiles p
join public.schools s on s.id = p.school_id
left join public.matches m
  on m.status = 'confirmed'
  and (m.reporter_id = p.id or m.opponent_id = p.id)
where p.status = 'approved'
group by p.id, s.short_name
order by p.rating desc, wins desc;
```

- [ ] **Step 2: Apply via `mcp__claude_ai_Supabase__apply_migration`** (name `leaderboard`), then verify with `execute_sql`: `select display_name, rating, wins, losses from public.leaderboard;` — expect the two test players with correct W-L from the earlier confirmed match.

- [ ] **Step 3: Create `app/(member)/leaderboard/page.tsx`**

```tsx
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { createClient } from "@/lib/supabase/server";

export default async function LeaderboardPage() {
  const supabase = await createClient();
  const { data: rows } = await supabase.from("leaderboard").select("*");

  return (
    <main className="flex flex-col gap-6">
      <h1 className="text-xl font-bold">Leaderboard</h1>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>#</TableHead>
            <TableHead>Player</TableHead>
            <TableHead>School</TableHead>
            <TableHead className="text-right">Rating</TableHead>
            <TableHead className="text-right">W–L</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {(rows ?? []).map((r, i) => (
            <TableRow key={r.id}>
              <TableCell>{i + 1}</TableCell>
              <TableCell>
                <Link href={`/players/${r.id}`} className="font-medium underline-offset-2 hover:underline">
                  {r.display_name}
                </Link>
                {r.matches_played < 10 && (
                  <span className="text-muted-foreground"> *</span>
                )}
              </TableCell>
              <TableCell>
                <Badge variant="secondary">{r.school_short_name}</Badge>
              </TableCell>
              <TableCell className="text-right font-medium">{r.rating}</TableCell>
              <TableCell className="text-right">
                {r.wins}–{r.losses}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <p className="text-xs text-muted-foreground">* provisional (fewer than 10 matches)</p>
    </main>
  );
}
```

- [ ] **Step 4: Build + manual verify**

Run: `npm run build` — expect success. In dev, `/leaderboard` shows both test players ranked by rating with correct W–L.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: player leaderboard"
```

---

### Task 10: School stats (views + page)

**Files:**
- Create: `supabase/migrations/0005_school_stats.sql`
- Create: `app/(member)/schools/page.tsx`

**Interfaces:**
- Consumes: Tasks 2/6 tables.
- Produces: views `public.school_stats` (`id, name, short_name, member_count, avg_rating, wins, losses`) and `public.school_head_to_head` (`winner_school_id, winner_short_name, loser_school_id, loser_short_name, wins`); `/schools` page.

- [ ] **Step 1: Create `supabase/migrations/0005_school_stats.sql`**

```sql
create view public.school_stats with (security_invoker = on) as
select
  s.id,
  s.name,
  s.short_name,
  count(distinct p.id) as member_count,
  coalesce(round(avg(p.rating)), 0)::int as avg_rating,
  count(m.id) filter (where m.winner_id = p.id) as wins,
  count(m.id) filter (where m.winner_id <> p.id) as losses
from public.schools s
left join public.profiles p
  on p.school_id = s.id and p.status = 'approved'
left join public.matches m
  on m.status = 'confirmed'
  and (m.reporter_id = p.id or m.opponent_id = p.id)
group by s.id
order by avg_rating desc;

create view public.school_head_to_head with (security_invoker = on) as
select
  ws.id as winner_school_id,
  ws.short_name as winner_short_name,
  ls.id as loser_school_id,
  ls.short_name as loser_short_name,
  count(*) as wins
from public.matches m
join public.profiles wp on wp.id = m.winner_id
join public.profiles lp
  on lp.id = case when m.winner_id = m.reporter_id then m.opponent_id else m.reporter_id end
join public.schools ws on ws.id = wp.school_id
join public.schools ls on ls.id = lp.school_id
where m.status = 'confirmed' and wp.school_id <> lp.school_id
group by ws.id, ls.id;
```

- [ ] **Step 2: Apply via `mcp__claude_ai_Supabase__apply_migration`** (name `school_stats`); verify with `execute_sql`: `select short_name, member_count, avg_rating from public.school_stats;`.

- [ ] **Step 3: Create `app/(member)/schools/page.tsx`**

```tsx
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";

export default async function SchoolsPage() {
  const supabase = await createClient();
  const { data: stats } = await supabase.from("school_stats").select("*");
  const { data: h2h } = await supabase.from("school_head_to_head").select("*");

  return (
    <main className="flex flex-col gap-6">
      <h1 className="text-xl font-bold">Schools</h1>
      <div className="grid gap-4 sm:grid-cols-2">
        {(stats ?? []).map((s) => (
          <Card key={s.id}>
            <CardHeader>
              <CardTitle>{s.short_name}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-1 text-sm">
              <p className="text-muted-foreground">{s.name}</p>
              <p>
                <span className="font-medium">{s.member_count}</span> members ·{" "}
                <span className="font-medium">{s.avg_rating}</span> avg rating
              </p>
              <p>
                Record: <span className="font-medium">{s.wins}–{s.losses}</span>
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader>
          <CardTitle>School vs. school</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-1 text-sm">
          {(h2h ?? []).length === 0 && (
            <p className="text-muted-foreground">No cross-school matches yet.</p>
          )}
          {(h2h ?? []).map((r) => (
            <p key={`${r.winner_school_id}-${r.loser_school_id}`}>
              <span className="font-medium">{r.winner_short_name}</span> {r.wins} win
              {r.wins === 1 ? "" : "s"} over {r.loser_short_name}
            </p>
          ))}
        </CardContent>
      </Card>
    </main>
  );
}
```

- [ ] **Step 4: Build + manual verify** (`npm run build`; `/schools` shows all three schools with the test players' school stats populated)

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: school stats and head-to-head"
```

---

### Task 11: Player profile page

**Files:**
- Create: `app/(member)/players/[id]/page.tsx`

**Interfaces:**
- Consumes: Tasks 2/6 tables, `createClient` (Task 3).
- Produces: `/players/[id]` page (linked from the leaderboard).

- [ ] **Step 1: Create `app/(member)/players/[id]/page.tsx`**

```tsx
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";

export default async function PlayerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, display_name, rating, matches_played, created_at, schools(name, short_name)")
    .eq("id", id)
    .single();
  if (!profile) notFound();
  const school = Array.isArray(profile.schools) ? profile.schools[0] : profile.schools;

  const { data: history } = await supabase
    .from("rating_history")
    .select("id, rating_before, rating_after, created_at")
    .eq("profile_id", id)
    .order("created_at", { ascending: false })
    .limit(20);

  const { data: matches } = await supabase
    .from("matches")
    .select(
      "id, reporter_score, opponent_score, played_at, winner_id, reporter:profiles!matches_reporter_id_fkey(id, display_name), opponent:profiles!matches_opponent_id_fkey(id, display_name)"
    )
    .eq("status", "confirmed")
    .or(`reporter_id.eq.${id},opponent_id.eq.${id}`)
    .order("confirmed_at", { ascending: false })
    .limit(10);

  return (
    <main className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-bold">{profile.display_name}</h1>
        <Badge variant="secondary">{school?.short_name}</Badge>
      </div>

      <Card>
        <CardContent className="flex items-baseline justify-between pt-6">
          <span className="text-4xl font-bold">{profile.rating}</span>
          <span className="text-sm text-muted-foreground">
            {profile.matches_played} matches
            {profile.matches_played < 10 && " · provisional"}
          </span>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent matches</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm">
          {(matches ?? []).length === 0 && (
            <p className="text-muted-foreground">No confirmed matches yet.</p>
          )}
          {(matches ?? []).map((m) => {
            const reporter = Array.isArray(m.reporter) ? m.reporter[0] : m.reporter;
            const opponent = Array.isArray(m.opponent) ? m.opponent[0] : m.opponent;
            const won = m.winner_id === id;
            const other = reporter?.id === id ? opponent : reporter;
            return (
              <p key={m.id}>
                <span className={won ? "font-medium" : "text-muted-foreground"}>
                  {won ? "W" : "L"}
                </span>{" "}
                vs {other?.display_name} {Math.max(m.reporter_score, m.opponent_score)}–
                {Math.min(m.reporter_score, m.opponent_score)}{" "}
                <span className="text-muted-foreground">({m.played_at})</span>
              </p>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Rating history</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-1 text-sm">
          {(history ?? []).length === 0 && (
            <p className="text-muted-foreground">No rated matches yet.</p>
          )}
          {(history ?? []).map((h) => {
            const delta = h.rating_after - h.rating_before;
            return (
              <p key={h.id}>
                {h.rating_before} → <span className="font-medium">{h.rating_after}</span>{" "}
                <span className={delta >= 0 ? "text-muted-foreground" : "text-destructive"}>
                  ({delta >= 0 ? "+" : ""}
                  {delta})
                </span>
              </p>
            );
          })}
        </CardContent>
      </Card>
    </main>
  );
}
```

- [ ] **Step 2: Build + manual verify** (`npm run build`; click a leaderboard name → profile shows rating, W/L match list, and history entries)

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: player profile with rating history"
```

---

### Task 12: Admin dispute resolution

**Files:**
- Modify: `app/(member)/admin/actions.ts` (add two actions)
- Modify: `app/(member)/admin/page.tsx` (add disputes section)

**Interfaces:**
- Consumes: `confirmPendingMatch` (Task 7), `createServiceClient` (Task 3), admin page (Task 4).
- Produces: `adminResolveMatch(formData)` (fields: `match_id`, `winner_id`, `reporter_score`, `opponent_score`), `adminRejectMatch(formData)` (field: `match_id`).

- [ ] **Step 1: Append to `app/(member)/admin/actions.ts`**

```ts
import { confirmPendingMatch } from "@/lib/confirm-match";
import { createServiceClient } from "@/lib/supabase/server";

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
  if (me?.role !== "admin") redirect("/");
}

export async function adminResolveMatch(formData: FormData) {
  await requireAdmin();
  const matchId = String(formData.get("match_id"));
  const winnerId = String(formData.get("winner_id"));
  const reporterScore = Number(formData.get("reporter_score"));
  const opponentScore = Number(formData.get("opponent_score"));
  const service = createServiceClient();
  const { data: match } = await service
    .from("matches")
    .select("*")
    .eq("id", matchId)
    .single();
  if (!match || match.status !== "disputed") {
    redirect(`/admin?error=${encodeURIComponent("Match is not disputed.")}`);
  }
  if (
    ![match.reporter_id, match.opponent_id].includes(winnerId) ||
    !Number.isInteger(reporterScore) ||
    !Number.isInteger(opponentScore) ||
    reporterScore < 0 ||
    opponentScore < 0
  ) {
    redirect(`/admin?error=${encodeURIComponent("Invalid resolution.")}`);
  }
  const { data: updated, error } = await service
    .from("matches")
    .update({
      winner_id: winnerId,
      reporter_score: reporterScore,
      opponent_score: opponentScore,
      status: "pending",
    })
    .eq("id", matchId)
    .select()
    .single();
  if (error || !updated) {
    redirect(`/admin?error=${encodeURIComponent(error?.message ?? "update failed")}`);
  }
  await confirmPendingMatch(service, updated);
  revalidatePath("/admin");
}

export async function adminRejectMatch(formData: FormData) {
  await requireAdmin();
  const service = createServiceClient();
  const { error } = await service
    .from("matches")
    .update({ status: "rejected" })
    .eq("id", String(formData.get("match_id")))
    .eq("status", "disputed");
  if (error) redirect(`/admin?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/admin");
}
```

(Existing imports `createClient`, `redirect`, `revalidatePath` are already at the top of the file from Task 4 — merge, don't duplicate.)

- [ ] **Step 2: Add the disputes section to `app/(member)/admin/page.tsx`**

Add this query after the pending-profiles query:

```tsx
const { data: disputed } = await supabase
  .from("matches")
  .select(
    "id, reporter_score, opponent_score, game_type, played_at, reporter:profiles!matches_reporter_id_fkey(id, display_name), opponent:profiles!matches_opponent_id_fkey(id, display_name)"
  )
  .eq("status", "disputed")
  .order("created_at");
```

And this card after the approvals card (import `adminResolveMatch`, `adminRejectMatch`, and `Input` from `@/components/ui/input`):

```tsx
<Card>
  <CardHeader>
    <CardTitle>Disputed matches</CardTitle>
  </CardHeader>
  <CardContent className="flex flex-col gap-6">
    {(disputed ?? []).length === 0 && (
      <p className="text-sm text-muted-foreground">No disputes.</p>
    )}
    {(disputed ?? []).map((m) => {
      const reporter = Array.isArray(m.reporter) ? m.reporter[0] : m.reporter;
      const opponent = Array.isArray(m.opponent) ? m.opponent[0] : m.opponent;
      return (
        <div key={m.id} className="flex flex-col gap-3 border-b pb-4 last:border-b-0">
          <p className="text-sm">
            {reporter?.display_name} reported {m.reporter_score}–{m.opponent_score} vs{" "}
            {opponent?.display_name} ({m.game_type}, {m.played_at}) — rejected by opponent.
          </p>
          <form action={adminResolveMatch} className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="match_id" value={m.id} />
            <label className="flex flex-col gap-1 text-xs">
              Winner
              <select
                name="winner_id"
                required
                defaultValue=""
                className="border-input h-9 rounded-md border bg-transparent px-3 text-sm"
              >
                <option value="" disabled>
                  Pick winner
                </option>
                <option value={reporter?.id}>{reporter?.display_name}</option>
                <option value={opponent?.id}>{opponent?.display_name}</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs">
              {reporter?.display_name}
              <Input name="reporter_score" type="number" min={0} defaultValue={m.reporter_score} className="w-20" />
            </label>
            <label className="flex flex-col gap-1 text-xs">
              {opponent?.display_name}
              <Input name="opponent_score" type="number" min={0} defaultValue={m.opponent_score} className="w-20" />
            </label>
            <Button size="sm" type="submit">
              Apply &amp; confirm
            </Button>
          </form>
          <form action={adminRejectMatch}>
            <input type="hidden" name="match_id" value={m.id} />
            <Button size="sm" variant="outline" type="submit">
              Reject permanently
            </Button>
          </form>
        </div>
      );
    })}
  </CardContent>
</Card>
```

- [ ] **Step 3: Build + manual verify**

`npm run build` — expect success. In dev: reject a reported match as the throwaway → it appears in `/admin` disputes → resolve with corrected scores → ratings update and it shows in Recent matches.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: admin dispute resolution"
```

---

### Task 13: RLS integration tests

**Files:**
- Create: `tests/rls.integration.test.ts`

**Interfaces:**
- Consumes: live Supabase project (env vars from Task 2), all migrations applied.
- Produces: regression tests for the three highest-stakes policies. They run in `npm test` when env vars are present, skip otherwise.

- [ ] **Step 1: Write `tests/rls.integration.test.ts`**

```ts
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

describe.skipIf(!url || !anonKey || !serviceKey)("RLS policies", () => {
  const admin = createClient(url!, serviceKey!);
  const password = "rls-test-password-1!";
  const pendingEmail = `rls-pending-${Date.now()}@example.com`;
  const memberEmail = `rls-member-${Date.now()}@example.com`;
  let pendingId: string;
  let memberId: string;

  beforeAll(async () => {
    const { data: school } = await admin.from("schools").select("id").limit(1).single();
    async function makeUser(email: string) {
      const { data, error } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { display_name: email, school_id: school!.id },
      });
      if (error) throw error;
      return data.user!.id;
    }
    pendingId = await makeUser(pendingEmail);
    memberId = await makeUser(memberEmail);
    await admin.from("profiles").update({ status: "approved" }).eq("id", memberId);
  });

  afterAll(async () => {
    await admin.from("rating_history").delete().in("profile_id", [pendingId, memberId]);
    await admin
      .from("matches")
      .delete()
      .or(
        `reporter_id.eq.${pendingId},reporter_id.eq.${memberId},opponent_id.eq.${pendingId},opponent_id.eq.${memberId}`
      );
    await admin.auth.admin.deleteUser(pendingId);
    await admin.auth.admin.deleteUser(memberId);
  });

  async function signIn(email: string) {
    const client = createClient(url!, anonKey!);
    const { error } = await client.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return client;
  }

  it("a pending user sees only their own profile", async () => {
    const client = await signIn(pendingEmail);
    const { data } = await client.from("profiles").select("id");
    expect(data?.map((p) => p.id)).toEqual([pendingId]);
  });

  it("a member cannot update their own rating", async () => {
    const client = await signIn(memberEmail);
    await client.from("profiles").update({ rating: 9999 }).eq("id", memberId);
    const { data } = await admin
      .from("profiles")
      .select("rating")
      .eq("id", memberId)
      .single();
    expect(data!.rating).not.toBe(9999);
  });

  it("a member cannot call apply_match_confirmation", async () => {
    const client = await signIn(memberEmail);
    const { error } = await client.rpc("apply_match_confirmation", {
      p_match_id: "00000000-0000-0000-0000-000000000000",
      p_reporter_delta: 0,
      p_opponent_delta: 0,
    });
    expect(error).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run the suite**

Run: `npm test`
Expected: rating tests + all three RLS tests PASS (they hit the live project using `.env.local`).

- [ ] **Step 3: Commit**

```bash
git add tests/rls.integration.test.ts
git commit -m "test: RLS policy integration tests"
```

---

### Task 14: E2E smoke test (Playwright)

**Files:**
- Create: `playwright.config.ts`, `e2e/signup-flow.spec.ts`
- Modify: `.gitignore` (add `test-results/`, `playwright-report/`), `package.json` (add `"test:e2e": "playwright test"`)

**Interfaces:**
- Consumes: the full app (Tasks 3–8), live Supabase, email confirmation disabled (Task 2 Step 3), the strings `Your rating` (Task 8) and `waiting for admin approval` (Task 3).
- Produces: one end-to-end happy path: signup → pending → admin approval → home.

- [ ] **Step 1: Install Playwright**

```powershell
npm i -D @playwright/test
npx playwright install chromium
```

- [ ] **Step 2: Create `playwright.config.ts`**

```ts
import { defineConfig } from "@playwright/test";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

export default defineConfig({
  testDir: "e2e",
  use: { baseURL: "http://localhost:3000" },
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
```

- [ ] **Step 3: Create `e2e/signup-flow.spec.ts`**

```ts
import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

// Requires "Confirm email" OFF in Supabase auth settings (signup must return a session).
test("signup → pending → approve → home", async ({ page }) => {
  const email = `e2e-${Date.now()}@example.com`;
  const service = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  await page.goto("/signup");
  // display_name doubles as a unique lookup key for this test run.
  await page.fill('input[name="display_name"]', email.slice(0, 40));
  await page.selectOption('select[name="school_id"]', { index: 1 });
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', "e2e-password-123!");
  await page.click('button[type="submit"]');
  await expect(page.getByText(/waiting for admin approval/i)).toBeVisible();

  const { data: profile } = await service
    .from("profiles")
    .select("id")
    .eq("display_name", email.slice(0, 40))
    .single();
  expect(profile).not.toBeNull();
  await service.from("profiles").update({ status: "approved" }).eq("id", profile!.id);

  await page.goto("/");
  await expect(page.getByText(/your rating/i)).toBeVisible();

  await service.auth.admin.deleteUser(profile!.id);
});
```

- [ ] **Step 4: Run it**

Run: `npx playwright test`
Expected: 1 passed.

- [ ] **Step 5: Add `.gitignore` entries and the script, then commit**

Append to `.gitignore`:

```
test-results/
playwright-report/
```

Add to `package.json` scripts: `"test:e2e": "playwright test"`.

```bash
git add -A
git commit -m "test: e2e smoke for signup and approval flow"
```

---

### Task 15: PWA manifest, icon, metadata + deploy to Vercel

**Files:**
- Create: `app/manifest.ts`, `app/icon.svg`
- Modify: `app/layout.tsx` (metadata)

**Interfaces:**
- Consumes: the finished app.
- Produces: installable PWA; production deployment on Vercel.

- [ ] **Step 1: Create `app/icon.svg`** (placeholder 8-ball — replaced at branding pass)

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <circle cx="50" cy="50" r="48" fill="#171717"/>
  <circle cx="50" cy="38" r="18" fill="#fafafa"/>
  <text x="50" y="45" font-size="20" font-family="Arial, sans-serif" font-weight="bold" text-anchor="middle" fill="#171717">8</text>
</svg>
```

- [ ] **Step 2: Create `app/manifest.ts`**

```ts
import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "SECBL — SEC Billiards League",
    short_name: "SECBL",
    description: "Stats, ratings, brackets, and events for the SEC billiards group",
    start_url: "/",
    display: "standalone",
    background_color: "#0a0a0a",
    theme_color: "#0a0a0a",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
```

(PNG icons for iOS home screens land with the branding pass — noted in the spec's polish phase.)

- [ ] **Step 3: Update `app/layout.tsx` metadata**

Replace the scaffold's `metadata` export with:

```ts
export const metadata: Metadata = {
  title: "SECBL",
  description: "Stats, ratings, brackets, and events for the SEC billiards group",
};
```

- [ ] **Step 4: Verify build**

Run: `npm run build` — expect success, `/manifest.webmanifest` in the route list.

- [ ] **Step 5: Deploy to Vercel**

Preferred: invoke the `vercel:deploy` skill (production). If unavailable, install the CLI and deploy manually — `vercel login` and the linking prompts need the user at the keyboard:

```powershell
npm i -g vercel
vercel link
vercel env add NEXT_PUBLIC_SUPABASE_URL production
vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY production
vercel env add SUPABASE_SERVICE_ROLE_KEY production
vercel --prod
```

- [ ] **Step 6: Verify production**

Open the production URL: `/login` renders; log in as the admin; home shows the rating card. On a phone (or Chrome DevTools mobile emulation), confirm the browser offers "Add to Home Screen"/install.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: PWA manifest, app icon, production deploy"
```

---

## Out of scope for this plan (later phases per spec §11)

- Events + RSVP (Phase 3), tournaments/brackets (Phase 4), messaging (Phase 5).
- Avatar uploads (column exists; upload UI lands in the polish phase).
- Realtime subscriptions (first needed by brackets/chat).
- Real branding (tokens are ready for the swap).
