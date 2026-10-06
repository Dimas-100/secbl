import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { reownSubscription } from "@/lib/push-send";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// A shared device: the browser's push subscription outlives the login.
// Whoever presents the endpoint now owns it, and the previous owner's row
// goes, so their messages stop appearing on someone else's screen.
describe.skipIf(!url || !serviceKey)("push subscription re-ownership", () => {
  const admin = createClient(url!, serviceKey!);
  const stamp = Date.now();
  const endpoint = `https://fcm.googleapis.com/fcm/send/reown-${stamp}`;
  let a: string;
  let b: string;

  beforeAll(async () => {
    const { data: school } = await admin.from("schools").select("id").limit(1).single();
    async function makeUser(tag: string) {
      const { data, error } = await admin.auth.admin.createUser({
        email: `push-${tag}-${stamp}@example.com`,
        password: "push-test-password-1!",
        email_confirm: true,
        user_metadata: { display_name: `push-${tag}-${stamp}`, school_id: school!.id },
      });
      if (error) throw error;
      await admin.from("profiles").update({ status: "approved" }).eq("id", data.user!.id);
      return data.user!.id;
    }
    a = await makeUser("a");
    b = await makeUser("b");
  });

  afterAll(async () => {
    await admin.from("push_subscriptions").delete().eq("endpoint", endpoint);
    await admin.auth.admin.deleteUser(a);
    await admin.auth.admin.deleteUser(b);
  });

  it("moves an endpoint from the previous owner to whoever presents it", async () => {
    const sub = { endpoint, p256dh: "k", auth: "s", user_agent: "test" };
    expect((await reownSubscription(admin, a, sub)).error).toBeNull();
    expect((await reownSubscription(admin, b, sub)).error).toBeNull();
    const { data } = await admin.from("push_subscriptions").select("profile_id").eq("endpoint", endpoint);
    expect(data?.map((r) => r.profile_id)).toEqual([b]);
    // Presenting it again as the same owner is a plain refresh.
    expect((await reownSubscription(admin, b, sub)).error).toBeNull();
    const { count } = await admin
      .from("push_subscriptions")
      .select("id", { count: "exact", head: true })
      .eq("endpoint", endpoint);
    expect(count).toBe(1);
  });
});
