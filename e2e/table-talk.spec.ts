import { expect, test, type Page } from "@playwright/test";
import { cleanupTracked, serviceClient, trackUser } from "./cleanup";

test.afterEach(cleanupTracked);

const PASSWORD = "e2e-password-123!";

// Spec 2026-10-20-table-talk: a spectator types to a live game, the
// scorekeeper sees it on the board, and the talk ends with the game.
test("a spectator talks to a live table and the talk ends with the game", async ({ browser }) => {
  test.setTimeout(150_000);
  const stamp = Date.now();
  const service = serviceClient();
  const { data: school } = await service.from("schools").select("id").limit(1).single();

  async function makeUser(tag: string) {
    const email = `e2e-talk-${tag}-${stamp}@example.com`;
    const name = `E2E Talk ${tag} ${stamp}`;
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
  const c = await makeUser("C");

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

  // A starts a board against B: the table goes live.
  const pageA = await (await browser.newContext()).newPage();
  await logIn(pageA, a.email);
  await pageA.goto("/matches/new");
  await pageA.getByRole("button", { name: "Search players" }).click();
  await pageA.getByLabel("Search members").fill(b.name);
  await pageA.getByRole("button", { name: new RegExp(b.name) }).click();
  await expect
    .poll(async () => (await service.from("live_games").select("id").eq("reporter_id", a.id)).data?.length ?? 0, {
      timeout: 15_000,
    })
    .toBe(1);
  const { data: game } = await service.from("live_games").select("id").eq("reporter_id", a.id).single();

  // C watches from Home and says something.
  const pageC = await (await browser.newContext()).newPage();
  await logIn(pageC, c.email);
  await pageC.locator(`a[href="/live/${a.id}"]`).click();
  await expect(pageC).toHaveURL(new RegExp(`/live/${a.id}$`));

  // Pool-hall signal: the first send never reaches the server. The composer
  // says so and keeps the draft; the retry goes through, once.
  let dropped = false;
  await pageC.route("**/live/**", async (route) => {
    const req = route.request();
    if (!dropped && req.method() === "POST" && (await req.headerValue("next-action"))) {
      dropped = true;
      await route.abort();
    } else {
      await route.continue();
    }
  });
  await pageC.getByLabel("Say something to the table").fill("Nice shot");
  await pageC.getByRole("button", { name: "Send comment" }).click();
  await expect(pageC.getByText("Couldn't send — try again.")).toBeVisible();
  await expect(pageC.getByLabel("Say something to the table")).toHaveValue("Nice shot");
  await pageC.unroute("**/live/**");
  await pageC.getByRole("button", { name: "Send comment" }).click();
  await expect(pageC.getByText("Nice shot", { exact: true })).toHaveCount(1);
  await expect(pageC.getByText("Couldn't send — try again.")).toHaveCount(0);

  // The scorekeeper sees it on the board, and can open the thread.
  await expect(pageA.getByRole("button", { name: /Table talk/ })).toBeVisible({ timeout: 15_000 });
  await expect(pageA.getByText(/Nice shot/)).toBeVisible();
  await pageA.getByRole("button", { name: /Table talk/ }).click();
  await expect(pageA.getByRole("dialog").getByText("Nice shot")).toBeVisible();
  await pageA.keyboard.press("Escape");

  // Clearing the board ends the game and its talk.
  await pageA.getByRole("button", { name: "Clear" }).click();
  await expect(pageC.getByText("This game is over.")).toBeVisible({ timeout: 15_000 });
  const { count } = await service
    .from("live_comments")
    .select("id", { count: "exact", head: true })
    .eq("game_id", game!.id);
  expect(count).toBe(0);
});
