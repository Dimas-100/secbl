import { expect, test, type Page } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cleanupTracked, serviceClient } from "./cleanup";
import { PASSWORD, logIn, privateSchool, userMaker, type TestUser } from "./private-school";

test.afterEach(cleanupTracked);

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

// A counts the first game (3–1 over B) on the spot. Its screen opens over Home
// with Rematch for the same opponent, game and race, carrying the counted
// game's id (ruling S4-R6). Returns that game and the Rematch link.
async function countFirstGame(page: Page, service: SupabaseClient, a: TestUser, b: TestUser) {
  await page.goto(`/matches/new?opponent=${b.id}`);
  await page.getByLabel("Race to 3").check({ force: true });
  await playEven(page, 3, 1);
  await page.getByRole("button", { name: "We agreed — count it" }).click();
  await expect(page.getByText(/Counted — ratings updated/)).toBeVisible({ timeout: 20_000 });
  const { data: game } = await service
    .from("matches")
    .select("id, created_at")
    .eq("reporter_id", a.id)
    .eq("status", "confirmed")
    .single();
  const rematch = `/matches/new?opponent=${b.id}&game=8ball&race=3&rematch=1&after=${game!.id}`;
  const screen = page.getByRole("dialog", { name: "Latest result" });
  await expect(screen.getByRole("link", { name: "Rematch" })).toHaveAttribute("href", rematch);
  await screen.getByRole("button", { name: "Done" }).click();
  await expect(screen).toHaveCount(0);
  return { game: game as { id: string; created_at: string }, rematch };
}

// B signs in by hand: their result screen opens over Home, so logIn's wait
// for the Recent heading would not see it.
async function signInUnderScreen(page: Page, email: string) {
  await page.goto("/login");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', PASSWORD);
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/login")), page.click('button[type="submit"]')]);
}

// B follows Rematch from their own screen: the board for A, anchored to the
// first game.
async function openRematchFromScreen(page: Page, game: { id: string; created_at: string }) {
  const screen = page.getByRole("dialog", { name: "Latest result" });
  await expect(screen.getByRole("heading", { name: "E2E beat you 3–1" })).toBeVisible();
  await screen.getByRole("link", { name: "Rematch" }).click();
  await expect(page).toHaveURL(
    (u) => u.pathname === "/matches/new" && u.searchParams.get("rematch") === "1" && u.searchParams.get("after") === game.id
  );
  await expect(page.getByRole("main").getByRole("heading", { name: "vs E2E" })).toBeVisible();
  // The duplicate check starts at the first game, as the server read it.
  await expect(page.locator('input[name="since"]')).toHaveValue(game.created_at);
}

async function expectBothCountedOnce(service: SupabaseClient, a: TestUser, b: TestUser) {
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
}

// Spec 2026-10-21-play-and-progress §3, "Rematch and the duplicate check", and
// ruling S4-R6: a board opened by Rematch ignores the game it rematches (and
// anything logged before it), so the same-day rematch goes straight in; a
// board opened without it still flags the first game; and two reports of the
// rematch itself (both created after the first game) are still caught, the
// 2026-10-15 double count. The users live in a school with no approved real
// members and no open club night, so the result screen offers Rematch (a
// night would make it Back in line).
test("a same-day rematch is not a duplicate, but two reports of it still are", async ({ browser }) => {
  test.setTimeout(180_000);
  const stamp = Date.now();
  const service = serviceClient();
  const schoolId = await privateSchool(service, { noOpenNight: true });
  const makeUser = userMaker(service, schoolId, "Rematch", stamp);
  const a = await makeUser("A");
  const b = await makeUser("B");

  const pageA = await (await browser.newContext()).newPage();
  await logIn(pageA, a.email);
  const { game, rematch } = await countFirstGame(pageA, service, a, b);

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
  await signInUnderScreen(pageB, b.email);
  await openRematchFromScreen(pageB, game);

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
  await expectBothCountedOnce(service, a, b);
});

// Ruling S4-R6: the window is anchored to the rematched game, not to when the
// board opened, so a Rematch board opened AFTER the opponent already sent the
// rematch still finds their report (with the board's open time as the start,
// that report fell before it and the game counted twice).
test("a Rematch board opened after the opponent sent the rematch still finds their report", async ({ browser }) => {
  test.setTimeout(180_000);
  const stamp = Date.now();
  const service = serviceClient();
  const schoolId = await privateSchool(service, { noOpenNight: true });
  const makeUser = userMaker(service, schoolId, "Late", stamp);
  const a = await makeUser("A");
  const b = await makeUser("B");

  // A counts the first game, then sends the rematch from their Rematch board.
  const pageA = await (await browser.newContext()).newPage();
  await logIn(pageA, a.email);
  const { game, rematch } = await countFirstGame(pageA, service, a, b);
  await pageA.goto(rematch);
  await expect(pageA.getByRole("main").getByRole("heading", { name: "vs E2E" })).toBeVisible();
  await playEven(pageA, 3, 0);
  await pageA.getByRole("button", { name: /Send to E2E to confirm/ }).click();
  await expect(pageA.getByText(/waiting on your opponent/i)).toBeVisible({ timeout: 20_000 });

  // Only now does B open Rematch for the first game and log the same rematch.
  const pageB = await (await browser.newContext()).newPage();
  await signInUnderScreen(pageB, b.email);
  await openRematchFromScreen(pageB, game);
  await playEven(pageB, 0, 3);
  await pageB.getByRole("button", { name: /Send to E2E to confirm/ }).click();
  await expect(pageB.getByText("E2E already logged this game")).toBeVisible({ timeout: 20_000 });
  await expect(pageB.getByText("E2E won 3–0 today — waiting on you.")).toBeVisible();
  await pageB.getByRole("button", { name: "Confirm E2E's result" }).click();
  await expect(pageB.getByText(/ratings updated/i)).toBeVisible({ timeout: 20_000 });

  await expectBothCountedOnce(service, a, b);
});
