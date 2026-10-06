import { expect, test } from "@playwright/test";
import { cleanupTracked, serviceClient, trackUser } from "./cleanup";

test.afterEach(cleanupTracked);

const PASSWORD = "e2e-password-123!";

// A valid 1×1 PNG, enough to exercise the crop → upload → Storage → profile path.
const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64"
);

test("member personalises their profile: ball, tagline, favourite game and photo", async ({ page }) => {
  const stamp = Date.now();
  const email = `e2e-profile-${stamp}@example.com`;
  const service = serviceClient();
  const { data: school } = await service.from("schools").select("id").limit(1).single();
  const { data: created, error } = await service.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { display_name: `E2E Profile ${stamp}`, school_id: school!.id },
  });
  if (error) throw error;
  const userId = created.user!.id;
  trackUser(userId);
  await service.from("profiles").update({ status: "approved" }).eq("id", userId);

  page.on("console", (msg) => {
    if (msg.type() === "error") console.log(`[browser] ${msg.text()}`);
  });
  page.on("pageerror", (err) => console.log(`[pageerror] ${err.message}`));

  await page.goto("/login");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', PASSWORD);
  await Promise.all([
    page.waitForURL((url) => !url.pathname.startsWith("/login")),
    page.click('button[type="submit"]'),
  ]);
  await expect(page.getByRole("heading", { name: /^recent$/i })).toBeVisible();

  await page.goto("/settings");
  await expect(page.getByRole("heading", { name: /your look/i })).toBeVisible();

  // Ball, tagline, favourite game.
  await page.getByTitle("9 yellow stripe").click();
  await page.fill('input[name="tagline"]', "Breaks and runs. Mostly runs.");
  await page.getByText("9-ball", { exact: true }).click();
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page.getByText(/profile updated/i)).toBeVisible();

  // Photo: crop + upload in the browser, then the URL lands on the profile.
  await page.getByLabel("Choose a profile photo").setInputFiles({
    name: "me.png",
    mimeType: "image/png",
    buffer: TINY_PNG,
  });
  await expect(page.getByRole("button", { name: "Remove photo" })).toBeVisible({ timeout: 20_000 });

  const { data: profile } = await service
    .from("profiles")
    .select("ball, tagline, favorite_game, avatar_url")
    .eq("id", userId)
    .single();
  expect(profile!.ball).toBe(9);
  expect(profile!.tagline).toBe("Breaks and runs. Mostly runs.");
  expect(profile!.favorite_game).toBe("9ball");
  expect(profile!.avatar_url).toContain(`/avatars/${userId}/`);

  // The player page reflects all of it.
  await page.goto(`/players/${userId}`);
  await expect(page.getByText("Breaks and runs. Mostly runs.")).toBeVisible();
  await expect(page.getByText("Plays 9-ball")).toBeVisible();
  await expect(page.getByRole("heading", { name: /achievements/i })).toBeVisible();

  // Removing the photo clears the URL again.
  await page.goto("/settings");
  await page.getByRole("button", { name: "Remove photo" }).click();
  await expect(page.getByRole("button", { name: "Add a photo" })).toBeVisible({ timeout: 20_000 });
  const { data: after } = await service.from("profiles").select("avatar_url").eq("id", userId).single();
  expect(after!.avatar_url).toBeNull();

  // Teardown: the Storage object is in the user's folder; remove whatever is left.
  const { data: files } = await service.storage.from("avatars").list(userId);
  if (files && files.length > 0) {
    await service.storage.from("avatars").remove(files.map((f) => `${userId}/${f.name}`));
  }
});
