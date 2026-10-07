"use server";

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { isKnownPushEndpoint, type Prefs } from "@/lib/push";
import { reownSubscription, sendPush } from "@/lib/push-send";

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
  if (!sub?.endpoint || !isKnownPushEndpoint(sub.endpoint) || !sub.keys?.p256dh || !sub.keys?.auth) {
    return { error: "That subscription is not valid." };
  }
  // Service role on purpose: on a shared device the endpoint may still be
  // registered to whoever logged in before, and only the server may take it
  // from them. The caller is authenticated and holds the endpoint.
  const { data: profile } = await supabase.from("profiles").select("status").eq("id", user.id).single();
  if (profile?.status !== "approved") return { error: "Your account isn't approved yet." };
  const result = await reownSubscription(createServiceClient(), user.id, {
    endpoint: sub.endpoint,
    p256dh: sub.keys.p256dh,
    auth: sub.keys.auth,
    user_agent: userAgent?.slice(0, 200) ?? null,
  });
  return { error: result.error ? friendly(result.error) : null };
}

function friendly(message: string): string {
  if (/row-level security|policy/i.test(message)) return "Notifications aren't available for this account.";
  return "Couldn't save that on the server. Try again.";
}

export async function removePushSubscription(endpoint: string): Promise<{ error: string | null }> {
  const { supabase, user } = await me();
  if (!user) return { error: "Please log in again." };
  const { error } = await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
  return { error: error?.message ?? null };
}

export async function loadNotificationPrefs(): Promise<Prefs> {
  const { supabase, user } = await me();
  if (!user) return { messages: true, matches: true, events: true, league: true, social: false };
  const { data } = await supabase
    .from("notification_prefs")
    .select("messages, matches, events, league, social")
    .eq("profile_id", user.id)
    .maybeSingle();
  return data ?? { messages: true, matches: true, events: true, league: true, social: false };
}

export async function updateNotificationPrefs(prefs: Prefs): Promise<{ error: string | null }> {
  const { supabase, user } = await me();
  if (!user) return { error: "Please log in again." };
  const { error } = await supabase.from("notification_prefs").upsert({
    profile_id: user.id,
    messages: !!prefs.messages,
    matches: !!prefs.matches,
    events: !!prefs.events,
    league: !!prefs.league,
    social: !!prefs.social,
    updated_at: new Date().toISOString(),
  });
  return { error: error?.message ?? null };
}

// To yourself only, so the setup can be checked at the table. It points at
// Home, not Settings: the service worker suppresses a notification for the
// page you are already looking at, and you tap this from Settings.
export async function sendTestPush(): Promise<{ error: string | null }> {
  const { user } = await me();
  if (!user) return { error: "Please log in again." };
  await sendPush(createServiceClient(), [user.id], {
    title: "SECBL",
    body: "Notifications are on. Tap to open the app.",
    url: "/",
    tag: "test",
    category: "messages",
  });
  return { error: null };
}
