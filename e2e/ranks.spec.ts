import { expect, test } from "@playwright/test";
import { cleanupTracked, serviceClient } from "./cleanup";
import { logIn, onTrail, privateSchool, userMaker } from "./private-school";

test.afterEach(cleanupTracked);

// Spec 2026-10-21-play-and-progress §7: the ladder reads at a glance. The test
// users live in a school with no approved real members, so the club never
// sees them. Text is looked up inside the visible main landmark (a production
// build can leave a hidden copy of the page body, ledger R12).
test("the leaderboard shows placing, movement and a plain Schools tab", async ({ page }) => {
  test.setTimeout(180_000);
  const stamp = Date.now();
  const service = serviceClient();

  const schoolId = await privateSchool(service);
  const makeUser = userMaker(service, schoolId, "Ranks", stamp);
  const a = await makeUser("A");
  const b = await makeUser("B");

  await logIn(page, a.email);
  const main = page.getByRole("main");
  // A's row, whichever group it sits in (the whole row is one link).
  const row = main.getByRole("link", { name: a.name });

  // No game yet: A waits under "Not placed yet", with no star, no "this wk"
  // and no dimming on the own row.
  await page.goto("/leaderboard?tab=players");
  await onTrail(page, "/leaderboard?tab=players");
  const unplaced = main.getByRole("list", { name: "Not placed yet" });
  await expect(unplaced.getByRole("link", { name: a.name })).toBeVisible();
  await expect(row).not.toContainText("*");
  await expect(row).not.toContainText("this wk");
  await expect(row).not.toHaveClass(/opacity-60/);
  await expect(main.getByText("* provisional")).toHaveCount(0);

  // B logs a game A wins (the row reportMatch writes), dated today in club
  // time, waiting on A; A confirms it on Home.
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

  await page.goto("/");
  await onTrail(page, "/");
  await main.getByRole("button", { name: "Confirm", exact: true }).click();
  // The result screen covers Home until dismissed.
  const screen = page.getByRole("dialog", { name: "Latest result" });
  await expect(screen).toBeVisible({ timeout: 20_000 });
  await screen.getByRole("button", { name: "Done" }).click();
  await expect(screen).toHaveCount(0);

  // One game in: placed, still placing, and up on the week.
  await page.goto("/leaderboard?tab=players");
  await expect(row).toBeVisible();
  await expect(row).toContainText("placing 1/10");
  await expect(row).toContainText("▲");
  await expect(row).not.toContainText("*");
  await expect(row).not.toContainText("this wk");
  await expect(main.getByRole("list", { name: "Not placed yet" }).getByRole("link", { name: a.name })).toHaveCount(0);

  // The Schools tab names the schools with no members in one line, only when
  // there are any.
  const { data: empty } = await service.from("school_stats").select("short_name").eq("member_count", 0);
  await page.goto("/leaderboard?tab=schools");
  await expect(main.getByRole("list", { name: "School standings" })).toBeVisible();
  if ((empty ?? []).length > 0) {
    await expect(main.getByText(/^Not here yet:/)).toBeVisible();
    await expect(main.getByRole("link", { name: "Invite", exact: true })).toHaveAttribute("href", "/install/card");
  } else {
    await expect(main.getByText(/Not here yet:/)).toHaveCount(0);
  }
});
