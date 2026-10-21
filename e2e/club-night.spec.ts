import { expect, test } from "@playwright/test";
import { cleanupTracked, serviceClient } from "./cleanup";
import { logIn, onTrail, privateSchool, userMaker } from "./private-school";

test.afterEach(cleanupTracked);

// Spec 2026-10-20-club-night: a night with one table — two members get in
// line, both are called (the first keeps score), a counted result frees the
// table, and the night ends. The test users live in a school with no
// approved real members, so the club never sees this night.
test("a club night calls the line to the table and frees it on the result", async ({ browser }) => {
  test.setTimeout(180_000);
  const stamp = Date.now();
  const service = serviceClient();

  const schoolId = await privateSchool(service, { noOpenNight: true });
  const makeUser = userMaker(service, schoolId, "Night", stamp);
  const a = await makeUser("A");
  const b = await makeUser("B");

  // A starts a one-table night and gets in line.
  const pageA = await (await browser.newContext()).newPage();
  await logIn(pageA, a.email);
  await pageA.goto("/night");
  await onTrail(pageA, "/night");
  // The page body streams in after the layout hydrates; wait for it to show.
  await expect(pageA.getByRole("button", { name: "Start club night" })).toBeVisible();
  await pageA.getByLabel("1 table").check({ force: true });
  await expect(pageA.getByLabel("1 table")).toBeChecked();
  await pageA.getByRole("button", { name: "Start club night" }).click();
  await pageA.getByRole("button", { name: "Get in line" }).click();
  await expect(pageA.getByText("You're next in line")).toBeVisible();

  // B joins from Home: both are called; A was first, so A keeps score.
  const pageB = await (await browser.newContext()).newPage();
  await logIn(pageB, b.email);
  await pageB.getByRole("button", { name: "Get in line" }).click();
  await expect(pageB.getByText(/E2E keeps score/)).toBeVisible();
  await expect(pageB.getByRole("link", { name: "Watch the table" })).toBeVisible();

  await pageA.goto("/night");
  await onTrail(pageA, "/night");
  await expect(pageA.getByText(/You're up on table 1/).first()).toBeVisible();
  await pageA.getByRole("link", { name: "Start game" }).first().click();
  await expect(pageA).toHaveURL(new RegExp(`/matches/new\\?opponent=${b.id}`));
  await expect(pageA.getByRole("button", { name: new RegExp(b.name) }).first()).toBeVisible();

  // A counts a 3–1 win on the spot: the table frees.
  await pageA.getByLabel("Race to 3").check({ force: true });
  const fewer = pageA.getByRole("button", { name: "Fewer games on the wire" });
  while (await fewer.isEnabled()) await fewer.click();
  await pageA.getByRole("button", { name: /^Increase E2E score/ }).click();
  for (let i = 0; i < 3; i++) await pageA.getByRole("button", { name: /^Increase You score/ }).click();
  await pageA.getByRole("button", { name: "We agreed — count it" }).click();
  await expect(pageA.getByText(/Counted — ratings updated/)).toBeVisible({ timeout: 20_000 });

  await pageA.goto("/night");
  await onTrail(pageA, "/night");
  // Scoped to the page's main landmark: a bare text match also counts the
  // hidden streamed copy of the body, so it can briefly match twice.
  const nightMain = pageA.getByRole("main").filter({ hasText: "Club night" });
  await expect(nightMain.getByText("Free", { exact: true })).toBeVisible();
  await expect(nightMain.getByText("Nobody in line.")).toBeVisible();

  // A started it, so A ends it.
  pageA.once("dialog", (d) => void d.accept());
  await pageA.getByRole("button", { name: "End club night" }).click();
  await expect(pageA.getByRole("button", { name: "Start club night" })).toBeVisible();
});
