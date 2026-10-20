import { expect, test, type Page } from "@playwright/test";
import { cleanupTracked, serviceClient, trackUser } from "./cleanup";

test.afterEach(cleanupTracked);

const PASSWORD = "e2e-password-123!";

// Spec 2026-10-20-club-night: a night with one table — two members get in
// line, both are called (the first keeps score), a counted result frees the
// table, and the night ends. The test users live in a school with no
// approved real members, so the club never sees this night.
test("a club night calls the line to the table and frees it on the result", async ({ browser }) => {
  test.setTimeout(180_000);
  const stamp = Date.now();
  const service = serviceClient();

  const { data: schools } = await service.from("schools").select("id");
  let schoolId: string | null = null;
  for (const s of schools ?? []) {
    const { count } = await service
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("school_id", s.id)
      .eq("status", "approved");
    if (count === 0) {
      schoolId = s.id;
      break;
    }
  }
  test.skip(!schoolId, "every school has a real member — no private school to test in");
  const { count: open } = await service
    .from("club_nights")
    .select("id", { count: "exact", head: true })
    .eq("school_id", schoolId!)
    .is("closed_at", null);
  test.skip((open ?? 0) > 0, "a night is already open in the test school");

  async function makeUser(tag: string) {
    const email = `e2e-night-${tag}-${stamp}@example.com`;
    const name = `E2E Night ${tag} ${stamp}`;
    const { data, error } = await service.auth.admin.createUser({
      email,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { display_name: name, school_id: schoolId },
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

  // A starts a one-table night and gets in line.
  const pageA = await (await browser.newContext()).newPage();
  await logIn(pageA, a.email);
  await pageA.goto("/night");
  await pageA.getByLabel("1 table").check({ force: true });
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
  await expect(pageA.getByText("Free", { exact: true })).toBeVisible();
  await expect(pageA.getByText("Nobody in line.")).toBeVisible();

  // A started it, so A ends it.
  pageA.once("dialog", (d) => void d.accept());
  await pageA.getByRole("button", { name: "End club night" }).click();
  await expect(pageA.getByRole("button", { name: "Start club night" })).toBeVisible();
});
