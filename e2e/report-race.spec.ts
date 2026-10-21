import { expect, test, type Page } from "@playwright/test";
import { cleanupTracked, serviceClient, trackUser } from "./cleanup";
import { privateSchool } from "./private-school";

test.afterEach(cleanupTracked);

const PASSWORD = "e2e-password-123!";

// The live scoreboard end to end: a stronger player logs a race to 3 giving
// one game on the wire, the rail locks at the finish, the weaker player sees
// the format on the confirm row and confirms, and the stored row carries the
// format with scores as the board showed them. The users live in a school
// with no approved real members and no open club night, so the result screen
// offers Rematch (a night would make it Back in line, ruling S4-R1).
test("a race to 3 with a one-game spot is logged, confirmed and labelled", async ({ browser }) => {
  test.setTimeout(120_000);
  const stamp = Date.now();
  const service = serviceClient();
  const schoolId = await privateSchool(service, { noOpenNight: true });

  async function makeUser(tag: string, rating: number) {
    const email = `e2e-race-${tag}-${stamp}@example.com`;
    const { data, error } = await service.auth.admin.createUser({
      email,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { display_name: `E2E Race ${tag} ${stamp}`, school_id: schoolId },
    });
    if (error) throw error;
    trackUser(data.user!.id);
    await service.from("profiles").update({ status: "approved", rating }).eq("id", data.user!.id);
    return { id: data.user!.id, email, name: `E2E Race ${tag} ${stamp}` };
  }
  const strong = await makeUser("Strong", 650);
  const weak = await makeUser("Weak", 450);

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

  const ctxA = await browser.newContext();
  const pageA = await ctxA.newPage();
  await logIn(pageA, strong.email);
  await pageA.goto("/matches/new");
  await pageA.getByRole("button", { name: "Search players" }).click();
  await pageA.getByLabel("Search members").fill("E2E Race Weak");
  await pageA.getByRole("button", { name: new RegExp(weak.name) }).click();
  await pageA.getByLabel("Race to 3").check({ force: true });
  // A 200-point gap in a race to 3 suggests 2 on the wire to Weak; make it 1.
  await expect(pageA.getByText(/2 on the wire to E2E/)).toBeVisible();
  await pageA.getByRole("button", { name: "Fewer games on the wire" }).click();
  await expect(pageA.getByText("Race to 3 · 1 on the wire to E2E")).toBeVisible();

  const inc = pageA.getByRole("button", { name: /^Increase You score/ });
  await inc.click();
  await inc.click();
  await expect(pageA.getByText("You need 1 · E2E needs 2")).toBeVisible();
  await inc.click();
  await expect(pageA.getByText("You win 3–1")).toBeVisible();
  await expect(inc).toBeDisabled();
  await pageA.getByRole("button", { name: /Send to E2E to confirm/ }).click();
  await expect(pageA.getByText(/waiting on your opponent/i)).toBeVisible({ timeout: 20_000 });

  const ctxB = await browser.newContext();
  const pageB = await ctxB.newPage();
  await logIn(pageB, weak.email);
  await expect(pageB.getByText("Race to 3 · 1 on the wire to you")).toBeVisible();
  await pageB.getByRole("button", { name: "Confirm" }).click();
  await expect(pageB.getByText(/ratings updated/i)).toBeVisible({ timeout: 20_000 });
  // The game counts: the loser's screen, told straight (the coral change, the
  // XP still earned, a first game putting them on the board, no consolation).
  // Rematch is checked by its href, never clicked: a Rematch board publishes
  // a live game to every member's Home.
  const screen = pageB.getByRole("dialog", { name: "Latest result" });
  await expect(screen.getByText("Loss", { exact: true })).toBeVisible();
  await expect(screen.getByRole("heading", { name: "E2E beat you 3–1" })).toBeVisible();
  await expect(screen.getByText("8-ball · race to 3 · 1 spot")).toBeVisible();
  await expect(screen.getByText(/^−\d+$/)).toBeVisible();
  await expect(screen.getByText("+80 XP")).toBeVisible();
  await expect(screen.getByText(/^On the board at #\d+$/)).toBeVisible();
  await expect(screen.getByText("8-ball record now 0–1")).toBeVisible();
  await expect(screen.getByRole("link", { name: "Rematch" })).toHaveAttribute(
    "href",
    `/matches/new?opponent=${strong.id}&game=8ball&race=3&rematch=1`
  );
  await screen.getByRole("button", { name: "Done" }).click();
  await expect(screen).toHaveCount(0);
  // Dismissed on this device: a reload keeps it gone. The screen opens a
  // frame after hydration, so give it time to (wrongly) appear.
  await pageB.reload();
  await expect(pageB.getByRole("heading", { name: /^recent$/i })).toBeVisible();
  await pageB.waitForTimeout(1500);
  await expect(pageB.getByRole("dialog", { name: "Latest result" })).toHaveCount(0);
  await expect(pageB.getByRole("heading", { name: /^recent$/i })).toBeVisible();
  await pageB.goto(`/players/${weak.id}`);
  // Inside the visible main landmark: a production build can leave a hidden
  // copy of the page body.
  await expect(pageB.getByRole("main").getByText(/race to 3 · 1 spot/)).toBeVisible();

  const { data: m } = await service
    .from("matches")
    .select("race_to, spot, spot_to, reporter_score, opponent_score, winner_id")
    .eq("reporter_id", strong.id)
    .single();
  expect(m).toMatchObject({
    race_to: 3,
    spot: 1,
    spot_to: weak.id,
    reporter_score: 3,
    opponent_score: 1,
    winner_id: strong.id,
  });
});
