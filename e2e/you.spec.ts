import { expect, test } from "@playwright/test";
import { cleanupTracked, serviceClient } from "./cleanup";
import { logIn, onTrail, privateSchool, userMaker } from "./private-school";

test.afterEach(cleanupTracked);

// Spec 2026-10-21-play-and-progress §5–§6: your own page tells the story of
// your pool from match results, and someone else's page adds your record
// against them. The test users live in a school with no approved real
// members, so no real member's school lists them. The one game is confirmed
// on Home (the real confirmMatch path: ratings and history written, no live
// table), so while the test runs that game is visible league-wide (Ranks, the
// feed), as in report-race; cleanupTracked removes it with the users. Play
// links are checked by their href, never clicked.
test("the You page shows your progress; someone else's page shows you vs them", async ({ page }) => {
  test.setTimeout(180_000);
  const stamp = Date.now();
  const service = serviceClient();

  const schoolId = await privateSchool(service);
  const makeUser = userMaker(service, schoolId, "You", stamp);
  const a = await makeUser("A");
  const b = await makeUser("B");

  await logIn(page, a.email);
  // Production builds can leave a hidden copy of the page body (ledger R12),
  // so text is looked up inside the visible main landmark.
  const main = page.getByRole("main");

  // No games yet: no rating, no splits or rivals, and the level sits above
  // the achievements.
  await page.goto(`/players/${a.id}`);
  await onTrail(page, `/players/${a.id}`);
  await expect(main.getByText("Your rating appears after your first game.")).toBeVisible();
  await expect(main.getByRole("heading", { name: "Where you win" })).toHaveCount(0);
  await expect(main.getByRole("heading", { name: "Rivals" })).toHaveCount(0);
  await expect(main.getByRole("heading", { name: "Form" })).toHaveCount(0);
  await expect(main.getByRole("img", { name: /^Rating chart/ })).toHaveCount(0);
  const levelRow = main.getByRole("link", { name: /^Level 1,/ });
  const achievements = main.getByRole("heading", { name: "Achievements" });
  await expect(levelRow).toBeVisible();
  const levelBox = await levelRow.boundingBox();
  const achievementsBox = await achievements.boundingBox();
  expect(levelBox && achievementsBox).toBeTruthy();
  expect(levelBox!.y).toBeLessThan(achievementsBox!.y);

  // B logs a game A won 5–3 (the row reportMatch writes), dated today in
  // club time, waiting on A.
  const clubToday = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const { error: seedError } = await service.from("matches").insert({
    reporter_id: b.id,
    opponent_id: a.id,
    winner_id: a.id,
    reporter_score: 3,
    opponent_score: 5,
    game_type: "8ball",
    played_at: clubToday,
    race_to: 5,
    spot: 0,
    spot_to: null,
    status: "pending",
  });
  expect(seedError).toBeNull();

  // A confirms it on Home.
  await page.goto("/");
  await onTrail(page, "/");
  await main.getByRole("button", { name: "Confirm", exact: true }).click();
  // The game counts: A's first game, a win, says at most three true things in
  // priority order (on the board, the level it reached, the first achievement
  // it unlocked), then Done clears the screen off Home.
  const screen = page.getByRole("dialog", { name: "Latest result" });
  await expect(screen.getByRole("heading", { name: "You beat E2E 5–3" })).toBeVisible({ timeout: 20_000 });
  await expect(screen.getByText("Win", { exact: true })).toBeVisible();
  await expect(screen.getByText("+200 XP")).toBeVisible();
  await expect(screen.getByRole("listitem")).toHaveText([/^On the board at #\d+$/, "Level 2", "First win unlocked"]);
  await screen.getByRole("button", { name: "Done" }).click();
  await expect(screen).toHaveCount(0);
  await expect(main.getByText("Match confirmed — ratings updated.")).toBeVisible({ timeout: 20_000 });
  const { data: confirmed } = await service.from("matches").select("status").eq("reporter_id", b.id).single();
  expect(confirmed?.status).toBe("confirmed");

  // A's page: the rating with its placement, the form, where you win, the
  // rival and the month in one sentence.
  await page.goto(`/players/${a.id}`);
  await onTrail(page, `/players/${a.id}`);
  const rating = main.getByRole("region", { name: "Rating", exact: true });
  await expect(rating).toBeVisible();
  await expect(rating.getByText("placing 1/10")).toBeVisible();
  await expect(main.getByText("Your rating appears after your first game.")).toHaveCount(0);
  await expect(
    main.getByRole("region", { name: "Form", exact: true }).getByText("won 1 of your last 1")
  ).toBeVisible();
  const where = main.getByRole("region", { name: "Where you win" });
  await expect(where.getByText("8-ball", { exact: true })).toBeVisible();
  await expect(where.getByText("1–0", { exact: true })).toBeVisible();
  const rivals = main.getByRole("region", { name: "Rivals", exact: true });
  await expect(rivals.getByRole("link", { name: new RegExp(b.name) })).toHaveAttribute("href", `/players/${b.id}`);
  const month = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "long" }).format(new Date());
  // The month card reads as one sentence; its lead is the card's eyebrow. A
  // was unranked when the month began and holds a rank now (both ends
  // replayed from the club's games).
  await expect(
    main.getByText(new RegExp(`^${month} so far: 1 game, 1 win\\. You're on the board at #\\d+\\.$`))
  ).toBeVisible();

  // On a phone the range picker sits below the fold: switching range keeps
  // the page where it is (Next scrolls to the top of <main> otherwise). Month
  // is never the default range, so the tap always changes the URL.
  await page.setViewportSize({ width: 390, height: 844 });
  const picker = main.getByRole("navigation", { name: "Rating chart range" });
  await picker.evaluate((el) => el.scrollIntoView({ block: "center" }));
  const before = await page.evaluate(() => window.scrollY);
  expect(before).toBeGreaterThan(100);
  await picker.getByRole("link", { name: "Month", exact: true }).click();
  await expect(page).toHaveURL(/[?&]range=month\b/);
  await expect(picker.getByRole("link", { name: "Month", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(main.getByRole("img", { name: /^Rating chart, this month: / })).toBeVisible();
  // A scroll to the top would land in the same commit as the new range; give
  // it a beat before measuring.
  await page.waitForTimeout(500);
  const after = await page.evaluate(() => window.scrollY);
  expect(after).toBeGreaterThan(0);
  expect(Math.abs(after - before)).toBeLessThan(80);

  // B's page, seen by A: Play B (by its href), the record between them, and
  // no month sentence (that is only ever yours).
  await page.goto(`/players/${b.id}`);
  await onTrail(page, `/players/${b.id}`);
  await expect(main.getByRole("link", { name: "Play E2E", exact: true })).toHaveAttribute(
    "href",
    `/matches/new?opponent=${b.id}`
  );
  await expect(main.getByRole("button", { name: "Message" })).toBeVisible();
  const versus = main.getByRole("region", { name: "You vs E2E" });
  await expect(versus).toContainText("1 – 0");
  await expect(versus).toContainText("Last played today");
  await expect(main.getByText(/ so far: /)).toHaveCount(0);
  await expect(main.getByText(/^No games yet in /)).toHaveCount(0);
  await expect(
    main.getByRole("region", { name: "Form", exact: true }).getByText("won 0 of their last 1")
  ).toBeVisible();
  await expect(main.getByRole("heading", { name: "Where E2E wins" })).toBeVisible();

  // Spec §9: a deep link (a fresh tab, no in-app history), a range switch (a
  // replace, not a new entry), then Back: it follows the fallback to the
  // leaderboard and never leaves the app.
  const fresh = await page.context().newPage();
  const freshMain = fresh.getByRole("main");
  await fresh.goto(`/players/${b.id}`);
  await onTrail(fresh, `/players/${b.id}`);
  await freshMain
    .getByRole("navigation", { name: "Rating chart range" })
    .getByRole("link", { name: "Month", exact: true })
    .click();
  await expect(fresh).toHaveURL(/[?&]range=month\b/);
  await onTrail(fresh, `/players/${b.id}?range=month`);
  await freshMain.getByRole("link", { name: "Back", exact: true }).click();
  await expect(fresh).toHaveURL((u) => u.pathname === "/leaderboard", { timeout: 15_000 });
  await expect(fresh.getByRole("navigation", { name: "Main" })).toBeVisible();
  await fresh.close();
});
