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
    await expect(page.getByRole("heading", { name: /^recent$/i })).toBeVisible();
  }

  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();

  // A opens B from B's player page: a draft, not a room. Backing out without
  // sending leaves nothing behind — in the inbox or in the database.
  await logIn(pageA, a.email);
  await pageA.goto(`/players/${b.id}`);
  await pageA.getByRole("button", { name: "Message" }).click();
  await pageA.waitForURL(new RegExp(`/chat/new\\?to=${b.id}$`));
  await expect(pageA.getByRole("heading", { name: b.name })).toBeVisible();
  await pageA.getByRole("link", { name: "Back to chat" }).click();
  await expect(pageA.getByRole("heading", { name: "Messages" })).toBeVisible();
  await expect(pageA.getByRole("link", { name: new RegExp(b.name) })).toHaveCount(0);
  const { count: emptyRooms } = await service
    .from("channels")
    .select("id", { count: "exact", head: true })
    .eq("type", "dm")
    .like("dm_key", `%${b.id}%`);
  expect(emptyRooms).toBe(0);

  // The first send creates the room and the screen becomes it.
  await pageA.goto(`/players/${b.id}`);
  await pageA.getByRole("button", { name: "Message" }).click();
  await pageA.waitForURL(/\/chat\/new\?to=/);
  const opener = `rematch tonight? ${stamp}`;
  await pageA.getByLabel("Message", { exact: true }).fill(opener);
  await pageA.getByLabel("Message", { exact: true }).press("Enter");
  await expect(pageA.getByText(opener)).toBeVisible();
  await pageA.waitForURL(/\/chat\/[0-9a-f-]{36}$/);
  const roomUrl = pageA.url();
  // The optimistic bubble resolves to a real row (timestamp replaces "Sending…").
  await expect(pageA.getByText("Sending…")).toHaveCount(0, { timeout: 15_000 });
  // Opening B again lands in the existing room, not another draft.
  await pageA.goto(`/players/${b.id}`);
  await pageA.getByRole("button", { name: "Message" }).click();
  await expect(pageA).toHaveURL(roomUrl);

  // B sees the unread badge, finds the DM in the inbox, opens it, replies.
  await logIn(pageB, b.email);
  await expect(pageB.getByRole("link", { name: /messages, 1 unread/i })).toBeVisible();
  await pageB.getByRole("link", { name: /messages, 1 unread/i }).click();
  await expect(pageB.getByRole("heading", { name: "Messages" })).toBeVisible();
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
  await expect(pageB.getByRole("link", { name: /messages, \d+ unread/i })).toHaveCount(0);

  // And A, who has been in the room the whole time, has nothing unread either.
  await pageA.goto("/chat");
  await expect(pageA.getByRole("link", { name: /messages, \d+ unread/i })).toHaveCount(0);

  await contextA.close();
  await contextB.close();
});
