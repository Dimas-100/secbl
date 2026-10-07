// Server only: imports web-push and reads the private VAPID key. Never
// import from a client component.
import type { SupabaseClient } from "@supabase/supabase-js";
import webpush from "web-push";
import { fetchAllPages } from "@/lib/paging";
import { recipientsFor, type Prefs, type PushCategory, type PushPayload } from "@/lib/push";

// The sending half of push. Service-role only: it reads other members'
// subscriptions. Never throws to its caller — a notification that fails to
// send must not fail the match report or message that caused it.

let configured: boolean | null = null;

function ready(): boolean {
  if (configured !== null) return configured;
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!pub || !priv || !subject) {
    console.warn("push disabled: NEXT_PUBLIC_VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT not set");
    configured = false;
    return false;
  }
  webpush.setVapidDetails(subject, pub, priv);
  configured = true;
  return true;
}

interface SubRow {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

export async function sendPush(service: SupabaseClient, profileIds: string[], payload: PushPayload): Promise<void> {
  if (profileIds.length === 0 || !ready()) return;
  const { data, error } = await service
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .in("profile_id", profileIds);
  if (error || !data) {
    if (error) console.warn("push: could not load subscriptions", error.message);
    return;
  }
  const body = JSON.stringify(payload);
  const dead: string[] = [];
  await Promise.allSettled(
    (data as SubRow[]).map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          body,
          { TTL: 3600, urgency: "normal" }
        );
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        // The browser dropped this subscription: forget it.
        if (status === 404 || status === 410) dead.push(s.id);
        else console.warn("push: send failed", status ?? err);
      }
    })
  );
  if (dead.length > 0) await service.from("push_subscriptions").delete().in("id", dead);
}

// Prefs plus approval for each candidate. Suspension flips profiles.status
// but leaves room memberships in place, so approval is checked here, at the
// one choke point every trigger goes through.
export async function loadPrefs(
  service: SupabaseClient,
  ids: string[]
): Promise<{ profile_id: string; prefs: Prefs | null; approved: boolean }[]> {
  if (ids.length === 0) return [];
  const [{ data: prefRows }, { data: approvedRows }] = await Promise.all([
    service.from("notification_prefs").select("profile_id, messages, matches, events, league, social").in("profile_id", ids),
    service.from("profiles").select("id").in("id", ids).eq("status", "approved"),
  ]);
  const byId = new Map((prefRows ?? []).map((p) => [p.profile_id as string, p as Prefs & { profile_id: string }]));
  const approved = new Set((approvedRows ?? []).map((p) => p.id as string));
  return ids.map((id) => {
    const p = byId.get(id);
    return {
      profile_id: id,
      prefs: p ? { messages: p.messages, matches: p.matches, events: p.events, league: p.league, social: p.social } : null,
      approved: approved.has(id),
    };
  });
}

// prefs → recipients → send, swallowing every failure.
export async function notify(
  service: SupabaseClient,
  input: { candidates: string[]; category: PushCategory; excludeId: string | null; payload: PushPayload }
): Promise<void> {
  try {
    const prefs = await loadPrefs(service, input.candidates);
    const ids = recipientsFor(prefs, input.category, input.excludeId);
    await sendPush(service, ids, input.payload);
  } catch (err) {
    console.warn("push: notify failed", err);
  }
}

// Every approved member, for league-wide news (a season opening or closing).
// Paged: PostgREST caps a response at the project's max rows.
export async function notifyAllMembers(
  service: SupabaseClient,
  input: { category: PushCategory; excludeId: string | null; payload: PushPayload }
): Promise<void> {
  try {
    const ids = await fetchAllPages<{ id: string }>((from, to) =>
      service
        .from("profiles")
        .select("id")
        .eq("status", "approved")
        .order("id")
        .range(from, to)
        .then(({ data }) => (data ?? []) as { id: string }[])
    );
    await notify(service, { candidates: ids.map((p) => p.id), ...input });
  } catch (err) {
    console.warn("push: notifyAllMembers failed", err);
  }
}

// A browser's push subscription belongs to the origin, not to an account, so
// on a shared device the next person to log in inherits it. Possession of the
// endpoint is the proof of ownership: whoever presents it now owns it, and
// any other member's row for that endpoint is dropped so their messages stop
// landing on this screen.
export async function reownSubscription(
  service: SupabaseClient,
  profileId: string,
  sub: { endpoint: string; p256dh: string; auth: string; user_agent: string | null }
): Promise<{ error: string | null }> {
  const { error: dropErr } = await service
    .from("push_subscriptions")
    .delete()
    .eq("endpoint", sub.endpoint)
    .neq("profile_id", profileId);
  if (dropErr) return { error: dropErr.message };
  const { error } = await service.from("push_subscriptions").upsert(
    {
      profile_id: profileId,
      endpoint: sub.endpoint,
      p256dh: sub.p256dh,
      auth: sub.auth,
      user_agent: sub.user_agent,
      last_seen_at: new Date().toISOString(),
    },
    { onConflict: "endpoint" }
  );
  return { error: error?.message ?? null };
}
