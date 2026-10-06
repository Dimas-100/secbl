"use server";

import { redirect } from "next/navigation";
import { dmKey, type ChatMessage } from "@/lib/chat";
import { messagePayload } from "@/lib/push";
import { notify } from "@/lib/push-send";
import { createClient, createServiceClient } from "@/lib/supabase/server";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Opens the conversation with another member: the existing DM if there is
// one, otherwise a draft at /chat/new that creates nothing until the first
// message is sent (so glancing at someone never leaves an empty room in
// either inbox). Errors travel as fixed codes the page maps to copy — never
// as free text in the URL, which anyone could craft into a fake notice.
export async function startDm(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const otherId = String(formData.get("profile_id") ?? "");
  if (!UUID_RE.test(otherId) || otherId === user.id) redirect("/chat?error=pick");
  // RLS only returns rooms you are a member of, so a hit is the pair's DM.
  const { data: existing } = await supabase
    .from("channels")
    .select("id")
    .eq("type", "dm")
    .eq("dm_key", dmKey(user.id, otherId))
    .maybeSingle();
  if (existing) redirect(`/chat/${existing.id}`);
  redirect(`/chat/new?to=${otherId}`);
}

// The first message of a new DM: creates the room (the database function
// owns every rule — approved caller, approved target, not yourself, one room
// per pair), posts the message through the caller's own client so RLS
// applies, and pushes it. Returns the room so the draft can become real.
export async function sendFirstDm(input: {
  otherId: string;
  body: string;
  clientId: string;
}): Promise<{ channelId: string; message: ChatMessage } | { error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Please log in again." };
  const body = String(input.body ?? "").trim();
  if (!UUID_RE.test(input.otherId) || input.otherId === user.id) return { error: "Pick someone else to message." };
  if (body.length === 0 || body.length > 2000) return { error: "Write a message first." };

  const { data: channelId, error: dmError } = await supabase.rpc("get_or_create_dm", { p_other_id: input.otherId });
  if (dmError || !channelId) {
    return { error: /not available/i.test(dmError?.message ?? "") ? "That member can't be messaged right now." : "Couldn't start that conversation. Try again." };
  }
  const { data: message, error } = await supabase
    .from("messages")
    .insert({ channel_id: channelId, sender_id: user.id, body, client_id: input.clientId })
    .select("id, channel_id, sender_id, body, client_id, created_at")
    .single();
  if (error || !message) {
    return { error: /too quickly/i.test(error?.message ?? "") ? "Slow down — you're sending messages too quickly." : "Couldn't send — try again." };
  }
  await notifyMessage(message.id);
  return { channelId: channelId as string, message: message as ChatMessage };
}

// Pushes one message to the other members of its room. Called by the room
// right after its insert succeeds. The message must be the caller's own and
// not yet notified; the stamp is written first with a null guard, so two
// calls (or two tabs) can only ever produce one send.
export async function notifyMessage(messageId: number): Promise<void> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user || !Number.isInteger(messageId)) return;
    const service = createServiceClient();
    const { data: claimed } = await service
      .from("messages")
      .update({ notified_at: new Date().toISOString() })
      .eq("id", messageId)
      .eq("sender_id", user.id)
      .is("notified_at", null)
      .select("id, channel_id, body");
    const message = claimed?.[0];
    if (!message) return;
    const [{ data: channel }, { data: sender }, { data: members }] = await Promise.all([
      service.from("channels").select("type, name").eq("id", message.channel_id).single(),
      service.from("profiles").select("display_name").eq("id", user.id).single(),
      service.from("channel_members").select("profile_id").eq("channel_id", message.channel_id),
    ]);
    if (!channel || !sender) return;
    await notify(service, {
      candidates: (members ?? []).map((m) => m.profile_id as string),
      category: "messages",
      excludeId: user.id,
      payload: messagePayload({
        channelId: message.channel_id,
        channelType: channel.type,
        roomName: channel.name,
        senderName: sender.display_name,
        body: message.body,
      }),
    });
  } catch (err) {
    console.warn("notifyMessage failed", err);
  }
}
