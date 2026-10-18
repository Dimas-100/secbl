import { expect, test, type Page } from "@playwright/test";
import { cleanupTracked, serviceClient, trackUser } from "./cleanup";

test.afterEach(cleanupTracked);

const PASSWORD = "e2e-password-123!";

// The 2026-10-15 incident: both players logged the same race. The second
// reporter is shown the first report and confirms it instead, so the game
// counts once; a real second game the same day still goes in on purpose.
test("logging a game the opponent already logged offers to confirm theirs", async ({ browser }) => {
  test.setTimeout(120_000);
  const stamp = Date.now();
  const service = serviceClient();
  const { data: school } = await service.from("schools").select("id").limit(1).single();

  async function makeUser(tag: string) {
    const email = `e2e-dup-${tag}-${stamp}@example.com`;
    const name = `E2E Dup ${tag} ${stamp}`;
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

  // An even race to 3 against `opponent`, ending you–them.
  async function logRace(page: Page, opponent: string, you: number, them: number) {
    await page.goto("/matches/new");
    await page.getByRole("button", { name: "Search players" }).click();
    await page.getByLabel("Search members").fill(opponent);
    await page.getByRole("button", { name: new RegExp(opponent) }).click();
    await page.getByLabel("Race to 3").check({ force: true });
    // After the first result the ratings differ and a spot is suggested.
    const fewer = page.getByRole("button", { name: "Fewer games on the wire" });
    while (await fewer.isEnabled()) await fewer.click();
    // The loser's games first: the board locks once the winner reaches the race.
    const taps = [
      { side: /^Increase You score/, n: you },
      { side: /^Increase E2E score/, n: them },
    ].sort((x, y) => x.n - y.n);
    for (const { side, n } of taps) {
      for (let i = 0; i < n; i++) await page.getByRole("button", { name: side }).click();
    }
    await page.getByRole("button", { name: /Send to E2E to confirm/ }).click();
  }

  const pageA = await (await browser.newContext()).newPage();
  await logIn(pageA, a.email);
  await logRace(pageA, b.name, 3, 1);
  await expect(pageA.getByText(/waiting on your opponent/i)).toBeVisible({ timeout: 20_000 });

  // B logs the same game: nothing is written, A's report is offered instead.
  const pageB = await (await browser.newContext()).newPage();
  await logIn(pageB, b.email);
  await logRace(pageB, a.name, 1, 3);
  await expect(pageB.getByText("E2E already logged this game")).toBeVisible();
  await expect(pageB.getByText("E2E won 3–1 today — waiting on you.")).toBeVisible();
  await pageB.getByRole("button", { name: "Confirm E2E's result" }).click();
  await expect(pageB.getByText(/ratings updated/i)).toBeVisible({ timeout: 20_000 });

  const pair = `and(reporter_id.eq.${a.id},opponent_id.eq.${b.id}),and(reporter_id.eq.${b.id},opponent_id.eq.${a.id})`;
  const { data: once } = await service.from("matches").select("reporter_id, status").or(pair);
  expect(once).toEqual([{ reporter_id: a.id, status: "confirmed" }]);
  const { count: live } = await service
    .from("live_games")
    .select("reporter_id", { count: "exact", head: true })
    .eq("reporter_id", b.id);
  expect(live).toBe(0);

  // A rematch the same night is a new game, logged on purpose.
  await logRace(pageB, a.name, 3, 0);
  await expect(pageB.getByText("You and E2E already have a game today")).toBeVisible();
  await pageB.getByRole("button", { name: "Log as a new game" }).click();
  await expect(pageB.getByText(/waiting on your opponent/i)).toBeVisible({ timeout: 20_000 });

  const { data: twice } = await service.from("matches").select("reporter_id, status").or(pair).order("created_at");
  expect(twice).toEqual([
    { reporter_id: a.id, status: "confirmed" },
    { reporter_id: b.id, status: "pending" },
  ]);
});
