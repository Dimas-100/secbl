import { createClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";
import { cleanupTracked, serviceClient, trackSeasonName, trackUser } from "./cleanup";

test.afterEach(cleanupTracked);

const PASSWORD = "e2e-password-123!";
const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

// Seasons, the feed and Live now, end to end: a season opens, a member sees
// the strip and the feed row, a race in progress shows on another member's
// Home and vanishes on Clear, the confirmed result lands in the feed and the
// standings score it 3/1, and closing the season names the champion.
//
// The season is opened and closed through the RPCs as the test admin, not
// the Admin form: the form's action pushes a notification to every real
// member of the production project.
test("a season runs from open to champion with the feed and live now along the way", async ({ browser }) => {
  test.setTimeout(180_000);
  const stamp = Date.now();
  const service = serviceClient();
  const seasonName = `E2E Season ${stamp}`;
  trackSeasonName(seasonName);
  const { data: school } = await service.from("schools").select("id").limit(1).single();

  async function makeUser(tag: string, role: "admin" | "member", rating: number) {
    const email = `e2e-season-${tag.toLowerCase()}-${stamp}@example.com`;
    const { data, error } = await service.auth.admin.createUser({
      email,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { display_name: `E2E ${tag} ${stamp}`, school_id: school!.id },
    });
    if (error) throw error;
    trackUser(data.user!.id);
    await service.from("profiles").update({ role, status: "approved", rating }).eq("id", data.user!.id);
    return { id: data.user!.id, email, name: `E2E ${tag} ${stamp}` };
  }
  const admin = await makeUser("Admin", "admin", 500);
  const a = await makeUser("Alpha", "member", 500);
  const b = await makeUser("Bravo", "member", 500);

  // Production may already have a season running; then this flow is not ours to drive.
  const { data: open } = await service.from("seasons").select("id").eq("status", "open").maybeSingle();
  test.skip(!!open, "a real season is open");

  const asAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  const { error: signInErr } = await asAdmin.auth.signInWithPassword({ email: admin.email, password: PASSWORD });
  if (signInErr) throw signInErr;
  const { data: seasonId, error: openErr } = await asAdmin.rpc("open_season", {
    p_name: seasonName,
    p_starts_on: day(-1),
    p_ends_on: day(30),
  });
  if (openErr) throw openErr;

  async function logIn(page: Page, email: string) {
    await page.goto("/login");
    await page.fill('input[name="email"]', email);
    await page.fill('input[name="password"]', PASSWORD);
    await Promise.all([
      page.waitForURL((u) => !u.pathname.startsWith("/login")),
      page.click('button[type="submit"]'),
    ]);
    await expect(page.getByRole("heading", { name: /^recent$/i })).toBeVisible();
  }

  // Alpha: the season strip and the feed row.
  const ctxA = await browser.newContext();
  const pageA = await ctxA.newPage();
  await logIn(pageA, a.email);
  await expect(pageA.getByRole("link", { name: new RegExp(`${seasonName}.*No games yet`) })).toBeVisible();
  await expect(pageA.getByText(`${seasonName} has begun`)).toBeVisible();

  // Alpha starts a race to 3 against Bravo: Live now on Bravo's Home.
  await pageA.goto("/matches/new");
  await pageA.getByRole("button", { name: "Search players" }).click();
  await pageA.getByLabel("Search members").fill(`E2E Bravo ${stamp}`);
  await pageA.getByRole("button", { name: new RegExp(b.name) }).click();
  await pageA.getByLabel("Race to 3").check({ force: true });
  const inc = pageA.getByRole("button", { name: /^Increase You score/ });
  await inc.click();
  await inc.click();
  await expect(pageA.getByText("You need 1 · E2E needs 3")).toBeVisible();

  const ctxB = await browser.newContext();
  const pageB = await ctxB.newPage();
  await logIn(pageB, b.email);
  const liveCard = pageB.getByText("E2E vs You");
  await expect(liveCard).toBeVisible({ timeout: 15_000 });
  await expect(pageB.getByText("First to 3 · leader needs 1")).toBeVisible();

  // A locked phone: the draft is restored and republished.
  await pageA.reload();
  await expect(pageA.getByText("You need 1 · E2E needs 3")).toBeVisible();
  await pageB.reload();
  await expect(pageB.getByText("E2E vs You")).toBeVisible();

  // Clear takes the table off Home.
  await pageA.getByRole("button", { name: "Clear" }).click();
  await expect(pageA.getByText("You need 5 · Them needs 5")).toBeVisible();
  await expect
    .poll(
      async () => {
        await pageB.reload();
        return pageB.getByText("E2E vs You").count();
      },
      { timeout: 15_000 }
    )
    .toBe(0);

  // Play it out and send; Bravo confirms; the result is in the feed.
  await pageA.getByRole("button", { name: "Search players" }).click();
  await pageA.getByLabel("Search members").fill(`E2E Bravo ${stamp}`);
  await pageA.getByRole("button", { name: new RegExp(b.name) }).click();
  await pageA.getByLabel("Race to 3").check({ force: true });
  await inc.click();
  await inc.click();
  await inc.click();
  await expect(pageA.getByText("You win 3–0")).toBeVisible();
  await pageA.getByRole("button", { name: /Send to E2E to confirm/ }).click();
  await expect(pageA.getByText(/waiting on your opponent/i)).toBeVisible({ timeout: 20_000 });
  // The report took the table off Home.
  await pageB.reload();
  await expect(pageB.getByText("E2E vs You")).toHaveCount(0);

  await pageB.goto("/");
  await pageB.getByRole("button", { name: "Confirm" }).click();
  // A cold dev compile of the confirm path can take a while the first time.
  await expect(pageB.getByText(/ratings updated/i)).toBeVisible({ timeout: 20_000 });
  await expect(pageB.getByText("Lost 0–3", { exact: true })).toBeVisible();

  // Standings: 3 for the win, 1 for the loss.
  await pageB.goto("/leaderboard?tab=season");
  const standings = pageB.getByRole("list", { name: "Season standings" });
  await expect(standings.getByRole("link", { name: new RegExp(`1.*${a.name}.*1–0.*3 pts`) })).toBeVisible();
  await expect(standings.getByRole("link", { name: new RegExp(`${b.name}.*0–1.*1 pts`) })).toBeVisible();

  // The admin sees the season on Admin, with Alpha leading.
  const ctxAdmin = await browser.newContext();
  const pageAdmin = await ctxAdmin.newPage();
  await logIn(pageAdmin, admin.email);
  await pageAdmin.goto("/admin");
  await expect(pageAdmin.getByText(`${a.name} leads with 3 pts`)).toBeVisible();
  await expect(pageAdmin.getByRole("button", { name: "End season" })).toBeVisible();

  // Close it (RPC, see above): the feed names the champion; Past seasons lists it.
  const { error: closeErr } = await asAdmin.rpc("close_season", {
    p_season_id: seasonId,
    p_champion_id: a.id,
    p_today: day(0),
    p_podium: [{ id: a.id, points: 3 }, { id: b.id, points: 1 }],
  });
  if (closeErr) throw closeErr;
  await pageA.goto("/");
  await expect(pageA.getByText(`You are the ${seasonName} champion`)).toBeVisible();
  await pageB.goto("/leaderboard?tab=season");
  await expect(pageB.getByRole("heading", { name: "Past seasons" })).toBeVisible();
  await expect(pageB.getByRole("link", { name: new RegExp(`${seasonName}.*${a.name}`) })).toBeVisible();
  await pageB.getByRole("link", { name: new RegExp(`${seasonName}.*${a.name}`) }).click();
  await expect(pageB.getByText(`${a.name} · champion`)).toBeVisible();
});
