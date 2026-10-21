import { expect, test, type Page } from "@playwright/test";
import { cleanupTracked, serviceClient, trackUser } from "./cleanup";

test.afterEach(cleanupTracked);

const PASSWORD = "e2e-password-123!";

// Spec 2026-10-21-play-and-progress §1: the tab bar's Play button opens a
// sheet with the game in progress, club night and the people you play. The
// test users live in a school with no approved real members, so B and C are
// A's only schoolmates and the club never sees them. B's face is checked by
// its link, not clicked: the scoreboard with a fresh opponent picked
// publishes a live table to every member's Home.
test("the Play sheet resumes a game, offers faces and opens club night", async ({ page }) => {
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
    const email = `e2e-play-${tag}-${stamp}@example.com`;
    const name = `E2E Play ${tag} ${stamp}`;
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
  const c = await makeUser("C");

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
  // from an effect, so the entry being there means the page has hydrated and
  // its buttons and Back are live. A click before that can be lost (the
  // Play button) or become a full page load.
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

  const sheet = page.getByRole("dialog", { name: "Play" });
  const openPlay = () => page.getByRole("button", { name: "Play", exact: true }).click();

  // No night at the school: the sheet offers to start one. A has no games,
  // so the faces fill from the school — B and C are the only ones there.
  await onTrail(page, "/");
  await openPlay();
  await expect(sheet).toBeVisible();
  // The sheet fetches on open; the first call also compiles the action in dev.
  await expect(sheet.getByRole("link", { name: /^Start club night/ })).toBeVisible({ timeout: 15_000 });
  const face = sheet
    .getByRole("region", { name: "Play someone now" })
    .getByRole("link", { name: b.name, exact: true });
  await expect(face).toBeVisible();
  await expect(face).toHaveAttribute("href", new RegExp(`/matches/new\\?opponent=${b.id}`));

  // A scoreboard draft against B (2–1) is a game to go back to. (No format
  // fields: they read as an even race, so 2–1 is a point played.)
  await page.evaluate(
    ({ key, opponentId }) =>
      localStorage.setItem(key, JSON.stringify({ at: Date.now(), opponentId, you: 2, them: 1 })),
    { key: `secbl:draft-game:${a.id}`, opponentId: b.id }
  );
  await page.goto("/leaderboard");
  await onTrail(page, "/leaderboard");
  await openPlay();
  await expect(sheet.getByRole("link", { name: /Back to your game/ })).toContainText("2–1 vs E2E", {
    timeout: 15_000,
  });

  // Navigating from inside the sheet leaves no sheet open on the next page.
  await sheet.getByRole("link", { name: /^Start club night/ }).click();
  await expect(page).toHaveURL(/\/night$/);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: "Main" })).toBeVisible();

  // Spec §6/§9: another player's page offers "Play {first name}" (checked by
  // its href, not clicked: it would publish a live table) and Back returns to
  // where the member came from. One click each, after hydration: a retried
  // click can look for a link on a page already left and hang.
  await page.goto("/leaderboard?tab=players");
  await onTrail(page, "/leaderboard?tab=players");
  await page.locator(`a[href="/players/${b.id}"]`).first().click();
  await page.waitForURL(/\/players\//, { timeout: 30_000 });
  await expect(page.getByRole("link", { name: "Play E2E", exact: true })).toHaveAttribute(
    "href",
    new RegExp(`opponent=${b.id}`),
    { timeout: 15_000 }
  );
  await onTrail(page, `/players/${b.id}`);
  await page.getByRole("link", { name: "Back", exact: true }).click();
  await expect(page).toHaveURL(/tab=players/, { timeout: 15_000 });

  // A fresh tab has no in-app history: Back falls back to the leaderboard and
  // never leaves the app.
  const fresh = await page.context().newPage();
  await fresh.goto(`/players/${b.id}`);
  await onTrail(fresh, `/players/${b.id}`);
  await fresh.getByRole("link", { name: "Back", exact: true }).click();
  await expect(fresh).toHaveURL((u) => u.pathname === "/leaderboard", { timeout: 15_000 });
  await expect(fresh.getByRole("navigation", { name: "Main" })).toBeVisible();
  await fresh.close();

  // Spec §8: Events keeps three tabs and no club night row; an empty calendar
  // points to Play.
  await page.goto("/events");
  // The filter is a nav of links (UnderlineTabs), not an ARIA tablist.
  const tabs = page.getByRole("navigation", { name: "Event filter" }).getByRole("link");
  await expect(tabs).toHaveText(["Upcoming", "Past", "Cups"]);
  // By href, not by name: a real event titled "Club Night" is a link too.
  await expect(page.locator('a[href="/night"]')).toHaveCount(0);
  // The page lists every event (cancelled too) until it ends, so the empty
  // copy only shows when no event, of any status, is still ahead.
  const { data: all } = await service.from("events").select("starts_at, ends_at");
  const anyUpcoming = (all ?? []).some((e) => new Date(e.ends_at ?? e.starts_at).getTime() >= Date.now());
  if (!anyUpcoming) {
    await expect(page.getByText("Start a club night from Play")).toBeVisible();
  }

  // Spec §4 and Decisions: a scored game is never dropped without asking.
  // The draft is 4 h old: past Live now's 3 h staleness (LIVE_STALE_MS), so
  // the restored board publishes no live table, and inside the scoreboard's
  // 12 h window, so it is restored. Nothing here touches the board (Start new
  // or a score tap would bump the draft and publish it).
  await page.evaluate(
    ({ key, draft }) => localStorage.setItem(key, JSON.stringify(draft)),
    {
      key: `secbl:draft-game:${a.id}`,
      draft: {
        at: Date.now() - 4 * 3_600_000,
        opponentId: b.id,
        game: "8ball",
        raceTo: 5,
        spot: 0,
        spotTo: null,
        you: 3,
        them: 2,
      },
    }
  );
  const guard = page.getByText("You have a game in progress vs E2E (3–2)");
  const keep = page.getByRole("button", { name: "Keep that game" });
  const board = {
    opponent: page.locator('input[name="opponent_id"]'),
    you: page.locator('input[name="my_score"]'),
    them: page.locator('input[name="their_score"]'),
  };

  // Called to C (?opponent=, as a face or Play {name} links): the board asks.
  await page.goto(`/matches/new?opponent=${c.id}`);
  await expect(guard).toBeVisible({ timeout: 30_000 });
  await keep.click();
  await expect(page).toHaveURL((u) => u.pathname === "/matches/new" && u.search === "");
  await expect(guard).toHaveCount(0);
  await expect(board.opponent).toHaveValue(b.id);

  // Picking C from the picker (the sheet's Other) asks the same way.
  await page.getByRole("button", { name: b.name, exact: true }).click();
  const picker = page.getByRole("dialog", { name: "Pick opponent" });
  await picker.getByLabel("Search members").fill(c.name);
  await picker.getByRole("button", { name: new RegExp(c.name) }).click();
  await expect(picker).toHaveCount(0);
  await expect(guard).toBeVisible();
  await keep.click();
  await expect(guard).toHaveCount(0);
  await expect(board.opponent).toHaveValue(b.id);
  await expect(board.you).toHaveValue("3");
  await expect(board.them).toHaveValue("2");
});
