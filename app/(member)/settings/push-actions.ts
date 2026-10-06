"use server";

import { createClient, createServiceClient } from "@/lib/supabase/server";
import type { Prefs } from "@/lib/push";
import { sendPush } from "@/lib/push-send";

// The member's own push rows, through their own client so RLS applies.

export interface BrowserSubscription {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

async function me() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

export async function savePushSubscription(
  sub: BrowserSubscription,
  userAgent: string | null
): Promise<{ error: string | null }> {
  const { supabase, user } = await me();
  if (!user) return { error: "Please log in again." };
  if (!sub?.endpoint?.startsWith("https://") || !sub.keys?.p256dh || !sub.keys?.auth) {
    return { error: "That subscription is not valid." };
  }
  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      profile_id: user.id,
      endpoint: sub.endpoint,
      p256dh: sub.keys.p256dh,
      auth: sub.keys.auth,
      user_agent: userAgent?.slice(0, 200) ?? null,
      last_seen_at: new Date().toISOString(),
    },
    { onConflict: "endpoint" }
  );
  return { error: error?.message ?? null };
}

export async function removePushSubscription(endpoint: string): Promise<{ error: string | null }> {
  const { supabase, user } = await me();
  if (!user) return { error: "Please log in again." };
  const { error } = await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
  return { error: error?.message ?? null };
}

export async function loadNotificationPrefs(): Promise<Prefs> {
  const { supabase, user } = await me();
  if (!user) return { messages: true, matches: true, events: true };
  const { data } = await supabase
    .from("notification_prefs")
    .select("messages, matches, events")
    .eq("profile_id", user.id)
    .maybeSingle();
  return data ?? { messages: true, matches: true, events: true };
}

export async function updateNotificationPrefs(prefs: Prefs): Promise<{ error: string | null }> {
  const { supabase, user } = await me();
  if (!user) return { error: "Please log in again." };
  const { error } = await supabase.from("notification_prefs").upsert({
    profile_id: user.id,
    messages: !!prefs.messages,
    matches: !!prefs.matches,
    events: !!prefs.events,
    updated_at: new Date().toISOString(),
  });
  return { error: error?.message ?? null };
}

// To yourself only, so the setup can be checked at the table.
export async function sendTestPush(): Promise<{ error: string | null }> {
  const { user } = await me();
  if (!user) return { error: "Please log in again." };
  await sendPush(createServiceClient(), [user.id], {
    title: "SECBL",
    body: "Notifications are on.",
    url: "/settings",
    tag: "test",
    category: "messages",
  });
  return { error: null };
}
