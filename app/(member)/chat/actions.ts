"use server";

import { redirect } from "next/navigation";
import { messagePayload } from "@/lib/push";
import { notify } from "@/lib/push-send";
import { createClient, createServiceClient } from "@/lib/supabase/server";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Opens (or finds) the DM with another member and lands in it. The database
// function owns every rule — approved caller, approved target, not yourself,
// one room per pair — so this only validates the shape of the id.
export async function startDm(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Errors travel as fixed codes the page maps to copy — never as free text
  // in the URL, which anyone could craft into a convincing fake notice.
  const otherId = String(formData.get("profile_id") ?? "");
  if (!UUID_RE.test(otherId)) redirect("/chat?error=pick");
  const { data, error } = await supabase.rpc("get_or_create_dm", { p_other_id: otherId });
  if (error || !data) {
    const code = /not available|pick someone else/i.test(error?.message ?? "")
      ? "unavailable"
      : "failed";
    redirect(`/chat?error=${code}`);
  }
  redirect(`/chat/${data}`);
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
