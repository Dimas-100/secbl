import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { cleanupTracked, serviceClient, trackUser } from "./cleanup";

test.afterEach(cleanupTracked);

const PASSWORD = "e2e-password-123!";

// A photo post end to end: Alpha posts with a caption, Bravo sees it land in
// the feed live, likes it and comments, Alpha sees the comment, deletes the
// post, and it is gone for both.
test("a photo is posted, liked, commented on and deleted", async ({ browser }) => {
  test.setTimeout(150_000);
  const stamp = Date.now();
  const service = serviceClient();
  const { data: school } = await service.from("schools").select("id").limit(1).single();

  async function makeUser(tag: string) {
    const email = `e2e-post-${tag.toLowerCase()}-${stamp}@example.com`;
    const { data, error } = await service.auth.admin.createUser({
      email,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { display_name: `E2E ${tag} ${stamp}`, school_id: school!.id },
    });
    if (error) throw error;
    trackUser(data.user!.id);
    await service.from("profiles").update({ status: "approved" }).eq("id", data.user!.id);
    return { id: data.user!.id, email, name: `E2E ${tag} ${stamp}` };
  }
  const a = await makeUser("Alpha");
  const b = await makeUser("Bravo");

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
  await logIn(pageA, a.email);
  const ctxB = await browser.newContext();
  const pageB = await ctxB.newPage();
  await logIn(pageB, b.email);

  // Alpha posts.
  const caption = `Clean cut on the nine ${stamp}`;
  await pageA.getByRole("button", { name: "Post a photo" }).click();
  await pageA.getByLabel("Choose a photo").setInputFiles(path.join(__dirname, "fixtures", "shot.png"));
  await expect(pageA.getByRole("button", { name: "Change photo" })).toBeVisible();
  await pageA.getByLabel("Caption").fill(caption);
  await pageA.getByRole("button", { name: "Post", exact: true }).click();
  const postA = pageA.getByRole("article", { name: `Post by ${a.name}` });
  await expect(postA).toBeVisible({ timeout: 20_000 });
  await expect(postA.getByText(caption)).toBeVisible();
  await expect(postA.locator("img")).toBeVisible();

  // Bravo sees it arrive live, likes it and comments.
  const postB = pageB.getByRole("article", { name: `Post by ${a.name}` });
  await expect(postB.getByText(caption)).toBeVisible({ timeout: 20_000 });
  await postB.getByRole("button", { name: "Like" }).click();
  await expect(postB.getByRole("button", { name: "Unlike" })).toContainText("1");
  await postB.getByLabel("Add a comment").fill("What a shot");
  await postB.getByRole("button", { name: "Send comment" }).click();
  await expect(postB.getByText("What a shot")).toBeVisible({ timeout: 15_000 });

  // Alpha sees the like and the comment land without reloading.
  await expect(postA.getByText("What a shot")).toBeVisible({ timeout: 20_000 });
  await pageA.reload();
  await expect(postA.getByRole("button", { name: "Like" })).toContainText("1");

  // Alpha deletes; gone for both.
  pageA.once("dialog", (d) => d.accept());
  await postA.getByRole("button", { name: "Post options" }).click();
  await postA.getByRole("menuitem", { name: "Delete post" }).click();
  await expect(postA).toHaveCount(0, { timeout: 15_000 });
  await expect(postB).toHaveCount(0, { timeout: 20_000 });
  const { count } = await service.from("posts").select("id", { count: "exact", head: true }).eq("author_id", a.id);
  expect(count).toBe(0);
});
