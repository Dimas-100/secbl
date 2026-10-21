import { expect, test, type Page } from "@playwright/test";
import { cleanupTracked, serviceClient, trackUser } from "./cleanup";

test.afterEach(cleanupTracked);

const PASSWORD = "e2e-password-123!";

// Spec 2026-10-21-play-and-progress §2: what needs you sits at the top of
// Home, above a new member's Step 1 card. The test users live in a school
// with no approved real members, so the club never sees them. B's face is
// checked by its link, never clicked (the scoreboard with an opponent picked
// publishes a live table to every member's Home), and no club night or live
// game is started.
test("Home puts what needs you first, above the Step 1 card", async ({ page }) => {
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

  async function makeUser(tag: string) {
    const email = `e2e-home-${tag}-${stamp}@example.com`;
    const name = `E2E Home ${tag} ${stamp}`;
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

  async function logIn(p: Page, email: string) {
    await p.goto("/login");
    await p.fill('input[name="email"]', email);
    await p.fill('input[name="password"]', PASSWORD);
    await Promise.all([
      p.waitForURL((u) => !u.pathname.startsWith("/login")),
      p.click('button[type="submit"]'),
    ]);
    await expect(p.getByRole("heading", { name: /^recent$/i })).toBeVisible();
  }

  // NavHistory adds a page to the per-tab trail (sessionStorage "secbl:nav")
  // from an effect, so the entry being there means the page has hydrated.
  async function onTrail(p: Page, entry: string) {
    await p.waitForFunction(
      (want) => {
        try {
          const trail: unknown = JSON.parse(sessionStorage.getItem("secbl:nav") ?? "[]");
          return Array.isArray(trail) && trail.includes(want);
        } catch {
          return false;
        }
      },
      entry,
      { timeout: 30_000 }
    );
  }

  await logIn(page, a.email);
  await onTrail(page, "/");
  // Production builds can leave a hidden copy of the page body (ledger R12),
  // so text is looked up inside the visible main landmark.
  const main = page.getByRole("main");

  // A fresh member: one thing to do, no rank yet.
  const step1 = main.getByRole("region", { name: "Play your first game" });
  await expect(step1).toBeVisible();
  await expect(step1.getByText("0 of 10")).toBeVisible();
  await expect(page.getByText("Overall rank")).toHaveCount(0);
  // B is A's only schoolmate, so B's face is first; it opens the scoreboard
  // with B in.
  await expect(step1.getByRole("link", { name: b.name, exact: true })).toHaveAttribute(
    "href",
    new RegExp(`opponent=${b.id}`)
  );

  // B logs a game against A (the row reportMatch writes), dated today in
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
    winner_id: b.id,
    reporter_score: 5,
    opponent_score: 3,
    game_type: "8ball",
    played_at: clubToday,
    race_to: 5,
    spot: 0,
    spot_to: null,
    status: "pending",
  });
  expect(seedError).toBeNull();

  await page.reload();
  const confirmTitle = main.getByText("logged a game");
  await expect(confirmTitle).toBeVisible();
  await expect(main.getByText("E2E won 5–3 · 8-ball · Race to 5")).toBeVisible();
  await expect(main.getByRole("heading", { name: "Confirm results" })).toBeVisible();
  const titleBox = await confirmTitle.boundingBox();
  const stepBox = await step1.getByText("Step 1", { exact: true }).boundingBox();
  expect(titleBox && stepBox).toBeTruthy();
  expect(titleBox!.y).toBeLessThan(stepBox!.y);

  // Not right rejects the report (it goes to the admins, never the feed).
  await main.getByRole("button", { name: "Not right", exact: true }).click();
  await expect(main.getByText(/Sent to the admins/)).toBeVisible({ timeout: 20_000 });
  await expect(main.getByText("logged a game")).toHaveCount(0);
  const { data: rejected } = await service.from("matches").select("status").eq("reporter_id", b.id).single();
  expect(rejected?.status).toBe("disputed");

  // A game left halfway (a scoreboard draft against B at 2–1) is offered
  // back at the top too. Checked by its link, not clicked.
  await page.evaluate(
    ({ key, opponentId }) =>
      localStorage.setItem(key, JSON.stringify({ at: Date.now(), opponentId, you: 2, them: 1 })),
    { key: `secbl:draft-game:${a.id}`, opponentId: b.id }
  );
  await page.goto("/");
  const resume = main.getByRole("link", { name: /Back to your game/ });
  await expect(resume).toContainText("2–1 vs E2E", { timeout: 15_000 });
  await expect(resume).toHaveAttribute("href", "/matches/new");
  const resumeBox = await resume.boundingBox();
  const stepBoxAgain = await step1.getByText("Step 1", { exact: true }).boundingBox();
  expect(resumeBox && stepBoxAgain).toBeTruthy();
  expect(resumeBox!.y).toBeLessThan(stepBoxAgain!.y);
});
