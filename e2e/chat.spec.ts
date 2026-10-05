import { expect, test, type Page } from "@playwright/test";
import { cleanupTracked, serviceClient, trackUser } from "./cleanup";

test.afterEach(cleanupTracked);

const PASSWORD = "e2e-password-123!";

// Two members in two browser sessions: a DM started from a player page, an
// unread badge for the other side, and a reply that arrives live — without a
// reload — in the first session. This is the Realtime path end to end.
test("members DM each other and replies arrive live", async ({ browser }) => {
  test.setTimeout(120_000);
  const stamp = Date.now();
  const service = serviceClient();
  const { data: school } = await service.from("schools").select("id").limit(1).single();

  async function makeUser(tag: string) {
    const email = `e2e-chat-${tag}-${stamp}@example.com`;
    const { data, error } = await service.auth.admin.createUser({
      email,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { display_name: `E2E Chat ${tag} ${stamp}`, school_id: school!.id },
    });
    if (error) throw error;
    trackUser(data.user!.id);
    await service.from("profiles").update({ status: "approved" }).eq("id", data.user!.id);
    return { id: data.user!.id, email, name: `E2E Chat ${tag} ${stamp}` };
  }
  const a = await makeUser("A");
  const b = await makeUser("B");

  async function logIn(page: Page, email: string) {
    await page.goto("/login");
    await page.fill('input[name="email"]', email);
    await page.fill('input[name="password"]', PASSWORD);
    await Promise.all([
      page.waitForURL((url) => !url.pathname.startsWith("/login")),
      page.click('button[type="submit"]'),
    ]);
    await expect(page.getByRole("heading", { name: /recent matches/i })).toBeVisible();
  }

  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();

  // A starts the DM from B's player page.
  await logIn(pageA, a.email);
  await pageA.goto(`/players/${b.id}`);
  await pageA.getByRole("button", { name: "Message" }).click();
  await pageA.waitForURL(/\/chat\/[0-9a-f-]{36}$/);
  await expect(pageA.getByRole("heading", { name: b.name })).toBeVisible();
  const roomUrl = pageA.url();

  const opener = `rematch tonight? ${stamp}`;
  await pageA.getByLabel("Message", { exact: true }).fill(opener);
  await pageA.getByLabel("Message", { exact: true }).press("Enter");
  await expect(pageA.getByText(opener)).toBeVisible();
  // The optimistic bubble resolves to a real row (timestamp replaces "Sending…").
  await expect(pageA.getByText("Sending…")).toHaveCount(0, { timeout: 15_000 });

  // B sees the unread badge, finds the DM in the inbox, opens it, replies.
  await logIn(pageB, b.email);
  await expect(pageB.getByRole("link", { name: /chat, 1 unread/i })).toBeVisible();
  await pageB.getByRole("link", { name: /chat, 1 unread/i }).click();
  await expect(pageB.getByRole("heading", { name: "Chat" })).toBeVisible();
  await expect(pageB.getByRole("link", { name: /^Everyone/ })).toBeVisible();
  const dmRow = pageB.getByRole("link", { name: new RegExp(a.name) });
  await expect(dmRow).toContainText(opener);
  await dmRow.click();
  await expect(pageB).toHaveURL(roomUrl);
  await expect(pageB.getByText(opener)).toBeVisible();

  const reply = `you're on ${stamp}`;
  await pageB.getByLabel("Message", { exact: true }).fill(reply);
  await pageB.getByRole("button", { name: "Send" }).click();
  await expect(pageB.getByText(reply)).toBeVisible();

  // A never reloaded: the reply shows up through the Realtime subscription.
  await expect(pageA.getByText(reply)).toBeVisible({ timeout: 20_000 });

  // Opening the room marked it read for B.
  await pageB.goto("/chat");
  await expect(pageB.getByRole("link", { name: /chat, \d+ unread/i })).toHaveCount(0);

  // And A, who has been in the room the whole time, has nothing unread either.
  await pageA.goto("/chat");
  await expect(pageA.getByRole("link", { name: /chat, \d+ unread/i })).toHaveCount(0);

  await contextA.close();
  await contextB.close();
});
