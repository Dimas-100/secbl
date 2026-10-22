import { expect, test, type Page } from "@playwright/test";
import { cleanupTracked, serviceClient } from "./cleanup";
import { PASSWORD, logIn, privateSchool, userMaker } from "./private-school";

test.afterEach(cleanupTracked);

// Spec 2026-10-21-play-and-progress §3, "Rematch and the duplicate check": a
// board opened by Rematch ignores games created before it opened, so the
// same-day rematch goes straight in; a board opened without it still flags
// the first game; and two reports of the rematch itself (both created after
// the boards opened) are still caught, the 2026-10-15 double count. The users
// live in a school with no approved real members and no open club night, so
// the result screen offers Rematch (a night would make it Back in line).
test("a same-day rematch is not a duplicate, but two reports of it still are", async ({ browser }) => {
  test.setTimeout(180_000);
  const stamp = Date.now();
  const service = serviceClient();
  const schoolId = await privateSchool(service, { noOpenNight: true });
  const makeUser = userMaker(service, schoolId, "Rematch", stamp);
  const a = await makeUser("A");
  const b = await makeUser("B");

  // Even out whatever spot the ratings suggest, then play the race to 3 out:
  // the loser's games first, since the board locks once the winner gets there.
  async function playEven(page: Page, you: number, them: number) {
    const fewer = page.getByRole("button", { name: "Fewer games on the wire" });
    while (await fewer.isEnabled()) await fewer.click();
    const taps = [
      { side: /^Increase You score/, n: you },
      { side: /^Increase E2E score/, n: them },
    ].sort((x, y) => x.n - y.n);
    for (const { side, n } of taps) {
      for (let i = 0; i < n; i++) await page.getByRole("button", { name: side }).click();
    }
  }

  // A counts the first game on the spot: its screen opens over Home with
  // Rematch for the same opponent, game and race.
  const pageA = await (await browser.newContext()).newPage();
  await logIn(pageA, a.email);
  await pageA.goto(`/matches/new?opponent=${b.id}`);
  await pageA.getByLabel("Race to 3").check({ force: true });
  await playEven(pageA, 3, 1);
  await pageA.getByRole("button", { name: "We agreed — count it" }).click();
  await expect(pageA.getByText(/Counted — ratings updated/)).toBeVisible({ timeout: 20_000 });
  const screenA = pageA.getByRole("dialog", { name: "Latest result" });
  const rematch = `/matches/new?opponent=${b.id}&game=8ball&race=3&rematch=1`;
  await expect(screenA.getByRole("link", { name: "Rematch" })).toHaveAttribute("href", rematch);
  await screenA.getByRole("button", { name: "Done" }).click();
  await expect(screenA).toHaveCount(0);

  // Control: a board opened without rematch=1 still flags the first game.
  await pageA.goto(`/matches/new?opponent=${b.id}`);
  await pageA.getByLabel("Race to 3").check({ force: true });
  await playEven(pageA, 3, 0);
  await pageA.getByRole("button", { name: /Send to E2E to confirm/ }).click();
  await expect(pageA.getByText("You and E2E already have a game today")).toBeVisible({ timeout: 20_000 });
  await pageA.getByRole("button", { name: "Cancel" }).click();
  await pageA.getByRole("button", { name: "Clear" }).click();

  // B opens Rematch from their own screen before the rematch is played.
  const pageB = await (await browser.newContext()).newPage();
  await pageB.goto("/login");
  await pageB.fill('input[name="email"]', b.email);
  await pageB.fill('input[name="password"]', PASSWORD);
  await Promise.all([
    pageB.waitForURL((u) => !u.pathname.startsWith("/login")),
    pageB.click('button[type="submit"]'),
  ]);
  const screenB = pageB.getByRole("dialog", { name: "Latest result" });
  await expect(screenB.getByRole("heading", { name: "E2E beat you 3–1" })).toBeVisible();
  await screenB.getByRole("link", { name: "Rematch" }).click();
  await expect(pageB).toHaveURL((u) => u.pathname === "/matches/new" && u.searchParams.get("rematch") === "1");
  await expect(pageB.getByRole("main").getByRole("heading", { name: "vs E2E" })).toBeVisible();
  await expect(pageB.locator('input[name="since"]')).not.toHaveValue("");

  // A's Rematch board: the same game and race, and its send goes straight in.
  await pageA.goto(rematch);
  await expect(pageA.getByRole("main").getByRole("heading", { name: "vs E2E" })).toBeVisible();
  await expect(pageA.locator('input[name="game_type"]')).toHaveValue("8ball");
  await expect(pageA.locator('input[name="race_to"]')).toHaveValue("3");
  await playEven(pageA, 3, 0);
  await pageA.getByRole("button", { name: /Send to E2E to confirm/ }).click();
  await expect(pageA.getByText(/waiting on your opponent/i)).toBeVisible({ timeout: 20_000 });

  // B logs the same rematch: A's report is offered, not a second game.
  await playEven(pageB, 0, 3);
  await pageB.getByRole("button", { name: /Send to E2E to confirm/ }).click();
  await expect(pageB.getByText("E2E already logged this game")).toBeVisible({ timeout: 20_000 });
  await expect(pageB.getByText("E2E won 3–0 today — waiting on you.")).toBeVisible();
  await pageB.getByRole("button", { name: "Confirm E2E's result" }).click();
  await expect(pageB.getByText(/ratings updated/i)).toBeVisible({ timeout: 20_000 });

  // Two games between them today, each counted once; the control wrote nothing.
  const pair = `and(reporter_id.eq.${a.id},opponent_id.eq.${b.id}),and(reporter_id.eq.${b.id},opponent_id.eq.${a.id})`;
  const { data: games } = await service
    .from("matches")
    .select("reporter_id, status, reporter_score, opponent_score")
    .or(pair)
    .order("created_at");
  expect(games).toEqual([
    { reporter_id: a.id, status: "confirmed", reporter_score: 3, opponent_score: 1 },
    { reporter_id: a.id, status: "confirmed", reporter_score: 3, opponent_score: 0 },
  ]);
});
