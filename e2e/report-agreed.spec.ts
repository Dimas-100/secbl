import { expect, test, type Page } from "@playwright/test";
import { cleanupTracked, serviceClient, trackUser } from "./cleanup";

test.afterEach(cleanupTracked);

const PASSWORD = "e2e-password-123!";

// Spec 2026-10-20-agreed-results: the scorekeeper counts a game on the spot,
// and the opponent can take it back out within a day.
test("a game counted on the spot moves the ladder, and the opponent can flag it", async ({ browser }) => {
  test.setTimeout(150_000);
  const stamp = Date.now();
  const service = serviceClient();
  const { data: school } = await service.from("schools").select("id").limit(1).single();

  async function makeUser(tag: string) {
    const email = `e2e-agree-${tag}-${stamp}@example.com`;
    const name = `E2E Agree ${tag} ${stamp}`;
    const { data, error } = await service.auth.admin.createUser({
      email,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { display_name: name, school_id: school!.id },
    });
    if (error) throw error;
    trackUser(data.user!.id);
    await service.from("profiles").update({ status: "approved", rating: 450 }).eq("id", data.user!.id);
    return { id: data.user!.id, email, name };
  }
  const a = await makeUser("A");
  const b = await makeUser("B");

  // `result`: a game of theirs counted since they last looked, so its screen
  // opens over Home (and hides the page from the accessibility tree) until
  // Done clears it.
  async function logIn(page: Page, email: string, result?: string) {
    await page.goto("/login");
    await page.fill('input[name="email"]', email);
    await page.fill('input[name="password"]', PASSWORD);
    await Promise.all([
      page.waitForURL((u) => !u.pathname.startsWith("/login")),
      page.click('button[type="submit"]'),
    ]);
    if (result) {
      const screen = page.getByRole("dialog", { name: "Latest result" });
      await expect(screen.getByRole("heading", { name: result })).toBeVisible();
      await screen.getByRole("button", { name: "Done" }).click();
      await expect(screen).toHaveCount(0);
    }
    await expect(page.getByRole("heading", { name: /^recent$/i })).toBeVisible();
  }

  // An even race to 3 against `opponent`, ending you–them, counted on the spot.
  async function countRace(page: Page, opponent: string, you: number, them: number) {
    await page.goto("/matches/new");
    await page.getByRole("button", { name: "Search players" }).click();
    await page.getByLabel("Search members").fill(opponent);
    await page.getByRole("button", { name: new RegExp(opponent) }).click();
    await page.getByLabel("Race to 3").check({ force: true });
    const fewer = page.getByRole("button", { name: "Fewer games on the wire" });
    while (await fewer.isEnabled()) await fewer.click();
    const taps = [
      { side: /^Increase You score/, n: you },
      { side: /^Increase E2E score/, n: them },
    ].sort((x, y) => x.n - y.n);
    for (const { side, n } of taps) {
      for (let i = 0; i < n; i++) await page.getByRole("button", { name: side }).click();
    }
    await page.getByRole("button", { name: "We agreed — count it" }).click();
  }

  const pair = `and(reporter_id.eq.${a.id},opponent_id.eq.${b.id}),and(reporter_id.eq.${b.id},opponent_id.eq.${a.id})`;
  const ratings = async () => {
    const { data } = await service.from("profiles").select("id, rating, matches_played").in("id", [a.id, b.id]);
    return Object.fromEntries((data ?? []).map((p) => [p.id, p]));
  };

  // A counts a 3–1 win: confirmed at once, no tap from B.
  const pageA = await (await browser.newContext()).newPage();
  await logIn(pageA, a.email);
  await countRace(pageA, b.name, 3, 1);
  await expect(pageA.getByText(/Counted — ratings updated/)).toBeVisible({ timeout: 20_000 });
  // Counting it lands on Home with the game's screen open at once.
  await expect(
    pageA.getByRole("dialog", { name: "Latest result" }).getByRole("heading", { name: "You beat E2E 3–1" })
  ).toBeVisible();
  const { data: counted } = await service.from("matches").select("id, status, agreed_at").or(pair);
  expect(counted).toHaveLength(1);
  expect(counted![0].status).toBe("confirmed");
  expect(counted![0].agreed_at).not.toBeNull();
  const moved = await ratings();
  expect(moved[a.id].rating).toBeGreaterThan(450);
  expect(moved[b.id].rating).toBeLessThan(450);

  // B says it's wrong: out of the ladder, into the admin's disputes. The game
  // already counted, so B's Home opens on its screen; Done clears it first.
  const pageB = await (await browser.newContext()).newPage();
  await logIn(pageB, b.email, "E2E beat you 3–1");
  await expect(pageB.getByRole("heading", { name: "Logged for you" })).toBeVisible();
  await expect(pageB.getByText(/beat you/)).toBeVisible();
  await pageB.getByRole("button", { name: "Not right?" }).click();
  await expect(pageB.getByText(/Taken out of the ratings/)).toBeVisible({ timeout: 20_000 });
  const { data: flagged } = await service.from("matches").select("status, agreed_at").eq("id", counted![0].id).single();
  expect(flagged).toEqual({ status: "disputed", agreed_at: null });
  const back = await ratings();
  expect([back[a.id].rating, back[b.id].rating]).toEqual([450, 450]);
  expect([back[a.id].matches_played, back[b.id].matches_played]).toEqual([0, 0]);
  const { count: feedRows } = await service
    .from("activity")
    .select("id", { count: "exact", head: true })
    .eq("match_id", counted![0].id);
  expect(feedRows).toBe(0);

  // A disputed game is not a duplicate, so the next one counts straight away;
  // the one after it hits the duplicate notice, and logging it as a new game
  // still counts it on the spot (the choice survives the notice).
  await countRace(pageA, b.name, 3, 0);
  await expect(pageA.getByText(/Counted — ratings updated/)).toBeVisible({ timeout: 20_000 });
  await countRace(pageA, b.name, 3, 2);
  await expect(pageA.getByText("You and E2E already have a game today")).toBeVisible();
  await pageA.getByRole("button", { name: "Log as a new game" }).click();
  await expect(pageA.getByText(/Counted — ratings updated/)).toBeVisible({ timeout: 20_000 });
  const { data: later } = await service.from("matches").select("status, agreed_at").or(pair).eq("status", "confirmed");
  expect(later).toHaveLength(2);
  expect(later!.every((m) => m.agreed_at !== null)).toBe(true);
});
